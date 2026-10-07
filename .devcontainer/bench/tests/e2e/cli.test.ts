import { execFile, spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES_DIR, FIXTURE_WORKSHOP_DIR } from '../fakes/fixture-team.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(ROOT, 'bin', 'orkeon-bench');
const CHECK_IDS = ['orkeon', 'tool-catalogue', 'esbuild', 'pyyaml', 'ollama', 'llm-concurrency', 'typings', 'workshop', 'stray-settings', 'leftover-sandboxes'];
/** The image has git; a machine without it skips the one test that asks git what it keeps. */
const HAS_GIT = spawnSync('git', ['--version']).status === 0;

/** Stand-ins for the tools `doctor` runs, so the test never depends on what the machine has. */
const FAKE_TOOLS: Record<string, string> = {
  orkeon: [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "orkeon 1.0.0-rc.4.src.20261006.g77ac8a9"; exit 0; fi',
    'if [ "$1 $2" = "run --list-tools" ]; then printf "email_parser\\nfile_read\\nfile_write\\n"; exit 0; fi',
    'exit 64',
    '',
  ].join('\n'),
  esbuild: '#!/bin/sh\necho "0.25.0"\n',
  python3: '#!/bin/sh\nexit 0\n',
};

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string; detail: string }[];
}

let workshop: string;
let teamFolder: string;
let fakeTools: string;
let noTools: string;

/**
 * The environment of a CLI run: the temp workshop, an empty config home and no LLM variable, so
 * neither the machine's Orkeon settings nor an exported profile can change a result.
 */
function hermeticEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ORKEON_WORKSHOP: workshop, XDG_CONFIG_HOME: join(workshop, 'no-config') };
  for (const name of Object.keys(env)) {
    if (name.startsWith('ORKEON_Llm__') || name === 'ANTHROPIC_API_KEY' || name === 'HARNESS_LOCAL_LLM_HOSTS') {
      delete env[name];
    }
  }
  return Object.assign(env, extraEnv);
}

/** Runs the built CLI through its launcher: no TTY, no network, nothing written to the home. */
function bench(args: string[], extraEnv: Record<string, string> = {}, launcher: string = BIN): Promise<Run> {
  return new Promise((resolve) => {
    const env = hermeticEnv(extraEnv);
    execFile(process.execPath, [launcher, ...args], { env, cwd: tmpdir() }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

/** Runs git in `cwd`, away from the machine's and the user's git configuration and variables. */
function git(cwd: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: workshop, XDG_CONFIG_HOME: join(workshop, 'no-config') });
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'init.defaultBranch=main', ...args], { cwd, env }, (error, stdout) => (error === null ? resolve(stdout) : reject(error)));
  });
}

function statusOf(report: DoctorJson, id: string): string | undefined {
  return report.checks.find((check) => check.id === id)?.status;
}

beforeAll(async () => {
  workshop = await mkdtemp(join(tmpdir(), 'orkeon-bench-e2e-'));
  teamFolder = join(workshop, 'teams', 'demo');
  await cp(FIXTURE_WORKSHOP_DIR, workshop, { recursive: true });
  fakeTools = join(workshop, 'fake-tools');
  noTools = join(workshop, 'no-tools');
  await mkdir(fakeTools);
  await mkdir(noTools);
  for (const [name, script] of Object.entries(FAKE_TOOLS)) {
    await writeFile(join(fakeTools, name), script, { mode: 0o755 });
  }
});

afterAll(async () => {
  await rm(workshop, { recursive: true, force: true });
});

