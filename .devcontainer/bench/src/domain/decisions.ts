import { parseDecision, type DecisionAnswer, type ObservedTask, type RunEvents } from './run-events.js';

/**
 * The decision tasks of a run (D96), as the events of `orkeon run --events jsonl` show them (Orkeon
 * c727c06): `task.completed` with `isDecision`, `defaulted` and `decision`. The events carry no task
 * key — `taskId` is a ULID —, so a task is named by its `taskId`, `taskName`, `agentRole` or `agentId`;
 * a decision task also by the key the `skipReason` of a task it gates names
 * (`… on decision task <key>: <answers>`, `decision <key> did not run`).
 */

/** What the decision tasks of one run come to: the measures `decision_defaulted_rate` and `decision_confidence_min`. */
export interface DecisionSummary {
  /** Decision tasks that completed (`isDecision`). */
  readonly tasks: number;
  /** Those whose answer is the fallback's (`defaulted`). */
  readonly defaulted: number;
  /** The lowest confidence over the answers that could be read; null when none carries one. */
  readonly confidence_min: number | null;
}

/** Null when the run completed no decision task: the measures are then not computed. */
export function decisionSummary(events: RunEvents): DecisionSummary | null {
  const decisions = events.tasks.filter((task) => task.isDecision);
  if (decisions.length === 0) {
    return null;
  }
  const confidences = decisions.flatMap((task) => (task.decision ?? []).map((answer) => answer.confidence)).filter((value): value is number => value !== null);
  return {
    tasks: decisions.length,
    defaulted: decisions.filter((task) => task.defaulted).length,
    confidence_min: confidences.length === 0 ? null : Math.min(...confidences),
  };
}

/** True when `name` is one of the ids of the event: `taskId`, `taskName`, `agentRole`, `agentId`. */
export function namesTask(task: ObservedTask, name: string): boolean {
  return task.taskId === name || task.taskName === name || task.agentId === name || (task.role !== '' && task.role === name);
}

const GATED = /on decision task (\S+): (.*)$/s;
const NOT_RUN = /^decision (\S+) did not run/;

/** The answers a `skipReason` quotes, in a form two equal answers share whatever their order. */
function answersKey(answers: readonly DecisionAnswer[]): string {
  return [...answers]
    .map((answer) => `${answer.question}=${answer.chosen}`)
    .sort()
    .join('|');
}

/** The decision tasks of a run that `name` designates; `notRun` when a skip reason says that decision did not run. */
export function decisionTasksNamed(events: RunEvents, name: string): { readonly tasks: readonly ObservedTask[]; readonly notRun: boolean } {
  const decisions = events.tasks.filter((task) => task.isDecision);
  const direct = decisions.filter((task) => namesTask(task, name));
  if (direct.length > 0) {
    return { tasks: direct, notRun: false };
  }
  const reasons = events.tasks.map((task) => task.skipReason).filter((reason): reason is string => reason !== null);
  if (reasons.some((reason) => NOT_RUN.exec(reason)?.[1] === name)) {
    return { tasks: [], notRun: true };
  }
  // The key named by the skip reason of a gated task, matched to the decision whose answers it quotes.
  const keys = new Set<string>();
  for (const reason of reasons) {
    const match = GATED.exec(reason);
    if (match === null) {
      continue;
    }
    const key = match[1] as string;
    keys.add(key);
    if (key !== name) {
      continue;
    }
    const quoted = parseDecision(match[2] as string);
    const found = quoted === null ? [] : decisions.filter((task) => task.decision !== null && answersKey(task.decision) === answersKey(quoted));
    if (found.length === 1) {
      return { tasks: found, notRun: false };
    }
  }
  // A crew with a single decision task, no other key named: that task is the one.
  if (decisions.length === 1 && [...keys].every((key) => key === name)) {
    return { tasks: decisions, notRun: false };
  }
  return { tasks: [], notRun: false };
}

/** The tool through which an agent asks the decision model itself (registered beside an active provider). */
export const DECISION_TOOL = 'system_one_decide';

/**
 * The calls a run makes, or would make, to the decision model: its decision tasks — answered or
 * defaulted, since a run without a decision model answers from the fallback what a run with one
 * asks — and its calls of `system_one_decide`. The input guard's calls are not in the events.
 */
export function decisionCalls(events: RunEvents): number {
  return events.tasks.filter((task) => task.isDecision).length + events.toolCalls.filter((call) => call.tool === DECISION_TOOL).length;
}
