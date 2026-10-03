import { z } from 'zod';

import { DomainError } from './errors.js';

/**
 * Identifier families of the workbook (plan, annex B). Frozen literals: the skills, the
 * templates and the hooks read and write these exact shapes.
 *
 * A plan batch is `B1`, `B2`… — no dash, no leading zero. The `L` prefix is reserved for the
 * test levels `L0`–`L4` and is never a batch.
 */
export const ID_PATTERNS = {
  AC: /^AC-\d{2,}$/,
  IND: /^IND-\d{2,}$/,
  INV: /^INV-(?:\d{2,}|[A-Z][A-Z0-9]*)$/,
  J: /^J-\d{2,}$/,
  DEC: /^DEC-\d{4}$/,
  ATT: /^ATT-\d{4}$/,
  RUN: /^RUN-\d{8}-\d{4}-[a-z0-9][a-z0-9-]*$/,
  BATCH: /^B[1-9][0-9]*$/,
} as const;

export type IdKind = keyof typeof ID_PATTERNS;

declare const brand: unique symbol;
type Branded<K extends IdKind> = string & { readonly [brand]: K };

export type AcceptanceId = Branded<'AC'>;
export type IndicatorId = Branded<'IND'>;
export type InvariantId = Branded<'INV'>;
export type JudgeId = Branded<'J'>;
export type DecisionId = Branded<'DEC'>;
export type AttemptId = Branded<'ATT'>;
export type RunId = Branded<'RUN'>;
export type BatchId = Branded<'BATCH'>;

export function isId<K extends IdKind>(kind: K, value: string): value is Branded<K> {
  return ID_PATTERNS[kind].test(value);
}

export function parseId<K extends IdKind>(kind: K, value: string): Branded<K> {
  if (!isId(kind, value)) {
    throw new DomainError(`invalid ${kind} id "${value}" (expected ${ID_PATTERNS[kind].source})`);
  }
  return value;
}

function idSchema<K extends IdKind>(kind: K, message = `expected a ${kind} id`): z.ZodType<Branded<K>> {
  return z
    .string()
    .regex(ID_PATTERNS[kind], message)
    .transform((value) => value as Branded<K>);
}

export const acceptanceIdSchema = idSchema('AC');
export const indicatorIdSchema = idSchema('IND');
export const invariantIdSchema = idSchema('INV');
export const judgeIdSchema = idSchema('J');
export const decisionIdSchema = idSchema('DEC');
export const attemptIdSchema = idSchema('ATT');
export const runIdSchema = idSchema('RUN');
export const batchIdSchema = idSchema('BATCH', 'expected a batch id such as B1 (the L prefix names the test levels L0–L4)');

/** `ATT-0001`, `DEC-0042`: four digits, never renumbered. */
export function formatSequentialId(kind: 'ATT' | 'DEC', ordinal: number): AttemptId | DecisionId {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 9999) {
    throw new DomainError(`a ${kind} ordinal must be an integer between 1 and 9999, got ${ordinal}`);
  }
  return `${kind}-${String(ordinal).padStart(4, '0')}` as AttemptId | DecisionId;
}

export function formatAttemptId(ordinal: number): AttemptId {
  return formatSequentialId('ATT', ordinal) as AttemptId;
}

export function formatDecisionId(ordinal: number): DecisionId {
  return formatSequentialId('DEC', ordinal) as DecisionId;
}

/** `RUN-20260930-1912-local`: timestamp in UTC, then the LLM target. */
export function formatRunId(at: Date, target: string): RunId {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}`;
  return parseId('RUN', `RUN-${stamp}-${target}`);
}
