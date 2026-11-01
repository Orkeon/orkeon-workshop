import type { Level } from './bench-config.js';
import type { DecisionSummary } from './decisions.js';
import type { RunId } from './ids.js';
import type { CheckResult } from './scenario-checks.js';
import type { ScenarioIndicator } from './scenario.js';

export type LevelStatus = 'pass' | 'fail' | 'skipped';

/** One static check of L0: `skipped` when what it needs is not there, with the reason. */
export interface StaticCheck {
  readonly id: string;
  readonly status: LevelStatus;
  readonly detail: string;
}

/** What the archive rules of the invariants read in one run (plan § 2 bis). */
export interface ScenarioFacts {
  /** The read-only mount points whose content changed during the run. */
  readonly read_only_changed: readonly string[];
  /** Where something that looks like a key was found: `events.jsonl`, `stderr.log`, a file of the output snapshot. */
  readonly secrets_found: readonly string[];
  /** The tools the run called, in order, as the events name them. */
  readonly tools_called: readonly string[];
  /** The tools called that the catalogue the bench knows does not list. */
  readonly tools_unknown: readonly string[];
  /** The ids of the `json-schema` checks that failed. */
  readonly schema_failed: readonly string[];
  /** The ids of the `text-absent` checks that failed. */
  readonly text_absent_failed: readonly string[];
}

export const NO_FACTS: ScenarioFacts = Object.freeze({ read_only_changed: [], secrets_found: [], tools_called: [], tools_unknown: [], schema_failed: [], text_absent_failed: [] });

/** A scenario that ran, as `report.json` lists it under its level: one entry per iteration. */
export interface ScenarioResult {
  readonly id: string;
  readonly title: string;
  /** Relative to `tests/<slug>/`. */
  readonly file: string;
  readonly level: Level;
  /** 1 for the only run of a scenario; 1…n when the level repeats it. */
  readonly iteration: number;
  readonly status: 'pass' | 'fail';
  readonly covers: readonly string[];
  /** Null when the scenario failed before `orkeon run` started. */
  readonly run: RunId | null;
  readonly dataset: string | null;
  /** The datasets the run went through: the one of `dataset`, or those of the sequence. */
  readonly datasets: readonly string[];
  /** The model that answered: the stub's, the profile's, or the one the cost events name; empty when unknown. */
  readonly model: string;
  readonly exit_code: number | null;
  readonly duration_seconds: number;
  readonly tokens_in: number;
  readonly tokens_out: number;
  /** What the run cost at the price of its profile; null when the profile has none. */
  readonly usd: number | null;
  readonly tool_calls: number;
  readonly human_inputs: number;
  /** D96: the decision tasks the run completed (`decisionSummary`); absent when it completed none. */
  readonly decisions?: DecisionSummary;
  /** What the scenario asks the bench to measure. */
  readonly indicators: readonly ScenarioIndicator[];
  readonly checks: readonly CheckResult[];
  readonly facts: ScenarioFacts;
}
