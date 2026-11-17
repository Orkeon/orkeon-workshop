import { parse as parseYaml } from 'yaml';

import { usdOf, type Level, type Price } from '../../domain/bench-config.js';
import { decisionCalls, decisionSummary, type CrewTask } from '../../domain/decisions.js';
import { DomainError } from '../../domain/errors.js';
import type { AttemptId, RunId } from '../../domain/ids.js';
import { paidModelCalls } from '../../domain/llm-stub.js';
import { decisionProvider } from '../../domain/llm-target.js';
import { HOST_FOLDER, hostRunArguments, mergeHostSettings, type TeamKind } from '../../domain/csharp-host.js';
import { RUN_TARGETS } from '../../domain/mounts/launchers.js';
import { mountArguments, type MountBinding } from '../../domain/mounts/mount-binding.js';
import { isWritable } from '../../domain/mounts/mount-declaration.js';
import { mountPointFolder, type MountResolution } from '../../domain/mounts/mount-set.js';
import { SETTINGS_FILE_NAME, overlayVariables, stubRunVariables, stubSettings, withoutLlmVariables } from '../../domain/orkeon-configuration.js';
import { joinPath } from '../../domain/paths.js';
import { STUB_API_KEY, STUB_MODEL, type Profile } from '../../domain/profile.js';
import { decisionFailureOf, parseRunEvents, type RunEvents } from '../../domain/run-events.js';
import { NO_FACTS, type ScenarioFacts, type ScenarioResult } from '../../domain/run-report.js';
import { nextRunId } from '../../domain/run.js';
import { isText, judgeScenario, sameBytes, type CheckResult, type FileEvidence } from '../../domain/scenario-checks.js';
import { EXPECTED_FOLDER, SCENARIO_SUFFIX, parseScenario, scenarioDatasets, scenarioTimeoutSeconds, splitVirtualFile, type Scenario, type SequenceStep } from '../../domain/scenario.js';
import { findSecrets } from '../../domain/secrets.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError, InterruptedError } from '../errors.js';
import { PROCESS_OUTPUT_LIMIT_BYTES, type ProcessResult } from '../ports/process-runner.js';
import type { Clock, Environment, FileSystem, LlmStubServer, LlmStubSession, ProcessRunner, SchemaValidator, ShutdownWatch, TreeDigest } from '../ports/index.js';
import { readJsonFile } from '../use-cases/read-json-file.js';
import { readSettingsFile } from '../use-cases/read-settings-file.js';
import type { ProfileResolution, ResolveProfile } from '../use-cases/resolve-profile.js';
import { stubScriptOf } from './load-stub-script.js';
import { SANDBOX_PREFIX } from './sandbox.js';

/** What every scenario of one level of one `orkeon-bench run` shares. */
export interface ScenarioContext {
  readonly team: TeamRef;
  readonly attempt: AttemptId;
  readonly kind: TeamKind;
  /** The host project of a C# team, relative to `host/` (L0 read it); absent for a crew `orkeon run` starts. */
  readonly hostProject?: string | null;
  /** The mount points of the team, as `mounts.json` declares them. */
  readonly mounts: MountResolution;
  readonly orkeonVersion: string;
  readonly benchVersion: string;
  /** The digest of the crew this run measures, as the design snapshot of the attempt holds it. */
  readonly crew: TreeDigest | null;
  /** The request to stop the run holds: a scenario in flight is stopped with everything it started. */
  readonly watch: ShutdownWatch;
  /** The level the scenarios run at: a scenario of another level is refused. */
  readonly level: Level;
  /** The profile of the level: the stub at L2, the one of the level or `--profile` at L3 and L4. */
  readonly profile: Profile;
  /** The price of the profile; null when it has none. */
  readonly price: Price | null;
  /** The tool catalogue `orkeon run --list-tools` gives; null when it could not be read. */
  readonly tools: readonly string[] | null;
  /** `--no-decision` of `run`: passed on to `orkeon run`, decision tasks answer from their fallback. */
  readonly noDecision?: boolean;
}

/** The process a run of a scenario starts. */
interface RunCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Launch['env'];
}

/** The command line of a run, as the manifest records it. */
function commandLine(run: RunCommand): string[] {
  return [run.command, ...run.args];
}

/** A mount point of the team and where a run starts it from. */
interface BoundPoint {
  readonly binding: MountBinding;
  /** The folder of the dataset the point starts from; null for an empty one. */
  readonly source: string | null;
}

/** One `orkeon run` of a scenario: the only one, or a step of its sequence. */
interface StepOutcome {
  readonly step: SequenceStep | null;
  readonly datasetFolder: string | null;
  readonly result: ProcessResult;
  readonly events: RunEvents;
  /** True when the bench stopped the step on purpose, after the task `kill_after_task` names. */
  readonly killed: boolean;
}

