import { describe, expect, it } from 'vitest';

import { ServeLlmStub, type StubEndpoint } from '../../src/application/use-cases/serve-llm-stub.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeLlmStub, FakeShutdownSignal } from '../fakes/fake-llm-stub.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const CWD = '/home/tester/work';
const SCRIPT = { replies: [{ match: { role: 'Writer' }, turns: [{ content: 'the digest' }] }] };
const writer = { path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: 'You are Writer.\n' }] } };
const reader = { path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: 'You are Reader.\n' }] } };

function setup(files: Record<string, unknown>, requests: { path: string; body: unknown }[] = []) {
  const fileSystem = new InMemoryFileSystem().addDirectory(CWD);
  for (const [path, content] of Object.entries(files)) {
    fileSystem.addFile(`${CWD}/${path}`, typeof content === 'string' ? content : JSON.stringify(content));
  }
  const stub = new FakeLlmStub([requests]);
  const shutdown = new FakeShutdownSignal();
  const serve = new ServeLlmStub(fileSystem, new FakeEnvironment({}, '/home/tester', CWD), stub, shutdown);
  const announced: StubEndpoint[] = [];
  return { fileSystem, stub, shutdown, serve, announced, announce: (endpoint: StubEndpoint) => announced.push(endpoint) };
}

describe('ServeLlmStub', () => {
  it('serves a reply script until told to stop, and says where it listens', async () => {
    const { stub, shutdown, serve, announced, announce } = setup({ 'reply.json': SCRIPT }, [writer]);
    const summary = await serve.execute({ scenarioFile: 'reply.json' }, announce);
    expect(announced).toEqual([{ baseUrl: 'http://127.0.0.1:43210/v1', port: 43210, model: 'stub-model', apiKey: 'stub' }]);
    expect(stub.scripts[0]?.replies).toHaveLength(1);
    expect(shutdown.watched).toBe(1);
    expect(shutdown.released).toBe(1);
    expect(stub.stopped).toBe(1);
    expect(summary).toEqual({ requests: 1, issues: [] });
  });

  it('serves the script a scenario carries, inline or in a file next to it', async () => {
    const inline = setup({ 'component/ac-01.scenario.json': { id: 'ac-01', level: 'component', llm_stub: SCRIPT } });
    await inline.serve.execute({ scenarioFile: 'component/ac-01.scenario.json' }, inline.announce);
    expect(inline.stub.scripts[0]?.replies[0]?.match).toEqual({ role: 'Writer' });
    const byFile = setup({ 'component/ac-02.json': { id: 'ac-02', level: 'component', llm_stub: 'ac-02.reply.json' }, 'component/ac-02.reply.json': { replies: [], fallback: { content: 'OK' } } });
    await byFile.serve.execute({ scenarioFile: `${CWD}/component/ac-02.json` }, byFile.announce);
    expect(byFile.stub.scripts[0]?.fallback).toEqual({ content: 'OK' });
  });

  it('listens on the port asked for and appends every exchange to the log, after what it already holds', async () => {
    const { fileSystem, stub, serve, announce, announced } = setup({ 'reply.json': SCRIPT, 'log.jsonl': '{"seq":0,"role":"kept"}\n' }, [writer, reader]);
    const summary = await serve.execute({ scenarioFile: 'reply.json', port: 18801, logFile: 'log.jsonl' }, announce);
    expect(stub.options[0]?.port).toBe(18801);
    expect(announced[0]?.baseUrl).toBe('http://127.0.0.1:18801/v1');
    const lines = (await fileSystem.readText(`${CWD}/log.jsonl`)).trim().split('\n').map((line) => JSON.parse(line) as { seq: number; role: string });
    expect(lines.shift()).toEqual({ seq: 0, role: 'kept' });
    expect(lines.map((line) => [line.seq, line.role])).toEqual([
      [1, 'Writer'],
      [2, 'Reader'],
    ]);
    expect(summary).toEqual({ requests: 2, issues: ['request 2: no rule of the script matches this request (role "Reader")'] });
  });

  it('creates a log that does not exist, and says before it starts that a log cannot be written', async () => {
    const created = setup({ 'reply.json': SCRIPT }, [writer]);
    await created.serve.execute({ scenarioFile: 'reply.json', logFile: 'new.jsonl' }, created.announce);
    expect((await created.fileSystem.readText(`${CWD}/new.jsonl`)).trim().split('\n')).toHaveLength(1);
    const refused = setup({ 'reply.json': SCRIPT });
    refused.fileSystem.addDirectory(`${CWD}/a-folder`);
    await expect(refused.serve.execute({ scenarioFile: 'reply.json', logFile: 'a-folder' }, refused.announce)).rejects.toMatchObject({ code: 'write-failed' });
    expect(refused.stub.scripts).toHaveLength(0);
  });

  it('stops the server and releases its watch when it is asked to stop later', async () => {
    const { fileSystem, stub } = setup({ 'reply.json': SCRIPT });
    const shutdown = new FakeShutdownSignal(false);
    const serve = new ServeLlmStub(fileSystem, new FakeEnvironment({}, '/home/tester', CWD), stub, shutdown);
    let announced = 0;
    const serving = serve.execute({ scenarioFile: 'reply.json' }, () => {
      announced += 1;
      shutdown.request();
    });
    await expect(serving).resolves.toEqual({ requests: 0, issues: [] });
    expect([announced, stub.stopped, shutdown.released]).toEqual([1, 1, 1]);
  });

  it('refuses a file that is missing, holds no script, or a port Orkeon would take for Ollama', async () => {
    const { serve, announce, stub } = setup({ 'component/no-stub.scenario.json': { id: 'no-stub', level: 'component' }, 'by-file.scenario.json': { id: 'by-file', level: 'component', llm_stub: 'gone.json' }, 'bad.json': '{ nope' });
    await expect(serve.execute({ scenarioFile: 'nowhere.json' }, announce)).rejects.toMatchObject({ code: 'file-not-found', message: `scenario not found: ${CWD}/nowhere.json` });
    await expect(serve.execute({ scenarioFile: 'component/no-stub.scenario.json' }, announce)).rejects.toThrow('has no reply script: set llm_stub to a script, or to the file that holds one');
    await expect(serve.execute({ scenarioFile: 'by-file.scenario.json' }, announce)).rejects.toMatchObject({ code: 'file-not-found', message: expect.stringContaining(`reply script not found: ${CWD}/gone.json`) });
    await expect(serve.execute({ scenarioFile: 'bad.json' }, announce)).rejects.toThrow('is not valid JSON');
    await expect(serve.execute({ scenarioFile: 'bad.json', port: 11434 }, announce)).rejects.toThrow('the stub cannot listen on port 11434');
    expect(stub.scripts).toHaveLength(0);
  });
});
