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
import { FakeProcessRunner, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { demoTeam, fixture } from '../fakes/fixture-team.js';
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
}

/** Everything `doctor` needs to find nothing wrong except Ollama and the optional workshop folders. */
const TOOLS_PRESENT: Setup = { commands: { esbuild: succeeded('0.25.0'), python3: succeeded('') }, files: { [TYPINGS]: '' } };

async function run(args: string[], setup: Setup = {}): Promise<{ code: number; output: RecordingOutput }> {
  const { fileSystem } = demoTeam();
  fileSystem.addFile(REPORT, fixture('reports/accepted-report.json'));
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
    processRunner: new FakeProcessRunner({
      'orkeon --version': succeeded('orkeon 1.0.0-rc.4.src.20261003.ga2bb6c3'),
      'orkeon run --list-tools': succeeded('file_read\nfile_write\n'),
      ...setup.commands,
    }),
    httpProbe: new FakeHttpProbe(Object.fromEntries((setup.reachable ?? []).map((url) => [url, { reachable: true, status: 200 }]))),
    clock: new FixedClock(new Date('2026-09-30T19:12:00Z')),
    environment: new FakeEnvironment(setup.variables ?? {}, '/home/tester'),
    llmRecorder: new FakeLlmRecorder(setup.recorded ?? []),
  };
  const output = new RecordingOutput();
  const session = new Session(output);
  await createProgram(createServices(adapters), session).parseAsync(args, { from: 'user' });
  return { code: session.exitCode, output };
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
    expect(output.stdout[0]).toContain('references established on Orkeon 1.0.0-rc.4.src.20261003.ga2bb6c3');
    expect(output.text).toContain('PASS  orkeon CLI on PATH');
    expect(output.text).toContain('FAIL  esbuild on PATH');
    expect(output.stdout.at(-1)).toMatch(/^Result: FAILED/);
  });

  it('--json lists every check with its id', async () => {
    const json = JSON.parse((await run(['doctor', '--json'])).output.text) as Record<string, unknown> & { checks: Record<string, string>[] };
    expect(Object.keys(json)).toEqual(['bench_version', 'reference_orkeon_version', 'checked_at', 'ok', 'checks']);
    expect(json).toMatchObject({ reference_orkeon_version: '1.0.0-rc.4.src.20261003.ga2bb6c3', checked_at: '2026-09-30T19:12:00.000Z', ok: false });
    expect(json.bench_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(json.checks.map((check) => check.id)).toEqual(['orkeon', 'tool-catalogue', 'esbuild', 'pyyaml', 'ollama', 'llm-concurrency', 'typings', 'workshop', 'stray-settings']);
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
      };
      await expect(createProgram(createServices(adapters), new Session(output)).parseAsync(args, { from: 'user' })).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
      return output.stdout.join('\n').replaceAll(/\s+/g, ' ');
    };
    expect(await help(['--help'])).toContain('Bench CLI of the Orkeon harness: checks the machine, reads and scaffolds Orkeon agent teams; runs and evaluates them from lot 4.');
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
    [['llm-stub', 'serve', '--scenario', 'x.json'], 4],
    [['run', 'demo', '--level', 'L2'], 4],
    [['evaluate', 'RUN-20260930-1912-local'], 4],
    [['capture', 'demo'], 4],
    [['attempt', 'open', 'demo'], 4],
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