/** How a run is launched: its settings file, its environment, what the stub saw. */
interface Launch {
  readonly settingsFile: string | null;
  /** Where the settings file was generated from; null when none was generated. */
  readonly settingsSource: string | null;
  readonly generated: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly session: LlmStubSession | null;
  readonly model: string;
  readonly provider: string | null;
  /** Whether a decision provider is active for the run: never on the stub (D96). */
  readonly decisionModel: 'active' | 'none';
  /** The active decision provider and where it comes from, for the run output; null without one. */
  readonly decisionProvider: string | null;
  /** The values the run was given that must not come out of it. */
  readonly secrets: readonly string[];
}

const SETUP_CHECK = 'setup';
const READ_ONLY_CHECK = 'read-only';
/** In the sandbox, beside the folders of the mount points — whose names never start with a dot: what the bench keeps for itself. */
const SANDBOX_PRIVATE_FOLDER = '.orkeon-bench';

/**
 * One scenario (plan § 6.1): the whole crew, run from the team folder — once, or step by step for
 * a sequence — in a sandbox. Every mount point is bound to a folder of the sandbox — a copy of the
 * folder of the dataset it starts from, or an empty folder: the dataset under `tests/` is never
 * bound, so that nothing a run does can change the frozen test data; a dataset that holds a
 * symbolic link is refused, and no link is followed when the run is archived or judged. On the
 * stub profile (L2), the run reads a settings file generated in the sandbox — the one it would
 * have read, its `Llm` section pointed at the stub (`stubSettings`) — and none of the caller's
 * `Llm` variables. On the machine profile it reads what the team reads; on a named profile the
 * variables of the profile over an environment stripped of the caller's `Llm` variables. The run
 * is archived under `workbooks/<slug>/runs/RUN-…-<profile>/` — events, logs, the exchanges of the
 * stub, a snapshot of the written points, a manifest — and the checks are judged on that archive.
 * The run folder is created once the set-up has passed; the sandbox is removed whatever happens.
 */
