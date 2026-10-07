import { DESIGN_SNAPSHOT_FOLDER } from '../../domain/attempt.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import type { FileSystem, TreeDigest } from '../ports/file-system.js';

/**
 * Copies the design of the team into the attempt (plan § 4.6) — its `crew/`, the definition and the
 * custom tools it holds, and its `mounts.json` — in place of the snapshot the attempt had, and
 * returns the digest of the crew copied. Returns null, copying nothing, when the team has no crew
 * yet (the first build batch creates it, D35). Taken when the attempt opens, and again by every
 * run: the snapshot is the design the last run measured.
 */
export async function takeDesignSnapshot(fileSystem: FileSystem, team: TeamRef, attemptFolder: string): Promise<TreeDigest | null> {
  const paths = teamPaths(team);
  if (!(await fileSystem.isDirectory(paths.crew))) {
    return null;
  }
  const snapshot = joinPath(attemptFolder, DESIGN_SNAPSHOT_FOLDER);
  await fileSystem.remove(snapshot);
  await fileSystem.makeDirectory(snapshot);
  await fileSystem.copy(paths.crew, joinPath(snapshot, 'crew'));
  if (await fileSystem.exists(paths.mountsFile)) {
    await fileSystem.copy(paths.mountsFile, joinPath(snapshot, 'mounts.json'));
  }
  // The digest of the copy: what the snapshot holds is what the manifest of the run names.
  return fileSystem.digest(joinPath(snapshot, 'crew'));
}
