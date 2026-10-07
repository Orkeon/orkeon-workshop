import { z } from 'zod';

import { STUB_MODEL } from './profile.js';
import { parseWith } from './schema.js';

/**
 * The simulated LLM (plan § 6.3): a reply script and the rule that picks an answer for a request.
 * Pure: the HTTP server that carries it is an adapter (`infrastructure/node-llm-stub.ts`).
 */
export const STUB_SCRIPT_VERSION = '1.0';

const scriptedCallSchema = z.strictObject({
  /** A tool of the agent, as its definition names it. */
  name: z.string().regex(/^[a-z0-9_]+$/, 'a tool name is snake_case'),
  /** Sent as written: the real tool then runs with them. */
  arguments: z.record(z.string(), z.unknown()).default({}),
});
export type ScriptedCall = z.infer<typeof scriptedCallSchema>;

const turnSchema = z.union([z.strictObject({ tool_calls: z.array(scriptedCallSchema).min(1) }), z.strictObject({ content: z.string() })]);
export type StubTurn = z.infer<typeof turnSchema>;

const ruleSchema = z
  .strictObject({
    /**
     * Which requests the rule answers: `role` is the agent's role, read from the system message
     * (`You are <role>.`), `task` a text the prompt of the task holds. Both must hold; a rule
     * without either answers every request.
     */
    match: z.strictObject({ role: z.string().min(1).optional(), task: z.string().min(1).optional() }).default({}),
    /** One answer per model call of the conversation, in order; the last one is the final text. */
    turns: z.array(turnSchema).min(1),
  })
  .superRefine((rule, context) => {
    const last = rule.turns[rule.turns.length - 1];
    if (last !== undefined && !('content' in last)) {
      context.addIssue({ code: 'custom', path: ['turns', rule.turns.length - 1], message: 'the last turn of a rule is a final text ({ "content": … }): a conversation never ends on a tool call' });
    }
  });
export type StubRule = z.infer<typeof ruleSchema>;

/** A reply script: rules tried in order, the first that matches answers. */
export const stubScriptSchema = z.strictObject({
  schema_version: z.literal(STUB_SCRIPT_VERSION).default(STUB_SCRIPT_VERSION),
  replies: z.array(ruleSchema),
  /** The final text of a request no rule matches; without it such a request is an issue. */
  fallback: z.strictObject({ content: z.string() }).optional(),
});
export type StubScript = z.infer<typeof stubScriptSchema>;

export function parseStubScript(input: unknown, what = 'reply script'): StubScript {
  return parseWith(stubScriptSchema, input, what);
}

/** Answers `OK` to everything and flags nothing: what `tools dump` records against. */
export const RECORDER_SCRIPT: StubScript = Object.freeze({ schema_version: STUB_SCRIPT_VERSION, replies: [], fallback: { content: 'OK' } });

/** Sent when no rule matches and the script has no fallback: the run goes on, the exchange carries the issue. */
export const UNSCRIPTED_REPLY = '[llm-stub] no scripted reply for this request';

/**
 * The two dialects Orkeon speaks to a local endpoint: OpenAI's (`/v1/chat/completions`) on
 * `127.0.0.1`, and Ollama's when it infers that provider (`localhost`, port 11434) — `/api/chat`
 * for a request with tools, `/api/generate` for one without (seen on a build of fb26364).
 */
export type StubDialect = 'openai' | 'ollama-chat' | 'ollama-generate';

export function dialectOf(path: string): StubDialect | null {
  const route = path.split('?')[0] ?? '';
  if (route.endsWith('/chat/completions')) {
    return 'openai';
  }
  if (route.endsWith('/api/chat')) {
    return 'ollama-chat';
  }
  if (route.endsWith('/api/generate')) {
    return 'ollama-generate';
  }
  return null;
}

/** One request and its answer, as the stub logs them (`stub-exchanges.jsonl` of a run). */
export interface StubExchange {
  /** 1 for the first request the stub received. */
  readonly seq: number;
  readonly path: string;
  readonly dialect: StubDialect | null;
  /** The agent's role, when the request names one. */
  readonly role: string | null;
  /** Index of the rule that answered in `replies`; null for the fallback or no rule. */
  readonly rule: number | null;
  /** Index of the turn sent, in the rule. */
  readonly turn: number | null;
  /** What a scenario must not let pass: an unscripted request, a call the request cannot take… */
  readonly issues: readonly string[];
  /** The JSON body received; null when it was not JSON. */
  readonly request: unknown;
  readonly reply: StubTurn;
  /** The HTTP status sent; 0 when nothing was sent (a dropped request). */
  readonly status: number;
  /** The body sent back. */
  readonly response: unknown;
}

