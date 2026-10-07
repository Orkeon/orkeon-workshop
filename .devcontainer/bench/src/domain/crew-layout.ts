import { DomainError } from './errors.js';
import type { CrewKind } from './mounts/launchers.js';

/** The sub-folders that make a per-entity YAML crew, one file per agent or task (`CrewDirectoryLayout.EntityFolders`). */
export const CREW_ENTITY_FOLDERS = ['agents', 'tasks'] as const;
/** The flat legacy YAML crew: the three files together (`ConventionalNames.FlatCrewLayoutFiles`). */
export const FLAT_CREW_FILES = ['crew.yaml', 'agents.yaml', 'tasks.yaml'] as const;
/** The settings of a per-entity crew: `config.yaml`, or `crew.yaml` in its place. */
export const CREW_SETTINGS_FILES = ['config.yaml', 'crew.yaml'] as const;
/** The entry point of a TypeScript crew: what its launchers start. */
export const CREW_SCRIPT = 'crew.ork.ts';

/** What sits directly in a team's `crew/` folder. */
export interface CrewFolderEntries {
  readonly files: readonly string[];
  readonly folders: readonly string[];
}

/**
 * The shape of the crew in `crew/`, read as `orkeon run` reads a crew folder (Orkeon `main` at
 * 77ac8a9: `CrewDirectoryLayout.Inspect`, then `YamlCrewDefinitionLoader`). A YAML crew is
 * `config.yaml` (or `crew.yaml`) beside an `agents/` or `tasks/` folder, or the flat triplet
 * `crew.yaml` + `agents.yaml` + `tasks.yaml`: the launchers run the folder. A TypeScript crew is
 * `crew.ork.ts`: the launchers run the file. A `*.ork.ts` or `*.ork.js` beside a YAML layout makes
 * the folder ambiguous: `orkeon run` refuses it, and Orkeon Studio finds no crew in the team.
 */
export function crewKindOf(crewFolder: string, entries: CrewFolderEntries): CrewKind {
  const has = (name: string): boolean => entries.files.includes(name);
  const entityFolders = CREW_ENTITY_FOLDERS.filter((name) => entries.folders.includes(name)).map((name) => `${name}/`);
  const markers = entityFolders.length > 0 ? entityFolders : FLAT_CREW_FILES.every(has) ? [...FLAT_CREW_FILES] : [];
  const scripts = entries.files.filter((name) => /\.ork\.[jt]s$/i.test(name));
  if (markers.length > 0 && scripts.length > 0) {
    throw new DomainError(
      `${crewFolder} holds both a YAML crew (${markers.join(', ')}) and ${scripts.join(', ')}: orkeon run refuses such a folder as ambiguous, and Studio finds no crew in it`,
    );
  }
  if (entityFolders.length > 0 && !CREW_SETTINGS_FILES.some(has)) {
    throw new DomainError(`${crewFolder} holds ${entityFolders.join(' and ')} but neither config.yaml nor crew.yaml: orkeon run cannot load the crew without its settings`);
  }
  if (markers.length > 0) {
    return 'yaml';
  }
  if (has(CREW_SCRIPT)) {
    return 'typescript';
  }
  throw new DomainError(`no crew to launch in ${crewFolder}: write crew/config.yaml with crew/agents/ and crew/tasks/ (YAML), or crew/crew.ork.ts (TypeScript), first`);
}
