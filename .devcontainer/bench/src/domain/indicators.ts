import type { DeclaredIndicator } from './acceptance.js';
import type { ScenarioResult } from './scenario-result.js';
import { JUDGE_MEASURE_PREFIX, type Measure } from './scenario.js';

export interface IndicatorResult {
  /** The mean of the measure over the runs; null when it was not computed. */
  readonly value: number | null;
  readonly threshold: number | null;
  readonly status: 'pass' | 'fail' | 'not_run' | 'not_applicable';
  /** What the bench measured, as the scenarios name it; null when no scenario measures the indicator. */
  readonly measure: string | null;
  readonly note: string;
}

/** In the note of a decision indicator measured on the fallback alone while `TEAM.md` declares a decision model. */
export const DECLARED_MODEL_UNMEASURED = 'TEAM.md declares a decision model whose answers no run measured';

/** Said of an indicator no scenario measures. */
export const INDICATOR_NOT_MEASURED = 'not run: no scenario names this indicator under `indicators`';

/** What `evaluate --judgements` writes in place of the note of a judged indicator that is still waiting. */
export function judgePendingNote(judge: string): string {
  return `not run: waiting for the grades of ${judge} — orkeon-bench evaluate <team> --judgements <file> integrates them`;
}

/**
 * The indicators of a report: for each id, the mean over the archived runs of the scenarios that
 * name it of what they ask the bench to measure (`indicators[].measure`), against the threshold and
 * the direction `TEAM.md` declares. A judged measure (`judge:J-nn`) waits for `evaluate --judgements`.
 * A decision measure is read from the runs' events whenever decision tasks completed, a decision model
 * active or not; with no active model and nothing to measure (no decision task, no confidence), it is
 * `not_applicable` when `TEAM.md` declares no decision model (`decisionModelDeclared` false), and
 * `not_run` — unproven — when it does.
 */
export function evaluateIndicators(ids: readonly string[], declared: readonly DeclaredIndicator[], scenarios: readonly ScenarioResult[], decisionModelDeclared = false): Record<string, IndicatorResult> {
  return Object.fromEntries(ids.map((id) => [id, evaluateIndicator(id, declared.find((indicator) => indicator.id === id) ?? null, scenarios, decisionModelDeclared)]));
}

