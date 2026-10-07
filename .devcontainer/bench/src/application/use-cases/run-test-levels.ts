import { parseAcceptance, type DeclaredIds } from '../../domain/acceptance.js';
import { UNKNOWN_ORKEON_VERSION, withDesignSnapshot, withRuns } from '../../domain/attempt.js';
import type { Level } from '../../domain/bench-config.js';
import { ID_PATTERNS, type AttemptId, type RunId } from '../../domain/ids.js';
import type { MachineFolders } from '../../domain/mounts/mount-reach.js';
import { joinPath } from '../../domain/paths.js';
import { reportSchema, type Report } from '../../domain/report.js';
import {
  acceptanceWarnings,
  buildReport,
  levelStatus,
  renderReportMarkdown,
  replacedReport,
  replacesHigherLevel,
  reportRuns,
  type LevelStatus,
  type PlannedScenario,
  type ReplacedReport,
  type RunOutcome,
  type ScenarioResult,
} from '../../domain/run-report.js';
import { LEVEL_LABELS, levelsUpTo, unsupportedRunRequest, type RunRequest } from '../../domain/run.js';
import { parseScenario } from '../../domain/scenario.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { requireOpenAttempt, updateOpenAttempt, withAttemptsLock, writeAttemptManifest, type StoredAttempt } from '../attempts/attempt-store.js';
import { takeDesignSnapshot } from '../attempts/design-snapshot.js';
import { ApplicationError, InterruptedError } from '../errors.js';
import type { Clock, Environment, FileSystem, ProcessRunner, ShutdownSignal, ShutdownWatch, TreeDigest } from '../ports/index.js';
import type { ScenarioRunner } from '../runs/run-scenario.js';
import { leftoverSandboxes } from '../runs/sandbox.js';
import { SCENARIO_FOLDERS, StaticLevel, scenarioFiles } from '../runs/static-level.js';
import { installedOrkeonVersion } from './orkeon-version.js';
import { readJsonFile } from './read-json-file.js';

export interface RunOptions extends RunRequest {
  /** Go on to the next level after a red one. */
  readonly continueAfterRed: boolean;
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
  /** What did not run and should not pass unseen. */
  readonly warnings: readonly string[];
}

/**
 * `orkeon-bench run <team> --level …` (plan § 7.5), as far as this version goes: L0 static, then
 * L2 component — the scenarios of `tests/<slug>/component/` against the simulated LLM — stopping at
 * the first red level. L1 is reported `skipped`; L3, L4, L1 as the level to reach and any profile
 * but the stub are refused before anything starts. The report goes into the team's open attempt —
 * the report of an attempt is that of its last run —, the runs under `runs/`.
 *
 * Other commands may act on the attempt while a run is in flight: the manifest is never written
 * back from what the run read at its start. Its snapshot and its runs are recorded on the manifest
 * as it stands, under the lock, and a run that ends in an attempt closed meanwhile writes nothing
 * into it. A request to stop (SIGINT, SIGTERM) stops what the run started and is reported, exit 130;
 * a run killed outright cannot do so, and the next run names the sandbox it left.
 */
