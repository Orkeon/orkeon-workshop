import { parseMountSet, type MountSet } from '../../domain/mounts/mount-set.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';

/** The team's `mounts.json`, parsed: the mount points it declares (D27). */
export async function readMountSet(fileSystem: FileSystem, team: TeamRef): Promise<MountSet> {
  const path = teamPaths(team).mountsFile;
  if (!(await fileSystem.exists(path))) {
    const why = (await fileSystem.isDirectory(team.folder)) ? '' : ' (no team folder yet: the first build batch creates it, D35)';
    throw new ApplicationError('file-not-found', `mounts.json not found: ${path}${why}`);
  }
  return parseMountSet(await readJsonFile(fileSystem, path));
}
