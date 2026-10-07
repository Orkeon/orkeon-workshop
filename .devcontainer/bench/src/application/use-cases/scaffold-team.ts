import { RUN_TARGETS, renderRunCmd, renderRunSh, type CrewKind, type LauncherSpec } from '../../domain/mounts/launchers.js';
import { UNKNOWN_MACHINE, type MachineFolders } from '../../domain/mounts/mount-reach.js';
import { DEFAULT_ENVIRONMENT, resolveMountSet } from '../../domain/mounts/mount-set.js';
import { FOLDER_KEEPER, renderTeamGitignore, teamFolders } from '../../domain/mounts/team-gitignore.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import { readCrewKind } from '../teams/crew-kind.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';
import { readMountSet } from './read-mount-set.js';

/** What `scaffold` wrote, relative to the team folder. */
export interface ScaffoldResult {
  readonly kind: CrewKind;
  /** What the launchers hand to `orkeon run`: `crew` or `crew/crew.ork.ts`. */
  readonly target: string;
  readonly written: readonly string[];
  /** The team folders of mount points that did not exist yet. */
  readonly created: readonly string[];
  /** The `.gitkeep` files written into folders of mount points that had none. */
  readonly placeholders: readonly string[];
  /** The `mounts[]` written into `studio-team.json`. */
  readonly studioMounts: readonly string[];
  /** What the mount points let through but Studio would refuse (a folder outside the team). */
  readonly warnings: readonly string[];
}

/**
 * `mounts.json` → what derives from it in the team folder (D27): `run.sh` and `run.cmd`, one
 * binding per mount point; the `mounts` of the Studio card, its other keys kept; the folders of
 * the mount points that lie inside the team, each with a `.gitkeep`, and the team's `.gitignore`,
 * which keeps their content out of git. Run again after every change of `mounts.json`.
 */
export class ScaffoldTeam {
  /** `machine`: the folders of the machine no mount point may reach (`machineFolders`). */
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly machine: MachineFolders = UNKNOWN_MACHINE,
  ) {}

  async execute(team: TeamRef): Promise<ScaffoldResult> {
    const resolution = resolveMountSet(await readMountSet(this.fileSystem, team), team.folder, DEFAULT_ENVIRONMENT, this.machine);
    const kind = await readCrewKind(this.fileSystem, team);
    const paths = teamPaths(team);
    const card = await this.readCard(paths.studioCard, team);

    // Which folders are missing is read before any is made: making `data/state` makes `data` too.
    const folders = teamFolders(resolution.bindings);
    const created: string[] = [];
    for (const folder of folders) {
      if (!(await this.fileSystem.isDirectory(joinPath(team.folder, folder)))) {
        created.push(folder);
      }
    }
    const placeholders: string[] = [];
    for (const folder of folders) {
      const physical = joinPath(team.folder, folder);
      if (created.includes(folder)) {
        await this.fileSystem.makeDirectory(physical);
      }
      if (!(await this.fileSystem.exists(joinPath(physical, FOLDER_KEEPER)))) {
        await this.fileSystem.writeText(joinPath(physical, FOLDER_KEEPER), '');
        placeholders.push(`${folder}/${FOLDER_KEEPER}`);
      }
    }

    const spec: LauncherSpec = { slug: team.slug, kind, bindings: resolution.bindings };
    await this.fileSystem.writeText(paths.runSh, renderRunSh(spec), { executable: true });
    await this.fileSystem.writeText(paths.runCmd, renderRunCmd(spec));
    await this.fileSystem.writeText(paths.studioCard, `${JSON.stringify({ ...card, mounts: [...resolution.studioMounts] }, null, 2)}\n`);
    await this.fileSystem.writeText(paths.gitignore, renderTeamGitignore(resolution.bindings));
    return Object.freeze({
      kind,
      target: RUN_TARGETS[kind],
      written: ['run.sh', 'run.cmd', 'studio-team.json', '.gitignore'],
      created,
      placeholders,
      studioMounts: resolution.studioMounts,
      warnings: resolution.warnings,
    });
  }

  /** The card as it stands, or a new one named after the team; anything but a JSON object is refused. */
  private async readCard(path: string, team: TeamRef): Promise<Record<string, unknown>> {
    if (!(await this.fileSystem.exists(path))) {
      return { name: team.slug, description: '' };
    }
    const card = await readJsonFile(this.fileSystem, path);
    if (typeof card !== 'object' || card === null || Array.isArray(card)) {
      throw new ApplicationError('invalid-input', `${path} is not a JSON object`);
    }
    return card as Record<string, unknown>;
  }
}
