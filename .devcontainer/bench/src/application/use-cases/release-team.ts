import { ATTEMPT_MANIFEST_FILE, DESIGN_SNAPSHOT_FOLDER, parseAttemptManifest, type AttemptManifest } from '../../domain/attempt.js';
import { DEFAULT_BENCH_CONFIG, parseBenchConfig, type BenchConfig } from '../../domain/bench-config.js';
import { ID_PATTERNS, type AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { DomainError } from '../../domain/errors.js';
import { parseReport } from '../../domain/report.js';
import { citedRuns } from '../../domain/run-report.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { listAttemptIds, withAttemptsLock } from '../attempts/attempt-store.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';
import type { ScaffoldTeam } from './scaffold-team.js';

export interface ReleaseResult {
  readonly status: 'released';
  /** The number of the release: the accepted attempts so far, the last one included. */
  readonly version: number;
  readonly attempt: AttemptId;
  readonly tag: string;
  readonly runsKept: readonly string[];
  readonly runsArchived: readonly string[];
  /** `<workshop>/archive/runs/<slug>`, where the runs past the retention went. */
  readonly archive: string;
}

/** A report.json release cannot read: what it cites is unknown, so nothing is released (exit 1). */
export interface UnreadableReport {
  readonly file: string;
  readonly reason: string;
}

export type ReleaseOutcome = ReleaseResult | { readonly status: 'unreadable-reports'; readonly reports: readonly UnreadableReport[] };

/**
 * `orkeon-bench release <team>` (D91): a team whose last attempt was ACCEPTED, and whose crew and
 * `mounts.json` are still the design that attempt measured, is made ready to tag — the launchers and
 * the card written again by `scaffold` from that `mounts.json`, the runs past `retention.runs_keep`
 * moved to `archive/runs/<slug>/`, except those a report cites (its scenarios' runs and those of the
 * report it replaced) and those an attempt manifest lists. A report.json that does not read stops
 * the release before anything is written: the runs it cites cannot be told apart. The tag itself is the user's: the bench prints the command.
 */
export class ReleaseTeam {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly scaffoldTeam: ScaffoldTeam,
  ) {}

  async execute(team: TeamRef): Promise<ReleaseOutcome> {
    const paths = teamPaths(team);
    if (!(await this.fileSystem.isDirectory(paths.crew))) {
      throw new ApplicationError('file-not-found', `${team.slug} has no crew: ${paths.crew} — nothing to release`);
    }
    return withAttemptsLock(this.fileSystem, team, async () => {
      const attempts = await this.attempts(team);
      const last = attempts[attempts.length - 1];
      if (last === undefined) {
        throw new ApplicationError('invalid-input', `${team.slug} has no attempt: a release follows an attempt closed ACCEPTED (/team-review, then attempt close --verdict ACCEPTED)`);
      }
      if (last.manifest === null || last.manifest.closed_at === null || last.manifest.verdict !== 'ACCEPTED') {
        const state = last.manifest === null ? 'has no manifest that reads' : last.manifest.closed_at === null ? 'is still open' : `was closed ${last.manifest.verdict ?? 'without a verdict'}`;
        throw new ApplicationError('invalid-input', `${team.slug}: the last attempt, ${last.id}, ${state} — a release follows an attempt closed ACCEPTED`);
      }
      const snapshot = joinPath(last.folder, DESIGN_SNAPSHOT_FOLDER, 'crew');
      if (!(await this.fileSystem.isDirectory(snapshot))) {
        throw new ApplicationError('invalid-input', `${last.id} holds no design snapshot (${snapshot}): nothing tells the crew released is the crew accepted`);
      }
      const [crew, accepted] = await Promise.all([this.fileSystem.digest(paths.crew), this.fileSystem.digest(snapshot)]);
      if (crew.sha256 !== accepted.sha256) {
        throw new ApplicationError('invalid-input', `${team.slug}: crew/ differs from the design ${last.id} accepted — open an attempt and measure the change, or put the crew back as it was`);
      }
      const mountsDrift = await this.mountsDrift(paths.mountsFile, joinPath(last.folder, DESIGN_SNAPSHOT_FOLDER, 'mounts.json'));
      if (mountsDrift !== null) {
        throw new ApplicationError('invalid-input', `${team.slug}: mounts.json ${mountsDrift} the design ${last.id} accepted — open an attempt and measure the change, or put mounts.json back as it was`);
      }

      const cited = new Set<string>();
      const unreadable: UnreadableReport[] = [];
      for (const attempt of attempts) {
        for (const run of attempt.manifest?.runs ?? []) {
          cited.add(run);
        }
        const reportFile = joinPath(attempt.folder, 'report.json');
        if (await this.fileSystem.exists(reportFile)) {
          try {
            const report = (await readJsonFile(this.fileSystem, reportFile)) as Record<string, unknown>;
            parseReport(report);
            for (const run of citedRuns(report)) {
              cited.add(run);
            }
          } catch (error) {
            if (!(error instanceof ApplicationError || error instanceof DomainError)) {
              throw error;
            }
            unreadable.push({ file: reportFile, reason: error.message });
          }
        }
      }
      if (unreadable.length > 0) {
        return { status: 'unreadable-reports', reports: unreadable };
      }

      await this.scaffoldTeam.execute(team);

      const config = await this.config(team);
      const runs = (await this.fileSystem.list(paths.runs)).filter((name) => ID_PATTERNS.RUN.test(name)).sort();
      const latest = new Set(runs.slice(-config.retention.runs_keep));
      const runsKept = runs.filter((run) => latest.has(run) || cited.has(run));
      const runsArchived = runs.filter((run) => !latest.has(run) && !cited.has(run));
      const archive = joinPath(workshopOfTeam(team.folder), 'archive', 'runs', team.slug);
      if (runsArchived.length > 0) {
        await this.fileSystem.makeDirectory(archive);
      }
      for (const run of runsArchived) {
        const target = joinPath(archive, run);
        await this.fileSystem.remove(target);
        await this.fileSystem.copy(joinPath(paths.runs, run), target);
        await this.fileSystem.remove(joinPath(paths.runs, run));
      }

      const version = attempts.filter((attempt) => attempt.manifest?.verdict === 'ACCEPTED' && attempt.manifest.closed_at !== null).length;
      const tag = `team/${team.slug}/v${String(version)}`;
      return { status: 'released', version, attempt: last.id, tag, runsKept, runsArchived, archive };
    });
  }

  private async attempts(team: TeamRef): Promise<{ id: AttemptId; folder: string; manifest: AttemptManifest | null }[]> {
    const result: { id: AttemptId; folder: string; manifest: AttemptManifest | null }[] = [];
    for (const id of await listAttemptIds(this.fileSystem, team)) {
      const folder = joinPath(teamPaths(team).attempts, id);
      const file = joinPath(folder, ATTEMPT_MANIFEST_FILE);
      let manifest: AttemptManifest | null = null;
      if (await this.fileSystem.exists(file)) {
        try {
          manifest = parseAttemptManifest(await readJsonFile(this.fileSystem, file));
        } catch {
          manifest = null;
        }
      }
      result.push({ id, folder, manifest });
    }
    return result;
  }

  /** How `mounts.json` differs from the one the snapshot holds; null when they are the same, or both absent. */
  private async mountsDrift(current: string, accepted: string): Promise<string | null> {
    const [hasCurrent, hasAccepted] = await Promise.all([this.fileSystem.exists(current), this.fileSystem.exists(accepted)]);
    if (!hasCurrent && !hasAccepted) {
      return null;
    }
    if (hasCurrent !== hasAccepted) {
      return hasCurrent ? 'exists but was absent from' : 'is missing from the team but present in';
    }
    const [now, then] = await Promise.all([this.fileSystem.readBytes(current), this.fileSystem.readBytes(accepted)]);
    return now.length === then.length && now.every((byte, index) => byte === then[index]) ? null : 'differs from';
  }

  private async config(team: TeamRef): Promise<BenchConfig> {
    const path = teamPaths(team).benchConfigFile;
    return (await this.fileSystem.exists(path)) ? parseBenchConfig(await readJsonFile(this.fileSystem, path)) : DEFAULT_BENCH_CONFIG;
  }
}
