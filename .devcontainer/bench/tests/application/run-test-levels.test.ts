import { describe, expect, it } from 'vitest';

import type { ProcessResult, ProcessRunOptions } from '../../src/application/ports/process-runner.js';
import { ScenarioRunner } from '../../src/application/runs/run-scenario.js';
import { ApproveRemote } from '../../src/application/use-cases/approve-remote.js';
import { CloseAttempt } from '../../src/application/use-cases/close-attempt.js';
import { OpenAttempt } from '../../src/application/use-cases/open-attempt.js';
import { ResolveProfile } from '../../src/application/use-cases/resolve-profile.js';
import { RunTestLevels, type RunOptions } from '../../src/application/use-cases/run-test-levels.js';
import { ScaffoldTeam } from '../../src/application/use-cases/scaffold-team.js';
import { ValidateReport } from '../../src/application/use-cases/validate-report.js';
import { UNKNOWN_MACHINE } from '../../src/domain/mounts/mount-reach.js';
import type { Report } from '../../src/domain/report.js';
import { INVARIANT_NOT_CHECKED, type ScenarioResult } from '../../src/domain/run-report.js';
import { teamRefInWorkshop } from '../../src/domain/team-ref.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeLlmStub, FakeShutdownSignal } from '../fakes/fake-llm-stub.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { WORKSHOP, demoTeam } from '../fakes/fixture-team.js';
import type { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const TEAM = `${WORKSHOP}/teams/demo`;
const TESTS = `${WORKSHOP}/tests/demo`;
const WORKBOOK = `${WORKSHOP}/workbooks/demo`;
const ATTEMPT = `${WORKBOOK}/attempts/ATT-0001`;
const RUNS = `${WORKBOOK}/runs`;
const RUN = `${RUNS}/RUN-20260930-1912-stub`;
const DATASET = `${TESTS}/datasets/nominal`;
const SANDBOX = '/tmp/orkeon-bench-run-1';
const SETTINGS = `${SANDBOX}/.orkeon-bench/appsettings.json`;
const USER_SETTINGS = '/home/tester/.config/Orkeon/appsettings.json';
const CHECK_SCRIPT = `${WORKSHOP}/.claude/skills/orkeon-crew-yaml/scripts/check_crew.py`;
const L2: RunOptions = { maxLevel: 'component', profile: null, continueAfterRed: false };
const STATIC_ONLY: RunOptions = { ...L2, maxLevel: 'static' };

const event = (value: Record<string, unknown>): string => JSON.stringify({ v: 2, ...value });
const EVENTS = [
  event({ kind: 'run.started', target: 'crew' }),
  event({ kind: 'tool.called', correlationId: 'a', toolName: 'file_read' }),
  event({ kind: 'tool.returned', correlationId: 'a', toolName: 'file_read', success: true }),
  event({ kind: 'task.completed', agentRole: 'Writer', success: true, skipped: false }),
  event({ kind: 'run.finished', success: true, exitCode: 0, promptTokens: 30, completionTokens: 15, durationMs: 800 }),
  '',
].join('\n');
const FAILED_EVENTS = [event({ kind: 'error', code: 'crew_failed', message: 'Task 01 (Writer) failed' }), event({ kind: 'run.finished', success: false, exitCode: 2 }), ''].join('\n');
const RAN: ProcessResult = { found: true, exitCode: 0, stdout: EVENTS, stderr: '=== Crew Output ===\n# Report\n' };

const WRITER_REQUEST = { path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: 'You are Writer.\n' }, { role: 'user', content: 'Task:\nWrite the report' }] } };
const SCRIPT = { replies: [{ match: { role: 'Writer' }, turns: [{ content: '# Report\n' }] }] };
const SCENARIO = {
  id: 'ac-01-report',
  title: 'The report is written',
  covers: ['AC-01', 'INV-FS'],
  level: 'component',
  dataset: 'nominal',
  bindings: { '/workspace': 'workspace', '/output': null },
  llm_stub: SCRIPT,
  checks: [
    { id: 'c1', type: 'file-exists', path: '/output/report.md' },
    { id: 'c2', type: 'matches-expected', path: '/output/report.md', expected: 'expected/output/report.md' },
    { id: 'c3', type: 'text-present', path: '/workspace/a.md', pattern: 'launch' },
    { id: 'c4', type: 'tool-called', tool: 'file_read' },
  ],
};
/** A scenario that proves nothing and asks for nothing: the smallest one that runs. */
const smoke = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, level: 'component', llm_stub: SCRIPT, ...extra });
const ACCEPTANCE = [
  '## Acceptance criteria',
  '',
  '| Id | Given | When | Then | Level | Status |',
  '|---|---|---|---|---|---|',
  '| AC-01 | nominal | the team runs | the report is written | L2 | active |',
  '',
  '## Invariants',
  '',
  '| Id | Statement | Check | Level |',
  '|---|---|---|---|',
  '| INV-FS | writes only under its roots | events + snapshot | L2 |',
].join('\n');

interface Setup {
  /** Extra or replaced results of the commands the run starts. */
  commands?: Record<string, ProcessResult>;
  /** What the stub receives during each scenario, in order. */
  requests?: { path: string; body: unknown }[][];
  /** Scenario files of `tests/demo/component/`, by file name; the nominal one when absent. */
  scenarios?: Record<string, unknown>;
  /** Files added before the attempt is opened, by absolute path; null removes one the rig adds. */
  files?: Record<string, string | null>;
  /** What the fake `orkeon run` leaves under the folder bound to /output. */
  writes?: Record<string, string>;
  variables?: Record<string, string>;
  /** Open the attempt before the crew exists. */
  attemptBeforeCrew?: boolean;
  typescript?: boolean;
  /** Played while the fake `orkeon run` of a scenario is in flight: what another command does meanwhile. */
  during?: (rig: Rig, line: string) => Promise<void> | void;
}

interface Rig {
  team: ReturnType<typeof demoTeam>['team'];
  fileSystem: InMemoryFileSystem;
  processes: FakeProcessRunner;
  stub: FakeLlmStub;
  shutdown: FakeShutdownSignal;
  run: RunTestLevels;
  /** The command lines of the scenario runs, and their options. */
  lines: string[];
  runOptions: ProcessRunOptions[];
  /** The settings file each scenario run was given with `--settings`, as it stood during the run. */
  settings: Record<string, unknown>[];
}

/** The folder bound to a mount point in the line of a run. */
function boundFolder(line: string, root: string): string | undefined {
  return new RegExp(`(\\S+):${root}:r`).exec(line)?.[1];
}

async function setup(options: Setup = {}): Promise<Rig> {
  const { team, fileSystem } = demoTeam();
  const crew = async (): Promise<void> => {
    if (options.typescript === true) {
      fileSystem.addFile(`${TEAM}/crew/crew.ork.ts`, 'globalThis.crew = {};\n');
    } else {
      fileSystem.addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n').addFile(`${TEAM}/crew/agents/writer.yaml`, 'role: Writer\n').addFile(`${TEAM}/crew/tasks/write.yaml`, 'agent: writer\n');
    }
    await new ScaffoldTeam(fileSystem).execute(team);
  };
  fileSystem
    .addFile(`${DATASET}/workspace/a.md`, 'The launch is on Tuesday.\n')
    .addFile(`${DATASET}/expected/output/report.md`, '# Report\n')
    .addFile(`${DATASET}/manifest.json`, JSON.stringify({ name: 'nominal', version: '3', sha256: 'abc' }))
    .addFile(`${WORKBOOK}/ACCEPTANCE.md`, ACCEPTANCE);
  const scenarios = options.scenarios ?? { 'ac-01-report.scenario.json': SCENARIO };
  for (const [name, content] of Object.entries(scenarios)) {
    fileSystem.addFile(`${TESTS}/component/${name}`, typeof content === 'string' ? content : JSON.stringify(content));
  }
  for (const [path, content] of Object.entries(options.files ?? {})) {
    if (content === null) {
      await fileSystem.remove(path);
    } else {
      fileSystem.addFile(path, content);
    }
  }
  const clock = new FixedClock(new Date('2026-09-30T19:12:00Z'));
  const rig = { team, fileSystem, lines: [] as string[], runOptions: [] as ProcessRunOptions[], settings: [] as Record<string, unknown>[] } as Rig;
  rig.processes = new FakeProcessRunner(
    {
      'orkeon --version': succeeded('orkeon 1.0.0-rc.4.src.20261007.g80fdefe'),
      'orkeon run crew --validate': succeeded('VALIDATION OK: crew (agents=1, tasks=1, tools resolved=0)\n'),
      'orkeon run crew/crew.ork.ts --validate': succeeded('VALIDATION OK\n'),
      'orkeon run crew --events jsonl': RAN,
      ...options.commands,
    },
    async (line, runOption) => {
      if (!line.includes('--events jsonl')) {
        return;
      }
      rig.lines.push(line);
      rig.runOptions.push(runOption);
      const given = / --settings (\S+)/.exec(line)?.[1];
      if (given !== undefined) {
        rig.settings.push(JSON.parse(await fileSystem.readText(given)) as Record<string, unknown>);
      }
      const output = boundFolder(line, '/output');
      for (const [name, content] of Object.entries(options.writes ?? { 'report.md': '# Report\n' })) {
        fileSystem.addFile(`${String(output)}/${name}`, content);
      }
      await options.during?.(rig, line);
    },
  );
  const open = new OpenAttempt(fileSystem, rig.processes, clock);
  if (options.attemptBeforeCrew === true) {
    await open.execute(team);
    await crew();
  } else {
    await crew();
    await open.execute(team, 'team-build');
  }
  const environment = new FakeEnvironment({ PATH: '/usr/bin', ...options.variables }, '/home/tester');
  rig.stub = new FakeLlmStub(options.requests ?? [[WRITER_REQUEST]]);
  rig.shutdown = new FakeShutdownSignal(false);
  const scenarioRunner = new ScenarioRunner(fileSystem, rig.processes, environment, clock, rig.stub, new ResolveProfile(fileSystem, environment));
  rig.run = new RunTestLevels(fileSystem, rig.processes, clock, environment, UNKNOWN_MACHINE, scenarioRunner, rig.shutdown, '0.1.0');
  return rig;
}

