import { baseUrlHost, isLocalHost } from './llm-target.js';
import { isAbsolutePath, joinPath, normalizePath } from './paths.js';

/**
 * How Orkeon assembles the `Llm` section of a run, reduced to the two facts the remote rule needs:
 * the base URL that wins, and whether the section exists at all (D32, read on Orkeon `main` at
 * 24ab0d0: `RunnerHost.Build` on `Host.CreateDefaultBuilder`, `RunnerSettings.ResolveSettingsPath`).
 * `orkeon run`, a TypeScript run and `orkeon-harness-run` share it.
 *
 * The layers, highest precedence first:
 * 1. the `ORKEON_Llm__*` variables;
 * 2. the settings file resolved for the crew folder: `--settings`, else `crewSettingsFile`, else the
 *    first file of `settingsWalk`, else `userSettingsFile`;
 * 3. the `Llm__*` variables, without a prefix;
 * 4. `appsettings.<environment>.json`, then `appsettings.json`, in the run's working directory;
 * 5. the `DOTNET_Llm__*` variables.
 * Keys are case-insensitive and `:`-separated (`__` in a variable name); a JSON property name may
 * itself hold a `:`. Everything is flattened the way .NET flattens it before anything is read.
 */

/** A configuration entry as .NET stores it; `value` is undefined when .NET keeps none. */
export interface ConfigurationEntry {
  readonly key: string;
  readonly value: unknown;
}

/** One source of configuration, reduced to what the rule needs. */
export interface LlmLayer {
  /** How a message names it: a file path, or the variables (`ORKEON_Llm__* variables`). */
  readonly source: string;
  /** True when the source creates the `Llm` section: Orkeon then leaves its echo provider. */
  readonly configured: boolean;
  /**
   * The base URLs it sets, blanks left out: one, or several when variables spelled with different
   * cases set it (.NET does not define which of them wins).
   */
  readonly baseUrls: readonly string[];
  /** True when it sets `Llm:Provider`, a key Orkeon does not read (the bench warns about it). */
  readonly setsProvider: boolean;
}

/** What `llmTarget` judges, and where it comes from. */
export interface EffectiveLlmSettings {
  readonly baseUrl: string | null;
  readonly configured: boolean;
  /** The layer the base URL comes from; null without one. */
  readonly baseUrlSource: string | null;
  /** The layers that create the `Llm` section, highest precedence first. */
  readonly configuredBy: readonly string[];
}

/** The prefixes of the three variable layers, matched case-insensitively as .NET does. */
export const VARIABLE_LAYERS = [
  { prefix: 'ORKEON_', source: 'ORKEON_Llm__* variables' },
  { prefix: '', source: 'Llm__* variables' },
  { prefix: 'DOTNET_', source: 'DOTNET_Llm__* variables' },
] as const;

export const SETTINGS_FILE_NAME = 'appsettings.json';
/** The folder whose solution file ends the walk up (`RunnerSettings.FindSettingsByWalkingUp`). */
export const EXAMPLES_SOLUTION = 'Orkeon.Examples.sln';
/** `Host.CreateDefaultBuilder` names its second file after this environment. */
export const DEFAULT_HOST_ENVIRONMENT = 'Production';

/**
 * The entries of a parsed JSON settings file: nested names joined with `:`, array items by index.
 * As the main binary reads them (checked with `--validate -v 1`): an empty object and a `null` keep
 * the key without a value, an empty array holds an empty string.
 */
export function flattenConfiguration(json: unknown): ConfigurationEntry[] {
  const entries: ConfigurationEntry[] = [];
  const visit = (value: unknown, key: string): void => {
    if (value === null) {
      if (key !== '') {
        entries.push({ key, value: undefined });
      }
      return;
    }
    if (typeof value === 'object') {
      const children: [string, unknown][] = Array.isArray(value)
        ? value.map((item, index): [string, unknown] => [String(index), item])
        : Object.entries(value);
      if (children.length === 0) {
        if (key !== '') {
          entries.push({ key, value: Array.isArray(value) ? '' : undefined });
        }
        return;
      }
      for (const [name, child] of children) {
        visit(child, key === '' ? name : `${key}:${name}`);
      }
      return;
    }
    if (key !== '') {
      entries.push({ key, value });
    }
  };
  visit(json, '');
  return entries;
}

