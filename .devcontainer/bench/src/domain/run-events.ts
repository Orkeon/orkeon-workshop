/**
 * What the bench reads in the event stream of `orkeon run --events jsonl` (protocol version 2,
 * `references/orkeon/cli.md` § 3): one JSON object per line, unknown kinds and fields ignored.
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
  /** The ids of the event (`taskId` is a ULID; `taskName` when Orkeon sends one): what a check names a task by, with `role`. */
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
}

export interface RunFinish {
  readonly success: boolean;
  readonly exitCode: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly durationMs: number;
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
        cost = { tokens: count(event.tokens), promptTokens: count(event.promptTokens), completionTokens: count(event.completionTokens), model: text(event.model), provider: text(event.provider) };
        break;
      case 'run.finished':
        finished = {
          success: event.success === true,
          exitCode: count(event.exitCode),
          promptTokens: count(event.promptTokens),
          completionTokens: count(event.completionTokens),
          durationMs: count(event.durationMs),
        };
        break;
      default:
        break;
    }
  }
  return { finished, cost, tasks, toolCalls: calls.map(({ tool, success }) => ({ tool, success })), humanInputs, errors, malformed };
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
  };
}

/**
 * The answers of a decision, given as a JSON string (Orkeon c727c06) or an object:
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