/** An entry of a record keyed by branded ids. */
const pick = (record: object, id: string): unknown => (record as Record<string, unknown>)[id];

async function json<T>(fileSystem: InMemoryFileSystem, path: string): Promise<T> {
  return JSON.parse(await fileSystem.readText(path)) as T;
}

function scenariosOf(report: Report): ScenarioResult[] {
  return report.levels.component.scenarios as ScenarioResult[];
}

function failures(scenario: ScenarioResult | undefined): Record<string, string> {
  return Object.fromEntries((scenario?.checks ?? []).filter((check) => check.status === 'fail').map((check) => [check.id, check.detail]));
}

function staticChecks(report: Report): Record<string, string> {
  return Object.fromEntries((report.levels.static.checks as { id: string; status: string; detail: string }[]).map((check) => [check.id, `${check.status}: ${check.detail}`]));
}

describe('RunTestLevels — a green run of L0 to L2', () => {
  it('runs the static checks, then each component scenario against the stub, and reports', async () => {
    const { team, fileSystem, run, stub, shutdown } = await setup();
    const result = await run.execute(team, L2);
    expect(result).toMatchObject({ attempt: 'ATT-0001', failed: false, runs: ['RUN-20260930-1912-stub'], reportFile: `${ATTEMPT}/report.json`, reportMarkdownFile: `${ATTEMPT}/REPORT.md` });
    expect(result.levels).toEqual([
      { level: 'static', status: 'pass', note: '' },
      { level: 'unit', status: 'skipped', note: 'not run: L1 is not implemented yet (lot 4)' },
      { level: 'component', status: 'pass', note: '' },
    ]);
    expect(result.warnings).toEqual([
      `static check check-script skipped: ${CHECK_SCRIPT} does not exist (the harness deploys it into a workshop)`,
      'INV-FS not proven: no check of an invariant exists in this version of the bench — all_inv_pass stays false',
    ]);
    expect(stub.scripts).toHaveLength(1);
    expect(stub.stopped).toBe(1);
    expect([shutdown.watched, shutdown.released]).toEqual([1, 1]);

    const report = await json<Report>(fileSystem, `${ATTEMPT}/report.json`);
    expect(report).toEqual(JSON.parse(JSON.stringify(result.report)));
    expect(await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).toMatchObject({ valid: true, issues: [], accepted: false });
    expect(report.metadata).toMatchObject({ team: 'demo', attempt: 'ATT-0001', date: '2026-09-30T19:12:00.000Z', orkeon_version: '1.0.0-rc.4.src.20261007.g80fdefe', bench_version: '0.1.0', requested_level: 'component', replaces: null });
    expect(Object.values(staticChecks(report))).toEqual(['pass: ', 'pass: ', 'pass: ', 'pass: ', 'pass: no settings file: neither the team nor the machine has one', 'pass: ', expect.stringContaining('skipped: '), 'pass: ']);
    expect(Object.keys(staticChecks(report))).toEqual(['mounts', 'crew-layout', 'launchers', 'bench-config', 'settings', 'scenarios', 'check-script', 'orkeon-validate']);
    expect(scenariosOf(report)[0]).toMatchObject({
      id: 'ac-01-report',
      title: 'The report is written',
      file: 'component/ac-01-report.scenario.json',
      status: 'pass',
      covers: ['AC-01', 'INV-FS'],
      run: 'RUN-20260930-1912-stub',
      dataset: 'nominal',
      exit_code: 0,
      tokens_in: 30,
      tokens_out: 15,
      tool_calls: 1,
    });
    expect(scenariosOf(report)[0]?.checks.map((check) => `${check.id}:${check.status}`)).toEqual(['run:pass', 'stub:pass', 'c1:pass', 'c2:pass', 'c3:pass', 'c4:pass', 'read-only:pass']);
    expect(report.acceptance).toEqual({ 'AC-01': { status: 'pass', level: 'component', evidence: 'ac-01-report (RUN-20260930-1912-stub)' } });
    expect(report.invariants).toEqual({ 'INV-FS': { status: 'not_run', violations: [], note: INVARIANT_NOT_CHECKED } });
    expect(report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: false, indicators_in_range: true });
    expect(await fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain('# demo — Report ATT-0001');
    expect((await json<{ runs: string[] }>(fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(['RUN-20260930-1912-stub']);
  });

  it('runs orkeon from the team folder, on a sandbox that holds copies of the dataset, in a group of its own, stdin closed', async () => {
    const { team, run, lines, runOptions, fileSystem, shutdown } = await setup();
    await run.execute(team, L2);
    expect(lines).toEqual([`orkeon run crew --events jsonl --settings ${SETTINGS} --mount ${SANDBOX}/workspace:/workspace:ro ${SANDBOX}/output:/output:rw ${SANDBOX}/state:/state:rw --allow-external-mounts`]);
    expect(runOptions[0]).toMatchObject({ cwd: TEAM, timeoutMs: 300_000, input: '', ownGroup: true });
    expect(runOptions[0]?.cancel).toBe(shutdown.watch().requested);
    expect(lines[0]).not.toContain(TESTS);
    expect(fileSystem.removed).toContain(SANDBOX);
    expect(await fileSystem.exists(SANDBOX)).toBe(false);
  });

  it('gives the run the stub and nothing of the caller that names a model, whatever its case', async () => {
    const { team, run, runOptions } = await setup({
      variables: {
        ORKEON_Llm__BaseUrl: 'https://api.example.com/v1',
        ORKEON_LLM__BASEURL: 'https://api.example.com/v2',
        ORKEON_LLM__APIKEY: 'sk-REAL',
        orkeon_llm__model: 'gpt-x',
        ORKEON_Llm__Temperature: '0',
        Llm__ApiKey: 'sk-REAL-2',
        ORKEON_LLM__PROFILES__PAID__BASEURL: 'https://api.example.com/v3',
        ORKEON_LLM__PROFILES__PAID__APIKEY: 'sk-REAL-3',
        ORKEON_OPENAI_API_KEY: 'sk-REAL-4',
        ORKEON_TAVILY_API_KEY: 'tvly',
      },
      files: { [`${WORKSHOP}/settings/demo/appsettings.json`]: JSON.stringify({ Llm: { BaseUrl: 'https://api.example.com/v4', Profiles: { review: { BaseUrl: 'https://api.example.com/v5', ApiKeyEnvVar: 'MY_KEY' } } } }) },
    });
    await run.execute(team, L2);
    const stubbed = (prefix: string): Record<string, string> => ({ [`${prefix}BaseUrl`]: 'http://127.0.0.1:43210/v1', [`${prefix}Model`]: 'stub-model', [`${prefix}ApiKey`]: 'stub', [`${prefix}ApiKeyEnvVar`]: '' });
    expect(runOptions[0]?.env).toEqual({
      PATH: '/usr/bin',
      ORKEON_TAVILY_API_KEY: 'tvly',
      ...stubbed('ORKEON_Llm__'),
      ...stubbed('ORKEON_Llm__Profiles__PAID__'),
      ...stubbed('ORKEON_Llm__Profiles__review__'),
    });
    expect(JSON.stringify(runOptions[0]?.env)).not.toMatch(/sk-REAL|api\.example\.com/);
  });

  it('hands the run a settings file of its own: the team settings with the whole Llm section pointed at the stub, for every profile whatever its name', async () => {
    const team = {
      Llm: {
        BaseUrl: 'https://api.example.com/v1',
        Model: 'm',
        ApiKey: 'sk-FILE',
        Profiles: { 'fast-remote': { BaseUrl: 'https://api.example.com/v2', ApiKey: 'sk-FILE-2' }, 'gpt.4': { ApiKeyEnvVar: 'MY_KEY' }, 'my profile': { Model: 'm3' } },
      },
      'Llm:Profiles:pathlike:ApiKey': 'sk-FILE-3',
      RateLimiting: { MaxConcurrentRequests: 1 },
      Orkeon: { Tools: { Email: { Accounts: { support: { Host: 'mail.example.com' } } } } },
    };
    const { team: demo, run, settings, runOptions } = await setup({
      files: { [`${WORKSHOP}/settings/demo/appsettings.json`]: JSON.stringify(team), [USER_SETTINGS]: JSON.stringify({ Llm: { BaseUrl: 'https://machine.example.com' }, Machine: true }) },
      variables: { ORKEON_LLM__PROFILES__FROMENV__BASEURL: 'https://api.example.com/v6' },
    });
    await run.execute(demo, L2);
    const provider = { BaseUrl: 'http://127.0.0.1:43210/v1', Model: 'stub-model', ApiKey: 'stub' };
    expect(settings).toEqual([
      {
        RateLimiting: { MaxConcurrentRequests: 1 },
        Orkeon: { Tools: { Email: { Accounts: { support: { Host: 'mail.example.com' } } } } },
        Llm: { ...provider, Profiles: { FROMENV: provider, 'fast-remote': provider, 'gpt.4': provider, 'my profile': provider, pathlike: provider } },
      },
    ]);
    expect(JSON.stringify(settings)).not.toMatch(/sk-FILE|example\.com\/v|MY_KEY|machine\.example/);
    // Nothing rests on a variable a shell could drop: the profiles with a hyphen, a dot or a space are in the file.
    expect(Object.keys(runOptions[0]?.env ?? {}).filter((name) => /fast-remote|gpt\.4|my profile/.test(name)).every((name) => name.startsWith('ORKEON_Llm__Profiles__'))).toBe(true);
  });

  it('generates the settings from the file the run would have read: the machine settings for a team without its own, nothing when there is none', async () => {
    const machine = await setup({ files: { [USER_SETTINGS]: JSON.stringify({ Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b', Profiles: { review: { Model: 'big' } } }, RateLimiting: { MaxConcurrentRequests: 1, QueueLimit: 32 } }) } });
    await machine.run.execute(machine.team, L2);
    const provider = { BaseUrl: 'http://127.0.0.1:43210/v1', Model: 'stub-model', ApiKey: 'stub' };
    expect(machine.settings).toEqual([{ RateLimiting: { MaxConcurrentRequests: 1, QueueLimit: 32 }, Llm: { ...provider, Profiles: { review: provider } } }]);
    expect((await json<{ settings: unknown }>(machine.fileSystem, `${RUN}/manifest.json`)).settings).toEqual({ generated: SETTINGS, from: USER_SETTINGS });
    const none = await setup();
    await none.run.execute(none.team, L2);
    expect(none.settings).toEqual([{ Llm: { ...provider, Profiles: {} } }]);
    expect(await none.fileSystem.exists(SETTINGS)).toBe(false);
  });

  it('archives the run: events, logs, the exchanges of the stub, the written points, a manifest with the digest of the crew', async () => {
    const { team, run, fileSystem } = await setup();
    await run.execute(team, L2);
    expect(await fileSystem.list(RUN)).toEqual(['events.jsonl', 'manifest.json', 'output-snapshot', 'stderr.log', 'stub-exchanges.jsonl']);
    expect(await fileSystem.readText(`${RUN}/events.jsonl`)).toBe(EVENTS);
    expect(await fileSystem.readText(`${RUN}/stderr.log`)).toBe('=== Crew Output ===\n# Report\n');
    expect(await fileSystem.readText(`${RUN}/output-snapshot/output/report.md`)).toBe('# Report\n');
    expect(await fileSystem.isDirectory(`${RUN}/output-snapshot/state`)).toBe(true);
    expect(await fileSystem.exists(`${RUN}/output-snapshot/workspace`)).toBe(false);
    const exchanges = (await fileSystem.readText(`${RUN}/stub-exchanges.jsonl`)).trim().split('\n');
    expect(JSON.parse(exchanges[0] as string)).toMatchObject({ seq: 1, role: 'Writer', rule: 0, turn: 0, issues: [] });
    const crew = await fileSystem.digest(`${TEAM}/crew`);
    expect(await json(fileSystem, `${RUN}/manifest.json`)).toEqual({
      run: 'RUN-20260930-1912-stub',
      team: 'demo',
      attempt: 'ATT-0001',
      scenario: 'ac-01-report',
      scenario_file: 'component/ac-01-report.scenario.json',
      level: 'component',
      target: 'stub',
      model: 'stub-model',
      started_at: '2026-09-30T19:12:00.000Z',
      finished_at: '2026-09-30T19:12:00.000Z',
      duration_seconds: 0,
      orkeon_version: '1.0.0-rc.4.src.20261007.g80fdefe',
      bench_version: '0.1.0',
      crew: { sha256: crew.sha256, files: 3 },
      dataset: { name: 'nominal', folder: DATASET, version: '3', sha256: 'abc' },
      settings: { generated: SETTINGS, from: null },
      links_not_archived: [],
      command: ['orkeon', 'run', 'crew', '--events', 'jsonl', '--settings', SETTINGS, '--mount', `${SANDBOX}/workspace:/workspace:ro`, `${SANDBOX}/output:/output:rw`, `${SANDBOX}/state:/state:rw`, '--allow-external-mounts'],
      exit_code: 0,
      stopped: null,
      tokens_in: 30,
      tokens_out: 15,
      tool_calls: 1,
      stub_requests: 1,
      status: 'pass',
    });
  });

  it("generates the run's settings from the team's, starts a written point from the dataset, and reads a shared dataset", async () => {
    const shared = `${WORKSHOP}/library/datasets/shared-set`;
    const { team, run, lines, fileSystem } = await setup({
      files: { [`${WORKSHOP}/settings/demo/appsettings.json`]: '{}', [`${shared}/state/processed.json`]: '["a"]', [`${shared}/workspace/a.md`]: 'x' },
      scenarios: { 'inv-incr.scenario.json': smoke('inv-incr', { dataset: 'shared-set', checks: [{ id: 'kept', type: 'file-exists', path: '/state/processed.json' }] }) },
    });
    const result = await run.execute(team, L2);
    expect(lines[0]).toBe(`orkeon run crew --events jsonl --settings ${SETTINGS} --mount ${SANDBOX}/workspace:/workspace:ro ${SANDBOX}/output:/output:rw ${SANDBOX}/state:/state:rw --allow-external-mounts`);
    expect((await json<{ settings: unknown }>(fileSystem, `${RUN}/manifest.json`)).settings).toEqual({ generated: SETTINGS, from: `${WORKSHOP}/settings/demo/appsettings.json` });
    expect(result.failed).toBe(false);
    expect(await fileSystem.readText(`${RUN}/output-snapshot/state/processed.json`)).toBe('["a"]');
    expect(await fileSystem.readText(`${shared}/state/processed.json`)).toBe('["a"]');
    expect((await json<{ dataset: unknown }>(fileSystem, `${RUN}/manifest.json`)).dataset).toEqual({ name: 'shared-set', folder: shared, version: null, sha256: null });
  });

  it('gives each run of the same minute its own folder, and a scenario without a dataset empty points', async () => {
    const { team, run, lines, fileSystem } = await setup({
      scenarios: { 'a-first.scenario.json': smoke('a-first'), 'b-second.scenario.json': smoke('b-second', { llm_stub: 'reply.json', timeout_seconds: 20 }), 'reply.json': SCRIPT, 'notes.md': 'not a scenario' },
      requests: [[WRITER_REQUEST], [WRITER_REQUEST]],
    });
    const result = await run.execute(team, L2);
    expect(result.runs).toEqual(['RUN-20260930-1912-stub', 'RUN-20260930-1912-stub-2']);
    expect(lines[1]).toContain('--settings /tmp/orkeon-bench-run-2/.orkeon-bench/appsettings.json --mount /tmp/orkeon-bench-run-2/workspace:/workspace:ro');
    expect((await json<{ dataset: unknown }>(fileSystem, `${RUN}-2/manifest.json`)).dataset).toBeNull();
    expect((await json<{ runs: string[] }>(fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(result.runs);
  });

  it('takes the name of a run by creating its folder: a name another run took meanwhile is passed over', async () => {
    const { team, run, fileSystem } = await setup();
    fileSystem.addFile(`${RUN}/manifest.json`, '{"taken": "by a run started at the same moment"}');
    // The listing this run reads is the one from before the other run created its folder.
    const list = fileSystem.list.bind(fileSystem);
    fileSystem.list = async (path: string) => (path === RUNS ? [] : list(path));
    const result = await run.execute(team, L2);
    expect(result.runs).toEqual(['RUN-20260930-1912-stub-2']);
    expect(await fileSystem.readText(`${RUN}/manifest.json`)).toBe('{"taken": "by a run started at the same moment"}');
  });

  it('compares a deliverable that is not text byte for byte', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe]);
    const other = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xfd, 0xfc]);
    const checks = [{ id: 'same', type: 'matches-expected', path: '/output/a.png', expected: 'expected/output/a.png' }, { id: 'differs', type: 'matches-expected', path: '/output/b.png', expected: 'expected/output/b.png' }];
    const rig = await setup({
      scenarios: { 'images.scenario.json': smoke('images', { dataset: 'nominal', checks }) },
      during: ({ fileSystem }, line) => {
        fileSystem.addBytes(`${String(boundFolder(line, '/output'))}/a.png`, png).addBytes(`${String(boundFolder(line, '/output'))}/b.png`, other);
      },
    });
    rig.fileSystem.addBytes(`${DATASET}/expected/output/a.png`, png).addBytes(`${DATASET}/expected/output/b.png`, png);
    const result = await rig.run.execute(rig.team, L2);
    // Both readings as text are the same replacement characters: only the bytes tell them apart.
    expect(new TextDecoder().decode(png)).toBe(new TextDecoder().decode(other));
    expect(failures(scenariosOf(result.report)[0])).toEqual({ differs: '/output/b.png differs from expected/output/b.png (not text: compared byte for byte)' });
  });

  it('reads ACCEPTANCE.md: a criterion of a level that did not run stays not_run, a declared indicator is not computed', async () => {
    const acceptance = [
      '## Acceptance criteria',
      '',
      '| Id | Given | When | Then | Level | Status |',
      '|---|---|---|---|---|---|',
      '| AC-01 | nominal | runs | report | L2 component | active |',
      '| AC-02 | nominal | runs | quality | L3 e2e local | active |',
      '| AC-04 | nominal | runs | cost | L3 or L4 | active |',
      '',
      '## Indicators',
      '',
      '| Id | Measure | Unit | Threshold | Direction | Level |',
      '|---|---|---|---|---|---|',
      '| IND-01 | criteria passing | % | 100 | >= | L3 |',
    ].join('\n');
    const { team, run, fileSystem } = await setup({ files: { [`${WORKBOOK}/ACCEPTANCE.md`]: acceptance, [`${TESTS}/e2e/ac-02-quality.scenario.json`]: JSON.stringify({ id: 'ac-02-quality', level: 'e2e_local', covers: ['AC-02', 'AC-03'], checks: [{ id: 'c1', type: 'file-exists', path: '/output/x' }] }) } });
    const result = await run.execute(team, L2);
    expect(result.report.acceptance).toMatchObject({
      'AC-01': { status: 'pass', level: 'component' },
      'AC-02': { status: 'not_run', level: 'e2e_local', evidence: 'requires L3 (e2e_local), which did not run' },
      'AC-03': { status: 'not_run', level: 'e2e_local', evidence: 'not declared in ACCEPTANCE.md: nothing says at which level it is proven' },
      'AC-04': { status: 'not_run', level: 'e2e_remote', evidence: 'ACCEPTANCE.md gives no level the bench can read for it ("L3 or L4"): write one of L0 to L4' },
    });
    expect(result.report.indicators).toMatchObject({ 'IND-01': { value: null, threshold: 100, status: 'not_run' } });
    expect(result.report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: false });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'AC-03 is not proven: not declared in ACCEPTANCE.md: nothing says at which level it is proven',
        'AC-04 is not proven: ACCEPTANCE.md gives no level the bench can read for it ("L3 or L4"): write one of L0 to L4',
        'IND-01 not computed: indicators come with `orkeon-bench evaluate` — indicators_in_range stays false',
      ]),
    );
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).accepted).toBe(false);
    expect(await fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain('Not run, so not proven:\n\n- AC-02 — requires L3 (e2e_local), which did not run');
  });

  it('leaves a dropped criterion out of the report although a scenario still covers it, with a warning', async () => {
    const acceptance = ['## Acceptance criteria', '', '| Id | Given | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | nominal | runs | report | L2 | active |', '| AC-07 | nominal | runs | gone | L2 | dropped (DEC-0002) |'].join('\n');
    const { team, run, fileSystem } = await setup({ files: { [`${WORKBOOK}/ACCEPTANCE.md`]: acceptance }, scenarios: { 'ac-01-report.scenario.json': { ...SCENARIO, covers: ['AC-01', 'AC-07'] } } });
    const result = await run.execute(team, L2);
    expect(Object.keys(result.report.acceptance)).toEqual(['AC-01']);
    expect(result.report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect(result.warnings).toContain('AC-07 is dropped in ACCEPTANCE.md and still covered by ac-01-report: it is left out of the report — take it out of `covers`');
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).accepted).toBe(true);
  });

  it('proves no criterion without ACCEPTANCE.md, and says so', async () => {
    const { team, run, fileSystem } = await setup({ files: { [`${WORKBOOK}/ACCEPTANCE.md`]: null } });
    const result = await run.execute(team, L2);
    expect(result.failed).toBe(false);
    expect(result.report.acceptance).toEqual({ 'AC-01': { status: 'not_run', level: 'component', evidence: 'ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at' } });
    expect(result.report.verdict_input).toEqual({ all_ac_pass: false, all_inv_pass: false, indicators_in_range: true });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        `${WORKBOOK}/ACCEPTANCE.md does not exist: no criterion is proven without it — a criterion passes at the level ACCEPTANCE.md declares for it`,
        'AC-01 is not proven: ACCEPTANCE.md does not exist: nothing declares the level this criterion is proven at',
      ]),
    );
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).accepted).toBe(false);
  });

  it('accepts what a run of L2 proves when nothing else is declared: every criterion at L2 with a check, no invariant, no indicator', async () => {
    const acceptance = ['## Acceptance criteria', '', '| Id | Given | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | nominal | runs | report | L2 | active |'].join('\n');
    const { team, run, fileSystem } = await setup({ files: { [`${WORKBOOK}/ACCEPTANCE.md`]: acceptance }, scenarios: { 'ac-01-report.scenario.json': { ...SCENARIO, covers: ['AC-01'] } } });
    const result = await run.execute(team, L2);
    expect(result.report.verdict_input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).accepted).toBe(true);
  });
});

