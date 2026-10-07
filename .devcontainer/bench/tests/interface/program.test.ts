import { describe, expect, it } from 'vitest';

import type { ProcessResult } from '../../src/application/ports/process-runner.js';
import type { Adapters } from '../../src/infrastructure/node-adapters.js';
import { EXIT } from '../../src/interface/exit-codes.js';
import { createProgram } from '../../src/interface/program.js';
import { createServices } from '../../src/interface/services.js';
import { Session } from '../../src/interface/session.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeHttpProbe } from '../fakes/fake-http-probe.js';
import { FakeLlmRecorder } from '../fakes/fake-llm-recorder.js';
import { FakeLlmStub, FakeShutdownSignal } from '../fakes/fake-llm-stub.js';
import { FakeProcessRunner, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { demoTeam, fixture } from '../fakes/fixture-team.js';
import type { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';
import { RecordingOutput } from '../fakes/recording-output.js';

const TEAM = '/home/tester/Orkeon/teams/demo';
const REPORT = '/home/tester/Orkeon/workbooks/demo/attempts/ATT-0001/report.json';
const STATUS = '/home/tester/Orkeon/workbooks/demo/STATUS.md';

const WORKSHOP = '/home/tester/Orkeon';
const TYPINGS = '/usr/local/share/orkeon/typings/orkeon.d.ts';
const OLLAMA = 'http://127.0.0.1:11434/api/tags';
const USER_SETTINGS = '/home/tester/.config/Orkeon/appsettings.json';

/** A team folder of its own, an outside folder and a Windows folder: the last two warned about. */
const WARNED_MOUNTS = JSON.stringify({
  mounts: [
    { root: '/workspace', access: 'ro', role: 'inputs', default: './input' },
    { root: '/archive', access: 'ro', role: 'archive', default: '/srv/archive' },
    { root: '/share', access: 'rw', role: 'deliverables', default: 'D:\\Share' },
  ],
});
const WARNINGS = [
  'warning: /archive is bound to /srv/archive, outside the team folder: Orkeon Studio launches the team only when this folder is declared, spelled exactly, in its Authorized folders (a container path never matches there)',
  'warning: /share is bound to the Windows path D:\\Share: the container cannot bind it, and Orkeon Studio only when it is declared, spelled exactly, in its Authorized folders',
];

interface Setup {
  variables?: Record<string, string>;
  files?: Record<string, string>;
  directories?: string[];
  commands?: Record<string, ProcessResult>;
  reachable?: string[];
  /** The user's Orkeon settings (`~/.config/Orkeon/appsettings.json`), as JSON. */
  settings?: unknown;
  /** What the LLM recorder receives during `tools dump`. */
  recorded?: unknown[];
  /** What the simulated LLM receives, per session, during `llm-stub serve` and `run`. */
  stubRequests?: { path: string; body: unknown }[][];
  /** The file system of an earlier command, to run the next one on what it left. */
  fileSystem?: InMemoryFileSystem;
  /** What a started process leaves behind (`FakeProcessRunner`). */
  onRun?: (line: string, fileSystem: InMemoryFileSystem) => void;
  /** The requests to stop the command receives. */
  shutdown?: FakeShutdownSignal;
}

/** Everything `doctor` needs to find nothing wrong except Ollama and the optional workshop folders. */
const TOOLS_PRESENT: Setup = { commands: { esbuild: succeeded('0.25.0'), python3: succeeded('') }, files: { [TYPINGS]: '' } };

async function run(args: string[], setup: Setup = {}): Promise<{ code: number; output: RecordingOutput; fileSystem: InMemoryFileSystem }> {
  const fileSystem = setup.fileSystem ?? demoTeam().fileSystem.addFile(REPORT, fixture('reports/accepted-report.json'));
  for (const [path, content] of Object.entries(setup.files ?? {})) {
    fileSystem.addFile(path, content);
  }
  for (const directory of setup.directories ?? []) {
    fileSystem.addDirectory(directory);
  }
  if (setup.settings !== undefined) {
    fileSystem.addFile(USER_SETTINGS, JSON.stringify(setup.settings));
  }
  const adapters: Adapters = {
    fileSystem,
    processRunner: new FakeProcessRunner(
      {
        'orkeon --version': succeeded('orkeon 1.0.0-rc.4.src.20261007.g80fdefe'),
        'orkeon run --list-tools': succeeded('file_read\nfile_write\n'),
        ...setup.commands,
      },
      async (line) => setup.onRun?.(line, fileSystem),
    ),
    httpProbe: new FakeHttpProbe(Object.fromEntries((setup.reachable ?? []).map((url) => [url, { reachable: true, status: 200 }]))),
    clock: new FixedClock(new Date('2026-09-30T19:12:00Z')),
    environment: new FakeEnvironment(setup.variables ?? {}, '/home/tester'),
    llmRecorder: new FakeLlmRecorder(setup.recorded ?? []),
    llmStub: new FakeLlmStub(setup.stubRequests ?? []),
    // A foreground server is asked to stop as soon as it has started; a run is not, unless the test says so.
    shutdownSignal: setup.shutdown ?? new FakeShutdownSignal(args[0] === 'llm-stub'),
  };
  const output = new RecordingOutput();
  const session = new Session(output);
  await createProgram(createServices(adapters), session).parseAsync(args, { from: 'user' });
  return { code: session.exitCode, output, fileSystem };
}

describe('mounts', () => {
  it('prints one line: a single --mount flag followed by every binding', async () => {
    const { code, output } = await run(['mounts', 'demo']);
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([`--mount ${TEAM}/input:/workspace:ro ${TEAM}/output:/output:rw ${TEAM}/state:/state:rw`]);
  });

  it('--env <set> --json binds the folders of the set, external, with the folder of the set', async () => {
    const SET = '/home/tester/Orkeon/mounts.test/demo';
    const { code, output } = await run(['mounts', 'demo', '--env', 'test', '--json'], { directories: [SET] });
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(output.text)).toEqual({
      team: 'demo',
      folder: TEAM,
      environment: 'test',
      set_folder: SET,
      allow_external: true,
      arguments: ['--mount', `${SET}/workspace:/workspace:ro`, `${SET}/output:/output:rw`, `${SET}/state:/state:rw`, '--allow-external-mounts'],
      studio_mounts: [`${SET}/workspace:/workspace:ro`, `${SET}/output:/output:rw`, `${SET}/state:/state:rw`],
      warnings: [],
      bindings: [
        { root: '/workspace', access: 'ro', role: 'inputs', declared_path: `${SET}/workspace`, physical_path: `${SET}/workspace`, relative_path: null, external: true },
        { root: '/output', access: 'rw', role: 'deliverables', declared_path: `${SET}/output`, physical_path: `${SET}/output`, relative_path: null, external: true },
        { root: '/state', access: 'rw', role: 'state', declared_path: `${SET}/state`, physical_path: `${SET}/state`, relative_path: null, external: true },
      ],
    });
  });

  it("--json of the team's own folders carries no set folder and the Studio card form", async () => {
    const { output } = await run(['mounts', 'demo', '--json']);
    const json = JSON.parse(output.text) as { set_folder: string | null; studio_mounts: string[]; allow_external: boolean };
    expect(json.set_folder).toBeNull();
    expect(json.allow_external).toBe(false);
    expect(json.studio_mounts).toEqual(['./input:/workspace:ro', './output:/output:rw', './state:/state:rw']);
  });

  it('quotes a path the shell would split', async () => {
    const mounts = JSON.stringify({ mounts: [{ root: '/workspace', access: 'ro', role: 'inputs', default: "/srv/shared inbox/it's" }] });
    const { output } = await run(['mounts', 'demo'], { files: { [`${TEAM}/mounts.json`]: mounts } });
    expect(output.stdout).toEqual([String.raw`--mount '/srv/shared inbox/it'\''s:/workspace:ro' --allow-external-mounts`]);
  });

  it('prints the warnings of the reach rule on stderr, after the line', async () => {
    const { code, output } = await run(['mounts', 'demo'], { files: { [`${TEAM}/mounts.json`]: WARNED_MOUNTS } });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([String.raw`--mount ${TEAM}/input:/workspace:ro /srv/archive:/archive:ro 'D:\Share:/share:rw' --allow-external-mounts`]);
    expect(output.stderr).toEqual(WARNINGS);
  });

  it('quotes a physical path that Orkeon would split', async () => {
    const mounts = JSON.stringify({ mounts: [{ root: '/workspace', access: 'ro', role: 'inputs', default: '/srv/a:b;c' }] });
    const { output } = await run(['mounts', 'demo'], { files: { [`${TEAM}/mounts.json`]: mounts } });
    expect(output.stdout).toEqual([`--mount '"/srv/a:b;c":/workspace:ro' --allow-external-mounts`]);
  });

  it('refuses a folder its agents must never reach: exit 2, the reason on stderr, nothing on stdout', async () => {
    const mounts = JSON.stringify({ mounts: [{ root: '/keys', access: 'ro', role: 'reference', default: '/home/tester/.ssh' }] });
    const { code, output } = await run(['mounts', 'demo'], { files: { [`${TEAM}/mounts.json`]: mounts } });
    expect(code).toBe(EXIT.error);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      'error: mounts.json: /keys is bound to /home/tester/.ssh, inside a hidden folder of the home folder, where tools keep their settings and credentials: its agents would reach it — bind a folder of its own',
    ]);
  });

  it('guards $ORKEON_WORKSHOP and $XDG_CONFIG_HOME/Orkeon as the environment sets them', async () => {
    const mounts = (path: string): Record<string, string> => ({ [`${TEAM}/mounts.json`]: JSON.stringify({ mounts: [{ root: '/notes', access: 'ro', role: 'inputs', default: path }] }) });
    const workshop = await run(['mounts', TEAM], { files: mounts('/srv/ws/tests/demo'), variables: { ORKEON_WORKSHOP: '/srv/ws' } });
    expect(workshop.output.stderr).toEqual([
      'error: mounts.json: /notes is bound to /srv/ws/tests/demo, inside the tests of every team, with their budgets: its agents would reach it — bind a folder of its own',
    ]);
    const settings = await run(['mounts', 'demo'], { files: mounts('/cfg/Orkeon/credentials'), variables: { XDG_CONFIG_HOME: '/cfg' } });
    expect(settings.output.stderr).toEqual([
      "error: mounts.json: /notes is bound to /cfg/Orkeon/credentials, inside the machine's Orkeon settings and the OAuth tokens of its mail accounts: its agents would reach it — bind a folder of its own",
    ]);
    expect((await run(['mounts', 'demo'], { files: mounts('/cfg/Orkeon/credentials') })).code).toBe(EXIT.ok);
  });

  it('turns an expected failure into exit 2 and a message on stderr', async () => {
    const { code, output } = await run(['mounts', 'demo', '--env', 'nope']);
    expect(code).toBe(EXIT.error);
    expect(output.stderr[0]).toBe('error: unknown environment "nope": /home/tester/Orkeon/mounts.nope/demo does not exist (known: default)');
    expect(output.stdout).toEqual([]);
    expect((await run(['mounts', 'ghost'])).code).toBe(EXIT.error);
  });
});

