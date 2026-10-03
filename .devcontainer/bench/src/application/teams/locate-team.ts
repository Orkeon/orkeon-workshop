import { baseName, normalizePath, resolvePath } from '../../domain/paths.js';
import { createTeamRef, teamPaths, teamRefInWorkshop, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import { workshopRoot } from '../workshop.js';

/**
 * Turns the `<team>` argument of the CLI into a TeamRef: a slug is looked up under
 * `<workshop>/teams/`, anything that looks like a path is taken as the team folder itself. A team
 * exists as soon as its folder, its workbook or its tests do: `/team-init` creates the workbook and
 * the tests, and the first build batch the folder (D35). Each command then says which of its files
 * is missing.
 */
export class LocateTeam {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly environment: Environment,
  ) {}

  async execute(argument: string): Promise<TeamRef> {
    const team = this.toRef(argument);
    const { workbook, tests } = teamPaths(team);
    for (const folder of [team.folder, workbook, tests]) {
      if (await this.fileSystem.isDirectory(folder)) {
        return team;
      }
    }
    throw new ApplicationError('team-not-found', `team not found: none of ${team.folder}, ${workbook}, ${tests} exists`);
  }

  private toRef(argument: string): TeamRef {
    if (looksLikePath(argument)) {
      const folder = normalizePath(resolvePath(this.environment.currentDirectory(), argument));
      return createTeamRef(baseName(folder), folder);
    }
    return teamRefInWorkshop(workshopRoot(this.environment), argument);
  }
}

function looksLikePath(argument: string): boolean {
  return argument.includes('/') || argument.startsWith('.');
}