describe('RunTestLevels — what a killed run left', () => {
  it('names the sandboxes left under the temporary folder, and removes none', async () => {
    const { team, run, fileSystem } = await setup();
    fileSystem.addFile('/tmp/orkeon-bench-run-Ab12Cd/notes/a.md', 'x').addFile('/tmp/orkeon-bench-run-Zz99Yy/.owner', 'host:1');
    fileSystem.leftovers = [
      { path: '/tmp/orkeon-bench-run-Ab12Cd', ageSeconds: 42, owner: 'gone' },
      { path: '/tmp/orkeon-bench-run-Zz99Yy', ageSeconds: 3_600, owner: 'unknown' },
      { path: '/tmp/orkeon-tool-dump-Qq11Ww', ageSeconds: 3_600, owner: 'gone' },
    ];
    const result = await run.execute(team, L2);
    expect(result.warnings[0]).toBe(
      '2 sandboxes left by a run that was killed: /tmp/orkeon-bench-run-Ab12Cd (42 s old, the run that made it is gone), /tmp/orkeon-bench-run-Zz99Yy (60 min old) — an `orkeon run` it started may still be running on them: stop it, then remove the folders',
    );
    expect(await fileSystem.exists('/tmp/orkeon-bench-run-Ab12Cd/notes/a.md')).toBe(true);
    expect(result.failed).toBe(false);
    fileSystem.leftovers = [{ path: '/tmp/orkeon-bench-run-Ab12Cd', ageSeconds: 42, owner: 'gone' }];
    expect((await run.execute(team, STATIC_ONLY)).warnings[0]).toContain('1 sandbox left by a run that was killed: /tmp/orkeon-bench-run-Ab12Cd (42 s old, the run that made it is gone) — an `orkeon run` it started may still be running on it: stop it, then remove the folder');
  });
});

