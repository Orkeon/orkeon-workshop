import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLlmLayers } from '../../src/application/use-cases/read-llm-layers.js';
import { parseStubScript, type StubExchange } from '../../src/domain/llm-stub.js';
import { createNodeAdapters } from '../../src/infrastructure/node-adapters.js';
import { NodeCompressor } from '../../src/infrastructure/node-compressor.js';
import { LOCK_WAIT_MS, NodeFileSystem } from '../../src/infrastructure/node-file-system.js';
import { NodeHttpProbe } from '../../src/infrastructure/node-http-probe.js';
import { NodeLlmRecorder, NodeLlmStub } from '../../src/infrastructure/node-llm-stub.js';
import { NodeProcessRunner } from '../../src/infrastructure/node-process-runner.js';
import { ProcessEnvironment } from '../../src/infrastructure/process-environment.js';
import { ProcessShutdownSignal } from '../../src/infrastructure/process-shutdown-signal.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orkeon-bench-infra-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('NodeFileSystem', () => {
  it('reads text and tells files from directories', async () => {
    const fileSystem = new NodeFileSystem();
    const file = join(directory, 'hello.txt');
    await writeFile(file, 'hello');
    expect(await fileSystem.readText(file)).toBe('hello');
    expect(await fileSystem.exists(file)).toBe(true);
    expect(await fileSystem.isDirectory(file)).toBe(false);
    expect(await fileSystem.isDirectory(directory)).toBe(true);
    expect(await fileSystem.exists(join(directory, 'missing'))).toBe(false);
    expect(await fileSystem.isDirectory(join(directory, 'missing'))).toBe(false);
  });

  it('turns read failures into application errors that name the path', async () => {
    const fileSystem = new NodeFileSystem();
    const missing = join(directory, 'missing');
    await expect(fileSystem.readText(missing)).rejects.toMatchObject({ name: 'ApplicationError', code: 'file-not-found', message: `cannot read ${missing}: ENOENT` });
    await expect(fileSystem.readText(directory)).rejects.toMatchObject({ code: 'invalid-input', message: `cannot read ${directory}: EISDIR` });
  });
});

describe('NodeProcessRunner', () => {
  const runner = new NodeProcessRunner();

  it('captures stdout and the exit code', async () => {
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write("out"); process.exit(0)']);
    expect(result).toEqual({ found: true, exitCode: 0, stdout: 'out', stderr: '' });
  });

  it('reports a non-zero exit code with stderr', async () => {
    const result = await runner.run(process.execPath, ['-e', 'process.stderr.write("bad"); process.exit(4)']);
    expect(result).toMatchObject({ found: true, exitCode: 4, stderr: 'bad' });
  });

  it('passes arguments without a shell', async () => {
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '$HOME; echo injected']);
    expect(result.stdout).toBe('$HOME; echo injected');
  });

  it('reports a missing executable instead of throwing', async () => {
    const result = await runner.run('definitely-not-a-command-orkeon-bench', ['--version']);
    expect(result).toMatchObject({ found: false, exitCode: null });
  });

  it('kills a process that exceeds the timeout', async () => {
    const result = await runner.run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 });
    expect(result).toMatchObject({ found: true, exitCode: null });
  });
});

describe('NodeHttpProbe', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/hang') {
        return;
      }
      response.statusCode = request.url === '/ok' ? 200 : 503;
      response.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : '';
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('reports reachable on 2xx and the status otherwise', async () => {
    const probe = new NodeHttpProbe();
    expect(await probe.get(`${base}/ok`, 2000)).toEqual({ reachable: true, status: 200 });
    expect(await probe.get(`${base}/down`, 2000)).toEqual({ reachable: false, status: 503 });
  });

  it('reports a refused connection instead of throwing', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const address = closed.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const result = await new NodeHttpProbe().get(`http://127.0.0.1:${port}/api/tags`, 2000);
    expect(result).toEqual({ reachable: false, error: 'ECONNREFUSED' });
  });

  it('gives up after the timeout', async () => {
    const result = await new NodeHttpProbe().get(`${base}/hang`, 150);
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/timeout|aborted/i);
  });
});

