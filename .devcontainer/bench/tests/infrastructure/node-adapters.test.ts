import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLlmLayers } from '../../src/application/use-cases/read-llm-layers.js';
import { createNodeAdapters } from '../../src/infrastructure/node-adapters.js';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.js';
import { NodeHttpProbe } from '../../src/infrastructure/node-http-probe.js';
import { NodeLlmRecorder } from '../../src/infrastructure/node-llm-recorder.js';
import { NodeProcessRunner } from '../../src/infrastructure/node-process-runner.js';
import { ProcessEnvironment } from '../../src/infrastructure/process-environment.js';
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
