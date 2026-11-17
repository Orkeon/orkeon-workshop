/**
 * What the bench reads in the event stream of `orkeon run --events jsonl` (protocol version 2,
 * `references/orkeon/cli.md` § 3): one JSON object per line, unknown kinds and fields ignored. Of the
 * nineteen kinds of Orkeon 1.2.0 (`RunEventKinds`), it reads `tool.called`, `tool.returned`,
 * `delegation.started`, `agent.spawned`, `task.completed`, `input.needed`, `error`, `cost.updated` and
 * `run.finished`; `run.started`, `task.started`, `llm.delta`, `llm.call.*`, `llm.fallback`,
 * `graph.node.entered`, `input.given` and `hub.message` change nothing it measures.
 */
export interface ObservedToolCall {
  /** `delegate_work_to_coworker` and `spawn_agent` come as events of their own and are named here. */
  readonly tool: string;
  /** Null when the run ended before the tool returned. */
  readonly success: boolean | null;
}

/** One answer of a decision task: the option chosen for a question, and how sure the model was. */
export interface DecisionAnswer {
  readonly question: string;
  readonly chosen: string;
  /** Null when the answer carries no confidence that is a number. */
  readonly confidence: number | null;
}

export interface ObservedTask {
  readonly role: string;
  readonly success: boolean;
  readonly skipped: boolean;
  /** The ids of the event (`taskId` is a ULID, new at each run; `taskName` is read when present, and Orkeon 1.2.0 sends none: the role is what names a task across runs): what a check names a task by, with `role`. */
  readonly taskId: string | null;
  readonly taskName: string | null;
  readonly agentId: string | null;
  /** A decision task (`isDecision`), answered by the decision model or from its fallback. */
  readonly isDecision: boolean;
  /** Its answer is the fallback's (`defaulted`): no decision model, `--no-decision`, or a call that failed. */
  readonly defaulted: boolean;
  /**
   * The answers of a decision task (`decision`, a JSON object by question); null when the event
   * carries none, or one that cannot be read (`decisionUnparsed`).
   */
  readonly decision: readonly DecisionAnswer[] | null;
  readonly decisionUnparsed: boolean;
  /** Why the task was skipped (`skipReason`); null when it ran, or when Orkeon says nothing. */
  readonly skipReason: string | null;
  /**
   * Its agent stopped on its iteration cap, not on an answer of its own (`endedOnIterationCap`, Orkeon
   * 1.2.0): the task may still have succeeded, on what the last iteration left.
   */
  readonly endedOnIterationCap: boolean;
  /** A file the task declares as its output was not written (`deliverableMissing`, Orkeon 1.2.0). */
  readonly deliverableMissing: boolean;
}

export interface RunFinish {
  readonly success: boolean;
  readonly exitCode: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly durationMs: number;
  /** The tasks whose last attempt ended on the iteration cap (`cappedTasks`, Orkeon 1.2.0); 0 when Orkeon sends none. */
  readonly cappedTasks: number;
  /** The tasks that succeeded without a file they declare as output (`missingDeliverables`, Orkeon 1.2.0). */
  readonly missingDeliverables: number;
  /** The run stopped on a question to a person, to be resumed (`status: "waiting_for_input"`, exit code 75). */
  readonly waitingForInput: boolean;
}

/** The last `cost.updated` of the stream: the cumulative figures of the run, and what model answered. */
export interface RunCost {
  readonly tokens: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string | null;
  readonly provider: string | null;
}

export interface RunEvents {
  /** Null when the stream has no `run.finished`: the process was killed, or refused before routing. */
  readonly finished: RunFinish | null;
  /** Null when no generation call was metered. */
  readonly cost: RunCost | null;
  readonly tasks: readonly ObservedTask[];
  readonly toolCalls: readonly ObservedToolCall[];
  /** `input.needed` events: the questions the team asked a person. */
  readonly humanInputs: number;
  /** The messages of the `error` events. */
  readonly errors: readonly string[];
  /** Lines that are not a JSON object: stdout is protocol-only, so each one is a defect. */
  readonly malformed: number;
}

