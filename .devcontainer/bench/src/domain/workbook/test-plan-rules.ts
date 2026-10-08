import { LEVELS, parseBenchConfig, type BenchConfig } from '../bench-config.js';
import { DomainError } from '../errors.js';
import { ID_PATTERNS } from '../ids.js';
import { MACHINE_PROFILE_NAME, STUB_PROFILE_NAME } from '../profile.js';
import { LEVEL_LABELS } from '../run.js';
import { jsonSyntaxErrorAt, strictJsonOffence } from '../strict-json.js';
import { citedIds, declaredIds, idsAtLevel, undeclared, type WorkbookIds } from './acceptance-rules.js';
import { error, listOf, warning, type Finding } from './finding.js';
import { ARTEFACTS } from './headings.js';
import { backTicked, cell, choiceOf, isEmptyCell, rowsWith, sectionNamed, unquote, valueOf, wordOf, type MarkdownDocument, type MarkdownLine } from './markdown.js';

/** Where a dataset comes from, as `## Datasets` writes it. */
export const DATASET_ORIGINS = ['synthetic', 'provided', 'anonymized'] as const;

/** The other spelling of `anonymized`, read as the same origin. */
const ANONYMISED = 'anonymised';

/** A dataset is a folder of `tests/<slug>/datasets/`, named in kebab-case (`scenarioSchema`). */
const DATASET_NAME = /^[a-z][a-z0-9-]*$/;

/** The two limits of `## Budget`; null when its row is missing or holds no number. */
export interface PlannedBudget {
  readonly localMinutes: number | null;
  readonly remoteUsd: number | null;
}

/** `tests/<slug>/bench.config.json` as the checks could read it: null when it is missing or refused. */
export interface BenchConfigReading {
  readonly config: BenchConfig | null;
  /** The limits of `budget` the file writes itself; the other ones are the defaults of the bench. */
  readonly stated: readonly BudgetKey[];
  readonly findings: readonly Finding[];
}

export type BudgetKey = 'local_minutes_max' | 'remote_usd_max';
const BUDGET_KEYS: readonly BudgetKey[] = ['local_minutes_max', 'remote_usd_max'];

function sectionLines(document: MarkdownDocument, heading: string): readonly MarkdownLine[] {
  return sectionNamed(document.sections, heading)?.lines ?? [];
}

/** The first word of a `Kind` cell of `## Budget`, in lower case: `remote (L4)` is `remote`. */
function budgetKind(text: string): string {
  return /^[a-z]+/.exec(unquote(text).toLowerCase())?.[0] ?? '';
}

/**
 * The limits `## Budget` states, in the row whose `Kind` opens with `local` and in the one that
 * opens with `remote`: the number that stands before `minutes` or `min`, before `USD` or `$` —
 * the last one when several carry the unit, `3 × 20 minutes = 60 minutes` is 60 —, and failing
 * such a unit the first number of the cell. A decimal comma is a decimal point: `2,00 USD` is 2.
 */
export function plannedBudget(testPlan: MarkdownDocument): PlannedBudget {
  const NUMBER = '(\\d+(?:[.,]\\d+)?)';
  const limit = (kind: string, unit: string): number | null => {
    const row = rowsWith(sectionLines(testPlan, 'Budget'), 'Kind', ['Limit']).find((candidate) => budgetKind(cell(candidate, 'Kind')) === kind);
    const text = row === undefined ? '' : cell(row, 'Limit');
    const withUnit = [...text.matchAll(new RegExp(`${NUMBER}\\s*(?:${unit})`, 'gi'))].at(-1)?.[1];
    const number = withUnit ?? new RegExp(NUMBER).exec(text)?.[1];
    return number === undefined ? null : Number(number.replace(',', '.'));
  };
  return { localMinutes: limit('local', 'min(?:utes?)?\\b'), remoteUsd: limit('remote', 'USD\\b|\\$') };
}

/**
 * Reads the bench configuration of the team: it must exist — `/team-test-plan` writes it —, be
 * strict JSON and pass `parseBenchConfig`. A file that is no JSON is refused with the place where
 * it stops being JSON and nothing of what it holds: a key pasted there must not reach an output.
 */
