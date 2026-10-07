import {
  EXAMPLES_SOLUTION,
  VARIABLE_LAYERS,
  crewSettingsFile,
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
}

/**
 * The `Llm` layers a run of the crew would see: the variables of the bench's own environment and
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
  const [orkeon, unprefixed] = VARIABLE_LAYERS.map(({ prefix, source }) => llmLayer(source, variableEntries(prefix, variables))) as [LlmLayer, LlmLayer];

  const layers: LlmLayer[] = [orkeon];
  if (settingsFile !== null) {
    layers.push(await fileLayer(settingsFile));
  }
  layers.push(unprefixed);
  return { settingsFile, layers };
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
