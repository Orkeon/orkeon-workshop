import type { DeclaredIds } from './acceptance.js';
import { LEVELS, type Level } from './bench-config.js';
import { ID_PATTERNS, type AttemptId, type RunId } from './ids.js';
import { evaluateIndicators } from './indicators.js';
import { judgeInRange } from './judgements.js';
import { evaluateInvariants, scenarioKey, type EffectiveStatus } from './invariants.js';
import { REPORT_SCHEMA_VERSION, parseReport, type Report } from './report.js';
import { LEVEL_LABELS } from './run.js';
import type { CheckResult } from './scenario-checks.js';
import type { LevelStatus, ScenarioResult, StaticCheck } from './scenario-result.js';
import { computeVerdictInput, failureClassCounts } from './verdict.js';

export type { LevelStatus, ScenarioFacts, ScenarioResult, StaticCheck } from './scenario-result.js';
export { NO_FACTS } from './scenario-result.js';

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
  readonly unit: LevelOutcome & { readonly passed: number; readonly failed: number };
  readonly component: LevelOutcome & { readonly scenarios: readonly ScenarioResult[] };
  readonly e2e_local: LevelOutcome & {
    readonly scenarios: readonly ScenarioResult[];
    readonly model: string;
    /** How many times each scenario ran, and how many of its runs must pass. */
    readonly repeat: number;
    readonly passAt: number;
  };
  readonly e2e_remote: LevelOutcome & { readonly scenarios: readonly ScenarioResult[]; readonly provider: string; readonly model: string; readonly usd: number };
  /** `budget` of the bench configuration, for `INV-BUDGET`. */
  readonly budget: { readonly remote_usd_max: number; readonly local_minutes_max: number };
  /** The level the run was asked to reach (`--level`). */
  readonly requested: Level;
  /** The report this one replaces in the attempt, when an earlier run left one. */
  readonly replaces: ReplacedReport | null;
  /** What `TEAM.md` declares; null when the workbook has none yet. */
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

/**
 * Whether each scenario passes at its level, its iterations together: at L3 when at least
 * `passAt` of its `repeat` runs passed, elsewhere when every run passed. One entry per
 * `scenarioKey`.
 */
export function effectiveStatuses(outcome: RunOutcome): EffectiveStatus {
  const statuses = new Map<string, 'pass' | 'fail'>();
  const groups = new Map<string, ScenarioResult[]>();
  for (const scenario of allScenarios(outcome)) {
    const key = scenarioKey(scenario);
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }
  for (const [key, runs] of groups) {
    const passed = runs.filter((run) => run.status === 'pass').length;
    const needed = runs[0]?.level === 'e2e_local' ? Math.min(outcome.e2e_local.passAt, runs.length) : runs.length;
    statuses.set(key, passed >= needed ? 'pass' : 'fail');
  }
  return statuses;
}

/** The status of a level from the effective status of its scenarios: fail when one fails, pass when one passes, skipped when none ran. */
export function scenarioLevelStatus(scenarios: readonly ScenarioResult[], effective: EffectiveStatus): LevelStatus {
  const statuses = [...new Set(scenarios.map(scenarioKey))].map((key) => ({ status: effective.get(key) ?? 'fail' }));
  return levelStatus(statuses);
}

type Criterion = { status: 'pass' | 'fail' | 'not_run'; level: Level; evidence: string };

/**
 * `report.json` (schema 1.0, plan § 5.7). Nothing in it passes by default:
 * - a criterion passes only when `TEAM.md` declares it at a level the bench can read and every
 *   scenario of that level that covers it passed — otherwise it is `not_run` (or `fail`, on a
 *   failed scenario that covers it);
 * - an invariant passes by its archive rule, or by the scenarios that cover it (`evaluateInvariants`);
 * - an indicator passes when the mean of its measure over the runs meets the threshold and the
 *   direction `TEAM.md` declares (`evaluateIndicators`); a judged one waits for `evaluate`.
 */
