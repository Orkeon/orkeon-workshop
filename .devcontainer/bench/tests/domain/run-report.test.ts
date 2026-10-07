import { describe, expect, it } from 'vitest';

import { formatAttemptId, parseId } from '../../src/domain/ids.js';
import { parseReport } from '../../src/domain/report.js';
import {
  INDICATOR_NOT_COMPUTED,
  INVARIANT_NOT_CHECKED,
  acceptanceWarnings,
  buildReport,
  levelStatus,
  renderReportMarkdown,
  replacedReport,
  replacesHigherLevel,
  reportRuns,
  type RunOutcome,
  type ScenarioResult,
} from '../../src/domain/run-report.js';
import { isAccepted, verdictInputDiscrepancies } from '../../src/domain/verdict.js';

/** An entry of a record keyed by branded ids. */
const pick = (record: object, id: string): unknown => (record as Record<string, unknown>)[id];

const RUN_1 = parseId('RUN', 'RUN-20260930-1912-stub');
const RUN_2 = parseId('RUN', 'RUN-20260930-1912-stub-2');

function scenario(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    id: 'ac-01-digest',
    title: 'The digest is written',
    file: 'component/ac-01-digest.scenario.json',
    status: 'pass',
    covers: ['AC-01', 'INV-FS'],
    run: RUN_1,
    dataset: 'nominal',
    exit_code: 0,
    duration_seconds: 1.64,
    tokens_in: 100,
    tokens_out: 10,
    tool_calls: 2,
    human_inputs: 0,
    checks: [{ id: 'run', type: 'run-succeeded', status: 'pass', detail: '' }],
    ...overrides,
  };
}

const FAILED = scenario({
  id: 'inv-tools-script',
  file: 'component/inv-tools-script.scenario.json',
  status: 'fail',
  covers: ['AC-02', 'INV-TOOLS', 'INV-FS'],
  run: RUN_2,
  human_inputs: 1,
  checks: [
    { id: 'run', type: 'run-succeeded', status: 'pass', detail: '' },
    { id: 'c1', type: 'file-exists', status: 'fail', detail: '/reports/x.md | does not exist' },
  ],
});

const declared = (id: string, level: 'static' | 'component' | 'e2e_local' | null, levelCell = level === null ? 'soon' : 'L') => ({ id, level, levelCell });

function outcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    team: 'notes-digest',
    attempt: formatAttemptId(1),
    date: new Date('2026-09-30T19:12:00Z'),
    orkeonVersion: '1.0.0-rc.4',
    benchVersion: '0.1.0',
    requested: 'component',
    replaces: null,
    static: { status: 'pass', checks: [{ id: 'mounts', status: 'pass', detail: '' }, { id: 'check-script', status: 'skipped', detail: 'no script' }], duration_seconds: 1.12, note: '' },
    unit: { status: 'skipped', duration_seconds: 0, note: 'not run: L1 is not implemented yet (lot 4)' },
    component: { status: 'pass', scenarios: [scenario()], duration_seconds: 1.7, note: '' },
    e2eNote: 'not run: L3 and L4 are not implemented yet (lots 4 and 9)',
    declared: {
      acceptance: [declared('AC-01', 'component'), declared('AC-03', 'e2e_local'), declared('AC-04', 'component'), declared('AC-05', 'static'), declared('AC-06', null)],
      invariants: [declared('INV-FS', 'component'), declared('INV-SECRETS', 'component')],
      indicators: [{ id: 'IND-01', threshold: 100 }, { id: 'IND-02', threshold: null }],
      dropped: [],
    },
    planned: [
      { id: 'ac-01-digest', level: 'component', covers: ['AC-01', 'INV-FS'] },
      { id: 'ac-07-quality', level: 'e2e_remote', covers: ['AC-07', 'INV-INJECTION', 'IND-03'] },
      { id: 'ac-07-wiring', level: 'component', covers: ['AC-07'] },
    ],
    wallSeconds: 2.768,
    ...overrides,
  };
}

/** Everything declared at L2 and covered by the green scenario; no invariant, no indicator. */
const PROVEN: Partial<RunOutcome> = {
  declared: { acceptance: [declared('AC-01', 'component')], invariants: [], indicators: [], dropped: [] },
  component: { status: 'pass', scenarios: [scenario({ covers: ['AC-01'] })], duration_seconds: 1.7, note: '' },
  planned: [{ id: 'ac-01-digest', level: 'component', covers: ['AC-01'] }],
};

