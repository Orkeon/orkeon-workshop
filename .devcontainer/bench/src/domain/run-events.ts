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

export interface ObservedTask {
  readonly role: string;
  readonly success: boolean;
  readonly skipped: boolean;
}

export interface RunFinish {
  readonly success: boolean;
  readonly exitCode: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly durationMs: number;
}

export interface RunEvents {
  /** Null when the stream has no `run.finished`: the process was killed, or refused before routing. */
  readonly finished: RunFinish | null;
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
        tasks.push({ role: text(event.agentRole) ?? text(event.agentId) ?? '', success: event.success === true, skipped: event.skipped === true });
        break;
      case 'input.needed':
        humanInputs += 1;
        break;
      case 'error':
        errors.push(text(event.message) ?? text(event.code) ?? 'error');
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
  return { finished, tasks, toolCalls: calls.map(({ tool, success }) => ({ tool, success })), humanInputs, errors, malformed };
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
