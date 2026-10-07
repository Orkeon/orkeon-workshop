import { DomainError } from '../../domain/errors.js';
import type { AttemptId, RunId } from '../../domain/ids.js';
import { paidModelCalls } from '../../domain/llm-stub.js';
import { RUN_TARGETS, type CrewKind } from '../../domain/mounts/launchers.js';
import { mountArguments, type MountBinding } from '../../domain/mounts/mount-binding.js';
import { isWritable } from '../../domain/mounts/mount-declaration.js';
import { mountPointFolder, type MountResolution } from '../../domain/mounts/mount-set.js';
import { SETTINGS_FILE_NAME, stubRunVariables, stubSettings } from '../../domain/orkeon-configuration.js';
import { joinPath } from '../../domain/paths.js';
import { STUB_API_KEY, STUB_MODEL, STUB_PROFILE_NAME } from '../../domain/profile.js';
import { parseRunEvents } from '../../domain/run-events.js';
import type { ScenarioResult } from '../../domain/run-report.js';
import { nextRunId } from '../../domain/run.js';
import { isText, judgeScenario, sameBytes, type CheckResult, type FileEvidence } from '../../domain/scenario-checks.js';
import { DEFAULT_SCENARIO_TIMEOUT_SECONDS, EXPECTED_FOLDER, SCENARIO_SUFFIX, parseScenario, splitVirtualFile, type Scenario } from '../../domain/scenario.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError, InterruptedError } from '../errors.js';
import { PROCESS_OUTPUT_LIMIT_BYTES, type ProcessResult } from '../ports/process-runner.js';
import type { Clock, Environment, FileSystem, LlmStubServer, ProcessRunner, ShutdownWatch, TreeDigest } from '../ports/index.js';
import { readJsonFile } from '../use-cases/read-json-file.js';
import { readSettingsFile } from '../use-cases/read-settings-file.js';
import type { ResolveProfile } from '../use-cases/resolve-profile.js';
import { stubScriptOf } from './load-stub-script.js';
import { SANDBOX_PREFIX } from './sandbox.js';

/** What every scenario of one `orkeon-bench run` shares. */
export interface ScenarioContext {
  readonly team: TeamRef;
  readonly attempt: AttemptId;
  readonly kind: CrewKind;
  /** The mount points of the team, as `mounts.json` declares them. */
  readonly mounts: MountResolution;
  readonly orkeonVersion: string;
  readonly benchVersion: string;
  /** The digest of the crew this run measures, as the design snapshot of the attempt holds it. */
  readonly crew: TreeDigest | null;
  /** The request to stop the run holds: a scenario in flight is stopped with everything it started. */
  readonly watch: ShutdownWatch;
}

/** A mount point of the team and where a run starts it from. */
interface BoundPoint {
  readonly binding: MountBinding;
  /** The folder of the dataset the point starts from; null for an empty one. */
  readonly source: string | null;
}

const SETUP_CHECK = 'setup';
const READ_ONLY_CHECK = 'read-only';
/** In the sandbox, beside the folders of the mount points — whose names never start with a dot: what the bench keeps for itself. */
const SANDBOX_PRIVATE_FOLDER = '.orkeon-bench';

/**
 * One component scenario (L2, plan § 6.1): the whole crew, run once from the team folder against
 * the simulated LLM. Every mount point is bound to a folder of a sandbox — a copy of the folder of
 * the dataset it starts from, or an empty folder: the dataset under `tests/` is never bound, so
 * that nothing a run does can change the frozen test data; a dataset that holds a symbolic link is
 * refused, and no link is followed when the run is archived or judged. The run reads a settings
 * file generated in the sandbox — the one it would have read, its `Llm` section pointed at the stub
 * (`stubSettings`) — and none of the caller's `Llm` variables. The run is archived under
 * `workbooks/<slug>/runs/RUN-…/` — events, logs, the exchanges of the stub, a snapshot of the
 * written points, a manifest — and the checks are judged on that archive. The run folder is
 * created once the set-up has passed; the sandbox is removed whatever happens.
 */
