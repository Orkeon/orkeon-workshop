import { describe, expect, it } from 'vitest';

import type { ProcessResult } from '../../src/application/ports/process-runner.js';
import { DEFAULT_DOCTOR_OPTIONS, Doctor, type DoctorCheck } from '../../src/application/use-cases/doctor.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeHttpProbe } from '../fakes/fake-http-probe.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const WORKSHOP = '/home/tester/Orkeon';
const clock = new FixedClock(new Date('2026-09-30T19:12:00Z'));

function healthyFileSystem(): InMemoryFileSystem {
  const fileSystem = new InMemoryFileSystem().addFile(DEFAULT_DOCTOR_OPTIONS.typingsPath, 'declare const crew: unknown;');
  for (const folder of ['teams', 'workbooks', 'tests', 'settings', 'library', 'references', '.claude']) {
    fileSystem.addDirectory(`${WORKSHOP}/${folder}`);
  }
  return fileSystem.addDirectory(WORKSHOP);
}

function healthyCommands(): Record<string, ProcessResult> {
  return {
    'orkeon --version': succeeded('orkeon 1.2.0-src.20261117.g4709278+47092782792707948c0d\n'),
    'orkeon run --list-tools': succeeded('email_parser\nfile_read\nfile_write\n'),
    esbuild: succeeded('0.25.0\n'),
    python3: succeeded(''),
    'orkeon-code': succeeded('orkeon-code 1.0.0-rc.2 (install: /usr/local/lib/orkeon-code/1.0.0-rc.2)\n'),
    'orkeon-studio-config': succeeded('orkeon-studio-config 1.2.0\n'),
    'orkeon-mcp': succeeded('codebase_search\ncsv_reader\n'),
  };
}

const healthyHttp = (): FakeHttpProbe => new FakeHttpProbe({ [DEFAULT_DOCTOR_OPTIONS.ollamaTagsUrl]: { reachable: true, status: 200 } });
const environment = new FakeEnvironment({}, '/home/tester');

function doctor(commands: Record<string, ProcessResult> = healthyCommands(), http = healthyHttp(), fileSystem = healthyFileSystem()): Doctor {
  return new Doctor(new FakeProcessRunner(commands), http, fileSystem, environment, clock);
}

function byId(checks: readonly DoctorCheck[], id: string): DoctorCheck {
  const check = checks.find((candidate) => candidate.id === id);
  if (check === undefined) {
    throw new Error(`no check ${id}`);
  }
  return check;
}

