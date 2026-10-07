import { LEVELS, type Level } from './bench-config.js';
import { DomainError } from './errors.js';
import { ID_PATTERNS, formatRunId, type RunId } from './ids.js';
import { STUB_PROFILE_NAME } from './profile.js';

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

/** The levels a run of this version may be asked to reach: the ones it runs, with the simulated LLM at most. */
export const RUNNABLE_MAX_LEVELS: readonly Level[] = ['static', 'component'];

export interface RunRequest {
  /** The highest level to reach; null when `--level` was not given: the run would go up to L4. */
  readonly maxLevel: Level | null;
  /** `--profile`, when given. */
  readonly profile: string | null;
}

/**
 * Why this version cannot serve a run request, or null when it can: it runs L0 and L2 with the
 * simulated LLM, so a level above L2 — the default without `--level` — or any other profile is
 * refused before anything starts, and so is L1 as the level to reach: a run asked for a level
 * that runs nothing would prove nothing.
 */
export function unsupportedRunRequest(request: RunRequest): string | null {
  if (request.profile !== null && request.profile !== STUB_PROFILE_NAME) {
    return `profile "${request.profile}": this version runs with the simulated LLM only (--profile ${STUB_PROFILE_NAME}, the default up to L2)`;
  }
  if (request.maxLevel === null) {
    return 'without --level a run reaches L4: this version runs L0 to L2 — pass --level L2';
  }
  if (request.maxLevel === 'unit') {
    return 'level L1: unit tests are not run by this version — pass --level L0, or --level L2 (L1 is then reported skipped)';
  }
  if (!RUNNABLE_MAX_LEVELS.includes(request.maxLevel)) {
    return `level ${LEVEL_LABELS[request.maxLevel]}: this version runs L0 to L2 — pass --level L2`;
  }
  return null;
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
