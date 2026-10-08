import { valueOf, wordOf } from './markdown.js';

/**
 * How the cells of `ACCEPTANCE.md` are read — by `orkeon-bench check`, which judges them, and so
 * by `orkeon-bench run`, which builds its report from what the check reads. Each cell is read by
 * what it opens with: a remark may follow a value, it never replaces it.
 */

/** The id of a row: the back-ticked span its cell opens with, or the word it opens with. */
export function idOf(cell: string): string {
  return wordOf(cell);
}

/**
 * Whether a `Status` cell drops its row: it opens with `dropped`, whatever its case, back-ticked
 * or not. `` active (was `dropped (DEC-0002)`, restored) `` opens with `active`: it drops nothing.
 */
export function isDropped(status: string): boolean {
  return valueOf(status).toLowerCase().startsWith('dropped');
}

/** The number a `Threshold` cell holds — a decimal point, no unit, back-ticked or not —, or null. */
export function thresholdOf(cell: string): number | null {
  const value = valueOf(cell);
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}
