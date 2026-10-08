import type { Track } from '../status.js';
import { readAcceptance, type WorkbookIds } from './acceptance-rules.js';
import { commonFindings, needTbdFindings } from './common-rules.js';
import { designFindings, mountRows } from './design-rules.js';
import { sortFindings, type Finding, type SkippedCheck } from './finding.js';
import { ARTEFACTS } from './headings.js';
import { readMarkdown, type MarkdownDocument } from './markdown.js';
import { planFindings } from './plan-rules.js';
import { benchConfigFindings, plannedBudget, readWorkbookBenchConfig, testPlanFindings } from './test-plan-rules.js';
import { traceability, type TestFile, type TestsSummary } from './traceability-rules.js';

/** The two checks of the workbook: gate 2, and gate 3 — which runs gate 2 first. */
export const WORKBOOK_CHECKS = ['test-plan', 'design'] as const;
export type WorkbookCheck = (typeof WORKBOOK_CHECKS)[number];

/** The name under which a tool catalogue that could not be read is reported as skipped. */
export const TOOL_CATALOGUE_CHECK = 'tool-catalogue';

/** The name under which the rule of the light track is reported as skipped, when `STATUS.md` does not give the track. */
export const LIGHT_TRACK_CHECK = 'light-track';

/** What gate 2 reads: the three artefacts as text, and the bench configuration when the file exists. */
export interface TestPlanInputs {
  readonly need: string;
  readonly acceptance: string;
  readonly testPlan: string;
  /** `tests/<slug>/bench.config.json`; null when the file does not exist. */
  readonly benchConfig: string | null;
}

/** The tool names of the installed Orkeon, or why they could not be read. */
export type ToolCatalogue = { readonly tools: readonly string[] } | { readonly tools: null; readonly reason: string };

/** `track` of `STATUS.md`, or why it could not be read. */
export type TrackReading = { readonly track: Track } | { readonly track: null; readonly reason: string };

/** What gate 3 reads besides: the design, the plan, the track of the team and the tool catalogue. */
export interface DesignInputs extends TestPlanInputs {
  readonly design: string;
  readonly plan: string;
  /** The light track builds a single batch; a track that could not be read judges nothing. */
  readonly track: TrackReading;
  readonly catalogue: ToolCatalogue;
  /** The files of the test folders, for the ids ↔ tests traceability; null when it was not asked for. */
  readonly tests: readonly TestFile[] | null;
}

/** The result of a check: what `--json` prints, in snake_case, and what decides the exit code. */
export interface WorkbookCheckResult {
  readonly team: string;
  readonly check: WorkbookCheck;
  /** `fail` as soon as one finding is an error; warnings alone pass. */
  readonly status: 'pass' | 'fail';
  readonly errors: number;
  readonly warnings: number;
  /** Errors first, then in the order of `FINDING_CODES`. */
  readonly findings: readonly Finding[];
  readonly skipped: readonly SkippedCheck[];
  /** The ids `ACCEPTANCE.md` declares: active criteria, indicators, invariants, and the dropped ones. */
  readonly ids: {
    readonly acceptance: readonly string[];
    readonly indicators: readonly string[];
    readonly invariants: readonly string[];
    readonly dropped: readonly string[];
  };
  /** Null unless the traceability was asked for (`--tests`). */
  readonly tests: TestsSummary | null;
}

interface Gate2 {
  readonly need: MarkdownDocument;
  readonly ids: WorkbookIds;
  readonly findings: Finding[];
}

/** Everything gate 2 checks: the three artefacts and the bench configuration, against one another. */
function gate2(inputs: TestPlanInputs): Gate2 {
  const need = readMarkdown(inputs.need);
  const acceptance = readMarkdown(inputs.acceptance);
  const testPlan = readMarkdown(inputs.testPlan);
  const read = readAcceptance(acceptance);
  const config = readWorkbookBenchConfig(inputs.benchConfig);
  const findings = [
    ...commonFindings(ARTEFACTS.need, need, { emptySections: false }),
    ...commonFindings(ARTEFACTS.acceptance, acceptance, { emptySections: true }),
    ...read.findings,
    ...commonFindings(ARTEFACTS.testPlan, testPlan, { emptySections: true }),
    ...testPlanFindings(testPlan, read.ids, config.config),
    ...config.findings,
    ...(config.config === null ? [] : benchConfigFindings(config.config, plannedBudget(testPlan), read.ids, config.stated)),
  ];
  return { need, ids: read.ids, findings };
}

function result(team: string, check: WorkbookCheck, ids: WorkbookIds, found: readonly Finding[], skipped: readonly SkippedCheck[], tests: TestsSummary | null): WorkbookCheckResult {
  const findings = sortFindings(found);
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  return {
    team,
    check,
    status: errors === 0 ? 'pass' : 'fail',
    errors,
    warnings: findings.length - errors,
    findings,
    skipped,
    ids: {
      acceptance: ids.criteria.map((criterion) => criterion.id),
      indicators: ids.indicators.map((indicator) => indicator.id),
      invariants: ids.invariants.map((invariant) => invariant.id),
      dropped: ids.dropped,
    },
    tests,
  };
}

/** `check test-plan` — gate 2: `ACCEPTANCE.md`, `TEST-PLAN.md` and `bench.config.json`, and the shape of `NEED.md`. */
export function checkTestPlan(team: string, inputs: TestPlanInputs): WorkbookCheckResult {
  const read = gate2(inputs);
  return result(team, 'test-plan', read.ids, read.findings, [], null);
}

/**
 * `check design` — gate 3: everything gate 2 checks, then `DESIGN.md` and `PLAN.md`; with the test
 * files, the ids ↔ tests traceability as well. A tool catalogue that could not be read is reported
 * as skipped, and the tool names are then not judged; so is a track that could not be read.
 */
export function checkDesign(team: string, inputs: DesignInputs): WorkbookCheckResult {
  const read = gate2(inputs);
  const design = readMarkdown(inputs.design);
  const plan = readMarkdown(inputs.plan);
  const traced = inputs.tests === null ? null : traceability(inputs.tests, read.ids);
  const findings = [
    ...read.findings,
    ...needTbdFindings(read.need),
    ...commonFindings(ARTEFACTS.design, design, { emptySections: true }),
    ...designFindings(design, { needMounts: mountRows(read.need), ids: read.ids, catalogue: inputs.catalogue.tools }),
    ...commonFindings(ARTEFACTS.plan, plan, { emptySections: true }),
    ...planFindings(plan, read.ids, inputs.track.track ?? 'full'),
    ...(traced?.findings ?? []),
  ];
  const skipped = [
    ...(inputs.catalogue.tools === null ? [{ check: TOOL_CATALOGUE_CHECK, reason: inputs.catalogue.reason }] : []),
    ...(inputs.track.track === null ? [{ check: LIGHT_TRACK_CHECK, reason: inputs.track.reason }] : []),
  ];
  return result(team, 'design', read.ids, findings, skipped, traced?.summary ?? null);
}
