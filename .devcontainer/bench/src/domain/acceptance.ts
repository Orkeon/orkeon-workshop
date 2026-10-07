import { LEVELS, type Level } from './bench-config.js';
import { ID_PATTERNS } from './ids.js';
import { LEVEL_LABELS } from './run.js';

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
 * The level a `Level` cell names, as the template writes them — `L3`, `L3 e2e local`, `e2e_local`,
 * `L3 (local)` — or null when the cell names none, or more than one (`L3 / L4`): a level the bench
 * has to guess is a level it does not know.
 */
export function levelOfCell(cell: string): Level | null {
  const text = cell.toLowerCase();
  const named = new Set<Level>();
  for (const level of LEVELS) {
    const label = LEVEL_LABELS[level].toLowerCase();
    const name = level.replace('_', '[ _-]');
    if (new RegExp(`(^|[^a-z0-9])${label}([^a-z0-9]|$)`).test(text) || new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`).test(text)) {
      named.add(level);
    }
  }
  // `static`, `unit` and `component` are also words: beside a label (`L3 — unit of work`) the label decides.
  const labelled = LEVELS.filter((level) => new RegExp(`(^|[^a-z0-9])${LEVEL_LABELS[level].toLowerCase()}([^a-z0-9]|$)`).test(text));
  const levels = labelled.length > 0 ? labelled : [...named];
  return levels.length === 1 ? (levels[0] as Level) : null;
}

/**
 * The ids the team's `ACCEPTANCE.md` declares (template `.claude/templates/ACCEPTANCE.md`): every
 * table row whose first cell is an `AC-`, `IND-` or `INV-` id, with the `Level`, `Status` and
 * `Threshold` columns of its table when it has them.
 */
export function parseAcceptance(markdown: string): DeclaredIds {
  const acceptance: DeclaredId[] = [];
  const invariants: DeclaredId[] = [];
  const indicators: DeclaredIndicator[] = [];
  const dropped: string[] = [];
  let header: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const cells = tableCells(line);
    if (cells === null) {
      header = [];
      continue;
    }
    const first = cells[0] ?? '';
    if (first.toLowerCase() === 'id') {
      header = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    const cell = (name: string): string => cells[header.indexOf(name)] ?? '';
    if (cell('status').toLowerCase().startsWith('dropped')) {
      if ((ID_PATTERNS.AC.test(first) || ID_PATTERNS.IND.test(first) || ID_PATTERNS.INV.test(first)) && !dropped.includes(first)) {
        dropped.push(first);
      }
      continue;
    }
    if (ID_PATTERNS.IND.test(first)) {
      if (!indicators.some((declared) => declared.id === first)) {
        const threshold = cell('threshold').trim();
        indicators.push({ id: first, threshold: /^-?\d+(\.\d+)?$/.test(threshold) ? Number(threshold) : null });
      }
      continue;
    }
    const target = ID_PATTERNS.AC.test(first) ? acceptance : ID_PATTERNS.INV.test(first) ? invariants : null;
    if (target !== null && !target.some((declared) => declared.id === first)) {
      target.push({ id: first, level: levelOfCell(cell('level')), levelCell: cell('level') });
    }
  }
  // A row that is active somewhere is not dropped, whatever another row of the same id says.
  const active = [...acceptance, ...invariants, ...indicators].map((declared) => declared.id);
  return { acceptance, invariants, indicators, dropped: dropped.filter((id) => !active.includes(id)) };
}

/** The cells of a Markdown table row, trimmed; null for any other line. */
function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}
