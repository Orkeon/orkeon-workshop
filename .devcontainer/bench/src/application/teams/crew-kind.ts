import { crewKindOf } from '../../domain/crew-layout.js';
import { HOST_FOLDER, hostProjectOf, isHostFolder, type TeamKind } from '../../domain/csharp-host.js';
import { DomainError } from '../../domain/errors.js';
import type { CrewKind } from '../../domain/mounts/launchers.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import type { FileSystem } from '../ports/file-system.js';

/** YAML or TypeScript, as `orkeon run` reads `crew/` (`crewKindOf`); an ambiguous or empty folder is refused. */
export async function readCrewKind(fileSystem: FileSystem, team: TeamRef): Promise<CrewKind> {
  const crew = teamPaths(team).crew;
  const files: string[] = [];
  const folders: string[] = [];
  for (const name of await fileSystem.list(crew)) {
    if (await fileSystem.isDirectory(joinPath(crew, name))) {
      folders.push(name);
    } else {
      files.push(name);
    }
  }
  return crewKindOf(crew, { files, folders });
}

/**
 * The kind of a team: `csharp` when `host/` holds a solution or a project (the C# host of
 * `new-team.sh`), whose `crew/`, when there is one, must then be a YAML crew the host loads; else
 * the kind of its crew (`readCrewKind`).
 */
export async function readTeamKind(fileSystem: FileSystem, team: TeamRef): Promise<TeamKind> {
  const host = joinPath(team.folder, HOST_FOLDER);
  if (isHostFolder(await fileSystem.list(host), await hostProjectFolders(fileSystem, host))) {
    const crew = teamPaths(team).crew;
    if ((await fileSystem.isDirectory(crew)) && (await readCrewKind(fileSystem, team)) !== 'yaml') {
      throw new DomainError(`${crew} is not a YAML crew: the C# host loads a YAML crew from crew/, or builds its crew in code without crew/`);
    }
    return 'csharp';
  }
  return readCrewKind(fileSystem, team);
}

/** The host project of a C# team, relative to `host/` (`src/<Name>.Host`). */
export async function readHostProject(fileSystem: FileSystem, team: TeamRef): Promise<string> {
  const host = joinPath(team.folder, HOST_FOLDER);
  return hostProjectOf(host, await hostProjectFolders(fileSystem, host));
}

/** The `src/<Name>.Host` folders of `host/` that hold `<Name>.Host.csproj`. */
async function hostProjectFolders(fileSystem: FileSystem, host: string): Promise<string[]> {
  const candidates: string[] = [];
  for (const name of await fileSystem.list(joinPath(host, 'src'))) {
    if (name.endsWith('.Host') && (await fileSystem.exists(joinPath(host, 'src', name, `${name}.csproj`)))) {
      candidates.push(name);
    }
  }
  return candidates;
}

/** `readTeamKind`, or null when the team's folders say no kind (a check reports that elsewhere). */
export async function readTeamKindOrNull(fileSystem: FileSystem, team: TeamRef): Promise<TeamKind | null> {
  try {
    return await readTeamKind(fileSystem, team);
  } catch {
    return null;
  }
}