export class ScenarioRunner {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly environment: Environment,
    private readonly clock: Clock,
    private readonly stub: LlmStubServer,
    private readonly resolveProfile: ResolveProfile,
  ) {}

  /** `file`: the scenario, relative to `tests/<slug>/`. Throws an InterruptedError when the run is stopped on request. */
  async execute(context: ScenarioContext, file: string): Promise<ScenarioResult> {
    const fallbackId = file.slice(file.lastIndexOf('/') + 1, -SCENARIO_SUFFIX.length);
    const path = joinPath(teamPaths(context.team).tests, file);
    let scenario: Scenario;
    try {
      scenario = parseScenario(await readJsonFile(this.fileSystem, path), file);
    } catch (error) {
      return notRun(fallbackId, file, null, (error as Error).message);
    }
    try {
      return await this.run(context, scenario, file, path);
    } catch (error) {
      // What a scenario asks for and cannot have fails the scenario, not the bench.
      if (!(error instanceof InterruptedError) && (error instanceof ApplicationError || error instanceof DomainError)) {
        return notRun(scenario.id, file, scenario, error.message);
      }
      throw error;
    }
  }

  private async run(context: ScenarioContext, scenario: Scenario, file: string, path: string): Promise<ScenarioResult> {
    if (scenario.level !== 'component') {
      return notRun(scenario.id, file, scenario, `level is ${scenario.level}: a scenario of component/ is a component scenario`);
    }
    const script = await stubScriptOf(this.fileSystem, scenario, path);
    const paid = paidModelCalls(script);
    if (paid.length > 0) {
      throw new ApplicationError('invalid-input', `the reply script calls ${paid.join(', ')}, which calls a paid model of its own when it runs: no place in a run on the simulated LLM`);
    }
    const dataset = await this.datasetFolder(context.team, scenario);
    const points = await this.bind(context, scenario, dataset);
    const paths = teamPaths(context.team);

    const sandbox = await this.fileSystem.makeTemporaryDirectory(SANDBOX_PREFIX);
    try {
      const folders = await this.prepare(points, sandbox);
      const readOnly = points.filter((point) => !isWritable(point.binding));
      const before = await this.digests(readOnly, folders);
      const bindings = points.map((point) => rebind(point.binding, folders.get(point.binding.root) as string));
      const settingsFile = joinPath(sandbox, SANDBOX_PRIVATE_FOLDER, SETTINGS_FILE_NAME);
      const args = ['run', RUN_TARGETS[context.kind], '--events', 'jsonl', '--settings', settingsFile, ...mountArguments(bindings)];
      const timeoutSeconds = scenario.timeout_seconds ?? DEFAULT_SCENARIO_TIMEOUT_SECONDS;

      const session = await this.stub.start(script);
      let result: ProcessResult;
      let run: RunId;
      let runFolder: string;
      let started: Date;
      let settingsSource: string | null;
      try {
        // The last step of the set-up: what the stub must be laid over is read from the team's configuration.
        const profile = await this.resolveProfile.execute(context.team, STUB_PROFILE_NAME, { stubPort: session.port });
        // The run reads this file instead of the one it would have resolved (`--settings` ends Orkeon's
        // chain): the same settings, their `Llm` section rewritten for the default provider and every profile.
        settingsSource = profile.settingsFile;
        const original = settingsSource === null ? null : await readSettingsFile(this.fileSystem, settingsSource);
        const stub = { baseUrl: session.baseUrl, model: STUB_MODEL, apiKey: STUB_API_KEY };
        await this.fileSystem.makeDirectory(joinPath(sandbox, SANDBOX_PRIVATE_FOLDER));
        await this.fileSystem.writeText(settingsFile, `${JSON.stringify(stubSettings(original, stub, profile.orkeonProfiles), null, 2)}\n`);
        ({ run, folder: runFolder } = await this.reserveRun(paths.runs));
        started = this.clock.now();
        result = await this.processes.run('orkeon', args, {
          cwd: context.team.folder,
          timeoutMs: timeoutSeconds * 1000,
          // None of the caller's `Llm` variables, whatever their case: the stub is the only model the run can reach.
          env: stubRunVariables(this.environment.variables(), profile.variables),
          // Closed at once: a question to a person is refused instead of waiting for ever.
          input: '',
          // A launcher or a wrapper may stand between the bench and the run: stopping it stops them all.
          ownGroup: true,
          cancel: context.watch.requested,
        });
      } finally {
        await session.stop();
      }
      const exchanges = session.exchanges();
      const finished = this.clock.now();
      const interrupted = result.stopped === 'cancelled';

      // Archive first, judge on the archive: what a check saw is what the reviewer can read. A symbolic
      // link the run left is neither archived nor followed: it is named in the manifest, and to a
      // check what lies behind it does not exist.
      const snapshot = joinPath(runFolder, 'output-snapshot');
      await this.fileSystem.makeDirectory(snapshot);
      const links: string[] = [];
      for (const point of points) {
        const folder = folders.get(point.binding.root) as string;
        links.push(...(await this.fileSystem.symbolicLinks(folder)).map((link) => (link === '.' ? point.binding.root : `${point.binding.root}/${link}`)));
        if (isWritable(point.binding)) {
          const archived = joinPath(snapshot, mountPointFolder(point.binding.root));
          await this.fileSystem.copy(folder, archived, { skipLinks: true });
          folders.set(point.binding.root, archived);
        }
      }
      await this.fileSystem.writeText(joinPath(runFolder, 'events.jsonl'), result.stdout);
      await this.fileSystem.writeText(joinPath(runFolder, 'stderr.log'), result.stderr);
      await this.fileSystem.writeText(joinPath(runFolder, 'stub-exchanges.jsonl'), exchanges.map((exchange) => `${JSON.stringify(exchange)}\n`).join(''));

      const events = parseRunEvents(result.stdout);
      const exitCode = result.found ? result.exitCode : null;
      const checks = interrupted
        ? []
        : [
            ...(result.found ? [] : [failure(SETUP_CHECK, 'orkeon not found on PATH')]),
            ...judgeScenario(scenario, { exitCode, events, exchanges, stopped: stopSentence(result, timeoutSeconds), ...(await this.fileEvidence(scenario, folders, dataset, links)) }),
            ...(await this.readOnlyCheck(readOnly, folders, before)),
          ];
      const status = interrupted ? 'interrupted' : checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
      const duration = Math.max(0, (finished.getTime() - started.getTime()) / 1000);
      const tokensIn = events.finished?.promptTokens ?? 0;
      const tokensOut = events.finished?.completionTokens ?? 0;
      await this.fileSystem.writeText(
        joinPath(runFolder, 'manifest.json'),
        `${JSON.stringify(
          {
            run,
            team: context.team.slug,
            attempt: context.attempt,
            scenario: scenario.id,
            scenario_file: file,
            level: scenario.level,
            target: STUB_PROFILE_NAME,
            model: STUB_MODEL,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            duration_seconds: duration,
            orkeon_version: context.orkeonVersion,
            bench_version: context.benchVersion,
            crew: context.crew === null ? null : { sha256: context.crew.sha256, files: context.crew.files },
            dataset: dataset === null ? null : await this.datasetIdentity(scenario, dataset),
            settings: { generated: settingsFile, from: settingsSource },
            links_not_archived: links,
            command: ['orkeon', ...args],
            exit_code: exitCode,
            stopped: result.stopped ?? null,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            tool_calls: events.toolCalls.length,
            stub_requests: exchanges.length,
            status,
          },
          null,
          2,
        )}\n`,
      );
      if (interrupted) {
        throw new InterruptedError(`interrupted while scenario ${scenario.id} was running: orkeon run and what it started were stopped, the sandbox removed; ${runFolder} keeps what the run left`, run);
      }
      return {
        id: scenario.id,
        title: scenario.title,
        file,
        status: status === 'pass' ? 'pass' : 'fail',
        covers: scenario.covers,
        run,
        dataset: scenario.dataset,
        exit_code: exitCode,
        duration_seconds: duration,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        tool_calls: events.toolCalls.length,
        human_inputs: events.humanInputs,
        checks,
      };
    } finally {
      await this.fileSystem.remove(sandbox);
    }
  }

  /**
   * The folder of the run: the first free `RUN-<stamp>-stub[-n]`, taken by creating it with a call
   * that fails when it exists — two runs started together never share one.
   */
  private async reserveRun(runs: string): Promise<{ run: RunId; folder: string }> {
    await this.fileSystem.makeDirectory(runs);
    const taken = await this.fileSystem.list(runs);
    for (;;) {
      const run = nextRunId(this.clock.now(), STUB_PROFILE_NAME, taken);
      const folder = joinPath(runs, run);
      if (await this.fileSystem.makeDirectoryExclusive(folder)) {
        return { run, folder };
      }
      taken.push(run);
    }
  }

  /** `tests/<slug>/datasets/<name>`, else the shared `library/datasets/<name>`; null for a scenario without a dataset. */
  private async datasetFolder(team: TeamRef, scenario: Scenario): Promise<string | null> {
    if (scenario.dataset === null) {
      return null;
    }
    const own = joinPath(teamPaths(team).tests, 'datasets', scenario.dataset);
    const shared = joinPath(workshopOfTeam(team.folder), 'library', 'datasets', scenario.dataset);
    for (const folder of [own, shared]) {
      if (await this.fileSystem.isDirectory(folder)) {
        await this.refuseLinks(scenario, folder);
        return folder;
      }
    }
    throw new ApplicationError('invalid-input', `dataset "${scenario.dataset}" not found: neither ${own} nor ${shared} exists`);
  }

  /**
   * A dataset is plain files and folders. A symbolic link in it would be copied into the sandbox as
   * a link: the team could read or write through it what lies outside its mount points, and the
   * bench would judge and archive what the link points to.
   */
  private async refuseLinks(scenario: Scenario, dataset: string): Promise<void> {
    const links = await this.fileSystem.symbolicLinks(dataset);
    if (links.length > 0) {
      const named = links.map((link) => (link === '.' ? 'the dataset folder itself' : link)).join(', ');
      throw new ApplicationError('invalid-input', `dataset "${String(scenario.dataset)}" holds ${links.length === 1 ? 'a symbolic link' : 'symbolic links'} (${named}) in ${dataset}: a dataset is plain files and folders — replace each link with a copy of what it points to`);
    }
  }

  /**
   * Each mount point of the team and the folder of the dataset it starts from: the one `bindings`
   * names, else the one named after the point when the dataset has it, else none. `expected/` is
   * never one of them.
   */
  private async bind(context: ScenarioContext, scenario: Scenario, dataset: string | null): Promise<BoundPoint[]> {
    const declared = context.mounts.bindings.map((binding) => binding.root as string);
    const unknown = Object.keys(scenario.bindings).filter((root) => !declared.includes(root));
    if (unknown.length > 0) {
      throw new ApplicationError('invalid-input', `bindings name ${unknown.join(', ')}, which mounts.json does not declare (declared: ${declared.join(', ')})`);
    }
    const points: BoundPoint[] = [];
    for (const binding of context.mounts.bindings) {
      const named = Object.hasOwn(scenario.bindings, binding.root) ? (scenario.bindings[binding.root] as string | null) : undefined;
      let source: string | null = null;
      if (typeof named === 'string') {
        if (dataset === null) {
          throw new ApplicationError('invalid-input', `${binding.root} is bound to "${named}" but the scenario names no dataset`);
        }
        source = joinPath(dataset, named);
        if (!(await this.fileSystem.isDirectory(source))) {
          throw new ApplicationError('invalid-input', `${binding.root} is bound to ${source}, which is not a folder of the dataset`);
        }
      } else if (named === undefined && dataset !== null && mountPointFolder(binding.root) !== EXPECTED_FOLDER) {
        const implied = joinPath(dataset, mountPointFolder(binding.root));
        source = (await this.fileSystem.isDirectory(implied)) ? implied : null;
      }
      points.push({ binding, source });
    }
    return points;
  }

  /** The folder each point is bound to for the run, in the sandbox: a copy of its source, or an empty folder. */
  private async prepare(points: readonly BoundPoint[], sandbox: string): Promise<Map<string, string>> {
    const folders = new Map<string, string>();
    for (const point of points) {
      const own = joinPath(sandbox, mountPointFolder(point.binding.root));
      if (point.source === null) {
        await this.fileSystem.makeDirectory(own);
      } else {
        await this.fileSystem.copy(point.source, own);
      }
      folders.set(point.binding.root, own);
    }
    return folders;
  }

  private async digests(points: readonly BoundPoint[], folders: ReadonlyMap<string, string>): Promise<Map<string, string>> {
    const digests = new Map<string, string>();
    for (const point of points) {
      digests.set(point.binding.root, (await this.fileSystem.digest(folders.get(point.binding.root) as string)).sha256);
    }
    return digests;
  }

  /**
   * A read-only point holds after the run what it held before: Orkeon refuses a write there, so a
   * difference means something went round its file system. Absent when the team has no read-only point.
   */
  private async readOnlyCheck(points: readonly BoundPoint[], folders: ReadonlyMap<string, string>, before: ReadonlyMap<string, string>): Promise<CheckResult[]> {
    if (points.length === 0) {
      return [];
    }
    const after = await this.digests(points, folders);
    const changed = points.map((point) => point.binding.root as string).filter((root) => after.get(root) !== before.get(root));
    return [
      {
        id: READ_ONLY_CHECK,
        type: 'read-only-points',
        status: changed.length === 0 ? 'pass' : 'fail',
        detail: changed.length === 0 ? '' : `the content of ${changed.join(', ')} changed during the run: a read-only mount point was written`,
      },
    ];
  }

  /** What the checks of the scenario are judged on, read where the run left it. */
  private async fileEvidence(
    scenario: Scenario,
    folders: ReadonlyMap<string, string>,
    dataset: string | null,
    links: readonly string[],
  ): Promise<{ files: Map<string, FileEvidence>; expected: Map<string, string | null>; sameBytes: Map<string, boolean> }> {
    const files = new Map<string, FileEvidence>();
    const expected = new Map<string, string | null>();
    const same = new Map<string, boolean>();
    for (const check of scenario.checks) {
      if (!('path' in check)) {
        continue;
      }
      const { root, rest } = splitVirtualFile(check.path);
      const folder = folders.get(root);
      // Behind a link the run left, nothing is read: where it leads is not what the run wrote.
      const behindLink = links.some((link) => check.path === link || check.path.startsWith(`${link}/`));
      const physical = folder === undefined || behindLink ? null : joinPath(folder, rest);
      const exists = physical !== null && (await this.fileSystem.exists(physical));
      const actual = physical !== null && exists ? await this.bytesOf(physical) : null;
      files.set(check.path, { exists, text: actual === null ? null : decode(actual) });
      if (check.type === 'matches-expected') {
        const wanted = dataset === null ? null : await this.bytesOf(joinPath(dataset, check.expected));
        expected.set(check.expected, wanted === null ? null : decode(wanted));
        if (actual !== null && wanted !== null && !(isText(actual) && isText(wanted))) {
          same.set(check.id, sameBytes(actual, wanted));
        }
      }
    }
    return { files, expected, sameBytes: same };
  }

  /** The content of a file; null when there is none to read (absent, or a folder). */
  private async bytesOf(path: string): Promise<Uint8Array | null> {
    if (!(await this.fileSystem.exists(path)) || (await this.fileSystem.isDirectory(path))) {
      return null;
    }
    return this.fileSystem.readBytes(path);
  }

  /** What the manifest of the dataset says of it, for the manifest of the run. */
  private async datasetIdentity(scenario: Scenario, dataset: string): Promise<{ name: string | null; folder: string; version: unknown; sha256: unknown }> {
    const manifestFile = joinPath(dataset, 'manifest.json');
    const manifest = (await this.fileSystem.exists(manifestFile)) ? await readJsonFile(this.fileSystem, manifestFile).catch(() => null) : null;
    const record = typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>) : {};
    return { name: scenario.dataset, folder: dataset, version: record.version ?? null, sha256: record.sha256 ?? null };
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Why the bench stopped the run itself, in the words of the `run` check; null when it did not. */
function stopSentence(result: ProcessResult, timeoutSeconds: number): string | null {
  switch (result.stopped) {
    case 'timeout':
      return `orkeon run was stopped after ${String(timeoutSeconds)} s, the time the scenario allows (timeout_seconds): it had not finished`;
    case 'output-limit':
      return `orkeon run was stopped: it printed more than ${String(PROCESS_OUTPUT_LIMIT_BYTES / (1024 * 1024))} MB on its standard streams, more than the bench keeps`;
    default:
      return null;
  }
}

/** The same mount point on another folder, outside the team: what a test run binds. */
function rebind(binding: MountBinding, folder: string): MountBinding {
  return { ...binding, environment: 'scenario', declaredPath: folder, physicalPath: folder, relativePath: null, external: true };
}

function failure(id: string, detail: string): CheckResult {
  return { id, type: id, status: 'fail', detail };
}

/** A scenario that failed before `orkeon run` started: no run, one failed check that says why. */
function notRun(id: string, file: string, scenario: Scenario | null, detail: string): ScenarioResult {
  return {
    id,
    title: scenario?.title ?? '',
    file,
    status: 'fail',
    covers: scenario?.covers ?? [],
    run: null,
    dataset: scenario?.dataset ?? null,
    exit_code: null,
    duration_seconds: 0,
    tokens_in: 0,
    tokens_out: 0,
    tool_calls: 0,
    human_inputs: 0,
    checks: [failure(SETUP_CHECK, detail)],
  };
}
