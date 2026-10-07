import type { DeclaredIds } from './acceptance.js';
import { LEVELS, type Level } from './bench-config.js';
import { ID_PATTERNS, type AttemptId, type RunId } from './ids.js';
import { REPORT_SCHEMA_VERSION, parseReport, type Report } from './report.js';
import { LEVEL_LABELS } from './run.js';
import type { CheckResult } from './scenario-checks.js';
import { computeVerdictInput } from './verdict.js';

export type LevelStatus = 'pass' | 'fail' | 'skipped';

/** One static check of L0: `skipped` when what it needs is not there, with the reason. */
export interface StaticCheck {
  readonly id: string;
  readonly status: LevelStatus;
  readonly detail: string;
}

/** A scenario that ran, as `report.json` lists it under its level. */
export interface ScenarioResult {
  readonly id: string;
  readonly title: string;
  /** Relative to `tests/<slug>/`. */
  readonly file: string;
  readonly status: 'pass' | 'fail';
  readonly covers: readonly string[];
  /** Null when the scenario failed before `orkeon run` started. */
  readonly run: RunId | null;
  readonly dataset: string | null;
  readonly exit_code: number | null;
  readonly duration_seconds: number;
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly tool_calls: number;
  readonly human_inputs: number;
  readonly checks: readonly CheckResult[];
}

/** A scenario of the tests, run or not: what it covers decides where a criterion is expected. */
export interface PlannedScenario {
  readonly id: string;
  readonly level: Level;
  readonly covers: readonly string[];
}

export interface LevelOutcome {
  readonly status: LevelStatus;
  readonly duration_seconds: number;
  /** Why the level is skipped, or what it leaves out. */
  readonly note: string;
}

/** What is known of the report an attempt held before this run. */
export interface ReplacedReport {
  readonly date: string;
  /** The highest level that report ran; null when it ran none. */
  readonly reached: Level | null;
  /** The runs it rested on: their folders still hold its evidence. */
  readonly runs: readonly string[];
}

/** The highest level a report ran (neither skipped nor absent), and the runs of its scenarios. */
export function replacedReport(previous: Report): ReplacedReport {
  const ran = LEVELS.filter((level) => previous.levels[level].status !== 'skipped');
  const scenarios = [...previous.levels.component.scenarios, ...previous.levels.e2e_local.scenarios, ...previous.levels.e2e_remote.scenarios];
  const runs = scenarios.flatMap((scenario) => {
    const run = typeof scenario === 'object' && scenario !== null ? (scenario as { run?: unknown }).run : undefined;
    return typeof run === 'string' ? [run] : [];
  });
  return { date: previous.metadata.date, reached: ran[ran.length - 1] ?? null, runs };
}

/** True when the run that writes a report reaches lower than the report it replaces. */
export function replacesHigherLevel(requested: Level, replaced: ReplacedReport | null): boolean {
  return replaced !== null && replaced.reached !== null && LEVELS.indexOf(replaced.reached) > LEVELS.indexOf(requested);
}

export interface RunOutcome {
  readonly team: string;
  readonly attempt: AttemptId;
  readonly date: Date;
  readonly orkeonVersion: string;
  readonly benchVersion: string;
  readonly static: LevelOutcome & { readonly checks: readonly StaticCheck[] };
  readonly unit: LevelOutcome;
  readonly component: LevelOutcome & { readonly scenarios: readonly ScenarioResult[] };
  /** Why L3 and L4 did not run. */
  readonly e2eNote: string;
  /** The level the run was asked to reach (`--level`). */
  readonly requested: Level;
  /** The report this one replaces in the attempt, when an earlier run left one. */
  readonly replaces: ReplacedReport | null;
  /** What `ACCEPTANCE.md` declares; null when the workbook has none yet. */
  readonly declared: DeclaredIds | null;
  /** Every readable scenario of `tests/<slug>/component` and `e2e`. */
  readonly planned: readonly PlannedScenario[];
  readonly wallSeconds: number;
}

/** Fail when any part fails, pass when at least one passed, skipped when nothing ran. */
export function levelStatus(parts: readonly { readonly status: LevelStatus }[]): LevelStatus {
  if (parts.some((part) => part.status === 'fail')) {
    return 'fail';
  }
  return parts.some((part) => part.status === 'pass') ? 'pass' : 'skipped';
}