interface OfferedTool {
  readonly name: string;
  readonly required: readonly string[];
  /** Null when the schema lists no property: any argument passes. */
  readonly properties: readonly string[] | null;
}

interface Conversation {
  /** The text a `role` is read from. */
  readonly system: string;
  /** The text a `task` is looked up in. */
  readonly prompt: string;
  /** The model calls already answered in this conversation: the index of the turn to send. */
  readonly answered: number;
  /** Null when the request carries no `tools[]`. */
  readonly tools: readonly OfferedTool[] | null;
}

/** The answer to one request: the reply the script picks, what is wrong with it, and the body to send. */
export function answerStubRequest(script: StubScript, path: string, body: unknown, seq: number): StubExchange {
  const dialect = dialectOf(path);
  if (dialect === null) {
    const reply = { content: '' };
    return { seq, path, dialect, role: null, rule: null, turn: null, issues: [`the stub does not serve POST ${path}`], request: body, reply, status: 404, response: { error: { message: `unknown path ${path}` } } };
  }
  const issues: string[] = [];
  if (!isRecord(body)) {
    issues.push('the request body is not a JSON object');
  }
  const conversation = readConversation(dialect, isRecord(body) ? body : {});
  const role = roleOf(conversation.system);
  const rule = script.replies.findIndex((candidate) => matches(candidate, role, conversation.prompt));
  let reply: StubTurn;
  let turn: number | null = null;
  if (rule === -1) {
    reply = { content: script.fallback?.content ?? UNSCRIPTED_REPLY };
    if (script.fallback === undefined) {
      issues.push(`no rule of the script matches this request${role === null ? '' : ` (role "${role}")`}`);
    }
  } else {
    const turns = (script.replies[rule] as StubRule).turns;
    turn = Math.min(conversation.answered, turns.length - 1);
    reply = turns[turn] as StubTurn;
    if (conversation.answered >= turns.length) {
      issues.push(`rule ${String(rule)} scripts ${String(turns.length)} turn(s) and this is call ${String(conversation.answered + 1)} of the conversation: its last turn was sent again`);
    }
  }
  if ('tool_calls' in reply) {
    if (dialect === 'ollama-generate') {
      issues.push('a tool call cannot answer /api/generate: the request offers no tool');
      reply = { content: '' };
    } else {
      issues.push(...reply.tool_calls.flatMap((call) => callIssues(call, conversation.tools)));
    }
  }
  const response = renderResponse(dialect, reply, seq, turn ?? 0, JSON.stringify(body ?? null).length);
  return { seq, path, dialect, role, rule: rule === -1 ? null : rule, turn, issues, request: body, reply, status: 200, response };
}

/** A request whose body never arrived whole — the client dropped the connection: kept as an exchange, with its issue, and never answered. */
export function droppedStubExchange(path: string, seq: number, reason: string): StubExchange {
  const reply = { content: '' };
  return { seq, path, dialect: dialectOf(path), role: null, rule: null, turn: null, issues: [`the request was dropped before the stub could read it (${reason})`], request: null, reply, status: 0, response: null };
}

/**
 * Tools that call a paid model of their own when they run, whatever the `Llm` section says. A reply
 * script makes `orkeon run` execute the real tool: such a call has no place in a run on the stub.
 */
export const PAID_MODEL_TOOLS = ['image_generation'] as const;

/** The paid-model tools a script calls, once each. */
export function paidModelCalls(script: StubScript): string[] {
  const called = script.replies.flatMap((rule) => rule.turns.flatMap((turn) => ('tool_calls' in turn ? turn.tool_calls.map((call) => call.name) : [])));
  return PAID_MODEL_TOOLS.filter((tool) => called.includes(tool));
}

/** What a `GET` receives, whatever its path: the model list of both dialects. */
export function stubModelList(): unknown {
  return { object: 'list', data: [{ id: STUB_MODEL, object: 'model' }], models: [{ name: STUB_MODEL, model: STUB_MODEL }] };
}