describe('launcher', () => {
  it('prints the version', async () => {
    const run = await bench(['--version']);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('finds dist/ when launched through a symlink, as /usr/local/bin/orkeon-bench is', async () => {
    const link = join(workshop, 'orkeon-bench-link');
    await symlink(BIN, link);
    const run = await bench(['--version'], {}, link);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exits 2 on an unknown command and when no command is given', async () => {
    const unknown = await bench(['frobnicate']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('unknown command');
    const none = await bench([]);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain('Usage: orkeon-bench');
  });

  it('stops quietly when the reader closes the pipe early (orkeon-bench doctor | head -1)', async () => {
    const run = await new Promise<Run>((resolve) => {
      const child = spawn(process.execPath, [BIN, 'doctor'], { env: hermeticEnv({ PATH: noTools }), cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.destroy();
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => resolve({ code: code ?? -1, stdout: '', stderr }));
    });
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
  });

  it('--help lists the implemented commands and the stubs', async () => {
    const run = await bench(['--help']);
    expect(run.code).toBe(0);
    for (const command of ['doctor', 'status', 'mounts', 'report', 'profile', 'scaffold', 'datasets', 'llm-stub', 'run', 'evaluate', 'capture', 'attempt', 'team', 'estimate', 'release', 'check']) {
      expect(run.stdout).toMatch(new RegExp(`^  ${command}\\b`, 'm'));
    }
  });
});

describe('mounts', () => {
  it('prints the orkeon run mount arguments of the default environment', async () => {
    const run = await bench(['mounts', 'demo']);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(`--mount ${teamFolder}/input:/workspace:ro ${teamFolder}/output:/output:rw ${teamFolder}/state:/state:rw\n`);
  });

  it('--env <set> binds the folders of the set mounts.<set>/<team>/ and adds --allow-external-mounts', async () => {
    const set = join(workshop, 'mounts.test', 'demo');
    await mkdir(set, { recursive: true });
    const run = await bench(['mounts', 'demo', '--env', 'test']);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(`--mount ${set}/workspace:/workspace:ro ${set}/output:/output:rw ${set}/state:/state:rw --allow-external-mounts\n`);
  });

  it('accepts a team folder path and --json', async () => {
    const run = await bench(['mounts', teamFolder, '--json']);
    expect(run.code).toBe(0);
    const parsed = JSON.parse(run.stdout) as { team: string; environment: string; allow_external: boolean; bindings: { root: string }[]; studio_mounts: string[] };
    expect(parsed.team).toBe('demo');
    expect(parsed.environment).toBe('default');
    expect(parsed.allow_external).toBe(false);
    expect(parsed.bindings.map((binding) => binding.root)).toEqual(['/workspace', '/output', '/state']);
    expect(parsed.studio_mounts).toEqual(['./input:/workspace:ro', './output:/output:rw', './state:/state:rw']);
  });

  it('exits 2 on an unknown environment or team', async () => {
    const unknownEnvironment = await bench(['mounts', 'demo', '--env', 'staging']);
    expect(unknownEnvironment.code).toBe(2);
    expect(unknownEnvironment.stdout).toBe('');
    expect(unknownEnvironment.stderr).toContain(`unknown environment "staging": ${join(workshop, 'mounts.staging', 'demo')} does not exist (known: default, test)`);
    expect((await bench(['mounts', 'ghost'])).code).toBe(2);
  });

  it('does not take an inherited object member for an environment or a profile', async () => {
    const environment = await bench(['mounts', 'demo', '--env', 'constructor']);
    expect(environment.code).toBe(2);
    expect(environment.stdout).toBe('');
    expect(environment.stderr).toContain('unknown environment "constructor"');
    const profile = await bench(['profile', 'demo', 'toString']);
    expect(profile.code).toBe(2);
    expect(profile.stderr).toContain('unknown profile "toString"');
  });
});

describe('status, profile, report', () => {
  it('status <team> reads workbooks/<team>/STATUS.md', async () => {
    const run = await bench(['status', 'demo']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('phase: design');
    expect(run.stdout).toContain('gate_passed: design\ntrack: full\niteration: 0\n');
    expect(run.stdout).toContain('next_action: /team-tests');
  });

  it('status and profile work before the team folder exists, from the workbook and the tests (D35)', async () => {
    await mkdir(join(workshop, 'workbooks', 'fresh'), { recursive: true });
    await mkdir(join(workshop, 'tests', 'fresh'), { recursive: true });
    await writeFile(join(workshop, 'workbooks', 'fresh', 'STATUS.md'), '---\nphase: need\ntrack: light\niteration: 0\nnext_action: /team-need\nupdated_at: 2026-10-03T09:00:00Z\n---\n');
    const [status, profile] = await Promise.all([bench(['status', 'fresh', '--json']), bench(['profile', 'fresh', 'stub', '--json'])]);
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ team: 'fresh', folder: join(workshop, 'teams', 'fresh'), phase: 'need', track: 'light', iteration: 0 });
    expect(profile.code).toBe(0);
    expect(JSON.parse(profile.stdout)).toMatchObject({ team: 'fresh', profile: { name: 'stub' }, remote: false });
  });

  it('profile <team> <name> prints variable names only', async () => {
    const run = await bench(['profile', 'demo', 'claude'], { ANTHROPIC_API_KEY: 'sk-e2e-secret' });
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('ORKEON_Llm__BaseUrl');
    expect(run.stdout).toContain('ORKEON_Llm__ApiKey (secret, from ANTHROPIC_API_KEY)');
    expect(run.stdout + run.stderr).not.toContain('sk-e2e-secret');
    const json = await bench(['profile', 'demo', 'claude', '--json'], { ANTHROPIC_API_KEY: 'sk-e2e-secret' });
    expect(json.stdout).toContain('"ORKEON_Llm__ApiKey": "[redacted]"');
    expect(json.stdout + json.stderr).not.toContain('sk-e2e-secret');
  });

  it('profile --json says whether the profile is remote, and by which host', async () => {
    const target = async (name: string, env: Record<string, string> = {}) => {
      const run = await bench(['profile', 'demo', name, '--json'], env);
      const json = JSON.parse(run.stdout) as { remote: boolean; base_url_host: string | null };
      return { remote: json.remote, base_url_host: json.base_url_host };
    };
    const configHome = join(workshop, 'xdg-ollama');
    await mkdir(join(configHome, 'Orkeon'), { recursive: true });
    await writeFile(join(configHome, 'Orkeon', 'appsettings.json'), JSON.stringify({ Llm: { Model: 'qwen3:8b', BaseUrl: 'http://localhost:11434', TimeoutSeconds: 600 } }));
    const lan = { XDG_CONFIG_HOME: configHome, ORKEON_Llm__BaseUrl: 'http://gpu-box.lan:8000/v1' };
    // The runs are independent: started together, they cost one start of Node on a loaded machine, not eight.
    const targets = await Promise.all([
      target('claude'),
      target('stub'),
      target('machine'),
      target('machine', { XDG_CONFIG_HOME: configHome }),
      target('machine', { XDG_CONFIG_HOME: configHome, ORKEON_Llm__BaseUrl: 'https://api.openai.com/v1' }),
      // A model served by the host machine is local; a LAN server is local once it is listed.
      target('machine', { XDG_CONFIG_HOME: configHome, ORKEON_Llm__BaseUrl: 'http://host.docker.internal:11434' }),
      target('machine', lan),
      target('machine', { ...lan, HARNESS_LOCAL_LLM_HOSTS: 'nas.lan, GPU-Box.lan' }),
    ]);
    expect(targets).toEqual([
      { remote: true, base_url_host: 'api.anthropic.com' },
      { remote: false, base_url_host: '127.0.0.1' },
      { remote: false, base_url_host: null },
      { remote: false, base_url_host: 'localhost' },
      { remote: true, base_url_host: 'api.openai.com' },
      { remote: false, base_url_host: 'host.docker.internal' },
      { remote: true, base_url_host: 'gpu-box.lan' },
      { remote: false, base_url_host: 'gpu-box.lan' },
    ]);
  });

  it('report validate exits 0 on the accepted fixture and 1 on a broken report', async () => {
    const valid = await bench(['report', 'validate', join(FIXTURES_DIR, 'reports', 'accepted-report.json')]);
    expect(valid.code).toBe(0);
    expect(valid.stdout).toContain('ACCEPTED');
    const broken = join(workshop, 'broken-report.json');
    await writeFile(broken, '{"schema_version":"1.0"}');
    const invalid = await bench(['report', 'validate', broken]);
    expect(invalid.code).toBe(1);
    expect(invalid.stdout).toContain(`invalid: ${broken}`);
  });
});

describe('expected failures', () => {
  it('print one error line and exit 2, without a stack trace', async () => {
    await mkdir(join(workshop, 'teams', 'odd'), { recursive: true });
    const status = join(workshop, 'workbooks', 'odd', 'STATUS.md');
    await mkdir(status, { recursive: true });
    const unreadable = await bench(['status', 'odd']);
    expect(unreadable.code).toBe(2);
    expect(unreadable.stderr).toBe(`error: cannot read ${status}: EISDIR\n`);

    const configHome = join(workshop, 'xdg');
    await mkdir(join(configHome, 'Orkeon'), { recursive: true });
    await writeFile(join(configHome, 'Orkeon', 'appsettings.json'), '{ not json');
    const corrupt = await bench(['profile', 'demo', 'machine'], { XDG_CONFIG_HOME: configHome });
    expect(corrupt.code).toBe(2);
    expect(corrupt.stderr).toMatch(/^error: .*appsettings\.json is not valid JSON: .*\n$/);
    expect(corrupt.stderr).not.toContain('    at ');
  });

  it('describe a reserved mount root and a malformed status', async () => {
    const reserved = join(workshop, 'teams', 'reserved');
    await mkdir(reserved, { recursive: true });
    await mkdir(join(workshop, 'workbooks', 'reserved'), { recursive: true });
    await writeFile(join(reserved, 'mounts.json'), JSON.stringify({ mounts: [{ root: '/crew', access: 'ro', role: 'reference', default: './crew' }] }));
    await writeFile(join(workshop, 'workbooks', 'reserved', 'STATUS.md'), '---\nphase: build\ngate_passed: yes\n---\n');
    const mounts = await bench(['mounts', 'reserved']);
    expect(mounts.code).toBe(2);
    expect(mounts.stderr).toContain('mounts.0.root: reserved for the runner (/crew, /script, /llm-logs, /sandbox, /credentials)');
    const status = await bench(['status', 'reserved']);
    expect(status.code).toBe(2);
    expect(status.stderr).toContain('gate_passed: expected the phase whose gate was passed');
  });
});

describe('scaffold and the launchers it writes', () => {
  let team: string;
  let fakeOrkeon: string;

  /** Runs the generated run.sh with a stand-in orkeon that prints its arguments, one per line. */
  function launch(args: string[], env: Record<string, string> = {}): Promise<Run> {
    return new Promise((resolve) => {
      const environment = { ...process.env, PATH: `${fakeOrkeon}:${process.env.PATH ?? ''}`, ...env };
      execFile('sh', [join(team, 'run.sh'), ...args], { env: environment, cwd: tmpdir() }, (error, stdout, stderr) => {
        resolve({ code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1, stdout, stderr });
      });
    });
  }

  beforeAll(async () => {
    team = join(workshop, 'teams', 'notes-digest');
    await mkdir(join(team, 'crew', 'agents'), { recursive: true });
    await writeFile(join(team, 'crew', 'config.yaml'), 'name: notes-digest\n');
    await writeFile(join(team, 'crew', 'agents', 'reader.yaml'), 'role: Reader\n');
    await writeFile(
      join(team, 'mounts.json'),
      JSON.stringify({
        mounts: [
          { root: '/notes', access: 'ro', role: 'inputs', default: './notes' },
          { root: '/reports', access: 'rw', role: 'deliverables', default: './reports' },
        ],
      }),
    );
    await writeFile(join(team, 'studio-team.json'), JSON.stringify({ name: 'Notes digest', description: 'Digest of notes' }));
    fakeOrkeon = join(workshop, 'fake-orkeon');
    await mkdir(fakeOrkeon);
    await writeFile(join(fakeOrkeon, 'orkeon'), '#!/bin/sh\nfor a in "$@"; do printf \'%s\\n\' "$a"; done\n', { mode: 0o755 });
  });

  it("writes run.sh (executable), run.cmd (CRLF), the card's mounts and the team's folders", async () => {
    const run = await bench(['scaffold', 'notes-digest', '--json']);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ kind: 'yaml', target: 'crew', created: ['notes', 'reports'] });
    expect((await stat(join(team, 'run.sh'))).mode & 0o111).not.toBe(0);
    const cmd = await readFile(join(team, 'run.cmd'), 'utf8');
    expect(cmd.split('\n').slice(0, -1).every((line) => line.endsWith('\r'))).toBe(true);
    expect(JSON.parse(await readFile(join(team, 'studio-team.json'), 'utf8'))).toEqual({
      name: 'Notes digest',
      description: 'Digest of notes',
      mounts: ['./notes:/notes:ro', './reports:/reports:rw'],
    });
    expect((await stat(join(team, 'notes'))).isDirectory()).toBe(true);
    expect((await stat(join(team, 'notes', '.gitkeep'))).isFile()).toBe(true);
    expect(await readFile(join(team, '.gitignore'), 'utf8')).toContain('/notes/*\n!/notes/.gitkeep\n/reports/*\n!/reports/.gitkeep\n');
  });

  it.skipIf(!HAS_GIT)('its .gitignore keeps the folder of every mount point and none of their content, nested folders included (asked of git)', async () => {
    const nested = join(workshop, 'teams', 'nested');
    await mkdir(join(nested, 'crew', 'agents'), { recursive: true });
    await writeFile(join(nested, 'crew', 'config.yaml'), 'name: nested\n');
    await writeFile(join(nested, 'crew', 'agents', 'keeper.yaml'), 'role: Keeper\n');
    const mounts = [
      { root: '/state', access: 'rw', role: 'state', default: './data/state' },
      { root: '/data', access: 'rw', role: 'deliverables', default: './data' },
      { root: '/logs', access: 'rw', role: 'state', default: './data/a/logs' },
      { root: '/cache', access: 'rw', role: 'state', default: './data/a/cache' },
    ];
    await writeFile(join(nested, 'mounts.json'), JSON.stringify({ mounts }));
    const run = await bench(['scaffold', 'nested', '--json']);
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ created: ['data/state', 'data', 'data/a/logs', 'data/a/cache'] });
    for (const file of ['data/found.txt', 'data/state/resume.json', 'data/a/other.txt', 'data/a/logs/run.log', 'data/a/cache/c.bin']) {
      await writeFile(join(nested, file), 'data\n');
    }
    await git(nested, ['init', '-q', '.']);
    const status = (await git(nested, ['status', '--porcelain', '--ignored', '--untracked-files=all'])).split('\n').filter((line) => line.length > 0);
    expect(status.sort()).toEqual([
      '!! data/a/cache/c.bin',
      '!! data/a/logs/run.log',
      '!! data/a/other.txt',
      '!! data/found.txt',
      '!! data/state/resume.json',
      '?? .gitignore',
      '?? crew/agents/keeper.yaml',
      '?? crew/config.yaml',
      '?? data/.gitkeep',
      '?? data/a/cache/.gitkeep',
      '?? data/a/logs/.gitkeep',
      '?? data/state/.gitkeep',
      '?? mounts.json',
      '?? run.cmd',
      '?? run.sh',
      '?? studio-team.json',
    ]);
  });

  it("run.sh binds the team's own folders and passes the arguments before the mounts", async () => {
    const run = await launch(['--validate']);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout.split('\n').slice(0, -1)).toEqual(['run', `${team}/crew`, '--validate', '--mount', `"${team}/notes":/notes:ro`, `"${team}/reports":/reports:rw`]);
  });

  it('run.sh with TEAM_ENV binds the folders of the set, creates the writable ones and allows external mounts', async () => {
    const set = join(workshop, 'mounts.test', 'notes-digest');
    await mkdir(join(set, 'notes'), { recursive: true });
    const run = await launch([], { TEAM_ENV: 'test' });
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout.split('\n').slice(0, -1)).toEqual(['run', `${team}/crew`, '--mount', `"${set}/notes":/notes:ro`, `"${set}/reports":/reports:rw`, '--allow-external-mounts']);
    expect((await stat(join(set, 'reports'))).isDirectory()).toBe(true);
  });

  it("run.sh passes settings/<slug>/appsettings.json of the workshop when it exists, unless the command names a settings file", async () => {
    const settings = join(workshop, 'settings', 'notes-digest', 'appsettings.json');
    const without = await launch(['--validate']);
    expect(without.stdout).not.toContain('--settings');
    await mkdir(join(workshop, 'settings', 'notes-digest'), { recursive: true });
    await writeFile(settings, JSON.stringify({ Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b' } }));
    try {
      const run = await launch(['--validate']);
      expect(run.code).toBe(0);
      expect(run.stdout.split('\n').slice(0, 5)).toEqual(['run', `${team}/crew`, '--settings', settings, '--validate']);
      const own = await launch(['--settings', '/elsewhere/appsettings.json']);
      expect(own.stdout.split('\n').filter((line) => line === '--settings')).toHaveLength(1);
      expect(own.stdout).toContain('/elsewhere/appsettings.json');
      expect(own.stdout).not.toContain(settings);
    } finally {
      await rm(join(workshop, 'settings'), { recursive: true, force: true });
    }
  });

  it('run.sh refuses a set that does not exist, a read-only folder missing from a set, and a malformed name', async () => {
    const missingSet = await launch([], { TEAM_ENV: 'nope' });
    expect(missingSet.code).toBe(2);
    expect(missingSet.stderr).toBe(`run.sh: no mount set 'nope' for this team: ${join(workshop, 'mounts.nope', 'notes-digest')} does not exist\n`);
    await mkdir(join(workshop, 'mounts.empty', 'notes-digest'), { recursive: true });
    const missingFolder = await launch([], { TEAM_ENV: 'empty' });
    expect(missingFolder.code).toBe(2);
    expect(missingFolder.stderr).toBe(`run.sh: ${join(workshop, 'mounts.empty', 'notes-digest', 'notes')} does not exist (mount point /notes)\n`);
    const malformed = await launch([], { TEAM_ENV: '../x' });
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).toContain('TEAM_ENV names a mount set in kebab-case');
    expect(missingSet.stdout + missingFolder.stdout + malformed.stdout).toBe('');
  });
});

