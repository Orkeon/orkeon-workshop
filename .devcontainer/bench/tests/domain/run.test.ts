import { describe, expect, it } from 'vitest';

import { LEVEL_LABELS, levelFromLabel, levelsUpTo, nextRunId, parseLevel, unsupportedRunRequest } from '../../src/domain/run.js';

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

describe('unsupportedRunRequest', () => {
  it('serves a run up to L0 or up to L2, with the stub or no profile', () => {
    expect(unsupportedRunRequest({ maxLevel: 'component', profile: null })).toBeNull();
    expect(unsupportedRunRequest({ maxLevel: 'static', profile: 'stub' })).toBeNull();
  });

  it('refuses a level above L2, no level at all, any other profile — and L1, which would run nothing', () => {
    expect(unsupportedRunRequest({ maxLevel: 'e2e_local', profile: null })).toBe('level L3: this version runs L0 to L2 — pass --level L2');
    expect(unsupportedRunRequest({ maxLevel: 'e2e_remote', profile: null })).toBe('level L4: this version runs L0 to L2 — pass --level L2');
    expect(unsupportedRunRequest({ maxLevel: null, profile: null })).toBe('without --level a run reaches L4: this version runs L0 to L2 — pass --level L2');
    expect(unsupportedRunRequest({ maxLevel: 'component', profile: 'machine' })).toBe('profile "machine": this version runs with the simulated LLM only (--profile stub, the default up to L2)');
    expect(unsupportedRunRequest({ maxLevel: 'unit', profile: null })).toBe('level L1: unit tests are not run by this version — pass --level L0, or --level L2 (L1 is then reported skipped)');
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
