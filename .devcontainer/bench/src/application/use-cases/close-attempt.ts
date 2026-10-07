import { ATTEMPT_MANIFEST_FILE, BROKEN_MANIFEST_FILE, abandonedAttempt, closeAttempt, type AttemptManifest } from '../../domain/attempt.js';
import type { AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { reportSchema } from '../../domain/report.js';
import type { Verdict } from '../../domain/status.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { computeVerdictInput, isAccepted, verdictInputDiscrepancies } from '../../domain/verdict.js';
import { findUnclosedAttempt, withAttemptsLock, writeAttemptManifest } from '../attempts/attempt-store.js';
import { ApplicationError } from '../errors.js';
import type { Clock, FileSystem } from '../ports/index.js';
import { readJsonFile } from './read-json-file.js';

export interface ClosedAttempt {
  readonly id: AttemptId;
  readonly folder: string;
  readonly manifest: AttemptManifest;
  /** True when the folder had no manifest that could be read: it was closed as abandoned, without a verdict. */
  readonly abandoned: boolean;
  /** Where the manifest that could not be read was kept, when there was one; null otherwise. */
  readonly kept: string | null;
}

/**
 * Closes the open attempt of a team, with the verdict of its review when given; it is immutable
 * from then on. `ACCEPTED` is refused unless the attempt holds a report whose verdict input accepts:
 * an attempt is accepted on what a run proved. An attempt folder left without a manifest, or with one
 * that cannot be read, is closed as abandoned — the way out of an interrupted `attempt open` and of
 * a manifest damaged by hand; the unreadable file is kept beside the new manifest.
 */
export class CloseAttempt {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly clock: Clock,
  ) {}

  async execute(team: TeamRef, verdict: Verdict | null = null): Promise<ClosedAttempt> {
    return withAttemptsLock(this.fileSystem, team, async () => {
      const attempt = await findUnclosedAttempt(this.fileSystem, team);
      if (attempt === null) {
        throw new ApplicationError('invalid-input', `no open attempt for ${team.slug}: open one with \`orkeon-bench attempt open ${team.slug}\``);
      }
      if (attempt.manifest === null) {
        if (verdict !== null) {
          throw new ApplicationError('invalid-input', `${attempt.id} has no manifest that can be read: it can only be closed as abandoned, without a verdict — \`orkeon-bench attempt close ${team.slug}\``);
        }
        let kept: string | null = null;
        if (attempt.broken !== null) {
          // What could not be read is kept beside the manifest that replaces it: nothing of an attempt is thrown away.
          kept = joinPath(attempt.folder, BROKEN_MANIFEST_FILE);
          await this.fileSystem.remove(kept);
          await this.fileSystem.copy(joinPath(attempt.folder, ATTEMPT_MANIFEST_FILE), kept);
        }
        const manifest = abandonedAttempt(attempt.id, this.clock.now(), attempt.broken === null ? null : BROKEN_MANIFEST_FILE);
        await writeAttemptManifest(this.fileSystem, attempt.folder, manifest);
        return { id: attempt.id, folder: attempt.folder, manifest, abandoned: true, kept };
      }
      if (verdict === 'ACCEPTED') {
        await this.ensureAccepted(attempt.id, attempt.folder);
      }
      const manifest = closeAttempt(attempt.manifest, this.clock.now(), verdict);
      await writeAttemptManifest(this.fileSystem, attempt.folder, manifest);
      return { id: attempt.id, folder: attempt.folder, manifest, abandoned: false, kept: null };
    });
  }

  private async ensureAccepted(id: AttemptId, folder: string): Promise<void> {
    const why = await this.notAccepted(joinPath(folder, 'report.json'));
    if (why !== null) {
      throw new ApplicationError('invalid-input', `${id} cannot be closed ACCEPTED: ${why}`);
    }
  }

  /** Why the report of the attempt does not accept, or null when it does. */
  private async notAccepted(file: string): Promise<string | null> {
    if (!(await this.fileSystem.exists(file))) {
      return 'it has no report.json — an attempt is accepted on the report of a run (`orkeon-bench run`)';
    }
    const parsed = reportSchema.safeParse(await readJsonFile(this.fileSystem, file));
    if (!parsed.success || verdictInputDiscrepancies(parsed.data).length > 0) {
      return `${file} is not a valid report (\`orkeon-bench report validate\` says why)`;
    }
    const input = computeVerdictInput(parsed.data);
    return isAccepted(input)
      ? null
      : `its report does not accept — all_ac_pass=${String(input.all_ac_pass)} all_inv_pass=${String(input.all_inv_pass)} indicators_in_range=${String(input.indicators_in_range)}`;
  }
}
