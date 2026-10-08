import { LEVELS, type Level } from './bench-config.js';
import { LEVEL_LABELS } from './run.js';

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
