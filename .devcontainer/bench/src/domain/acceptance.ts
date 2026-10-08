import type { Level } from './bench-config.js';
import { readAcceptance } from './workbook/acceptance-rules.js';
import { readMarkdown } from './workbook/markdown.js';

export { levelOfCell } from './level-cell.js';

/** A row of `workbooks/<slug>/ACCEPTANCE.md`: a criterion or an invariant and the level that proves it. */
export interface DeclaredId {
  readonly id: string;
  /** Null when the `Level` cell names no single level the bench knows. */
  readonly level: Level | null;
  /** The `Level` cell as written, for the message that says it cannot be read. */
  readonly levelCell: string;
}

/** An indicator row: the threshold it must meet, when the cell holds a number. */
export interface DeclaredIndicator {
  readonly id: string;
  readonly threshold: number | null;
}

export interface DeclaredIds {
  /** The active acceptance criteria; a row whose status starts with `dropped` is left out. */
  readonly acceptance: readonly DeclaredId[];
  readonly invariants: readonly DeclaredId[];
  readonly indicators: readonly DeclaredIndicator[];
  /**
   * The ids of the rows whose status starts with `dropped`: known, and given up by a decision. They
   * are no part of a report — a scenario that still covers one gets a warning, not a verdict.
   */
  readonly dropped: readonly string[];
}

/**
 * The ids the team's `ACCEPTANCE.md` declares (template `.claude/templates/ACCEPTANCE.md`), for
 * `orkeon-bench run`: read exactly as `orkeon-bench check` reads them (`readAcceptance`) — the
 * tables of the three sections that carry the columns of the template, comments and fenced
 * blocks left out, a cell by the back-ticked span it opens with. A row the check accepts is a row
 * the run sees, with the same level, the same status and the same threshold; a table the check
 * does not read declares nothing here either.
 */
export function parseAcceptance(markdown: string): DeclaredIds {
  const { ids, levelCells } = readAcceptance(readMarkdown(markdown));
  const declared = (row: { id: string; level: Level | null }): DeclaredId => ({ id: row.id, level: row.level, levelCell: levelCells.get(row.id) ?? '' });
  return {
    acceptance: ids.criteria.map(declared),
    invariants: ids.invariants.map(declared),
    indicators: ids.indicators.map((row) => ({ id: row.id, threshold: row.threshold })),
    dropped: [...ids.dropped],
  };
}