/** Said of an invariant no check of the bench proves yet. */
export const INVARIANT_NOT_CHECKED = 'not checked: no check of this invariant exists in this version of the bench, and a green scenario that lists it in `covers` does not prove it';
/** Said of an indicator the run does not compute. */
export const INDICATOR_NOT_COMPUTED = 'not computed: indicators come with `orkeon-bench evaluate`';

type Criterion = { status: 'pass' | 'fail' | 'not_run'; level: Level; evidence: string };

/**
 * `report.json` (schema 1.0, plan § 5.7) for a run of L0 to L2. Nothing in it passes by default:
 * - a criterion passes only when `ACCEPTANCE.md` declares it at a level the bench can read and a
 *   scenario of that level, which ran green, covers it — otherwise it is `not_run` (or `fail`, on a
 *   failed scenario that covers it);
 * - an invariant never passes: none has a check of its own in this version (plan § 6.7), so a
 *   declared or covered one is `not_run`, `fail` on a failed scenario that covers it;
 * - a declared indicator is `not_run`: this version computes none.
 */
export function buildReport(outcome: RunOutcome): Report {
  const levels = {
    static: { status: outcome.static.status, checks: [...outcome.static.checks], duration_seconds: outcome.static.duration_seconds, note: outcome.static.note },
    unit: { status: outcome.unit.status, passed: 0, failed: 0, duration_seconds: outcome.unit.duration_seconds, note: outcome.unit.note },
    component: {
      status: outcome.component.status,
      scenarios: [...outcome.component.scenarios],
      duration_seconds: outcome.component.duration_seconds,
      note: outcome.component.note,
    },
    e2e_local: { status: 'skipped', model: '', runs: 0, pass_at_k: '0/0', scenarios: [], duration_seconds: 0, note: outcome.e2eNote },
    e2e_remote: { status: 'skipped', provider: '', model: '', runs: 0, scenarios: [], duration_seconds: 0, usd: 0, note: outcome.e2eNote },
  };
  const ran = outcome.component.scenarios;
  const sum = (pick: (scenario: ScenarioResult) => number): number => ran.reduce((total, scenario) => total + pick(scenario), 0);
  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    metadata: {
      team: outcome.team,
      attempt: outcome.attempt,
      date: outcome.date.toISOString(),
      orkeon_version: outcome.orkeonVersion,
      bench_version: outcome.benchVersion,
      requested_level: outcome.requested,
      replaces: outcome.replaces,
    },
    levels,
    acceptance: Object.fromEntries(judgeAcceptance(outcome).map(({ id, criterion }) => [id, criterion])),
    indicators: indicatorsOf(outcome),
    invariants: invariantsOf(outcome),
    judges: {},
    cost: {
      tokens_in: sum((scenario) => scenario.tokens_in),
      tokens_out: sum((scenario) => scenario.tokens_out),
      usd_estimated: 0,
      wall_seconds: outcome.wallSeconds,
      tool_calls: sum((scenario) => scenario.tool_calls),
      retries: 0,
      human_inputs: sum((scenario) => scenario.human_inputs),
    },
    verdict_input: { all_ac_pass: false, all_inv_pass: false, indicators_in_range: false },
  };
  // The verdict input is computed on the report as its parser reads it, then written into it.
  return { ...report, verdict_input: computeVerdictInput(parseReport(report)) } as Report;
}

/** What a report cannot say in a status: the criteria it could not place, each with the reason. */
export function acceptanceWarnings(outcome: RunOutcome): string[] {
  return [...judgeAcceptance(outcome).flatMap(({ warning }) => (warning === null ? [] : [warning])), ...droppedWarnings(outcome)];
}

/** Every scenario of the tests, the ones that ran among them whatever the list of the planned ones says. */
function plannedOf(outcome: RunOutcome): PlannedScenario[] {
  const ran = outcome.component.scenarios.map((scenario) => ({ id: scenario.id, level: 'component' as const, covers: scenario.covers }));
  return [...outcome.planned.filter((planned) => !ran.some((scenario) => scenario.id === planned.id && planned.level === 'component')), ...ran];
}