describe('levelStatus', () => {
  it('fails on one failure, passes on one pass, is skipped when nothing ran', () => {
    expect(levelStatus([{ status: 'pass' }, { status: 'fail' }, { status: 'skipped' }])).toBe('fail');
    expect(levelStatus([{ status: 'pass' }, { status: 'skipped' }])).toBe('pass');
    expect(levelStatus([{ status: 'skipped' }])).toBe('skipped');
    expect(levelStatus([])).toBe('skipped');
  });
});

describe('buildReport', () => {
  it('writes a report that its own parser and the verdict rule accept', () => {
    const report = buildReport(outcome());
    expect(() => parseReport(report)).not.toThrow();
    expect(verdictInputDiscrepancies(report)).toEqual([]);
    expect(Object.keys(report)).toEqual(['schema_version', 'metadata', 'levels', 'acceptance', 'indicators', 'invariants', 'judges', 'cost', 'verdict_input']);
    expect(report.metadata).toEqual({
      team: 'notes-digest',
      attempt: 'ATT-0001',
      date: '2026-09-30T19:12:00.000Z',
      orkeon_version: '1.0.0-rc.4',
      bench_version: '0.1.0',
      requested_level: 'component',
      replaces: null,
    });
    expect(report.levels.unit).toMatchObject({ status: 'skipped', passed: 0, failed: 0, note: 'not run: L1 is not implemented yet (lot 4)' });
    expect(report.levels.e2e_local).toMatchObject({ status: 'skipped', runs: 0, pass_at_k: '0/0' });
    expect(report.levels.e2e_remote).toMatchObject({ status: 'skipped', usd: 0 });
    expect(report.levels.component.scenarios).toHaveLength(1);
    expect(report.judges).toEqual({});
    expect(report.cost).toEqual({ tokens_in: 100, tokens_out: 10, usd_estimated: 0, wall_seconds: 2.768, tool_calls: 2, retries: 0, human_inputs: 0 });
  });

  it('passes a criterion only when ACCEPTANCE.md declares it at a level it can read and a green scenario of that level covers it', () => {
    const report = buildReport(outcome());
    expect(report.acceptance).toEqual({
      'AC-01': { status: 'pass', level: 'component', evidence: 'ac-01-digest (RUN-20260930-1912-stub)' },
      'AC-03': { status: 'not_run', level: 'e2e_local', evidence: 'requires L3 (e2e_local), which did not run' },
      'AC-04': { status: 'not_run', level: 'component', evidence: 'no L2 scenario that ran covers it' },
      'AC-05': { status: 'not_run', level: 'static', evidence: 'no L0 scenario that ran covers it' },
      'AC-06': { status: 'not_run', level: 'e2e_remote', evidence: 'ACCEPTANCE.md gives no level the bench can read for it ("soon"): write one of L0 to L4' },
      'AC-07': { status: 'not_run', level: 'e2e_remote', evidence: 'not declared in ACCEPTANCE.md: nothing says at which level it is proven' },
    });
    expect(acceptanceWarnings(outcome())).toEqual([
      'AC-06 is not proven: ACCEPTANCE.md gives no level the bench can read for it ("soon"): write one of L0 to L4',
      'AC-07 is not proven: not declared in ACCEPTANCE.md: nothing says at which level it is proven',
    ]);
    expect(report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: false });
  });

  it('proves no criterion without ACCEPTANCE.md, whatever the scenarios cover', () => {
    const result = outcome({ declared: null, planned: [{ id: 'ac-01-digest', level: 'component', covers: ['AC-01', 'INV-FS'] }] });
    const report = buildReport(result);
    expect(report.acceptance).toEqual({
      'AC-01': { status: 'not_run', level: 'component', evidence: 'ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at' },
    });
    expect(acceptanceWarnings(result)).toEqual(['AC-01 is not proven: ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at']);
    expect(report.verdict_input.all_ac_pass).toBe(false);
    expect(isAccepted(report.verdict_input)).toBe(false);
  });

  it('never lets a criterion with an unreadable level pass on the level of the scenario that covers it', () => {
    const result = outcome({ declared: { acceptance: [declared('AC-01', null, 'L3 / L4')], invariants: [], indicators: [], dropped: [] }, planned: [] });
    expect(pick(buildReport(result).acceptance, 'AC-01')).toEqual({ status: 'not_run', level: 'e2e_remote', evidence: 'ACCEPTANCE.md gives no level the bench can read for it ("L3 / L4"): write one of L0 to L4' });
  });

  it('never accepts a run in which nothing is declared', () => {
    const report = buildReport(outcome({ declared: { acceptance: [], invariants: [], indicators: [], dropped: [] }, component: { status: 'pass', scenarios: [scenario({ covers: [] })], duration_seconds: 1, note: '' }, planned: [] }));
    expect(report.acceptance).toEqual({});
    expect(report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: true, indicators_in_range: true });
  });

  it('accepts what a run of L2 can prove: criteria declared at L2, each covered by a green scenario, and nothing else declared', () => {
    const report = buildReport(outcome(PROVEN));
    expect(report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect(isAccepted(report.verdict_input)).toBe(true);
  });

  it('never passes an invariant: none has a check of its own yet, a green scenario that covers it proves nothing', () => {
    const report = buildReport(outcome());
    const notChecked = { status: 'not_run', violations: [], note: INVARIANT_NOT_CHECKED };
    expect(report.invariants).toEqual({ 'INV-FS': notChecked, 'INV-INJECTION': notChecked, 'INV-SECRETS': notChecked });
    expect(report.verdict_input.all_inv_pass).toBe(false);
    const covered = buildReport(outcome({ ...PROVEN, component: { status: 'pass', scenarios: [scenario()], duration_seconds: 1, note: '' } }));
    expect(covered.invariants).toEqual({ 'INV-FS': notChecked });
    expect(covered.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: false, indicators_in_range: true });
  });

  it('lists every declared or covered indicator as not computed, and keeps indicators_in_range false', () => {
    const report = buildReport(outcome());
    expect(report.indicators).toEqual({
      'IND-01': { value: null, threshold: 100, status: 'not_run', note: INDICATOR_NOT_COMPUTED },
      'IND-02': { value: null, threshold: null, status: 'not_run', note: INDICATOR_NOT_COMPUTED },
      'IND-03': { value: null, threshold: null, status: 'not_run', note: INDICATOR_NOT_COMPUTED },
    });
    const declaredOnly = buildReport(outcome({ ...PROVEN, declared: { acceptance: [declared('AC-01', 'component')], invariants: [], indicators: [{ id: 'IND-01', threshold: 100 }], dropped: [] } }));
    expect(declaredOnly.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: false });
  });

  it('leaves out an id ACCEPTANCE.md dropped, even when a scenario still covers it, and says so', () => {
    const result = outcome({
      ...PROVEN,
      declared: { acceptance: [declared('AC-01', 'component')], invariants: [], indicators: [], dropped: ['AC-07', 'INV-FS', 'IND-03', 'AC-09'] },
      component: { status: 'pass', scenarios: [scenario({ covers: ['AC-01', 'AC-07', 'INV-FS'] })], duration_seconds: 1, note: '' },
      planned: [{ id: 'ac-07-quality', level: 'e2e_remote', covers: ['AC-07', 'IND-03'] }],
    });
    const report = buildReport(result);
    expect(Object.keys(report.acceptance)).toEqual(['AC-01']);
    expect(report.invariants).toEqual({});
    expect(report.indicators).toEqual({});
    expect(report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect(acceptanceWarnings(result)).toEqual([
      'AC-07 is dropped in ACCEPTANCE.md and still covered by ac-07-quality, ac-01-digest: it is left out of the report — take it out of `covers`',
      'INV-FS is dropped in ACCEPTANCE.md and still covered by ac-01-digest: it is left out of the report — take it out of `covers`',
      'IND-03 is dropped in ACCEPTANCE.md and still covered by ac-07-quality: it is left out of the report — take it out of `covers`',
    ]);
  });

  it('fails a criterion and an invariant on a failed scenario that covers them, whatever their level', () => {
    const result = outcome({
      component: { status: 'fail', scenarios: [scenario(), FAILED, scenario({ id: 'setup', run: null, status: 'fail', covers: ['AC-01'], checks: [{ id: 'setup', type: 'setup', status: 'fail', detail: 'no dataset' }] })], duration_seconds: 3, note: '' },
      declared: { acceptance: [declared('AC-02', 'e2e_local')], invariants: [], indicators: [], dropped: [] },
      planned: [],
    });
    const report = buildReport(result);
    expect(pick(report.acceptance, 'AC-02')).toEqual({ status: 'fail', level: 'e2e_local', evidence: 'failed: inv-tools-script (RUN-20260930-1912-stub-2)' });
    expect(pick(report.acceptance, 'AC-01')).toEqual({ status: 'fail', level: 'component', evidence: 'failed: setup' });
    expect(acceptanceWarnings(result)).toEqual(['AC-01: not declared in ACCEPTANCE.md: nothing says at which level it is proven']);
    const violation = [{ scenario: 'inv-tools-script', run: RUN_2, failed_checks: ['c1'] }];
    expect(report.invariants).toEqual({
      'INV-FS': { status: 'fail', violations: violation, note: 'a scenario that covers it failed' },
      'INV-TOOLS': { status: 'fail', violations: violation, note: 'a scenario that covers it failed' },
    });
    expect(report.cost.human_inputs).toBe(1);
    expect(report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: true });
    expect(verdictInputDiscrepancies(report)).toEqual([]);
  });

  it('proves nothing when the component level did not run', () => {
    const report = buildReport(outcome({ static: { status: 'fail', checks: [{ id: 'mounts', status: 'fail', detail: 'mounts.json not found' }], duration_seconds: 0, note: '' }, component: { status: 'skipped', scenarios: [], duration_seconds: 0, note: 'not run: L0 is red' } }));
    expect(pick(report.acceptance, 'AC-01')).toEqual({ status: 'not_run', level: 'component', evidence: 'requires L2 (component), which did not run' });
    expect(pick(report.invariants, 'INV-FS')).toMatchObject({ status: 'not_run' });
  });
});