export function readWorkbookBenchConfig(text: string | null): BenchConfigReading {
  const refuse = (code: 'config-missing' | 'config-invalid', message: string): BenchConfigReading => ({ config: null, stated: [], findings: [error(code, ARTEFACTS.benchConfig, null, message)] });
  if (text === null) {
    return refuse('config-missing', 'tests/<slug>/bench.config.json does not exist: `/team-test-plan` writes it from the plan');
  }
  const json = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const offence = strictJsonOffence(json);
  if (offence !== null) {
    return refuse('config-invalid', `not strict JSON — line ${String(offence.line)}: ${offence.what}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    const at = jsonSyntaxErrorAt(json);
    return refuse('config-invalid', at === null ? 'not valid JSON' : `not valid JSON: line ${String(at.line)}, column ${String(at.column)}`);
  }
  try {
    const budget = typeof parsed === 'object' && parsed !== null ? (parsed as { budget?: unknown }).budget : undefined;
    const stated = BUDGET_KEYS.filter((key) => typeof budget === 'object' && budget !== null && Object.hasOwn(budget, key));
    return { config: parseBenchConfig(parsed), stated, findings: [] };
  } catch (failure) {
    if (failure instanceof DomainError) {
      return refuse('config-invalid', failure.message);
    }
    throw failure;
  }
}

/**
 * The configuration against the plan it was written from: the same budget, no profile left to
 * decide where a level uses it, and the end-to-end levels the declared ids sit at.
 */
export function benchConfigFindings(config: BenchConfig, budget: PlannedBudget, ids: WorkbookIds, stated: readonly BudgetKey[] = BUDGET_KEYS): Finding[] {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], message: string): void => {
    findings.push(error(code, ARTEFACTS.benchConfig, null, message));
  };
  const differ = (key: BudgetKey, configured: number, planned: number | null): void => {
    if (planned !== null && planned !== configured) {
      const is = stated.includes(key) ? `is ${String(configured)}` : `is not stated — the bench defaults to ${String(configured)} —`;
      report('config-budget', `\`budget.${key}\` ${is} and \`TEST-PLAN.md\` \`## Budget\` says ${String(planned)}`);
    }
  };
  differ('local_minutes_max', config.budget.local_minutes_max, budget.localMinutes);
  differ('remote_usd_max', config.budget.remote_usd_max, budget.remoteUsd);
  for (const [name, profile] of Object.entries(config.profiles)) {
    const levels = Object.entries(config.levels)
      .filter(([, settings]) => settings.profile === name)
      .map(([level]) => `\`levels.${level}\``);
    // The key is named, never its value: a base URL may carry a credential.
    const undecided = 'source' in profile ? [] : (['model', 'baseUrl'] as const).filter((key) => /<[^<>]*>/.test(profile[key])).map((key) => `\`${key}\``);
    if (undecided.length > 0 && levels.length > 0) {
      report('config-placeholder', `profile \`${name}\`: ${listOf(undecided)} still ${undecided.length === 1 ? 'holds' : 'hold'} a \`<…>\` placeholder, and ${listOf(levels)} ${levels.length === 1 ? 'names' : 'name'} that profile`);
    }
  }
  for (const [code, level] of [['config-remote', 'e2e_remote'], ['config-local', 'e2e_local']] as const) {
    const at = idsAtLevel(ids, level);
    if (at.length > 0 && config.levels[level] === undefined) {
      report(code, `${listOf(at)} ${at.length === 1 ? 'sits' : 'sit'} at ${LEVEL_LABELS[level]} and \`levels.${level}\` is absent`);
    }
  }
  return findings;
}

/**
 * `TEST-PLAN.md` against `ACCEPTANCE.md` and the bench configuration (gate 2): the datasets and
 * what they serve, the datasets the criteria name, the judges, the profiles of the LLM targets and
 * the budget. `config` is null when the configuration could not be read: its profiles are then not
 * judged.
 */