export function buildReport(outcome: RunOutcome): Report {
  const scenarios = allScenarios(outcome);
  const effective = effectiveStatuses(outcome);
  const levels = {
    static: { status: outcome.static.status, checks: [...outcome.static.checks], duration_seconds: outcome.static.duration_seconds, note: outcome.static.note },
    unit: { status: outcome.unit.status, passed: outcome.unit.passed, failed: outcome.unit.failed, duration_seconds: outcome.unit.duration_seconds, note: outcome.unit.note },
    component: {
      status: outcome.component.status,
      scenarios: [...outcome.component.scenarios],
      duration_seconds: outcome.component.duration_seconds,
      note: outcome.component.note,
    },
    e2e_local: {
      status: outcome.e2e_local.status,
      model: outcome.e2e_local.model,
      runs: runsOf(outcome.e2e_local.scenarios),
      pass_at_k: `${String(outcome.e2e_local.passAt)}/${String(outcome.e2e_local.repeat)}`,
      pass_counts: passCounts(outcome.e2e_local.scenarios),
      scenarios: [...outcome.e2e_local.scenarios],
      duration_seconds: outcome.e2e_local.duration_seconds,
      note: outcome.e2e_local.note,
    },
    e2e_remote: {
      status: outcome.e2e_remote.status,
      provider: outcome.e2e_remote.provider,
      model: outcome.e2e_remote.model,
      runs: runsOf(outcome.e2e_remote.scenarios),
      scenarios: [...outcome.e2e_remote.scenarios],
      duration_seconds: outcome.e2e_remote.duration_seconds,
      usd: outcome.e2e_remote.usd,
      note: outcome.e2e_remote.note,
    },
  };
  const sum = (pick: (scenario: ScenarioResult) => number): number => scenarios.reduce((total, scenario) => total + pick(scenario), 0);
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
    acceptance: Object.fromEntries(judgeAcceptance(outcome, effective).map(({ id, criterion }) => [id, criterion])),
    indicators: evaluateIndicators(idsOf(ID_PATTERNS.IND, (outcome.declared?.indicators ?? []).map((indicator) => indicator.id), outcome), outcome.declared?.indicators ?? [], scenarios, (outcome.declared?.decisionProviders ?? []).length > 0),
    invariants: evaluateInvariants(idsOf(ID_PATTERNS.INV, (outcome.declared?.invariants ?? []).map((declared) => declared.id), outcome), scenarios, effective, {
      remoteUsdMax: outcome.budget.remote_usd_max,
      localMinutesMax: outcome.budget.local_minutes_max,
      wallSeconds: outcome.wallSeconds,
    }),
    judges: {},
    cost: {
      tokens_in: sum((scenario) => scenario.tokens_in),
      tokens_out: sum((scenario) => scenario.tokens_out),
      usd_estimated: Math.round(sum((scenario) => scenario.usd ?? 0) * 1_000_000) / 1_000_000,
      wall_seconds: outcome.wallSeconds,
      tool_calls: sum((scenario) => scenario.tool_calls),
      retries: 0,
      human_inputs: sum((scenario) => scenario.human_inputs),
      ...decisionCost(scenarios),
    },
    verdict_input: { all_ac_pass: false, all_inv_pass: false, indicators_in_range: false },
  };
  // The verdict input is computed on the report as its parser reads it, then written into it.
  return { ...report, verdict_input: computeVerdictInput(parseReport(report)) } as unknown as Report;
}

/** What a report cannot say in a status: the criteria it could not place, each with the reason. */
export function acceptanceWarnings(outcome: RunOutcome): string[] {
  return [...judgeAcceptance(outcome, effectiveStatuses(outcome)).flatMap(({ warning }) => (warning === null ? [] : [warning])), ...droppedWarnings(outcome)];
}

