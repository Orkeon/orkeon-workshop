import { HOST_CONFIGURATION, HOST_FOLDER, dotnetTestSummary, type TeamKind } from '../../domain/csharp-host.js';
import { joinPath } from '../../domain/paths.js';
import type { LevelStatus } from '../../domain/run-report.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { InterruptedError } from '../errors.js';
import type { Environment, FileSystem, ProcessResult, ProcessRunner, ShutdownWatch } from '../ports/index.js';
import { dotnetEnvironment } from './static-level.js';

/** How long the unit tests of a team may take together. */
export const UNIT_TIMEOUT_MS = 600_000;

export interface UnitLevelResult {
  readonly status: LevelStatus;
  readonly passed: number;
  readonly failed: number;
  /** Why the level is skipped, or what it found. */
  readonly note: string;
  /** What should not pass unseen: a runner that is not there. */
  readonly warning: string | null;
}

/**
 * L1, the unit level (plan § 6.1): `npx vitest run tests/<slug>/unit --reporter json`, from the
 * workshop. No `tests/<slug>/unit` folder: skipped, which a team without unit tests is allowed to
 * be. A runner that cannot start: skipped, with a warning. A suite that ran: the JSON report decides.
 * A C# team: `dotnet test` of its `host/` — the host's startup tests and the tests of its tools —
 * on the build L0 made.
 */
export class UnitLevel {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly environment: Environment,
  ) {}

  async execute(team: TeamRef, watch: ShutdownWatch, kind: TeamKind | null = null): Promise<UnitLevelResult> {
    if (kind === 'csharp') {
      return this.hostTests(team, watch);
    }
    const relative = `tests/${team.slug}/unit`;
    if (!(await this.fileSystem.isDirectory(joinPath(teamPaths(team).tests, 'unit')))) {
      return { status: 'skipped', passed: 0, failed: 0, note: `skipped: no ${relative} folder`, warning: null };
    }
    const result = await this.processes.run('npx', ['vitest', 'run', relative, '--reporter', 'json'], {
      cwd: workshopOfTeam(team.folder),
      timeoutMs: UNIT_TIMEOUT_MS,
      input: '',
      ownGroup: true,
      cancel: watch.requested,
    });
    if (result.stopped === 'cancelled') {
      throw new InterruptedError('interrupted during the unit tests (vitest was stopped)');
    }
    if (!result.found) {
      return { status: 'skipped', passed: 0, failed: 0, note: 'skipped: npx not found on PATH', warning: `L1 skipped: npx not found on PATH — the unit tests of ${relative} did not run` };
    }
    const report = unitReport(result.stdout);
    if (report === null) {
      if (result.stopped === 'timeout') {
        return { status: 'fail', passed: 0, failed: 0, note: `vitest was stopped after ${String(UNIT_TIMEOUT_MS / 1000)} s: it had not finished`, warning: null };
      }
      if (/not found|could not determine executable|ENOENT|No such file|command not found/i.test(`${result.stdout}\n${result.stderr}`)) {
        return { status: 'skipped', passed: 0, failed: 0, note: 'skipped: vitest not found', warning: `L1 skipped: vitest not found — the unit tests of ${relative} did not run (${tail(result)})` };
      }
      return { status: 'fail', passed: 0, failed: 0, note: `vitest gave no JSON report (${tail(result)})`, warning: null };
    }
    const total = report.passed + report.failed;
    return { status: report.failed === 0 && report.success ? 'pass' : 'fail', passed: report.passed, failed: report.failed, note: `${String(total)} tests, ${String(report.failed)} failed`, warning: null };
  }

  /** `dotnet test` of a C# team's `host/`, without the build L0 made; its summary decides. */
  private async hostTests(team: TeamRef, watch: ShutdownWatch): Promise<UnitLevelResult> {
    const result = await this.processes.run('dotnet', ['test', '-c', HOST_CONFIGURATION, '--no-build'], {
      cwd: joinPath(team.folder, HOST_FOLDER),
      timeoutMs: UNIT_TIMEOUT_MS,
      input: '',
      ownGroup: true,
      cancel: watch.requested,
      env: dotnetEnvironment(this.environment),
    });
    if (result.stopped === 'cancelled') {
      throw new InterruptedError('interrupted during the unit tests (dotnet test was stopped)');
    }
    if (!result.found) {
      return { status: 'skipped', passed: 0, failed: 0, note: 'skipped: dotnet not found on PATH', warning: `L1 skipped: dotnet not found on PATH — the tests of ${team.slug}/host did not run` };
    }
    if (result.stopped === 'timeout') {
      return { status: 'fail', passed: 0, failed: 0, note: `dotnet test was stopped after ${String(UNIT_TIMEOUT_MS / 1000)} s: it had not finished`, warning: null };
    }
    const summary = dotnetTestSummary(`${result.stdout}\n${result.stderr}`);
    if (summary === null) {
      return { status: 'fail', passed: 0, failed: 0, note: `dotnet test gave no summary (${tail(result)})`, warning: null };
    }
    const ok = result.exitCode === 0 && summary.failed === 0 && summary.total > 0;
    return { status: ok ? 'pass' : 'fail', passed: summary.passed, failed: summary.failed, note: `dotnet test: ${String(summary.total)} tests, ${String(summary.failed)} failed${ok || summary.failed > 0 ? '' : ` (${tail(result)})`}`, warning: null };
  }
}

/** The counts of the JSON report vitest prints, found in a stdout a banner may precede; null when there is none. */
export function unitReport(stdout: string): { passed: number; failed: number; success: boolean } | null {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
    const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    if (typeof parsed.numTotalTests !== 'number') {
      return null;
    }
    return { passed: count(parsed.numPassedTests), failed: count(parsed.numFailedTests), success: parsed.success === true };
  } catch {
    return null;
  }
}

function tail(result: ProcessResult): string {
  const lines = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const exit = result.exitCode === null ? 'no exit code' : `exit ${String(result.exitCode)}`;
  return [exit, ...lines.slice(-3)].join(' · ');
}
