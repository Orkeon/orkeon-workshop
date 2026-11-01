import { LEVELS, type Level } from './bench-config.js';
import { DomainError } from './errors.js';
import { ID_PATTERNS, formatRunId, type RunId } from './ids.js';

/** `L0`…`L4` in the workbook and in `--level`, in the order of `LEVELS` (FROZEN-LITERALS § 3). */
export const LEVEL_LABELS: Readonly<Record<Level, string>> = Object.freeze({ static: 'L0', unit: 'L1', component: 'L2', e2e_local: 'L3', e2e_remote: 'L4' });

/** `L2` or `component` → `component`; null for anything else. */
export function levelFromLabel(label: string): Level | null {
  const wanted = label.trim().toLowerCase();
  return LEVELS.find((level) => level === wanted || LEVEL_LABELS[level].toLowerCase() === wanted) ?? null;
}

export function parseLevel(label: string): Level {
  const level = levelFromLabel(label);
  if (level === null) {
    throw new DomainError(`unknown level "${label}" (expected L0…L4, or ${LEVELS.join(', ')})`);
  }
  return level;
}

/** The levels a run reaches, in execution order: every level up to `max`. */
export function levelsUpTo(max: Level): Level[] {
  return LEVELS.slice(0, LEVELS.indexOf(max) + 1);
}

export interface RunRequest {
  /** The highest level to reach; null when `--level` was not given: `defaultMaxLevel` then decides. */
  readonly maxLevel: Level | null;
  /** `--profile`, when given: the profile of the end-to-end levels. */
  readonly profile: string | null;
}

/**
 * The level a run reaches without `--level`: the highest level `bench.config.json` configures under
 * `levels`, and the component level when it configures none — a run never reaches a paid level by
 * default unless the team's configuration names it.
 */
export function defaultMaxLevel(configuredLevels: readonly Level[]): Level {
  return [...LEVELS].reverse().find((level) => configuredLevels.includes(level)) ?? 'component';
}

/**
 * The id of a new run: `RUN-<yyyymmdd>-<hhmm>-<target>`, and `-2`, `-3`… after the target when a
 * run of the same minute already took the name (`taken`: the entries of `runs/`, and the names
 * another process took in the meantime). The name is the caller's once it has created the folder.
 */
export function nextRunId(at: Date, target: string, taken: readonly string[]): RunId {
  const first = formatRunId(at, target);
  if (!taken.includes(first)) {
    return first;
  }
  for (let ordinal = 2; ; ordinal += 1) {
    const candidate = `${first}-${String(ordinal)}`;
    if (!taken.includes(candidate) && ID_PATTERNS.RUN.test(candidate)) {
      return candidate as RunId;
    }
  }
}
