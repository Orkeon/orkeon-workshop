import { parseBenchConfig } from '../../domain/bench-config.js';
import { HOST_CONFIGURATION, HOST_FOLDER, hostLauncherProblems, hostRunArguments, type TeamKind } from '../../domain/csharp-host.js';
import { DomainError } from '../../domain/errors.js';
import { RUN_TARGETS, renderRunCmd, renderRunSh, type CrewKind } from '../../domain/mounts/launchers.js';
import type { MachineFolders } from '../../domain/mounts/mount-reach.js';
import { DEFAULT_ENVIRONMENT, resolveMountSet, type MountResolution } from '../../domain/mounts/mount-set.js';
import { joinPath } from '../../domain/paths.js';
import type { StaticCheck } from '../../domain/run-report.js';
import { SCENARIO_SUFFIX, parseScenario } from '../../domain/scenario.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError, InterruptedError } from '../errors.js';
import type { Environment, FileSystem, ProcessResult, ProcessRunOptions, ProcessRunner, ShutdownWatch } from '../ports/index.js';
import { readHostProject, readTeamKind } from '../teams/crew-kind.js';
import { readJsonFile } from '../use-cases/read-json-file.js';
import { readHostLlmLayers, readLlmLayers } from '../use-cases/read-llm-layers.js';
import { readMountSet } from '../use-cases/read-mount-set.js';

const CHECK_TIMEOUT_MS = 180_000;
/** A first `dotnet build` of a host restores its packages and compiles the tools it references. */
export const HOST_BUILD_TIMEOUT_MS = 600_000;

/** The static check script each generator skill ships, relative to the workshop (plan § 6.1). */
export const CHECK_SCRIPTS: Readonly<Record<CrewKind, string>> = Object.freeze({
  yaml: '.claude/skills/orkeon-crew/scripts/check_crew.py',
  typescript: '.claude/skills/orkeon-crew/scripts/check_team.py',
});

/** The folders of `tests/<slug>/` that hold scenarios. */
export const SCENARIO_FOLDERS = ['component', 'e2e'] as const;

/** What L0 read on its way, for the levels that follow. */
export interface StaticLevelResult {
  readonly checks: readonly StaticCheck[];
  /** Null when the crew could not be read. */
  readonly kind: TeamKind | null;
  /** The host project of a C# team, relative to `host/` (`src/<Name>.Host`); null otherwise. */
  readonly hostProject: string | null;
  /** Null when `mounts.json` could not be read. */
  readonly mounts: MountResolution | null;
}

/**
 * L0, the static level (plan § 6.1): the definition is well formed and loadable — `mounts.json`
 * and the reach rule, the crew layout, the launchers and the Studio card in step with the mount
 * points, the bench configuration, the settings file a run reads, the scenarios, the generator skill's check script and
 * `orkeon run --validate`. A C# team (`host/`): its launchers run the host, no check script,
 * `dotnet build` of `host/` then the host's `--validate` in place of `orkeon run --validate`. A check
 * whose tool is absent is `skipped`, with the reason. Not run by this version: `tsc`, the scan for secrets.
 */