describe('RunTestLevels — symbolic links', () => {
  it('refuses a dataset that holds a link, naming it, before anything is copied', async () => {
    const { team, run, fileSystem, lines } = await setup();
    fileSystem.addLink(`${DATASET}/workspace/alias.md`, `${DATASET}/workspace/a.md`).addLink(`${DATASET}/expected/peek`, `${WORKSHOP}/settings/demo`);
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    expect(failures(scenariosOf(result.report)[0]).setup).toBe(
      `dataset "nominal" holds symbolic links (expected/peek, workspace/alias.md) in ${DATASET}: a dataset is plain files and folders — replace each link with a copy of what it points to`,
    );
    expect(scenariosOf(result.report)[0]?.run).toBeNull();
    expect(lines).toEqual([]);
    expect(await fileSystem.list('/tmp')).toEqual([]);
    expect(await fileSystem.exists(RUNS)).toBe(false);
  });

  it('refuses a dataset folder that is itself a link', async () => {
    const elsewhere = `${WORKSHOP}/settings/demo`;
    const { team, run, fileSystem } = await setup({ scenarios: { 'linked.scenario.json': smoke('linked', { dataset: 'linked' }) }, files: { [`${elsewhere}/secret.json`]: '{}' } });
    fileSystem.addLink(`${TESTS}/datasets/linked`, elsewhere);
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0]).setup).toContain('dataset "linked" holds a symbolic link (the dataset folder itself)');
  });

  it('neither archives nor follows a link the run left: what lies behind it does not exist for a check', async () => {
    const secret = `${WORKSHOP}/settings/demo/secret.json`;
    const checks = [
      { id: 'through-link', type: 'text-present', path: '/output/peek/secret.json', pattern: 'TOP-SECRET' },
      { id: 'the-link', type: 'file-exists', path: '/output/peek' },
      { id: 'plain', type: 'file-exists', path: '/output/report.md' },
    ];
    const { team, run, fileSystem } = await setup({
      scenarios: { 'links.scenario.json': smoke('links', { dataset: 'nominal', checks }) },
      files: { [secret]: '{"Secret":"TOP-SECRET"}' },
      during: ({ fileSystem: files }, line) => {
        files.addLink(`${String(boundFolder(line, '/output'))}/peek`, `${WORKSHOP}/settings/demo`);
      },
    });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toEqual({ 'through-link': '/output/peek/secret.json is not a file the run left', 'the-link': '/output/peek does not exist' });
    expect(await fileSystem.symbolicLinks(`${RUN}/output-snapshot`)).toEqual([]);
    expect(await fileSystem.list(`${RUN}/output-snapshot/output`)).toEqual(['report.md']);
    expect((await json<{ links_not_archived: string[] }>(fileSystem, `${RUN}/manifest.json`)).links_not_archived).toEqual(['/output/peek']);
  });

  it('does not follow a link planted in a read-only point either, and fails the read-only check', async () => {
    const { team, run } = await setup({
      scenarios: { 'ro-link.scenario.json': smoke('ro-link', { dataset: 'nominal', checks: [{ id: 'through-link', type: 'text-present', path: '/workspace/peek/secret.json', pattern: 'TOP' }] }) },
      files: { [`${WORKSHOP}/settings/demo/secret.json`]: 'TOP-SECRET' },
      during: ({ fileSystem: files }, line) => {
        files.addLink(`${String(boundFolder(line, '/workspace'))}/peek`, `${WORKSHOP}/settings/demo`);
      },
    });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toEqual({
      'through-link': '/workspace/peek/secret.json is not a file the run left',
      'read-only': 'the content of /workspace changed during the run: a read-only mount point was written',
    });
  });
});

