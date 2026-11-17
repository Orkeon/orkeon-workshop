import { judgeInRange } from './judgements.js';
import type { Report, VerdictInput } from './report.js';
import type { RunFailureClass } from './run-events.js';
import type { ScenarioResult } from './scenario-result.js';

/**
 * The verdict rule (plan § 9.1): ACCEPTED ⇔ every AC passes at its level ∧ every INV passes ∧
 * every IND is in range. An AC "passes at its level" when its status is `pass` and the level it
 * is attached to actually ran (a skipped level proves nothing). A report with no AC proves
 * nothing either, so it is never accepted; INV and IND are vacuously true when absent, and an
 * invariant or an indicator that is `not_run` is neither proven nor in range; a decision indicator
 * that is `not_applicable` — no decision model answered, and nothing to measure — counts neither way. A judge scored on the
 * wrong side of its threshold blocks the verdict like a red indicator (D97): `indicators_in_range`
 * is false; a judge not graded yet is not in `judges` and changes nothing.
 */
export function computeVerdictInput(report: Report): VerdictInput {
  const acceptance = Object.values(report.acceptance);
  const allAcPass =
    acceptance.length > 0 &&
    acceptance.every((criterion) => criterion.status === 'pass' && report.levels[criterion.level].status !== 'skipped');
  return {
    all_ac_pass: allAcPass,
    all_inv_pass: Object.values(report.invariants).every((invariant) => invariant.status === 'pass'),
    indicators_in_range:
      Object.values(report.indicators).every((indicator) => indicator.status === 'pass' || indicator.status === 'not_applicable') &&
      Object.values(report.judges).every((judge) => judgeInRange(judge.score, judge.threshold, judge.direction)),
  };
}

export function isAccepted(input: VerdictInput): boolean {
  return input.all_ac_pass && input.all_inv_pass && input.indicators_in_range;
}

/** Differences between the `verdict_input` a report carries and the one its content implies. */
export function verdictInputDiscrepancies(report: Report): string[] {
  const computed = computeVerdictInput(report);
  return (Object.keys(computed) as (keyof VerdictInput)[])
    .filter((key) => report.verdict_input[key] !== computed[key])
    .map((key) => `verdict_input.${key} is ${String(report.verdict_input[key])} but the report content implies ${String(computed[key])}`);
}

/**
 * The class of a failed run, which the review reads before the verdict: `team`, an ordinary failure — the
 * crew, its prompts or its tools are to fix (ITERATE); `decision_blocked`, a decision stage blocked a model
 * call, or the LLM judge (`Orkeon:Guardian:Llm`) an input or an output — a decision of the guard, to read against the input (an adversarial input it should block, or
 * thresholds of the team's settings file that are too tight), not the crew; `decision_provider`, the
 * decision provider failed (down, timed out, a refused key) — no defect of the team: run again once it
 * answers. None of them passes a criterion: the verdict rule is unchanged.
 */
export type FailureClass = RunFailureClass;

/** The class of a run that failed; null for one that passed. */
export function failureClassOf(scenario: Pick<ScenarioResult, 'status' | 'failure_class'>): FailureClass | null {
  if (scenario.status !== 'fail') {
    return null;
  }
  return scenario.failure_class ?? 'team';
}

/** How many failed runs each class holds, in a fixed order; the classes without a run are left out. */
export function failureClassCounts(scenarios: readonly Pick<ScenarioResult, 'status' | 'failure_class'>[]): { readonly class: FailureClass; readonly runs: number }[] {
  const order: readonly FailureClass[] = ['team', 'decision_blocked', 'decision_provider'];
  return order
    .map((failureClass) => ({ class: failureClass, runs: scenarios.filter((scenario) => failureClassOf(scenario) === failureClass).length }))
    .filter((entry) => entry.runs > 0);
}