export class RunTestLevels {
  private readonly staticLevel: StaticLevel;

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
  }

  async execute(team: TeamRef, options: RunOptions): Promise<RunResult> {
    const unsupported = unsupportedRunRequest(options);
    if (unsupported !== null || options.maxLevel === null) {
      throw new ApplicationError('not-implemented', `run: not implemented yet (lot 4): ${unsupported ?? ''}`);
    }
    if (!(await this.fileSystem.isDirectory(team.folder))) {
      throw new ApplicationError('file-not-found', `nothing to run: ${team.folder} does not exist yet (the first build batch creates it, D35)`);
    }
    const attempt = await requireOpenAttempt(this.fileSystem, team);
    const orkeonVersion = await installedOrkeonVersion(this.processes);
    if (orkeonVersion === UNKNOWN_ORKEON_VERSION) {
      throw new ApplicationError('process-failed', 'orkeon --version gave no version: is orkeon on PATH?');
    }
    const watch = this.shutdown.watch();
    const runs: RunId[] = [];
    try {
      return await this.run(team, { ...options, maxLevel: options.maxLevel }, attempt, orkeonVersion, watch, runs);
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

  private async run(team: TeamRef, options: RunOptions & { maxLevel: Level }, attempt: StoredAttempt, orkeonVersion: string, watch: ShutdownWatch, runs: RunId[]): Promise<RunResult> {
    const requested = levelsUpTo(options.maxLevel);
    const paths = teamPaths(team);
    const warnings: string[] = [];
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
    const staticStatus = levelStatus(statics.checks);
    const staticSeconds = this.secondsSince(started);
    for (const check of statics.checks.filter((candidate) => candidate.status === 'skipped')) {
      warnings.push(`static check ${check.id} skipped: ${check.detail}`);
    }

    const unitNote = requested.includes('unit') ? await this.unitNote(team, warnings) : 'not requested';

    const scenarios: ScenarioResult[] = [];
    let componentNote = 'not requested';
    let componentEmpty = false;
    const componentStarted = this.clock.now();
    if (requested.includes('component')) {
      const files = await scenarioFiles(this.fileSystem, team, 'component');
      if (staticStatus === 'fail' && !options.continueAfterRed) {
        componentNote = `not run: ${LEVEL_LABELS.static} is red`;
      } else if (statics.kind === null || statics.mounts === null) {
        componentNote = 'not run: the crew or its mounts.json cannot be read';
      } else if (files.length === 0) {
        // The level asked for ran nothing: that proves nothing, and is not a success.
        componentEmpty = true;
        componentNote = `no scenario in ${joinPath(paths.tests, 'component')}: ${LEVEL_LABELS.component} was asked for and ran nothing`;
      } else {
        componentNote = '';
        const context = { team, attempt: attempt.id, kind: statics.kind, mounts: statics.mounts, orkeonVersion, benchVersion: this.benchVersion, crew, watch };
        for (const file of files) {
          this.stopIfRequested(watch, 'between two scenarios');
          const result = await this.scenarios.execute(context, file);
          scenarios.push(result);
          if (result.run !== null) {
            runs.push(result.run);
          }
        }
      }
    }
    const componentStatus: LevelStatus = componentEmpty ? 'fail' : levelStatus(scenarios);

    const declared = await this.declared(team, warnings);
    const outcome: RunOutcome = {
      team: team.slug,
      attempt: attempt.id,
      date: started,
      orkeonVersion,
      benchVersion: this.benchVersion,
      requested: options.maxLevel,
      replaces,
      static: { status: staticStatus, checks: statics.checks, duration_seconds: staticSeconds, note: '' },
      unit: { status: 'skipped', duration_seconds: 0, note: unitNote },
      component: { status: componentStatus, scenarios, duration_seconds: scenarios.length === 0 ? 0 : this.secondsSince(componentStarted), note: componentNote },
      e2eNote: `not run: ${LEVEL_LABELS.e2e_local} and ${LEVEL_LABELS.e2e_remote} are not implemented yet (lots 4 and 9)`,
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
    // Under the lock, on the manifest as it is now: closed meanwhile, the attempt is immutable and gets nothing.
    await withAttemptsLock(this.fileSystem, team, async () => {
      const current = await requireOpenAttempt(this.fileSystem, team).catch(() => null);
      if (current === null || current.id !== attempt.id) {
        const archived = runs.length === 0 ? '' : ` — its runs stay under ${paths.runs}: ${runs.join(', ')}`;
        throw new ApplicationError('invalid-input', `${attempt.id} was closed while this run was in flight: a closed attempt is immutable, the report was not written${archived}`);
      }
      await this.fileSystem.writeText(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      await this.fileSystem.writeText(reportMarkdownFile, renderReportMarkdown(report, outcome));
      await writeAttemptManifest(this.fileSystem, current.folder, withRuns(current.manifest, reportRuns(scenarios)));
    });

    const levels = [
      { level: 'static' as const, status: staticStatus, note: '' },
      { level: 'unit' as const, status: 'skipped' as const, note: unitNote },
      { level: 'component' as const, status: componentStatus, note: componentNote },
    ].filter((entry) => requested.includes(entry.level));
    return { attempt: attempt.id, report, reportFile, reportMarkdownFile, runs: reportRuns(scenarios), levels, failed: levels.some((entry) => entry.status === 'fail'), warnings };
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

  /** L1 is not run by this version: said in the report, and louder when unit tests are waiting. */
  private async unitNote(team: TeamRef, warnings: string[]): Promise<string> {
    const note = `not run: ${LEVEL_LABELS.unit} is not implemented yet (lot 4)`;
    const waiting = (await this.fileSystem.list(joinPath(teamPaths(team).tests, 'unit'))).length;
    if (waiting > 0) {
      warnings.push(`${LEVEL_LABELS.unit} skipped: ${String(waiting)} entr${waiting === 1 ? 'y' : 'ies'} in ${joinPath(teamPaths(team).tests, 'unit')} not run — ${LEVEL_LABELS.unit} is not implemented yet (lot 4)`);
    }
    return note;
  }

  private async declared(team: TeamRef, warnings: string[]): Promise<DeclaredIds | null> {
    const path = joinPath(teamPaths(team).workbook, 'ACCEPTANCE.md');
    if (!(await this.fileSystem.exists(path))) {
      warnings.push(`${path} does not exist: no criterion is proven without it — a criterion passes at the level ACCEPTANCE.md declares for it`);
      return null;
    }
    return parseAcceptance(await this.fileSystem.readText(path));
  }

  /** One line for the invariants and one for the indicators the report leaves unproven. */
  private unprovenWarnings(report: Report): string[] {
    const notRun = (entries: Record<string, { status: string }>): string[] => Object.entries(entries).flatMap(([id, entry]) => (entry.status === 'not_run' ? [id] : []));
    const invariants = notRun(report.invariants).filter((id) => ID_PATTERNS.INV.test(id));
    const indicators = notRun(report.indicators);
    return [
      ...(invariants.length === 0 ? [] : [`${invariants.join(', ')} not proven: no check of an invariant exists in this version of the bench — all_inv_pass stays false`]),
      ...(indicators.length === 0 ? [] : [`${indicators.join(', ')} not computed: indicators come with \`orkeon-bench evaluate\` — indicators_in_range stays false`]),
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