describe('RunTestLevels — the design it measures', () => {
  it('retakes the snapshot at every run: it is the crew this run measured, with its digest in the run manifest', async () => {
    const { team, run, fileSystem } = await setup();
    const opened = await fileSystem.digest(`${ATTEMPT}/design-snapshot/crew`);
    await fileSystem.writeText(`${TEAM}/crew/agents/writer.yaml`, 'role: Writer\ngoal: changed by the build batch\n');
    await run.execute(team, L2);
    expect(await fileSystem.readText(`${ATTEMPT}/design-snapshot/crew/agents/writer.yaml`)).toBe('role: Writer\ngoal: changed by the build batch\n');
    const first = (await json<{ crew: { sha256: string } }>(fileSystem, `${RUN}/manifest.json`)).crew.sha256;
    expect(first).toBe((await fileSystem.digest(`${TEAM}/crew`)).sha256);
    expect(first).not.toBe(opened.sha256);
    await fileSystem.writeText(`${TEAM}/crew/tasks/write.yaml`, 'agent: writer\ndescription: again\n');
    await run.execute(team, L2);
    const second = (await json<{ crew: { sha256: string } }>(fileSystem, `${RUN}-2/manifest.json`)).crew.sha256;
    expect(second).toBe((await fileSystem.digest(`${ATTEMPT}/design-snapshot/crew`)).sha256);
    expect(second).not.toBe(first);
  });

  it('takes the design snapshot at the first run of an attempt opened before the crew', async () => {
    const { team, run, fileSystem } = await setup({ attemptBeforeCrew: true });
    expect((await json<{ design_snapshot: unknown }>(fileSystem, `${ATTEMPT}/manifest.json`)).design_snapshot).toBeNull();
    await run.execute(team, L2);
    expect((await json<{ design_snapshot: unknown }>(fileSystem, `${ATTEMPT}/manifest.json`)).design_snapshot).toBe('design-snapshot/');
    expect(await fileSystem.readText(`${ATTEMPT}/design-snapshot/crew/config.yaml`)).toBe('name: demo\n');
  });
});