/** Every scenario that ran, at every level, in the order of the levels. */
export function allScenarios(outcome: RunOutcome): ScenarioResult[] {
  return [...outcome.component.scenarios, ...outcome.e2e_local.scenarios, ...outcome.e2e_remote.scenarios];
}

/**
 * Per scenario, the runs that passed out of the runs archived, `j/n`, in the order the scenarios
 * ran: the measure that `pass_at_k` (the rule `k/n`, from `pass_at` and `repeat`) is read against.
 */
export function passCounts(scenarios: readonly ScenarioResult[]): Record<string, string> {
  const counts = new Map<string, { passed: number; runs: number }>();
  for (const scenario of scenarios) {
    if (scenario.run === null) {
      continue;
    }
    const count = counts.get(scenario.id) ?? { passed: 0, runs: 0 };
    counts.set(scenario.id, { passed: count.passed + (scenario.status === 'pass' ? 1 : 0), runs: count.runs + 1 });
  }
  return Object.fromEntries([...counts].map(([id, count]) => [id, `${String(count.passed)}/${String(count.runs)}`]));
}

/**
 * The end-to-end local level in one line, from its report entry: the rule, how many scenarios reach
 * it, and each scenario's count — `pass@k 2/3: 2 of 8 scenario(s) — ac-01 3/3, ac-02 0/3, …`. A
 * scenario reaches the rule when at least `k` of its runs passed (all of them when it ran fewer than
 * `k` times), as `effectiveStatuses` judges it. Empty when no run was archived.
 */
export function passCountsLine(level: { readonly pass_at_k: string; readonly pass_counts?: Readonly<Record<string, string>> | undefined }): string {
  const counts = Object.entries(level.pass_counts ?? {});
  if (counts.length === 0) {
    return '';
  }
  const passAt = Number(level.pass_at_k.split('/')[0]);
  const reached = counts.filter(([, count]) => {
    const [passed, runs] = count.split('/').map(Number) as [number, number];
    return passed >= Math.min(passAt, runs);
  }).length;
  return `pass@k ${level.pass_at_k}: ${String(reached)} of ${String(counts.length)} scenario(s) — ${counts.map(([id, count]) => `${id} ${count}`).join(', ')}`;
}

function runsOf(scenarios: readonly ScenarioResult[]): number {
  return scenarios.filter((scenario) => scenario.run !== null).length;
}

/** Every scenario of the tests, the ones that ran among them whatever the list of the planned ones says. */
function plannedOf(outcome: RunOutcome): PlannedScenario[] {
  const ran = allScenarios(outcome).map((scenario) => ({ id: scenario.id, level: scenario.level, covers: scenario.covers }));
  return [...outcome.planned.filter((planned) => !ran.some((scenario) => scenario.id === planned.id && planned.level === scenario.level)), ...ran];
}

/** The ids of one family a report lists: the declared ones and those the scenarios cover, less the ones `TEAM.md` dropped. */
function idsOf(pattern: RegExp, declared: readonly string[], outcome: RunOutcome): string[] {
  const dropped = outcome.declared?.dropped ?? [];
  const covered = plannedOf(outcome).flatMap((scenario) => scenario.covers.filter((id) => pattern.test(id)));
  const measured = pattern === ID_PATTERNS.IND ? allScenarios(outcome).flatMap((scenario) => scenario.indicators.map((indicator) => indicator.id)) : [];
  return [...new Set([...declared, ...covered, ...measured])].filter((id) => !dropped.includes(id)).sort();
}

/** One warning per dropped id a scenario still covers: the scenario is out of step with `TEAM.md`, the report is not. */
function droppedWarnings(outcome: RunOutcome): string[] {
  const planned = plannedOf(outcome);
  return (outcome.declared?.dropped ?? []).flatMap((id) => {
    const covering = planned.filter((scenario) => scenario.covers.includes(id)).map((scenario) => scenario.id);
    return covering.length === 0 ? [] : [`${id} is dropped in TEAM.md and still covered by ${covering.join(', ')}: it is left out of the report — take it out of \`covers\``];
  });
}

