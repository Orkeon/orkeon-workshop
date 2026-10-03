import type { Report, VerdictInput } from './report.js';

/**
 * The verdict rule (plan § 9.1): ACCEPTED ⇔ every AC passes at its level ∧ every INV passes ∧
 * every IND is in range. An AC "passes at its level" when its status is `pass` and the level it
 * is attached to actually ran (a skipped level proves nothing). A report with no AC proves
 * nothing either, so it is never accepted; INV and IND are vacuously true when absent.
 */
export function computeVerdictInput(report: Report): VerdictInput {
  const acceptance = Object.values(report.acceptance);
  const allAcPass =
    acceptance.length > 0 &&
    acceptance.every((criterion) => criterion.status === 'pass' && report.levels[criterion.level].status !== 'skipped');
  return {
    all_ac_pass: allAcPass,
    all_inv_pass: Object.values(report.invariants).every((invariant) => invariant.status === 'pass'),
    indicators_in_range: Object.values(report.indicators).every((indicator) => indicator.status === 'pass'),
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