describe('Doctor', () => {
  it('warns about a sandbox a killed run left, names it, and leaves it there', async () => {
    const fileSystem = healthyFileSystem();
    fileSystem.addFile('/tmp/orkeon-bench-run-Ab12Cd/notes/a.md', 'x');
    fileSystem.leftovers = [{ path: '/tmp/orkeon-bench-run-Ab12Cd', ageSeconds: 600, owner: 'gone' }];
    const report = await doctor(healthyCommands(), healthyHttp(), fileSystem).execute();
    expect(byId(report.checks, 'leftover-sandboxes')).toEqual({
      id: 'leftover-sandboxes',
      label: 'sandboxes left by a killed run',
      status: 'warn',
      detail: '1 sandbox left by a run that was killed: /tmp/orkeon-bench-run-Ab12Cd (10 min old, the run that made it is gone) — an `orkeon run` it started may still be running on it: stop it, then remove the folder',
    });
    expect(report.ok).toBe(true);
    expect(await fileSystem.exists('/tmp/orkeon-bench-run-Ab12Cd/notes/a.md')).toBe(true);
  });

  it('passes every check on a healthy machine', async () => {
    const runner = new FakeProcessRunner(healthyCommands());
    const report = await new Doctor(runner, healthyHttp(), healthyFileSystem(), environment, clock).execute();
    expect(report.ok).toBe(true);
    expect(report.checkedAt).toBe('2026-09-30T19:12:00.000Z');
    expect(report.referenceOrkeonVersion).toBe('1.2.0-src.20261117.g4709278');
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ['orkeon', 'pass'],
      ['tool-catalogue', 'pass'],
      ['esbuild', 'pass'],
      ['pyyaml', 'pass'],
      ['ollama', 'pass'],
      ['decision-model', 'pass'],
      ['llm-concurrency', 'pass'],
      ['typings', 'pass'],
      ['workshop', 'pass'],
      ['stray-settings', 'pass'],
      ['leftover-sandboxes', 'pass'],
      ['orkeon-code', 'pass'],
      ['orkeon-studio', 'pass'],
      ['orkeon-mcp', 'pass'],
    ]);
    expect(byId(report.checks, 'orkeon-mcp').detail).toBe('2 tools served to Claude Code');
    expect(byId(report.checks, 'tool-catalogue').detail).toBe('3 tools');
    expect(byId(report.checks, 'decision-model').detail).toMatch(/^skipped: no decision provider configured/);
    expect(runner.calls).toContainEqual({ command: 'python3', args: ['-c', 'import yaml'] });
    expect(runner.calls).toContainEqual({ command: 'orkeon', args: ['--version'] });
    expect(runner.calls).toContainEqual({ command: 'orkeon', args: ['run', '--list-tools'] });
  });

  describe('local model concurrency', () => {
    const USER_SETTINGS = '/home/tester/.config/Orkeon/appsettings.json';
    const concurrency = async (settings: unknown, variables: Record<string, string> = {}) => {
      const fileSystem = healthyFileSystem();
      if (settings !== undefined) {
        fileSystem.addFile(USER_SETTINGS, typeof settings === 'string' ? settings : JSON.stringify(settings));
      }
      const report = await new Doctor(new FakeProcessRunner(healthyCommands()), healthyHttp(), fileSystem, new FakeEnvironment(variables, '/home/tester'), clock).execute();
      return byId(report.checks, 'llm-concurrency');
    };
    const LOCAL = { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b' };

    it('passes a local model taking one request at a time, as the image writes it', async () => {
      expect(await concurrency({ Llm: LOCAL, RateLimiting: { MaxConcurrentRequests: 1, QueueLimit: 32 } })).toMatchObject({
        status: 'pass',
        detail: 'localhost: one request at a time, QueueLimit 32',
      });
    });

    it('fails when a local model sets no limit (absent or 0), keeps a limit set by hand, and warns about the default queue', async () => {
      expect(await concurrency({ Llm: LOCAL })).toMatchObject({ status: 'fail', detail: expect.stringContaining('no RateLimiting.MaxConcurrentRequests') });
      expect(await concurrency({ Llm: LOCAL, RateLimiting: { QueueLimit: 32 } })).toMatchObject({ status: 'fail' });
      expect(await concurrency({ Llm: LOCAL, RateLimiting: { MaxConcurrentRequests: 4 } })).toMatchObject({ status: 'pass', detail: 'localhost: RateLimiting.MaxConcurrentRequests 4, as set' });
      expect(await concurrency({ llm: { baseurl: 'http://host.docker.internal:11434' }, ratelimiting: { maxconcurrentrequests: 0 } })).toMatchObject({
        status: 'fail',
        detail: expect.stringContaining('RateLimiting.MaxConcurrentRequests 0'),
      });
      expect(await concurrency({ Llm: LOCAL, RateLimiting: { MaxConcurrentRequests: 1 } })).toMatchObject({ status: 'warn', detail: expect.stringContaining('QueueLimit defaults to 5') });
    });

    it('lets ORKEON_ variables override the file, as Orkeon does', async () => {
      expect(await concurrency({ Llm: LOCAL }, { ORKEON_RateLimiting__MaxConcurrentRequests: '1', ORKEON_RateLimiting__QueueLimit: '32' })).toMatchObject({ status: 'pass' });
      expect(await concurrency({ Llm: LOCAL }, { ORKEON_Llm__BaseUrl: 'https://api.example.com/v1' })).toMatchObject({ status: 'pass', detail: 'api.example.com: not a local model' });
    });

    it('passes a remote model, no settings file and no base URL, and warns about a file it cannot read', async () => {
      expect(await concurrency({ Llm: { BaseUrl: 'https://api.openai.com/v1' } })).toMatchObject({ status: 'pass', detail: 'api.openai.com: not a local model' });
      expect(await concurrency(undefined)).toMatchObject({ status: 'pass', detail: 'no local base URL in the Orkeon settings' });
      expect(await concurrency({ Llm: { Model: 'qwen3:8b' } })).toMatchObject({ status: 'pass' });
      expect(await concurrency('{ // comment\n "Llm": {} }')).toMatchObject({ status: 'warn', detail: expect.stringContaining('is not strict JSON') });
    });

    it('counts a LAN host named in HARNESS_LOCAL_LLM_HOSTS as local', async () => {
      const lan = { Llm: { BaseUrl: 'http://gpu-box.lan:8000/v1' } };
      expect(await concurrency(lan)).toMatchObject({ status: 'pass' });
      expect(await concurrency(lan, { HARNESS_LOCAL_LLM_HOSTS: 'gpu-box.lan' })).toMatchObject({ status: 'fail' });
    });
  });

  describe('decision model', () => {
    const USER_SETTINGS = '/home/tester/.config/Orkeon/appsettings.json';
    const KEV_MODELS = 'http://127.0.0.1:8009/v1/models';
    const decision = async (options: { settings?: unknown; variables?: Record<string, string>; benchConfig?: unknown; http?: FakeHttpProbe } = {}) => {
      const fileSystem = healthyFileSystem();
      if (options.settings !== undefined) {
        fileSystem.addFile(USER_SETTINGS, typeof options.settings === 'string' ? options.settings : JSON.stringify(options.settings));
      }
      if (options.benchConfig !== undefined) {
        fileSystem.addFile(`${WORKSHOP}/tests/mail-triage/bench.config.json`, JSON.stringify(options.benchConfig));
      }
      const http = options.http ?? healthyHttp();
      const report = await new Doctor(new FakeProcessRunner(healthyCommands()), http, fileSystem, new FakeEnvironment(options.variables ?? {}, '/home/tester'), clock).execute();
      return { check: byId(report.checks, 'decision-model'), http };
    };

    it('says it skipped the probe when no provider is configured, and calls nothing', async () => {
      const { check, http } = await decision();
      expect(check).toMatchObject({ status: 'pass', detail: expect.stringContaining('skipped: no decision provider configured') });
      expect(http.requests).toEqual([DEFAULT_DOCTOR_OPTIONS.ollamaTagsUrl]);
    });

    it('probes a Kev the machine names: any HTTP answer is up, none is a warning', async () => {
      const settings = { Orkeon: { Decision: { Provider: 'kev' } } };
      const up = await decision({ settings, http: new FakeHttpProbe({ [KEV_MODELS]: { reachable: false, status: 404 } }) });
      expect(up.check).toMatchObject({ status: 'pass', detail: 'Kev (the machine): http://127.0.0.1:8009/v1 answers (HTTP 404 on /models)' });
      const down = await decision({ settings });
      expect(down.check).toMatchObject({ status: 'warn', detail: expect.stringContaining('http://127.0.0.1:8009/v1 does not answer (ECONNREFUSED)') });
      expect(down.http.requests).toContain(KEV_MODELS);
    });

    it('says whether a hosted provider has its key, by the variable name only, without calling it', async () => {
      const secret = 'ts-live-0123456789';
      const set = await decision({ variables: { TYPESAFE_API_KEY: secret } });
      expect(set.check).toMatchObject({ status: 'pass', detail: expect.stringContaining('TypeSafe (the machine): TYPESAFE_API_KEY is set') });
      expect(set.check.detail).not.toContain(secret);
      expect(set.http.requests).toEqual([DEFAULT_DOCTOR_OPTIONS.ollamaTagsUrl]);
      const missing = await decision({ benchConfig: { decision: { provider: 'liquid' } } });
      expect(missing.check).toMatchObject({ status: 'warn', detail: expect.stringContaining('Liquid (tests/mail-triage): LIQUID_API_KEY is not set') });
    });

    it('reads the decision blocks of bench.config.json, the levels included, once per provider', async () => {
      const block = { provider: 'kev', base_url: 'http://localhost:9100/v1' };
      const { check } = await decision({
        benchConfig: { decision: block, levels: { e2e_local: { profile: 'machine', decision: block } } },
        http: new FakeHttpProbe({ 'http://localhost:9100/v1/models': { reachable: true, status: 200 } }),
      });
      expect(check).toMatchObject({ status: 'pass', detail: 'Kev (tests/mail-triage): http://localhost:9100/v1 answers' });
    });

    it('calls a Kev only on a loopback address: one elsewhere is said remote, not called', async () => {
    const { check, http } = await decision({ benchConfig: { decision: { provider: 'kev', base_url: 'http://gpu-box.lan:8009/v1' } } });
    expect(check).toMatchObject({ status: 'pass', detail: 'Kev (tests/mail-triage): http://gpu-box.lan:8009/v1 is remote (not a loopback address), not called' });
    expect(http.requests).toEqual([DEFAULT_DOCTOR_OPTIONS.ollamaTagsUrl]);
  });

  it('fails on decision settings Orkeon refuses to start on, and warns on a file it cannot read', async () => {
      expect((await decision({ settings: { Orkeon: { Decision: { Provider: 'nope' } } } })).check).toMatchObject({ status: 'fail', detail: expect.stringContaining("Orkeon:Decision:Provider is 'nope'") });
      expect((await decision({ settings: '{ // comment\n }' })).check).toMatchObject({ status: 'warn', detail: expect.stringContaining('is not strict JSON') });
    });
  });

  it('fails when orkeon, esbuild or PyYAML are missing, and says which', async () => {
    const report = await doctor({ python3: failed(1, "ModuleNotFoundError: No module named 'yaml'") }).execute();
    expect(report.ok).toBe(false);
    expect(byId(report.checks, 'orkeon')).toMatchObject({ status: 'fail', detail: 'orkeon not found on PATH' });
    expect(byId(report.checks, 'tool-catalogue')).toMatchObject({ status: 'fail', detail: 'orkeon not found on PATH' });
    expect(byId(report.checks, 'esbuild').status).toBe('fail');
    expect(byId(report.checks, 'pyyaml')).toMatchObject({ status: 'fail', detail: expect.stringContaining('No module named') });
  });

  it('warns on another Orkeon version and on an unreadable version, fails when orkeon crashes', async () => {
    const other = await doctor({ ...healthyCommands(), 'orkeon --version': succeeded('Orkeon 1.0.0\n') }).execute();
    expect(byId(other.checks, 'orkeon')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1.2.0') });
    expect(other.ok).toBe(true);
    const unreadable = await doctor({ ...healthyCommands(), 'orkeon --version': succeeded('hello') }).execute();
    expect(byId(unreadable.checks, 'orkeon').status).toBe('warn');
    const source = await doctor({ ...healthyCommands(), 'orkeon --version': succeeded('orkeon 1.2.0-src.20261117.g4709278+47092782792707948c0d\n') }).execute();
    expect(byId(source.checks, 'orkeon')).toMatchObject({ status: 'pass', detail: 'orkeon 1.2.0-src.20261117.g4709278' });
    const released = await doctor({ ...healthyCommands(), 'orkeon --version': succeeded('orkeon 1.2.0+a9f3878aca94\n') }).execute();
    expect(byId(released.checks, 'orkeon')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1.2.0-src.20261117.g4709278') });
    const later = await doctor({ ...healthyCommands(), 'orkeon --version': succeeded('orkeon 1.2.0-src.20261120.g1234abc\n') }).execute();
    expect(byId(later.checks, 'orkeon').status).toBe('warn');
    const crashing = await doctor({ ...healthyCommands(), 'orkeon --version': failed(2, 'boom') }).execute();
    expect(byId(crashing.checks, 'orkeon')).toMatchObject({ status: 'fail', detail: expect.stringContaining('boom') });
  });

  it('quotes the last line of a failing command, where a traceback names its cause', async () => {
    const traceback = 'Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nModuleNotFoundError: No module named \'yaml\'\n';
    const report = await doctor({ ...healthyCommands(), python3: failed(1, traceback) }).execute();
    expect(byId(report.checks, 'pyyaml').detail).toBe("python3 -c import yaml exited 1: ModuleNotFoundError: No module named 'yaml'");
  });

  it('says when a command was killed or printed nothing', async () => {
    const killed = await doctor({ ...healthyCommands(), esbuild: { found: true, exitCode: null, stdout: '', stderr: '' } }).execute();
    expect(byId(killed.checks, 'esbuild').detail).toBe('esbuild --version did not exit (killed or timed out)');
    const silent = await doctor({ ...healthyCommands(), esbuild: failed(3, '') }).execute();
    expect(byId(silent.checks, 'esbuild').detail).toBe('esbuild --version exited 3');
  });

  it('fails when the tool catalogue cannot be listed or is empty', async () => {
    const failing = await doctor({ ...healthyCommands(), 'orkeon run --list-tools': failed(1, 'unknown option') }).execute();
    expect(byId(failing.checks, 'tool-catalogue')).toMatchObject({ status: 'fail', detail: expect.stringContaining('unknown option') });
    const empty = await doctor({ ...healthyCommands(), 'orkeon run --list-tools': succeeded('No tool.\n') }).execute();
    expect(byId(empty.checks, 'tool-catalogue')).toMatchObject({ status: 'fail', detail: 'orkeon run --list-tools returned no tool' });
  });

  it('only warns when Ollama is unreachable (OLLAMA_MODE=off is legitimate)', async () => {
    const report = await doctor(healthyCommands(), new FakeHttpProbe()).execute();
    expect(byId(report.checks, 'ollama')).toMatchObject({ status: 'warn', detail: expect.stringContaining('ECONNREFUSED') });
    expect(report.ok).toBe(true);
    const http = new FakeHttpProbe({ [DEFAULT_DOCTOR_OPTIONS.ollamaTagsUrl]: { reachable: false, status: 503 } });
    expect(byId((await doctor(healthyCommands(), http).execute()).checks, 'ollama').detail).toContain('HTTP 503');
  });

  it('fails on missing typings and on a missing workshop or teams folder', async () => {
    const report = await doctor(healthyCommands(), healthyHttp(), new InMemoryFileSystem()).execute();
    expect(byId(report.checks, 'typings').status).toBe('fail');
    expect(byId(report.checks, 'workshop')).toMatchObject({ status: 'fail', detail: expect.stringContaining(WORKSHOP) });
    const noTeams = new InMemoryFileSystem().addDirectory(WORKSHOP).addDirectory(`${WORKSHOP}/library`);
    expect(byId((await doctor(healthyCommands(), healthyHttp(), noTeams).execute()).checks, 'workshop').detail).toContain('teams missing');
  });

  describe('stray settings files', () => {
    it('passes when Orkeon finds no settings file on its own, a team settings file in settings/ included', async () => {
      const fileSystem = healthyFileSystem()
        .addFile(`${WORKSHOP}/teams/demo/crew/config.yaml`, 'name: demo\n')
        .addFile(`${WORKSHOP}/settings/demo/appsettings.json`, '{"Llm":{"BaseUrl":"http://127.0.0.1:11434/v1"}}')
        .addFile(`${WORKSHOP}/teams/notes.txt`, 'not a team')
        .addFile(`${WORKSHOP}/teams/.hidden/appsettings.json`, '{}');
      expect(byId((await doctor(healthyCommands(), healthyHttp(), fileSystem).execute()).checks, 'stray-settings')).toMatchObject({
        status: 'pass',
        detail: `none in the teams, nor above ${WORKSHOP}/teams`,
      });
    });

    const INSTEAD =
      ": Orkeon reads such a file instead of the machine's settings for every run that names no settings file (Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one) — remove it: a team's own settings live in settings/<slug>/appsettings.json (D33)";
    const strayCheck = async (...paths: string[]): Promise<DoctorCheck> => {
      const fileSystem = healthyFileSystem().addFile(`${WORKSHOP}/teams/demo/crew/config.yaml`, 'name: demo\n');
      paths.forEach((path) => fileSystem.addFile(path, '{}'));
      return byId((await doctor(healthyCommands(), healthyHttp(), fileSystem).execute()).checks, 'stray-settings');
    };

    it.each([
      `${WORKSHOP}/appsettings/appsettings.json`,
      `${WORKSHOP}/teams/appsettings/appsettings.json`,
      '/home/appsettings/appsettings.json',
      `${WORKSHOP}/teams/demo/appsettings/appsettings.json`,
      `${WORKSHOP}/teams/demo/crew/appsettings.json`,
      `${WORKSHOP}/teams/demo/crew/appsettings/appsettings.json`,
    ])('fails on %s, which Orkeon would read instead of the machine settings', async (path) => {
      expect(await strayCheck(path)).toMatchObject({ status: 'fail', detail: `${path}${INSTEAD}` });
    });

    it('lists the files before their reason, the walked ones above the teams first', async () => {
      const team = `${WORKSHOP}/teams/demo`;
      const check = await strayCheck(`${team}/crew/appsettings.json`, `${WORKSHOP}/appsettings/appsettings.json`);
      expect(check.detail).toBe(`${WORKSHOP}/appsettings/appsettings.json, ${team}/crew/appsettings.json${INSTEAD}`);
    });

    it.each([`${WORKSHOP}/_shared/appsettings.json`, `${WORKSHOP}/teams/demo/_shared/appsettings.json`, `${WORKSHOP}/teams/demo/crew/_shared/appsettings.json`])(
      'passes on %s, which Orkeon no longer reads (the _shared fallback left at 1.0.0-rc.7)',
      async (path) => {
        expect((await strayCheck(path)).status).toBe('pass');
      },
    );

    it.each([
      `${WORKSHOP}/teams/demo/appsettings.json`,
      `${WORKSHOP}/teams/demo/appsettings.Production.json`,
      `${WORKSHOP}/teams/demo/AppSettings.json`,
      `${WORKSHOP}/teams/demo/appsettings-old.json`,
    ])('passes on %s: Orkeon no longer reads the settings files of the working directory (main at a2bb6c3)', async (path) => {
      expect((await strayCheck(path)).status).toBe('pass');
    });

    it('passes on a folder named like a settings file', async () => {
      const fileSystem = healthyFileSystem().addDirectory(`${WORKSHOP}/teams/demo/crew/appsettings.json`);
      expect(byId((await doctor(healthyCommands(), healthyHttp(), fileSystem).execute()).checks, 'stray-settings').status).toBe('pass');
    });
  });

  it('warns when optional workshop folders are missing', async () => {
    const partial = new InMemoryFileSystem().addDirectory(WORKSHOP).addDirectory(`${WORKSHOP}/teams`);
    const report = await doctor(healthyCommands(), healthyHttp(), partial).execute();
    expect(byId(report.checks, 'workshop')).toMatchObject({ status: 'warn', detail: `${WORKSHOP}: missing workbooks, tests, settings, library, references, .claude` });
  });

  it('what the image installs beside Orkeon is a warning when absent, never a failure', async () => {
    const commands = healthyCommands();
    delete commands['orkeon-code'];
    delete commands['orkeon-studio-config'];
    delete commands['orkeon-mcp'];
    const report = await doctor(commands).execute();
    expect(report.ok).toBe(true);
    expect(['orkeon-code', 'orkeon-studio', 'orkeon-mcp'].map((id) => byId(report.checks, id).status)).toEqual(['warn', 'warn', 'warn']);
    expect(byId(report.checks, 'orkeon-mcp').detail).toContain("Claude Code has none of Orkeon's tools");
    const failing = await doctor({ ...healthyCommands(), 'orkeon-mcp': failed(1, 'orkeon-mcp: orkeon run --list-tools failed') }).execute();
    expect(byId(failing.checks, 'orkeon-mcp').status).toBe('warn');
  });

  it('gives the Ollama probe a short timeout, so a silent server cannot slow a session start', async () => {
    const runner = new FakeProcessRunner(healthyCommands());
    const http = healthyHttp();
    await new Doctor(runner, http, healthyFileSystem(), environment, clock).execute();
    expect(http.timeouts).toEqual([DEFAULT_DOCTOR_OPTIONS.probeTimeoutMs]);
    expect(DEFAULT_DOCTOR_OPTIONS.probeTimeoutMs).toBeLessThanOrEqual(2000);
    expect(runner.timeouts).toHaveLength(7);
    expect(new Set(runner.timeouts)).toEqual(new Set([DEFAULT_DOCTOR_OPTIONS.commandTimeoutMs]));

    const quickRunner = new FakeProcessRunner(healthyCommands());
    const quickHttp = healthyHttp();
    await new Doctor(quickRunner, quickHttp, healthyFileSystem(), environment, clock, { probeTimeoutMs: 250, commandTimeoutMs: 5000 }).execute();
    expect(quickHttp.timeouts).toEqual([250]);
    expect(new Set(quickRunner.timeouts)).toEqual(new Set([5000]));
  });

  it('honours option overrides', async () => {
    const http = new FakeHttpProbe({ 'http://ollama:11434/api/tags': { reachable: true, status: 200 } });
    const fileSystem = healthyFileSystem().addFile('/opt/typings/orkeon.d.ts', '');
    const overridden = new Doctor(new FakeProcessRunner(healthyCommands()), http, fileSystem, environment, clock, {
      ollamaTagsUrl: 'http://ollama:11434/api/tags',
      typingsPath: '/opt/typings/orkeon.d.ts',
    });
    const report = await overridden.execute();
    expect(byId(report.checks, 'ollama').status).toBe('pass');
    expect(byId(report.checks, 'typings').detail).toBe('/opt/typings/orkeon.d.ts');
  });
});