/** The entries `AddEnvironmentVariables(prefix)` reads: the prefix dropped, `__` read as `:`. */
export function variableEntries(prefix: string, variables: Readonly<Record<string, string>>): ConfigurationEntry[] {
  const lowered = prefix.toLowerCase();
  return Object.entries(variables)
    .filter(([name]) => name.toLowerCase().startsWith(lowered))
    .map(([name, value]) => ({ key: name.slice(prefix.length).replaceAll('__', ':'), value }));
}

/**
 * The layer some entries make: configured when one of them is `Llm` with a value, or lies below
 * `Llm` with or without one (`"Llm": { "Model": null }` still makes the section); a base URL only
 * from a non-blank string.
 */
export function llmLayer(source: string, entries: readonly ConfigurationEntry[]): LlmLayer {
  let configured = false;
  let setsProvider = false;
  const baseUrls: string[] = [];
  for (const { key, value } of entries) {
    const lowered = key.toLowerCase();
    if ((lowered === 'llm' && value !== undefined) || lowered.startsWith('llm:')) {
      configured = true;
    }
    if (lowered === 'llm:baseurl' && typeof value === 'string' && value.trim().length > 0) {
      baseUrls.push(value.trim());
    }
    setsProvider ||= lowered === 'llm:provider';
  }
  return { source, configured, baseUrls, setsProvider };
}

/**
 * The layers, highest precedence first → what the rule judges: the base URL of the first layer that
 * sets one — of several, the first that is not local, since the one .NET keeps is not defined — and
 * configured when any layer is.
 */
export function effectiveLlmSettings(layers: readonly LlmLayer[], extraLocalHosts: readonly string[] = []): EffectiveLlmSettings {
  const configuredBy = layers.filter((layer) => layer.configured).map((layer) => layer.source);
  const winner = layers.find((layer) => layer.baseUrls.length > 0);
  if (winner === undefined) {
    return { baseUrl: null, configured: configuredBy.length > 0, baseUrlSource: null, configuredBy };
  }
  const isLocal = (url: string): boolean => {
    const host = baseUrlHost(url);
    return host !== null && isLocalHost(host, extraLocalHosts);
  };
  const baseUrl = winner.baseUrls.find((url) => !isLocal(url)) ?? (winner.baseUrls[0] as string);
  return { baseUrl, configured: true, baseUrlSource: winner.source, configuredBy };
}

/** Step 2 of `RunnerSettings.ResolveSettingsPath`: the file next to the crew. */
export function crewSettingsFile(crewFolder: string): string {
  return joinPath(crewFolder, SETTINGS_FILE_NAME);
}

/**
 * Step 3: the folders it walks, from the crew folder up to the root, each with its two candidates —
 * `appsettings/appsettings.json`, then the legacy `_shared/appsettings.json`. The walk ends at the
 * first candidate that exists, or after the folder holding `EXAMPLES_SOLUTION`.
 */
export function settingsWalk(crewFolder: string): { folder: string; candidates: [string, string] }[] {
  const steps: { folder: string; candidates: [string, string] }[] = [];
  for (let folder = normalizePath(crewFolder); ; folder = joinPath(folder, '..')) {
    steps.push({ folder, candidates: [joinPath(folder, 'appsettings', SETTINGS_FILE_NAME), joinPath(folder, '_shared', SETTINGS_FILE_NAME)] });
    if (folder === '/' || !isAbsolutePath(folder)) {
      return steps;
    }
  }
}

/** Step 4: the user's file `orkeon init` writes — `$XDG_CONFIG_HOME/Orkeon`, else `~/.config/Orkeon`. */
export function userSettingsFile(xdgConfigHome: string | undefined, home: string): string {
  const base = xdgConfigHome !== undefined && xdgConfigHome.length > 0 ? xdgConfigHome : joinPath(home, '.config');
  return joinPath(base, 'Orkeon', SETTINGS_FILE_NAME);
}

/** The files `Host.CreateDefaultBuilder` reads in the working directory, highest precedence first. */
export function workingDirectoryFiles(workingDirectory: string, hostEnvironment: string): string[] {
  return [joinPath(workingDirectory, `appsettings.${hostEnvironment}.json`), joinPath(workingDirectory, SETTINGS_FILE_NAME)];
}

/** `DOTNET_ENVIRONMENT`, whatever the case of its name; `Production` when unset or empty. */
export function hostEnvironment(variables: Readonly<Record<string, string>>): string {
  const entry = Object.entries(variables).find(([name, value]) => name.toLowerCase() === 'dotnet_environment' && value.length > 0);
  return entry === undefined ? DEFAULT_HOST_ENVIRONMENT : entry[1];
}