/** The text of a request the stub received — its messages, or its flat prompt — for a scenario to search. */
export function stubRequestText(body: unknown): string {
  if (!isRecord(body)) {
    return '';
  }
  if (typeof body.prompt === 'string') {
    return body.prompt;
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter(isRecord) : [];
  return messages.map((message) => contentText(message.content)).join('\n');
}

/** Every issue of a session, each prefixed with the request it concerns. */
export function stubIssues(exchanges: readonly StubExchange[]): string[] {
  return exchanges.flatMap((exchange) => exchange.issues.map((issue) => `request ${String(exchange.seq)}: ${issue}`));
}

function matches(rule: StubRule, role: string | null, prompt: string): boolean {
  return (rule.match.role === undefined || rule.match.role === role) && (rule.match.task === undefined || prompt.includes(rule.match.task));
}

/** `You are <role>.` opens the system message Orkeon composes for an agent (V-04). */
function roleOf(system: string): string | null {
  const match = /(?:^|\n)(?:system: )?You are (.+?)\.[ \t]*(?:\r?\n|$)/.exec(system);
  return match === null ? null : (match[1] as string);
}

function readConversation(dialect: StubDialect, body: Record<string, unknown>): Conversation {
  if (dialect === 'ollama-generate') {
    // One flat prompt (`system: …`, `user: …`), no tools, one call.
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    return { system: prompt, prompt, answered: 0, tools: null };
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter(isRecord) : [];
  const textOf = (role: string): string =>
    messages
      .filter((message) => message.role === role)
      .map((message) => contentText(message.content))
      .join('\n');
  return {
    system: textOf('system'),
    prompt: textOf('user'),
    answered: messages.filter((message) => message.role === 'assistant').length,
    tools: Array.isArray(body.tools) ? body.tools.flatMap(offeredTool) : null,
  };
}

/** A message content: a string, or OpenAI's list of parts, of which the text ones are kept. */
function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

function offeredTool(entry: unknown): OfferedTool[] {
  const definition = isRecord(entry) && isRecord(entry.function) ? entry.function : null;
  if (definition === null || typeof definition.name !== 'string') {
    return [];
  }
  const parameters = isRecord(definition.parameters) ? definition.parameters : {};
  const properties = isRecord(parameters.properties) ? Object.keys(parameters.properties) : null;
  const required = Array.isArray(parameters.required) ? parameters.required.filter((name): name is string => typeof name === 'string') : [];
  return [{ name: definition.name, required, properties: properties !== null && properties.length > 0 ? properties : null }];
}

/**
 * A scripted call is sent as written — the simulated model never corrects itself — but a call the
 * request cannot take is flagged: Orkeon would answer it with a tool error and still end the run
 * with exit 0 (V-06).
 */
function callIssues(call: ScriptedCall, tools: readonly OfferedTool[] | null): string[] {
  const offered = tools ?? [];
  const tool = offered.find((candidate) => candidate.name === call.name);
  if (tool === undefined) {
    const names = offered.map((candidate) => candidate.name).join(', ');
    return [`scripted call to "${call.name}", which the request does not offer (offered: ${names.length > 0 ? names : 'no tool'})`];
  }
  const given = Object.keys(call.arguments);
  const issues = tool.required.filter((name) => !given.includes(name)).map((name) => `scripted call to "${call.name}" lacks its required argument "${name}"`);
  const known = tool.properties;
  if (known !== null) {
    issues.push(...given.filter((name) => !known.includes(name)).map((name) => `scripted call to "${call.name}" passes "${name}", which its schema does not know (Orkeon ignores it)`));
  }
  return issues;
}

/** Roughly four characters per token: the counts only have to exist and add up — they are no cost. */
function tokens(characters: number): number {
  return Math.max(1, Math.ceil(characters / 4));
}

function renderResponse(dialect: StubDialect, reply: StubTurn, seq: number, turn: number, requestSize: number): unknown {
  const promptTokens = tokens(requestSize);
  const completionTokens = tokens(JSON.stringify(reply).length);
  if (dialect === 'openai') {
    // Orkeon's parser reads `usage.total_tokens` unconditionally: an answer without it fails the call.
    return {
      id: `stub-${String(seq)}`,
      object: 'chat.completion',
      created: 0,
      model: STUB_MODEL,
      choices: [
        'tool_calls' in reply
          ? {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: reply.tool_calls.map((call, index) => ({
                  id: `call-${String(turn + 1)}-${String(index + 1)}`,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              },
            }
          : { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: reply.content } },
      ],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  }
  const counts = { done: true, done_reason: 'stop', prompt_eval_count: promptTokens, eval_count: completionTokens };
  const head = { model: STUB_MODEL, created_at: '1970-01-01T00:00:00Z' };
  if (dialect === 'ollama-generate') {
    return { ...head, response: 'content' in reply ? reply.content : '', ...counts };
  }
  const message =
    'tool_calls' in reply
      ? { role: 'assistant', content: '', tool_calls: reply.tool_calls.map((call) => ({ function: { name: call.name, arguments: call.arguments } })) }
      : { role: 'assistant', content: reply.content };
  return { ...head, message, ...counts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
