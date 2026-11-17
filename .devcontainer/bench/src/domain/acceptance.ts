import type { Level } from './bench-config.js';
import { readAcceptance, type Direction } from './workbook/acceptance-rules.js';
import { cell, partNamed, readMarkdown, rowsWith, sectionNamed, sectionsOf, wordOf } from './workbook/markdown.js';

export { levelOfCell } from './level-cell.js';

/** A row of `## Acceptance` of `workbooks/<slug>/TEAM.md`: a criterion or an invariant and the level that proves it. */
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
  /** `>=`: the value must reach the threshold; `<=`: it must not exceed it; null when the row says neither. */
  readonly direction: Direction | null;
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
  /**
   * The decision providers `TEAM.md` declares (`declaredDecisionProviders`); empty or absent: the team
   * declares no decision model, and its decision indicators are not applicable on runs without one.
   */
  readonly decisionProviders?: readonly string[];
}

/**
 * The decision providers `TEAM.md` names under `## Acceptance § LLM targets § Decision model` (D96),
 * lowercased first words of the `Provider` cells (`typesafe`, `liquid`, `kev`): empty when the
 * sub-section is absent or every row says `none` — the team declares no decision model.
 */
export function declaredDecisionProviders(markdown: string): string[] {
  const targets = sectionNamed(partNamed(readMarkdown(markdown), 'Acceptance').sections, 'LLM targets');
  const decision = targets === null ? null : sectionNamed(sectionsOf(targets.lines, 4), 'Decision model');
  if (decision === null) {
    return [];
  }
  return rowsWith(decision.lines, 'Provider', ['Key variable', 'Base URL', 'Model'])
    .map((row) => wordOf(cell(row, 'Provider')).toLowerCase())
    .filter((word) => word !== '' && word !== 'none' && word !== '—' && word !== '-');
}

/**
 * The ids the team's `TEAM.md` declares under `## Acceptance` (template `.claude/templates/TEAM.md`), for
 * `orkeon-bench run`: read exactly as `orkeon-bench check` reads them (`readAcceptance`) — the
 * tables of the three sections that carry the columns of the template, comments and fenced
 * blocks left out, a cell by the back-ticked span it opens with. A row the check accepts is a row
 * the run sees, with the same level, the same status and the same threshold; a table the check
 * does not read declares nothing here either.
 */
export function parseAcceptance(markdown: string): DeclaredIds {
  const { ids, levelCells } = readAcceptance(partNamed(readMarkdown(markdown), 'Acceptance'));
  const declared = (row: { id: string; level: Level | null }): DeclaredId => ({ id: row.id, level: row.level, levelCell: levelCells.get(row.id) ?? '' });
  return {
    acceptance: ids.criteria.map(declared),
    invariants: ids.invariants.map(declared),
    indicators: ids.indicators.map((row) => ({ id: row.id, threshold: row.threshold, direction: row.direction })),
    dropped: [...ids.dropped],
    decisionProviders: declaredDecisionProviders(markdown),
  };
}