export function parseRunEvents(stdout: string): RunEvents {
  let finished: RunFinish | null = null;
  let cost: RunCost | null = null;
  let llm: { model: string | null; provider: string | null } = { model: null, provider: null };
  const tasks: ObservedTask[] = [];
  const calls: { tool: string; correlationId: string | null; success: boolean | null }[] = [];
  const errors: string[] = [];
  let humanInputs = 0;
  let malformed = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') {
      continue;
    }
    const event = parseLine(line);
    if (event === null) {
      malformed += 1;
      continue;
    }
    const correlationId = text(event.correlationId);
    switch (event.kind) {
      case 'tool.called':
        calls.push({ tool: text(event.toolName) ?? '', correlationId, success: null });
        break;
      case 'delegation.started':
        calls.push({ tool: 'delegate_work_to_coworker', correlationId, success: null });
        break;
      case 'agent.spawned':
        calls.push({ tool: 'spawn_agent', correlationId, success: null });
        break;
      case 'tool.returned': {
        const call = calls.find((candidate) => candidate.success === null && candidate.correlationId !== null && candidate.correlationId === correlationId);
        if (call !== undefined) {
          call.success = event.success === true;
        }
        break;
      }
      case 'task.completed':
        tasks.push(observedTask(event));
        break;
      case 'input.needed':
        humanInputs += 1;
        break;
      case 'error':
        errors.push(text(event.message) ?? text(event.code) ?? 'error');
        break;
      case 'cost.updated':
        cost = { tokens: count(event.tokens), promptTokens: count(event.promptTokens), completionTokens: count(event.completionTokens), model: null, provider: null };
        // A reading of a decision call (`operation: "decision"`, a decision profile's stage) names the decision
        // model: its figures are the run's, cumulative, but the model and the provider stay the LLM's.
        if (event.operation !== 'decision') {
          llm = { model: text(event.model), provider: text(event.provider) };
        }
        break;
      case 'run.finished':
        finished = {
          success: event.success === true,
          exitCode: count(event.exitCode),
          promptTokens: count(event.promptTokens),
          completionTokens: count(event.completionTokens),
          durationMs: count(event.durationMs),
          cappedTasks: count(event.cappedTasks),
          missingDeliverables: count(event.missingDeliverables),
          waitingForInput: event.status === 'waiting_for_input',
        };
        break;
      default:
        break;
    }
  }
  return { finished, cost: cost === null ? null : { ...cost, ...llm }, tasks, toolCalls: calls.map(({ tool, success }) => ({ tool, success })), humanInputs, errors, malformed };
}

/**
 * Why a run failed when the cause may be a decision, not the team (Orkeon 1.2.0, read in its sources;
 * the judge's sentence observed on the CLI). The run stream carries no structured block: `task.completed` has
 * no error, and the `error` event's `code` is `crew_failed` or `crew_cancelled` only
 * (`RunEventErrorCodes`). What Orkeon writes is the `crew_failed` message, one part per task,
 * `Task <id> (<role>) failed: <exception message>`; the bench reads the reason only at the start of a part
 * whose task the stream shows failing, so a text an input carries further on cannot pass for it.
 * - `decision_blocked`: the reason starts with `DecisionBlockedException`'s `Blocked by the decision stage
 *   '<stage>' of profile '<profile>': …`, or is the LLM judge's (`Orkeon:Guardian:Llm`, `LlmJudgeGuard`)
 *   `Blocked by Guardian (input|output): The input|output matches the risk '<risk>' at <p>.` — a decision,
 *   to read against the input;
 * - `decision_provider`: a decision task failed, or a fail-closed stage blocked (`… the decision stage
 *   failed and the profile is fail-closed: <cause>`), or the LLM judge could not judge and refuses, its
 *   default (`Blocked by Guardian (input|output): the decision model could not judge the input|output:
 *   <cause>`, `FailMode: Closed`), and the `DecisionModelException` is the provider's
 *   (`SystemOneDecisionModel`): `could not be reached at`, `did not answer within … s`, `rate limit reached
 *   (429)`, `is overloaded (529)`, `answered 5xx:` — cause `unreachable`; `refused the key:` (401/403) or
 *   `No <name> API key:` — cause `key`;
 * - `team`: anything else — among them a `DecisionModelException` the team's request caused (`Invalid
 *   decision request: …`, `refused the request: …` on a 400/422 or a state over the context limit), and a
 *   a block of the guardian's own rules (`Blocked by Guardian (…): …` in any other words), and a run where
 *   a team failure sits next to a decision one (a parallel or graph crew): the decision parts are then
 *   listed in the detail.
 * A script that does not catch the `DecisionBlockedError` leaves no `error` event: only then is stderr
 * read, on a line starting with `ScriptHost`'s `Script rejected with: DecisionBlockedError: `.
 */