function judgeAcceptance(outcome: RunOutcome, effective: EffectiveStatus): { id: string; criterion: Criterion; warning: string | null }[] {
  const ran = allScenarios(outcome);
  const planned = plannedOf(outcome);
  const statusOf: Readonly<Record<Level, LevelStatus>> = {
    static: outcome.static.status,
    unit: outcome.unit.status,
    component: outcome.component.status,
    e2e_local: outcome.e2e_local.status,
    e2e_remote: outcome.e2e_remote.status,
  };
  const cite = (scenarios: readonly ScenarioResult[]): string => [...new Set(scenarios.map((scenario) => `${scenario.id}${scenario.run === null ? '' : ` (${scenario.run})`}`))].join(', ');
  return idsOf(ID_PATTERNS.AC, (outcome.declared?.acceptance ?? []).map((declared) => declared.id), outcome).map((id) => {
    const declared = outcome.declared?.acceptance.find((candidate) => candidate.id === id) ?? null;
    const covering = ran.filter((scenario) => scenario.covers.includes(id));
    const failed = covering.filter((scenario) => effective.get(scenarioKey(scenario)) === 'fail');
    // Where the criterion is reported when nothing readable declares its level: never below the scenarios that cover it.
    const fallback = highestLevel(planned.filter((scenario) => scenario.covers.includes(id)).map((scenario) => scenario.level));
    let undeclared: string | null = null;
    if (outcome.declared === null) {
      undeclared = 'TEAM.md does not exist: nothing declares the level this criterion is proven at';
    } else if (declared === null) {
      undeclared = 'not declared in TEAM.md: nothing says at which level it is proven';
    } else if (declared.level === null) {
      undeclared = `TEAM.md gives no level the bench can read for it ("${declared.levelCell}"): write one of L0 to L4`;
    }
    const level = declared?.level ?? (declared === null ? fallback : 'e2e_remote');
    if (failed.length > 0) {
      return { id, criterion: { status: 'fail', level, evidence: `failed: ${cite(failed)}` }, warning: undeclared === null ? null : `${id}: ${undeclared}` };
    }
    if (undeclared !== null) {
      return { id, criterion: { status: 'not_run', level, evidence: undeclared }, warning: `${id} is not proven: ${undeclared}` };
    }
    const atLevel = covering.filter((scenario) => scenario.level === level);
    if (atLevel.length > 0 && statusOf[level] !== 'skipped') {
      return { id, criterion: { status: 'pass', level, evidence: cite(atLevel) }, warning: null };
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

function failedChecks(scenario: ScenarioResult): CheckResult[] {
  return scenario.checks.filter((check) => check.status === 'fail');
}

/** D96: what the decision tasks of the runs come to, for `cost`; nothing when no run completed one. */
function decisionCost(scenarios: readonly ScenarioResult[]): { decision_tasks: number; decision_defaulted: number; decision_confidence_min: number | null } | Record<string, never> {
  const summaries = scenarios.flatMap((scenario) => (scenario.decisions === undefined ? [] : [scenario.decisions]));
  if (summaries.length === 0) {
    return {};
  }
  const confidences = summaries.map((summary) => summary.confidence_min).filter((value): value is number => value !== null);
  return {
    decision_tasks: summaries.reduce((total, summary) => total + summary.tasks, 0),
    decision_defaulted: summaries.reduce((total, summary) => total + summary.defaulted, 0),
    decision_confidence_min: confidences.length === 0 ? null : Math.min(...confidences),
  };
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
  const scenarios = allScenarios(outcome);
  const runs = reportRuns(scenarios);
  const e2eIds = [...new Set([...outcome.e2e_local.scenarios, ...outcome.e2e_remote.scenarios].map((scenario) => scenario.id))];
  const effective = effectiveStatuses(outcome);
  const counts = { e2e_local: passCounts(outcome.e2e_local.scenarios), e2e_remote: passCounts(outcome.e2e_remote.scenarios) };
  const sideOf = (level: 'e2e_local' | 'e2e_remote', id: string): string => {
    const status = effective.get(`${level}:${id}`);
    const count = counts[level][id];
    return status === undefined ? '—' : count === undefined ? status : `${status} (${count})`;
  };
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
    row(['unit', outcome.unit.status, detailOf(outcome.unit.note, `${String(outcome.unit.passed + outcome.unit.failed)} test(s): ${String(outcome.unit.passed)} pass, ${String(outcome.unit.failed)} fail`), seconds(outcome.unit.duration_seconds)]),
    row(['component', outcome.component.status, detailOf(outcome.component.note, countByStatus(outcome.component.scenarios, 'scenario')), seconds(outcome.component.duration_seconds)]),
    row(['e2e_local', outcome.e2e_local.status, detailOf(outcome.e2e_local.note, `${countByStatus(outcome.e2e_local.scenarios, 'run')} — ${passReached(outcome)} at pass@k ${String(outcome.e2e_local.passAt)}/${String(outcome.e2e_local.repeat)} on ${outcome.e2e_local.model || 'the machine model'}`), seconds(outcome.e2e_local.duration_seconds)]),
    row(['e2e_remote', outcome.e2e_remote.status, detailOf(outcome.e2e_remote.note, `${countByStatus(outcome.e2e_remote.scenarios, 'run')} — ${outcome.e2e_remote.usd.toFixed(4)} USD on ${outcome.e2e_remote.model || 'the model of the profile'}`), seconds(outcome.e2e_remote.duration_seconds)]),
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
    ...tableOrNone(Object.entries(report.judges).map(([id, judge]) => row([id, judge.rubric_version, judge.judge_model ?? '', String(judge.score), `${judge.direction === '<=' ? '<= ' : ''}${String(judge.threshold)}`])), 5),
    '',
    '## Local and remote',
    '',
    '| Scenario | Local | Remote |',
    '|---|---|---|',
    ...tableOrNone(
      e2eIds.map((id) => row([id, sideOf('e2e_local', id), sideOf('e2e_remote', id)])),
      3,
    ),
    '',
    '## Cost',
    '',
    '| Tokens in | Tokens out | Estimated USD | Wall time (s) | Tool calls | Retries | Human inputs |',
    '|---|---|---|---|---|---|---|',
    row([report.cost.tokens_in, report.cost.tokens_out, report.cost.usd_estimated, seconds(report.cost.wall_seconds), report.cost.tool_calls, report.cost.retries, report.cost.human_inputs].map(String)),
    ...(report.cost.decision_tasks === undefined
      ? []
      : [
          '',
          '| Decision tasks | Answered from the fallback | Lowest confidence |',
          '|---|---|---|',
          row([String(report.cost.decision_tasks), String(report.cost.decision_defaulted ?? 0), report.cost.decision_confidence_min == null ? '' : String(report.cost.decision_confidence_min)]),
        ]),
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
  if (outcome.unit.status === 'fail') {
    lines.push(`- ${LEVEL_LABELS.unit} — ${outcome.unit.note.length > 0 ? outcome.unit.note : `${String(outcome.unit.failed)} unit test(s) failed`}`);
  }
  const failedRuns = allScenarios(outcome).filter((candidate) => candidate.status === 'fail');
  const classes = failureClassCounts(failedRuns);
  if (classes.some((entry) => entry.class !== 'team')) {
    lines.push(`- failed runs by class: ${classes.map((entry) => `${entry.class} ${String(entry.runs)}`).join(', ')}`);
  }
  for (const scenario of failedRuns) {
    const where = scenario.run === null ? '' : ` (${scenario.run})`;
    if (scenario.failure_class !== undefined) {
      const sentence = scenario.failure_class === 'decision_provider' && scenario.failure_cause === 'key' ? FAILURE_CLASS_SENTENCES.decision_provider_key : FAILURE_CLASS_SENTENCES[scenario.failure_class];
      lines.push(`- scenario \`${scenario.id}\`${where} — ${sentence}${scenario.failure_detail === undefined ? '' : `: ${scenario.failure_detail}`}`);
    }
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
  for (const [id, indicator] of Object.entries(report.indicators)) {
    if (indicator.status === 'fail') {
      lines.push(`- ${id} — fail — ${String(indicator.value)} against ${String(indicator.threshold)}`);
    }
  }
  for (const [id, judge] of Object.entries(report.judges)) {
    if (!judgeInRange(judge.score, judge.threshold, judge.direction)) {
      lines.push(`- ${id} — fail — scored ${String(judge.score)} against ${judge.direction === '<=' ? '<= ' : ''}${String(judge.threshold)}`);
    }
  }
  for (const level of ['component', 'e2e_local', 'e2e_remote'] as const) {
    if (outcome[level].status === 'fail' && outcome[level].note.length > 0) {
      lines.push(`- ${LEVEL_LABELS[level]} — ${outcome[level].note}`);
    }
  }
  const noteOf = (entry: unknown): string => (typeof entry === 'object' && entry !== null && typeof (entry as { note?: unknown }).note === 'string' ? (entry as { note: string }).note : 'not run');
  const notRun = [
    ...Object.entries(report.acceptance).flatMap(([id, criterion]) => (criterion.status === 'not_run' ? [`- ${id} — ${criterion.evidence}`] : [])),
    ...Object.entries(report.invariants).flatMap(([id, invariant]) => (invariant.status === 'not_run' ? [`- ${id} — ${noteOf(invariant)}`] : [])),
    ...Object.entries(report.indicators).flatMap(([id, indicator]) => (indicator.status === 'not_run' ? [`- ${id} — ${noteOf(indicator)}`] : [])),
  ];
  const notApplicable = Object.entries(report.indicators).flatMap(([id, indicator]) => (indicator.status === 'not_applicable' ? [`- ${id} — ${noteOf(indicator)}`] : []));
  if (lines.length === 0) {
    lines.push('Nothing.');
  }
  if (notRun.length > 0) {
    lines.push('', 'Not run, so not proven:', '', ...notRun);
  }
  if (notApplicable.length > 0) {
    lines.push('', 'Not applicable, so neither for nor against the verdict:', '', ...notApplicable);
  }
  return lines;
}

/** What a decision failure means for the review, said once per run in `## What fails`. */
const FAILURE_CLASS_SENTENCES = {
  decision_blocked: 'decision_blocked, not an ordinary failure: a decision stage blocked a model call — read the stage and the risk against the input before the crew',
  decision_provider: 'decision_provider, not a team defect: the decision provider did not answer (unreachable, timed out, 429 or 5xx) — run again once it answers',
  decision_provider_key: 'decision_provider, not a team defect: the decision provider refused or lacks its key (401/403) — correct the key variable, then run again',
  team: 'team, though a decision failed beside it: correct the team first',
} as const;

/** `2 of 8 scenario(s)`: the end-to-end local scenarios that reach the rule, out of those that ran. */
function passReached(outcome: RunOutcome): string {
  const effective = effectiveStatuses(outcome);
  const ids = [...new Set(outcome.e2e_local.scenarios.filter((scenario) => scenario.run !== null).map(scenarioKey))];
  return `${String(ids.filter((key) => effective.get(key) === 'pass').length)} of ${String(ids.length)} scenario(s)`;
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

/**
 * The outcome a written report stands for, read back from its `report.json` as the bench wrote it —
 * the levels with their notes, the scenarios with their checks, what was asked and replaced — so
 * that a command that changes the report after its run (`evaluate`) renders `REPORT.md` the way
 * the run did. What only the run knew (the declarations, the planned scenarios, the budget) is not
 * needed to render it.
 */
export function outcomeFromReport(raw: Readonly<Record<string, unknown>>): RunOutcome {
  const report = parseReport(raw);
  const levels = raw.levels as Record<Level, Record<string, unknown>>;
  const metadata = raw.metadata as Record<string, unknown>;
  const note = (level: Level): string => (typeof levels[level].note === 'string' ? (levels[level].note as string) : '');
  const scenarios = (level: 'component' | 'e2e_local' | 'e2e_remote'): ScenarioResult[] => levels[level].scenarios as ScenarioResult[];
  const [passAt, repeat] = report.levels.e2e_local.pass_at_k.split('/').map(Number) as [number, number];
  const ran = LEVELS.filter((level) => report.levels[level].status !== 'skipped');
  const requested = typeof metadata.requested_level === 'string' && (LEVELS as readonly string[]).includes(metadata.requested_level) ? (metadata.requested_level as Level) : (ran[ran.length - 1] ?? 'static');
  return {
    team: report.metadata.team,
    attempt: report.metadata.attempt as AttemptId,
    date: new Date(report.metadata.date),
    orkeonVersion: report.metadata.orkeon_version,
    benchVersion: report.metadata.bench_version,
    static: { status: report.levels.static.status, duration_seconds: report.levels.static.duration_seconds, note: note('static'), checks: report.levels.static.checks as StaticCheck[] },
    unit: { status: report.levels.unit.status, duration_seconds: report.levels.unit.duration_seconds, note: note('unit'), passed: report.levels.unit.passed, failed: report.levels.unit.failed },
    component: { status: report.levels.component.status, duration_seconds: report.levels.component.duration_seconds, note: note('component'), scenarios: scenarios('component') },
    e2e_local: { status: report.levels.e2e_local.status, duration_seconds: report.levels.e2e_local.duration_seconds, note: note('e2e_local'), scenarios: scenarios('e2e_local'), model: report.levels.e2e_local.model, repeat, passAt },
    e2e_remote: {
      status: report.levels.e2e_remote.status,
      duration_seconds: report.levels.e2e_remote.duration_seconds,
      note: note('e2e_remote'),
      scenarios: scenarios('e2e_remote'),
      provider: report.levels.e2e_remote.provider,
      model: report.levels.e2e_remote.model,
      usd: report.levels.e2e_remote.usd,
    },
    budget: { remote_usd_max: 0, local_minutes_max: 0 },
    requested,
    replaces: (metadata.replaces as ReplacedReport | null | undefined) ?? null,
    declared: null,
    planned: [],
    wallSeconds: report.cost.wall_seconds,
  };
}

/**
 * The runs a written report cites: those of its scenarios, in the order of its levels, then those of
 * the report it replaced (`metadata.replaces.runs`), whose evidence `REPORT.md` says stays in
 * `runs/` — what `capture` reads and `release` keeps.
 */
export function citedRuns(raw: Readonly<Record<string, unknown>>): string[] {
  const levels = (raw.levels ?? {}) as Record<string, { scenarios?: unknown } | undefined>;
  const scenarioRuns = (['component', 'e2e_local', 'e2e_remote'] as const).flatMap((level) => {
    const scenarios = levels[level]?.scenarios;
    return Array.isArray(scenarios)
      ? scenarios.flatMap((scenario: unknown) => {
          const run = typeof scenario === 'object' && scenario !== null ? (scenario as { run?: unknown }).run : undefined;
          return typeof run === 'string' ? [run] : [];
        })
      : [];
  });
  const metadata = (raw.metadata ?? {}) as { replaces?: { runs?: unknown } | null };
  const listed: unknown = metadata.replaces?.runs;
  const replaced = Array.isArray(listed) ? listed.filter((run): run is string => typeof run === 'string') : [];
  return [...new Set([...scenarioRuns, ...replaced])];
}
