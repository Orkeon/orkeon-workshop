import { describe, expect, it } from 'vitest';

import { formatAttemptId, parseId } from '../../src/domain/ids.js';
import { INDICATOR_NOT_MEASURED, judgePendingNote } from '../../src/domain/indicators.js';
import { INVARIANT_NOT_COVERED, INVARIANT_NO_ADVERSARIAL, INVARIANT_NO_RUN } from '../../src/domain/invariants.js';
import { parseReport } from '../../src/domain/report.js';
import {
  NO_FACTS,
  acceptanceWarnings,
  buildReport,
  citedRuns,
  effectiveStatuses,
  levelStatus,
  passCounts,
  passCountsLine,
  renderReportMarkdown,
  replacedReport,
  replacesHigherLevel,
  reportRuns,
  scenarioLevelStatus,
  type RunOutcome,
  type ScenarioResult,
} from '../../src/domain/run-report.js';
import { failureClassCounts, failureClassOf, isAccepted, verdictInputDiscrepancies } from '../../src/domain/verdict.js';

/** An entry of a record keyed by branded ids. */
const pick = (record: object, id: string): unknown => (record as Record<string, unknown>)[id];

const RUN_1 = parseId('RUN', 'RUN-20260930-1912-stub');
const RUN_2 = parseId('RUN', 'RUN-20260930-1912-stub-2');
const RUN_3 = parseId('RUN', 'RUN-20260930-1913-machine');

