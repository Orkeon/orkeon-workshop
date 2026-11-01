import { ATTEMPT_MANIFEST_FILE, DESIGN_SNAPSHOT_FOLDER } from '../../domain/attempt.js';
import type { AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { parseRunEvents } from '../../domain/run-events.js';
import { citedRuns } from '../../domain/run-report.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { listAttemptIds, requireOpenAttempt } from '../attempts/attempt-store.js';
import type { FileSystem } from '../ports/file-system.js';
import type { ProcessRunner } from '../ports/process-runner.js';
import { readJsonFile } from './read-json-file.js';

/** The file `capture` writes in the open attempt, for the reviewer (D91). */
export const CAPTURE_FILE = 'capture.md';
/** The diff of the crew stops there: past it, the reviewer reads the crew itself. */
export const CAPTURE_DIFF_MAX_LINES = 1200;
/** The lines kept at each end of a run's `stderr.log`. */
export const CAPTURE_STDERR_EDGE_LINES = 20;
const DIFF_TIMEOUT_MS = 60_000;

export interface CaptureResult {
  readonly attempt: AttemptId;
  readonly file: string;
  /** The attempt whose design snapshot the crew was compared with; null when there is none. */
  readonly comparedWith: AttemptId | null;
  readonly diffLines: number;
  readonly diffTruncated: boolean;
  readonly runs: readonly string[];
}

/**
 * `orkeon-bench capture <team>` (D91): `capture.md` in the open attempt — the status, the diff of
 * `crew/` against the design snapshot of the previous attempt, `REPORT.md`, the errors and failed
 * tasks of the runs the report cites and the edges of their `stderr.log` —, what `/team-review`
 * hands to the reviewer instead of the archive.
 */
export class CaptureAttempt {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
  ) {}

  async execute(team: TeamRef): Promise<CaptureResult> {
    const paths = teamPaths(team);
    const attempt = await requireOpenAttempt(this.fileSystem, team);
    const previous = await this.previousSnapshot(team, attempt.id);
    const diff = await this.diff(previous?.crew ?? null, paths.crew);
    const reportFile = joinPath(attempt.folder, 'report.json');
    const report = (await this.fileSystem.exists(reportFile)) ? ((await readJsonFile(this.fileSystem, reportFile).catch(() => null)) as Record<string, unknown> | null) : null;
    const runs = report === null ? [] : citedRuns(report);
    const reportMarkdownFile = joinPath(attempt.folder, 'REPORT.md');

    const lines: string[] = [
      `# ${team.slug} — Capture ${attempt.id}`,
      '',
      'Written by `orkeon-bench capture` for the reviewer: what the attempt changed and what its runs left. The archive stays the evidence.',
      '',
      '## Status',
      '',
      ...(await this.fenced(paths.statusFile, 'STATUS.md not found')),
      '',
      '## Crew diff',
      '',
      previous === null ? '_No earlier attempt holds a design snapshot: the whole crew is new to the reviewer._' : `Against the design snapshot of ${previous.id}.`,
      '',
      ...diff.lines,
      '',
      '## Report',
      '',
      ...((await this.fileSystem.exists(reportMarkdownFile)) ? [(await this.fileSystem.readText(reportMarkdownFile)).trimEnd().replace(/^#/gm, '###')] : ['_No REPORT.md: the attempt has not run yet._']),
      '',
      '## Runs',
      '',
      ...(runs.length === 0 ? ['_The report cites no run._'] : (await Promise.all(runs.map((run) => this.runSection(joinPath(paths.runs, run), run)))).flat()),
      '',
    ];
    const file = joinPath(attempt.folder, CAPTURE_FILE);
    await this.fileSystem.writeText(file, lines.join('\n'));
    return { attempt: attempt.id, file, comparedWith: previous?.id ?? null, diffLines: diff.count, diffTruncated: diff.truncated, runs };
  }

  /** The highest attempt below the open one whose folder holds a design snapshot of the crew. */
  private async previousSnapshot(team: TeamRef, open: AttemptId): Promise<{ id: AttemptId; crew: string } | null> {
    const ids = (await listAttemptIds(this.fileSystem, team)).filter((id) => id < open).reverse();
    for (const id of ids) {
      const folder = joinPath(teamPaths(team).attempts, id);
      const crew = joinPath(folder, DESIGN_SNAPSHOT_FOLDER, 'crew');
      if ((await this.fileSystem.exists(joinPath(folder, ATTEMPT_MANIFEST_FILE))) && (await this.fileSystem.isDirectory(crew))) {
        return { id, crew };
      }
    }
    return null;
  }

  private async diff(before: string | null, after: string): Promise<{ lines: string[]; count: number; truncated: boolean }> {
    if (!(await this.fileSystem.isDirectory(after))) {
      return { lines: ['_The team has no crew yet._'], count: 0, truncated: false };
    }
    if (before === null) {
      return { lines: [], count: 0, truncated: false };
    }
    const result = await this.processes.run('diff', ['-ruN', before, after], { timeoutMs: DIFF_TIMEOUT_MS });
    if (!result.found || (result.exitCode !== 0 && result.exitCode !== 1)) {
      return { lines: [`_The diff could not be computed (${result.found ? result.stderr.trim() || `exit ${String(result.exitCode)}` : 'diff not found on PATH'})._`], count: 0, truncated: false };
    }
    if (result.exitCode === 0) {
      return { lines: ['_No change._'], count: 0, truncated: false };
    }
    const all = result.stdout.trimEnd().split('\n');
    const truncated = all.length > CAPTURE_DIFF_MAX_LINES;
    const kept = truncated ? all.slice(0, CAPTURE_DIFF_MAX_LINES) : all;
    return { lines: ['```diff', ...kept, '```', ...(truncated ? ['', `_Truncated: ${String(all.length - CAPTURE_DIFF_MAX_LINES)} more line(s) — read the crew itself._`] : [])], count: all.length, truncated };
  }

  private async runSection(folder: string, run: string): Promise<string[]> {
    const lines = [`### ${run}`, ''];
    const eventsFile = joinPath(folder, 'events.jsonl');
    if (!(await this.fileSystem.exists(eventsFile))) {
      return [...lines, `_${folder} holds no events.jsonl._`, ''];
    }
    const events = parseRunEvents(await this.fileSystem.readText(eventsFile));
    const failedTasks = events.tasks.filter((task) => !task.success && !task.skipped).map((task) => task.role);
    lines.push(
      `- Finished: ${events.finished === null ? 'no `run.finished` event' : `${events.finished.success ? 'success' : 'failure'}, exit ${String(events.finished.exitCode)}`}`,
      `- Failed tasks: ${failedTasks.length === 0 ? 'none' : failedTasks.join(', ')}`,
      `- Errors: ${events.errors.length === 0 ? 'none' : ''}`,
      ...events.errors.map((error) => `  - ${error.replaceAll('\n', ' ')}`),
      '',
    );
    const stderrFile = joinPath(folder, 'stderr.log');
    if (await this.fileSystem.exists(stderrFile)) {
      const all = (await this.fileSystem.readText(stderrFile)).trimEnd().split('\n');
      const edge = CAPTURE_STDERR_EDGE_LINES;
      const kept = all.length > edge * 2 ? [...all.slice(0, edge), `… ${String(all.length - edge * 2)} line(s) …`, ...all.slice(-edge)] : all;
      lines.push('stderr:', '', '```text', ...kept, '```', '');
    }
    return lines;
  }

  private async fenced(path: string, missing: string): Promise<string[]> {
    if (!(await this.fileSystem.exists(path))) {
      return [`_${missing}._`];
    }
    return ['```markdown', (await this.fileSystem.readText(path)).trimEnd(), '```'];
  }
}