export class StaticLevel {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly environment: Environment,
    private readonly machine: MachineFolders,
  ) {}

  /** Runs a command of a check in a process group of its own, stopped with the run. */
  private async start(watch: ShutdownWatch, command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    const result = await this.processes.run(command, args, { ...options, ownGroup: true, cancel: watch.requested });
    if (result.stopped === 'cancelled') {
      throw new InterruptedError(`interrupted during the static checks (${command} ${args[0] ?? ''} was stopped)`);
    }
    return result;
  }

  /** `watch`: the request to stop a run holds; a check in flight is stopped with everything it started. */
  async execute(team: TeamRef, watch: ShutdownWatch): Promise<StaticLevelResult> {
    const checks: StaticCheck[] = [];
    const attempt = async <T>(id: string, action: () => Promise<T>): Promise<T | null> => {
      try {
        const value = await action();
        checks.push({ id, status: 'pass', detail: '' });
        return value;
      } catch (error) {
        checks.push({ id, status: 'fail', detail: (error as Error).message });
        return null;
      }
    };
    const mounts = await attempt('mounts', async () => resolveMountSet(await readMountSet(this.fileSystem, team), team.folder, DEFAULT_ENVIRONMENT, this.machine));
    const layout = await attempt('crew-layout', async () => {
      const read = await readTeamKind(this.fileSystem, team);
      return { kind: read, hostProject: read === 'csharp' ? await readHostProject(this.fileSystem, team) : null };
    });
    const kind = layout?.kind ?? null;
    const hostProject = layout?.hostProject ?? null;
    if (kind === 'csharp') {
      // A C# team (`new-team.sh`): its launchers run the host, the host is built, then loads the crew.
      checks.push(await this.hostLaunchers(team, hostProject as string));
      checks.push(await this.benchConfig(team));
      checks.push(await this.settings(team, true));
      checks.push(await this.scenarios(team));
      checks.push(skipped('check-script', 'a C# team: the check scripts of /orkeon-crew judge orkeon run teams; the host is checked by dotnet build, its startup tests (L1) and its --validate'));
      const build = await this.hostBuild(team, watch);
      checks.push(build);
      checks.push(
        mounts === null || build.status !== 'pass'
          ? skipped('host-validate', mounts === null ? 'needs a readable mounts.json' : 'needs a host that builds')
          : await this.hostValidate(team, hostProject as string, watch),
      );
      return { checks, kind, hostProject, mounts };
    }
    checks.push(mounts === null || kind === null ? skipped('launchers', 'needs a readable mounts.json and crew') : await this.launchers(team, kind, mounts));
    checks.push(await this.benchConfig(team));
    checks.push(await this.settings(team));
    checks.push(await this.scenarios(team));
    checks.push(kind === null ? skipped('check-script', 'needs a readable crew') : await this.checkScript(team, kind, watch));
    if (kind === 'typescript') {
      checks.push(skipped('tsc', 'the TypeScript compiler is not run by this version of the bench: run `tsc -p` on the team by hand'));
    }
    checks.push(mounts === null || kind === null ? skipped('orkeon-validate', 'needs a readable mounts.json and crew') : await this.validate(team, kind, mounts, watch));
    return { checks, kind, hostProject, mounts };
  }

  /** The launchers of a C# team are `new-team.sh`'s: they run the host on the team folder; no Studio card. */
  private async hostLaunchers(team: TeamRef, project: string): Promise<StaticCheck> {
    const paths = teamPaths(team);
    const read = async (file: string): Promise<string | null> => ((await this.fileSystem.exists(file)) ? this.fileSystem.readText(file) : null);
    const problems = hostLauncherProblems(project, await read(paths.runSh), await read(paths.runCmd), (await this.fileSystem.exists(paths.studioCard)) || (await this.fileSystem.exists(paths.legacyStudioCard)));
    return problems.length === 0
      ? { id: 'launchers', status: 'pass', detail: '' }
      : { id: 'launchers', status: 'fail', detail: `${problems.join('; ')} — the launchers of a C# team are written by OrkeonCrewHost/new-team.sh (skill orkeon-crew-csharp), never by orkeon-bench scaffold` };
  }

  /** `dotnet build` of `host/`, in the configuration the launchers run: zero warning, the analysers make warnings errors. */
  private async hostBuild(team: TeamRef, watch: ShutdownWatch): Promise<StaticCheck> {
    const result = await this.start(watch, 'dotnet', ['build', '-c', HOST_CONFIGURATION], { cwd: joinPath(team.folder, HOST_FOLDER), timeoutMs: HOST_BUILD_TIMEOUT_MS, env: dotnetEnvironment(this.environment) });
    if (!result.found) {
      return { id: 'dotnet-build', status: 'fail', detail: 'dotnet not found on PATH' };
    }
    return { id: 'dotnet-build', status: result.exitCode === 0 ? 'pass' : 'fail', detail: result.exitCode === 0 ? '' : tail(result, 6) };
  }

  /** What `./run.sh --validate` does, on the build just made: the host loads the crew, strict on tool names. */
  private async hostValidate(team: TeamRef, project: string, watch: ShutdownWatch): Promise<StaticCheck> {
    const result = await this.start(watch, 'dotnet', hostRunArguments(project, team.folder, ['--validate']), {
      cwd: joinPath(team.folder, HOST_FOLDER),
      timeoutMs: CHECK_TIMEOUT_MS,
      env: dotnetEnvironment(this.environment),
    });
    if (!result.found) {
      return { id: 'host-validate', status: 'fail', detail: 'dotnet not found on PATH' };
    }
    const ok = result.exitCode === 0 && result.stdout.includes('VALIDATION OK');
    return { id: 'host-validate', status: ok ? 'pass' : 'fail', detail: ok ? '' : tail(result, 4) };
  }

  /** `run.sh`, `run.cmd` and the mounts of the Studio card are what `scaffold` would write today. */
  private async launchers(team: TeamRef, kind: CrewKind, mounts: MountResolution): Promise<StaticCheck> {
    const paths = teamPaths(team);
    const spec = { slug: team.slug, kind, bindings: mounts.bindings };
    const stale: string[] = [];
    for (const [file, expected] of [
      [paths.runSh, renderRunSh(spec)],
      [paths.runCmd, renderRunCmd(spec)],
    ] as const) {
      if (!(await this.fileSystem.exists(file)) || (await this.fileSystem.readText(file)) !== expected) {
        stale.push(file.slice(team.folder.length + 1));
      }
    }
    const card = (await this.fileSystem.exists(paths.studioCard)) ? await readJsonFile(this.fileSystem, paths.studioCard).catch(() => null) : null;
    const cardMounts = typeof card === 'object' && card !== null ? (card as { mounts?: unknown }).mounts : undefined;
    if (JSON.stringify(cardMounts) !== JSON.stringify(mounts.studioMounts)) {
      stale.push('team.json (mounts)');
    }
    return stale.length === 0
      ? { id: 'launchers', status: 'pass', detail: '' }
      : { id: 'launchers', status: 'fail', detail: `${stale.join(', ')} not in step with mounts.json: run \`orkeon-bench scaffold ${team.slug}\`` };
  }

  private async benchConfig(team: TeamRef): Promise<StaticCheck> {
    const path = teamPaths(team).benchConfigFile;
    if (!(await this.fileSystem.exists(path))) {
      return skipped('bench-config', `${path} does not exist: the defaults apply`);
    }
    try {
      parseBenchConfig(await readJsonFile(this.fileSystem, path));
      return { id: 'bench-config', status: 'pass', detail: '' };
    } catch (error) {
      return { id: 'bench-config', status: 'fail', detail: (error as Error).message };
    }
  }

  /**
   * The settings file a run of the team reads — its own, else the one Orkeon resolves from the crew
   * folder — is strict JSON. Orkeon reads a comment, a trailing comma and a key written twice;
   * the bench, which generates the settings of a test run from that file, and the run gate do not:
   * found here once, rather than at the set-up of every scenario.
   */
  private async settings(team: TeamRef, csharp = false): Promise<StaticCheck> {
    const paths = teamPaths(team);
    const own = (await this.fileSystem.exists(paths.settingsFile)) && !(await this.fileSystem.isDirectory(paths.settingsFile));
    try {
      // A C# team: every file its host merges (the team folder's, then settings/<slug>/), never the crew folder's chain.
      const { settingsFile } = csharp
        ? await readHostLlmLayers(this.fileSystem, this.environment, { teamFolder: team.folder, workshopSettingsFile: paths.settingsFile })
        : await readLlmLayers(this.fileSystem, this.environment, { crewFolder: paths.crew, explicitSettingsFile: own ? paths.settingsFile : undefined });
      // Nothing to read is nothing to refuse: the run then gets a settings file that holds the stub alone.
      return { id: 'settings', status: 'pass', detail: settingsFile === null ? (csharp ? 'no settings file: the host reads none of its files' : 'no settings file: neither the team nor the machine has one') : '' };
    } catch (error) {
      if (error instanceof ApplicationError || error instanceof DomainError) {
        return { id: 'settings', status: 'fail', detail: error.message };
      }
      throw error;
    }
  }

  /**
   * Every scenario of the tests parses, whatever its level, and every file that looks like one is
   * where a run finds it: `component/<name>.scenario.json` or `e2e/<name>.scenario.json`. A scenario
   * in a sub-folder, or whose suffix is written in another case, would never run and never be missed.
   */
  private async scenarios(team: TeamRef): Promise<StaticCheck> {
    const tests = teamPaths(team).tests;
    const problems: string[] = [];
    const found: string[] = [];
    for (const folder of SCENARIO_FOLDERS) {
      for (const file of await scenarioFiles(this.fileSystem, team, folder)) {
        found.push(file);
        try {
          parseScenario(await readJsonFile(this.fileSystem, joinPath(tests, file)), file);
        } catch (error) {
          problems.push((error as Error).message);
        }
      }
    }
    const stray = (await this.scenarioLookalikes(tests, '')).filter((file) => !found.includes(file));
    if (stray.length > 0) {
      problems.push(`no run picks up ${stray.join(', ')}: a scenario is a file ${SCENARIO_FOLDERS.map((folder) => `${folder}/<name>${SCENARIO_SUFFIX}`).join(' or ')}, named in lower case`);
    }
    if (found.length === 0 && problems.length === 0) {
      return skipped('scenarios', `no ${SCENARIO_SUFFIX} file under ${tests}`);
    }
    return { id: 'scenarios', status: problems.length === 0 ? 'pass' : 'fail', detail: problems.join(' | ') };
  }

  /** Every file below `tests/<slug>/` whose name ends like a scenario's, whatever the case; the datasets are data, not tests. */
  private async scenarioLookalikes(tests: string, folder: string): Promise<string[]> {
    const files: string[] = [];
    for (const name of await this.fileSystem.list(joinPath(tests, folder))) {
      const relative = folder === '' ? name : `${folder}/${name}`;
      if (await this.fileSystem.isDirectory(joinPath(tests, relative))) {
        if (relative !== 'datasets') {
          files.push(...(await this.scenarioLookalikes(tests, relative)));
        }
      } else if (name.toLowerCase().endsWith(SCENARIO_SUFFIX)) {
        files.push(relative);
      }
    }
    return files;
  }

  private async checkScript(team: TeamRef, kind: CrewKind, watch: ShutdownWatch): Promise<StaticCheck> {
    const script = joinPath(workshopOfTeam(team.folder), CHECK_SCRIPTS[kind]);
    if (!(await this.fileSystem.exists(script))) {
      return skipped('check-script', `${script} does not exist (the harness deploys it into a workshop)`);
    }
    const result = await this.start(watch, 'python3', [script, team.folder, '--orkeon', 'orkeon'], { timeoutMs: CHECK_TIMEOUT_MS });
    if (!result.found) {
      return skipped('check-script', 'python3 not found on PATH');
    }
    return { id: 'check-script', status: result.exitCode === 0 ? 'pass' : 'fail', detail: result.exitCode === 0 ? '' : tail(result, 6) };
  }

  /** The real load, from the team folder, on its own folders: what `./run.sh --validate` does. */
  private async validate(team: TeamRef, kind: CrewKind, mounts: MountResolution, watch: ShutdownWatch): Promise<StaticCheck> {
    const settings = teamPaths(team).settingsFile;
    const args = ['run', RUN_TARGETS[kind], '--validate', ...((await this.fileSystem.exists(settings)) ? ['--settings', settings] : []), ...mounts.arguments];
    const result = await this.start(watch, 'orkeon', args, { cwd: team.folder, timeoutMs: CHECK_TIMEOUT_MS });
    if (!result.found) {
      return { id: 'orkeon-validate', status: 'fail', detail: 'orkeon not found on PATH' };
    }
    const ok = result.exitCode === 0 && result.stdout.includes('VALIDATION OK');
    return { id: 'orkeon-validate', status: ok ? 'pass' : 'fail', detail: ok ? '' : tail(result, 4) };
  }
}

/** The scenario files of one folder of the tests, as paths relative to `tests/<slug>/`, sorted. */
export async function scenarioFiles(fileSystem: FileSystem, team: TeamRef, folder: (typeof SCENARIO_FOLDERS)[number]): Promise<string[]> {
  const base = joinPath(teamPaths(team).tests, folder);
  const files: string[] = [];
  for (const name of await fileSystem.list(base)) {
    if (name.endsWith(SCENARIO_SUFFIX) && !(await fileSystem.isDirectory(joinPath(base, name)))) {
      files.push(`${folder}/${name}`);
    }
  }
  return files;
}

/** The environment of a `dotnet` command: the bench's, its messages in English (the bench reads them). */
export function dotnetEnvironment(environment: Environment): Record<string, string> {
  return { ...environment.variables(), DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };
}

function skipped(id: string, detail: string): StaticCheck {
  return { id, status: 'skipped', detail };
}

/** The last lines a failed command printed, on one line. */
function tail(result: ProcessResult, lines: number): string {
  const text = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const exit = result.exitCode === null ? 'no exit code' : `exit ${String(result.exitCode)}`;
  return [exit, ...text.slice(-lines)].join(' · ');
}