describe('RunTestLevels — the report of an attempt is that of its last run', () => {
  it('says so in REPORT.md, and warns when a lower run replaces a report that reached a higher level', async () => {
    const { team, run, fileSystem } = await setup();
    const first = await run.execute(team, L2);
    expect(first.warnings.some((warning) => warning.includes('replaces'))).toBe(false);
    expect(await fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain('- Asked for: --level L2. The report of an attempt is that of its last run: this one replaces any earlier report of ATT-0001.');
    const second = await run.execute(team, STATIC_ONLY);
    expect(second.warnings).toContain(
      `this run reached L0 and replaces the report of 2026-09-30T19:12:00.000Z, which reached L2: the report of an attempt is that of its last run — its evidence stays in ${RUN}`,
    );
    expect(second.report.metadata).toMatchObject({ requested_level: 'static', replaces: { date: '2026-09-30T19:12:00.000Z', reached: 'component', runs: ['RUN-20260930-1912-stub'] } });
    expect(await fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain('- Replaces: the report of 2026-09-30T19:12:00.000Z, which reached L2 (its evidence stays in runs/RUN-20260930-1912-stub)');
    expect(pick(second.report.acceptance, 'AC-01')).toMatchObject({ status: 'not_run' });
    expect((await json<{ runs: string[] }>(fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(['RUN-20260930-1912-stub']);
    const third = await run.execute(team, L2);
    expect(third.warnings.some((warning) => warning.includes('replaces'))).toBe(false);
  });
});

describe('RunTestLevels — the attempt changes while a run is in flight', () => {
  it('writes nothing into an attempt closed meanwhile, and says where its runs stay', async () => {
    const { team, run, fileSystem } = await setup({
      during: async ({ fileSystem: files, team: demo }) => {
        await new CloseAttempt(files, new FixedClock(new Date('2026-10-01T08:00:00Z'))).execute(demo, 'ITERATE');
      },
    });
    await expect(run.execute(team, L2)).rejects.toMatchObject({
      code: 'invalid-input',
      message: `ATT-0001 was closed while this run was in flight: a closed attempt is immutable, the report was not written — its runs stay under ${RUNS}: RUN-20260930-1912-stub`,
    });
    expect(await json(fileSystem, `${ATTEMPT}/manifest.json`)).toMatchObject({ closed_at: '2026-10-01T08:00:00.000Z', verdict: 'ITERATE', runs: [] });
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
    expect(await fileSystem.exists(`${ATTEMPT}/REPORT.md`)).toBe(false);
    expect((await json<{ status: string }>(fileSystem, `${RUN}/manifest.json`)).status).toBe('pass');
  });

  it('keeps an approval recorded meanwhile, and adds only its runs to the manifest', async () => {
    const { team, run, fileSystem } = await setup({
      during: async ({ fileSystem: files, team: demo }) => {
        await new ApproveRemote(files, new FixedClock(new Date('2026-09-30T19:13:00Z'))).execute(demo, '1.5');
      },
    });
    await run.execute(team, L2);
    expect(await json(fileSystem, `${ATTEMPT}/manifest.json`)).toMatchObject({ closed_at: null, runs: ['RUN-20260930-1912-stub'], remote_approval: { estimated_usd: 1.5, cap_usd: 2 } });
  });

  it('loses the runs of neither of two runs that end one after the other', async () => {
    const first = await setup();
    await first.run.execute(first.team, L2);
    const other = new FakeLlmStub([[WRITER_REQUEST]]);
    const environment = new FakeEnvironment({ PATH: '/usr/bin' }, '/home/tester');
    const clock = new FixedClock(new Date('2026-09-30T19:12:00Z'));
    const second = new RunTestLevels(first.fileSystem, first.processes, clock, environment, UNKNOWN_MACHINE, new ScenarioRunner(first.fileSystem, first.processes, environment, clock, other, new ResolveProfile(first.fileSystem, environment)), new FakeShutdownSignal(false), '0.1.0');
    await second.execute(first.team, L2);
    expect((await json<{ runs: string[] }>(first.fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(['RUN-20260930-1912-stub', 'RUN-20260930-1912-stub-2']);
  });
});

describe('RunTestLevels — asked to stop', () => {
  const STOPPED: ProcessResult = { found: true, exitCode: null, stdout: `${event({ kind: 'run.started', target: 'crew' })}\n`, stderr: '', stopped: 'cancelled' };

  it('stops the scenario in flight, removes the sandbox, leaves a run manifest that says interrupted, and no report', async () => {
    const { team, run, fileSystem, stub, shutdown } = await setup({ commands: { 'orkeon run crew --events jsonl': STOPPED }, during: ({ shutdown: signal }) => signal.request() });
    await expect(run.execute(team, L2)).rejects.toMatchObject({
      name: 'InterruptedError',
      code: 'interrupted',
      run: 'RUN-20260930-1912-stub',
      message: `interrupted while scenario ac-01-report was running: orkeon run and what it started were stopped, the sandbox removed; ${RUN} keeps what the run left`,
    });
    expect(await fileSystem.exists(SANDBOX)).toBe(false);
    expect(stub.stopped).toBe(1);
    expect(shutdown.released).toBe(1);
    expect(await json(fileSystem, `${RUN}/manifest.json`)).toMatchObject({ status: 'interrupted', stopped: 'cancelled', exit_code: null, scenario: 'ac-01-report' });
    expect(await fileSystem.readText(`${RUN}/events.jsonl`)).toBe(STOPPED.stdout);
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
    expect((await json<{ runs: string[] }>(fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(['RUN-20260930-1912-stub']);
  });

  it('starts no further scenario once asked to stop, and lists the runs that ended', async () => {
    const { team, run, fileSystem, lines } = await setup({
      scenarios: { 'a-first.scenario.json': smoke('a-first'), 'b-second.scenario.json': smoke('b-second') },
      requests: [[WRITER_REQUEST], [WRITER_REQUEST]],
      during: ({ shutdown: signal }) => signal.request(),
    });
    await expect(run.execute(team, L2)).rejects.toMatchObject({ code: 'interrupted', run: null, message: 'interrupted between two scenarios: nothing was left running, no report was written' });
    expect(lines).toHaveLength(1);
    expect((await json<{ runs: string[] }>(fileSystem, `${ATTEMPT}/manifest.json`)).runs).toEqual(['RUN-20260930-1912-stub']);
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
  });

  it('stops a static check in flight with everything it started', async () => {
    const { team, run, processes, fileSystem } = await setup({ commands: { 'orkeon run crew --validate': { found: true, exitCode: null, stdout: '', stderr: '', stopped: 'cancelled' } } });
    await expect(run.execute(team, L2)).rejects.toMatchObject({ code: 'interrupted', message: 'interrupted during the static checks (orkeon run was stopped)' });
    const validate = processes.calls.findIndex((call) => call.args.includes('--validate'));
    expect(processes.options[validate]).toMatchObject({ ownGroup: true });
    expect(processes.options[validate]?.cancel).toBeInstanceOf(Promise);
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
  });
});

describe('RunTestLevels — what it refuses', () => {
  it('refuses, before anything starts, a level above L2, L1, no level and another profile', async () => {
    const { team, run, processes, fileSystem } = await setup();
    const calls = processes.calls.length;
    for (const [options, reason] of [
      [{ ...L2, maxLevel: 'e2e_local' }, 'level L3: this version runs L0 to L2 — pass --level L2'],
      [{ ...L2, maxLevel: 'e2e_remote' }, 'level L4: this version runs L0 to L2 — pass --level L2'],
      [{ ...L2, maxLevel: 'unit' }, 'level L1: unit tests are not run by this version — pass --level L0, or --level L2 (L1 is then reported skipped)'],
      [{ ...L2, maxLevel: null }, 'without --level a run reaches L4: this version runs L0 to L2 — pass --level L2'],
      [{ ...L2, profile: 'claude' }, 'profile "claude": this version runs with the simulated LLM only (--profile stub, the default up to L2)'],
    ] as [RunOptions, string][]) {
      await expect(run.execute(team, options), reason).rejects.toMatchObject({ code: 'not-implemented', message: `run: not implemented yet (lot 4): ${reason}` });
    }
    expect(processes.calls).toHaveLength(calls);
    expect(await fileSystem.exists(`${ATTEMPT}/report.json`)).toBe(false);
  });

  it('needs a team folder, an open attempt and orkeon', async () => {
    const { team, run, fileSystem } = await setup();
    await expect(run.execute(teamRefInWorkshop(WORKSHOP, 'early'), L2)).rejects.toMatchObject({ code: 'file-not-found', message: `nothing to run: ${WORKSHOP}/teams/early does not exist yet (the first build batch creates it, D35)` });
    await new CloseAttempt(fileSystem, new FixedClock(new Date('2026-10-01T08:00:00Z'))).execute(team);
    await expect(run.execute(team, L2)).rejects.toThrow('no open attempt for demo: open one with `orkeon-bench attempt open demo`');
    const missing = await setup({ commands: { 'orkeon --version': failed(127, 'not found') } });
    await expect(missing.run.execute(missing.team, { ...L2, profile: 'stub' })).rejects.toMatchObject({ code: 'process-failed', message: 'orkeon --version gave no version: is orkeon on PATH?' });
  });
});

describe('RunTestLevels — the static level', () => {
  it('stops at a red L0, and goes on with --continue', async () => {
    const first = await setup();
    await first.fileSystem.writeText(`${TEAM}/run.sh`, '#!/bin/sh\n');
    first.fileSystem.addFile(`${TEAM}/studio-team.json`, '{"name":"demo","mounts":[]}');
    const result = await first.run.execute(first.team, L2);
    expect(result.failed).toBe(true);
    expect(result.levels).toEqual([
      { level: 'static', status: 'fail', note: '' },
      { level: 'unit', status: 'skipped', note: 'not run: L1 is not implemented yet (lot 4)' },
      { level: 'component', status: 'skipped', note: 'not run: L0 is red' },
    ]);
    expect(result.runs).toEqual([]);
    expect(first.lines).toEqual([]);
    expect(staticChecks(result.report).launchers).toBe('fail: run.sh, studio-team.json (mounts) not in step with mounts.json: run `orkeon-bench scaffold demo`');
    expect(result.report.acceptance).toEqual({ 'AC-01': { status: 'not_run', level: 'component', evidence: 'requires L2 (component), which did not run' } });
    expect(await first.fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain('- static check `launchers` — run.sh, studio-team.json (mounts) not in step');

    const second = await setup();
    await second.fileSystem.remove(`${TEAM}/run.cmd`);
    const continued = await second.run.execute(second.team, { ...L2, continueAfterRed: true });
    expect(continued.levels.map((entry) => entry.status)).toEqual(['fail', 'skipped', 'pass']);
    expect(continued.failed).toBe(true);
    expect(continued.runs).toHaveLength(1);
  });

  it('fails on a crew or a mounts.json it cannot read, and runs nothing even with --continue', async () => {
    const { team, run, fileSystem } = await setup();
    await fileSystem.remove(`${TEAM}/mounts.json`);
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    const checks = staticChecks(result.report);
    expect(checks.mounts).toBe(`fail: mounts.json not found: ${TEAM}/mounts.json`);
    expect(checks.launchers).toBe('skipped: needs a readable mounts.json and crew');
    expect(checks['orkeon-validate']).toBe('skipped: needs a readable mounts.json and crew');
    expect(result.levels[2]).toEqual({ level: 'component', status: 'skipped', note: 'not run: the crew or its mounts.json cannot be read' });

    const noCrew = await setup();
    await noCrew.fileSystem.remove(`${TEAM}/crew`);
    const second = await noCrew.run.execute(noCrew.team, STATIC_ONLY);
    expect(Object.entries(staticChecks(second.report)).filter(([, status]) => !status.startsWith('pass')).map(([id, status]) => `${id}:${status.split(':')[0] ?? ''}`)).toEqual([
      'crew-layout:fail',
      'launchers:skipped',
      'check-script:skipped',
      'orkeon-validate:skipped',
    ]);
  });

  it('fails on what orkeon run --validate refuses, an invalid bench configuration and an invalid scenario', async () => {
    const { team, run } = await setup({
      commands: { 'orkeon run crew --validate': failed(1, "VALIDATION FAILED: crew\nCrew configuration references unknown tool(s): 'nope'") },
      files: { [`${TESTS}/bench.config.json`]: '{"levels": {"e2e_local": {"profile": "ghost"}}}', [`${TESTS}/e2e/broken.scenario.json`]: '{"id": "Broken"}' },
    });
    const result = await run.execute(team, STATIC_ONLY);
    const checks = staticChecks(result.report);
    expect(checks['orkeon-validate']).toBe("fail: exit 1 · VALIDATION FAILED: crew · Crew configuration references unknown tool(s): 'nope'");
    expect(checks['bench-config']).toContain('fail: invalid bench.config.json: levels.e2e_local.profile: unknown profile "ghost"');
    expect(checks.scenarios).toContain('fail: invalid e2e/broken.scenario.json: id: expected a kebab-case id');
    expect(result.levels).toEqual([{ level: 'static', status: 'fail', note: '' }]);
    expect(result.report.levels.unit).toMatchObject({ status: 'skipped', note: 'not requested' });
    expect(result.report.levels.component).toMatchObject({ status: 'skipped', note: 'not requested' });
  });

  it('fails on a scenario that covers ids without a check, and never passes it', async () => {
    const empty = { ...SCENARIO, checks: [] };
    const { team, run } = await setup({ scenarios: { 'ac-01-report.scenario.json': empty } });
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    const refusal = 'checks: the scenario covers AC-01, INV-FS and declares no check: a scenario proves an id by a check, never by running';
    expect(staticChecks(result.report).scenarios).toBe(`fail: invalid component/ac-01-report.scenario.json: ${refusal}`);
    expect(scenariosOf(result.report)[0]).toMatchObject({ status: 'fail', run: null, checks: [{ id: 'setup', status: 'fail', detail: `invalid component/ac-01-report.scenario.json: ${refusal}` }] });
    expect(result.report.verdict_input.all_ac_pass).toBe(false);
    expect(result.failed).toBe(true);
  });

  it('fails on a scenario file no run would pick up: in a sub-folder, in another case, or beside the folders', async () => {
    const { team, run } = await setup({
      files: {
        [`${TESTS}/component/sub/ac-02-deep.scenario.json`]: JSON.stringify(smoke('ac-02-deep')),
        [`${TESTS}/component/AC-03.SCENARIO.JSON`]: JSON.stringify(smoke('ac-03')),
        [`${TESTS}/ac-04-beside.scenario.json`]: JSON.stringify(smoke('ac-04-beside')),
        [`${TESTS}/datasets/nominal/workspace/data.scenario.json`]: '{}',
      },
    });
    const result = await run.execute(team, L2);
    expect(staticChecks(result.report).scenarios).toBe(
      'fail: no run picks up ac-04-beside.scenario.json, component/AC-03.SCENARIO.JSON, component/sub/ac-02-deep.scenario.json: a scenario is a file component/<name>.scenario.json or e2e/<name>.scenario.json, named in lower case',
    );
    expect(result.failed).toBe(true);
    expect(result.levels[2]).toMatchObject({ status: 'skipped', note: 'not run: L0 is red' });
  });

  it('reads a scenario and a bench configuration saved with a byte order mark', async () => {
    const { team, run } = await setup({
      scenarios: { 'ac-01-report.scenario.json': `﻿${JSON.stringify(SCENARIO)}` },
      files: { [`${TESTS}/bench.config.json`]: '﻿{"budget": {"remote_usd_max": 2}}' },
    });
    const result = await run.execute(team, L2);
    expect(result.failed).toBe(false);
    expect(staticChecks(result.report)).toMatchObject({ scenarios: 'pass: ', 'bench-config': 'pass: ' });
  });

  it('fails at L0, once, on a settings file Orkeon reads and the bench does not: a comment, a trailing comma, a key written twice', async () => {
    const own = `${WORKSHOP}/settings/demo/appsettings.json`;
    const cases: [string, string][] = [
      ['{\n  // the model of the team\n  "Llm": { "BaseUrl": "http://localhost:11434" }\n}\n', 'line 2: a comment'],
      ['{\n  "Llm": { "BaseUrl": "http://localhost:11434", },\n}\n', 'line 2: a trailing comma'],
      ['{\n  "Llm": { "Model": "m" },\n  "Orkeon": { "Tools": {} },\n  "Llm": { "BaseUrl": "https://api.example.com" }\n}\n', 'line 4: the key "Llm" written twice'],
    ];
    for (const [content, offence] of cases) {
      const refusal = `${own} is not strict JSON — ${offence}. Orkeon accepts it; the bench and the run gate read a settings file as strict JSON — no comment, no trailing comma, no key written twice — and judge a run on what they read: rewrite the file strictly`;
      const stopped = await setup({ files: { [own]: content }, scenarios: { 'a.scenario.json': smoke('a'), 'b.scenario.json': smoke('b') }, requests: [[WRITER_REQUEST], [WRITER_REQUEST]] });
      const result = await stopped.run.execute(stopped.team, L2);
      expect(staticChecks(result.report).settings, offence).toBe(`fail: ${refusal}`);
      expect(result.levels.map((entry) => entry.status)).toEqual(['fail', 'skipped', 'skipped']);
      expect(stopped.lines).toEqual([]);
      // With --continue each scenario still stops at its set-up, on the same sentence: nothing runs on a file read otherwise than Orkeon reads it.
      const continued = await setup({ files: { [own]: content }, scenarios: { 'a.scenario.json': smoke('a') } });
      const second = await continued.run.execute(continued.team, { ...L2, continueAfterRed: true });
      expect(failures(scenariosOf(second.report)[0]).setup).toBe(refusal);
      expect(continued.lines).toEqual([]);
    }
  });

  it('checks the settings file the run would read: the machine file for a team without its own', async () => {
    const machine = await setup({ files: { [USER_SETTINGS]: '{ "Llm": { "Model": "m" }, /* local */ "RateLimiting": {} }' } });
    expect(staticChecks((await machine.run.execute(machine.team, STATIC_ONLY)).report).settings).toContain(`fail: ${USER_SETTINGS} is not strict JSON — line 1: a comment.`);
    const fine = await setup({ files: { [USER_SETTINGS]: '{ "Llm": { "Model": "m" } }', [`${WORKSHOP}/settings/demo/appsettings.json`]: '{ "Llm": {} }' } });
    expect(staticChecks((await fine.run.execute(fine.team, STATIC_ONLY)).report).settings).toBe('pass: ');
    const broken = await setup({ files: { [`${WORKSHOP}/settings/demo/appsettings.json`]: '{ nope' } });
    expect(staticChecks((await broken.run.execute(broken.team, STATIC_ONLY)).report).settings).toContain('is not valid JSON');
  });

  it('runs the check script of the generator skill when the workshop has it', async () => {
    const pass = await setup({ files: { [CHECK_SCRIPT]: '' }, commands: { python3: succeeded('OK\n') } });
    const passed = await pass.run.execute(pass.team, STATIC_ONLY);
    expect(passed.warnings.some((warning) => warning.includes('check-script'))).toBe(false);
    expect(pass.processes.calls.find((call) => call.command === 'python3')?.args).toEqual([CHECK_SCRIPT, TEAM, '--orkeon', 'orkeon']);

    const fail = await setup({ files: { [CHECK_SCRIPT]: '' }, commands: { python3: { found: true, exitCode: 1, stdout: 'ERROR crew/agents/writer.yaml: unknown key "rol"\n1 error\n', stderr: '' } } });
    const failedRun = await fail.run.execute(fail.team, STATIC_ONLY);
    expect(staticChecks(failedRun.report)['check-script']).toBe('fail: exit 1 · ERROR crew/agents/writer.yaml: unknown key "rol" · 1 error');

    const absent = await setup({ files: { [CHECK_SCRIPT]: '' } });
    expect((await absent.run.execute(absent.team, STATIC_ONLY)).warnings).toContain('static check check-script skipped: python3 not found on PATH');
  });

  it('starts a TypeScript crew by its script and says tsc was not run', async () => {
    const { team, run, lines } = await setup({ typescript: true, commands: { 'orkeon run crew/crew.ork.ts --events jsonl': RAN } });
    const result = await run.execute(team, L2);
    expect(lines[0]).toContain(`orkeon run crew/crew.ork.ts --events jsonl --settings ${SETTINGS} --mount`);
    expect(result.warnings).toContain('static check tsc skipped: the TypeScript compiler is not run by this version of the bench: run `tsc -p` on the team by hand');
    expect(result.failed).toBe(false);
  });
});

describe('RunTestLevels — a level that ran nothing', () => {
  it('is red: L2 asked for and no scenario is not a success', async () => {
    const { team, run, fileSystem } = await setup({ scenarios: {}, files: { [`${TESTS}/unit/score.test.ts`]: '' } });
    const result = await run.execute(team, L2);
    const note = `no scenario in ${TESTS}/component: L2 was asked for and ran nothing`;
    expect(result.levels[2]).toEqual({ level: 'component', status: 'fail', note });
    expect(result.failed).toBe(true);
    expect(result.report.levels.component).toMatchObject({ status: 'fail', scenarios: [], note });
    expect(result.warnings).toEqual(expect.arrayContaining([`L1 skipped: 1 entry in ${TESTS}/unit not run — L1 is not implemented yet (lot 4)`, 'static check scenarios skipped: no .scenario.json file under /home/tester/Orkeon/tests/demo']));
    expect(result.report.verdict_input.all_ac_pass).toBe(false);
    expect(await fileSystem.readText(`${ATTEMPT}/REPORT.md`)).toContain(`## What fails\n\n- L2 — ${note}`);
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).valid).toBe(true);
  });

  it('is not asked of a run that stops at L0', async () => {
    const { team, run } = await setup({ scenarios: {} });
    const result = await run.execute(team, STATIC_ONLY);
    expect(result.failed).toBe(false);
    expect(result.levels).toEqual([{ level: 'static', status: 'pass', note: '' }]);
  });
});

describe('RunTestLevels — a red scenario', () => {
  it('fails on a failed run, an unscripted request and a check that does not hold', async () => {
    const { team, run, fileSystem } = await setup({
      commands: { 'orkeon run crew --events jsonl': { found: true, exitCode: 2, stdout: FAILED_EVENTS, stderr: 'ERROR: Task 01 (Writer) failed\n' } },
      requests: [[{ path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: 'You are Reader.\n' }] } }]],
      writes: {},
    });
    const result = await run.execute(team, L2);
    expect(result.failed).toBe(true);
    expect(result.levels[2]).toMatchObject({ status: 'fail' });
    expect(failures(scenariosOf(result.report)[0])).toEqual({
      run: 'orkeon run exited 2; run.finished reports a failure; Task 01 (Writer) failed',
      stub: 'request 1: no rule of the script matches this request (role "Reader")',
      c1: '/output/report.md does not exist',
      c2: '/output/report.md is not a file the run left',
      c4: 'file_read was never called',
    });
    expect(pick(result.report.acceptance, 'AC-01')).toMatchObject({ status: 'fail', evidence: 'failed: ac-01-report (RUN-20260930-1912-stub)' });
    expect(pick(result.report.invariants, 'INV-FS')).toMatchObject({ status: 'fail', note: 'a scenario that covers it failed' });
    expect((await json<{ status: string; exit_code: number }>(fileSystem, `${RUN}/manifest.json`)).status).toBe('fail');
    expect((await new ValidateReport(fileSystem).execute(`${ATTEMPT}/report.json`)).valid).toBe(true);
  });

  it('fails a scenario it cannot set up, without a run folder, and goes on with the next', async () => {
    const { team, run, lines, fileSystem, stub } = await setup({
      scenarios: {
        'a-broken.scenario.json': '{ nope',
        'b-invalid.scenario.json': { id: 'B' },
        'c-level.scenario.json': smoke('c-level', { level: 'e2e_local' }),
        'd-no-script.scenario.json': { id: 'd-no-script', level: 'component', covers: ['AC-02'], checks: [{ id: 'c1', type: 'tool-called', tool: 'file_read' }] },
        'e-no-dataset.scenario.json': smoke('e-no-dataset', { dataset: 'ghost' }),
        'f-unknown-root.scenario.json': smoke('f-unknown-root', { dataset: 'nominal', bindings: { '/mailbox': 'mailbox' } }),
        'g-no-folder.scenario.json': smoke('g-no-folder', { dataset: 'nominal', bindings: { '/workspace': 'elsewhere' } }),
        'h-bound-without-dataset.scenario.json': smoke('h-bound-without-dataset', { bindings: { '/workspace': 'workspace' } }),
        'i-script-file.scenario.json': smoke('i-script-file', { llm_stub: 'gone.json' }),
        'j-paid-model.scenario.json': smoke('j-paid-model', { llm_stub: { replies: [{ turns: [{ tool_calls: [{ name: 'image_generation', arguments: { prompt: 'a cat' } }] }, { content: 'ok' }] }] } }),
        'k-expected.scenario.json': smoke('k-expected', { dataset: 'nominal', bindings: { '/workspace': 'expected/output' } }),
        'z-fine.scenario.json': smoke('z-fine'),
      },
    });
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    const scenarios = scenariosOf(result.report);
    expect(Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.run === null ? failures(scenario).setup : scenario.status]))).toEqual({
      'a-broken': expect.stringContaining('is not valid JSON'),
      'b-invalid': expect.stringContaining('invalid component/b-invalid.scenario.json: id: expected a kebab-case id'),
      'c-level': 'level is e2e_local: a scenario of component/ is a component scenario',
      'd-no-script': `${TESTS}/component/d-no-script.scenario.json has no reply script: set llm_stub to a script, or to the file that holds one`,
      'e-no-dataset': `dataset "ghost" not found: neither ${TESTS}/datasets/ghost nor ${WORKSHOP}/library/datasets/ghost exists`,
      'f-unknown-root': 'bindings name /mailbox, which mounts.json does not declare (declared: /workspace, /output, /state)',
      'g-no-folder': `/workspace is bound to ${DATASET}/elsewhere, which is not a folder of the dataset`,
      'h-bound-without-dataset': '/workspace is bound to "workspace" but the scenario names no dataset',
      'i-script-file': expect.stringContaining(`reply script not found: ${TESTS}/component/gone.json`),
      'j-paid-model': 'the reply script calls image_generation, which calls a paid model of its own when it runs: no place in a run on the simulated LLM',
      'k-expected': expect.stringContaining('bindings./workspace: "expected/output" is where the dataset keeps the expected outputs'),
      'z-fine': 'pass',
    });
    expect(lines).toHaveLength(1);
    expect(stub.scripts).toHaveLength(1);
    expect(result.runs).toEqual(['RUN-20260930-1912-stub']);
    expect(await fileSystem.list(RUNS)).toEqual(['RUN-20260930-1912-stub']);
    expect(await fileSystem.list('/tmp')).toEqual([]);
    expect(pick(result.report.acceptance, 'AC-02')).toMatchObject({ status: 'fail', evidence: 'failed: d-no-script' });
    expect(result.failed).toBe(true);
  });

  it('creates no run folder when the set-up fails at its last step, and removes the sandbox', async () => {
    const { team, run, fileSystem, stub, lines } = await setup({ files: { [`${TESTS}/bench.config.json`]: '{\n  // the cap\n  "budget": { "remote_usd_max": 2.0 }\n}\n' } });
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    expect(failures(scenariosOf(result.report)[0]).setup).toContain(`${TESTS}/bench.config.json is not valid JSON`);
    expect(scenariosOf(result.report)[0]?.run).toBeNull();
    expect(lines).toEqual([]);
    expect(await fileSystem.exists(RUNS)).toBe(false);
    expect(await fileSystem.list('/tmp')).toEqual([]);
    expect(stub.stopped).toBe(1);
  });

  it('says what happened when the bench stopped the run itself: out of time, too much output', async () => {
    const stoppedBy = async (stopped: 'timeout' | 'output-limit'): Promise<{ detail: string | undefined; manifest: Record<string, unknown> }> => {
      const { team, run, fileSystem } = await setup({
        scenarios: { 'ac-01-report.scenario.json': { ...SCENARIO, timeout_seconds: 3 } },
        commands: { 'orkeon run crew --events jsonl': { found: true, exitCode: null, stdout: '', stderr: '', stopped } },
        requests: [[WRITER_REQUEST]],
      });
      const result = await run.execute(team, L2);
      return { detail: failures(scenariosOf(result.report)[0]).run, manifest: await json(fileSystem, `${RUN}/manifest.json`) };
    };
    const timeout = await stoppedBy('timeout');
    expect(timeout.detail).toBe('orkeon run was stopped after 3 s, the time the scenario allows (timeout_seconds): it had not finished; no run.finished event');
    expect(timeout.manifest).toMatchObject({ stopped: 'timeout', status: 'fail', exit_code: null });
    const output = await stoppedBy('output-limit');
    expect(output.detail).toBe('orkeon run was stopped: it printed more than 8 MB on its standard streams, more than the bench keeps; no run.finished event');
    expect(output.manifest).toMatchObject({ stopped: 'output-limit' });
  });

  it('fails a scenario when orkeon is gone or ends without an exit code', async () => {
    const { team, run } = await setup({ commands: { 'orkeon run crew --events jsonl': { found: false, exitCode: null, stdout: '', stderr: '' } }, requests: [[]] });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toMatchObject({
      setup: 'orkeon not found on PATH',
      run: 'orkeon run ended without an exit code (killed by a signal); no run.finished event',
      stub: 'the simulated LLM received no request: the run did not reach it',
    });
  });

  it('fails a scenario whose run changed a read-only point, and leaves the dataset as it was', async () => {
    const { team, run, fileSystem } = await setup({
      during: ({ fileSystem: files }, line) => {
        files.addFile(`${String(boundFolder(line, '/workspace'))}/a.md`, 'PWNED\n');
      },
    });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toEqual({
      c3: '/workspace/a.md does not hold /launch/i',
      'read-only': 'the content of /workspace changed during the run: a read-only mount point was written',
    });
    expect(await fileSystem.readText(`${DATASET}/workspace/a.md`)).toBe('The launch is on Tuesday.\n');
  });

  it('expects a tool call to have succeeded unless the check says otherwise', async () => {
    const refused = [event({ kind: 'tool.called', correlationId: 'a', toolName: 'file_write' }), event({ kind: 'tool.returned', correlationId: 'a', success: false }), event({ kind: 'run.finished', success: true, exitCode: 0 }), ''].join('\n');
    const checks = [{ id: 'succeeded', type: 'tool-called', tool: 'file_write' }, { id: 'refused', type: 'tool-called', tool: 'file_write', outcome: 'failure' }];
    const { team, run } = await setup({ scenarios: { 'inv-fs.scenario.json': smoke('inv-fs', { checks }) }, commands: { 'orkeon run crew --events jsonl': { ...RAN, stdout: refused } } });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toEqual({ succeeded: 'file_write was called 1 time(s) and no call succeeded (tool.returned)' });
  });

  it('reads a file through a read-only point, and nothing through a point it does not know or the expected folder', async () => {
    const { team, run } = await setup({
      scenarios: {
        'paths.scenario.json': smoke('paths', {
          dataset: 'nominal',
          checks: [
            { id: 'input', type: 'file-exists', path: '/workspace/a.md' },
            { id: 'folder', type: 'text-present', path: '/workspace/sub', pattern: 'x' },
            { id: 'unknown', type: 'file-exists', path: '/mailbox/a.eml' },
            { id: 'expected', type: 'matches-expected', path: '/output/report.md', expected: 'expected/output' },
          ],
        }),
      },
      files: { [`${DATASET}/workspace/sub/b.md`]: 'x' },
    });
    const result = await run.execute(team, L2);
    expect(failures(scenariosOf(result.report)[0])).toEqual({
      folder: '/workspace/sub is not a file the run left',
      unknown: '/mailbox/a.eml does not exist',
      expected: 'the expected file expected/output is missing from the dataset',
    });
  });
});
