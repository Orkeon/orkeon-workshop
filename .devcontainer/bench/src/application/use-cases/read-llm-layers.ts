import {
  EXAMPLES_SOLUTION,
  VARIABLE_LAYERS,
  crewSettingsFile,
  decisionKeyVariables,
  flattenConfiguration,
  llmLayer,
  settingsWalk,
  userSettingsFile,
  variableEntries,
  type LlmLayer,
} from '../../domain/orkeon-configuration.js';
import { joinPath } from '../../domain/paths.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import { readSettingsFile } from './read-settings-file.js';

/** Where a run starts from, as far as Orkeon's configuration is concerned. */
export interface RunContext {
  /** The folder of the crew's `config.yaml`, or of its `.ork.ts`: the settings chain starts there. */
  readonly crewFolder: string;
  /**
   * The file passed with `--settings`, if any: it ends the chain, and a missing one leaves no
   * settings file at all (`RunnerSettings.ResolveExplicitSettingsPath`).
   */
  readonly explicitSettingsFile?: string | undefined;
}

export interface MachineLlm {
  /** The settings file `orkeon run` resolves for the crew; null when there is none. */
  readonly settingsFile: string | null;
  /** Every layer, highest precedence first (`orkeon-configuration.ts`). */
  readonly layers: readonly LlmLayer[];
  /**
   * The names of the variables holding a decision key with a non-empty value, whatever their case
   * (fail-closed: Orkeon reads them by their exact name on Linux): `TYPESAFE_API_KEY` or
   * `LIQUID_API_KEY` lets Orkeon deduce its provider alone, and any of them, or one a section names
   * with `ApiKeyEnvVar`, is a key the active provider sends (`decisionKeyVariables`). Names only.
   */
  readonly decisionKeys: readonly string[];
  /** Every settings file of the layers, highest precedence first: `[settingsFile]` for `orkeon run`, the host's files for a C# team. */
  readonly settingsFiles: readonly string[];
}

/** Where the host of a C# team starts from (`TeamHost.BuildConfiguration` of the OrkeonCrewHost template). */
export interface HostRunContext {
  /** The team folder: its `appsettings.json` and `appsettings.local.json` are layers of the host. */
  readonly teamFolder: string;
  /** `settings/<slug>/appsettings.json` of the workshop (D33), over the team folder's files. */
  readonly workshopSettingsFile: string;
  /** `--settings`: then the only file read, and a missing one stops the host before any call. */
  readonly explicitSettingsFile?: string | undefined;
}

/**
 * The `Llm` layers a run of the crew would see — with the decision settings (`Orkeon:TypeSafe`, `Orkeon:Liquid`, `Orkeon:Kev`, `Orkeon:Decision:*`): the variables of the bench's own environment and
 * the files Orkeon reads. A file that is not strict JSON is an error (`readSettingsFile`): what the
 * bench would judge is not what Orkeon would read.
 */
export async function readLlmLayers(fileSystem: FileSystem, environment: Environment, context: RunContext): Promise<MachineLlm> {
  const variables = environment.variables();
  const settingsFile =
    context.explicitSettingsFile === undefined
      ? await resolveSettingsFile(fileSystem, environment, context.crewFolder)
      : (await isFile(fileSystem, context.explicitSettingsFile))
        ? context.explicitSettingsFile
        : null;
  const fileLayer = async (path: string): Promise<LlmLayer> => llmLayer(path, flattenConfiguration(await readSettingsFile(fileSystem, path)));
  const [orkeon, unprefixed] = VARIABLE_LAYERS.map(({ prefix, source, decisionSource }) => llmLayer(source, variableEntries(prefix, variables), decisionSource)) as [LlmLayer, LlmLayer];

  const layers: LlmLayer[] = [orkeon];
  if (settingsFile !== null) {
    layers.push(await fileLayer(settingsFile));
  }
  layers.push(unprefixed);
  return { settingsFile, layers, decisionKeys: decisionKeyVariables(layers, variables), settingsFiles: settingsFile === null ? [] : [settingsFile] };
}

/**
 * The layers the host of a C# team reads, highest first: the `ORKEON_` variables, then
 * `settings/<slug>/appsettings.json` of the workshop, `appsettings.local.json` and `appsettings.json`
 * of the team folder — or the `--settings` file alone. No variable without the prefix, never the
 * user's file of `orkeon run`: the host adds neither.
 */
export async function readHostLlmLayers(fileSystem: FileSystem, environment: Environment, context: HostRunContext): Promise<MachineLlm> {
  const variables = environment.variables();
  const candidates =
    context.explicitSettingsFile === undefined
      ? [context.workshopSettingsFile, joinPath(context.teamFolder, 'appsettings.local.json'), joinPath(context.teamFolder, 'appsettings.json')]
      : [context.explicitSettingsFile];
  const settingsFiles: string[] = [];
  for (const candidate of candidates) {
    if (await isFile(fileSystem, candidate)) {
      settingsFiles.push(candidate);
    }
  }
  const [orkeon] = VARIABLE_LAYERS.map(({ prefix, source, decisionSource }) => llmLayer(source, variableEntries(prefix, variables), decisionSource)) as [LlmLayer, LlmLayer];
  const layers: LlmLayer[] = [orkeon];
  for (const file of settingsFiles) {
    layers.push(llmLayer(file, flattenConfiguration(await readSettingsFile(fileSystem, file))));
  }
  return { settingsFile: settingsFiles[0] ?? null, layers, decisionKeys: decisionKeyVariables(layers, variables), settingsFiles };
}

/** `RunnerSettings.ResolveSettingsPath` without `--settings`: steps 2, 3 and 4. */
async function resolveSettingsFile(fileSystem: FileSystem, environment: Environment, crewFolder: string): Promise<string | null> {
  const nextToCrew = crewSettingsFile(crewFolder);
  if (await isFile(fileSystem, nextToCrew)) {
    return nextToCrew;
  }
  for (const { folder, candidates } of settingsWalk(crewFolder)) {
    for (const candidate of candidates) {
      if (await isFile(fileSystem, candidate)) {
        return candidate;
      }
    }
    if (await isFile(fileSystem, joinPath(folder, EXAMPLES_SOLUTION))) {
      break;
    }
  }
  const user = userSettingsFile(environment.get('XDG_CONFIG_HOME'), environment.homeDirectory());
  return (await isFile(fileSystem, user)) ? user : null;
}

/** `File.Exists`: a directory of that name does not count. */
async function isFile(fileSystem: FileSystem, path: string): Promise<boolean> {
  return (await fileSystem.exists(path)) && !(await fileSystem.isDirectory(path));
}
