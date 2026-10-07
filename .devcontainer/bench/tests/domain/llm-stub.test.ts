import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import {
  RECORDER_SCRIPT,
  UNSCRIPTED_REPLY,
  answerStubRequest,
  dialectOf,
  droppedStubExchange,
  paidModelCalls,
  parseStubScript,
  stubIssues,
  stubModelList,
  stubRequestText,
} from '../../src/domain/llm-stub.js';

const TOOLS = [
  { type: 'function', function: { name: 'file_read', parameters: { properties: { path: { type: 'string' }, encoding: {} }, required: ['path'] } } },
  { type: 'function', function: { name: 'list_mounts' } },
];
const SCRIPT = parseStubScript({
  replies: [
    { match: { role: 'Reader' }, turns: [{ tool_calls: [{ name: 'file_read', arguments: { path: '/notes/a.md' } }] }, { content: 'facts' }] },
    { match: { role: 'Writer', task: 'digest' }, turns: [{ content: 'the digest' }] },
  ],
});
const first = (role: string, task = 'Do it') => ({
  model: 'stub-model',
  tools: TOOLS,
  messages: [
    { role: 'system', content: `You are ${role}.\nYour goal is: x` },
    { role: 'user', content: `Task:\n${task}` },
  ],
});
const second = (role: string) => ({ ...first(role), messages: [...first(role).messages, { role: 'assistant', content: null, tool_calls: [] }, { role: 'tool', content: 'result' }] });

interface OpenAiAnswer {
  choices: { finish_reason: string; message: { content: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] } }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

describe('reply script', () => {
  it('defaults its version and the match of a rule', () => {
    const script = parseStubScript({ replies: [{ turns: [{ content: 'x' }] }] });
    expect(script.schema_version).toBe('1.0');
    expect(script.replies[0]?.match).toEqual({});
  });

  it('refuses a rule that ends on a tool call, an empty rule and an unknown key', () => {
    expect(() => parseStubScript({ replies: [{ turns: [{ tool_calls: [{ name: 'file_read' }] }] }] })).toThrow('the last turn of a rule is a final text');
    expect(() => parseStubScript({ replies: [{ turns: [] }] })).toThrow(DomainError);
    expect(() => parseStubScript({ replies: [], extra: 1 }, 'x.json')).toThrow('invalid x.json');
    expect(() => parseStubScript({ replies: [{ turns: [{ tool_calls: [{ name: 'File-Read' }] }, { content: '' }] }] })).toThrow('a tool name is snake_case');
  });
});

describe('dialectOf', () => {
  it('reads the dialect in the path', () => {
    expect(dialectOf('/v1/chat/completions')).toBe('openai');
    expect(dialectOf('/v1/chat/completions?x=1')).toBe('openai');
    expect(dialectOf('/api/chat')).toBe('ollama-chat');
    expect(dialectOf('/api/generate')).toBe('ollama-generate');
    expect(dialectOf('/v1/embeddings')).toBeNull();
  });
});

describe('answerStubRequest, OpenAI dialect', () => {
  it('sends the scripted tool call first, with its arguments as a JSON string and a usage', () => {
    const exchange = answerStubRequest(SCRIPT, '/v1/chat/completions', first('Reader'), 1);
    expect(exchange).toMatchObject({ seq: 1, dialect: 'openai', role: 'Reader', rule: 0, turn: 0, issues: [], status: 200 });
    const answer = exchange.response as OpenAiAnswer;
    expect(answer.choices[0]?.finish_reason).toBe('tool_calls');
    expect(answer.choices[0]?.message).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call-1-1', type: 'function', function: { name: 'file_read', arguments: '{"path":"/notes/a.md"}' } }],
    });
    expect(answer.usage.total_tokens).toBe(answer.usage.prompt_tokens + answer.usage.completion_tokens);
    expect(answer.usage.total_tokens).toBeGreaterThan(0);
  });

  it('counts the answers already given to pick the turn', () => {
    const exchange = answerStubRequest(SCRIPT, '/v1/chat/completions', second('Reader'), 2);
    expect(exchange).toMatchObject({ rule: 0, turn: 1, reply: { content: 'facts' }, issues: [] });
    expect((exchange.response as OpenAiAnswer).choices[0]).toMatchObject({ finish_reason: 'stop', message: { role: 'assistant', content: 'facts' } });
  });

  it('matches a rule on the role and on a text of the task, in order', () => {
    expect(answerStubRequest(SCRIPT, '/v1/chat/completions', first('Writer', 'Write the digest'), 1)).toMatchObject({ rule: 1, turn: 0, issues: [] });
    const other = answerStubRequest(SCRIPT, '/v1/chat/completions', first('Writer', 'Write a poem'), 1);
    expect(other).toMatchObject({ rule: null, turn: null, reply: { content: UNSCRIPTED_REPLY }, issues: ['no rule of the script matches this request (role "Writer")'] });
  });

  it('answers an unmatched request with the fallback, without an issue', () => {
    const exchange = answerStubRequest(RECORDER_SCRIPT, '/v1/chat/completions', { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }, 3);
    expect(exchange).toMatchObject({ role: null, rule: null, reply: { content: 'OK' }, issues: [] });
  });

  it('flags a conversation longer than its script and sends the last turn again', () => {
    const third = { ...second('Reader'), messages: [...second('Reader').messages, { role: 'assistant', content: 'facts' }] };
    const exchange = answerStubRequest(SCRIPT, '/v1/chat/completions', third, 3);
    expect(exchange.reply).toEqual({ content: 'facts' });
    expect(exchange.issues).toEqual(['rule 0 scripts 2 turn(s) and this is call 3 of the conversation: its last turn was sent again']);
  });

  it('flags a scripted call the request cannot take, and still sends it', () => {
    const script = parseStubScript({
      replies: [
        {
          turns: [
            {
              tool_calls: [
                { name: 'file_write', arguments: {} },
                { name: 'file_read', arguments: { file_path: '/x' } },
                { name: 'list_mounts', arguments: { anything: 1 } },
              ],
            },
            { content: 'done' },
          ],
        },
      ],
    });
    const exchange = answerStubRequest(script, '/v1/chat/completions', first('Reader'), 1);
    expect(exchange.issues).toEqual([
      'scripted call to "file_write", which the request does not offer (offered: file_read, list_mounts)',
      'scripted call to "file_read" lacks its required argument "path"',
      'scripted call to "file_read" passes "file_path", which its schema does not know (Orkeon ignores it)',
    ]);
    expect((exchange.response as OpenAiAnswer).choices[0]?.message.tool_calls).toHaveLength(3);
    const noTools = answerStubRequest(script, '/v1/chat/completions', { messages: [] }, 1);
    expect(noTools.issues).toEqual(expect.arrayContaining(['scripted call to "file_write", which the request does not offer (offered: no tool)']));
  });

  it('answers a body that is not JSON, and says so', () => {
    const exchange = answerStubRequest(RECORDER_SCRIPT, '/v1/chat/completions', null, 1);
    expect(exchange).toMatchObject({ request: null, status: 200, issues: ['the request body is not a JSON object'] });
  });

  it('refuses a path it does not serve', () => {
    expect(answerStubRequest(SCRIPT, '/v1/embeddings', {}, 4)).toMatchObject({ status: 404, dialect: null, issues: ['the stub does not serve POST /v1/embeddings'] });
  });
});