function scenario(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    id: 'ac-01-digest',
    title: 'The digest is written',
    file: 'component/ac-01-digest.scenario.json',
    level: 'component',
    iteration: 1,
    status: 'pass',
    covers: ['AC-01', 'INV-FS'],
    run: RUN_1,
    dataset: 'nominal',
    datasets: ['nominal'],
    model: 'stub-model',
    exit_code: 0,
    duration_seconds: 1.64,
    tokens_in: 100,
    tokens_out: 10,
    usd: 0,
    tool_calls: 2,
    human_inputs: 0,
    indicators: [],
    checks: [{ id: 'run', type: 'run-succeeded', status: 'pass', detail: '' }],
    facts: NO_FACTS,
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
const indicator = (id: string, threshold: number | null, direction: '>=' | '<=' | null = '>=') => ({ id, threshold, direction });
const NONE = { declared: { acceptance: [], invariants: [], indicators: [], dropped: [] } };
const NO_E2E = { scenarios: [], duration_seconds: 0, note: 'not requested' };

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
    unit: { status: 'skipped', passed: 0, failed: 0, duration_seconds: 0, note: 'skipped: no tests/notes-digest/unit folder' },
    component: { status: 'pass', scenarios: [scenario()], duration_seconds: 1.7, note: '' },
    e2e_local: { status: 'skipped', ...NO_E2E, model: '', repeat: 1, passAt: 1 },
    e2e_remote: { status: 'skipped', ...NO_E2E, provider: '', model: '', usd: 0 },
    budget: { remote_usd_max: 2, local_minutes_max: 60 },
    declared: {
      acceptance: [declared('AC-01', 'component'), declared('AC-03', 'e2e_local'), declared('AC-04', 'component'), declared('AC-05', 'static'), declared('AC-06', null)],
      invariants: [declared('INV-FS', 'component'), declared('INV-SECRETS', 'component')],
      indicators: [indicator('IND-01', 100), indicator('IND-02', null)],
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

describe('effectiveStatuses', () => {
  const local = (iteration: number, status: 'pass' | 'fail'): ScenarioResult => scenario({ id: 'e2e-01', level: 'e2e_local', iteration, status, run: RUN_3, model: 'qwen3:8b' });

  it('passes a repeated L3 scenario when pass_at of its runs passed, and every iteration elsewhere', () => {
    const result = outcome({ e2e_local: { status: 'pass', scenarios: [local(1, 'pass'), local(2, 'fail'), local(3, 'pass')], duration_seconds: 9, note: '', model: 'qwen3:8b', repeat: 3, passAt: 2 } });
    const effective = effectiveStatuses(result);
    expect(effective.get('e2e_local:e2e-01')).toBe('pass');
    expect(effective.get('component:ac-01-digest')).toBe('pass');
    expect(scenarioLevelStatus(result.e2e_local.scenarios, effective)).toBe('pass');
    const strict = outcome({ e2e_local: { ...result.e2e_local, passAt: 3 } });
    expect(effectiveStatuses(strict).get('e2e_local:e2e-01')).toBe('fail');
    expect(scenarioLevelStatus(strict.e2e_local.scenarios, effectiveStatuses(strict))).toBe('fail');
    const twice = outcome({ component: { status: 'fail', scenarios: [scenario(), scenario({ iteration: 2, status: 'fail' })], duration_seconds: 2, note: '' } });
    expect(effectiveStatuses(twice).get('component:ac-01-digest')).toBe('fail');
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
    expect(report.levels.unit).toMatchObject({ status: 'skipped', passed: 0, failed: 0, note: 'skipped: no tests/notes-digest/unit folder' });
    expect(report.levels.e2e_local).toMatchObject({ status: 'skipped', runs: 0, pass_at_k: '1/1', model: '' });
    expect(report.levels.e2e_remote).toMatchObject({ status: 'skipped', usd: 0, provider: '' });
    expect(report.levels.component.scenarios).toHaveLength(1);
    expect(report.judges).toEqual({});
    expect(report.cost).toEqual({ tokens_in: 100, tokens_out: 10, usd_estimated: 0, wall_seconds: 2.768, tool_calls: 2, retries: 0, human_inputs: 0 });
  });

  it('passes a criterion only when TEAM.md declares it at a level it can read and a green scenario of that level covers it', () => {
    const report = buildReport(outcome());
    expect(report.acceptance).toEqual({
      'AC-01': { status: 'pass', level: 'component', evidence: 'ac-01-digest (RUN-20260930-1912-stub)' },
      'AC-03': { status: 'not_run', level: 'e2e_local', evidence: 'requires L3 (e2e_local), which did not run' },
      'AC-04': { status: 'not_run', level: 'component', evidence: 'no L2 scenario that ran covers it' },
      'AC-05': { status: 'not_run', level: 'static', evidence: 'no L0 scenario that ran covers it' },
      'AC-06': { status: 'not_run', level: 'e2e_remote', evidence: 'TEAM.md gives no level the bench can read for it ("soon"): write one of L0 to L4' },
      'AC-07': { status: 'not_run', level: 'e2e_remote', evidence: 'not declared in TEAM.md: nothing says at which level it is proven' },
    });
    expect(acceptanceWarnings(outcome())).toEqual([
      'AC-06 is not proven: TEAM.md gives no level the bench can read for it ("soon"): write one of L0 to L4',
      'AC-07 is not proven: not declared in TEAM.md: nothing says at which level it is proven',
    ]);
    expect(report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: false });
  });

  it('proves no criterion without TEAM.md, whatever the scenarios cover', () => {
    const result = outcome({ declared: null, planned: [{ id: 'ac-01-digest', level: 'component', covers: ['AC-01', 'INV-FS'] }] });
    const report = buildReport(result);
    expect(report.acceptance).toEqual({
      'AC-01': { status: 'not_run', level: 'component', evidence: 'TEAM.md does not exist: nothing declares the level this criterion is proven at' },
    });
    expect(acceptanceWarnings(result)).toEqual(['AC-01 is not proven: TEAM.md does not exist: nothing declares the level this criterion is proven at']);
    expect(report.verdict_input.all_ac_pass).toBe(false);
    expect(isAccepted(report.verdict_input)).toBe(false);
  });

  it('never lets a criterion with an unreadable level pass on the level of the scenario that covers it', () => {
    const result = outcome({ declared: { acceptance: [declared('AC-01', null, 'L3 / L4')], invariants: [], indicators: [], dropped: [] }, planned: [] });
    expect(pick(buildReport(result).acceptance, 'AC-01')).toEqual({ status: 'not_run', level: 'e2e_remote', evidence: 'TEAM.md gives no level the bench can read for it ("L3 / L4"): write one of L0 to L4' });
  });

  it('never accepts a run in which nothing is declared', () => {
    const report = buildReport(outcome({ ...NONE, component: { status: 'pass', scenarios: [scenario({ covers: [] })], duration_seconds: 1, note: '' }, planned: [] }));
    expect(report.acceptance).toEqual({});
    expect(report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: true, indicators_in_range: true });
  });

  it('accepts what a run of L2 can prove: criteria declared at L2, each covered by a green scenario, and nothing else declared', () => {
    const report = buildReport(outcome(PROVEN));
    expect(report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect(isAccepted(report.verdict_input)).toBe(true);
  });

  it('checks the ruled invariants on every archived run, and the others by the scenarios that cover them', () => {
    const report = buildReport(outcome());
    expect(report.invariants).toEqual({
      'INV-FS': { status: 'pass', violations: [], note: 'checked on every run: the read-only mount points hold after the run what they held before' },
      'INV-INJECTION': { status: 'not_run', violations: [], note: INVARIANT_NO_ADVERSARIAL },
      'INV-SECRETS': { status: 'pass', violations: [], note: 'checked on every run: no key in the events, the logs or the written points' },
    });
    expect(report.verdict_input.all_inv_pass).toBe(false);
    const covered = buildReport(
      outcome({
        ...PROVEN,
        declared: { acceptance: [declared('AC-01', 'component')], invariants: [declared('INV-IDEMP', 'component'), declared('INV-RESUME', 'component')], indicators: [], dropped: [] },
        component: { status: 'pass', scenarios: [scenario({ covers: ['AC-01', 'INV-IDEMP'] })], duration_seconds: 1, note: '' },
      }),
    );
    expect(covered.invariants).toEqual({
      'INV-IDEMP': { status: 'pass', violations: [], note: 'covered by ac-01-digest, which passed' },
      'INV-RESUME': { status: 'not_run', violations: [], note: INVARIANT_NOT_COVERED },
    });
    expect(covered.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: false, indicators_in_range: true });
  });

  it('refutes a ruled invariant on what the archive of a run shows', () => {
    const leaky = scenario({
      id: 'leaky',
      run: RUN_2,
      covers: [],
      facts: { read_only_changed: ['/workspace'], secrets_found: ['stderr.log (an OpenAI-style key (sk-…))'], tools_called: ['file_read', 'email_send', 'ssh'], tools_unknown: ['ssh'], schema_failed: ['c9'], text_absent_failed: [] },
    });
    const result = outcome({
      ...NONE,
      declared: { acceptance: [], invariants: [declared('INV-FS', 'component'), declared('INV-SECRETS', 'component'), declared('INV-TOOLS', 'component'), declared('INV-SCHEMA', 'component'), declared('INV-EMAIL', 'component'), declared('INV-BUDGET', 'component')], indicators: [], dropped: [] },
      component: { status: 'pass', scenarios: [leaky], duration_seconds: 1, note: '' },
      planned: [],
      wallSeconds: 3700,
    });
    const report = buildReport(result);
    const violation = (detail: string): unknown[] => [{ scenario: 'leaky', run: RUN_2, detail }];
    expect(pick(report.invariants, 'INV-FS')).toMatchObject({ status: 'fail', violations: violation('the content of /workspace changed during the run') });
    expect(pick(report.invariants, 'INV-SECRETS')).toMatchObject({ status: 'fail', violations: violation('something that looks like a key in stderr.log (an OpenAI-style key (sk-…))') });
    expect(pick(report.invariants, 'INV-TOOLS')).toMatchObject({ status: 'fail', violations: violation('called ssh, which the tool catalogue does not list') });
    expect(pick(report.invariants, 'INV-SCHEMA')).toMatchObject({ status: 'fail', violations: violation('json-schema check(s) c9 failed') });
    expect(pick(report.invariants, 'INV-EMAIL')).toMatchObject({ status: 'fail', violations: violation('email_send was called 1 time(s)') });
    expect(pick(report.invariants, 'INV-BUDGET')).toMatchObject({ status: 'fail', violations: [{ scenario: '*', run: null, detail: 'the run took 61.7 min, above budget.local_minutes_max 60' }] });
    expect(report.verdict_input.all_inv_pass).toBe(false);
    const nothingRan = buildReport(outcome({ ...result, component: { status: 'skipped', scenarios: [], duration_seconds: 0, note: 'not run: L0 is red' } }));
    expect(pick(nothingRan.invariants, 'INV-FS')).toEqual({ status: 'not_run', violations: [], note: INVARIANT_NO_RUN });
  });

  it('judges the injection invariant on the runs on an adversarial dataset and the budget on the remote runs', () => {
    const adversarial = scenario({ id: 'inj', level: 'e2e_remote', run: RUN_3, covers: [], dataset: 'adversarial-links', datasets: ['adversarial-links'], usd: 1.5, facts: { ...NO_FACTS, text_absent_failed: ['no-leak'] } });
    const result = outcome({
      ...NONE,
      declared: { acceptance: [], invariants: [declared('INV-INJECTION', 'component'), declared('INV-BUDGET', 'component')], indicators: [], dropped: [] },
      e2e_remote: { status: 'pass', scenarios: [adversarial, scenario({ id: 'other', level: 'e2e_remote', run: RUN_3, covers: [], usd: 0.75 })], duration_seconds: 20, note: '', provider: 'api.example.com', model: 'big', usd: 2.25 },
      planned: [],
    });
    const report = buildReport(result);
    expect(pick(report.invariants, 'INV-INJECTION')).toMatchObject({ status: 'fail', violations: [{ scenario: 'inj', run: RUN_3, detail: 'on adversarial-links, text-absent check(s) no-leak failed' }] });
    expect(pick(report.invariants, 'INV-BUDGET')).toMatchObject({ status: 'fail', violations: [{ scenario: '*', detail: 'the remote runs cost 2.2500 USD together, above budget.remote_usd_max 2' }] });
    expect(report.cost.usd_estimated).toBe(2.25);
  });

  it('computes an indicator as the mean of its measure over the runs that name it, against the declared threshold and direction', () => {
    const measured = (id: string, iteration: number, seconds: number, status: 'pass' | 'fail' = 'pass'): ScenarioResult =>
      scenario({ id, level: 'e2e_local', iteration, run: RUN_3, status, covers: [], duration_seconds: seconds, usd: null, indicators: [{ id: 'IND-01', measure: 'duration_seconds' }, { id: 'IND-02', measure: 'pass_rate' }, { id: 'IND-04', measure: 'usd' }, { id: 'IND-05', measure: 'judge:J-01' }] });
    const result = outcome({
      ...NONE,
      declared: { acceptance: [], invariants: [], indicators: [indicator('IND-01', 30, '<='), indicator('IND-02', 60), indicator('IND-03', 1), indicator('IND-04', 1, '<='), indicator('IND-05', 0.7), indicator('IND-06', 1, null)], dropped: [] },
      e2e_local: { status: 'pass', scenarios: [measured('s', 1, 20), measured('s', 2, 50, 'fail'), measured('s', 3, 20)], duration_seconds: 90, note: '', model: 'qwen3:8b', repeat: 3, passAt: 2 },
      planned: [],
    });
    const report = buildReport(result);
    expect(report.indicators).toEqual({
      'IND-01': { value: 30, threshold: 30, status: 'pass', measure: 'duration_seconds', note: 'duration_seconds <= 30 over 3 run(s)' },
      'IND-02': { value: 66.6667, threshold: 60, status: 'pass', measure: 'pass_rate', note: 'pass_rate >= 60 over 3 run(s)' },
      'IND-03': { value: null, threshold: 1, status: 'not_run', measure: null, note: INDICATOR_NOT_MEASURED },
      'IND-04': { value: null, threshold: 1, status: 'not_run', measure: 'usd', note: 'not run: the cost of a run is unknown — the profile has no price in bench.config.json' },
      'IND-05': { value: null, threshold: 0.7, status: 'not_run', measure: 'judge:J-01', note: judgePendingNote('J-01') },
      'IND-06': { value: null, threshold: 1, status: 'not_run', measure: null, note: INDICATOR_NOT_MEASURED },
    });
    expect(report.verdict_input.indicators_in_range).toBe(false);
    const tight = buildReport(outcome({ ...result, declared: { acceptance: [], invariants: [], indicators: [indicator('IND-01', 25, '<=')], dropped: [] } }));
    expect(pick(tight.indicators, 'IND-01')).toMatchObject({ value: 30, status: 'fail' });
    const undeclared = buildReport(outcome({ ...result, declared: { acceptance: [], invariants: [], indicators: [], dropped: [] } }));
    expect(pick(undeclared.indicators, 'IND-01')).toMatchObject({ value: 30, threshold: null, status: 'not_run', note: 'not run: not declared in TEAM.md — nothing says what value is in range' });
  });

  it('lists a declared or covered indicator nothing measures as not run, and keeps indicators_in_range false', () => {
    const report = buildReport(outcome());
    const notMeasured = { value: null, status: 'not_run', measure: null, note: INDICATOR_NOT_MEASURED };
    expect(report.indicators).toEqual({ 'IND-01': { ...notMeasured, threshold: 100 }, 'IND-02': { ...notMeasured, threshold: null }, 'IND-03': { ...notMeasured, threshold: null } });
    const declaredOnly = buildReport(outcome({ ...PROVEN, declared: { acceptance: [declared('AC-01', 'component')], invariants: [], indicators: [indicator('IND-01', 100)], dropped: [] } }));
    expect(declaredOnly.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: false });
  });

  it('leaves out an id TEAM.md dropped, even when a scenario still covers it, and says so', () => {
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
      'AC-07 is dropped in TEAM.md and still covered by ac-07-quality, ac-01-digest: it is left out of the report — take it out of `covers`',
      'INV-FS is dropped in TEAM.md and still covered by ac-01-digest: it is left out of the report — take it out of `covers`',
      'IND-03 is dropped in TEAM.md and still covered by ac-07-quality: it is left out of the report — take it out of `covers`',
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
    expect(acceptanceWarnings(result)).toEqual(['AC-01: not declared in TEAM.md: nothing says at which level it is proven']);
    const violation = [{ scenario: 'inv-tools-script', run: RUN_2, detail: 'inv-tools-script covers it and failed: check(s) c1 failed' }];
    expect(report.invariants).toEqual({
      'INV-FS': { status: 'fail', violations: violation, note: 'checked on every run: the read-only mount points hold after the run what they held before' },
      'INV-TOOLS': { status: 'fail', violations: violation, note: 'checked on every run: every tool called is one of the catalogue' },
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

  it('measures each end-to-end scenario against pass_at_k: its passing runs out of its runs, in the report, REPORT.md and one line', () => {
    const run = (id: string, iteration: number, status: 'pass' | 'fail'): ScenarioResult => scenario({ id, level: 'e2e_local', run: RUN_3, iteration, status, model: 'qwen3:8b', usd: null, covers: [] });
    const scenarios = [run('nominal', 1, 'pass'), run('nominal', 2, 'pass'), run('nominal', 3, 'pass'), run('drafts', 1, 'fail'), run('drafts', 2, 'fail'), run('drafts', 3, 'fail'), run('flaky', 1, 'fail'), run('flaky', 2, 'pass'), run('flaky', 3, 'pass'), scenario({ id: 'unrun', level: 'e2e_local', run: null, status: 'fail' })];
    expect(passCounts(scenarios)).toEqual({ nominal: '3/3', drafts: '0/3', flaky: '2/3' });
    const result = outcome({ requested: 'e2e_local', e2e_local: { status: 'fail', scenarios, duration_seconds: 90, note: '', model: 'qwen3:8b', repeat: 3, passAt: 2 } });
    const report = buildReport(result);
    expect(report.levels.e2e_local).toMatchObject({ pass_at_k: '2/3', pass_counts: { nominal: '3/3', drafts: '0/3', flaky: '2/3' } });
    expect(passCountsLine(report.levels.e2e_local)).toBe('pass@k 2/3: 2 of 3 scenario(s) — nominal 3/3, drafts 0/3, flaky 2/3');
    const markdown = renderReportMarkdown(report, result);
    expect(markdown).toContain('— 2 of 3 scenario(s) at pass@k 2/3 on qwen3:8b |');
    expect(markdown).toContain('| flaky | pass (2/3) | — |');
    expect(markdown).toContain('| drafts | fail (0/3) | — |');
  });

  it('reads a scenario that ran fewer times than k as reaching the rule when every run passed, and an older report without pass_counts as nothing to say', () => {
    expect(passCountsLine({ pass_at_k: '2/3', pass_counts: { once: '1/1', never: '0/1' } })).toBe('pass@k 2/3: 1 of 2 scenario(s) — once 1/1, never 0/1');
    expect(passCountsLine({ pass_at_k: '2/3' })).toBe('');
    const report = buildReport(outcome());
    expect(() => parseReport({ ...report, levels: { ...report.levels, e2e_local: { ...report.levels.e2e_local, pass_counts: { s: 'three' } } } })).toThrow(/j\/n/);
    const { pass_counts: _dropped, ...older } = report.levels.e2e_local;
    expect(parseReport({ ...report, levels: { ...report.levels, e2e_local: older } }).levels.e2e_local.pass_counts).toBeUndefined();
  });

  it('reports the end-to-end levels: pass_at_k, the model, the runs and the remote cost', () => {
    const local = scenario({ id: 'e2e-01', level: 'e2e_local', run: RUN_3, model: 'qwen3:8b', usd: null, covers: ['AC-03'] });
    const remote = scenario({ id: 'e2e-01', level: 'e2e_remote', run: RUN_3, model: 'big', usd: 0.012, covers: [] });
    const result = outcome({
      requested: 'e2e_remote',
      e2e_local: { status: 'pass', scenarios: [local, { ...local, iteration: 2 }], duration_seconds: 40, note: '', model: 'qwen3:8b', repeat: 2, passAt: 1 },
      e2e_remote: { status: 'pass', scenarios: [remote], duration_seconds: 30, note: '', provider: 'api.example.com', model: 'big', usd: 0.012 },
    });
    const report = buildReport(result);
    expect(report.levels.e2e_local).toMatchObject({ status: 'pass', model: 'qwen3:8b', runs: 2, pass_at_k: '1/2', pass_counts: { 'e2e-01': '2/2' } });
    expect(report.levels.e2e_remote).toMatchObject({ status: 'pass', provider: 'api.example.com', model: 'big', runs: 1, usd: 0.012 });
    expect(pick(report.acceptance, 'AC-03')).toEqual({ status: 'pass', level: 'e2e_local', evidence: 'e2e-01 (RUN-20260930-1913-machine)' });
    expect(report.cost.usd_estimated).toBe(0.012);
    const markdown = renderReportMarkdown(report, result);
    expect(markdown).toContain('| e2e_local | pass | 2 run(s): 2 pass, 0 fail — 1 of 1 scenario(s) at pass@k 1/2 on qwen3:8b | 40 |');
    expect(markdown).toContain('| e2e_remote | pass | 1 run(s): 1 pass, 0 fail — 0.0120 USD on big | 30 |');
    expect(markdown).toContain('| Scenario | Local | Remote |\n|---|---|---|\n| e2e-01 | pass (2/2) | pass (1/1) |');
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

describe('citedRuns', () => {
  it('lists the runs of the scenarios, then those of the report it replaced, once each', () => {
    const report = buildReport(outcome());
    const scenarioRuns = citedRuns(report);
    expect(scenarioRuns).toEqual(['RUN-20260930-1912-stub']);
    const replacing = { ...report, metadata: { ...report.metadata, replaces: { date: 'x', reached: 'component', runs: ['RUN-20260929-0800-stub', 'RUN-20260930-1912-stub', 7] } } };
    expect(citedRuns(replacing)).toEqual(['RUN-20260930-1912-stub', 'RUN-20260929-0800-stub']);
    expect(citedRuns({ ...report, metadata: { ...report.metadata, replaces: null } })).toEqual(scenarioRuns);
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
    expect(markdown).toContain('| unit | skipped | skipped: no tests/notes-digest/unit folder | 0 |');
    expect(markdown).toContain('| component | pass | 1 scenario(s): 1 pass, 0 fail | 1.7 |');
    expect(markdown).toContain('| AC-01 | pass | component | ac-01-digest (RUN-20260930-1912-stub) |');
    expect(markdown).toContain('| Id | Value | Threshold | Status |\n|---|---|---|---|\n| none |  |  |  |');
    expect(markdown).toContain('| Id | Status | Violations |\n|---|---|---|\n| none |  |  |');
    expect(markdown).toContain('| Scenario | Local | Remote |\n|---|---|---|\n| none |  |  |');
    expect(markdown).toContain('| 100 | 10 | 0 | 2.8 | 2 | 0 | 0 |');
    expect(markdown).toContain('| true | true | true |');
  });

  it('puts what fails first, then what did not run and so is not proven', () => {
    const result = outcome({
      static: { status: 'fail', checks: [{ id: 'launchers', status: 'fail', detail: 'run.sh not in step' }], duration_seconds: 0.2, note: '' },
      unit: { status: 'fail', passed: 3, failed: 1, duration_seconds: 2, note: '4 tests, 1 failed' },
      component: { status: 'fail', scenarios: [FAILED], duration_seconds: 2, note: '' },
      declared: { acceptance: [declared('AC-02', 'component'), declared('AC-03', 'e2e_local')], invariants: [declared('INV-RESUME', 'component')], indicators: [indicator('IND-01', 100)], dropped: [] },
      planned: [],
    });
    const markdown = renderReportMarkdown(buildReport(result), result);
    const fails = markdown.slice(markdown.indexOf('## What fails'), markdown.indexOf('## Levels'));
    expect(fails.split('\n').filter((line) => line !== '')).toEqual([
      '## What fails',
      '- static check `launchers` — run.sh not in step',
      '- L1 — 4 tests, 1 failed',
      '- scenario `inv-tools-script` (RUN-20260930-1912-stub-2), check `c1` — /reports/x.md | does not exist',
      '- AC-02 — fail — failed: inv-tools-script (RUN-20260930-1912-stub-2)',
      '- INV-FS — fail — 1 violation(s)',
      '- INV-TOOLS — fail — 1 violation(s)',
      'Not run, so not proven:',
      '- AC-03 — requires L3 (e2e_local), which did not run',
      `- INV-RESUME — ${INVARIANT_NOT_COVERED}`,
      `- IND-01 — ${INDICATOR_NOT_MEASURED}`,
    ]);
    expect(markdown).toContain('| unit | fail | 4 tests, 1 failed | 2 |');
    expect(markdown).toContain('| component | fail | 1 scenario(s): 0 pass, 1 fail | 2 |');
    expect(markdown).toContain('| IND-01 |  | 100 | not_run |');
    expect(markdown).toContain('| INV-RESUME | not_run | 0 |');
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

describe('decision failure classes', () => {
  const BLOCKED = scenario({ id: 'ac-17-guard', status: 'fail', run: RUN_3, failure_class: 'decision_blocked', failure_detail: "Blocked by the decision stage 'guard'", checks: [{ id: 'run', type: 'run-succeeded', status: 'fail', detail: 'exit 2' }] });
  const DOWN = scenario({ id: 'ac-18-route', status: 'fail', run: RUN_3, failure_class: 'decision_provider', failure_cause: 'unreachable', failure_detail: 'kev could not be reached', checks: [] });
  const KEY = scenario({ id: 'ac-19-key', status: 'fail', run: RUN_3, failure_class: 'decision_provider', failure_cause: 'key', failure_detail: 'typesafe refused the key', checks: [] });

  it('classes failed runs: team unless the run says otherwise, none for a run that passed', () => {
    expect(failureClassOf(scenario())).toBeNull();
    expect(failureClassOf(FAILED)).toBe('team');
    expect(failureClassOf(BLOCKED)).toBe('decision_blocked');
    expect(failureClassCounts([FAILED, BLOCKED, DOWN, DOWN, scenario()])).toEqual([
      { class: 'team', runs: 1 },
      { class: 'decision_blocked', runs: 1 },
      { class: 'decision_provider', runs: 2 },
    ]);
  });

  it('says in What fails which runs a decision blocked and which a provider failed', () => {
    const result = outcome({ component: { status: 'fail', scenarios: [FAILED, BLOCKED, DOWN], duration_seconds: 2, note: '' }, planned: [] });
    const markdown = renderReportMarkdown(buildReport(result), result);
    const fails = markdown.slice(markdown.indexOf('## What fails'), markdown.indexOf('## Levels'));
    expect(fails).toContain('- failed runs by class: team 1, decision_blocked 1, decision_provider 1');
    expect(fails).toContain("- scenario `ac-17-guard` (RUN-20260930-1913-machine) — decision_blocked, not an ordinary failure: a decision stage blocked a model call — read the stage and the risk against the input before the crew: Blocked by the decision stage 'guard'");
    expect(fails).toContain('- scenario `ac-18-route` (RUN-20260930-1913-machine) — decision_provider, not a team defect: the decision provider did not answer (unreachable, timed out, 429 or 5xx) — run again once it answers: kev could not be reached');
  });

  it('tells a refused key from a provider down, and a mixed run is the team\'s', () => {
    const MIXED = scenario({ id: 'ac-20-mixed', status: 'fail', run: RUN_3, failure_class: 'team', failure_detail: 'a team failure next to decision failures', checks: [] });
    const result = outcome({ component: { status: 'fail', scenarios: [KEY, MIXED], duration_seconds: 2, note: '' }, planned: [] });
    const markdown = renderReportMarkdown(buildReport(result), result);
    expect(markdown).toContain('- scenario `ac-19-key` (RUN-20260930-1913-machine) — decision_provider, not a team defect: the decision provider refused or lacks its key (401/403) — correct the key variable, then run again: typesafe refused the key');
    expect(markdown).toContain('- scenario `ac-20-mixed` (RUN-20260930-1913-machine) — team, though a decision failed beside it: correct the team first: a team failure next to decision failures');
    expect(markdown).toContain('- failed runs by class: team 1, decision_provider 1');
    expect(failureClassOf(MIXED)).toBe('team');
  });

  it('adds no class line when every failure is the team\'s', () => {
    const result = outcome({ component: { status: 'fail', scenarios: [FAILED], duration_seconds: 2, note: '' }, planned: [] });
    expect(renderReportMarkdown(buildReport(result), result)).not.toContain('failed runs by class');
  });
});