describe('status', () => {
  it('prints the front matter, in the order of the template, and the tail of the log', async () => {
    const { code, output } = await run(['status', 'demo']);
    expect(code).toBe(EXIT.ok);
    expect(output.stdout.slice(0, 10)).toEqual([
      `team: demo (${TEAM})`,
      'phase: design',
      'gate_passed: design',
      'track: full',
      'iteration: 0',
      'attempt: -',
      'batch: -',
      'verdict: -',
      'next_action: /team-tests',
      'updated_at: 2026-09-30T19:12:00Z',
    ]);
    expect(output.text).toContain('/team-design');
  });

  it('--json carries track and iteration, full and 0 for a workbook written before them', async () => {
    const before = '---\nphase: need\nnext_action: /team-need\nupdated_at: 2026-09-30T10:02:00Z\n---\n';
    const json = JSON.parse((await run(['status', 'demo', '--json'], { files: { [STATUS]: before } })).output.text) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(['team', 'folder', 'phase', 'gate_passed', 'track', 'iteration', 'attempt', 'batch', 'verdict', 'next_action', 'updated_at', 'log', 'warnings']);
    expect(json).toMatchObject({ track: 'full', iteration: 0 });
    const light = '---\nphase: build\ngate_passed: tests\ntrack: light\niteration: 2\nattempt: ATT-0004\nverdict: ITERATE\nnext_action: /team-build B1\nupdated_at: 2026-10-03T09:00:00Z\n---\n';
    expect(JSON.parse((await run(['status', 'demo', '--json'], { files: { [STATUS]: light } })).output.text)).toMatchObject({ track: 'light', iteration: 2, warnings: [] });
  });

  it('exits 2 on a track or an iteration it does not know, naming the key', async () => {
    const odd = '---\nphase: need\ntrack: quick\nnext_action: /team-need\nupdated_at: 2026-09-30T10:02:00Z\n---\n';
    const { code, output } = await run(['status', 'demo'], { files: { [STATUS]: odd } });
    expect(code).toBe(EXIT.error);
    expect(output.stderr).toEqual(['error: invalid STATUS.md front matter: track: expected the track chosen at /team-init: full or light']);
  });

  it('--json carries the log and the warnings', async () => {
    const status = '---\nphase: run\ngate_passed: design\nnext_action: /team-run\nupdated_at: 2026-09-30T19:12:00Z\n---\n';
    const { output } = await run(['status', 'demo', '--json'], { files: { [STATUS]: status } });
    const json = JSON.parse(output.text) as { phase: string; log: string[]; warnings: string[] };
    expect(json.phase).toBe('run');
    expect(json.log).toEqual([]);
    expect(json.warnings).toEqual(['phase run has no attempt (an attempt is opened when the build starts)']);
    const text = await run(['status', 'demo'], { files: { [STATUS]: status } });
    expect(text.output.stdout.at(-1)).toBe('warning: phase run has no attempt (an attempt is opened when the build starts)');
  });
});

