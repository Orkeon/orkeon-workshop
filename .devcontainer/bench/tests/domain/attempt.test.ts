import { describe, expect, it } from 'vitest';

import {
  abandonedAttempt,
  approveRemote,
  closeAttempt,
  isAttemptOpen,
  nextAttemptId,
  openAttempt,
  parseAttemptManifest,
  parseOpenedBy,
  parseUsdAmount,
  withDesignSnapshot,
  withOrkeonVersion,
  withRemoteApproval,
  withRuns,
} from '../../src/domain/attempt.js';
import { DomainError } from '../../src/domain/errors.js';
import { formatAttemptId, parseId } from '../../src/domain/ids.js';

const AT = new Date('2026-09-30T19:12:00Z');
const opened = () => openAttempt({ id: formatAttemptId(1), at: AT, openedBy: 'team-build' });

describe('attempt manifest', () => {
  it('is born in the shape of the template, closed_at null, before the snapshot and the version are known', () => {
    expect(opened()).toEqual({
      attempt: 'ATT-0001',
      opened_at: '2026-09-30T19:12:00.000Z',
      closed_at: null,
      opened_by: 'team-build',
      design_snapshot: null,
      orkeon_version: 'unknown',
      runs: [],
      remote_approval: null,
      verdict: null,
    });
    expect(Object.keys(opened())).toEqual(['attempt', 'opened_at', 'closed_at', 'opened_by', 'design_snapshot', 'orkeon_version', 'runs', 'remote_approval', 'verdict']);
    expect(isAttemptOpen(opened())).toBe(true);
  });

  it('records the snapshot and the Orkeon version once they are known', () => {
    const manifest = withOrkeonVersion(withDesignSnapshot(opened()), '1.0.0-rc.4');
    expect(manifest).toMatchObject({ design_snapshot: 'design-snapshot/', orkeon_version: '1.0.0-rc.4' });
  });

  it('names who opens it in one short line', () => {
    expect(parseOpenedBy('team-build')).toBe('team-build');
    expect(parseOpenedBy('  ')).toBe('manual');
    expect(parseOpenedBy(' arion@orkeon.org ')).toBe('arion@orkeon.org');
    for (const text of ['a\nb', '"quoted"', 'x'.repeat(65), '-leading', 'tab\there']) {
      expect(() => parseOpenedBy(text), JSON.stringify(text)).toThrow('--by names who opens the attempt in one short line');
    }
  });

  it('closes as abandoned a folder that never had a manifest', () => {
    const manifest = abandonedAttempt(formatAttemptId(3), AT);
    expect(manifest).toMatchObject({ attempt: 'ATT-0003', closed_at: '2026-09-30T19:12:00.000Z', opened_by: 'unknown', verdict: null, design_snapshot: null });
    expect(isAttemptOpen(manifest)).toBe(false);
    expect(String(manifest.note)).toContain('closed without ever having had a manifest');
  });

  it('keeps the keys it does not know and defaults the optional ones', () => {
    const manifest = parseAttemptManifest({ attempt: 'ATT-0003', opened_at: 'x', closed_at: null, opened_by: 'me', design_snapshot: null, orkeon_version: '', note: 'kept' });
    expect(manifest).toMatchObject({ runs: [], remote_approval: null, verdict: null, note: 'kept' });
    expect(() => parseAttemptManifest({ attempt: 'ATT-3' })).toThrow(DomainError);
  });

  it('numbers the next attempt after the highest one, whatever else the folder holds', () => {
    expect(nextAttemptId([])).toBe('ATT-0001');
    expect(nextAttemptId(['ATT-0001', 'ATT-0007', 'notes.md', 'ATT-12'])).toBe('ATT-0008');
  });

  it('closes once, with the verdict when given, and is immutable afterwards', () => {
    const closed = closeAttempt(opened(), new Date('2026-10-01T08:00:00Z'), 'ITERATE');
    expect(closed).toMatchObject({ closed_at: '2026-10-01T08:00:00.000Z', verdict: 'ITERATE' });
    expect(closeAttempt(opened(), AT).verdict).toBeNull();
    expect(isAttemptOpen(closed)).toBe(false);
    const run = parseId('RUN', 'RUN-20260930-1912-stub');
    expect(() => closeAttempt(closed, AT)).toThrow('ATT-0001 was closed at 2026-10-01T08:00:00.000Z: a closed attempt is immutable, cannot close it again');
    expect(() => withRuns(closed, [run])).toThrow('cannot add a run');
    expect(() => withDesignSnapshot(closed)).toThrow('cannot take its design snapshot');
    expect(() => withOrkeonVersion(closed, '1')).toThrow('cannot record the Orkeon version');
    expect(() => withRemoteApproval(closed, approveRemote({ amountUsd: 1, capUsd: 2, at: AT, source: 's' }))).toThrow('cannot record an approval');
  });

  it('lists each run once, in the order they came', () => {
    const first = parseId('RUN', 'RUN-20260930-1912-stub');
    const second = parseId('RUN', 'RUN-20260930-1912-stub-2');
    expect(withRuns(withRuns(opened(), [first]), [first, second]).runs).toEqual([first, second]);
  });
});

describe('remote approval', () => {
  it('is the object the run gate accepts', () => {
    const approval = approveRemote({ amountUsd: 1.5, capUsd: 2, at: AT, source: '/team-approve remote 1.50' });
    expect(approval).toEqual({ by: 'user', at: '2026-09-30T19:12:00.000Z', estimated_usd: 1.5, cap_usd: 2, source: '/team-approve remote 1.50' });
    expect(withRemoteApproval(opened(), approval).remote_approval).toEqual(approval);
    expect(approveRemote({ amountUsd: 0, capUsd: 0, at: AT, source: 's' }).estimated_usd).toBe(0);
  });

  it('refuses an amount above the cap, a negative one and one that is no number', () => {
    expect(() => approveRemote({ amountUsd: 2.01, capUsd: 2, at: AT, source: 's' })).toThrow('2.01 USD is above the cap of 2 USD (budget.remote_usd_max of bench.config.json)');
    expect(() => approveRemote({ amountUsd: -1, capUsd: 2, at: AT, source: 's' })).toThrow('-1 is not an amount of USD');
    expect(() => approveRemote({ amountUsd: Number.NaN, capUsd: 2, at: AT, source: 's' })).toThrow('NaN is not an amount of USD');
  });

  it('reads a plain decimal amount and nothing else', () => {
    expect(parseUsdAmount('2')).toBe(2);
    expect(parseUsdAmount(' 1.50 ')).toBe(1.5);
    expect(parseUsdAmount('0')).toBe(0);
    for (const text of ['', 'two', '-1', '1e3', '$2', '1,5', '2.', '.5', 'Infinity']) {
      expect(() => parseUsdAmount(text), text).toThrow('is not an amount of USD: expected a number of 0 or more, such as 1.50');
    }
  });
});
