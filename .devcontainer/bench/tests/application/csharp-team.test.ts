import { describe, expect, it } from 'vitest';

import type { ProcessResult } from '../../src/application/ports/process-runner.js';
import { ScenarioRunner } from '../../src/application/runs/run-scenario.js';
import { OpenAttempt } from '../../src/application/use-cases/open-attempt.js';
import { ResolveProfile } from '../../src/application/use-cases/resolve-profile.js';
import { RunTestLevels, type RunOptions } from '../../src/application/use-cases/run-test-levels.js';
import { ScaffoldTeam } from '../../src/application/use-cases/scaffold-team.js';
import { UNKNOWN_MACHINE } from '../../src/domain/mounts/mount-reach.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeLlmStub, FakeShutdownSignal } from '../fakes/fake-llm-stub.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { FakeSchemaValidator } from '../fakes/fake-schema-validator.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { WORKSHOP, demoTeam } from '../fakes/fixture-team.js';

const TEAM = `${WORKSHOP}/teams/demo`;
const TESTS = `${WORKSHOP}/tests/demo`;
const HOST = `${TEAM}/host`;
const PROJECT = 'src/Demo.Host';
const HOST_RUN = `dotnet run --project ${PROJECT} -c Release --no-build -- --team-dir ${TEAM}`;
const L2: RunOptions = { maxLevel: 'component', profile: null, continueAfterRed: false };

const event = (value: Record<string, unknown>): string => JSON.stringify({ v: 2, ...value });
const EVENTS = [
  event({ kind: 'run.started', target: 'crew' }),
  event({ kind: 'tool.called', correlationId: 'a', toolName: 'pilot_tool' }),
  event({ kind: 'tool.returned', correlationId: 'a', toolName: 'pilot_tool', success: true }),
  event({ kind: 'task.completed', agentRole: 'Writer', success: true, skipped: false }),
  event({ kind: 'run.finished', success: true, exitCode: 0, promptTokens: 30, completionTokens: 15, durationMs: 800 }),
  '',
].join('\n');
const WRITER_REQUEST = { path: '/v1/chat/completions', body: { messages: [{ role: 'system', content: 'You are Writer.\n' }, { role: 'user', content: 'Task:\nWrite the report' }] } };
const SCENARIO = {
  id: 'ac-01-report',
  level: 'component',
  llm_stub: { replies: [{ match: { role: 'Writer' }, turns: [{ content: '# Report\n' }] }] },
  checks: [
    { id: 'c1', type: 'file-exists', path: '/output/report.md' },
    { id: 'c2', type: 'tool-called', tool: 'pilot_tool' },
  ],
};
const TEST_SUMMARY = 'Test run summary: Passed!\n  total: 12\n  failed: 0\n  succeeded: 12\n  skipped: 0\n  duration: 3s 120ms\n';
const RUN_SH = `#!/usr/bin/env bash\ncd "$DIR/host"\nexec dotnet run --project ${PROJECT} -c Release -- --team-dir "$DIR" "$@"\n`;
const RUN_CMD = `@echo off\r\ncd /d "%DIR%\\host"\r\ndotnet run --project src\\Demo.Host -c Release -- --team-dir "%DIR%" %*\r\n`;

interface Setup {
  commands?: Record<string, ProcessResult>;
  files?: Record<string, string>;
}

