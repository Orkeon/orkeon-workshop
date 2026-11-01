import { parseAcceptance, type DeclaredIds } from '../../domain/acceptance.js';
import { REMOTE_APPROVAL_FILE, UNKNOWN_ORKEON_VERSION, withDesignSnapshot, withRuns } from '../../domain/attempt.js';
import { DEFAULT_BENCH_CONFIG, parseBenchConfig, priceOf, profileNamed, type BenchConfig, type Level } from '../../domain/bench-config.js';
import type { AttemptId, RunId } from '../../domain/ids.js';
import type { MachineFolders } from '../../domain/mounts/mount-reach.js';
import { joinPath } from '../../domain/paths.js';
import { MACHINE_PROFILE_NAME, STUB_PROFILE_NAME, type Profile } from '../../domain/profile.js';
import { reportSchema, type Report } from '../../domain/report.js';
import {
  acceptanceWarnings,
  buildReport,
  effectiveStatuses,
  levelStatus,
  renderReportMarkdown,
  replacedReport,
  replacesHigherLevel,
  reportRuns,
  scenarioLevelStatus,
  type LevelStatus,
  type PlannedScenario,
  type ReplacedReport,
  type RunOutcome,
  type ScenarioResult,
} from '../../domain/run-report.js';
import { LEVEL_LABELS, defaultMaxLevel, levelsUpTo, type RunRequest } from '../../domain/run.js';
import { parseScenario } from '../../domain/scenario.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { parseToolCatalogue } from '../../domain/tool-catalogue.js';
import { requireOpenAttempt, updateOpenAttempt, withAttemptsLock, writeAttemptManifest, type StoredAttempt } from '../attempts/attempt-store.js';
import { takeDesignSnapshot } from '../attempts/design-snapshot.js';
import { ApplicationError, InterruptedError } from '../errors.js';
import type { Clock, Environment, FileSystem, ProcessRunner, ShutdownSignal, ShutdownWatch, TreeDigest } from '../ports/index.js';
import type { ScenarioContext, ScenarioRunner } from '../runs/run-scenario.js';
import { leftoverSandboxes } from '../runs/sandbox.js';
import { SCENARIO_FOLDERS, StaticLevel, scenarioFiles, type StaticLevelResult } from '../runs/static-level.js';
import { UnitLevel } from '../runs/unit-level.js';
import { installedOrkeonVersion } from './orkeon-version.js';
import { readJsonFile } from './read-json-file.js';

export interface RunOptions extends RunRequest {
  /** Go on to the next level after a red one. */
  readonly continueAfterRed: boolean;
  /** `--no-decision`: passed on to every `orkeon run` of the scenario levels — decision tasks answer from their fallback. */
  readonly noDecision?: boolean;
}

export interface RunResult {
  readonly attempt: AttemptId;
  readonly report: Report;
  readonly reportFile: string;
  readonly reportMarkdownFile: string;
  /** The runs archived under `workbooks/<slug>/runs/`. */
  readonly runs: readonly RunId[];
  /** The status of each level this run reached, in order. */
  readonly levels: readonly { readonly level: Level; readonly status: LevelStatus; readonly note: string }[];
  /** True when a level that ran is red, or the level asked for ran nothing. */
  readonly failed: boolean;
  /** What the remote level cost, against the cap of the budget; null when it did not run. */
  readonly remote: { readonly usd: number; readonly capUsd: number } | null;
  /** What did not run and should not pass unseen. */
  readonly warnings: readonly string[];
}

/** The stdout line of `run` when the remote level needs an approval that is not there (FROZEN-LITERALS § 6). */
/** The levels each scenario folder holds. */
const FOLDER_LEVELS: Readonly<Record<(typeof SCENARIO_FOLDERS)[number], readonly Level[]>> = { component: ['component'], e2e: ['e2e_local', 'e2e_remote'] };

export function remoteApprovalNeeded(slug: string): string {
  return `remote level needs an approval: run orkeon-bench attempt approve ${slug} first`;
}

const LIST_TOOLS_TIMEOUT_MS = 60_000;

/** The scenario levels, their folder under `tests/<slug>/`, and their profile when `--profile` does not say. */
interface ScenarioLevelPlan {
  readonly level: 'component' | 'e2e_local' | 'e2e_remote';
  readonly folder: (typeof SCENARIO_FOLDERS)[number];
  readonly profile: Profile;
  readonly repeat: number;
  readonly passAt: number;
}