describe('the report a run replaces', () => {
  it('knows the level the earlier report reached and the runs it rested on', () => {
    const earlier = buildReport(outcome());
    expect(replacedReport(earlier)).toEqual({ date: '2026-09-30T19:12:00.000Z', reached: 'component', runs: ['RUN-20260930-1912-stub'] });
    const staticOnly = buildReport(outcome({ requested: 'static', component: { status: 'skipped', scenarios: [], duration_seconds: 0, note: 'not requested' } }));
    expect(replacedReport(staticOnly)).toEqual({ date: '2026-09-30T19:12:00.000Z', reached: 'static', runs: [] });
    const nothing = parseReport({ ...earlier, levels: { ...earlier.levels, static: { ...earlier.levels.static, status: 'skipped' }, component: { status: 'skipped', scenarios: ['a name', { run: 7 }], duration_seconds: 0 } } });
    expect(replacedReport(nothing)).toMatchObject({ reached: null, runs: [] });
  });

  it('is replaced by a lower run only with a warning', () => {
    const earlier = replacedReport(buildReport(outcome()));
    expect(replacesHigherLevel('static', earlier)).toBe(true);
    expect(replacesHigherLevel('component', earlier)).toBe(false);
    expect(replacesHigherLevel('static', null)).toBe(false);
    expect(replacesHigherLevel('static', { date: 'x', reached: null, runs: [] })).toBe(false);
  });

  it('is named in the report that replaces it', () => {
    const replaces = replacedReport(buildReport(outcome()));
    const result = outcome({ requested: 'static', replaces, component: { status: 'skipped', scenarios: [], duration_seconds: 0, note: 'not requested' } });
    const report = buildReport(result);
    expect((report.metadata as Record<string, unknown>).replaces).toEqual(replaces);
    const markdown = renderReportMarkdown(report, result);
    expect(markdown).toContain('- Asked for: --level L0. The report of an attempt is that of its last run: this one replaces any earlier report of ATT-0001.');
    expect(markdown).toContain('- Replaces: the report of 2026-09-30T19:12:00.000Z, which reached L2 (its evidence stays in runs/RUN-20260930-1912-stub)');
  });
});

