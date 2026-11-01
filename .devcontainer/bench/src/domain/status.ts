import { z } from 'zod';

import { attemptIdSchema, batchIdSchema } from './ids.js';
import { parseWith } from './schema.js';

/** Workflow phases, in order (plan § 5.5, D89): one upstream phase, `spec`, then the loop. */
export const PHASES = [
  'spec',
  'tests',
  'build',
  'run',
  'review',
  'accepted',
  'published',
] as const;
export type Phase = (typeof PHASES)[number];

/** Verdict of a review (plan § 4.3). */
export const VERDICTS = ['ACCEPTED', 'ITERATE', 'BLOCKED'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The gates, in order: `team` (the user validates `TEAM.md`), then the three the loop passes by itself (D90). */
export const GATES = ['team', 'tests', 'build', 'review'] as const;
export type Gate = (typeof GATES)[number];

/** The phase a passed gate leads to: a phase before it is a status out of step. */
const GATE_PHASE: Readonly<Record<Gate, Phase>> = { team: 'tests', tests: 'build', build: 'run', review: 'accepted' };

const ITERATION = 'expected the number of ITERATE verdicts so far: 0 at /team-init, then 1, 2…';

const isoDateTime = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.iso.datetime({ offset: true }),
);

/**
 * YAML front matter of `workbooks/<slug>/STATUS.md`. `gate_passed` names the last gate passed
 * (`team` once the user validated `TEAM.md`), `null` before the first; `iteration` counts the
 * ITERATE verdicts, each of which brings the team back to phase `build` with `gate_passed: tests`
 * (D38). `batch` is the plan batch being built, `B<n>`, or `null`. The keys that have a natural
 * empty state default to `null` when absent; a workbook written before `iteration` reads as 0.
 */
export const statusSchema = z.object({
  phase: z.enum(PHASES),
  gate_passed: z.enum(GATES, 'expected the gate that was passed (team, tests, build, review) or null').nullable().default(null),
  iteration: z.number(ITERATION).int(ITERATION).min(0, ITERATION).default(0),
  attempt: attemptIdSchema.nullable().default(null),
  batch: batchIdSchema.nullable().default(null),
  verdict: z.enum(VERDICTS).nullable().default(null),
  next_action: z.string().min(1),
  updated_at: isoDateTime,
});
export type Status = z.infer<typeof statusSchema>;

/** The whole file: the front matter and the log lines that follow it. */
export interface StatusDocument {
  readonly status: Status;
  readonly log: readonly string[];
}

export function parseStatus(input: unknown): Status {
  return parseWith(statusSchema, input, 'STATUS.md front matter');
}

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

/** True when `phase` is `reference` or comes after it. */
export function isPhaseAtLeast(phase: Phase, reference: Phase): boolean {
  return phaseIndex(phase) >= phaseIndex(reference);
}

export function nextPhase(phase: Phase): Phase | null {
  return PHASES[phaseIndex(phase) + 1] ?? null;
}

/**
 * Inconsistencies a well-formed status may still carry. They never make the file unreadable:
 * `/team-status` realigns STATUS.md, so the reader reports instead of refusing.
 */
export function statusWarnings(status: Status): string[] {
  const warnings: string[] = [];
  if (status.gate_passed !== null && phaseIndex(status.phase) < phaseIndex(GATE_PHASE[status.gate_passed])) {
    warnings.push(`gate_passed (${status.gate_passed}) is ahead of phase (${status.phase})`);
  }
  if (isPhaseAtLeast(status.phase, 'accepted') && status.verdict !== 'ACCEPTED') {
    warnings.push(`phase ${status.phase} requires verdict ACCEPTED, got ${status.verdict ?? 'none'}`);
  }
  if (isPhaseAtLeast(status.phase, 'build') && status.attempt === null) {
    warnings.push(`phase ${status.phase} has no attempt (an attempt is opened when the build starts)`);
  }
  return warnings;
}
