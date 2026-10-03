import { z } from 'zod';

import { LEVELS } from './bench-config.js';
import { acceptanceIdSchema, attemptIdSchema, indicatorIdSchema, invariantIdSchema, judgeIdSchema } from './ids.js';
import { parseWith } from './schema.js';

/** `report.json` schema version; the top-level keys never change (plan § 5.7). */
export const REPORT_SCHEMA_VERSION = '1.0';

export const LEVEL_STATUSES = ['pass', 'fail', 'skipped'] as const;
export const ACCEPTANCE_STATUSES = ['pass', 'fail', 'not_run'] as const;
export const CHECK_STATUSES = ['pass', 'fail'] as const;

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
  indicators: z.record(indicatorIdSchema, z.object({ value: z.number(), threshold: z.number(), status: z.enum(CHECK_STATUSES) })),
  invariants: z.record(invariantIdSchema, z.object({ status: z.enum(CHECK_STATUSES), violations: z.array(z.unknown()) })),
  judges: z.record(
    judgeIdSchema,
    z.object({ rubric_version: z.string(), judge_model: z.string(), score: z.number(), threshold: z.number() }),
  ),
  cost: z.object({
    tokens_in: count,
    tokens_out: count,
    usd_estimated: z.number().nonnegative(),
    wall_seconds: duration,
    tool_calls: count,
    retries: count,
    human_inputs: count,
  }),
  verdict_input: verdictInputSchema,
});
export type Report = z.infer<typeof reportSchema>;

export function parseReport(input: unknown): Report {
  return parseWith(reportSchema, input, 'report.json');
}