function evaluateIndicator(id: string, declared: DeclaredIndicator | null, scenarios: readonly ScenarioResult[], decisionModelDeclared: boolean): IndicatorResult {
  const threshold = declared?.threshold ?? null;
  const measuring = scenarios.filter((scenario) => scenario.indicators.some((indicator) => indicator.id === id));
  const notRun = (measure: string | null, note: string): IndicatorResult => ({ value: null, threshold, status: 'not_run', measure, note });
  if (measuring.length === 0) {
    return notRun(null, INDICATOR_NOT_MEASURED);
  }
  const measures = [...new Set(measuring.map((scenario) => scenario.indicators.find((indicator) => indicator.id === id)?.measure ?? ''))];
  if (measures.length > 1) {
    return notRun(measures.join(' | '), `not run: the scenarios measure it differently (${measures.join(', ')}): one measure per indicator`);
  }
  const measure = measures[0] as string;
  if (measure.startsWith(JUDGE_MEASURE_PREFIX)) {
    return notRun(measure, judgePendingNote(measure.slice(JUDGE_MEASURE_PREFIX.length)));
  }
  const decisionMeasure = DECISION_MEASURES.includes(measure as Measure);
  const ran = measuring.filter((scenario) => measure === 'pass_rate' || scenario.run !== null);
  // A decision measure is read from the events of the runs that completed a decision task. When a
  // decision model answered in some run, those runs alone are judged: the model is what is measured.
  // When none did (no model configured, a stub run, --no-decision), the fallback answered by design
  // (D96): its share of defaulted answers is still measured — what a stub level proves —, and the note
  // says so; a declared model whose answers no run measured is named in it, never hidden.
  const active = decisionMeasure ? ran.filter((scenario) => (scenario.decision_model ?? 'active') === 'active') : ran;
  const fallbackOnly = decisionMeasure && ran.length > 0 && active.length === 0;
  const archived = fallbackOnly ? ran : active;
  let fallbackNote = '';
  if (fallbackOnly) {
    const states = [...new Set(ran.map((scenario) => scenario.decision_model))];
    const why = states.length === 1 && states[0] === 'off' ? '--no-decision' : states.length === 1 ? 'no decision model configured (or a stub run)' : 'no decision model configured, a stub run or --no-decision';
    const unmeasured = archived.filter((scenario) => scenario.decisions !== undefined).map((scenario) => measureOf(scenario, measure as Measure));
    if (unmeasured.length === 0 || unmeasured.includes(null)) {
      // Nothing to measure: no decision task completed, or (the lowest confidence) the fallback's answers carry none.
      const what = unmeasured.length === 0 ? 'no decision task completed' : 'the fallback answers carry no confidence';
      if (decisionModelDeclared) {
        return notRun(measure, `not run: TEAM.md declares a decision model, but no run had one active (${why}) and ${what} — run a level where the provider answers`);
      }
      return { value: null, threshold, status: 'not_applicable', measure, note: `not applicable: ${why} — ${what}, the decision tasks answered from their fallback by design` };
    }
    fallbackNote = `, with no decision model active (${why}): the fallback's answers${decisionModelDeclared ? ` — ${DECLARED_MODEL_UNMEASURED}` : ''}`;
  }
  // A decision measure counts the runs that completed a decision task; the others count every run.
  const samples = (decisionMeasure ? archived.filter((scenario) => scenario.decisions !== undefined) : archived).map((scenario) => measureOf(scenario, measure as Measure));
  if (samples.length === 0) {
    return notRun(measure, decisionMeasure && archived.length > 0 ? 'not run: no run of a scenario that measures it completed a decision task' : 'not run: no run of a scenario that measures it was archived');
  }
  if (samples.includes(null)) {
    return notRun(measure, decisionMeasure ? 'not run: no decision answer of the runs carries a confidence' : 'not run: the cost of a run is unknown — the profile has no price in bench.config.json');
  }
  const known = samples as number[];
  // The lowest confidence over the runs; every other measure, the mean.
  const value = round(measure === 'decision_confidence_min' ? Math.min(...known) : known.reduce((total, sample) => total + sample, 0) / known.length);
  if (declared === null) {
    return { value, threshold, status: 'not_run', measure, note: 'not run: not declared in TEAM.md — nothing says what value is in range' };
  }
  if (threshold === null || declared.direction === null) {
    return { value, threshold, status: 'not_run', measure, note: `not run: TEAM.md gives no ${threshold === null ? 'threshold' : 'direction'} the bench can read for it` };
  }
  const inRange = declared.direction === '>=' ? value >= threshold : value <= threshold;
  return { value, threshold, status: inRange ? 'pass' : 'fail', measure, note: `${measure} ${declared.direction} ${String(threshold)} over ${String(samples.length)} run(s)${fallbackNote}` };
}

/** The measures of the decision tasks (D96): computed on the runs that completed one. */
const DECISION_MEASURES: readonly Measure[] = ['decision_defaulted_rate', 'decision_confidence_min'];

/**
 * What one run gives for a measure; `pass_rate` is 100 or 0 per run, a percentage once averaged;
 * `decision_defaulted_rate` the share (0…1) of the decision tasks answered from their fallback.
 * Null for an unknown cost, and for a decision measure the run cannot give.
 */
export function measureOf(scenario: ScenarioResult, measure: Measure): number | null {
  switch (measure) {
    case 'decision_defaulted_rate':
      return scenario.decisions === undefined ? null : scenario.decisions.defaulted / scenario.decisions.tasks;
    case 'decision_confidence_min':
      return scenario.decisions?.confidence_min ?? null;
    case 'duration_seconds':
      return scenario.duration_seconds;
    case 'tokens_total':
      return scenario.tokens_in + scenario.tokens_out;
    case 'usd':
      return scenario.usd;
    case 'tool_calls':
      return scenario.tool_calls;
    case 'human_inputs':
      return scenario.human_inputs;
    case 'pass_rate':
      return scenario.status === 'pass' ? 100 : 0;
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