describe('readLlmLayers on the real file system', () => {
  async function workshop(name: string, files: Record<string, string>): Promise<string> {
    const root = join(directory, name);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await mkdir(join(root, 'teams/t/crew'), { recursive: true });
    return root;
  }
  const layersOf = (root: string) =>
    readLlmLayers(new NodeFileSystem(), new FakeEnvironment({ XDG_CONFIG_HOME: join(root, 'xdg') }, join(root, 'home')), {
      crewFolder: join(root, 'teams/t/crew'),
    });

  it('resolves the file next to the crew before the user file, and never reads the working directory', async () => {
    const root = await workshop('chain', {
      'teams/t/crew/appsettings.json': JSON.stringify({ Llm: { BaseUrl: 'https://api.example.com' } }),
      'xdg/Orkeon/appsettings.json': JSON.stringify({ Llm: { BaseUrl: 'http://localhost:11434' } }),
      'teams/t/appsettings.json': JSON.stringify({ Logging: {} }),
    });
    const { settingsFile, layers } = await layersOf(root);
    expect(settingsFile).toBe(join(root, 'teams/t/crew/appsettings.json'));
    expect(layers.map((layer) => layer.source)).toEqual([
      'ORKEON_Llm__* variables',
      join(root, 'teams/t/crew/appsettings.json'),
      'Llm__* variables',
    ]);
    expect(layers[1]).toMatchObject({ configured: true, baseUrls: ['https://api.example.com'] });
  });

  it('does not take a directory named appsettings.json for a file', async () => {
    const root = await workshop('directory', { 'xdg/Orkeon/appsettings.json': JSON.stringify({ Llm: { Model: 'm' } }) });
    await mkdir(join(root, 'teams/t/crew/appsettings.json'), { recursive: true });
    expect((await layersOf(root)).settingsFile).toBe(join(root, 'xdg/Orkeon/appsettings.json'));
  });

  it('refuses a settings file that is not valid JSON', async () => {
    const root = await workshop('broken', { 'xdg/Orkeon/appsettings.json': '{ not json' });
    await expect(layersOf(root)).rejects.toMatchObject({ name: 'ApplicationError', code: 'invalid-input', message: expect.stringContaining('is not valid JSON') });
  });
});

describe('process adapters', () => {
  it('expose the environment, the home, the cwd and the clock', () => {
    const environment = new ProcessEnvironment();
    expect(environment.get('PATH')).toBeDefined();
    expect(environment.get('ORKEON_BENCH_DEFINITELY_UNSET')).toBeUndefined();
    expect(environment.get('constructor')).toBeUndefined();
    expect(environment.homeDirectory().length).toBeGreaterThan(0);
    expect(environment.currentDirectory()).toBe(process.cwd());
    expect(new SystemClock().now()).toBeInstanceOf(Date);
  });

  it('are bundled by createNodeAdapters', () => {
    const adapters = createNodeAdapters();
    expect(adapters.fileSystem).toBeInstanceOf(NodeFileSystem);
    expect(adapters.processRunner).toBeInstanceOf(NodeProcessRunner);
    expect(adapters.httpProbe).toBeInstanceOf(NodeHttpProbe);
    expect(adapters.clock).toBeInstanceOf(SystemClock);
    expect(adapters.environment).toBeInstanceOf(ProcessEnvironment);
    expect(adapters.llmRecorder).toBeInstanceOf(NodeLlmRecorder);
    expect(adapters.llmStub).toBeInstanceOf(NodeLlmStub);
    expect(adapters.shutdownSignal).toBeInstanceOf(ProcessShutdownSignal);
  });
});

describe('NodeFileSystem temporary folders', () => {
  it('creates a fresh folder under the system temp directory and removes it with its content', async () => {
    const fileSystem = new NodeFileSystem();
    const folder = await fileSystem.makeTemporaryDirectory('orkeon-bench-temp-');
    expect(folder.startsWith(join(tmpdir(), 'orkeon-bench-temp-'))).toBe(true);
    await fileSystem.makeDirectory(join(folder, 'crew', 'agents'));
    await fileSystem.writeText(join(folder, 'crew', 'agents', 'a.yaml'), 'role: x\n');
    await fileSystem.remove(folder);
    expect(await fileSystem.exists(folder)).toBe(false);
    await expect(fileSystem.remove(folder)).resolves.toBeUndefined();
  });
});

describe('NodeProcessRunner working directory and environment', () => {
  it('runs in the given folder with exactly the given environment', async () => {
    const result = await new NodeProcessRunner().run('/bin/sh', ['-c', 'printf "%s|%s|%s" "$PWD" "$ONLY_THIS" "${HOME:-unset}"'], {
      cwd: directory,
      env: { ONLY_THIS: 'yes', PATH: '/usr/bin:/bin' },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${directory}|yes|unset`);
  });
});

describe('ProcessEnvironment.variables', () => {
  it('returns the string variables of the process', () => {
    const variables = new ProcessEnvironment().variables();
    expect(variables.PATH).toBe(process.env.PATH);
    expect(Object.values(variables).every((value) => typeof value === 'string')).toBe(true);
  });
});

describe('NodeLlmRecorder', () => {
  it('records every POST body, answers a final OK message, lists stub-model on GET, then stops', async () => {
    const recording = await new NodeLlmRecorder().start();
    expect(recording.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const models = (await (await fetch(`${recording.baseUrl}/models`)).json()) as { data: { id: string }[] };
    expect(models.data[0]?.id).toBe('stub-model');
    const answer = await fetch(`${recording.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'stub-model', tools: [{ type: 'function', function: { name: 'file_read' } }] }),
    });
    const completion = (await answer.json()) as { choices: { message: { content: string }; finish_reason: string }[] };
    expect(completion.choices[0]).toMatchObject({ message: { content: 'OK' }, finish_reason: 'stop' });
    await fetch(`${recording.baseUrl}/chat/completions`, { method: 'POST', body: 'not json' });
    expect(recording.requests()).toEqual([{ model: 'stub-model', tools: [{ type: 'function', function: { name: 'file_read' } }] }, null]);
    await recording.stop();
    await expect(fetch(`${recording.baseUrl}/models`)).rejects.toThrow();
  });
});