describe('doctor', () => {
  it('passes the tool checks against stand-in executables on PATH', async () => {
    const run = await bench(['doctor', '--json'], { PATH: fakeTools });
    const report = JSON.parse(run.stdout) as DoctorJson;
    expect(report.checks.map((check) => check.id)).toEqual(CHECK_IDS);
    expect(report.checks.slice(0, 4).map((check) => [check.id, check.status, check.detail])).toEqual([
      ['orkeon', 'pass', 'orkeon 1.0.0-rc.4.src.20261006.g77ac8a9'],
      ['tool-catalogue', 'pass', '3 tools'],
      ['esbuild', 'pass', '0.25.0'],
      ['pyyaml', 'pass', 'python3 ok'],
    ]);
    expect(['pass', 'warn']).toContain(statusOf(report, 'ollama'));
    expect(statusOf(report, 'workshop')).toBe('warn');
    expect(report.ok).toBe(report.checks.every((check) => check.status !== 'fail'));
    expect(run.code).toBe(report.ok ? 0 : 1);
  });

  it('--quiet prints the failing checks only, on stderr, and nothing when none fails', async () => {
    const report = JSON.parse((await bench(['doctor', '--json'], { PATH: fakeTools })).stdout) as DoctorJson;
    const failing = report.checks.filter((check) => check.status === 'fail');
    const quiet = await bench(['doctor', '--quiet'], { PATH: fakeTools });
    expect(quiet.stdout).toBe('');
    expect(quiet.stderr).toBe(failing.map((check) => `FAIL ${check.id}: ${check.detail}\n`).join(''));
    expect(quiet.code).toBe(failing.length === 0 ? 0 : 1);
    // The workshop of this test lacks library/, references/ and .claude/: a warning, so no line.
    expect(statusOf(report, 'workshop')).toBe('warn');
    expect(quiet.stderr).not.toContain('workshop');
  });

  it('--quiet exits 1 with one line per missing tool', async () => {
    const quiet = await bench(['doctor', '--quiet'], { PATH: noTools });
    expect(quiet.code).toBe(1);
    expect(quiet.stdout).toBe('');
    expect(quiet.stderr.trimEnd().split('\n').slice(0, 4)).toEqual([
      'FAIL orkeon: orkeon not found on PATH',
      'FAIL tool-catalogue: orkeon not found on PATH',
      'FAIL esbuild: esbuild not found on PATH',
      'FAIL pyyaml: python3 not found on PATH',
    ]);
    expect(quiet.stderr).not.toMatch(/ollama|workshop/);
  });

  it('exits 1 and names what is missing when the tools are not on PATH', async () => {
    const run = await bench(['doctor'], { PATH: noTools });
    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/^FAIL {2}orkeon CLI on PATH {2,}orkeon not found on PATH$/m);
    expect(run.stdout).toMatch(/^FAIL {2}esbuild on PATH/m);
    expect(run.stdout).toMatch(/^Result: FAILED \(\d failing\)$/m);
  });
});

