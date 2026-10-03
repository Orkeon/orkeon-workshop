import { UNKNOWN_MACHINE, type MachineFolders } from '../../domain/mounts/mount-reach.js';
import { DEFAULT_ENVIRONMENT, isMountSetName, mountSetFolder, resolveMountSet, type MountResolution } from '../../domain/mounts/mount-set.js';
import { MOUNT_SET_PREFIX, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readMountSet } from './read-mount-set.js';

/**
 * `mounts.json` + a mount set → the ordered `--mount` arguments of `orkeon run`. The `default` set
 * is the team's own folders; a named set exists when its folder `mounts.<name>/<team>/` does (D28).
 */
export class ResolveMounts {
  /** `machine`: the folders of the machine no mount point may reach (`machineFolders`). */
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly machine: MachineFolders = UNKNOWN_MACHINE,
  ) {}

  async execute(team: TeamRef, environment: string = DEFAULT_ENVIRONMENT): Promise<MountResolution> {
    const resolution = resolveMountSet(await readMountSet(this.fileSystem, team), team.folder, environment, this.machine);
    if (resolution.setFolder !== null && !(await this.fileSystem.isDirectory(resolution.setFolder))) {
      const known = [DEFAULT_ENVIRONMENT, ...(await this.namedSets(team))].join(', ');
      throw new ApplicationError('invalid-input', `unknown environment "${environment}": ${resolution.setFolder} does not exist (known: ${known})`);
    }
    return resolution;
  }

  /** The named mount sets that hold a folder for this team, sorted. */
  private async namedSets(team: TeamRef): Promise<string[]> {
    const names: string[] = [];
    for (const entry of await this.fileSystem.list(workshopOfTeam(team.folder))) {
      const name = entry.startsWith(MOUNT_SET_PREFIX) ? entry.slice(MOUNT_SET_PREFIX.length) : '';
      if (isMountSetName(name) && (await this.fileSystem.isDirectory(mountSetFolder(team.folder, name)))) {
        names.push(name);
      }
    }
    return names;
  }
}
