import { z } from 'zod';

import { LEVELS } from './bench-config.js';
import { acceptanceIdSchema, attemptIdSchema, indicatorIdSchema, invariantIdSchema, judgeIdSchema } from './ids.js';
import { parseWith } from './schema.js';

/** `report.json` schema version; the top-level keys never change (plan § 5.7). */
export const REPORT_SCHEMA_VERSION = '1.0';

export const LEVEL_STATUSES = ['pass', 'fail', 'skipped'] as const;
export const ACCEPTANCE_STATUSES = ['pass', 'fail', 'not_run'] as const;
/**
 * An indicator or an invariant: `not_run` when the run did not measure or check it — it is then
 * neither in range nor proven, and the verdict input says so.
 */
export const CHECK_STATUSES = ['pass', 'fail', 'not_run'] as const;
/**
 * An indicator also takes `not_applicable`: a decision measure (D96) with nothing to measure in runs
 * where no decision model could answer — none configured, a stub run, or `--no-decision` —: no decision
 * task completed, or (the lowest confidence) the fallback's answers carry none. The fallback's defaulted
 * rate is measured. It counts neither for nor against the verdict.
 */
export const INDICATOR_STATUSES = [...CHECK_STATUSES, 'not_applicable'] as const;

const duration = z.number().nonnegative();
const count = z.int().nonnegative();
const levelStatus = z.enum(LEVEL_STATUSES);

export const reportLevelsSchema = z.object({
  static: z.object({ status: levelStatus, checks: z.array(z.unknown()), duration_seconds: duration }),
  unit: z.object({ status: levelStatus, passed: count, failed: count, duration_seconds: duration }),
  component: z.object({ status: levelStatus, scenarios: z.array(z.unknown()), duration_seconds: duration }),
  e2e_local: z.object({
    status: levelStatus,
    model: z.string(),
    runs: count,
    pass_at_k: z.string().regex(/^\d+\/\d+$/, 'expected k/n such as 2/3'),
    /** Per scenario, the runs that passed out of its runs, `j/n` — the measure `pass_at_k` is the rule for. Absent from reports written before it. */
    pass_counts: z.record(z.string(), z.string().regex(/^\d+\/\d+$/, 'expected j/n such as 1/3')).optional(),
    scenarios: z.array(z.unknown()),
    duration_seconds: duration,
  }),
  e2e_remote: z.object({
    status: levelStatus,
    provider: z.string(),
    model: z.string(),
    runs: count,
    scenarios: z.array(z.unknown()),
    duration_seconds: duration,
    usd: z.number().nonnegative(),
  }),
});

export const verdictInputSchema = z.object({
  all_ac_pass: z.boolean(),
  all_inv_pass: z.boolean(),
  indicators_in_range: z.boolean(),
});
export type VerdictInput = z.infer<typeof verdictInputSchema>;

export const reportSchema = z.strictObject({
  schema_version: z.literal(REPORT_SCHEMA_VERSION),
  metadata: z.object({
    team: z.string().min(1),
    attempt: attemptIdSchema,
    date: z.string().min(1),
    orkeon_version: z.string(),
    bench_version: z.string(),
  }),
  levels: reportLevelsSchema,
  acceptance: z.record(
    acceptanceIdSchema,
    z.object({ status: z.enum(ACCEPTANCE_STATUSES), level: z.enum(LEVELS), evidence: z.string() }),
  ),
  indicators: z.record(indicatorIdSchema, z.object({ value: z.number().nullable(), threshold: z.number().nullable(), status: z.enum(INDICATOR_STATUSES) })),
  invariants: z.record(invariantIdSchema, z.object({ status: z.enum(CHECK_STATUSES), violations: z.array(z.unknown()) })),
  judges: z.record(
    judgeIdSchema,
    z.object({
      rubric_version: z.string(),
      judge_model: z.string().nullable(),
      score: z.number(),
      threshold: z.number(),
      /** `<=` when the judge borrows the threshold of a lower-is-better indicator; absent means `>=`. */
      direction: z.enum(['>=', '<=']).optional(),
    }),
  ),
  cost: z.object({
    tokens_in: count,
    tokens_out: count,
    usd_estimated: z.number().nonnegative(),
    wall_seconds: duration,
    tool_calls: count,
    retries: count,
    human_inputs: count,
    /** D96, present when a run completed a decision task: how many, how many answered from their fallback, the lowest confidence. */
    decision_tasks: count.optional(),
    decision_defaulted: count.optional(),
    decision_confidence_min: z.number().nullable().optional(),
  }),
  verdict_input: verdictInputSchema,
});
export type Report = z.infer<typeof reportSchema>;

export function parseReport(input: unknown): Report {
  return parseWith(reportSchema, input, 'report.json');
}