describe('a team without its folder yet: workbook and tests only (D35)', () => {
  const FRESH = '/home/tester/Orkeon/teams/fresh';
  const EARLY: Setup = {
    files: {
      '/home/tester/Orkeon/workbooks/fresh/STATUS.md': '---\nphase: test-plan\ngate_passed: need\ntrack: full\niteration: 0\nnext_action: /team-test-plan\nupdated_at: 2026-10-03T09:00:00Z\n---\n',
      '/home/tester/Orkeon/tests/fresh/bench.config.json': JSON.stringify({ profiles: { lan: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm', keyEnv: 'LAN_KEY' } } }),
    },
  };

  it('status reads its workbook', async () => {
    const { code, output } = await run(['status', 'fresh'], EARLY);
    expect(code).toBe(EXIT.ok);
    expect(output.stdout.slice(0, 3)).toEqual([`team: fresh (${FRESH})`, 'phase: test-plan', 'gate_passed: need']);
  });

  it('profile reads its tests', async () => {
    const { code, output } = await run(['profile', 'fresh', 'lan', '--json'], EARLY);
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(output.text)).toMatchObject({ team: 'fresh', profile: { name: 'lan', base_url: 'http://127.0.0.1:1234/v1' }, remote: false });
  });

  it('mounts and scaffold say that the folder holding mounts.json does not exist yet', async () => {
    for (const command of ['mounts', 'scaffold']) {
      const { code, output } = await run([command, 'fresh'], EARLY);
      expect(code).toBe(EXIT.error);
      expect(output.stderr).toEqual([`error: mounts.json not found: ${FRESH}/mounts.json (no team folder yet: the first build batch creates it, D35)`]);
    }
  });

  it('a slug with none of the three trees is not a team', async () => {
    const { code, output } = await run(['status', 'ghost'], EARLY);
    expect(code).toBe(EXIT.error);
    expect(output.stderr).toEqual([
      'error: team not found: none of /home/tester/Orkeon/teams/ghost, /home/tester/Orkeon/workbooks/ghost, /home/tester/Orkeon/tests/ghost exists',
    ]);
  });
});

describe('profile', () => {
  it('prints variable names and never the secret value', async () => {
    const setup = { variables: { ANTHROPIC_API_KEY: 'sk-very-secret' } };
    const { code, output } = await run(['profile', 'demo', 'claude'], setup);
    expect(code).toBe(EXIT.ok);
    expect(output.text).toContain('ORKEON_Llm__ApiKey (secret, from ANTHROPIC_API_KEY)');
    expect(output.text).toContain('keyEnv: ANTHROPIC_API_KEY (set)');
    expect(output.text).not.toContain('sk-very-secret');
    const json = (await run(['profile', 'demo', 'claude', '--json'], setup)).output.text;
    expect(json).not.toContain('sk-very-secret');
    expect(JSON.parse(json)).toEqual({
      team: 'demo',
      profile: { name: 'claude', kind: 'named', base_url: 'https://api.anthropic.com', model: '<to decide>', key_env: 'ANTHROPIC_API_KEY', timeout_seconds: 600 },
      remote: true,
      base_url_host: 'api.anthropic.com',
      remote_reason: 'remote-host',
      remote_profile: null,
      providers: [],
      orkeon_profiles: [],
      variables: {
        ORKEON_Llm__BaseUrl: 'https://api.anthropic.com',
        ORKEON_Llm__Model: '<to decide>',
        ORKEON_Llm__TimeoutSeconds: '600',
        ORKEON_Llm__ApiKeyEnvVar: '',
        ORKEON_Llm__ApiKey: '[redacted]',
      },
      secret_names: ['ORKEON_Llm__ApiKey'],
      runtime_names: [],
      key_env: 'ANTHROPIC_API_KEY',
      key_present: true,
      machine: null,
      warnings: [],
    });
  });

  it('--json describes the machine settings without the key', async () => {
    const machine = JSON.parse((await run(['profile', 'demo', 'machine', '--json'])).output.text) as Record<string, unknown>;
    expect(machine).toMatchObject({ profile: { name: 'machine', kind: 'machine' }, variables: {}, machine: { settings_file: null, base_url_source: null, configured_by: [] } });
    const keyed = (await run(['profile', 'demo', 'machine', '--json'], { settings: { Llm: { BaseUrl: 'http://localhost:11434', ApiKey: 'sk-secret' } } })).output.text;
    expect(keyed).not.toContain('sk-secret');
    const stub = JSON.parse((await run(['profile', 'demo', 'stub', '--json'])).output.text) as Record<string, unknown>;
    expect(stub).toMatchObject({
      profile: { name: 'stub', kind: 'stub', base_url: null, model: 'stub-model' },
      variables: { ORKEON_Llm__Model: 'stub-model', ORKEON_Llm__ApiKey: 'stub' },
      runtime_names: ['ORKEON_Llm__BaseUrl'],
    });
  });

  describe('remote and base_url_host', () => {
    const ollama = { Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b', TimeoutSeconds: 600 } };
    const target = async (name: string, setup: Setup = {}) => {
      const json = JSON.parse((await run(['profile', 'demo', name, '--json'], setup)).output.text) as Record<string, unknown>;
      return { remote: json.remote, base_url_host: json.base_url_host };
    };

    it('is false with a null host when nothing is configured (echo provider)', async () => {
      expect(await target('machine')).toEqual({ remote: false, base_url_host: null });
    });

    it('follows the machine settings, overridden by ORKEON_Llm__BaseUrl', async () => {
      expect(await target('machine', { settings: ollama })).toEqual({ remote: false, base_url_host: 'localhost' });
      expect(await target('machine', { settings: ollama, variables: { ORKEON_Llm__BaseUrl: 'https://api.openai.com/v1' } })).toEqual({ remote: true, base_url_host: 'api.openai.com' });
    });

    it('carries remote_reason: local-host or remote-host when a base URL decides', async () => {
      const reason = async (setup: Setup) => (JSON.parse((await run(['profile', 'demo', 'machine', '--json'], setup)).output.text) as { remote_reason: string }).remote_reason;
      expect(await reason({ settings: ollama })).toBe('local-host');
      expect(await reason({ settings: ollama, variables: { ORKEON_Llm__BaseUrl: 'http://gpu-box.lan:8000/v1' } })).toBe('remote-host');
      expect(await reason({ settings: ollama, variables: { ORKEON_Llm__BaseUrl: 'http://gpu-box.lan:8000/v1', HARNESS_LOCAL_LLM_HOSTS: 'gpu-box.lan' } })).toBe('local-host');
      expect(await reason({ settings: ollama, variables: { ORKEON_Llm__BaseUrl: 'http://host.docker.internal:11434' } })).toBe('local-host');
      expect(await reason({})).toBe('not-configured');
      expect(await reason({ settings: { Llm: { Provider: 'ollama', Model: 'qwen3:8b' } } })).toBe('no-base-url');
    });

    it('is never remote for the stub and always decided by the base URL for a named profile', async () => {
      expect(await target('stub', { variables: { ORKEON_Llm__BaseUrl: 'https://api.openai.com/v1' } })).toEqual({ remote: false, base_url_host: '127.0.0.1' });
      expect(await target('claude', { settings: ollama })).toEqual({ remote: true, base_url_host: 'api.anthropic.com' });
      const config = JSON.stringify({ profiles: { lan: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm', keyEnv: 'LAN_KEY' } } });
      expect(await target('lan', { files: { ['/home/tester/Orkeon/tests/demo/bench.config.json']: config } })).toEqual({ remote: false, base_url_host: '127.0.0.1' });
    });

    it('is shown in the text output with its reason', async () => {
      expect((await run(['profile', 'demo', 'claude'])).output.stdout).toContain('remote: yes (api.anthropic.com: host is not local)');
      expect((await run(['profile', 'demo', 'machine'], { settings: ollama })).output.stdout).toContain('remote: no (localhost: local host)');
      expect((await run(['profile', 'demo', 'machine'])).output.stdout).toContain('remote: no (no Llm section: echo provider)');
      expect((await run(['profile', 'demo', 'machine'], { variables: { ORKEON_Llm__ApiKey: 'sk-x' } })).output.stdout).toContain(
        'remote: yes (no base URL: Orkeon infers the provider and its endpoint)',
      );
    });

    it('names the settings file and the layers in the text and the JSON', async () => {
      const text = (await run(['profile', 'demo', 'machine'], { settings: ollama })).output.stdout;
      expect(text).toContain(`  settings file: ${USER_SETTINGS}`);
      expect(text).toContain(`  base URL from: ${USER_SETTINGS}`);
      expect(text).toContain(`  Llm section from: ${USER_SETTINGS}`);
      const json = JSON.parse((await run(['profile', 'demo', 'machine', '--json'], { settings: ollama, variables: { Llm__Model: 'm' } })).output.text) as Record<string, unknown>;
      expect(json.machine).toEqual({ settings_file: USER_SETTINGS, base_url_source: USER_SETTINGS, configured_by: [USER_SETTINGS, 'Llm__* variables'], profiles: [] });
    });

    it('names a remote named profile in the text and the JSON', async () => {
      const settings = { Llm: { BaseUrl: 'http://localhost:11434', Profiles: { claude: { BaseUrl: 'https://api.anthropic.com' } } } };
      const text = (await run(['profile', 'demo', 'machine'], { settings })).output.stdout;
      expect(text).toContain('  named profile claude: api.anthropic.com: host is not local, remote');
      expect(text).toContain('remote: yes (api.anthropic.com: host is not local, named profile claude)');
      const json = JSON.parse((await run(['profile', 'demo', 'machine', '--json'], { settings })).output.text) as Record<string, unknown>;
      expect(json).toMatchObject({
        remote: true,
        remote_reason: 'remote-host',
        base_url_host: 'api.anthropic.com',
        remote_profile: 'claude',
        orkeon_profiles: ['claude'],
        providers: [
          { profile: null, remote: false, base_url_host: 'localhost', remote_reason: 'local-host' },
          { profile: 'claude', remote: true, base_url_host: 'api.anthropic.com', remote_reason: 'remote-host' },
        ],
      });
    });
  });

  it('warns when the key variable is not set', async () => {
    const { output } = await run(['profile', 'demo', 'claude']);
    expect(output.text).toContain('keyEnv: ANTHROPIC_API_KEY (not set)');
    expect(output.text).not.toContain('ORKEON_Llm__ApiKey (secret');
    expect(output.stdout.at(-1)).toBe('warning: ANTHROPIC_API_KEY is not set: ORKEON_Llm__ApiKey will not be injected');
  });

  it('machine says that nothing is injected and warns about missing settings', async () => {
    const { output } = await run(['profile', 'demo', 'machine']);
    expect(output.stdout).toContain('variables to inject: none (machine settings apply)');
    expect(output.text).toContain('warning: no Orkeon settings file');
  });

  it('stub shows the neutral model and leaves the base URL to run time', async () => {
    const { code, output } = await run(['profile', 'demo', 'stub']);
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toContain('  model: stub-model');
    expect(output.stdout).toContain('  ORKEON_Llm__BaseUrl (set at run time)');
    expect(output.text).toContain('http://127.0.0.1:<port>/v1');
  });

  it('exits 2 on an unknown profile', async () => {
    const { code, output } = await run(['profile', 'demo', 'gpt']);
    expect(code).toBe(EXIT.error);
    expect(output.stderr[0]).toContain('unknown profile "gpt"');
  });
});

describe('report validate', () => {
  it('exits 0 on a valid report', async () => {
    const { code, output } = await run(['report', 'validate', REPORT]);
    expect(code).toBe(EXIT.ok);
    expect(output.text).toMatch(/^valid: .* → ACCEPTED$/);
  });

  it('exits 1 and lists the issues on an invalid report', async () => {
    const { code, output } = await run(['report', 'validate', '/bad.json'], { files: { '/bad.json': '{"schema_version":"1.0"}' } });
    expect(code).toBe(EXIT.failed);
    expect(output.stdout[0]).toBe('invalid: /bad.json');
    expect(output.stdout.length).toBeGreaterThan(1);
    const json = await run(['report', 'validate', '/bad.json', '--json'], { files: { '/bad.json': '{"schema_version":"1.0"}' } });
    expect(JSON.parse(json.output.text)).toMatchObject({ path: '/bad.json', valid: false, verdict_input: null, accepted: false });
  });

  it('--json carries the computed verdict input of a valid report', async () => {
    const { output } = await run(['report', 'validate', REPORT, '--json']);
    expect(JSON.parse(output.text)).toEqual({
      path: REPORT,
      valid: true,
      issues: [],
      verdict_input: { all_ac_pass: true, all_inv_pass: true, indicators_in_range: true },
      accepted: true,
    });
  });

  it('exits 2 when the file does not exist', async () => {
    expect((await run(['report', 'validate', '/missing.json'])).code).toBe(EXIT.error);
  });
});

describe('doctor', () => {
  it('exits 1 when a check fails and prints the table', async () => {
    const { code, output } = await run(['doctor']);
    expect(code).toBe(EXIT.failed);
    expect(output.stdout[0]).toContain('references established on Orkeon 1.0.0-rc.4.src.20261007.g80fdefe');
    expect(output.text).toContain('PASS  orkeon CLI on PATH');
    expect(output.text).toContain('FAIL  esbuild on PATH');
    expect(output.stdout.at(-1)).toMatch(/^Result: FAILED/);
  });

  it('--json lists every check with its id', async () => {
    const json = JSON.parse((await run(['doctor', '--json'])).output.text) as Record<string, unknown> & { checks: Record<string, string>[] };
    expect(Object.keys(json)).toEqual(['bench_version', 'reference_orkeon_version', 'checked_at', 'ok', 'checks']);
    expect(json).toMatchObject({ reference_orkeon_version: '1.0.0-rc.4.src.20261007.g80fdefe', checked_at: '2026-09-30T19:12:00.000Z', ok: false });
    expect(json.bench_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(json.checks.map((check) => check.id)).toEqual(['orkeon', 'tool-catalogue', 'esbuild', 'pyyaml', 'ollama', 'llm-concurrency', 'typings', 'workshop', 'stray-settings', 'leftover-sandboxes']);
    expect(json.checks[1]).toEqual({ id: 'tool-catalogue', label: 'orkeon tool catalogue', status: 'pass', detail: '2 tools' });
  });

  describe('--quiet', () => {
    it('prints one line per failing check on stderr, nothing on stdout, and exits 1', async () => {
      const { code, output } = await run(['doctor', '--quiet']);
      expect(code).toBe(EXIT.failed);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([
        'FAIL esbuild: esbuild not found on PATH',
        'FAIL pyyaml: python3 not found on PATH',
        `FAIL typings: ${TYPINGS} missing (run orkeon-update)`,
      ]);
    });

    it('prints nothing and exits 0 when checks only warn', async () => {
      const { code, output } = await run(['doctor', '--quiet'], TOOLS_PRESENT);
      expect(code).toBe(EXIT.ok);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([]);
      const table = (await run(['doctor'], TOOLS_PRESENT)).output.text;
      expect(table).toContain('WARN  Ollama reachable');
      expect(table).toContain('WARN  workshop layout');
    });

    it('prints nothing and exits 0 when everything passes', async () => {
      const healthy: Setup = { ...TOOLS_PRESENT, reachable: [OLLAMA], directories: ['settings', 'library', 'references', '.claude'].map((folder) => `${WORKSHOP}/${folder}`) };
      const { code, output } = await run(['doctor', '-q'], healthy);
      expect(code).toBe(EXIT.ok);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([]);
      expect((await run(['doctor'], healthy)).output.stdout.at(-1)).toBe('Result: OK');
    });

    it('cannot be combined with --json', async () => {
      await expect(run(['doctor', '--quiet', '--json'])).rejects.toMatchObject({ code: 'commander.conflictingOption' });
    });
  });
});

describe('commander output', () => {
  it('prints the version on stdout and stops the parse', async () => {
    const output = new RecordingOutput();
    const { fileSystem } = demoTeam();
    const adapters: Adapters = {
      fileSystem,
      processRunner: new FakeProcessRunner(),
      httpProbe: new FakeHttpProbe(),
      clock: new FixedClock(new Date('2026-09-30T19:12:00Z')),
      environment: new FakeEnvironment(),
      llmRecorder: new FakeLlmRecorder([]),
      llmStub: new FakeLlmStub(),
      shutdownSignal: new FakeShutdownSignal(),
    };
    const program = createProgram(createServices(adapters), new Session(output));
    await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toMatchObject({ code: 'commander.version' });
    expect(output.stdout).toHaveLength(1);
    expect(output.stdout[0]).toMatch(/^\d+\.\d+\.\d+$/);
    await expect(program.parseAsync(['frobnicate'], { from: 'user' })).rejects.toMatchObject({ code: 'commander.unknownCommand' });
    expect(output.stderr[0]).toContain("unknown command 'frobnicate'");
  });

  it('says what the bench does, and what doctor checks', async () => {
    const help = async (args: string[]): Promise<string> => {
      const output = new RecordingOutput();
      const adapters: Adapters = {
        fileSystem: demoTeam().fileSystem,
        processRunner: new FakeProcessRunner(),
        httpProbe: new FakeHttpProbe(),
        clock: new FixedClock(new Date('2026-09-30T19:12:00Z')),
        environment: new FakeEnvironment(),
        llmRecorder: new FakeLlmRecorder([]),
        llmStub: new FakeLlmStub(),
        shutdownSignal: new FakeShutdownSignal(),
      };
      await expect(createProgram(createServices(adapters), new Session(output)).parseAsync(args, { from: 'user' })).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
      return output.stdout.join('\n').replaceAll(/\s+/g, ' ');
    };
    expect(await help(['--help'])).toContain('Bench CLI of the Orkeon harness: checks the machine, reads and scaffolds Orkeon agent teams, opens their attempts and runs their static and component tests with a simulated LLM.');
    expect(await help(['doctor', '--help'])).toContain(
      'check orkeon and its tool catalogue, esbuild, PyYAML, Ollama, the local model concurrency, the typings, the workshop layout and stray settings files',
    );
  });
});

describe('scaffold', () => {
  const CREW = { [`${TEAM}/crew/config.yaml`]: 'name: demo\n', [`${TEAM}/crew/agents/writer.yaml`]: 'role: Writer\n' };

  it('writes the launchers and the card from mounts.json and says what it did', async () => {
    const { code, output } = await run(['scaffold', 'demo'], { files: CREW });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([
      'demo: yaml crew, launchers start crew',
      'wrote run.sh, run.cmd, studio-team.json, .gitignore',
      'mounts: ./input:/workspace:ro ./output:/output:rw ./state:/state:rw',
      'created input/ output/ state/',
    ]);
  });

  it('--json lists the files, the folders and the card mounts', async () => {
    const { output } = await run(['scaffold', 'demo', '--json'], { files: CREW, directories: [`${TEAM}/input`] });
    expect(JSON.parse(output.text)).toEqual({
      team: 'demo',
      folder: TEAM,
      kind: 'yaml',
      target: 'crew',
      written: ['run.sh', 'run.cmd', 'studio-team.json', '.gitignore'],
      created: ['output', 'state'],
      placeholders: ['input/.gitkeep', 'output/.gitkeep', 'state/.gitkeep'],
      studio_mounts: ['./input:/workspace:ro', './output:/output:rw', './state:/state:rw'],
      warnings: [],
    });
  });

  it('prints the warnings of the reach rule on stderr, after what it did', async () => {
    const { code, output } = await run(['scaffold', 'demo'], { files: { ...CREW, [`${TEAM}/mounts.json`]: WARNED_MOUNTS } });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([
      'demo: yaml crew, launchers start crew',
      'wrote run.sh, run.cmd, studio-team.json, .gitignore',
      String.raw`mounts: ./input:/workspace:ro /srv/archive:/archive:ro D:\Share:/share:rw`,
      'created input/',
    ]);
    expect(output.stderr).toEqual(WARNINGS);
  });

  it('refuses a mount point bound to the team folder itself: exit 2, the reason on stderr', async () => {
    const mounts = JSON.stringify({ mounts: [{ root: '/notes', access: 'rw', role: 'inputs', default: '.' }] });
    const { code, output } = await run(['scaffold', 'demo'], { files: { ...CREW, [`${TEAM}/mounts.json`]: mounts } });
    expect(code).toBe(EXIT.error);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      'error: mounts.json: /notes is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as ./notes',
    ]);
  });

  it('exits 2 when the team has no crew yet', async () => {
    const { code, output } = await run(['scaffold', 'demo']);
    expect(code).toBe(EXIT.error);
    expect(output.stderr).toEqual([
      `error: no crew to launch in ${TEAM}/crew: write crew/config.yaml with crew/agents/ and crew/tasks/ (YAML), or crew/crew.ork.ts (TypeScript), first`,
    ]);
  });
});

describe('commands of later lots', () => {
  it.each([
    [['datasets', 'build', 'demo'], 4],
    [['evaluate', 'RUN-20260930-1912-local'], 4],
    [['capture', 'demo'], 4],
    [['team', 'rename', 'demo', 'demo-2'], 4],
    [['team', 'remove', 'demo'], 4],
    [['estimate', 'demo', '--llm', 'remote'], 9],
    [['release', 'demo'], 9],
    [['check', 'design', 'demo'], 3],
  ])('%j is a stub of lot %i exiting 3', async (args, lot) => {
    const { code, output } = await run(args);
    expect(code).toBe(EXIT.notImplemented);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([`orkeon-bench ${args[0] === 'check' ? 'check design' : args[0]}: not implemented yet (lot ${lot})`]);
  });
});

describe('Session', () => {
  it('lets an unexpected error through', async () => {
    const session = new Session(new RecordingOutput());
    await expect(session.run(() => Promise.reject(new TypeError('bug')))).rejects.toThrow('bug');
  });
});

describe('tools dump', () => {
  const REQUEST = {
    model: 'stub-model',
    tools: [
      { type: 'function', function: { name: 'file_write', description: 'Write a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
      { type: 'function', function: { name: 'file_read', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, encoding: { type: 'string' } }, required: ['path'] } } },
    ],
  };
  const RUN_CREW = { 'orkeon run crew': succeeded('=== Crew Output ===\nOK\n') };

  it('prints a Markdown table of every tool, required arguments in bold', async () => {
    const { code, output } = await run(['tools', 'dump'], { commands: RUN_CREW, recorded: [REQUEST] });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([
      ['| Tool | Arguments | What it does |', '|---|---|---|', '| `file_read` | **`path`**, `encoding` | Read a file. |', '| `file_write` | **`path`**, **`content`** | Write a file. |'].join('\n'),
      '',
      '2 tools recorded',
    ]);
  });

  it('--json prints the entries as orkeon run sent them', async () => {
    const { code, output } = await run(['tools', 'dump', '--json'], { commands: RUN_CREW, recorded: [REQUEST] });
    expect(code).toBe(EXIT.ok);
    const printed = JSON.parse(output.stdout.join('\n')) as { tools: { function: { name: string } }[]; missing: string[] };
    expect(printed.tools.map((tool) => tool.function.name)).toEqual(['file_read', 'file_write']);
    expect(printed.missing).toEqual([]);
  });

  it('exits 1 and names a listed tool that never reached the model', async () => {
    const { code, output } = await run(['tools', 'dump'], {
      commands: { ...RUN_CREW, 'orkeon run --list-tools': succeeded('file_read\nfile_write\nweb_search\n') },
      recorded: [REQUEST],
    });
    expect(code).toBe(EXIT.failed);
    expect(output.stdout.at(-1)).toBe('listed by orkeon run --list-tools but not sent to the model: web_search');
  });

  it('exits 2 when orkeon is not on the PATH', async () => {
    const { code, output } = await run(['tools', 'dump'], { commands: { 'orkeon run --list-tools': { found: false, exitCode: null, stdout: '', stderr: '' } } });
    expect(code).toBe(EXIT.error);
    expect(output.stderr).toEqual(['error: orkeon not found on PATH']);
  });
});

describe('attempt', () => {
  const ATTEMPT = '/home/tester/Orkeon/workbooks/demo/attempts/ATT-0001';

  it('open, approve and close say what they did, in text', async () => {
    const fileSystem = demoTeam().fileSystem;
    const opened = await run(['attempt', 'open', 'demo', '--by', 'team-build'], { fileSystem });
    expect(opened.code).toBe(EXIT.ok);
    expect(opened.output.stdout).toEqual([`demo: opened ATT-0001 (${ATTEMPT}) — no crew yet: the design snapshot comes with the first run`]);
    const approved = await run(['attempt', 'approve', 'demo', '--usd', '1.50'], { fileSystem });
    expect(approved.code).toBe(EXIT.ok);
    expect(approved.output.stdout).toEqual([`demo: remote run approved in ATT-0001 — 1.5 USD, cap 2 USD (${ATTEMPT}/remote-approval.json)`]);
    const closed = await run(['attempt', 'close', 'demo', '--verdict', 'iterate'], { fileSystem });
    expect(closed.code).toBe(EXIT.ok);
    expect(closed.output.stdout).toEqual(['demo: closed ATT-0001 (ITERATE)']);
  });

  it('--json prints the attempt, its manifest and the approval, in snake_case', async () => {
    const fileSystem = demoTeam().fileSystem.addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n');
    const opened = JSON.parse((await run(['attempt', 'open', 'demo', '--json'], { fileSystem })).output.text) as { manifest: Record<string, unknown> };
    expect(opened).toMatchObject({ team: 'demo', attempt: 'ATT-0001', folder: ATTEMPT, manifest: { closed_at: null, opened_by: 'manual', design_snapshot: 'design-snapshot/' } });
    const approved = JSON.parse((await run(['attempt', 'approve', 'demo', '--usd', '2', '--json'], { fileSystem })).output.text) as unknown;
    expect(approved).toEqual({
      team: 'demo',
      attempt: 'ATT-0001',
      file: `${ATTEMPT}/remote-approval.json`,
      approval: { by: 'user', at: '2026-09-30T19:12:00.000Z', estimated_usd: 2, cap_usd: 2, source: '/team-approve remote 2' },
    });
    const closed = JSON.parse((await run(['attempt', 'close', 'demo', '--json'], { fileSystem })).output.text) as { manifest: Record<string, unknown> };
    expect(closed.manifest).toMatchObject({ closed_at: '2026-09-30T19:12:00.000Z', verdict: null, remote_approval: { estimated_usd: 2 } });
  });

  it('exits 2 with one line when it refuses', async () => {
    const fileSystem = demoTeam().fileSystem;
    const refusal = async (args: string[]): Promise<string[]> => {
      const { code, output } = await run(args, { fileSystem });
      expect(code, args.join(' ')).toBe(EXIT.error);
      expect(output.stdout).toEqual([]);
      return output.stderr;
    };
    expect(await refusal(['attempt', 'approve', 'demo', '--usd', '1'])).toEqual(['error: no open attempt for demo: open one with `orkeon-bench attempt open demo`']);
    expect(await refusal(['attempt', 'close', 'demo'])).toEqual(['error: no open attempt for demo: open one with `orkeon-bench attempt open demo`']);
    await run(['attempt', 'open', 'demo'], { fileSystem });
    expect(await refusal(['attempt', 'open', 'demo'])).toEqual(['error: ATT-0001 is still open for demo: close it with `orkeon-bench attempt close demo` before opening another']);
    expect(await refusal(['attempt', 'approve', 'demo', '--usd', '2.01'])).toEqual([
      'error: 2.01 USD is above the cap of 2 USD (budget.remote_usd_max of bench.config.json): raise the cap with a decision first, or approve a lower amount',
    ]);
    expect(await refusal(['attempt', 'approve', 'demo', '--usd', '-1'])).toEqual(['error: "-1" is not an amount of USD: expected a number of 0 or more, such as 1.50']);
    expect(await refusal(['attempt', 'close', 'demo', '--verdict', 'done'])).toEqual(['error: unknown verdict "done" (expected ACCEPTED, ITERATE, BLOCKED)']);
    expect(await refusal(['attempt', 'open', 'ghost'])).toEqual([expect.stringContaining('error: team not found')]);
    expect(await refusal(['attempt', 'close', 'demo', '--verdict', 'ACCEPTED'])).toEqual([
      'error: ATT-0001 cannot be closed ACCEPTED: it has no report.json — an attempt is accepted on the report of a run (`orkeon-bench run`)',
    ]);
    expect(await refusal(['attempt', 'open', 'demo', '--by', 'a\nb'])).toEqual([expect.stringContaining('error: --by names who opens the attempt in one short line')]);
    expect(await fileSystem.exists(`${ATTEMPT}/remote-approval.json`)).toBe(false);
    await expect(run(['attempt', 'approve', 'demo'], { fileSystem })).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
  });
});

describe('attempt, on a folder left without a manifest', () => {
  const FOLDER = '/home/tester/Orkeon/workbooks/demo/attempts/ATT-0001';

  it('names the one command that gets out of it, and that command closes the folder as abandoned', async () => {
    const fileSystem = demoTeam().fileSystem.addDirectory(FOLDER);
    for (const args of [['attempt', 'open', 'demo'], ['attempt', 'approve', 'demo', '--usd', '1'], ['run', 'demo', '--level', 'L0']]) {
      const { code, output } = await run(args, { fileSystem });
      expect(code, args.join(' ')).toBe(EXIT.error);
      expect(output.stderr).toEqual([`error: ${FOLDER} has no manifest.json — an \`attempt open\` that was interrupted, or a folder made by hand: \`orkeon-bench attempt close demo\` closes it`]);
    }
    const closed = await run(['attempt', 'close', 'demo'], { fileSystem });
    expect(closed.code).toBe(EXIT.ok);
    expect(closed.output.stdout).toEqual(['demo: closed ATT-0001 as abandoned: it had no manifest (an interrupted attempt open, or a folder made by hand)']);
    expect((await run(['attempt', 'open', 'demo'], { fileSystem })).output.stdout[0]).toContain('demo: opened ATT-0002');
  });
});

describe('attempt, on two dead ends made by hand', () => {
  const ATTEMPTS = '/home/tester/Orkeon/workbooks/demo/attempts';

  it('exits 2 on a plain file named like an attempt, saying what it is', async () => {
    const fileSystem = demoTeam().fileSystem.addFile(`${ATTEMPTS}/ATT-0009`, 'notes\n');
    for (const args of [['attempt', 'open', 'demo'], ['attempt', 'close', 'demo'], ['attempt', 'approve', 'demo', '--usd', '1'], ['run', 'demo', '--level', 'L0']]) {
      const { code, output } = await run(args, { fileSystem });
      expect(code, args.join(' ')).toBe(EXIT.error);
      expect(output.stderr).toEqual([`error: ${ATTEMPTS}/ATT-0009 is a file, not an attempt folder: only orkeon-bench creates attempts, as folders — move that file away or remove it`]);
    }
  });

  it('closes an attempt whose manifest cannot be read as abandoned, and says where the file was kept', async () => {
    const fileSystem = demoTeam().fileSystem;
    await run(['attempt', 'open', 'demo'], { fileSystem });
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/manifest.json`, '{ not json');
    const stopped = await run(['attempt', 'approve', 'demo', '--usd', '1'], { fileSystem });
    expect(stopped.code).toBe(EXIT.error);
    expect(stopped.output.stderr[0]).toMatch(/^error: the manifest\.json of .*ATT-0001 cannot be read \(.*is not valid JSON.*\): `orkeon-bench attempt close demo` closes it$/);
    const closed = await run(['attempt', 'close', 'demo'], { fileSystem });
    expect(closed.code).toBe(EXIT.ok);
    expect(closed.output.stdout).toEqual([`demo: closed ATT-0001 as abandoned: its manifest could not be read, and is kept as ${ATTEMPTS}/ATT-0001/manifest.broken.json`]);
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/manifest.broken.json`)).toBe('{ not json');
  });
});

describe('llm-stub', () => {
  const SCRIPT = `${WORKSHOP}/reply.json`;
  const files = { [SCRIPT]: JSON.stringify({ replies: [{ match: { role: 'Writer' }, turns: [{ content: 'ok' }] }] }) };
  const request = (role: string) => ({ path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: `You are ${role}.\n` }] } });

  it('serve says where it listens and what to export, then how many requests it answered', async () => {
    const { code, output } = await run(['llm-stub', 'serve', '--scenario', SCRIPT], { files, stubRequests: [[request('Writer')]] });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([
      'listening on http://127.0.0.1:43210/v1',
      'export ORKEON_Llm__BaseUrl=http://127.0.0.1:43210/v1 ORKEON_Llm__Model=stub-model ORKEON_Llm__ApiKey=stub',
      '1 request(s) received',
    ]);
    expect(output.stderr).toEqual([]);
  });

  it('serve exits 1 and lists what the script did not cover', async () => {
    const { code, output } = await run(['llm-stub', 'serve', '--scenario', SCRIPT, '--port', '18801', '--log', `${WORKSHOP}/stub.jsonl`], { files, stubRequests: [[request('Writer'), request('Reader')]] });
    expect(code).toBe(EXIT.failed);
    expect(output.stdout[0]).toBe('listening on http://127.0.0.1:18801/v1');
    expect(output.stdout.at(-1)).toBe('2 request(s) received');
    expect(output.stderr).toEqual(['issue: request 2: no rule of the script matches this request (role "Reader")']);
  });

  it('serve --json prints the endpoint, then the summary', async () => {
    const { code, output, fileSystem } = await run(['llm-stub', 'serve', '--scenario', SCRIPT, '--json', '--log', `${WORKSHOP}/stub.jsonl`], { files, stubRequests: [[request('Reader')]] });
    expect(code).toBe(EXIT.failed);
    expect(output.stdout.map((text) => JSON.parse(text) as unknown)).toEqual([
      { base_url: 'http://127.0.0.1:43210/v1', port: 43210, model: 'stub-model', api_key: 'stub' },
      { requests: 1, issues: ['request 1: no rule of the script matches this request (role "Reader")'] },
    ]);
    expect((await fileSystem.readText(`${WORKSHOP}/stub.jsonl`)).trim().split('\n')).toHaveLength(1);
  });

  it('serve exits 2 on a port that is none, on the port of Ollama and on a missing scenario', async () => {
    expect((await run(['llm-stub', 'serve', '--scenario', SCRIPT, '--port', 'auto'], { files })).output.stderr).toEqual(['error: invalid port "auto" (expected an integer between 1 and 65535)']);
    expect((await run(['llm-stub', 'serve', '--scenario', SCRIPT, '--port', '11434'], { files })).output.stderr).toEqual(['error: the stub cannot listen on port 11434: Orkeon would infer the Ollama provider']);
    const missing = await run(['llm-stub', 'serve', '--scenario', `${WORKSHOP}/none.json`]);
    expect(missing.code).toBe(EXIT.error);
    expect(missing.output.stderr).toEqual([`error: scenario not found: ${WORKSHOP}/none.json`]);
  });

  it.each(['record', 'replay'])('%s belongs to the rest of lot 4 and exits 3', async (mode) => {
    const { code, output } = await run(['llm-stub', mode, 'RUN-20260930-1912-local']);
    expect(code).toBe(EXIT.notImplemented);
    expect(output.stderr).toEqual([`orkeon-bench llm-stub ${mode}: not implemented yet (lot 4)`]);
  });
});