/** The ids of one family a report lists: the declared ones and those the scenarios cover, less the ones `ACCEPTANCE.md` dropped. */
function idsOf(pattern: RegExp, declared: readonly string[], outcome: RunOutcome): string[] {
  const dropped = outcome.declared?.dropped ?? [];
  const covered = plannedOf(outcome).flatMap((scenario) => scenario.covers.filter((id) => pattern.test(id)));
  return [...new Set([...declared, ...covered])].filter((id) => !dropped.includes(id)).sort();
}

/** One warning per dropped id a scenario still covers: the scenario is out of step with `ACCEPTANCE.md`, the report is not. */
function droppedWarnings(outcome: RunOutcome): string[] {
  const planned = plannedOf(outcome);
  return (outcome.declared?.dropped ?? []).flatMap((id) => {
    const covering = planned.filter((scenario) => scenario.covers.includes(id)).map((scenario) => scenario.id);
    return covering.length === 0 ? [] : [`${id} is dropped in ACCEPTANCE.md and still covered by ${covering.join(', ')}: it is left out of the report — take it out of \`covers\``];
  });
}

function judgeAcceptance(outcome: RunOutcome): { id: string; criterion: Criterion; warning: string | null }[] {
  const ran = outcome.component.scenarios;
  const planned = plannedOf(outcome);
  const statusOf: Readonly<Record<Level, LevelStatus>> = {
    static: outcome.static.status,
    unit: outcome.unit.status,
    component: outcome.component.status,
    e2e_local: 'skipped',
    e2e_remote: 'skipped',
  };
  const cite = (scenarios: readonly ScenarioResult[]): string => scenarios.map((scenario) => `${scenario.id}${scenario.run === null ? '' : ` (${scenario.run})`}`).join(', ');
  return idsOf(ID_PATTERNS.AC, (outcome.declared?.acceptance ?? []).map((declared) => declared.id), outcome).map((id) => {
    const declared = outcome.declared?.acceptance.find((candidate) => candidate.id === id) ?? null;
    const covering = ran.filter((scenario) => scenario.covers.includes(id));
    const failed = covering.filter((scenario) => scenario.status === 'fail');
    // Where the criterion is reported when nothing readable declares its level: never below the scenarios that cover it.
    const fallback = highestLevel(planned.filter((scenario) => scenario.covers.includes(id)).map((scenario) => scenario.level));
    let undeclared: string | null = null;
    if (outcome.declared === null) {
      undeclared = 'ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at';
    } else if (declared === null) {
      undeclared = 'not declared in ACCEPTANCE.md: nothing says at which level it is proven';
    } else if (declared.level === null) {
      undeclared = `ACCEPTANCE.md gives no level the bench can read for it ("${declared.levelCell}"): write one of L0 to L4`;
    }
    const level = declared?.level ?? (declared === null ? fallback : 'e2e_remote');
    if (failed.length > 0) {
      return { id, criterion: { status: 'fail', level, evidence: `failed: ${cite(failed)}` }, warning: undeclared === null ? null : `${id}: ${undeclared}` };
    }
    if (undeclared !== null) {
      return { id, criterion: { status: 'not_run', level, evidence: undeclared }, warning: `${id} is not proven: ${undeclared}` };
    }
    if (level === 'component' && covering.length > 0) {
      return { id, criterion: { status: 'pass', level, evidence: cite(covering) }, warning: null };
    }
    const evidence = statusOf[level] === 'skipped' ? `requires ${LEVEL_LABELS[level]} (${level}), which did not run` : `no ${LEVEL_LABELS[level]} scenario that ran covers it`;
    return { id, criterion: { status: 'not_run', level, evidence }, warning: null };
  });
}

/**
 * The level a criterion nothing declares is reported at: the highest level of the scenarios that
 * cover it, and the local end-to-end level when none does.
 */
function highestLevel(levels: readonly Level[]): Level {
  const [first, ...others] = levels;
  if (first === undefined) {
    return 'e2e_local';
  }
  return others.reduce<Level>((highest, level) => (LEVELS.indexOf(level) > LEVELS.indexOf(highest) ? level : highest), first);
}