export function testPlanFindings(testPlan: MarkdownDocument, ids: WorkbookIds, config: BenchConfig | null): Finding[] {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], section: string, message: string): void => {
    findings.push(error(code, ARTEFACTS.testPlan, section, message));
  };

  const datasets: { name: string; served: string[] }[] = [];
  rowsWith(sectionLines(testPlan, 'Datasets'), 'Name', ['Origin', 'Criteria served']).forEach((row, index) => {
    const name = wordOf(cell(row, 'Name'));
    const label = isEmptyCell(name) ? `row ${String(index + 1)}` : `\`${name}\``;
    const problems: string[] = [];
    if (isEmptyCell(name)) {
      problems.push('no `Name`');
    } else if (datasets.some((dataset) => dataset.name === name)) {
      problems.push('the name is on two rows');
    }
    const origin = choiceOf(cell(row, 'Origin'), [...DATASET_ORIGINS, ANONYMISED]);
    if (origin !== ANONYMISED && !(DATASET_ORIGINS as readonly string[]).includes(origin)) {
      problems.push(`\`Origin\` ${origin === '' ? 'is empty' : `\`${origin}\``} — none of ${listOf(DATASET_ORIGINS.map((known) => `\`${known}\``))}`);
    }
    if (problems.length > 0) {
      report('dataset-incomplete', 'Datasets', `${label}: ${problems.join('; ')}`);
    }
    const served = citedIds(cell(row, 'Criteria served'));
    for (const reason of served.map((id) => undeclared(ids, id)).filter((found) => found !== null)) {
      report('dataset-unknown-id', 'Datasets', `${label}: \`Criteria served\` — ${reason}`);
    }
    if (!isEmptyCell(name)) {
      datasets.push({ name, served });
    }
  });


  // The dataset of a criterion is the first back-ticked kebab-case name of `Given` that is a dataset: `edge`, case
  // `edge-empty-body` names a case after it, an empty `state` and the set `empty` a folder before it. Below L2 nothing
  // runs on a dataset, and such a name may be a tool or a file of the crew: nothing is judged there.
  const named = new Set<string>();
  for (const criterion of ids.criteria) {
    const names = backTicked(criterion.given).filter((name) => DATASET_NAME.test(name));
    names.forEach((name) => named.add(name));
    if (criterion.level === null || LEVELS.indexOf(criterion.level) < LEVELS.indexOf('component')) {
      continue;
    }
    if (names.length === 0) {
      findings.push(warning('ac-no-dataset', ARTEFACTS.acceptance, 'Acceptance criteria', `${criterion.id}: \`Given\` names no back-ticked dataset, and a criterion at L2 or above runs on one of \`TEST-PLAN.md\` \`## Datasets\``));
    } else if (!names.some((name) => datasets.some((dataset) => dataset.name === name))) {
      findings.push(error('ac-dataset', ARTEFACTS.acceptance, 'Acceptance criteria', `${criterion.id}: \`Given\` names the dataset \`${names[0] as string}\`, which is not a \`Name\` of \`TEST-PLAN.md\` \`## Datasets\``));
    }
  }
  const declared = declaredIds(ids);
  for (const dataset of datasets) {
    if (!named.has(dataset.name) && !dataset.served.some((id) => declared.includes(id))) {
      findings.push(warning('dataset-unused', ARTEFACTS.testPlan, 'Datasets', `\`${dataset.name}\`: no active criterion names it in \`Given\`, and it serves no declared id`));
    }
  }
  if (declared.includes('INV-INJECTION') && !datasets.some((dataset) => dataset.served.includes('INV-INJECTION'))) {
    report('adversarial-missing', 'Datasets', '`INV-INJECTION` is declared and no dataset lists it in `Criteria served`: untrusted inputs call for an adversarial set');
  }

  const judges = new Set<string>();
  rowsWith(sectionLines(testPlan, 'Judges'), 'Id', ['Rubric', 'Threshold']).forEach((row, index) => {
    const id = wordOf(cell(row, 'Id'));
    const label = id === '' ? `row ${String(index + 1)}` : id;
    const problems: string[] = [];
    if (!ID_PATTERNS.J.test(id)) {
      problems.push(id === '' ? 'no id' : 'not a judge id (`J-nn`, two digits or more)');
    }
    if (id !== '' && judges.has(id)) {
      report('id-duplicate', 'Judges', `\`${id}\` is on two rows: an id names one row, and is never reused`);
    }
    judges.add(id);
    problems.push(...['Rubric', 'Scale', 'Threshold'].filter((header) => isEmptyCell(cell(row, header))).map((header) => `empty \`${header}\``));
    const threshold = unquote(cell(row, 'Threshold'));
    if (!isEmptyCell(threshold) && !/^-?\d+(\.\d+)?$/.test(threshold)) {
      const indicators = [...threshold.matchAll(/\bIND-[A-Za-z0-9]+\b/g)].map((match) => match[0]);
      const unknown = indicators.filter((indicator) => !ids.indicators.some((known) => known.id === indicator));
      if (indicators.length === 0) {
        problems.push(`\`Threshold\` \`${threshold}\` is neither a number nor the id of an indicator`);
      } else if (unknown.length > 0) {
        problems.push(`\`Threshold\` names ${listOf(unknown.map((indicator) => `\`${indicator}\``))}, which \`ACCEPTANCE.md\` does not declare`);
      }
    }
    if (problems.length > 0) {
      report('judge-incomplete', 'Judges', `${label}: ${problems.join('; ')}`);
    }
  });


  if (config !== null) {
    const profiles = [STUB_PROFILE_NAME, MACHINE_PROFILE_NAME, ...Object.keys(config.profiles)];
    for (const row of rowsWith(sectionLines(testPlan, 'LLM targets'), 'Profile')) {
      const profile = choiceOf(cell(row, 'Profile'), profiles);
      if (!isEmptyCell(cell(row, 'Profile')) && !profiles.includes(profile)) {
        const target = valueOf(cell(row, 'Target'));
        report('target-profile', 'LLM targets', `${target === '' ? 'a target' : `target \`${target}\``}: profile \`${profile}\` is neither \`${STUB_PROFILE_NAME}\`, \`${MACHINE_PROFILE_NAME}\` nor a profile of bench.config.json`);
      }
    }
  }

  const budget = plannedBudget(testPlan);
  if (budget.localMinutes === null) {
    report('budget', 'Budget', 'no `local` row with a number in `Limit`: the minutes a local attempt may take');
  }
  if (budget.remoteUsd === null) {
    report('budget', 'Budget', 'no `remote` row with a number in `Limit`: the cap in USD of a remote attempt');
  }
  return findings;
}