/** A C# team as `new-team.sh` writes it: `host/` with its solution and host project, a YAML crew, its launchers. */
async function setup(options: Setup = {}) {
  const { team, fileSystem } = demoTeam();
  fileSystem
    .addFile(`${HOST}/Demo.sln`, '')
    .addFile(`${HOST}/${PROJECT}/Demo.Host.csproj`, '<Project />\n')
    .addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n')
    .addFile(`${TEAM}/crew/agents/writer.yaml`, 'role: Writer\n')
    .addFile(`${TEAM}/crew/tasks/write.yaml`, 'agent: writer\n')
    .addFile(`${TEAM}/run.sh`, RUN_SH)
    .addFile(`${TEAM}/run.cmd`, RUN_CMD)
    .addFile(`${TESTS}/component/ac-01-report.scenario.json`, JSON.stringify(SCENARIO));
  for (const [path, content] of Object.entries(options.files ?? {})) {
    fileSystem.addFile(path, content);
  }
  const clock = new FixedClock(new Date('2026-09-30T19:12:00Z'));
  const lines: string[] = [];
  const settings: string[] = [];
  const processes = new FakeProcessRunner(
    {
      'orkeon --version': succeeded('orkeon 1.0.0-rc.6.src.20261101.gc727c06'),
      'dotnet build -c Release': succeeded('Build succeeded.\n    0 Warning(s)\n'),
      [`${HOST_RUN} --validate`]: succeeded('VALIDATION OK: crew (agents=1, tasks=1, tools resolved=1)\n'),
      'dotnet test -c Release --no-build': succeeded(TEST_SUMMARY),
      [`${HOST_RUN} --list-tools`]: succeeded('file_read\nfile_write\npilot_tool\n'),
      [`${HOST_RUN} --events -`]: { found: true, exitCode: 0, stdout: EVENTS, stderr: '# Report\n' },
      ...options.commands,
    },
    async (line) => {
      if (line.startsWith(`${HOST_RUN} --events -`)) {
        lines.push(line);
        const file = / --settings (\S+)/.exec(line)?.[1];
        if (file !== undefined) {
          settings.push(await fileSystem.readText(file));
        }
        const output = new RegExp('(\\S+):/output:rw').exec(line)?.[1];
        fileSystem.addFile(`${String(output)}/report.md`, '# Report\n');
      }
    },
  );
  await new OpenAttempt(fileSystem, processes, clock).execute(team, 'team-build');
  const environment = new FakeEnvironment({ PATH: '/usr/bin' }, '/home/tester');
  const scenarioRunner = new ScenarioRunner(fileSystem, processes, environment, clock, new FakeLlmStub([[WRITER_REQUEST]]), new ResolveProfile(fileSystem, environment), new FakeSchemaValidator());
  const run = new RunTestLevels(fileSystem, processes, clock, environment, UNKNOWN_MACHINE, scenarioRunner, new FakeShutdownSignal(false), '0.1.0');
  return { team, fileSystem, processes, run, lines, settings };
}

