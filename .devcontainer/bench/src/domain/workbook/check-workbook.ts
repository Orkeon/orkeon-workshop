import { readAcceptance, type WorkbookIds } from './acceptance-rules.js';
import { commonFindings, needTbdFindings, teamStructureFindings } from './common-rules.js';
import { designFindings, mountRows } from './design-rules.js';
import { sortFindings, type Finding, type SkippedCheck } from './finding.js';
import { ARTEFACTS, type TeamSection } from './headings.js';
import { partNamed, readMarkdown } from './markdown.js';
import { benchConfigFindings, plannedBudget, readWorkbookBenchConfig, testingFindings } from './plan-config-rules.js';
import { planFindings } from './plan-rules.js';
import { traceability, type TestFile, type TestsSummary } from './traceability-rules.js';

/** The one check of the workbook: `TEAM.md`, its four parts against one another, and `bench.config.json` (D89). */
export const WORKBOOK_CHECKS = ['team'] as const;
export type WorkbookCheck = (typeof WORKBOOK_CHECKS)[number];

/** The name under which a tool catalogue that could not be read is reported as skipped. */
export const TOOL_CATALOGUE_CHECK = 'tool-catalogue';

/** The tool names of the installed Orkeon, or why they could not be read. */
export type ToolCatalogue = { readonly tools: readonly string[] } | { readonly tools: null; readonly reason: string };

/** What `check team` reads: `TEAM.md` as text, the bench configuration when the file exists, the tool catalogue and, on request, the test files. */
export interface TeamInputs {
  readonly team: string;
  /** `tests/<slug>/bench.config.json`; null when the file does not exist. */
  readonly benchConfig: string | null;
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
  /** The ids `## Acceptance` declares: active criteria, indicators, invariants, and the dropped ones. */
  readonly ids: {
    readonly acceptance: readonly string[];
    readonly indicators: readonly string[];
    readonly invariants: readonly string[];
    readonly dropped: readonly string[];
  };
  /** Null unless the traceability was asked for (`--tests`). */
  readonly tests: TestsSummary | null;
}

/** A finding of a part of `TEAM.md`, placed under its part: `Need § Purpose`, or `Plan` alone. Findings of another artefact pass unchanged. */
function located(part: TeamSection, findings: readonly Finding[]): Finding[] {
  return findings.map((finding) => (finding.artefact === ARTEFACTS.team ? { ...finding, section: finding.section === null ? part : `${part} § ${finding.section}` } : finding));
}

/**
 * `check team`: the structure of `TEAM.md`; the need, the acceptance with its testing sections,
 * the design and the plan, each against the template and against one another; the bench
 * configuration against the acceptance; with the test files, the ids ↔ tests traceability as
 * well. A tool catalogue that could not be read is reported as skipped, and the tool names are
 * then not judged.
 */
export function checkTeam(team: string, inputs: TeamInputs): WorkbookCheckResult {
  const document = readMarkdown(inputs.team);
  const need = partNamed(document, 'Need');
  const acceptance = partNamed(document, 'Acceptance');
  const design = partNamed(document, 'Design');
  const plan = partNamed(document, 'Plan');
  const read = readAcceptance(acceptance);
  const config = readWorkbookBenchConfig(inputs.benchConfig);
  const traced = inputs.tests === null ? null : traceability(inputs.tests, read.ids);
  const findings = [
    ...teamStructureFindings(document),
    ...located('Need', [...commonFindings('Need', need, { emptySections: false }), ...needTbdFindings(need)]),
    ...located('Acceptance', [
      ...commonFindings('Acceptance', acceptance, { emptySections: true }),
      ...read.findings,
      ...testingFindings(acceptance, read.ids, config.config),
      ...config.findings,
      ...(config.config === null ? [] : benchConfigFindings(config.config, plannedBudget(acceptance), read.ids, config.stated)),
    ]),
    ...located('Design', [...commonFindings('Design', design, { emptySections: true }), ...designFindings(design, { needMounts: mountRows(need), ids: read.ids, catalogue: inputs.catalogue.tools })]),
    ...located('Plan', [...commonFindings('Plan', plan, { emptySections: true }), ...planFindings(plan, read.ids)]),
    ...located('Acceptance', traced?.findings ?? []),
  ];
  const skipped = inputs.catalogue.tools === null ? [{ check: TOOL_CATALOGUE_CHECK, reason: inputs.catalogue.reason }] : [];
  return result(team, read.ids, findings, skipped, traced?.summary ?? null);
}

function result(team: string, ids: WorkbookIds, found: readonly Finding[], skipped: readonly SkippedCheck[], tests: TestsSummary | null): WorkbookCheckResult {
  const findings = sortFindings(found);
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  return {
    team,
    check: 'team',
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