describe('run', () => {
  const TESTS = `${WORKSHOP}/tests/demo`;
  const ATTEMPT = `${WORKSHOP}/workbooks/demo/attempts/ATT-0001`;
  const EVENTS = '{"v":2,"kind":"run.finished","success":true,"exitCode":0,"promptTokens":3,"completionTokens":2}\n';
  const scenario = { id: 'ac-01-report', covers: ['AC-01'], level: 'component', llm_stub: { replies: [{ turns: [{ content: 'ok' }] }] }, checks: [{ id: 'c1', type: 'file-exists', path: '/output/report.md' }] };
  const commands = {
    'orkeon run crew --validate': succeeded('VALIDATION OK: crew\n'),
    'orkeon run crew --events jsonl': succeeded(EVENTS),
  };
  const stubRequests = [[{ path: '/v1/chat/completions', body: { messages: [] } }]];

  /** The demo team with a crew, its launchers, one component scenario and an open attempt. */
  async function ready(): Promise<InMemoryFileSystem> {
    const fileSystem = demoTeam().fileSystem;
    fileSystem.addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n').addFile(`${TEAM}/crew/agents/writer.yaml`, 'role: Writer\n').addFile(`${TESTS}/component/ac-01-report.scenario.json`, JSON.stringify(scenario));
    await run(['scaffold', 'demo'], { fileSystem });
    await run(['attempt', 'open', 'demo'], { fileSystem });
    return fileSystem;
  }
  const writesReport = (line: string, fileSystem: InMemoryFileSystem): void => {
    const output = /(\S+):\/output:rw/.exec(line)?.[1];
    if (line.includes('--events') && output !== undefined) {
      fileSystem.addFile(`${output}/report.md`, '# Report\n');
    }
  };

  it('prints each level it reached, the verdict input, the report and the runs; what did not run goes to stderr', async () => {
    const { code, output } = await run(['run', 'demo', '--level', 'L2'], { fileSystem: await ready(), commands, stubRequests, onRun: writesReport });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toEqual([
      'demo: ATT-0001',
      'L0 static: pass',
      'L1 unit: skipped (not run: L1 is not implemented yet (lot 4))',
      'L2 component: pass',
      'verdict input: all_ac_pass=false all_inv_pass=true indicators_in_range=true',
      `report: ${ATTEMPT}/report.json`,
      'runs: RUN-20260930-1912-stub',
    ]);
    // A green scenario proves no criterion by itself: without ACCEPTANCE.md nothing says at which level AC-01 is proven.
    expect(output.stderr).toEqual([
      expect.stringContaining('warning: static check check-script skipped'),
      `warning: ${WORKSHOP}/workbooks/demo/ACCEPTANCE.md does not exist: no criterion is proven without it — a criterion passes at the level ACCEPTANCE.md declares for it`,
      'warning: AC-01 is not proven: ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at',
    ]);
  });

  it('--json prints the result in snake_case and exits 1 when a level is red', async () => {
    const { code, output } = await run(['run', 'demo', '--level', 'component', '--profile', 'stub', '--json'], { fileSystem: await ready(), commands, stubRequests });
    expect(code).toBe(EXIT.failed);
    expect(output.stderr).toEqual([]);
    expect(JSON.parse(output.text)).toEqual({
      team: 'demo',
      attempt: 'ATT-0001',
      failed: true,
      levels: [
        { level: 'static', status: 'pass', note: '' },
        { level: 'unit', status: 'skipped', note: 'not run: L1 is not implemented yet (lot 4)' },
        { level: 'component', status: 'fail', note: '' },
      ],
      runs: ['RUN-20260930-1912-stub'],
      report_file: `${ATTEMPT}/report.json`,
      report_markdown_file: `${ATTEMPT}/REPORT.md`,
      verdict_input: { all_ac_pass: false, all_inv_pass: true, indicators_in_range: true },
      warnings: [expect.stringContaining('static check check-script skipped'), expect.stringContaining('ACCEPTANCE.md does not exist: no criterion is proven without it'), 'AC-01: ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at'],
    });
  });

  it('--level L0 runs the static level alone, and --continue goes past a red one', async () => {
    const fileSystem = await ready();
    const first = await run(['run', 'demo', '--level', 'L0'], { fileSystem, commands });
    expect(first.output.stdout.slice(0, 3)).toEqual(['demo: ATT-0001', 'L0 static: pass', 'verdict input: all_ac_pass=false all_inv_pass=true indicators_in_range=true']);
    await fileSystem.remove(`${TEAM}/run.sh`);
    const stopped = await run(['run', 'demo', '--level', 'L2'], { fileSystem, commands, stubRequests });
    expect(stopped.code).toBe(EXIT.failed);
    expect(stopped.output.stdout).toContain('L2 component: skipped (not run: L0 is red)');
    const continued = await run(['run', 'demo', '--level', 'L2', '--continue'], { fileSystem, commands, stubRequests, onRun: writesReport });
    expect(continued.code).toBe(EXIT.failed);
    expect(continued.output.stdout).toContain('L2 component: pass');
  });

  it('accepts on stdout only what ACCEPTANCE.md declares and a check proves', async () => {
    const fileSystem = await ready();
    fileSystem.addFile(`${WORKSHOP}/workbooks/demo/ACCEPTANCE.md`, ['| Id | Given | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | nominal | runs | report | L2 | active |'].join('\n'));
    const { code, output } = await run(['run', 'demo', '--level', 'L2'], { fileSystem, commands, stubRequests, onRun: writesReport });
    expect(code).toBe(EXIT.ok);
    expect(output.stdout).toContain('verdict input: all_ac_pass=true all_inv_pass=true indicators_in_range=true');
    expect(output.stderr).toHaveLength(1);
  });

  it('exits 2 on --level or --profile given twice: the gate and the bench would each keep another', async () => {
    const twice = await run(['run', 'demo', '--level', 'L2', '--level', 'L4']);
    expect(twice.code).toBe(EXIT.error);
    expect(twice.output.stderr).toEqual(['error: --level is given 2 times (L2, L4): pass it once']);
    const profiles = await run(['run', 'demo', '--level', 'L2', '--profile', 'stub', '--profile=claude']);
    expect(profiles.code).toBe(EXIT.error);
    expect(profiles.output.stderr).toEqual(['error: --profile is given 2 times (stub, claude): pass it once']);
  });

  it('exits 130 when it is asked to stop, after saying what it left', async () => {
    const shutdown = new FakeShutdownSignal(false);
    const stopped = { found: true, exitCode: null, stdout: '', stderr: '', stopped: 'cancelled' as const };
    const { code, output, fileSystem } = await run(['run', 'demo', '--level', 'L2'], {
      fileSystem: await ready(),
      commands: { ...commands, 'orkeon run crew --events jsonl': stopped },
      stubRequests,
      shutdown,
      onRun: (line) => {
        if (line.includes('--events')) {
          shutdown.request();
        }
      },
    });
    expect(code).toBe(EXIT.interrupted);
    expect(code).toBe(130);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `error: interrupted while scenario ac-01-report was running: orkeon run and what it started were stopped, the sandbox removed; ${WORKSHOP}/workbooks/demo/runs/RUN-20260930-1912-stub keeps what the run left`,
    ]);
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
  });

  it.each([
    [['run', 'demo', '--level', 'L1'], 'level L1: unit tests are not run by this version — pass --level L0, or --level L2 (L1 is then reported skipped)'],
    [['run', 'demo', '--level', 'L3'], 'level L3: this version runs L0 to L2 — pass --level L2'],
    [['run', 'demo', '--level', 'e2e_remote'], 'level L4: this version runs L0 to L2 — pass --level L2'],
    [['run', 'demo'], 'without --level a run reaches L4: this version runs L0 to L2 — pass --level L2'],
    [['run', 'demo', '--level', 'L2', '--profile', 'machine'], 'profile "machine": this version runs with the simulated LLM only (--profile stub, the default up to L2)'],
  ])('%j exits 3: the rest of the command belongs to a later lot', async (args, reason) => {
    const { code, output } = await run(args);
    expect(code).toBe(EXIT.notImplemented);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([`orkeon-bench run: not implemented yet (lot 4): ${reason}`]);
  });

  it('exits 2 on a level that is none, an unknown team and a team without an open attempt', async () => {
    expect((await run(['run', 'demo', '--level', 'B1'])).output.stderr).toEqual(['error: unknown level "B1" (expected L0…L4, or static, unit, component, e2e_local, e2e_remote)']);
    expect((await run(['run', 'ghost', '--level', 'L2'])).code).toBe(EXIT.error);
    const { code, output } = await run(['run', 'demo', '--level', 'L2'], { fileSystem: demoTeam().fileSystem });
    expect(code).toBe(EXIT.error);
    expect(output.stderr).toEqual(['error: no open attempt for demo: open one with `orkeon-bench attempt open demo`']);
  });
});