describe('NodeLlmStub', () => {
  const script = parseStubScript({
    replies: [{ match: { role: 'Reader' }, turns: [{ tool_calls: [{ name: 'file_read', arguments: { path: '/notes/a.md' } }] }, { content: 'facts' }] }],
  });
  const post = async (url: string, body: unknown): Promise<Record<string, unknown>> =>
    (await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()) as Record<string, unknown>;
  const first = { tools: [{ type: 'function', function: { name: 'file_read' } }], messages: [{ role: 'system', content: 'You are Reader.\n' }] };

  it('answers from the script in both dialects, keeps every exchange and reports each as it comes', async () => {
    const seen: StubExchange[] = [];
    const session = await new NodeLlmStub().start(script, { onExchange: (exchange) => seen.push(exchange) });
    try {
      expect(session.baseUrl).toBe(`http://127.0.0.1:${String(session.port)}/v1`);
      const called = await post(`${session.baseUrl}/chat/completions`, first);
      expect(called).toMatchObject({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'file_read', arguments: '{"path":"/notes/a.md"}' } }] } }] });
      const origin = session.baseUrl.slice(0, -3);
      const final = await post(`${origin}/api/chat`, { ...first, messages: [...first.messages, { role: 'assistant', content: '' }] });
      expect(final).toMatchObject({ message: { role: 'assistant', content: 'facts' }, done: true });
      const unknown = await fetch(`${session.baseUrl}/embeddings`, { method: 'POST', body: '{}' });
      expect(unknown.status).toBe(404);
      expect(session.exchanges().map((exchange) => [exchange.seq, exchange.dialect, exchange.turn, exchange.issues.length])).toEqual([
        [1, 'openai', 0, 0],
        [2, 'ollama-chat', 1, 0],
        [3, null, null, 1],
      ]);
      expect(seen).toEqual(session.exchanges());
    } finally {
      await session.stop();
    }
  });

  it('listens on the port asked for, and says when it cannot', async () => {
    const free = await new NodeLlmStub().start(script);
    await free.stop();
    const session = await new NodeLlmStub().start(script, { port: free.port });
    try {
      expect(session.port).toBe(free.port);
      await expect(new NodeLlmStub().start(script, { port: free.port })).rejects.toMatchObject({
        name: 'ApplicationError',
        code: 'process-failed',
        message: `the simulated LLM cannot listen on 127.0.0.1:${String(free.port)}: EADDRINUSE`,
      });
    } finally {
      await session.stop();
    }
  });
});

describe('NodeFileSystem copies and appends', () => {
  it('copies a folder with everything in it, and a file, never over what exists', async () => {
    const fileSystem = new NodeFileSystem();
    const from = join(directory, 'copy-from');
    await mkdir(join(from, 'agents'), { recursive: true });
    await writeFile(join(from, 'agents', 'a.yaml'), 'role: x\n');
    await fileSystem.copy(from, join(directory, 'copy-to'));
    expect(await fileSystem.readText(join(directory, 'copy-to', 'agents', 'a.yaml'))).toBe('role: x\n');
    await fileSystem.copy(join(from, 'agents', 'a.yaml'), join(directory, 'copy-file.yaml'));
    expect(await fileSystem.readText(join(directory, 'copy-file.yaml'))).toBe('role: x\n');
    await expect(fileSystem.copy(join(from, 'agents', 'a.yaml'), join(directory, 'copy-file.yaml'))).rejects.toMatchObject({ name: 'ApplicationError', code: 'write-failed' });
    await expect(fileSystem.copy(join(directory, 'copy-nothing'), join(directory, 'copy-nowhere'))).rejects.toMatchObject({ code: 'write-failed', message: expect.stringContaining('ENOENT') });
  });

  it('appends to a file, creating it when missing', async () => {
    const fileSystem = new NodeFileSystem();
    const log = join(directory, 'append.jsonl');
    await fileSystem.appendText(log, 'one\n');
    await fileSystem.appendText(log, 'two\n');
    expect(await fileSystem.readText(log)).toBe('one\ntwo\n');
    await expect(fileSystem.appendText(join(directory, 'no-such-folder', 'x'), 'x')).rejects.toMatchObject({ code: 'write-failed' });
  });
});