describe('answerStubRequest, Ollama dialect', () => {
  it('answers /api/chat with arguments as an object and the token counts', () => {
    const exchange = answerStubRequest(SCRIPT, '/api/chat', first('Reader'), 1);
    expect(exchange.response).toMatchObject({
      model: 'stub-model',
      done: true,
      message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'file_read', arguments: { path: '/notes/a.md' } } }] },
    });
    expect(answerStubRequest(SCRIPT, '/api/chat', second('Reader'), 2).response).toMatchObject({ message: { role: 'assistant', content: 'facts' }, prompt_eval_count: expect.any(Number), eval_count: expect.any(Number) });
  });

  it('answers /api/generate from the flat prompt', () => {
    const exchange = answerStubRequest(SCRIPT, '/api/generate', { prompt: 'system: You are Writer.\nYour goal\n\nuser: Task:\nWrite the digest' }, 1);
    expect(exchange).toMatchObject({ dialect: 'ollama-generate', role: 'Writer', rule: 1, turn: 0, issues: [] });
    expect(exchange.response).toMatchObject({ response: 'the digest', done: true });
  });

  it('cannot send a tool call on /api/generate', () => {
    const exchange = answerStubRequest(SCRIPT, '/api/generate', { prompt: 'system: You are Reader.\n\nuser: Task:\nx' }, 1);
    expect(exchange.issues).toEqual(['a tool call cannot answer /api/generate: the request offers no tool']);
    expect(exchange.response).toMatchObject({ response: '' });
    expect(answerStubRequest(SCRIPT, '/api/generate', {}, 1).role).toBeNull();
  });
});

describe('what a run on the stub must not let through', () => {
  it('keeps a request that was dropped before its body arrived, with its issue and no answer', () => {
    const exchange = droppedStubExchange('/v1/chat/completions', 2, 'ECONNRESET');
    expect(exchange).toMatchObject({ seq: 2, dialect: 'openai', request: null, status: 0, response: null, issues: ['the request was dropped before the stub could read it (ECONNRESET)'] });
    expect(stubIssues([exchange])).toEqual(['request 2: the request was dropped before the stub could read it (ECONNRESET)']);
  });

  it('names the tools of a script that call a paid model of their own', () => {
    const script = parseStubScript({
      replies: [
        { turns: [{ tool_calls: [{ name: 'file_read', arguments: {} }, { name: 'image_generation', arguments: { prompt: 'a cat' } }] }, { content: 'ok' }] },
        { turns: [{ tool_calls: [{ name: 'image_generation', arguments: {} }] }, { content: 'ok' }] },
      ],
    });
    expect(paidModelCalls(script)).toEqual(['image_generation']);
    expect(paidModelCalls(SCRIPT)).toEqual([]);
  });
});

describe('helpers', () => {
  it('lists the model in both dialects', () => {
    expect(stubModelList()).toEqual({ object: 'list', data: [{ id: 'stub-model', object: 'model' }], models: [{ name: 'stub-model', model: 'stub-model' }] });
  });

  it('prefixes each issue with its request', () => {
    const exchanges = [answerStubRequest(SCRIPT, '/v1/chat/completions', first('Reader'), 1), answerStubRequest(SCRIPT, '/v1/chat/completions', first('Nobody'), 2)];
    expect(stubIssues(exchanges)).toEqual(['request 2: no rule of the script matches this request (role "Nobody")']);
  });

  it('gives the text of a request for a scenario to search', () => {
    expect(stubRequestText(first('Reader', 'Read'))).toBe('You are Reader.\nYour goal is: x\nTask:\nRead');
    expect(stubRequestText({ prompt: 'flat' })).toBe('flat');
    expect(stubRequestText({ messages: [{ role: 'user', content: 12 }, 'x'] })).toBe('');
    expect(stubRequestText(null)).toBe('');
  });
});
