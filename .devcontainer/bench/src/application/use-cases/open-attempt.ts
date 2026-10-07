import { nextAttemptId, openAttempt, parseOpenedBy, withDesignSnapshot, withOrkeonVersion } from '../../domain/attempt.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { findOpenAttempt, listAttemptIds, updateOpenAttempt, withAttemptsLock, writeAttemptManifest, type StoredAttempt } from '../attempts/attempt-store.js';
import { takeDesignSnapshot } from '../attempts/design-snapshot.js';
import { ApplicationError } from '../errors.js';
import type { Clock, FileSystem, ProcessRunner } from '../ports/index.js';
import { installedOrkeonVersion } from './orkeon-version.js';

/**
 * Opens the next attempt of a team (plan § 4.6): `attempts/ATT-nnnn/` with its manifest and, when
 * the team already has a crew, a snapshot of its design. The workbook must exist; the team folder
 * need not — the build that the attempt records is what creates it (D35). One attempt is open at
 * a time, and one command opens it: the folder is created under the lock of the team's attempts,
 * by a call that fails when the folder exists, and its manifest is written at once — the snapshot
 * and the Orkeon version, which take time, are recorded afterwards.
 */
export class OpenAttempt {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly clock: Clock,
  ) {}

  async execute(team: TeamRef, openedBy = ''): Promise<StoredAttempt> {
    const by = parseOpenedBy(openedBy);
    const paths = teamPaths(team);
    if (!(await this.fileSystem.isDirectory(paths.workbook))) {
      throw new ApplicationError('file-not-found', `no workbook for ${team.slug}: ${paths.workbook} does not exist (/team-init creates it)`);
    }
    await this.fileSystem.makeDirectory(paths.attempts);
    const opened = await withAttemptsLock(this.fileSystem, team, async () => {
      const open = await findOpenAttempt(this.fileSystem, team);
      if (open !== null) {
        throw new ApplicationError('invalid-input', `${open.id} is still open for ${team.slug}: close it with \`orkeon-bench attempt close ${team.slug}\` before opening another`);
      }
      const id = nextAttemptId(await listAttemptIds(this.fileSystem, team));
      const folder = joinPath(paths.attempts, id);
      if (!(await this.fileSystem.makeDirectoryExclusive(folder))) {
        throw new ApplicationError('invalid-input', `${id} was opened by another command at the same moment: nothing was opened twice`);
      }
      const manifest = openAttempt({ id, at: this.clock.now(), openedBy: by });
      await writeAttemptManifest(this.fileSystem, folder, manifest);
      return { id, folder, manifest };
    });
    const version = await installedOrkeonVersion(this.processes);
    const snapshot = await takeDesignSnapshot(this.fileSystem, team, opened.folder);
    return updateOpenAttempt(this.fileSystem, team, opened.id, (manifest) => withOrkeonVersion(snapshot === null ? manifest : withDesignSnapshot(manifest), version));
  }
}
