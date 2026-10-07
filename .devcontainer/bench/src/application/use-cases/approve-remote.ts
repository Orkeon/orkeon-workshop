import { REMOTE_APPROVAL_FILE, approveRemote, parseUsdAmount, withRemoteApproval, type RemoteApproval } from '../../domain/attempt.js';
import { parseBenchConfig } from '../../domain/bench-config.js';
import type { AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { requireOpenAttempt, withAttemptsLock, writeAttemptManifest } from '../attempts/attempt-store.js';
import { ApplicationError } from '../errors.js';
import type { Clock, FileSystem } from '../ports/index.js';
import { readJsonFile } from './read-json-file.js';

export interface RemoteApprovalRecord {
  readonly attempt: AttemptId;
  /** The marker written: `<open attempt>/remote-approval.json`. */
  readonly file: string;
  readonly approval: RemoteApproval;
}

/**
 * Records the user's approval of a paid run in the open attempt (D19, D36): the bench is the only
 * writer of `remote-approval.json`, which the run gate reads. The amount is what the user typed
 * after `/team-approve remote`; the cap is the one the team's test plan fixed, read from
 * `tests/<slug>/bench.config.json` — never a default the user did not see. Nothing is written
 * unless everything holds: an open attempt, a cap, an amount of 0 or more that does not exceed it.
 */
export class ApproveRemote {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly clock: Clock,
  ) {}

  async execute(team: TeamRef, amount: string): Promise<RemoteApprovalRecord> {
    const amountUsd = parseUsdAmount(amount);
    const capUsd = await this.cap(team);
    return withAttemptsLock(this.fileSystem, team, async () => {
      const attempt = await requireOpenAttempt(this.fileSystem, team);
      const approval = approveRemote({ amountUsd, capUsd, at: this.clock.now(), source: `/team-approve remote ${amount.trim()}` });
      const manifest = withRemoteApproval(attempt.manifest, approval);
      const file = joinPath(attempt.folder, REMOTE_APPROVAL_FILE);
      await this.fileSystem.writeText(file, `${JSON.stringify(approval, null, 2)}\n`);
      await writeAttemptManifest(this.fileSystem, attempt.folder, manifest);
      return { attempt: attempt.id, file, approval };
    });
  }

  /** `budget.remote_usd_max` as the file states it: the default the parser would supply is no cap anyone agreed to. */
  private async cap(team: TeamRef): Promise<number> {
    const path = teamPaths(team).benchConfigFile;
    if (!(await this.fileSystem.exists(path))) {
      throw new ApplicationError('file-not-found', `no cap for a remote run: ${path} does not exist (/team-test-plan writes it, with budget.remote_usd_max)`);
    }
    const raw = await readJsonFile(this.fileSystem, path);
    const budget = typeof raw === 'object' && raw !== null ? (raw as { budget?: unknown }).budget : undefined;
    const stated = typeof budget === 'object' && budget !== null && 'remote_usd_max' in budget;
    const config = parseBenchConfig(raw);
    if (!stated) {
      throw new ApplicationError('invalid-input', `no cap for a remote run: ${path} states no budget.remote_usd_max`);
    }
    return config.budget.remote_usd_max;
  }
}