describe('reportRuns', () => {
  it('lists the runs of the scenarios that started one', () => {
    expect(reportRuns([scenario(), scenario({ run: null }), FAILED])).toEqual([RUN_1, RUN_2]);
  });
});

describe('renderReportMarkdown', () => {
  it('keeps the headings of the template and says nothing fails when nothing does', () => {
    const result = outcome(PROVEN);
    const markdown = renderReportMarkdown(buildReport(result), result);
    expect(markdown.split('\n').filter((line) => line.startsWith('#'))).toEqual([
      '# notes-digest — Report ATT-0001',
      '## What fails',
      '## Levels',
      '## Acceptance criteria',
      '## Indicators',
      '## Invariants',
      '## Judges',
      '## Local and remote',
      '## Cost',
      '## Verdict input',
    ]);
    expect(markdown).toContain('- Runs: RUN-20260930-1912-stub\n- Asked for: --level L2. The report of an attempt is that of its last run: this one replaces any earlier report of ATT-0001.\n\n## What fails\n\nNothing.\n\n## Levels');
    expect(markdown).not.toContain('- Replaces:');
    expect(markdown).toContain('| static | pass | 2 check(s): 1 pass, 0 fail, 1 skipped | 1.1 |');
    expect(markdown).toContain('| unit | skipped | not run: L1 is not implemented yet (lot 4) | 0 |');
    expect(markdown).toContain('| component | pass | 1 scenario(s): 1 pass, 0 fail | 1.7 |');
    expect(markdown).toContain('| AC-01 | pass | component | ac-01-digest (RUN-20260930-1912-stub) |');
    expect(markdown).toContain('| Id | Value | Threshold | Status |\n|---|---|---|---|\n| none |  |  |  |');
    expect(markdown).toContain('| Id | Status | Violations |\n|---|---|---|\n| none |  |  |');
    expect(markdown).toContain('| 100 | 10 | 0 | 2.8 | 2 | 0 | 0 |');
    expect(markdown).toContain('| true | true | true |');
  });

  it('puts what fails first, then what did not run and so is not proven', () => {
    const result = outcome({
      static: { status: 'fail', checks: [{ id: 'launchers', status: 'fail', detail: 'run.sh not in step' }], duration_seconds: 0.2, note: '' },
      component: { status: 'fail', scenarios: [FAILED], duration_seconds: 2, note: '' },
      declared: { acceptance: [declared('AC-02', 'component'), declared('AC-03', 'e2e_local')], invariants: [declared('INV-SECRETS', 'component')], indicators: [{ id: 'IND-01', threshold: 100 }], dropped: [] },
      planned: [],
    });
    const markdown = renderReportMarkdown(buildReport(result), result);
    const fails = markdown.slice(markdown.indexOf('## What fails'), markdown.indexOf('## Levels'));
    expect(fails.split('\n').filter((line) => line !== '')).toEqual([
      '## What fails',
      '- static check `launchers` — run.sh not in step',
      '- scenario `inv-tools-script` (RUN-20260930-1912-stub-2), check `c1` — /reports/x.md | does not exist',
      '- AC-02 — fail — failed: inv-tools-script (RUN-20260930-1912-stub-2)',
      '- INV-FS — fail — 1 violation(s)',
      '- INV-TOOLS — fail — 1 violation(s)',
      'Not run, so not proven:',
      '- AC-03 — requires L3 (e2e_local), which did not run',
      `- INV-SECRETS — ${INVARIANT_NOT_CHECKED}`,
      `- IND-01 — ${INDICATOR_NOT_COMPUTED}`,
    ]);
    expect(markdown).toContain('| component | fail | 1 scenario(s): 0 pass, 1 fail | 2 |');
    expect(markdown).toContain('| IND-01 |  | 100 | not_run |');
    expect(markdown).toContain('| INV-SECRETS | not_run | 0 |');
  });

  it('says a level did not run, and why, when it has a note — and that a level asked for ran nothing', () => {
    const skipped = outcome({ ...PROVEN, component: { status: 'skipped', scenarios: [], duration_seconds: 0, note: 'not run: L0 is red' }, planned: [] });
    const markdown = renderReportMarkdown(buildReport(skipped), skipped);
    expect(markdown).toContain('- Runs: none');
    expect(markdown).toContain('| component | skipped | not run: L0 is red | 0 |');
    expect(markdown).toContain('Nothing.\n\nNot run, so not proven:\n\n- AC-01 — requires L2 (component), which did not run');
    const empty = outcome({ ...PROVEN, component: { status: 'fail', scenarios: [], duration_seconds: 0, note: 'no scenario in tests/x/component: L2 was asked for and ran nothing' }, planned: [] });
    const emptyMarkdown = renderReportMarkdown(buildReport(empty), empty);
    expect(emptyMarkdown).toContain('## What fails\n\n- L2 — no scenario in tests/x/component: L2 was asked for and ran nothing');
    expect(emptyMarkdown).toContain('| component | fail | no scenario in tests/x/component: L2 was asked for and ran nothing | 0 |');
  });
});