describe('commands of later lots', () => {
  it('exit 3 with a message on stderr', async () => {
    expect((await bench(['team', 'rename', 'demo', 'demo-2'])).stderr).toBe('orkeon-bench team: not implemented yet (lot 4)\n');
    const run = await bench(['run', 'demo', '--level', 'L3']);
    expect(run.code).toBe(3);
    expect(run.stdout).toBe('');
    expect(run.stderr.trim()).toBe('orkeon-bench run: not implemented yet (lot 4): level L3: this version runs L0 to L2 — pass --level L2');
    expect((await bench(['llm-stub', 'replay', 'RUN-20260930-1912-local'])).stderr).toBe('orkeon-bench llm-stub replay: not implemented yet (lot 4)\n');
    expect((await bench(['check', 'design', 'demo'])).code).toBe(3);
  });
});

describe('tools dump', () => {
  /**
   * A stand-in orkeon: `run --list-tools` lists two tools; `run crew` reads the agent of the crew in
   * its working directory and posts one request with those tools to ORKEON_Llm__BaseUrl.
   */
  const STAND_IN = `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const args = process.argv.slice(2).join(' ');
if (args === 'run --list-tools') { process.stdout.write('file_read\\nweb_search\\n'); process.exit(0); }
if (args !== 'run crew') { process.exit(9); }
const names = readFileSync('crew/agents/recorder.yaml', 'utf8').split('\\n').filter((l) => l.startsWith('  - ')).map((l) => l.slice(4));
const tools = names.filter((n) => n !== 'web_search').map((name) => ({ type: 'function', function: { name, description: 'Stand-in ' + name, parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }));
fetch(process.env.ORKEON_Llm__BaseUrl + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.ORKEON_Llm__Model, tools }) })
  .then((r) => r.json()).then((j) => { process.stdout.write(j.choices[0].message.content + '\\n'); });
`;
  let fake: string;

  beforeAll(async () => {
    fake = join(workshop, 'fake-orkeon-dump');
    await mkdir(fake);
    await writeFile(join(fake, 'orkeon'), STAND_IN, { mode: 0o755 });
  });

  it('records the schemas the run sends through the real recorder, and names a tool that never reached the model', async () => {
    const run = await bench(['tools', 'dump', '--json'], { PATH: `${fake}:${process.env.PATH ?? ''}` });
    expect(run.stderr).toBe('');
    expect(run.code).toBe(1);
    expect(JSON.parse(run.stdout)).toEqual({
      tools: [{ type: 'function', function: { name: 'file_read', description: 'Stand-in file_read', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }],
      missing: ['web_search'],
    });
  });
});

describe('attempt, run and the simulated LLM', () => {
  /**
   * A stand-in orkeon that behaves like a one-agent crew: `run crew --validate` answers
   * VALIDATION OK; `run crew --events jsonl` asks the model at ORKEON_Llm__BaseUrl once, as the
   * agent "Writer", writes the answer to report.md under the folder bound to /output, and prints
   * the events of a successful run.
   */
  const STAND_IN = `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write('orkeon 1.0.0-rc.4.src.20261006.g77ac8a9\\n'); process.exit(0); }
if (args[0] !== 'run' || args[1] !== 'crew') { process.exit(9); }
if (args.includes('--validate')) { process.stdout.write('VALIDATION OK: crew (agents=1, tasks=1, tools resolved=0)\\n'); process.exit(0); }
if (process.env.STAND_IN_HANGS) {
  // A run that never ends, with a child of its own, as a launcher has: its pid is left for the test to look for.
  const child = require('node:child_process').spawn('sleep', ['300'], { stdio: 'ignore' });
  writeFileSync(process.env.STAND_IN_HANGS, String(child.pid));
  process.stdout.write(JSON.stringify({ v: 2, seq: 1, kind: 'run.started', target: 'crew' }) + '\\n');
  setInterval(() => {}, 1000);
  return;
}
const output = args.map((arg) => /^(.+):\\/output:rw$/.exec(arg)).find((match) => match !== null)[1];
// As Orkeon does, the model is the one the settings file names — here the profile "fast-remote", whose
// variable a /bin/sh wrapper would have dropped: no variable is read.
const settings = JSON.parse(require('node:fs').readFileSync(args[args.indexOf('--settings') + 1], 'utf8'));
const provider = settings.Llm.Profiles['fast-remote'];
const messages = [{ role: 'system', content: 'You are Writer.\\nYour goal is: write' }, { role: 'user', content: 'Task:\\nWrite the report' }];
fetch(provider.BaseUrl + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.ApiKey }, body: JSON.stringify({ model: provider.Model, messages }) })
  .then((response) => response.json())
  .then((answer) => {
    writeFileSync(output + '/report.md', answer.choices[0].message.content);
    const usage = answer.usage;
    process.stdout.write(JSON.stringify({ v: 2, seq: 1, kind: 'run.started', target: 'crew' }) + '\\n');
    process.stdout.write(JSON.stringify({ v: 2, seq: 2, kind: 'run.finished', success: true, exitCode: 0, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, durationMs: 5 }) + '\\n');
  });
`;
  const SCENARIO = {
    id: 'ac-01-report',
    title: 'The report is written under /output',
    covers: ['AC-01', 'INV-FS'],
    level: 'component',
    dataset: 'nominal',
    bindings: { '/workspace': 'workspace', '/output': null, '/state': null },
    llm_stub: { replies: [{ match: { role: 'Writer', task: 'Write the report' }, turns: [{ content: '# Report\n\nThe launch is on Tuesday.\n' }] }] },
    checks: [
      { id: 'c1', type: 'matches-expected', path: '/output/report.md', expected: 'expected/output/report.md' },
      { id: 'c2', type: 'tool-never-called', tool: 'email_send' },
      { id: 'c3', type: 'stub-received', role: 'Writer', pattern: 'Write the report' },
    ],
  };
  let root: string;
  let env: Record<string, string>;
  const attempt = (): string => join(root, 'workbooks', 'demo', 'attempts', 'ATT-0001');

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'orkeon-bench-run-e2e-'));
    await cp(FIXTURE_WORKSHOP_DIR, root, { recursive: true });
    const team = join(root, 'teams', 'demo');
    await mkdir(join(team, 'crew', 'agents'), { recursive: true });
    await writeFile(join(team, 'crew', 'config.yaml'), 'name: demo\ngoal: "Write a report"\nprocess: sequential\n');
    await writeFile(join(team, 'crew', 'agents', 'writer.yaml'), 'role: "Writer"\ngoal: "write"\n');
    const dataset = join(root, 'tests', 'demo', 'datasets', 'nominal');
    await mkdir(join(dataset, 'workspace'), { recursive: true });
    await mkdir(join(dataset, 'expected', 'output'), { recursive: true });
    await writeFile(join(dataset, 'workspace', 'a.md'), 'The launch is on Tuesday.\n');
    await writeFile(join(dataset, 'expected', 'output', 'report.md'), '# Report\n\nThe launch is on Tuesday.\n');
    await mkdir(join(root, 'tests', 'demo', 'component'), { recursive: true });
    await writeFile(join(root, 'tests', 'demo', 'component', 'ac-01-report.scenario.json'), JSON.stringify(SCENARIO, null, 2));
    // The team's own settings: a paid endpoint by default and for a profile with a hyphen, and a section that is not Llm.
    await mkdir(join(root, 'settings', 'demo'), { recursive: true });
    const paid = { BaseUrl: 'http://127.0.0.1:9/v1', Model: 'paid-model', ApiKey: 'sk-FILE' };
    await writeFile(join(root, 'settings', 'demo', 'appsettings.json'), JSON.stringify({ Llm: { ...paid, Profiles: { 'fast-remote': { ...paid, ApiKey: 'sk-FILE-2' } } }, RateLimiting: { MaxConcurrentRequests: 1 } }));
    const tools = join(root, 'stand-in');
    await mkdir(tools);
    await writeFile(join(tools, 'orkeon'), STAND_IN, { mode: 0o755 });
    env = { ORKEON_WORKSHOP: root, XDG_CONFIG_HOME: join(root, 'no-config'), PATH: `${tools}:${process.env.PATH ?? ''}` };
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('opens an attempt, runs L0 to L2 against the real stub, and leaves a valid report and the archive of the run', async () => {
    expect((await bench(['scaffold', 'demo'], env)).code).toBe(0);
    const opened = await bench(['attempt', 'open', 'demo', '--by', 'team-build'], env);
    expect(opened.stderr).toBe('');
    expect(opened.stdout.trim()).toBe(`demo: opened ATT-0001 (${attempt()})`);
    expect(JSON.parse(await readFile(join(attempt(), 'manifest.json'), 'utf8'))).toMatchObject({ attempt: 'ATT-0001', closed_at: null, opened_by: 'team-build', design_snapshot: 'design-snapshot/', runs: [] });
    expect(await readFile(join(attempt(), 'design-snapshot', 'crew', 'agents', 'writer.yaml'), 'utf8')).toContain('Writer');

    const run = await bench(['run', 'demo', '--level', 'L2', '--json'], { ...env, ORKEON_LLM__BASEURL: 'http://127.0.0.1:9/v1', ORKEON_LLM__APIKEY: 'sk-REAL' });
    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { failed: boolean; runs: string[]; levels: { level: string; status: string }[]; report_file: string; verdict_input: Record<string, boolean>; warnings: string[] };
    expect(result.failed).toBe(false);
    expect(result.levels.map((entry) => `${entry.level}:${entry.status}`)).toEqual(['static:pass', 'unit:skipped', 'component:pass']);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatch(/^RUN-\d{8}-\d{4}-stub$/);
    // Green scenarios, and nothing accepted: no ACCEPTANCE.md declares AC-01, and INV-FS has no check of its own.
    expect(result.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: true });
    expect(result.warnings.join('\n')).toContain('AC-01 is not proven: ACCEPTANCE.md does not exist');
    expect(result.warnings.join('\n')).toContain('INV-FS not proven: no check of an invariant exists in this version of the bench');
    expect(run.stderr).toBe('');

    const validation = await bench(['report', 'validate', result.report_file, '--json'], env);
    expect(validation.code).toBe(0);
    expect(JSON.parse(validation.stdout)).toMatchObject({ valid: true, issues: [], accepted: false });
    const refused = await bench(['attempt', 'close', 'demo', '--verdict', 'ACCEPTED'], env);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toBe('error: ATT-0001 cannot be closed ACCEPTED: its report does not accept — all_ac_pass=false all_inv_pass=false indicators_in_range=true\n');
    expect(await readFile(join(attempt(), 'REPORT.md'), 'utf8')).toContain('## What fails\n\nNothing.\n\nNot run, so not proven:\n\n- AC-01 — ACCEPTANCE.md does not exist');

    const archive = join(root, 'workbooks', 'demo', 'runs', result.runs[0] as string);
    expect(await readFile(join(archive, 'output-snapshot', 'output', 'report.md'), 'utf8')).toBe('# Report\n\nThe launch is on Tuesday.\n');
    expect((await readFile(join(archive, 'events.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(2);
    const exchange = JSON.parse((await readFile(join(archive, 'stub-exchanges.jsonl'), 'utf8')).trim()) as Record<string, unknown>;
    expect(exchange).toMatchObject({ seq: 1, dialect: 'openai', role: 'Writer', rule: 0, turn: 0, issues: [] });
    const manifest = JSON.parse(await readFile(join(archive, 'manifest.json'), 'utf8')) as { command: string[]; crew: { sha256: string }; settings: { generated: string; from: string } };
    // The run read a settings file generated for it from the team's, which is gone with the sandbox.
    expect(manifest.settings.from).toBe(join(root, 'settings', 'demo', 'appsettings.json'));
    expect(manifest.command[manifest.command.indexOf('--settings') + 1]).toBe(manifest.settings.generated);
    await expect(stat(manifest.settings.generated)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((JSON.parse((await readFile(join(archive, 'stub-exchanges.jsonl'), 'utf8')).trim()) as { request: { model: string } }).request.model).toBe('stub-model');
    expect(manifest).toMatchObject({ team: 'demo', attempt: 'ATT-0001', scenario: 'ac-01-report', target: 'stub', exit_code: 0, stopped: null, status: 'pass' });
    expect(manifest.crew.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Every point is bound to the sandbox, the read-only ones too: nothing of tests/ is handed to the run.
    expect(manifest.command.filter((argument) => argument.includes(':/')).every((argument) => !argument.includes(join(root, 'tests')))).toBe(true);
    expect((JSON.parse(await readFile(join(attempt(), 'manifest.json'), 'utf8')) as { runs: string[] }).runs).toEqual(result.runs);
    // The dataset is read, never written: the run worked on a copy that is gone.
    expect(await readFile(join(root, 'tests', 'demo', 'datasets', 'nominal', 'workspace', 'a.md'), 'utf8')).toBe('The launch is on Tuesday.\n');
    await expect(stat(join(root, 'teams', 'demo', 'output', 'report.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('lets one of two attempt open started together open the attempt', async () => {
    const twin = await mkdtemp(join(tmpdir(), 'orkeon-bench-open-e2e-'));
    try {
      await cp(FIXTURE_WORKSHOP_DIR, twin, { recursive: true });
      const twinEnv = { ...env, ORKEON_WORKSHOP: twin };
      const [first, second] = await Promise.all([bench(['attempt', 'open', 'demo', '--by', 'first'], twinEnv), bench(['attempt', 'open', 'demo', '--by', 'second'], twinEnv)]);
      expect([first.code, second.code].sort()).toEqual([0, 2]);
      const refused = first.code === 2 ? first : second;
      expect(refused.stderr).toBe('error: ATT-0001 is still open for demo: close it with `orkeon-bench attempt close demo` before opening another\n');
      const attempts = join(twin, 'workbooks', 'demo', 'attempts');
      expect((await readdir(attempts)).filter((name) => name.startsWith('ATT-'))).toEqual(['ATT-0001']);
      expect(JSON.parse(await readFile(join(attempts, 'ATT-0001', 'manifest.json'), 'utf8'))).toMatchObject({ closed_at: null, opened_by: first.code === 0 ? 'first' : 'second' });
    } finally {
      await rm(twin, { recursive: true, force: true });
    }
  });

  it('asked to stop in the middle of a scenario: stops orkeon and what it started, removes its sandbox, and says so', async () => {
    const temporary = join(root, 'tmp-of-the-run');
    const pidFile = join(root, 'stand-in-child.pid');
    await mkdir(temporary);
    const before = JSON.parse(await readFile(join(attempt(), 'manifest.json'), 'utf8')) as { runs: string[] };
    const child = spawn(process.execPath, [BIN, 'run', 'demo', '--level', 'L2'], { env: hermeticEnv({ ...env, TMPDIR: temporary, STAND_IN_HANGS: pidFile }), cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    // The stand-in is running once it has left the pid of its child.
    for (let waited = 0; waited < 300 && (await stat(pidFile).catch(() => null)) === null; waited += 1) {
      await new Promise((done) => setTimeout(done, 100));
    }
    const grandchild = Number(await readFile(pidFile, 'utf8'));
    expect(() => process.kill(grandchild, 0)).not.toThrow();
    const code = await new Promise<number>((resolve) => {
      child.on('close', (exit) => resolve(exit ?? -1));
      child.kill('SIGTERM');
    });
    expect(code).toBe(130);
    expect(stderr).toContain('error: interrupted while scenario ac-01-report was running: orkeon run and what it started were stopped, the sandbox removed');
    await new Promise((done) => setTimeout(done, 300));
    expect(() => process.kill(grandchild, 0)).toThrow();
    expect(await readdir(temporary)).toEqual([]);
    const after = JSON.parse(await readFile(join(attempt(), 'manifest.json'), 'utf8')) as { runs: string[]; closed_at: unknown };
    expect(after.runs).toHaveLength(before.runs.length + 1);
    expect(after.closed_at).toBeNull();
    const interrupted = join(root, 'workbooks', 'demo', 'runs', after.runs.at(-1) as string);
    expect(JSON.parse(await readFile(join(interrupted, 'manifest.json'), 'utf8'))).toMatchObject({ status: 'interrupted', stopped: 'cancelled', exit_code: null });
  });

  it('records an approval the run gate accepts, refuses what it must, then closes the attempt for good', async () => {
    const tooMuch = await bench(['attempt', 'approve', 'demo', '--usd', '5'], env);
    expect(tooMuch.code).toBe(2);
    expect(tooMuch.stderr).toBe('error: 5 USD is above the cap of 2 USD (budget.remote_usd_max of bench.config.json): raise the cap with a decision first, or approve a lower amount\n');
    await expect(stat(join(attempt(), 'remote-approval.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    const approved = await bench(['attempt', 'approve', 'demo', '--usd', '1.50'], env);
    expect(approved.code).toBe(0);
    const marker = JSON.parse(await readFile(join(attempt(), 'remote-approval.json'), 'utf8')) as Record<string, unknown>;
    expect(marker).toMatchObject({ by: 'user', estimated_usd: 1.5, cap_usd: 2, source: '/team-approve remote 1.50' });
    expect(typeof marker.at).toBe('string');

    const closed = await bench(['attempt', 'close', 'demo', '--verdict', 'ITERATE', '--json'], env);
    expect(closed.code).toBe(0);
    expect((JSON.parse(closed.stdout) as { manifest: Record<string, unknown> }).manifest).toMatchObject({ verdict: 'ITERATE', remote_approval: { estimated_usd: 1.5 } });
    for (const args of [['attempt', 'approve', 'demo', '--usd', '1'], ['attempt', 'close', 'demo'], ['run', 'demo', '--level', 'L2']]) {
      const refused = await bench(args, env);
      expect(refused.code, args.join(' ')).toBe(2);
      expect(refused.stderr).toBe('error: no open attempt for demo: open one with `orkeon-bench attempt open demo`\n');
    }
    expect((await bench(['attempt', 'open', 'demo'], env)).stdout).toContain('demo: opened ATT-0002');
  });

  it('llm-stub serve answers from a scenario until SIGTERM, logs the exchange and reports what it served', async () => {
    const log = join(root, 'serve.jsonl');
    const scenario = join(root, 'tests', 'demo', 'component', 'ac-01-report.scenario.json');
    const child = spawn(process.execPath, [BIN, 'llm-stub', 'serve', '--scenario', scenario, '--log', log, '--json'], { env: hermeticEnv(env), cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const endpoint = await new Promise<{ base_url: string }>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.trim().endsWith('}') && stdout.includes('"api_key"') && !stdout.includes('"requests"')) {
          resolve(JSON.parse(stdout) as { base_url: string });
        }
      });
    });
    expect(endpoint.base_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const answer = await fetch(`${endpoint.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: 'You are Writer.\n' }, { role: 'user', content: 'Task:\nWrite the report' }] }),
    });
    expect(((await answer.json()) as { choices: { message: { content: string } }[] }).choices[0]?.message.content).toBe('# Report\n\nThe launch is on Tuesday.\n');
    const code = await new Promise<number>((resolve) => {
      child.on('close', (exit) => resolve(exit ?? -1));
      child.kill('SIGTERM');
    });
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(JSON.parse(stdout.slice(stdout.indexOf('}') + 1))).toEqual({ requests: 1, issues: [] });
    // A second serve appends to the log the first one left.
    const again = spawn(process.execPath, [BIN, 'llm-stub', 'serve', '--scenario', scenario, '--log', log], { env: hermeticEnv(env), cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve) => {
      again.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('listening on')) {
          resolve();
        }
      });
    });
    await new Promise<void>((resolve) => {
      again.on('close', () => resolve());
      again.kill('SIGINT');
    });
    expect((await readFile(log, 'utf8')).trim().split('\n')).toHaveLength(1);
    expect(JSON.parse((await readFile(log, 'utf8')).trim())).toMatchObject({ seq: 1, role: 'Writer', rule: 0, issues: [] });
  });
});
