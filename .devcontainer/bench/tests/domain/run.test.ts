import { describe, expect, it } from 'vitest';

import { LEVEL_LABELS, defaultMaxLevel, levelFromLabel, levelsUpTo, nextRunId, parseLevel } from '../../src/domain/run.js';

describe('levels', () => {
  it('reads L0…L4 and the report keys, whatever the case', () => {
    expect(parseLevel('L0')).toBe('static');
    expect(parseLevel('l2')).toBe('component');
    expect(parseLevel(' e2e_remote ')).toBe('e2e_remote');
    expect(levelFromLabel('L5')).toBeNull();
    expect(levelFromLabel('')).toBeNull();
    expect(() => parseLevel('B1')).toThrow('unknown level "B1" (expected L0…L4, or static, unit, component, e2e_local, e2e_remote)');
    expect(LEVEL_LABELS.e2e_local).toBe('L3');
  });

  it('lists the levels a run reaches, in order', () => {
    expect(levelsUpTo('static')).toEqual(['static']);
    expect(levelsUpTo('component')).toEqual(['static', 'unit', 'component']);
  });
});

describe('defaultMaxLevel', () => {
  it('is the highest level bench.config.json configures, and L2 when it configures none', () => {
    expect(defaultMaxLevel([])).toBe('component');
    expect(defaultMaxLevel(['e2e_local'])).toBe('e2e_local');
    expect(defaultMaxLevel(['e2e_remote', 'e2e_local'])).toBe('e2e_remote');
    expect(defaultMaxLevel(['unit'])).toBe('unit');
  });
});

describe('nextRunId', () => {
  const at = new Date('2026-09-30T19:12:45Z');

  it('is the stamp and the target, then numbered within the same minute', () => {
    expect(nextRunId(at, 'stub', [])).toBe('RUN-20260930-1912-stub');
    expect(nextRunId(at, 'stub', ['RUN-20260930-1912-stub'])).toBe('RUN-20260930-1912-stub-2');
    expect(nextRunId(at, 'stub', ['RUN-20260930-1912-stub', 'RUN-20260930-1912-stub-2', 'RUN-20260930-1911-stub'])).toBe('RUN-20260930-1912-stub-3');
  });
});