/**
 * `orkeon-bench run <team> [--level …] [--profile …]` (plan § 7.5): L0 static, L1 unit, L2
 * component on the simulated LLM, L3 end-to-end on the profile of `levels.e2e_local` (the machine
 * by default), L4 end-to-end on the profile of `levels.e2e_remote`, approved in the attempt — in
 * order, stopping at the first red level unless `--continue`. Without `--level`, the run reaches
 * the highest level `bench.config.json` configures, else L2. The report goes into the team's open
 * attempt — the report of an attempt is that of its last run —, the runs under `runs/`.
 *
 * Other commands may act on the attempt while a run is in flight: the manifest is never written
 * back from what the run read at its start. Its snapshot and its runs are recorded on the manifest
 * as it stands, under the lock, and a run that ends in an attempt closed meanwhile writes nothing
 * into it. A request to stop (SIGINT, SIGTERM) stops what the run started and is reported, exit 130;
 * a run killed outright cannot do so, and the next run names the sandbox it left.
 */
export class RunTestLevels {
  private readonly staticLevel: StaticLevel;
  private readonly unitLevel: UnitLevel;

  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly clock: Clock,
    environment: Environment,
    machine: MachineFolders,
    private readonly scenarios: ScenarioRunner,
    private readonly shutdown: ShutdownSignal,
    private readonly benchVersion: string,
  ) {
    this.staticLevel = new StaticLevel(fileSystem, processes, environment, machine);
    this.unitLevel = new UnitLevel(fileSystem, processes);
  }

  async execute(team: TeamRef, options: RunOptions): Promise<RunResult> {
    if (!(await this.fileSystem.isDirectory(team.folder))) {
      throw new ApplicationError('file-not-found', `nothing to run: ${team.folder} does not exist yet (the first build batch creates it, D35)`);
    }
    const attempt = await requireOpenAttempt(this.fileSystem, team);
    const warnings: string[] = [];
    const config = await this.loadConfig(team, warnings);
    const maxLevel = options.maxLevel ?? defaultMaxLevel(Object.keys(config.levels) as Level[]);
    const plans = await this.plan(team, attempt, config, { ...options, maxLevel });
    const orkeonVersion = await installedOrkeonVersion(this.processes);
    if (orkeonVersion === UNKNOWN_ORKEON_VERSION) {
      throw new ApplicationError('process-failed', 'orkeon --version gave no version: is orkeon on PATH?');
    }
    const watch = this.shutdown.watch();
    const runs: RunId[] = [];
    try {
      return await this.run(team, { ...options, maxLevel }, config, plans, attempt, orkeonVersion, watch, runs, warnings);
    } catch (error) {
      if (error instanceof InterruptedError) {
        // What ran is still listed in the attempt: the run folders exist, one of them says it was interrupted.
        const left = [...runs, ...(error.run === null ? [] : [error.run as RunId])];
        if (left.length > 0) {
          await updateOpenAttempt(this.fileSystem, team, attempt.id, (manifest) => withRuns(manifest, left)).catch(() => undefined);
        }
      }
      throw error;
    } finally {
      watch.release();
    }
  }

  /**
   * What each scenario level runs with, settled before anything starts: the stub at L2; at L3 the
   * profile of `levels.e2e_local`, the machine by default; at L4 the profile of `levels.e2e_remote`,
   * which must exist, and the approval of the open attempt. `--profile` names the profile of the
   * level `--level` names when it is L3 or L4.
   */
  private async plan(team: TeamRef, attempt: StoredAttempt, config: BenchConfig, options: RunOptions & { maxLevel: Level }): Promise<ScenarioLevelPlan[]> {
    const requested = levelsUpTo(options.maxLevel);
    if (options.profile !== null) {
      profileNamed(config, options.profile);
      if (options.profile !== STUB_PROFILE_NAME && !requested.includes('e2e_local')) {
        throw new ApplicationError('invalid-input', `--profile ${options.profile} applies to ${LEVEL_LABELS.e2e_local} and ${LEVEL_LABELS.e2e_remote}: ${LEVEL_LABELS[options.maxLevel]} runs on the simulated LLM`);
      }
    }
    const override = (level: Level): string | null => (options.profile !== null && options.maxLevel === level ? options.profile : null);
    const plans: ScenarioLevelPlan[] = [{ level: 'component', folder: 'component', profile: profileNamed(config, STUB_PROFILE_NAME), repeat: 1, passAt: 1 }];
    if (requested.includes('e2e_local')) {
      const settings = config.levels.e2e_local;
      const repeat = settings?.repeat ?? 1;
      plans.push({ level: 'e2e_local', folder: 'e2e', profile: profileNamed(config, override('e2e_local') ?? settings?.profile ?? MACHINE_PROFILE_NAME), repeat, passAt: settings?.pass_at ?? repeat });
    }
    if (requested.includes('e2e_remote')) {
      const name = override('e2e_remote') ?? config.levels.e2e_remote?.profile ?? null;
      if (name === null) {
        throw new ApplicationError('invalid-input', `remote level needs a profile: --profile <name>, or levels.e2e_remote.profile in ${teamPaths(team).benchConfigFile}`);
      }
      const profile = profileNamed(config, name);
      if (!(await this.fileSystem.exists(joinPath(attempt.folder, REMOTE_APPROVAL_FILE)))) {
        throw new ApplicationError('invalid-input', remoteApprovalNeeded(team.slug));
      }
      const settings = config.levels.e2e_remote;
      const repeat = settings?.repeat ?? 1;
      plans.push({ level: 'e2e_remote', folder: 'e2e', profile, repeat, passAt: settings?.pass_at ?? repeat });
    }
    return plans;
  }

  private async run(
    team: TeamRef,
    options: RunOptions & { maxLevel: Level },
    config: BenchConfig,
    plans: readonly ScenarioLevelPlan[],
    attempt: StoredAttempt,
    orkeonVersion: string,
    watch: ShutdownWatch,
    runs: RunId[],
    warnings: string[],
  ): Promise<RunResult> {
    const requested = levelsUpTo(options.maxLevel);
    const paths = teamPaths(team);
    // A run killed outright could not clean up after itself: said at the next run, never removed on sight.
    const leftovers = await leftoverSandboxes(this.fileSystem);
    if (leftovers !== null) {
      warnings.push(leftovers);
    }
    // The snapshot is retaken by every run: it is the design this run measures, not the one the attempt opened on.
    const crew = await this.retakeSnapshot(team, attempt.id);
    const replaces = await this.reportInPlace(attempt.folder);

    const started = this.clock.now();
    const statics = await this.staticLevel.execute(team, watch);
    this.stopIfRequested(watch, 'after the static checks');
    const levels: { level: Level; status: LevelStatus; note: string }[] = [{ level: 'static', status: levelStatus(statics.checks), note: '' }];
    const staticSeconds = this.secondsSince(started);
    for (const check of statics.checks.filter((candidate) => candidate.status === 'skipped')) {
      warnings.push(`static check ${check.id} skipped: ${check.detail}`);
    }
    const red = (): Level | null => levels.find((entry) => entry.status === 'fail')?.level ?? null;
    const blocked = (): string | null => {
      const level = options.continueAfterRed ? null : red();
      return level === null ? null : `not run: ${LEVEL_LABELS[level]} is red`;
    };

    let unit = { status: 'skipped' as LevelStatus, passed: 0, failed: 0, duration_seconds: 0, note: 'not requested' };
    if (requested.includes('unit')) {
      const unitStarted = this.clock.now();
      const stop = blocked();
      if (stop !== null) {
        unit = { ...unit, note: stop };
      } else {
        const result = await this.unitLevel.execute(team, watch);
        this.stopIfRequested(watch, 'after the unit tests');
        if (result.warning !== null) {
          warnings.push(result.warning);
        }
        unit = { status: result.status, passed: result.passed, failed: result.failed, duration_seconds: this.secondsSince(unitStarted), note: result.note };
      }
      levels.push({ level: 'unit', status: unit.status, note: unit.note });
    }

    const tools = plans.some((plan) => requested.includes(plan.level)) ? await this.toolCatalogue() : null;
    const declared = await this.declared(team, warnings);
    if (tools === null && (declared?.invariants ?? []).some((invariant) => invariant.id === 'INV-TOOLS')) {
      warnings.push('orkeon run --list-tools gave no catalogue: INV-TOOLS is checked against no list — a tool the catalogue does not know passes unseen');
    }
    const byLevel = new Map<Level, { scenarios: ScenarioResult[]; seconds: number; note: string; model: string; status: LevelStatus }>();
    for (const plan of plans) {
      if (!requested.includes(plan.level)) {
        continue;
      }
      const levelStarted = this.clock.now();
      const stop = blocked();
      const scenarios: ScenarioResult[] = [];
      let note = '';
      let empty = false;
      if (stop !== null) {
        note = stop;
      } else if (statics.kind === null || statics.mounts === null) {
        note = 'not run: the crew or its mounts.json cannot be read';
      } else {
        const files = await this.scenarioFilesOf(team, plan);
        if (files.length === 0) {
          // The level asked for ran nothing: that proves nothing, and is not a success.
          empty = true;
          note = `no scenario of level ${plan.level} in ${joinPath(paths.tests, plan.folder)}: ${LEVEL_LABELS[plan.level]} was asked for and ran nothing`;
        } else {
          const context = { ...this.context(team, attempt, statics, orkeonVersion, crew, watch, plan, config, tools), noDecision: options.noDecision === true };
          for (const file of files) {
            for (let iteration = 1; iteration <= plan.repeat; iteration += 1) {
              this.stopIfRequested(watch, 'between two scenarios');
              const result = await this.scenarios.execute(context, file, iteration);
              scenarios.push(result);
              if (result.run !== null) {
                runs.push(result.run);
              }
            }
          }
        }
      }
      const model = plan.profile.kind === 'named' ? plan.profile.model : plan.profile.kind === 'stub' ? plan.profile.model : (scenarios.find((scenario) => scenario.model.length > 0)?.model ?? '');
      const entry = { scenarios, seconds: scenarios.length === 0 ? 0 : this.secondsSince(levelStarted), note, model, status: 'skipped' as LevelStatus };
      byLevel.set(plan.level, entry);
      entry.status = empty ? 'fail' : this.levelStatusOf(plan, scenarios);
      levels.push({ level: plan.level, status: entry.status, note });
    }

    const of = (level: Level): { scenarios: ScenarioResult[]; seconds: number; note: string; model: string; status: LevelStatus } =>
      byLevel.get(level) ?? { scenarios: [], seconds: 0, note: 'not requested', model: '', status: 'skipped' };
    const local = plans.find((plan) => plan.level === 'e2e_local');
    const remote = plans.find((plan) => plan.level === 'e2e_remote');
    const remoteUsd = of('e2e_remote').scenarios.reduce((total, scenario) => total + (scenario.usd ?? 0), 0);
    const outcome: RunOutcome = {
      team: team.slug,
      attempt: attempt.id,
      date: started,
      orkeonVersion,
      benchVersion: this.benchVersion,
      requested: options.maxLevel,
      replaces,
      static: { status: levels[0]?.status ?? 'skipped', checks: statics.checks, duration_seconds: staticSeconds, note: '' },
      unit,
      component: { status: of('component').status, scenarios: of('component').scenarios, duration_seconds: of('component').seconds, note: of('component').note },
      e2e_local: {
        status: of('e2e_local').status,
        scenarios: of('e2e_local').scenarios,
        duration_seconds: of('e2e_local').seconds,
        note: of('e2e_local').note,
        model: of('e2e_local').model,
        repeat: local?.repeat ?? 1,
        passAt: local?.passAt ?? 1,
      },
      e2e_remote: {
        status: of('e2e_remote').status,
        scenarios: of('e2e_remote').scenarios,
        duration_seconds: of('e2e_remote').seconds,
        note: of('e2e_remote').note,
        provider: remote?.profile.kind === 'named' ? hostOf(remote.profile.baseUrl) : '',
        model: of('e2e_remote').model,
        usd: Math.round(remoteUsd * 1_000_000) / 1_000_000,
      },
      budget: config.budget,
      declared,
      planned: await this.planned(team),
      wallSeconds: this.secondsSince(started),
    };
    const report = buildReport(outcome);
    warnings.push(...acceptanceWarnings(outcome), ...this.unprovenWarnings(report));
    if (replacesHigherLevel(options.maxLevel, replaces) && replaces !== null && replaces.reached !== null) {
      const evidence = replaces.runs.length === 0 ? '' : ` — its evidence stays in ${replaces.runs.map((run) => joinPath(paths.runs, run)).join(', ')}`;
      warnings.push(
        `this run reached ${LEVEL_LABELS[options.maxLevel]} and replaces the report of ${replaces.date}, which reached ${LEVEL_LABELS[replaces.reached]}: the report of an attempt is that of its last run${evidence}`,
      );
    }

    const reportFile = joinPath(attempt.folder, 'report.json');
    const reportMarkdownFile = joinPath(attempt.folder, 'REPORT.md');
    const allScenarios = [...of('component').scenarios, ...of('e2e_local').scenarios, ...of('e2e_remote').scenarios];
    // Under the lock, on the manifest as it is now: closed meanwhile, the attempt is immutable and gets nothing.
    await withAttemptsLock(this.fileSystem, team, async () => {
      const current = await requireOpenAttempt(this.fileSystem, team).catch(() => null);
      if (current === null || current.id !== attempt.id) {
        const archived = runs.length === 0 ? '' : ` — its runs stay under ${paths.runs}: ${runs.join(', ')}`;
        throw new ApplicationError('invalid-input', `${attempt.id} was closed while this run was in flight: a closed attempt is immutable, the report was not written${archived}`);
      }
      await this.fileSystem.writeText(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      await this.fileSystem.writeText(reportMarkdownFile, renderReportMarkdown(report, outcome));
      await writeAttemptManifest(this.fileSystem, current.folder, withRuns(current.manifest, reportRuns(allScenarios)));
    });

    return {
      attempt: attempt.id,
      report,
      reportFile,
      reportMarkdownFile,
      runs: reportRuns(allScenarios),
      levels,
      failed: levels.some((entry) => entry.status === 'fail'),
      remote: byLevel.has('e2e_remote') && of('e2e_remote').note === '' ? { usd: outcome.e2e_remote.usd, capUsd: config.budget.remote_usd_max } : null,
      warnings,
    };
  }

  private context(team: TeamRef, attempt: StoredAttempt, statics: StaticLevelResult, orkeonVersion: string, crew: TreeDigest | null, watch: ShutdownWatch, plan: ScenarioLevelPlan, config: BenchConfig, tools: readonly string[] | null): ScenarioContext {
    return {
      team,
      attempt: attempt.id,
      kind: statics.kind as NonNullable<StaticLevelResult['kind']>,
      mounts: statics.mounts as NonNullable<StaticLevelResult['mounts']>,
      orkeonVersion,
      benchVersion: this.benchVersion,
      crew,
      watch,
      level: plan.level,
      profile: plan.profile,
      price: priceOf(config, plan.profile.name),
      tools,
    };
  }

  /** The status of a scenario level: on the scenarios as they pass at that level, their iterations together. */
  private levelStatusOf(plan: ScenarioLevelPlan, scenarios: readonly ScenarioResult[]): LevelStatus {
    const effective = effectiveStatuses({ component: { scenarios: [] }, e2e_local: { scenarios: [], passAt: plan.passAt }, e2e_remote: { scenarios: [] }, [plan.level]: { scenarios, passAt: plan.passAt } } as unknown as RunOutcome);
    return scenarioLevelStatus(scenarios, effective);
  }

  /** The scenarios of the folder of a level that are of that level; one that does not parse is the business of the static check. */
  private async scenarioFilesOf(team: TeamRef, plan: ScenarioLevelPlan): Promise<string[]> {
    const files: string[] = [];
    for (const file of await scenarioFiles(this.fileSystem, team, plan.folder)) {
      try {
        const scenario = parseScenario(await readJsonFile(this.fileSystem, joinPath(teamPaths(team).tests, file)), file);
        // A scenario of the other level of the folder belongs to another plan; one of a level the folder
        // does not hold runs here and fails on its level, so that no file passes unseen.
        if (scenario.level === plan.level || !FOLDER_LEVELS[plan.folder].includes(scenario.level)) {
          files.push(file);
        }
      } catch {
        if (plan.level === 'component') {
          // A component scenario that does not parse still runs, and fails with the reason: it was always so.
          files.push(file);
        }
      }
    }
    return files;
  }

  /** The tools `orkeon run --list-tools` names; null when it gives none (`INV-TOOLS` is then checked against nothing). */
  private async toolCatalogue(): Promise<readonly string[] | null> {
    const listed = await this.processes.run('orkeon', ['run', '--list-tools'], { timeoutMs: LIST_TOOLS_TIMEOUT_MS });
    if (!listed.found || listed.exitCode !== 0) {
      return null;
    }
    const tools = parseToolCatalogue(listed.stdout);
    return tools.length === 0 ? null : tools;
  }

  private async loadConfig(team: TeamRef, warnings: string[]): Promise<BenchConfig> {
    const path = teamPaths(team).benchConfigFile;
    if (!(await this.fileSystem.exists(path))) {
      return DEFAULT_BENCH_CONFIG;
    }
    try {
      return parseBenchConfig(await readJsonFile(this.fileSystem, path));
    } catch (error) {
      warnings.push(`${path} cannot be read (${(error as Error).message}): the defaults apply — the static check says so`);
      return DEFAULT_BENCH_CONFIG;
    }
  }

  /** The design snapshot of the attempt, taken again, and the digest of the crew it holds; null when the team has no crew. */
  private async retakeSnapshot(team: TeamRef, attempt: AttemptId): Promise<TreeDigest | null> {
    return withAttemptsLock(this.fileSystem, team, async () => {
      const current = await requireOpenAttempt(this.fileSystem, team);
      if (current.id !== attempt) {
        throw new ApplicationError('invalid-input', `${attempt} is no longer the open attempt of ${team.slug}`);
      }
      const crew = await takeDesignSnapshot(this.fileSystem, team, current.folder);
      if (crew !== null && current.manifest.design_snapshot === null) {
        await writeAttemptManifest(this.fileSystem, current.folder, withDesignSnapshot(current.manifest));
      }
      return crew;
    });
  }

  /** What the attempt holds as its report before this run replaces it; null when it has none that reads. */
  private async reportInPlace(attemptFolder: string): Promise<ReplacedReport | null> {
    const file = joinPath(attemptFolder, 'report.json');
    if (!(await this.fileSystem.exists(file))) {
      return null;
    }
    const parsed = reportSchema.safeParse(await readJsonFile(this.fileSystem, file).catch(() => null));
    return parsed.success ? replacedReport(parsed.data) : null;
  }

  private async declared(team: TeamRef, warnings: string[]): Promise<DeclaredIds | null> {
    const path = teamPaths(team).teamFile;
    if (!(await this.fileSystem.exists(path))) {
      warnings.push(`${path} does not exist: no criterion is proven without it — a criterion passes at the level TEAM.md declares for it`);
      return null;
    }
    return parseAcceptance(await this.fileSystem.readText(path));
  }

  /** One line for the invariants and one for the indicators the report leaves unproven. */
  private unprovenWarnings(report: Report): string[] {
    const notRun = (entries: Record<string, { status: string; note?: unknown }>): string[] =>
      Object.entries(entries).flatMap(([id, entry]) => (entry.status === 'not_run' ? [`${id} (${typeof entry.note === 'string' ? entry.note : 'not run'})`] : []));
    const invariants = notRun(report.invariants as Record<string, { status: string; note?: unknown }>);
    const indicators = notRun(report.indicators as Record<string, { status: string; note?: unknown }>);
    return [
      ...(invariants.length === 0 ? [] : [`not proven: ${invariants.join('; ')} — all_inv_pass stays false`]),
      ...(indicators.length === 0 ? [] : [`not computed: ${indicators.join('; ')} — indicators_in_range stays false`]),
    ];
  }

  /** Every scenario of the tests that parses; one that does not is the business of the static check. */
  private async planned(team: TeamRef): Promise<PlannedScenario[]> {
    const planned: PlannedScenario[] = [];
    for (const folder of SCENARIO_FOLDERS) {
      for (const file of await scenarioFiles(this.fileSystem, team, folder)) {
        try {
          const scenario = parseScenario(await readJsonFile(this.fileSystem, joinPath(teamPaths(team).tests, file)), file);
          planned.push({ id: scenario.id, level: scenario.level, covers: scenario.covers });
        } catch {
          continue;
        }
      }
    }
    return planned;
  }

  private stopIfRequested(watch: ShutdownWatch, when: string): void {
    if (watch.isRequested()) {
      throw new InterruptedError(`interrupted ${when}: nothing was left running, no report was written`);
    }
  }

  private secondsSince(start: Date): number {
    return Math.max(0, (this.clock.now().getTime() - start.getTime()) / 1000);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
