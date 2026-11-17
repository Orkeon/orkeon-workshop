import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { GATES, PHASES, isPhaseAtLeast, nextPhase, parseStatus, phaseIndex, statusWarnings } from '../../src/domain/status.js';

const valid = {
  phase: 'build',
  gate_passed: 'tests',
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

  it('defaults the keys with an empty state to null, and reads a workbook written before iteration as 0', () => {
    const status = parseStatus({ phase: 'spec', next_action: '/team-spec', updated_at: '2026-09-30T10:02:00Z' });
    expect(status).toEqual({
      phase: 'spec',
      gate_passed: null,
      iteration: 0,
      attempt: null,
      batch: null,
      verdict: null,
      next_action: '/team-spec',
      updated_at: '2026-09-30T10:02:00Z',
    });
  });

  it('keeps the order of the template: phase, gate_passed, iteration, attempt, batch, verdict, next_action, updated_at', () => {
    expect(Object.keys(parseStatus({ updated_at: '2026-09-30T10:02:00Z', next_action: '/team-spec', iteration: 2, phase: 'spec' }))).toEqual(['phase', 'gate_passed', 'iteration', 'attempt', 'batch', 'verdict', 'next_action', 'updated_at']);
  });

  it('takes the number of ITERATE verdicts (D38)', () => {
    expect(parseStatus({ ...valid, iteration: 3 }).iteration).toBe(3);
  });

  it.each([-1, 1.5, '2', null, true])('rejects the iteration %j, naming the key and what it counts', (iteration) => {
    expect(() => parseStatus({ ...valid, iteration })).toThrow('iteration: expected the number of ITERATE verdicts so far: 0 at /team-init, then 1, 2…');
  });

  it.each(['design', 'need', 'gate-3', 'Team', '', true, 1])('rejects the gate %j, naming the four gates', (gate_passed) => {
    expect(() => parseStatus({ ...valid, gate_passed })).toThrow('gate_passed: expected the gate that was passed (team, tests, build, review) or null');
  });

  it.each([
    ['an unknown phase', { ...valid, phase: 'building' }],
    ['a phase of the workbook of five artefacts', { ...valid, phase: 'design' }],
    ['a verdict outside the enum', { ...valid, verdict: 'ok' }],
    ['a malformed attempt id', { ...valid, attempt: 'ATT-1' }],
    ['a missing next_action', { ...valid, next_action: '' }],
    ['a non-ISO date', { ...valid, updated_at: 'yesterday' }],
    ['a missing phase', { next_action: '/team-spec', updated_at: '2026-09-30T10:02:00Z' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseStatus(input)).toThrow(DomainError);
  });

  it('drops the track of the workbook of five artefacts, which no longer exists', () => {
    expect(parseStatus({ ...valid, track: 'light' })).toEqual(valid);
  });

  it('names the offending field in the error', () => {
    expect(() => parseStatus({ ...valid, phase: 'building' })).toThrow(/phase/);
    expect(() => parseStatus({ ...valid, gate_passed: true })).toThrow(/gate_passed/);
  });
});

describe('phase order', () => {
  it('is spec → tests → build → run → review → accepted → published, with the four gates between them', () => {
    expect(PHASES).toEqual(['spec', 'tests', 'build', 'run', 'review', 'accepted', 'published']);
    expect(GATES).toEqual(['team', 'tests', 'build', 'review']);
    expect(phaseIndex('build')).toBe(2);
    expect(isPhaseAtLeast('run', 'tests')).toBe(true);
    expect(isPhaseAtLeast('spec', 'tests')).toBe(false);
    expect(nextPhase('review')).toBe('accepted');
    expect(nextPhase('published')).toBeNull();
  });
});

describe('statusWarnings', () => {
  it('has nothing to say about a consistent status', () => {
    expect(statusWarnings(parseStatus(valid))).toEqual([]);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'tests', gate_passed: 'team', attempt: null, batch: null }))).toEqual([]);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'run', gate_passed: 'build' }))).toEqual([]);
  });

  it('flags a gate ahead of the phase: a gate passed opens the next phase', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'spec', gate_passed: 'team', attempt: null }))).toEqual(['gate_passed (team) is ahead of phase (spec)']);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'build', gate_passed: 'build' }))).toEqual(['gate_passed (build) is ahead of phase (build)']);
  });

  it('flags an accepted or published team without the ACCEPTED verdict', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'accepted', gate_passed: 'review', verdict: 'ITERATE' }))).toEqual(['phase accepted requires verdict ACCEPTED, got ITERATE']);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'published', gate_passed: 'review', verdict: null }))).toEqual(['phase published requires verdict ACCEPTED, got none']);
    expect(statusWarnings(parseStatus({ ...valid, phase: 'published', gate_passed: 'review', verdict: 'ACCEPTED' }))).toEqual([]);
  });

  it('has nothing to say about the state an ITERATE leaves: back to build, gate tests, one more iteration (D38)', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'build', gate_passed: 'tests', verdict: 'ITERATE', attempt: 'ATT-0003', iteration: 1 }))).toEqual([]);
  });

  it('flags a build, run or review phase without an attempt', () => {
    expect(statusWarnings(parseStatus({ ...valid, phase: 'run', gate_passed: 'build', attempt: null }))).toEqual(['phase run has no attempt (an attempt is opened when the build starts)']);
  });
});