function invariantsOf(outcome: RunOutcome): Record<string, { status: 'fail' | 'not_run'; violations: unknown[]; note: string }> {
  const ran = outcome.component.scenarios;
  const ids = idsOf(ID_PATTERNS.INV, (outcome.declared?.invariants ?? []).map((declared) => declared.id), outcome);
  return Object.fromEntries(
    ids.map((id) => {
      const violations = ran
        .filter((scenario) => scenario.covers.includes(id) && scenario.status === 'fail')
        .map((scenario) => ({ scenario: scenario.id, run: scenario.run, failed_checks: failedChecks(scenario).map((check) => check.id) }));
      return [id, { status: violations.length === 0 ? ('not_run' as const) : ('fail' as const), violations, note: violations.length === 0 ? INVARIANT_NOT_CHECKED : 'a scenario that covers it failed' }];
    }),
  );
}

function indicatorsOf(outcome: RunOutcome): Record<string, { value: null; threshold: number | null; status: 'not_run'; note: string }> {
  const declared = outcome.declared?.indicators ?? [];
  const ids = idsOf(ID_PATTERNS.IND, declared.map((indicator) => indicator.id), outcome);
  return Object.fromEntries(
    ids.map((id) => [id, { value: null, threshold: declared.find((indicator) => indicator.id === id)?.threshold ?? null, status: 'not_run' as const, note: INDICATOR_NOT_COMPUTED }]),
  );
}

function failedChecks(scenario: ScenarioResult): CheckResult[] {
  return scenario.checks.filter((check) => check.status === 'fail');
}

/** The runs a report rests on, in the order they ran. */
export function reportRuns(scenarios: readonly ScenarioResult[]): RunId[] {
  return scenarios.flatMap((scenario) => (scenario.run === null ? [] : [scenario.run]));
}

/**
 * `REPORT.md`: the readable view of `report.json` (template `.claude/templates/REPORT.md`) — what
 * fails first, nothing stated that the JSON does not hold.
 */
export function renderReportMarkdown(report: Report, outcome: RunOutcome): string {
  const scenarios = outcome.component.scenarios;
  const runs = reportRuns(scenarios);
  const lines: string[] = [
    `# ${report.metadata.team} — Report ${report.metadata.attempt}`,
    '',
    `- Date: ${report.metadata.date}`,
    `- Orkeon: ${report.metadata.orkeon_version} · bench: ${report.metadata.bench_version}`,
    `- Runs: ${runs.length === 0 ? 'none' : runs.join(', ')}`,
    `- Asked for: --level ${LEVEL_LABELS[outcome.requested]}. The report of an attempt is that of its last run: this one replaces any earlier report of ${report.metadata.attempt}.`,
    ...(outcome.replaces === null ? [] : [`- Replaces: the report of ${outcome.replaces.date}, which reached ${outcome.replaces.reached === null ? 'no level' : LEVEL_LABELS[outcome.replaces.reached]}${outcome.replaces.runs.length === 0 ? '' : ` (its evidence stays in runs/${outcome.replaces.runs.join(', runs/')})`}`]),
    '',
    '## What fails',
    '',
    ...whatFails(report, outcome),
    '',
    '## Levels',
    '',
    '| Level | Status | Detail | Duration (s) |',
    '|---|---|---|---|',
    row(['static', outcome.static.status, detailOf(outcome.static.note, countByStatus(outcome.static.checks, 'check')), seconds(outcome.static.duration_seconds)]),
    row(['unit', outcome.unit.status, outcome.unit.note, seconds(outcome.unit.duration_seconds)]),
    row(['component', outcome.component.status, detailOf(outcome.component.note, countByStatus(scenarios, 'scenario')), seconds(outcome.component.duration_seconds)]),
    row(['e2e_local', 'skipped', outcome.e2eNote, '0']),
    row(['e2e_remote', 'skipped', outcome.e2eNote, '0']),
    '',
    '## Acceptance criteria',
    '',
    '| Id | Status | Level | Evidence |',
    '|---|---|---|---|',
    ...tableOrNone(Object.entries(report.acceptance).map(([id, criterion]) => row([id, criterion.status, criterion.level, criterion.evidence])), 4),
    '',
    '## Indicators',
    '',
    '| Id | Value | Threshold | Status |',
    '|---|---|---|---|',
    ...tableOrNone(Object.entries(report.indicators).map(([id, indicator]) => row([id, indicator.value === null ? '' : String(indicator.value), indicator.threshold === null ? '' : String(indicator.threshold), indicator.status])), 4),
    '',
    '## Invariants',
    '',
    '| Id | Status | Violations |',
    '|---|---|---|',
    ...tableOrNone(Object.entries(report.invariants).map(([id, invariant]) => row([id, invariant.status, String(invariant.violations.length)])), 3),
    '',
    '## Judges',
    '',
    '| Id | Rubric version | Judge model | Score | Threshold |',
    '|---|---|---|---|---|',
    ...tableOrNone(Object.entries(report.judges).map(([id, judge]) => row([id, judge.rubric_version, judge.judge_model, String(judge.score), String(judge.threshold)])), 5),
    '',
    '## Local and remote',
    '',
    '| Scenario | Local | Remote |',
    '|---|---|---|',
    ...tableOrNone([], 3),
    '',
    '## Cost',
    '',
    '| Tokens in | Tokens out | Estimated USD | Wall time (s) | Tool calls | Retries | Human inputs |',
    '|---|---|---|---|---|---|---|',
    row([report.cost.tokens_in, report.cost.tokens_out, report.cost.usd_estimated, seconds(report.cost.wall_seconds), report.cost.tool_calls, report.cost.retries, report.cost.human_inputs].map(String)),
    '',
    '## Verdict input',
    '',
    '| all_ac_pass | all_inv_pass | indicators_in_range |',
    '|---|---|---|',
    row([report.verdict_input.all_ac_pass, report.verdict_input.all_inv_pass, report.verdict_input.indicators_in_range].map(String)),
    '',
  ];
  return lines.join('\n');
}