export type DecisionFailureKind = 'decision_blocked' | 'decision_provider';
export type RunFailureClass = 'team' | DecisionFailureKind;
/** Of a `decision_provider` failure: the provider down or overloaded, or its key refused or missing. */
export type ProviderFailureCause = 'unreachable' | 'key';

export interface DecisionFailure {
  readonly kind: RunFailureClass;
  /** Of `decision_provider` only. */
  readonly cause?: ProviderFailureCause;
  /** Orkeon's sentence for it: the failed task's part of the `crew_failed` message, or the stderr line. */
  readonly detail: string;
}

const PART = /^Task (\S+) \((.*?)\) (failed|skipped): ([\s\S]*)$/;
const BLOCKED = /^Blocked by the decision stage '[^']*' of profile '[^']*': /;
const FAIL_CLOSED = 'the decision stage failed and the profile is fail-closed: ';
const GUARDIAN = /^Blocked by Guardian \((input|output)\): /;
const JUDGE_UNAVAILABLE = /^the decision model could not judge the (?:input|output): /;
const JUDGE_BLOCKED = /^The (?:input|output) matches the risk '/;
const SCRIPT_REJECTED = 'Script rejected with: DecisionBlockedError: ';
const PROVIDER_NAME = '(?:typesafe|liquid|kev)';
const UNREACHABLE = new RegExp(`^${PROVIDER_NAME} (?:could not be reached at |did not answer within |rate limit reached \\(429\\)|is overloaded \\(529\\)|answered 5\\d\\d: )`, 'i');
const KEY = new RegExp(`^(?:${PROVIDER_NAME} refused the key: |No ${PROVIDER_NAME} API key: )`, 'i');

/** The cause of a `DecisionModelException` message when the provider is at fault; null when the request is. */
function providerCause(message: string): ProviderFailureCause | null {
  return UNREACHABLE.test(message) ? 'unreachable' : KEY.test(message) ? 'key' : null;
}

/** The class of one failure reason; `decisionTask` when the failed task is a decision task. */
function classifyReason(reason: string, decisionTask: boolean): { kind: RunFailureClass; cause?: ProviderFailureCause } {
  if (BLOCKED.test(reason)) {
    const closed = reason.indexOf(FAIL_CLOSED);
    if (closed < 0) {
      return { kind: 'decision_blocked' };
    }
    const cause = providerCause(reason.slice(closed + FAIL_CLOSED.length));
    return cause === null ? { kind: 'team' } : { kind: 'decision_provider', cause };
  }
  const guardian = GUARDIAN.exec(reason);
  if (guardian !== null) {
    const verdict = reason.slice(guardian[0].length);
    if (JUDGE_BLOCKED.test(verdict)) {
      return { kind: 'decision_blocked' };
    }
    const unavailable = JUDGE_UNAVAILABLE.exec(verdict);
    const judgeCause = unavailable === null ? null : providerCause(verdict.slice(unavailable[0].length));
    return judgeCause === null ? { kind: 'team' } : { kind: 'decision_provider', cause: judgeCause };
  }
  const cause = decisionTask ? providerCause(reason) : null;
  return cause === null ? { kind: 'team' } : { kind: 'decision_provider', cause };
}

/** The decision failure of a run (see `DecisionFailureKind`); null when it failed for the team alone, or did not fail. */
export function decisionFailureOf(events: RunEvents, stderr = ''): DecisionFailure | null {
  const failed = events.tasks.filter((task) => !task.success && !task.skipped);
  const judged: { kind: RunFailureClass; cause?: ProviderFailureCause; detail: string }[] = [];
  for (const part of events.errors.flatMap(failureParts)) {
    const match = PART.exec(part);
    if (match === null || match[3] !== 'failed') {
      continue;
    }
    const [, taskId, role, , reason] = match as unknown as [string, string, string, string, string];
    const task = failed.find((candidate) => candidate.taskId === taskId || (candidate.taskId === null && candidate.role === role));
    if (task === undefined) {
      judged.push({ kind: 'team', detail: part });
      continue;
    }
    judged.push({ ...classifyReason(reason, task.isDecision || role === 'decision'), detail: part });
  }
  if (events.errors.length === 0) {
    for (const line of stderr.split(/\r?\n/)) {
      if (line.startsWith(SCRIPT_REJECTED)) {
        judged.push({ ...classifyReason(line.slice(SCRIPT_REJECTED.length), false), detail: line.trim() });
      }
    }
  }
  const decisions = judged.filter((entry) => entry.kind !== 'team');
  if (decisions.length === 0) {
    return null;
  }
  if (judged.length > decisions.length) {
    return { kind: 'team', detail: `a team failure next to decision failures — ${decisions.map((entry) => `${entry.kind}: ${entry.detail}`).join(' | ')}` };
  }
  const provider = decisions.filter((entry) => entry.kind === 'decision_provider');
  if (provider.length > 0) {
    const cause: ProviderFailureCause = provider.some((entry) => entry.cause === 'key') ? 'key' : 'unreachable';
    return { kind: 'decision_provider', cause, detail: provider.map((entry) => entry.detail).join(' | ') };
  }
  return { kind: 'decision_blocked', detail: decisions.map((entry) => entry.detail).join(' | ') };
}

/** The parts of a `crew_failed` message, one per task (`Task <id> (<role>) failed: …; Task …`). */
function failureParts(message: string): string[] {
  return message
    .split(/;\s+(?=Task \S+ \()/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function observedTask(event: Record<string, unknown>): ObservedTask {
  const raw = event.decision;
  const decision = raw === undefined || raw === null ? null : parseDecision(raw);
  return {
    role: text(event.agentRole) ?? text(event.agentId) ?? '',
    success: event.success === true,
    skipped: event.skipped === true,
    taskId: text(event.taskId),
    taskName: text(event.taskName),
    agentId: text(event.agentId),
    isDecision: event.isDecision === true,
    defaulted: event.defaulted === true,
    decision,
    decisionUnparsed: raw !== undefined && raw !== null && decision === null,
    skipReason: text(event.skipReason),
    endedOnIterationCap: event.endedOnIterationCap === true,
    deliverableMissing: event.deliverableMissing === true,
  };
}

/**
 * The answers of a decision, given as a JSON string (Orkeon 1.2.0, `DecisionAnswers`) or an object:
 * `{"route":{"chosen":"fix","probabilities":{…},"confidence":0.92},"defaulted":true}`. Null when it is
 * no object, or a question has no `chosen` string: the bench never guesses an answer.
 */
export function parseDecision(raw: unknown): DecisionAnswer[] | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) {
    return null;
  }
  const answers: DecisionAnswer[] = [];
  for (const [question, answer] of Object.entries(value)) {
    if (question === 'defaulted' && typeof answer === 'boolean') {
      continue;
    }
    if (!isRecord(answer) || typeof answer.chosen !== 'string') {
      return null;
    }
    const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : null;
    answers.push({ question, chosen: answer.chosen, confidence });
  }
  return answers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}