describe('NodeProcessRunner standard input', () => {
  it('hands the input to the process and closes it', async () => {
    const runner = new NodeProcessRunner();
    expect((await runner.run('/bin/sh', ['-c', 'cat'], { input: 'answer\n' })).stdout).toBe('answer\n');
    expect((await runner.run('/bin/sh', ['-c', 'cat; echo done'], { input: '' })).stdout).toBe('done\n');
    expect((await runner.run('/bin/sh', ['-c', 'exit 0'], { input: 'unread' })).exitCode).toBe(0);
  });
});

describe('ProcessShutdownSignal', () => {
  it('holds the first request to stop, then lets go of the signals', async () => {
    const before = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal));
    const watch = new ProcessShutdownSignal().watch();
    expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal))).toEqual(before.map((count) => count + 1));
    expect(watch.isRequested()).toBe(false);
    process.emit('SIGTERM');
    await expect(watch.requested).resolves.toBeUndefined();
    expect(watch.isRequested()).toBe(true);
    // A second request finds no handler of the bench: the process ends as any process would.
    expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal))).toEqual(before);
  });

  it('lets go of the signals when the watch is released without a request', () => {
    const before = process.listenerCount('SIGINT');
    const watch = new ProcessShutdownSignal().watch();
    watch.release();
    expect(process.listenerCount('SIGINT')).toBe(before);
    expect(watch.isRequested()).toBe(false);
  });
});

describe('NodeLlmStub and a request dropped mid-body', () => {
  it('keeps serving, and keeps the dropped request as an exchange with its issue', async () => {
    const script = parseStubScript({ replies: [], fallback: { content: 'OK' } });
    const seen: StubExchange[] = [];
    const session = await new NodeLlmStub().start(script, { onExchange: (exchange) => seen.push(exchange) });
    try {
      await new Promise<void>((done) => {
        const socket = connect(session.port, '127.0.0.1', () => {
          socket.write('POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"messages":[');
          setTimeout(() => {
            socket.resetAndDestroy();
            done();
          }, 100);
        });
        socket.on('error', () => undefined);
      });
      const answer = await fetch(`${session.baseUrl}/chat/completions`, { method: 'POST', body: JSON.stringify({ messages: [] }) });
      expect(answer.status).toBe(200);
      const exchanges = session.exchanges();
      expect(exchanges.map((exchange) => [exchange.seq, exchange.status, exchange.issues.length])).toEqual([
        [1, 0, 1],
        [2, 200, 0],
      ]);
      expect(exchanges[0]?.issues[0]).toMatch(/^the request was dropped before the stub could read it \(.+\)$/);
      expect(seen).toEqual(exchanges);
    } finally {
      await session.stop();
    }
  });
});