function whatFails(report: Report, outcome: RunOutcome): string[] {
  const lines: string[] = [];
  for (const check of outcome.static.checks.filter((candidate) => candidate.status === 'fail')) {
    lines.push(`- static check \`${check.id}\` — ${check.detail}`);
  }
  for (const scenario of outcome.component.scenarios.filter((candidate) => candidate.status === 'fail')) {
    const where = scenario.run === null ? '' : ` (${scenario.run})`;
    for (const check of failedChecks(scenario)) {
      lines.push(`- scenario \`${scenario.id}\`${where}, check \`${check.id}\` — ${check.detail}`);
    }
  }
  for (const [id, criterion] of Object.entries(report.acceptance)) {
    if (criterion.status === 'fail') {
      lines.push(`- ${id} — fail — ${criterion.evidence}`);
    }
  }
  for (const [id, invariant] of Object.entries(report.invariants)) {
    if (invariant.status === 'fail') {
      lines.push(`- ${id} — fail — ${String(invariant.violations.length)} violation(s)`);
    }
  }
  if (outcome.component.status === 'fail' && outcome.component.note.length > 0) {
    lines.push(`- ${LEVEL_LABELS.component} — ${outcome.component.note}`);
  }
  const notRun = [
    ...Object.entries(report.acceptance).flatMap(([id, criterion]) => (criterion.status === 'not_run' ? [`- ${id} — ${criterion.evidence}`] : [])),
    ...Object.entries(report.invariants).flatMap(([id, invariant]) => (invariant.status === 'not_run' ? [`- ${id} — ${INVARIANT_NOT_CHECKED}`] : [])),
    ...Object.entries(report.indicators).flatMap(([id, indicator]) => (indicator.status === 'not_run' ? [`- ${id} — ${INDICATOR_NOT_COMPUTED}`] : [])),
  ];
  if (lines.length === 0) {
    lines.push('Nothing.');
  }
  if (notRun.length > 0) {
    lines.push('', 'Not run, so not proven:', '', ...notRun);
  }
  return lines;
}

function countByStatus(parts: readonly { readonly status: LevelStatus }[], noun: string): string {
  const count = (status: LevelStatus): number => parts.filter((part) => part.status === status).length;
  const skipped = count('skipped');
  return `${String(parts.length)} ${noun}(s): ${String(count('pass'))} pass, ${String(count('fail'))} fail${skipped > 0 ? `, ${String(skipped)} skipped` : ''}`;
}

function detailOf(note: string, counts: string): string {
  return note.length > 0 ? note : counts;
}

function tableOrNone(rows: readonly string[], columns: number): string[] {
  return rows.length > 0 ? [...rows] : [row(['none', ...Array.from({ length: columns - 1 }, () => '')])];
}

function row(cells: readonly string[]): string {
  return `| ${cells.map((cell) => cell.replaceAll('|', '\\|').replaceAll(/\s+/g, ' ').trim()).join(' | ')} |`;
}

function seconds(value: number): string {
  return String(Math.round(value * 10) / 10);
}