describe('RunTestLevels — a C# team (host/)', () => {
  it('builds the host, validates it, runs its tests at L1, and runs the scenarios through it at L2', async () => {
    const { team, processes, run, lines } = await setup();
    const result = await run.execute(team, L2);

    expect(result.levels).toEqual([
      { level: 'static', status: 'pass', note: '' },
      { level: 'unit', status: 'pass', note: 'dotnet test: 12 tests, 0 failed' },
      { level: 'component', status: 'pass', note: '' },
    ]);
    const checks = result.report.levels.static.checks as { id: string; status: string; detail: string }[];
    expect(checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      'mounts:pass',
      'crew-layout:pass',
      'launchers:pass',
      'bench-config:pass',
      'settings:pass',
      'scenarios:pass',
      'check-script:skipped',
      'dotnet-build:pass',
      'host-validate:pass',
    ]);
    const commands = processes.calls.map((call) => [call.command, ...call.args].join(' '));
    expect(commands.some((line) => line.startsWith('orkeon run'))).toBe(false);
    const host = processes.options.filter((_, index) => processes.calls[index]?.command === 'dotnet');
    expect(host.every((option) => option.cwd === HOST && option.env?.DOTNET_CLI_UI_LANGUAGE === 'en')).toBe(true);

    expect(lines).toHaveLength(1);
    const line = lines[0] as string;
    expect(line).toMatch(/ --events - --settings \S+\/appsettings\.json --mount /);
    expect(line).toMatch(/:\/workspace:ro /);
    expect(line).toMatch(/:\/output:rw/);
    const scenario = result.report.levels.component.scenarios[0] as { status: string; checks: { id: string; status: string }[] };
    expect(scenario.status).toBe('pass');
    expect(scenario.checks.map((check) => `${check.id}:${check.status}`)).toContain('c2:pass');
  });

  it('runs the stub over the files the host merges: the team folder files, then settings/<slug>/', async () => {
    const { team, run, settings } = await setup({
      files: {
        [`${TEAM}/appsettings.json`]: JSON.stringify({ Llm: { BaseUrl: 'https://api.openai.com/v1', Model: 'gpt-x' }, Custom: { A: 1, B: 1 } }),
        [`${WORKSHOP}/settings/demo/appsettings.json`]: JSON.stringify({ custom: { b: 2 } }),
      },
    });
    const result = await run.execute(team, L2);
    expect(result.levels[2]?.status).toBe('pass');
    const generated = JSON.parse(settings[0] as string) as { Llm: { BaseUrl: string }; Custom: Record<string, number> };
    expect(generated.Custom).toEqual({ A: 1, B: 2 });
    expect(generated.Llm.BaseUrl).not.toContain('openai');
  });

  it('runs the machine profile without --settings: the host reads its own chain', async () => {
    const e2e = { id: 'e2e-01-report', level: 'e2e_local', checks: [{ id: 'c1', type: 'file-exists', path: '/output/report.md' }] };
    const { team, run, lines } = await setup({
      files: {
        [`${WORKSHOP}/settings/demo/appsettings.json`]: JSON.stringify({ Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b' } }),
        [`${TESTS}/e2e/e2e-01-report.scenario.json`]: JSON.stringify(e2e),
      },
    });
    const result = await run.execute(team, { maxLevel: 'e2e_local', profile: 'machine', continueAfterRed: false });
    expect(result.levels.map((level) => level.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(lines.at(-1)).not.toContain('--settings');
  });

  it('fails L0 on a host that does not build, and does not validate it', async () => {
    const { team, run } = await setup({ commands: { 'dotnet build -c Release': failed(1, 'Demo.Host.cs(3,1): error CS1002: ; expected\n') } });
    const result = await run.execute(team, { ...L2, maxLevel: 'static' });
    const checks = Object.fromEntries((result.report.levels.static.checks as { id: string; status: string; detail: string }[]).map((check) => [check.id, `${check.status}: ${check.detail}`]));
    expect(checks['dotnet-build']).toMatch(/^fail: exit 1 · .*CS1002/);
    expect(checks['host-validate']).toBe('skipped: needs a host that builds');
  });

  it('runs no scenario after a red build, even with --continue: the host binary would be stale', async () => {
    const { team, run, lines } = await setup({ commands: { 'dotnet build -c Release': failed(1, 'error CS1002\n') } });
    const result = await run.execute(team, { ...L2, continueAfterRed: true });
    expect(lines).toHaveLength(0);
    expect(result.levels[2]?.status).not.toBe('pass');
    expect(result.levels[2]?.note).toMatch(/the host did not build at L0/);
  });

  it('refuses launchers that do not run the host, and a Studio card', async () => {
    const { team, run, fileSystem } = await setup({ files: { [`${TEAM}/run.sh`]: '#!/usr/bin/env bash\nexec orkeon run crew "$@"\n' } });
    fileSystem.addFile(teamPaths(team).studioCard, '{}');
    const result = await run.execute(team, { ...L2, maxLevel: 'static' });
    const launchers = (result.report.levels.static.checks as { id: string; status: string; detail: string }[]).find((check) => check.id === 'launchers');
    expect(launchers?.status).toBe('fail');
    expect(launchers?.detail).toContain('run.sh does not run dotnet run --project src/Demo.Host');
    expect(launchers?.detail).toContain('a Studio card (team.json) exists');
    expect(launchers?.detail).toContain('never by orkeon-bench scaffold');
  });

  it('refuses a Studio card under its former name too: Studio still adopts studio-team.json', async () => {
    const { team, run, fileSystem } = await setup();
    fileSystem.addFile(teamPaths(team).legacyStudioCard, '{}');
    const result = await run.execute(team, { ...L2, maxLevel: 'static' });
    const launchers = (result.report.levels.static.checks as { id: string; status: string; detail: string }[]).find((check) => check.id === 'launchers');
    expect(launchers).toMatchObject({ status: 'fail', detail: expect.stringContaining('a Studio card (team.json) exists') });
  });

  it('fails L1 on a failed host test', async () => {
    const { team, run } = await setup({ commands: { 'dotnet test -c Release --no-build': failed(1, 'Test run summary: Failed!\n  total: 12\n  failed: 1\n  succeeded: 11\n') } });
    const result = await run.execute(team, { ...L2, maxLevel: 'unit' });
    expect(result.levels[1]).toEqual({ level: 'unit', status: 'fail', note: 'dotnet test: 12 tests, 1 failed' });
  });
});

describe('ScaffoldTeam — a C# team', () => {
  it('is refused: its launchers come from new-team.sh', async () => {
    const { team, fileSystem } = await setup();
    await expect(new ScaffoldTeam(fileSystem).execute(team)).rejects.toThrow(/demo is a C# team \(host\/\): orkeon-bench scaffold does not write its launchers/);
  });
});
