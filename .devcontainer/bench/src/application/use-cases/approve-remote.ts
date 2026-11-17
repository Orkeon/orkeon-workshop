import { REMOTE_APPROVAL_FILE, approveRemote, parseUsdAmount, withRemoteApproval, type RemoteApproval } from '../../domain/attempt.js';
import type { AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { requireOpenAttempt, withAttemptsLock, writeAttemptManifest } from '../attempts/attempt-store.js';
import type { Clock, FileSystem } from '../ports/index.js';
import { readStatedRemoteCap } from './read-remote-cap.js';

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
    const { capUsd } = await readStatedRemoteCap(this.fileSystem, team);
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
}
