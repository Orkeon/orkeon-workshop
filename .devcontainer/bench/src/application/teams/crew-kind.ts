import { crewKindOf } from '../../domain/crew-layout.js';
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
