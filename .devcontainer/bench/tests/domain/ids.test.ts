import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { formatAttemptId, formatDecisionId, formatRunId, formatSequentialId, isId, parseId } from '../../src/domain/ids.js';

describe('identifier families', () => {
  it.each([
    ['AC', 'AC-01'],
    ['AC', 'AC-123'],
    ['IND', 'IND-02'],
    ['INV', 'INV-07'],
    ['INV', 'INV-RESUME'],
    ['INV', 'INV-FS'],
    ['J', 'J-01'],
    ['DEC', 'DEC-0004'],
    ['ATT', 'ATT-0002'],
    ['RUN', 'RUN-20260930-1912-local'],
    ['BATCH', 'B1'],
    ['BATCH', 'B2'],
    ['BATCH', 'B12'],
  ] as const)('accepts %s id %s', (kind, value) => {
    expect(isId(kind, value)).toBe(true);
    expect(parseId(kind, value)).toBe(value);
  });

  it.each([
    ['AC', 'AC-1'],
    ['AC', 'ac-01'],
    ['IND', 'IND-'],
    ['INV', 'INV-resume'],
    ['DEC', 'DEC-1'],
    ['ATT', 'ATT-00001'],
    ['RUN', 'RUN-2026-local'],
    ['RUN', 'RUN-20260930-1912-Local'],
    ['BATCH', 'lot-3'],
  ] as const)('rejects %s id %s', (kind, value) => {
    expect(isId(kind, value)).toBe(false);
    expect(() => parseId(kind, value)).toThrow(DomainError);
  });

  // `L` names the test levels L0–L4: it is never a batch, with or without a dash.
  it.each(['L1', 'L-1', 'L3', 'B0', 'B01', 'B-1', 'b1', 'B', 'B1 ', 'B1.5', 'BATCH-1'])('rejects the batch id "%s"', (value) => {
    expect(isId('BATCH', value)).toBe(false);
    expect(() => parseId('BATCH', value)).toThrow(DomainError);
  });
});

describe('sequential ids', () => {
  it('pads to four digits and never renumbers', () => {
    expect(formatAttemptId(1)).toBe('ATT-0001');
    expect(formatDecisionId(42)).toBe('DEC-0042');
    expect(formatSequentialId('ATT', 9999)).toBe('ATT-9999');
  });

  it('rejects ordinals outside 1..9999', () => {
    expect(() => formatAttemptId(0)).toThrow(DomainError);
    expect(() => formatDecisionId(10_000)).toThrow(DomainError);
    expect(() => formatAttemptId(1.5)).toThrow(DomainError);
  });
});

describe('run ids', () => {
  it('stamps the UTC date and time, then the target', () => {
    expect(formatRunId(new Date('2026-09-30T19:12:45Z'), 'local')).toBe('RUN-20260930-1912-local');
    expect(formatRunId(new Date('2026-01-05T03:04:00Z'), 'stub')).toBe('RUN-20260105-0304-stub');
  });

  it('rejects a target that is not a lowercase token', () => {
    expect(() => formatRunId(new Date('2026-09-30T19:12:45Z'), 'Remote Claude')).toThrow(DomainError);
  });
});