export class ScenarioRunner {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly environment: Environment,
    private readonly clock: Clock,
    private readonly stub: LlmStubServer,
    private readonly resolveProfile: ResolveProfile,
    private readonly schemas: SchemaValidator,
  ) {}

  /** `file`: the scenario, relative to `tests/<slug>/`; `iteration`: 1…n when the level repeats it. Throws an InterruptedError when the run is stopped on request. */
  async execute(context: ScenarioContext, file: string, iteration = 1): Promise<ScenarioResult> {
    const fallbackId = file.slice(file.lastIndexOf('/') + 1, -SCENARIO_SUFFIX.length);
    const path = joinPath(teamPaths(context.team).tests, file);
    let scenario: Scenario;
    try {
      scenario = parseScenario(await readJsonFile(this.fileSystem, path), file);
    } catch (error) {
      return notRun(context, fallbackId, file, null, iteration, (error as Error).message);
    }
    try {
      return await this.run(context, scenario, file, path, iteration);
    } catch (error) {
      // What a scenario asks for and cannot have fails the scenario, not the bench.
      if (!(error instanceof InterruptedError) && (error instanceof ApplicationError || error instanceof DomainError)) {
        return notRun(context, scenario.id, file, scenario, iteration, error.message);
      }
      throw error;
    }
  }

  private async run(context: ScenarioContext, scenario: Scenario, file: string, path: string, iteration: number): Promise<ScenarioResult> {
    if (scenario.level !== context.level) {
      return notRun(context, scenario.id, file, scenario, iteration, `level is ${scenario.level}: this run is at ${context.level}`);
    }
    const stubbed = context.profile.kind === 'stub';
    const script = stubbed ? await stubScriptOf(this.fileSystem, scenario, path) : null;
    if (script !== null) {
      const paid = paidModelCalls(script);
      if (paid.length > 0) {
        throw new ApplicationError('invalid-input', `the reply script calls ${paid.join(', ')}, which calls a paid model of its own when it runs: no place in a run on the simulated LLM`);
      }
    }
    const steps: (SequenceStep | null)[] = scenario.sequence.length > 0 ? [...scenario.sequence] : [null];
    const datasetFolders: (string | null)[] = [];
    for (const name of scenario.sequence.length > 0 ? scenarioDatasets(scenario) : [scenario.dataset]) {
      datasetFolders.push(await this.datasetFolder(context.team, scenario, name));
    }
    const paths = teamPaths(context.team);
    const timeoutSeconds = scenarioTimeoutSeconds(scenario);

    const sandbox = await this.fileSystem.makeTemporaryDirectory(SANDBOX_PREFIX);
    try {
      const firstPoints = await this.bind(context, scenario, datasetFolders[0] ?? null);
      const folders = await this.prepare(firstPoints, sandbox);
      const readOnly = firstPoints.filter((point) => !isWritable(point.binding));
      const bindings = firstPoints.map((point) => rebind(point.binding, folders.get(point.binding.root) as string));
      const settingsFile = joinPath(sandbox, SANDBOX_PRIVATE_FOLDER, SETTINGS_FILE_NAME);

      const launch = await this.launch(context, script, sandbox, settingsFile);
      const outcomes: StepOutcome[] = [];
      const readOnlyChanged: string[] = [];
      let run: RunId;
      let runFolder: string;
      let started: Date;
      try {
        ({ run, folder: runFolder } = await this.reserveRun(paths.runs, context.profile.name));
        started = this.clock.now();
        for (const [index, step] of steps.entries()) {
          const datasetFolder = datasetFolders[index] ?? null;
          if (index > 0) {
            // The next step lays its dataset over the sandbox as the step before left it: the state is kept.
            const points = await this.bind(context, scenario, datasetFolder);
            await this.overlay(points, folders);
          }
          const before = await this.digests(readOnly, folders);
          const outcome = await this.step(context, step, datasetFolder, launch, bindings, timeoutSeconds, settingsFile);
          outcomes.push(outcome);
          readOnlyChanged.push(...(await this.changedPoints(readOnly, folders, before)).filter((root) => !readOnlyChanged.includes(root)));
          if (outcome.result.stopped === 'cancelled' && !outcome.killed) {
            break;
          }
        }
      } finally {
        await launch.session?.stop();
      }
      const exchanges = launch.session?.exchanges() ?? [];
      const finished = this.clock.now();
      const last = outcomes[outcomes.length - 1] as StepOutcome;
      const interrupted = last.result.stopped === 'cancelled' && !last.killed;

      // Archive first, judge on the archive: what a check saw is what the reviewer can read. A symbolic
      // link the run left is neither archived nor followed: it is named in the manifest, and to a
      // check what lies behind it does not exist.
      const snapshot = joinPath(runFolder, 'output-snapshot');
      await this.fileSystem.makeDirectory(snapshot);
      const links: string[] = [];
      for (const point of firstPoints) {
        const folder = folders.get(point.binding.root) as string;
        links.push(...(await this.fileSystem.symbolicLinks(folder)).map((link) => (link === '.' ? point.binding.root : `${point.binding.root}/${link}`)));
        if (isWritable(point.binding)) {
          const archived = joinPath(snapshot, mountPointFolder(point.binding.root));
          await this.fileSystem.copy(folder, archived, { skipLinks: true });
          folders.set(point.binding.root, archived);
        }
      }
      const stdout = outcomes.map((outcome) => outcome.result.stdout).join('');
      const stderr = outcomes.map((outcome, index) => (steps.length > 1 ? `=== step ${String(index + 1)} (${outcome.step?.dataset ?? ''}) ===\n` : '') + outcome.result.stderr).join('\n');
      await this.fileSystem.writeText(joinPath(runFolder, 'events.jsonl'), stdout);
      await this.fileSystem.writeText(joinPath(runFolder, 'stderr.log'), stderr);
      if (stubbed) {
        await this.fileSystem.writeText(joinPath(runFolder, 'stub-exchanges.jsonl'), exchanges.map((exchange) => `${JSON.stringify(exchange)}\n`).join(''));
      }

      const events = parseRunEvents(stdout);
      const exitCode = last.result.found ? last.result.exitCode : null;
      const dataset = datasetFolders[datasetFolders.length - 1] ?? null;
      const checks = interrupted
        ? []
        : [
            ...(last.result.found ? [] : [failure(SETUP_CHECK, `${this.command(context, launch, bindings, settingsFile).command} not found on PATH`)]),
            ...judgeScenario(scenario, { exitCode, events, exchanges, stopped: stopSentence(last.result, timeoutSeconds), ...(await this.fileEvidence(context.team, scenario, folders, dataset, links)), crewTasks: await this.crewTasks(context.team, scenario) }, { stub: stubbed }),
            ...readOnlyCheck(readOnly, readOnlyChanged),
          ];
      const status = interrupted ? 'interrupted' : checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
      const duration = Math.max(0, (finished.getTime() - started.getTime()) / 1000);
      const tokensIn = outcomes.reduce((total, outcome) => total + (outcome.events.finished?.promptTokens ?? 0), 0);
      const tokensOut = outcomes.reduce((total, outcome) => total + (outcome.events.finished?.completionTokens ?? 0), 0);
      const usd = stubbed ? 0 : context.price === null ? null : round(usdOf(tokensIn, tokensOut, context.price));
      const model = launch.model.length > 0 ? launch.model : (events.cost?.model ?? '');
      const decisions = decisionSummary(events);
      // A failed run whose cause is a decision — a block, or a provider that failed — is no defect of the crew.
      const decisionFailure = status === 'fail' ? decisionFailureOf(events, stderr) : null;
      // `off` when --no-decision switched the decision tasks off; `none` when no provider could answer them.
      const decisionModel = launch.decisionModel === 'none' ? 'none' : context.noDecision === true ? 'off' : 'active';
      const facts = await this.facts(context, events, checks, readOnlyChanged, stdout, stderr, snapshot, launch.secrets);
      const sequenceSteps = [];
      for (const outcome of outcomes) {
        sequenceSteps.push({
          dataset: outcome.datasetFolder === null ? null : await this.datasetIdentity(outcome.step?.dataset ?? scenario.dataset, outcome.datasetFolder),
          kill_after_task: outcome.step?.kill_after_task ?? null,
          killed: outcome.killed,
          exit_code: outcome.result.found ? outcome.result.exitCode : null,
          stopped: outcome.result.stopped ?? null,
          tokens_in: outcome.events.finished?.promptTokens ?? 0,
          tokens_out: outcome.events.finished?.completionTokens ?? 0,
        });
      }
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
            iteration,
            target: context.profile.name,
            model,
            provider: launch.provider,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            duration_seconds: duration,
            orkeon_version: context.orkeonVersion,
            bench_version: context.benchVersion,
            crew: context.crew === null ? null : { sha256: context.crew.sha256, files: context.crew.files },
            dataset: scenario.sequence.length > 0 || dataset === null ? null : await this.datasetIdentity(scenario.dataset, dataset),
            sequence_steps: scenario.sequence.length > 0 ? sequenceSteps : [],
            settings: { generated: launch.generated ? settingsFile : null, from: launch.settingsSource },
            links_not_archived: links,
            command: commandLine(this.command(context, launch, bindings, settingsFile)),
            exit_code: exitCode,
            stopped: last.result.stopped ?? null,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            usd,
            tool_calls: events.toolCalls.length,
            capped_tasks: outcomes.reduce((total, outcome) => total + (outcome.events.finished?.cappedTasks ?? 0), 0),
            missing_deliverables: outcomes.reduce((total, outcome) => total + (outcome.events.finished?.missingDeliverables ?? 0), 0),
            decision_calls: decisionCalls(events),
            decision_model: decisionModel,
            decision_provider: launch.decisionProvider,
            stub_requests: exchanges.length,
            status,
            failure_class: decisionFailure?.kind ?? null,
            failure_cause: decisionFailure?.cause ?? null,
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
        level: scenario.level,
        iteration,
        status: status === 'pass' ? 'pass' : 'fail',
        covers: scenario.covers,
        run,
        dataset: scenario.dataset,
        datasets: scenarioDatasets(scenario),
        model,
        exit_code: exitCode,
        duration_seconds: duration,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        usd,
        tool_calls: events.toolCalls.length,
        human_inputs: events.humanInputs,
        ...(decisions === null ? {} : { decisions }),
        decision_model: decisionModel,
        ...(launch.decisionProvider === null ? {} : { decision_provider: launch.decisionProvider }),
        ...(decisionFailure === null ? {} : { failure_class: decisionFailure.kind, ...(decisionFailure.cause === undefined ? {} : { failure_cause: decisionFailure.cause }), failure_detail: decisionFailure.detail }),
        indicators: scenario.indicators,
        checks,
        facts,
      };
    } finally {
      await this.fileSystem.remove(sandbox);
    }
  }

  /**
   * What the run is launched with. On the stub: the stub session, a settings file generated in the
   * sandbox from what the run would have read, and an environment stripped of every `Llm` variable.
   * On the machine profile: the team's own settings file when it has one, the environment as it is.
   * On a named profile: the same settings file, the variables of the profile over an environment
   * stripped of the caller's `Llm` variables; its key must be set.
   */
  private async launch(context: ScenarioContext, script: Awaited<ReturnType<typeof stubScriptOf>> | null, sandbox: string, settingsFile: string): Promise<Launch> {
    const paths = teamPaths(context.team);
    const environment = this.environment.variables();
    if (context.profile.kind === 'stub' && script !== null) {
      const session = await this.stub.start(script);
      try {
        // The last step of the set-up: what the stub must be laid over is read from the team's configuration.
        const profile = await this.resolveProfile.execute(context.team, context.profile.name, { stubPort: session.port });
        // The run reads this file instead of the one it would have resolved (`--settings` ends Orkeon's
        // chain): the same settings, their `Llm` section rewritten for the default provider and every profile.
        // A C# team: the host's files merged into one, which the host reads alone (`--settings`).
        const original =
          context.kind === 'csharp'
            ? mergeHostSettings(await Promise.all([...profile.settingsFiles].reverse().map((file) => readSettingsFile(this.fileSystem, file))))
            : profile.settingsFile === null
              ? null
              : await readSettingsFile(this.fileSystem, profile.settingsFile);
        const stub = { baseUrl: session.baseUrl, model: STUB_MODEL, apiKey: STUB_API_KEY };
        await this.fileSystem.makeDirectory(joinPath(sandbox, SANDBOX_PRIVATE_FOLDER));
        await this.fileSystem.writeText(settingsFile, `${JSON.stringify(stubSettings(original, stub, profile.orkeonProfiles, profile.decisionProfiles.map((decisionProfile) => decisionProfile.id)), null, 2)}\n`);
        // None of the caller's `Llm` variables, whatever their case: the stub is the only model the run can reach.
        return { settingsFile, settingsSource: profile.settingsFile, generated: true, env: stubRunVariables(environment, profile.variables), session, model: STUB_MODEL, provider: null, decisionModel: 'none', decisionProvider: null, secrets: [] };
      } catch (error) {
        await session.stop();
        throw error;
      }
    }
    const own = (await this.fileSystem.exists(paths.settingsFile)) && !(await this.fileSystem.isDirectory(paths.settingsFile));
    // A C# team's host reads settings/<slug>/appsettings.json itself, over the team folder's files:
    // --settings would make it read that file alone.
    const teamSettings = own && context.kind !== 'csharp' ? paths.settingsFile : null;
    // The level's decision block (D96) is laid over the run's environment, on the machine and a named profile.
    if (context.profile.kind === 'machine') {
      const profile = await this.resolveProfile.execute(context.team, context.profile.name, { level: context.level });
      return {
        settingsFile: teamSettings,
        settingsSource: profile.settingsFile,
        generated: false,
        env: overlayVariables(environment, profile.decisionVariables),
        session: null,
        model: '',
        provider: profile.target.baseUrlHost,
        ...decisionModelOf(profile),
        secrets: decisionSecrets(profile, this.environment),
      };
    }
    const profile = await this.resolveProfile.execute(context.team, context.profile.name, { level: context.level });
    if (!profile.keyPresent) {
      throw new ApplicationError('invalid-input', `profile "${context.profile.name}": ${profile.keyEnv ?? 'its key variable'} is not set — export it before the run (no key on disk)`);
    }
    const secrets = [...profile.secretNames.map((name) => profile.variables[name] ?? '').filter((value) => value.length > 0), ...decisionSecrets(profile, this.environment)];
    return {
      settingsFile: teamSettings,
      settingsSource: profile.settingsFile,
      generated: false,
      env: overlayVariables({ ...withoutLlmVariables(environment), ...profile.variables }, profile.decisionVariables),
      session: null,
      model: context.profile.model,
      provider: profile.target.baseUrlHost,
      ...decisionModelOf(profile),
      secrets,
    };
  }

  /**
   * The command of a run: `orkeon run <target>` from the team folder, or — a C# team — its host,
   * `dotnet run --project <host project> --no-build -- --team-dir <team>` from `host/`, which takes
   * the same options and writes the same event stream (`--events -`: the events on stdout, the
   * answer on stderr).
   */
  private command(context: ScenarioContext, launch: Launch, bindings: readonly MountBinding[], settingsFile: string): RunCommand {
    const settings = launch.generated ? settingsFile : launch.settingsFile;
    const options = [...(context.noDecision === true ? ['--no-decision'] : []), ...(settings === null ? [] : ['--settings', settings]), ...mountArguments(bindings)];
    if (context.kind === 'csharp') {
      if (context.hostProject === undefined || context.hostProject === null) {
        throw new ApplicationError('invalid-input', `${context.team.slug} is a C# team whose host project could not be read (see the crew-layout check of L0)`);
      }
      return {
        command: 'dotnet',
        args: hostRunArguments(context.hostProject, context.team.folder, ['--events', '-', ...options]),
        cwd: joinPath(context.team.folder, HOST_FOLDER),
        env: { ...launch.env, DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
      };
    }
    return { command: 'orkeon', args: ['run', RUN_TARGETS[context.kind], '--events', 'jsonl', ...options], cwd: context.team.folder, env: launch.env };
  }

  /** One `orkeon run`: the only one of the scenario, or a step of its sequence, stopped after the task `kill_after_task` names. */
  private async step(context: ScenarioContext, step: SequenceStep | null, datasetFolder: string | null, launch: Launch, bindings: readonly MountBinding[], timeoutSeconds: number, settingsFile: string): Promise<StepOutcome> {
    let killed = false;
    let kill: () => void = () => undefined;
    const killRequested = new Promise<void>((resolve) => {
      kill = resolve;
    });
    const onLine = step?.kill_after_task === undefined ? undefined : (line: string): void => {
      if (!killed && completesTask(line, step.kill_after_task as string)) {
        killed = true;
        kill();
      }
    };
    const run = this.command(context, launch, bindings, settingsFile);
    const result = await this.processes.run(run.command, run.args, {
      cwd: run.cwd,
      timeoutMs: timeoutSeconds * 1000,
      env: run.env,
      // Closed at once: a question to a person is refused instead of waiting for ever.
      input: '',
      // A launcher or a wrapper may stand between the bench and the run: stopping it stops them all.
      ownGroup: true,
      cancel: onLine === undefined ? context.watch.requested : Promise.race([context.watch.requested, killRequested]),
      ...(onLine === undefined ? {} : { onLine }),
    });
    return { step, datasetFolder, result, events: parseRunEvents(result.stdout), killed: killed && result.stopped === 'cancelled' && !context.watch.isRequested() };
  }

  /** What the archive rules of the invariants read in this run (plan § 2 bis). */
  private async facts(context: ScenarioContext, events: RunEvents, checks: readonly CheckResult[], readOnlyChanged: readonly string[], stdout: string, stderr: string, snapshot: string, secrets: readonly string[]): Promise<ScenarioFacts> {
    const toolsCalled = events.toolCalls.map((call) => call.tool);
    const toolsUnknown = context.tools === null ? [] : [...new Set(toolsCalled.filter((tool) => !(context.tools as readonly string[]).includes(tool)))];
    const secretsFound: string[] = [];
    for (const [where, text] of [
      ['events.jsonl', stdout],
      ['stderr.log', stderr],
    ] as const) {
      secretsFound.push(...findSecrets(text, secrets).map((kind) => `${where} (${kind})`));
    }
    for (const file of await this.textFiles(snapshot)) {
      secretsFound.push(...findSecrets(await this.fileSystem.readText(file), secrets).map((kind) => `output-snapshot/${file.slice(snapshot.length + 1)} (${kind})`));
    }
    const failedOf = (type: string): string[] => checks.filter((check) => check.type === type && check.status === 'fail').map((check) => check.id);
    return { read_only_changed: [...readOnlyChanged], secrets_found: secretsFound, tools_called: toolsCalled, tools_unknown: toolsUnknown, schema_failed: failedOf('json-schema'), text_absent_failed: failedOf('text-absent') };
  }

  /** The text files at or below a folder, without following any link. */
  private async textFiles(folder: string): Promise<string[]> {
    const files: string[] = [];
    for (const name of await this.fileSystem.list(folder)) {
      const path = joinPath(folder, name);
      if (await this.fileSystem.isDirectory(path)) {
        files.push(...(await this.textFiles(path)));
      } else if (isText(await this.fileSystem.readBytes(path))) {
        files.push(path);
      }
    }
    return files;
  }

  /**
   * The folder of the run: the first free `RUN-<stamp>-<profile>[-n]`, taken by creating it with a
   * call that fails when it exists — two runs started together never share one.
   */
  private async reserveRun(runs: string, target: string): Promise<{ run: RunId; folder: string }> {
    await this.fileSystem.makeDirectory(runs);
    const taken = await this.fileSystem.list(runs);
    for (;;) {
      const run = nextRunId(this.clock.now(), target, taken);
      const folder = joinPath(runs, run);
      if (await this.fileSystem.makeDirectoryExclusive(folder)) {
        return { run, folder };
      }
      taken.push(run);
    }
  }

  /** `tests/<slug>/datasets/<name>`, else the shared `library/datasets/<name>`; null for a scenario without a dataset. */
  private async datasetFolder(team: TeamRef, scenario: Scenario, name: string | null): Promise<string | null> {
    if (name === null) {
      return null;
    }
    const own = joinPath(teamPaths(team).tests, 'datasets', name);
    const shared = joinPath(workshopOfTeam(team.folder), 'library', 'datasets', name);
    for (const folder of [own, shared]) {
      if (await this.fileSystem.isDirectory(folder)) {
        await this.refuseLinks(scenario, name, folder);
        return folder;
      }
    }
    throw new ApplicationError('invalid-input', `dataset "${name}" not found: neither ${own} nor ${shared} exists`);
  }

  /**
   * A dataset is plain files and folders. A symbolic link in it would be copied into the sandbox as
   * a link: the team could read or write through it what lies outside its mount points, and the
   * bench would judge and archive what the link points to.
   */
  private async refuseLinks(_scenario: Scenario, name: string, dataset: string): Promise<void> {
    const links = await this.fileSystem.symbolicLinks(dataset);
    if (links.length > 0) {
      const named = links.map((link) => (link === '.' ? 'the dataset folder itself' : link)).join(', ');
      throw new ApplicationError('invalid-input', `dataset "${name}" holds ${links.length === 1 ? 'a symbolic link' : 'symbolic links'} (${named}) in ${dataset}: a dataset is plain files and folders — replace each link with a copy of what it points to`);
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

  /** The files of the dataset of a later step, laid over the folders of the sandbox: what the step before left stays. */
  private async overlay(points: readonly BoundPoint[], folders: ReadonlyMap<string, string>): Promise<void> {
    for (const point of points) {
      const target = folders.get(point.binding.root);
      if (point.source !== null && target !== undefined) {
        await this.copyOver(point.source, target);
      }
    }
  }

  private async copyOver(from: string, to: string): Promise<void> {
    await this.fileSystem.makeDirectory(to);
    for (const name of await this.fileSystem.list(from)) {
      const source = joinPath(from, name);
      const target = joinPath(to, name);
      if (await this.fileSystem.isDirectory(source)) {
        await this.copyOver(source, target);
      } else {
        await this.fileSystem.writeBytes(target, await this.fileSystem.readBytes(source));
      }
    }
  }

  private async digests(points: readonly BoundPoint[], folders: ReadonlyMap<string, string>): Promise<Map<string, string>> {
    const digests = new Map<string, string>();
    for (const point of points) {
      digests.set(point.binding.root, (await this.fileSystem.digest(folders.get(point.binding.root) as string)).sha256);
    }
    return digests;
  }

  /** The read-only points whose content is not what it was before the step. */
  private async changedPoints(points: readonly BoundPoint[], folders: ReadonlyMap<string, string>, before: ReadonlyMap<string, string>): Promise<string[]> {
    if (points.length === 0) {
      return [];
    }
    const after = await this.digests(points, folders);
    return points.map((point) => point.binding.root as string).filter((root) => after.get(root) !== before.get(root));
  }

  /** What the checks of the scenario are judged on, read where the run left it. */
  /**
   * The tasks of the team's YAML crew with their agent's role, when a check names a task
   * (`task-skipped`): the events name a task by its role alone (`resolveTaskName`). Empty otherwise,
   * and for a TypeScript crew.
   */
  private async crewTasks(team: TeamRef, scenario: Scenario): Promise<CrewTask[]> {
    if (!scenario.checks.some((check) => check.type === 'task-skipped')) {
      return [];
    }
    const crew = teamPaths(team).crew;
    const tasksFolder = joinPath(crew, 'tasks');
    if (!(await this.fileSystem.exists(tasksFolder)) || !(await this.fileSystem.isDirectory(tasksFolder))) {
      return [];
    }
    const readYaml = async (path: string): Promise<Record<string, unknown> | null> => {
      try {
        const value = parseYaml(await this.fileSystem.readText(path)) as unknown;
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    const tasks: CrewTask[] = [];
    for (const file of (await this.fileSystem.list(tasksFolder)).sort()) {
      const stem = /^(.+)\.ya?ml$/i.exec(file)?.[1];
      if (stem === undefined) {
        continue;
      }
      const task = await readYaml(joinPath(tasksFolder, file));
      const agent = typeof task?.agent === 'string' && task.agent.trim() !== '' ? task.agent.trim() : null;
      let role: string | null = null;
      if (agent !== null) {
        for (const name of [`${agent}.yaml`, `${agent}.yml`]) {
          const path = joinPath(crew, 'agents', name);
          if (await this.fileSystem.exists(path)) {
            const definition = await readYaml(path);
            role = typeof definition?.role === 'string' && definition.role.trim() !== '' ? definition.role.trim() : null;
            break;
          }
        }
      }
      tasks.push({ stem, agent, role });
    }
    return tasks;
  }

  private async fileEvidence(
    team: TeamRef,
    scenario: Scenario,
    folders: ReadonlyMap<string, string>,
    dataset: string | null,
    links: readonly string[],
  ): Promise<{ files: Map<string, FileEvidence>; expected: Map<string, string | null>; sameBytes: Map<string, boolean>; schemaViolations: Map<string, readonly string[]> }> {
    const files = new Map<string, FileEvidence>();
    const expected = new Map<string, string | null>();
    const same = new Map<string, boolean>();
    const schemaViolations = new Map<string, readonly string[]>();
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
      if (check.type === 'json-schema' && actual !== null) {
        schemaViolations.set(check.id, await this.schemaViolations(team, check.schema, decode(actual)));
      }
    }
    return { files, expected, sameBytes: same, schemaViolations };
  }

  /**
   * What the schema `file` — a path from the workshop, `library/schemas/…` — refuses in `text`: its
   * violations, or the one reason the schema could not be used. The document is known to be JSON
   * or not by the check itself.
   */
  private async schemaViolations(team: TeamRef, file: string, text: string): Promise<readonly string[]> {
    const path = joinPath(workshopOfTeam(team.folder), file);
    let schema: unknown;
    try {
      schema = await readJsonFile(this.fileSystem, path);
    } catch (error) {
      return [`the schema ${file} cannot be read: ${(error as Error).message}`];
    }
    let document: unknown;
    try {
      document = JSON.parse(text) as unknown;
    } catch {
      return [];
    }
    const validation = this.schemas.validate(schema, document);
    return validation.schemaError === null ? validation.violations : [`the schema ${file} cannot be used: ${validation.schemaError}`];
  }

  /** The content of a file; null when there is none to read (absent, or a folder). */
  private async bytesOf(path: string): Promise<Uint8Array | null> {
    if (!(await this.fileSystem.exists(path)) || (await this.fileSystem.isDirectory(path))) {
      return null;
    }
    return this.fileSystem.readBytes(path);
  }

  /** What the manifest of the dataset says of it, for the manifest of the run. */
  private async datasetIdentity(name: string | null, dataset: string): Promise<{ name: string | null; folder: string; version: unknown; sha256: unknown }> {
    const manifestFile = joinPath(dataset, 'manifest.json');
    const manifest = (await this.fileSystem.exists(manifestFile)) ? await readJsonFile(this.fileSystem, manifestFile).catch(() => null) : null;
    const record = typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>) : {};
    return { name, folder: dataset, version: record.version ?? null, sha256: record.sha256 ?? null };
  }
}

/** True when the line is a `task.completed` event of the task or the agent `name` names. */
export function completesTask(line: string, name: string): boolean {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    return event.kind === 'task.completed' && [event.taskId, event.taskName, event.agentRole, event.agentId].some((value) => value === name);
  } catch {
    return false;
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * A read-only point holds after the run what it held before: Orkeon refuses a write there, so a
 * difference means something went round its file system. Absent when the team has no read-only point.
 */
function readOnlyCheck(points: readonly BoundPoint[], changed: readonly string[]): CheckResult[] {
  if (points.length === 0) {
    return [];
  }
  return [
    {
      id: READ_ONLY_CHECK,
      type: 'read-only-points',
      status: changed.length === 0 ? 'pass' : 'fail',
      detail: changed.length === 0 ? '' : `the content of ${changed.join(', ')} changed during the run: a read-only mount point was written`,
    },
  ];
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
function notRun(context: ScenarioContext, id: string, file: string, scenario: Scenario | null, iteration: number, detail: string): ScenarioResult {
  return {
    id,
    title: scenario?.title ?? '',
    file,
    level: context.level,
    iteration,
    status: 'fail',
    covers: scenario?.covers ?? [],
    run: null,
    dataset: scenario?.dataset ?? null,
    datasets: scenario === null ? [] : scenarioDatasets(scenario),
    model: '',
    exit_code: null,
    duration_seconds: 0,
    tokens_in: 0,
    tokens_out: 0,
    usd: null,
    tool_calls: 0,
    human_inputs: 0,
    indicators: scenario?.indicators ?? [],
    checks: [failure(SETUP_CHECK, detail)],
    facts: NO_FACTS,
  };
}

/**
 * The decision key a run with a decision block sends (D96), read from the variable the active provider
 * takes it from: searched in what the run leaves behind, like a profile's key. Empty without a block.
 */
/** Whether the run has a decision provider (a refused one counts: the run fails at start), and which, from where. */
function decisionModelOf(profile: ProfileResolution): Pick<Launch, 'decisionModel' | 'decisionProvider'> {
  const effective = profile.decisionModel?.effective;
  if (effective === undefined || !effective.configured) {
    return { decisionModel: 'none', decisionProvider: null };
  }
  const name = effective.provider === null ? 'a refused decision provider' : decisionProvider(effective.provider).displayName;
  // A key variable by its name, a settings file by its path, the variable layers without the names of what they hold.
  const sources = [...new Set(effective.configuredBy.map((source) => (source.endsWith(' variables') ? 'environment variables' : source)))];
  return { decisionModel: 'active', decisionProvider: `${name} (${sources.join(', ')})` };
}

function decisionSecrets(profile: ProfileResolution, environment: Environment): string[] {
  const variable = profile.decisionBlock === null ? null : profile.decisionModel?.effective.keyVariable;
  const value = variable == null ? undefined : environment.get(variable);
  return value === undefined || value.length === 0 ? [] : [value];
}