describe('NodeFileSystem writes a reader never sees half done', () => {
  it('replaces a file in one step and leaves no temporary file beside it', async () => {
    const fileSystem = new NodeFileSystem();
    const folder = join(directory, 'atomic');
    await mkdir(folder);
    const file = join(folder, 'manifest.json');
    await fileSystem.writeText(file, '{"closed_at":null}\n');
    let reads = 0;
    let broken = 0;
    let writing = true;
    const reader = (async () => {
      while (writing) {
        const text = await readFile(file, 'utf8').catch(() => '');
        reads += 1;
        if (!/^\{"closed_at":null,"n":\d+,"pad":"x+"\}\n$/.test(text) && text !== '{"closed_at":null}\n') {
          broken += 1;
        }
      }
    })();
    for (let n = 0; n < 150; n += 1) {
      await fileSystem.writeText(file, `{"closed_at":null,"n":${String(n)},"pad":"${'x'.repeat(20_000)}"}\n`);
    }
    writing = false;
    await reader;
    expect(reads).toBeGreaterThan(0);
    expect(broken).toBe(0);
    expect(await readdir(folder)).toEqual(['manifest.json']);
  });

  it('writes a launcher executable, and cleans up when it cannot write', async () => {
    const fileSystem = new NodeFileSystem();
    const launcher = join(directory, 'atomic-run.sh');
    await fileSystem.writeText(launcher, '#!/bin/sh\n', { executable: true });
    expect((await stat(launcher)).mode & 0o111).toBe(0o111);
    await expect(fileSystem.writeText(join(directory, 'no-such-folder', 'x.json'), '{}')).rejects.toMatchObject({ code: 'write-failed' });
    await mkdir(join(directory, 'atomic-is-a-folder'));
    await expect(fileSystem.writeText(join(directory, 'atomic-is-a-folder'), '{}')).rejects.toMatchObject({ code: 'write-failed' });
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('NodeFileSystem exclusive folders, bytes, digests and locks', () => {
  it('creates a folder once: the second call says it was there', async () => {
    const fileSystem = new NodeFileSystem();
    const folder = join(directory, 'ATT-0001');
    expect(await Promise.all([fileSystem.makeDirectoryExclusive(folder), fileSystem.makeDirectoryExclusive(folder)]).then((made) => made.sort())).toEqual([false, true]);
    expect(await fileSystem.makeDirectoryExclusive(folder)).toBe(false);
    await expect(fileSystem.makeDirectoryExclusive(join(directory, 'no-parent', 'ATT-0001'))).rejects.toMatchObject({ code: 'write-failed', message: expect.stringContaining('ENOENT') });
  });

  it('reads a file as the bytes it holds', async () => {
    const fileSystem = new NodeFileSystem();
    const file = join(directory, 'image.png');
    await writeFile(file, Buffer.from([0x89, 0x50, 0x00, 0xff]));
    expect([...(await fileSystem.readBytes(file))]).toEqual([0x89, 0x50, 0x00, 0xff]);
    await expect(fileSystem.readBytes(join(directory, 'no-image.png'))).rejects.toMatchObject({ code: 'file-not-found' });
  });

  it('digests a tree as find, sort and sha256sum do', async () => {
    const fileSystem = new NodeFileSystem();
    const tree = join(directory, 'crew');
    await mkdir(join(tree, 'agents'), { recursive: true });
    await mkdir(join(tree, 'Tasks'));
    await writeFile(join(tree, 'config.yaml'), 'name: demo\n');
    await writeFile(join(tree, 'agents', 'writer.yaml'), 'role: Writer\n');
    await writeFile(join(tree, 'Tasks', 'write.yaml'), 'agent: writer\n');
    const shell = await new NodeProcessRunner().run('/bin/sh', ['-c', 'find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum'], { cwd: tree });
    const digest = await fileSystem.digest(tree);
    expect(digest).toEqual({ sha256: shell.stdout.slice(0, 64), files: 3, bytes: 38 });
    await writeFile(join(tree, 'agents', 'writer.yaml'), 'role: Writer!\n');
    expect((await fileSystem.digest(tree)).sha256).not.toBe(digest.sha256);
    await expect(fileSystem.digest(join(directory, 'no-crew'))).rejects.toMatchObject({ code: 'file-not-found' });
  });

  it('gives a lock to one holder at a time, and to the next when it is released', async () => {
    const fileSystem = new NodeFileSystem();
    const lock = join(directory, '.lock');
    const order: string[] = [];
    const first = await fileSystem.lock(lock);
    const second = fileSystem.lock(lock).then((release) => {
      order.push('second holds');
      return release;
    });
    await new Promise((done) => setTimeout(done, 120));
    order.push('first releases');
    await first();
    await (await second)();
    expect(order).toEqual(['first releases', 'second holds']);
    expect(await fileSystem.exists(lock)).toBe(false);
    await expect(fileSystem.lock(join(directory, 'no-such-folder', '.lock'))).rejects.toMatchObject({ code: 'write-failed' });
  });

  it('takes over at once a lock whose holder, on this machine, is gone', async () => {
    const fileSystem = new NodeFileSystem();
    const lock = join(directory, '.dead-lock');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    const started = Date.now();
    const release = await fileSystem.lock(lock);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await readFile(lock, 'utf8')).toBe(`${hostname()}:${String(process.pid)}\n`);
    await release();
  });

  it('breaks a lock left by a command that died long ago', async () => {
    const fileSystem = new NodeFileSystem();
    const lock = join(directory, '.stale-lock');
    await writeFile(lock, '1\n');
    const long = new Date(Date.now() - 10 * 60_000);
    await utimes(lock, long, long);
    const release = await fileSystem.lock(lock);
    await release();
    expect(await fileSystem.exists(lock)).toBe(false);
  });
});

describe('NodeProcessRunner stops what it started', () => {
  const runner = new NodeProcessRunner();
  /** A wrapper that does not exec: the real work is a grandchild of the bench, as with a launcher. It leaves a marker if it lives. */
  const wrapper = (marker: string): string[] => ['-c', `(sleep 1.5; echo late > "${marker}") & echo started; wait`];
  const outlived = async (marker: string): Promise<boolean> => {
    await new Promise((done) => setTimeout(done, 2_200));
    return new NodeFileSystem().exists(marker);
  };

  it('kills the whole group of a process that ran out of time, and says it was a timeout', async () => {
    const marker = join(directory, 'group-timeout.marker');
    const result = await runner.run('/bin/sh', wrapper(marker), { timeoutMs: 300, ownGroup: true });
    expect(result).toMatchObject({ found: true, exitCode: null, stopped: 'timeout', stdout: 'started\n' });
    expect(await outlived(marker)).toBe(false);
  });

  it('stops a process and its group when the run is cancelled', async () => {
    const marker = join(directory, 'group-cancel.marker');
    let cancel: () => void = () => undefined;
    const cancelled = new Promise<void>((done) => {
      cancel = done;
    });
    setTimeout(cancel, 200);
    const result = await runner.run('/bin/sh', wrapper(marker), { timeoutMs: 20_000, ownGroup: true, cancel: cancelled });
    expect(result).toMatchObject({ exitCode: null, stopped: 'cancelled' });
    expect(await outlived(marker)).toBe(false);
  });

  it('kills the process alone without a group of its own, and still says why it stopped', async () => {
    const marker = join(directory, 'no-group.marker');
    const result = await runner.run('/bin/sh', wrapper(marker), { timeoutMs: 200 });
    expect(result).toMatchObject({ exitCode: null, stopped: 'timeout' });
    // What the wrapper started was not in a group the bench could stop: it lived on.
    expect(await outlived(marker)).toBe(true);
  });

  it('stops a process that prints more than the bench keeps, and says so', async () => {
    const result = await runner.run('/bin/sh', ['-c', 'yes 0123456789012345678901234567890123456789 | head -c 9000000; sleep 30'], { timeoutMs: 20_000, ownGroup: true });
    expect(result).toMatchObject({ found: true, exitCode: null, stopped: 'output-limit' });
    expect(result.stdout.length).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('reports the exit code and both streams of a process that ends by itself, and a command that is not there', async () => {
    expect(await runner.run('/bin/sh', ['-c', 'echo out; echo err >&2; exit 7'], { ownGroup: true })).toEqual({ found: true, exitCode: 7, stdout: 'out\n', stderr: 'err\n' });
    expect(await runner.run('orkeon-bench-no-such-command', [])).toEqual({ found: false, exitCode: null, stdout: '', stderr: '' });
    expect(await runner.run('/bin/sh', ['-c', 'kill -KILL $$'])).toMatchObject({ found: true, exitCode: null });
  });
});

describe('NodeFileSystem and symbolic links', () => {
  /** A tree with a file link, a folder link out of the tree, a dangling link and a link in a sub-folder. */
  async function linked(name: string): Promise<{ tree: string; outside: string }> {
    const tree = join(directory, name);
    const outside = join(directory, `${name}-outside`);
    await mkdir(join(tree, 'sub'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, 'secret.json'), '{"Secret":"TOP"}');
    await writeFile(join(tree, 'a.md'), 'plain\n');
    await symlink('a.md', join(tree, 'alias.md'));
    await symlink(outside, join(tree, 'peek'));
    await symlink('nowhere.md', join(tree, 'sub', 'dangling.md'));
    return { tree, outside };
  }

  it('finds every link at or below a path without following any', async () => {
    const fileSystem = new NodeFileSystem();
    const { tree } = await linked('links-find');
    expect(await fileSystem.symbolicLinks(tree)).toEqual(['alias.md', 'peek', 'sub/dangling.md']);
    expect(await fileSystem.symbolicLinks(join(tree, 'peek'))).toEqual(['.']);
    expect(await fileSystem.symbolicLinks(join(tree, 'a.md'))).toEqual([]);
    expect(await fileSystem.symbolicLinks(join(tree, 'sub'))).toEqual(['dangling.md']);
    expect(await fileSystem.symbolicLinks(join(directory, 'links-none'))).toEqual([]);
  });

  it('leaves the links out of a copy when asked to, and never copies what one points to', async () => {
    const fileSystem = new NodeFileSystem();
    const { tree } = await linked('links-skip');
    const copy = join(directory, 'links-skip-copy');
    await fileSystem.copy(tree, copy, { skipLinks: true });
    expect((await readdir(copy)).sort()).toEqual(['a.md', 'sub']);
    expect(await readdir(join(copy, 'sub'))).toEqual([]);
    expect(await fileSystem.symbolicLinks(copy)).toEqual([]);
  });

  it('copies a link as it is written otherwise, a relative one staying relative', async () => {
    const fileSystem = new NodeFileSystem();
    const { tree, outside } = await linked('links-keep');
    const copy = join(directory, 'links-keep-copy');
    await fileSystem.copy(tree, copy);
    expect((await lstat(join(copy, 'peek'))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(copy, 'alias.md'))).toBe('a.md');
    expect(await readlink(join(copy, 'peek'))).toBe(outside);
    expect(await readlink(join(copy, 'sub', 'dangling.md'))).toBe('nowhere.md');
  });

  it('digests a link as the link it is: what it points to is not read, and does not change the digest', async () => {
    const fileSystem = new NodeFileSystem();
    const { tree, outside } = await linked('links-digest');
    const before = await fileSystem.digest(tree);
    expect(before.files).toBe(4);
    await writeFile(join(outside, 'secret.json'), '{"Secret":"CHANGED"}');
    await writeFile(join(outside, 'more.json'), '{}');
    expect((await fileSystem.digest(tree)).sha256).toBe(before.sha256);
    await rm(join(tree, 'alias.md'));
    await symlink('sub', join(tree, 'alias.md'));
    expect((await fileSystem.digest(tree)).sha256).not.toBe(before.sha256);
  });
});

describe('NodeFileSystem and what a killed command left in the temporary folder', () => {
  it('records who created a temporary folder, and counts as left over only one whose creator is gone, or that is old with no creator to tell', async () => {
    const fileSystem = new NodeFileSystem();
    const prefix = `orkeon-bench-leftover-${String(process.pid)}-`;
    const mine = await fileSystem.makeTemporaryDirectory(prefix);
    const dead = await fileSystem.makeTemporaryDirectory(prefix);
    const unknownOld = await fileSystem.makeTemporaryDirectory(prefix);
    const unknownFresh = await fileSystem.makeTemporaryDirectory(prefix);
    try {
      expect(await readFile(join(mine, '.owner'), 'utf8')).toBe(`${hostname()}:${String(process.pid)}\n`);
      const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
      await writeFile(join(dead, '.owner'), `${hostname()}:${gone.stdout.trim()}\n`);
      await rm(join(unknownOld, '.owner'));
      await writeFile(join(unknownFresh, '.owner'), 'another-machine:1\n');
      const longAgo = new Date(Date.now() - 60 * 60_000);
      await utimes(unknownOld, longAgo, longAgo);
      const leftovers = await fileSystem.leftoverTemporaryDirectories(prefix);
      expect(leftovers.map((leftover) => [leftover.path, leftover.owner])).toEqual(
        [
          [dead, 'gone'],
          [unknownOld, 'unknown'],
        ].sort(),
      );
      expect(leftovers.find((leftover) => leftover.path === unknownOld)?.ageSeconds).toBeGreaterThan(3_000);
      expect(await fileSystem.leftoverTemporaryDirectories(`${prefix}none-`)).toEqual([]);
    } finally {
      for (const folder of [mine, dead, unknownOld, unknownFresh]) {
        await fileSystem.remove(folder);
      }
    }
  });
});

describe('NodeFileSystem.lock, waiting and taking over', () => {
  it('gives up within ten seconds by default, and says who holds the lock', async () => {
    expect(LOCK_WAIT_MS).toBeLessThanOrEqual(10_000);
    const lock = join(directory, '.held-lock');
    // Held by this very process: alive, and not about to let go.
    await writeFile(lock, `${hostname()}:${String(process.pid)}\n`);
    const started = Date.now();
    await expect(new NodeFileSystem({ lockWaitMs: 300 }).lock(lock)).rejects.toMatchObject({
      code: 'write-failed',
      message: `cannot lock ${lock}: another orkeon-bench command (${hostname()}:${String(process.pid)}) has held it for 0 s — try again, or remove the file if no such command is running`,
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(await readFile(lock, 'utf8')).toBe(`${hostname()}:${String(process.pid)}\n`);
  });

  it('removes an abandoned lock only while it holds the take-over: a waiter that does not hold it removes nothing', async () => {
    const fileSystem = new NodeFileSystem();
    const lock = join(directory, '.contested-lock');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    // Another waiter is in the middle of taking the abandoned lock over.
    await writeFile(`${lock}.takeover`, `${hostname()}:${String(process.pid)}\n`);
    let acquiredAt = 0;
    const started = Date.now();
    const waiting = fileSystem.lock(lock).then((release) => {
      acquiredAt = Date.now() - started;
      return release;
    });
    await new Promise((done) => setTimeout(done, 400));
    expect(acquiredAt).toBe(0);
    expect(await readFile(lock, 'utf8')).toBe(`${hostname()}:${gone.stdout.trim()}\n`);
    await rm(`${lock}.takeover`);
    await (await waiting)();
    expect(acquiredAt).toBeGreaterThanOrEqual(400);
    expect(await fileSystem.exists(`${lock}.takeover`)).toBe(false);
  });

  it('clears at once a take-over file whose holder is gone too: the next command does not wait for it to grow old', async () => {
    const lock = join(directory, '.twice-dead-lock');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    const other = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    // A waiter died while taking the lock over: its file is fresh, its holder is no more.
    await writeFile(`${lock}.takeover`, `${hostname()}:${other.stdout.trim()}\n`);
    const started = Date.now();
    const release = await new NodeFileSystem({ lockWaitMs: 3_000 }).lock(lock);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await readFile(lock, 'utf8')).toBe(`${hostname()}:${String(process.pid)}\n`);
    await release();
    expect((await readdir(directory)).filter((name) => name.startsWith('.twice-dead-lock'))).toEqual([]);
  });

  it('gives up in the same time on a take-over a live command holds, and names that file', async () => {
    const lock = join(directory, '.taken-over-lock');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    await writeFile(`${lock}.takeover`, `${hostname()}:${String(process.pid)}\n`);
    const started = Date.now();
    await expect(new NodeFileSystem({ lockWaitMs: 300 }).lock(lock)).rejects.toMatchObject({
      code: 'write-failed',
      message: `cannot lock ${lock}: another orkeon-bench command (${hostname()}:${String(process.pid)}) has been taking it over, holding ${lock}.takeover, for 0 s — try again, or remove that file if no such command is running`,
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    // Nothing was removed on the way: the abandoned lock is the take-over's to remove.
    expect(await readFile(lock, 'utf8')).toBe(`${hostname()}:${gone.stdout.trim()}\n`);
    expect(await readFile(`${lock}.takeover`, 'utf8')).toBe(`${hostname()}:${String(process.pid)}\n`);
  });

  it('lets many waiters take an abandoned lock over one at a time', async () => {
    const lock = join(directory, '.crowded-lock');
    const counter = join(directory, 'crowded-counter');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    await writeFile(counter, '0');
    let inside = 0;
    let most = 0;
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        const release = await new NodeFileSystem().lock(lock);
        inside += 1;
        most = Math.max(most, inside);
        const value = Number(await readFile(counter, 'utf8'));
        await new Promise((done) => setTimeout(done, 5));
        await writeFile(counter, String(value + 1));
        inside -= 1;
        await release();
      }),
    );
    expect(most).toBe(1);
    expect(await readFile(counter, 'utf8')).toBe('12');
  });

  it('clears a take-over left by a waiter that died long ago', async () => {
    const lock = join(directory, '.orphan-lock');
    const gone = await new NodeProcessRunner().run('/bin/sh', ['-c', 'echo $$']);
    await writeFile(lock, `${hostname()}:${gone.stdout.trim()}\n`);
    await writeFile(`${lock}.takeover`, 'x\n');
    const longAgo = new Date(Date.now() - 10 * 60_000);
    await utimes(`${lock}.takeover`, longAgo, longAgo);
    const release = await new NodeFileSystem().lock(lock);
    await release();
    expect(await new NodeFileSystem().exists(lock)).toBe(false);
  });
});

describe('NodeFileSystem.writeText where a rename is refused', () => {
  const refused = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

  it('tries the rename again when another program holds the target for a moment', async () => {
    let calls = 0;
    const fileSystem = new NodeFileSystem({
      rename: async (from, to) => {
        calls += 1;
        if (calls < 3) {
          throw refused('EBUSY');
        }
        await rename(from, to);
      },
    });
    const file = join(directory, 'busy.json');
    await fileSystem.writeText(file, '{"n":1}\n');
    expect(calls).toBe(3);
    expect(await readFile(file, 'utf8')).toBe('{"n":1}\n');
    expect((await readdir(directory)).filter((name) => name.includes('busy.json.'))).toEqual([]);
  });

  it('writes the file in place when the rename stays refused, and leaves no temporary file', async () => {
    let calls = 0;
    const fileSystem = new NodeFileSystem({
      rename: async () => {
        calls += 1;
        throw refused('EPERM');
      },
    });
    const file = join(directory, 'held-open.sh');
    await writeFile(file, 'old\n');
    await fileSystem.writeText(file, '#!/bin/sh\n', { executable: true });
    expect(calls).toBe(5);
    expect(await readFile(file, 'utf8')).toBe('#!/bin/sh\n');
    expect((await stat(file)).mode & 0o111).toBe(0o111);
    expect((await readdir(directory)).filter((name) => name.includes('held-open.sh.'))).toEqual([]);
  });

  it('still fails on a rename refused for another reason', async () => {
    const fileSystem = new NodeFileSystem({
      rename: async () => {
        throw refused('EROFS');
      },
    });
    const file = join(directory, 'read-only-disk.json');
    await expect(fileSystem.writeText(file, '{}')).rejects.toMatchObject({ code: 'write-failed', message: `cannot write ${file}: EROFS` });
    expect(await fileSystem.exists(file)).toBe(false);
    expect((await readdir(directory)).filter((name) => name.includes('read-only-disk'))).toEqual([]);
  });
});

describe('NodeFileSystem.writeBytes and NodeCompressor', () => {
  it('writes bytes as they are, in one step, over an existing file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'orkeon-bench-bytes-'));
    try {
      const fileSystem = new NodeFileSystem();
      const path = join(folder, 'archive.zip');
      await fileSystem.writeText(path, 'old');
      const bytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0xff]);
      await fileSystem.writeBytes(path, bytes);
      expect(new Uint8Array(await readFile(path))).toEqual(bytes);
      expect((await readdir(folder)).sort()).toEqual(['archive.zip']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('deflates to a raw stream zlib inflates back', () => {
    const data = new TextEncoder().encode('abc '.repeat(100));
    const deflated = new NodeCompressor().deflateRaw(data);
    expect(deflated.length).toBeLessThan(data.length);
    expect(new Uint8Array(inflateRawSync(deflated))).toEqual(data);
  });
});
