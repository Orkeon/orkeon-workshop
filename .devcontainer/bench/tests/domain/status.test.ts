import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { PHASES, isPhaseAtLeast, nextPhase, parseStatus, phaseIndex, statusWarnings } from '../../src/domain/status.js';

const valid = {
  phase: 'build',
  gate_passed: 'design',
  track: 'full',
  iteration: 0,
  attempt: 'ATT-0002',
  batch: 'B1',
  verdict: null,
  next_action: '/team-build B1',
  updated_at: '2026-09-30T19:12:00Z',
};

describe('Status front matter', () => {
  it('parses a valid block', () => {
    expect(parseStatus(valid)).toEqual(valid);
  });

  it('takes a batch as B<n> or null', () => {
    expect(parseStatus({ ...valid, batch: 'B12' }).batch).toBe('B12');
    expect(parseStatus({ ...valid, batch: null }).batch).toBeNull();
  });

  it.each(['L1', 'L-1', 'L0', 'B0', 'B01', 'B-1', 'b1', 'batch 1', 1])('rejects the batch %j and says what a batch id looks like', (batch) => {
    expect(() => parseStatus({ ...valid, batch })).toThrow(DomainError);
    expect(() => parseStatus({ ...valid, batch })).toThrow(/batch: /);
  });

  it('explains that the L prefix names test levels', () => {
    expect(() => parseStatus({ ...valid, batch: 'L1' })).toThrow('batch: expected a batch id such as B1 (the L prefix names the test levels L0–L4)');
  });

  it('accepts a Date for updated_at (YAML 1.1 timestamps) and renders it as ISO', () => {
    const status = parseStatus({ ...valid, updated_at: new Date('2026-09-30T19:12:00Z') });
    expect(status.updated_at).toBe('2026-09-30T19:12:00.000Z');
  });

  it('defaults the keys with an empty state to null, and reads a workbook written before track and iteration as full and 0', () => {
    const status = parseStatus({ phase: 'need', next_action: '/team-need', updated_at: '2026-09-30T10:02:00Z' });
    expect(status).toEqual({
      phase: 'need',
      gate_passed: null,
      track: 'full',
      iteration: 0,
      attempt: null,
      batch: null,
      verdict: null,
      next_action: '/team-need',
      updated_at: '2026-09-30T10:02:00Z',
    });
  });

  it('keeps the order of the template: phase, gate_passed, track, iteration, attempt, batch, verdict, next_action, updated_at', () => {
    expect(Object.keys(parseStatus({ updated_at: '2026-09-30T10:02:00Z', next_action: '/team-need', iteration: 2, phase: 'need' }))).toEqual([
      'phase',
      'gate_passed',
      'track',
      'iteration',
      'attempt',
      'batch',
      'verdict',
      'next_action',
      'updated_at',
    ]);
  });

  it('takes the light track (D37) and the number of ITERATE verdicts (D38)', () => {
    expect(parseStatus({ ...valid, track: 'light' }).track).toBe('light');
    expect(parseStatus({ ...valid, iteration: 3 }).iteration).toBe(3);
  });

  it.each(['fast', 'Light', '', null, 1])('rejects the track %j, naming the key and its values', (track) => {
    expect(() => parseStatus({ ...valid, track })).toThrow('track: expected the track chosen at /team-init: full or light');
  });

  it.each([-1, 1.5, '2', null, true])('rejects the iteration %j, naming the key and what it counts', (iteration) => {
    expect(() => parseStatus({ ...valid, iteration })).toThrow('iteration: expected the number of ITERATE verdicts so far: 0 at /team-init, then 1, 2…');
  });

  it.each([
    ['an unknown phase', { ...valid, phase: 'building' }],
    ['a gate that is not a phase name', { ...valid, gate_passed: 'gate-3' }],
    ['a boolean gate', { ...valid, gate_passed: true }],
    ['a verdict outside the enum', { ...valid, verdict: 'ok' }],
    ['a malformed attempt id', { ...valid, attempt: 'ATT-1' }],
    ['a missing next_action', { ...valid, next_action: '' }],
    ['a non-ISO date', { ...valid, updated_at: 'yesterday' }],
    ['a missing phase', { next_action: '/team-need', updated_at: '2026-09-30T10:02:00Z' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseStatus(input)).toThrow(DomainError);
  });

  it('names the offending field in the error', () => {
    expect(() => parseStatus({ ...valid, phase: 'building' })).toThrow(/phase/);
    expect(() => parseStatus({ ...valid, gate_passed: true })).toThrow(/gate_passed/);
  });
});

describe('phase order', () => {
  it('is need → test-plan → design → tests → build → run → review → accepted → published', () => {
    expect(PHASES).toEqual(['need', 'test-plan', 'design', 'tests', 'build', 'run', 'review', 'accepted', 'published']);
    expect(phaseIndex('build')).toBe(4);
    expect(isPhaseAtLeast('run', 'design')).toBe(true);
    expect(isPhaseAtLeast('need', 'design')).toBe(false);
    expect(nextPhase('review')).toBe('accepted');
    expect(nextPhase('published')).toBeNull();
  });
});

describe('statusWarnings', () => {
  it('has nothing to say about a consistent status', () => {
    expect(statusWarnings(parseStatus(valid))).toEqual([]);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'design', attempt: null, batch: null }))).toEqual([]);
  });

  it('flags a gate ahead of the phase', () => {
    const status = parseStatus({ ...valid, phase: 'need', gate_passed: 'design', attempt: null });
    expect(statusWarnings(status)).toEqual(['gate_passed (design) is ahead of phase (need)']);
  });

  it('flags an accepted or published team without the ACCEPTED verdict', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'accepted', verdict: 'ITERATE' }))).toEqual(['phase accepted requires verdict ACCEPTED, got ITERATE']);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'published', verdict: null }))).toEqual(['phase published requires verdict ACCEPTED, got none']);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'published', verdict: 'ACCEPTED' }))).toEqual([]);
  });

  it('has nothing to say about the state an ITERATE leaves: back to build, gate tests, one more iteration (D38)', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'build', gate_passed: 'tests', verdict: 'ITERATE', attempt: 'ATT-0003', iteration: 1 }))).toEqual([]);
  });

  it('flags a build, run or review phase without an attempt', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'run', attempt: null }))).toEqual(['phase run has no attempt (an attempt is opened when the build starts)']);
  });
});
