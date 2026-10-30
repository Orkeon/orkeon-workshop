import { DomainError } from './errors.js';
import { baseUrlHost, isLocalHost } from './llm-target.js';
import { isAbsolutePath, joinPath, normalizePath } from './paths.js';

/**
 * How Orkeon assembles the `Llm` section of a run, reduced to the facts the remote rule needs: the
 * base URL that wins for the default provider and for each named profile (`Llm:Profiles:<id>`), and
 * whether the default exists at all (D32, read on Orkeon `main` at f80665f:
 * `RunnerSettings.ComposeSources`, `RunnerSettings.ResolveSettingsPath`, `LlmSettings`). `orkeon run`,
 * a TypeScript run and `orkeon-harness-run` share it. The same layers carry the section of the
 * decision model TypeSafe, `Orkeon:TypeSafe` (`effectiveDecisionModel`).
 *
 * The layers, highest precedence first (the working directory's appsettings files and the
 * `DOTNET_` variables are no longer read):
 * 1. the `ORKEON_Llm__*` variables;
 * 2. the settings file resolved for the crew folder: `--settings`, else `crewSettingsFile`, else the
 *    first file of `settingsWalk`, else `userSettingsFile`;
 * 3. the `Llm__*` variables, without a prefix.
 * Keys are case-insensitive and `:`-separated (`__` in a variable name); a JSON property name may
 * itself hold a `:`. Everything is flattened the way .NET flattens it before anything is read.
 */

/** A configuration entry as .NET stores it; `value` is undefined when .NET keeps none. */
export interface ConfigurationEntry {
  readonly key: string;
  readonly value: unknown;
}

/** A named profile as one source declares it: `Llm:Profiles:<id>`, a provider of the `Llm` shape. */
export interface ProfileLayer {
  /** The profile's name as the source spells it; names compare case-insensitively. */
  readonly id: string;
  /** The base URLs it sets for the profile, blanks left out (several only through variables). */
  readonly baseUrls: readonly string[];
}

/** One source of configuration, reduced to what the rule needs. */
export interface LlmLayer {
  /** How a message names it: a file path, or the variables (`ORKEON_Llm__* variables`). */
  readonly source: string;
  /**
   * True when the source gives the default provider a value: a key of `Llm` other than `Profiles`
   * holding a non-blank value (`LlmSettings.HasDefault`). Without one in any layer, Orkeon runs its
   * echo provider for every agent that names no profile.
   */
  readonly configured: boolean;
  /**
   * The base URLs it sets, blanks left out: one, or several when variables spelled with different
   * cases set it (.NET does not define which of them wins).
   */
  readonly baseUrls: readonly string[];
  /** True when it sets `Llm:Provider`, a key Orkeon refuses at start (the bench warns about it). */
  readonly setsProvider: boolean;
  /** The named profiles it declares, in the order it declares them. */
  readonly profiles: readonly ProfileLayer[];
  /** What it says of the decision model's section, `Orkeon:TypeSafe`. */
  readonly decisionModel: DecisionModelLayer;
}

/**
 * The section of the decision model TypeSafe as one source holds it (Orkeon `main` at f80665f,
 * `TypeSafeOptions`, `RunnerHost.RegisterDecisionModels`).
 */
export interface DecisionModelLayer {
  /** How a message names it: a file path, or the variables (`ORKEON_Orkeon__TypeSafe__* variables`). */
  readonly source: string;
  /**
   * `GetSection("Orkeon:TypeSafe").Exists()` on this source: a key below the section, with or
   * without a value, or the section itself holding a value — an empty string or an empty array
   * does; an empty object or a `null` does not (checked on a build of f80665f).
   */
  readonly configured: boolean;
  /**
   * The values it gives `Orkeon:TypeSafe:BaseUrl`, trimmed: a value that is no non-blank string — a
   * `null`, an empty object, a blank, a number — is kept as `''`, since it still hides the layers
   * under it and Orkeon binds no URL from it. Empty when the source does not hold the key.
   */
  readonly baseUrls: readonly string[];
}

/** A named profile, every layer applied. */
export interface EffectiveProfile {
  readonly id: string;
  /** Its base URL; null when no layer sets one — Orkeon then infers the provider from the model. */
  readonly baseUrl: string | null;
  /** The layer the base URL comes from; null without one. */
  readonly baseUrlSource: string | null;
  /** The layers that declare the profile, highest precedence first. */
  readonly definedBy: readonly string[];
}

/** What `llmTarget` judges, and where it comes from. */
export interface EffectiveLlmSettings {
  readonly baseUrl: string | null;
  readonly configured: boolean;
  /** The layer the base URL comes from; null without one. */
  readonly baseUrlSource: string | null;
  /** The layers that give the default provider a value, highest precedence first. */
  readonly configuredBy: readonly string[];
  /** Every named profile a crew may name (`llm: { profile: … }`, `--llm-profile`), in declaration order. */
  readonly profiles: readonly EffectiveProfile[];
  /** The decision model's section, every layer applied, and `TYPESAFE_API_KEY`. */
  readonly decisionModel: EffectiveDecisionModel;
}

/** What `decisionModelTarget` judges, and where it comes from. */
export interface EffectiveDecisionModel {
  /**
   * True when Orkeon registers TypeSafe for the run: the section exists in a layer, or
   * `TYPESAFE_API_KEY` holds a non-empty value (`RunnerHost.RegisterDecisionModels`).
   */
  readonly configured: boolean;
  /** The layers holding the section, highest precedence first, then the key variable when it is set. */
  readonly configuredBy: readonly string[];
  /**
   * The `Orkeon:TypeSafe:BaseUrl` that wins — that of the highest layer holding the key; `''` when
   * that value is none Orkeon can bind; null when no layer holds it: Orkeon then calls
   * `DECISION_MODEL_DEFAULT_BASE_URL`.
   */
  readonly baseUrl: string | null;
  /** The layer the base URL comes from; null without one. */
  readonly baseUrlSource: string | null;
}

/** The prefixes of the two variable layers, matched case-insensitively as .NET does. */
export const VARIABLE_LAYERS = [
  { prefix: 'ORKEON_', source: 'ORKEON_Llm__* variables', decisionSource: 'ORKEON_Orkeon__TypeSafe__* variables' },
  { prefix: '', source: 'Llm__* variables', decisionSource: 'Orkeon__TypeSafe__* variables' },
] as const;

/** The section of the decision model TypeSafe (`TypeSafeOptions.SectionName`, Orkeon `main` at f80665f). */
export const DECISION_MODEL_SECTION = 'Orkeon:TypeSafe';

/**
 * The variable whose non-empty value registers TypeSafe without any section
 * (`DecisionProviderDefaults.TypeSafeApiKeyVariable`). Orkeon reads it by its exact name on Linux;
 * the rule and the stub match it in any case, as Windows does.
 */
export const DECISION_MODEL_KEY_VARIABLE = 'TYPESAFE_API_KEY';

const DECISION_MODEL_KEY = DECISION_MODEL_SECTION.toLowerCase();

/** True for a configuration key that is, or lies in, `Orkeon:TypeSafe`, whatever its case. */
function isDecisionModelKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return lowered === DECISION_MODEL_KEY || lowered.startsWith(`${DECISION_MODEL_KEY}:`);
}

/**
 * True when the variable `name` can register the decision model: `TYPESAFE_API_KEY`, or a key of
 * `Orkeon:TypeSafe` in either variable layer — `ORKEON_Orkeon__TypeSafe__BaseUrl`,
 * `Orkeon__TypeSafe__ApiKey`, `ORKEON_ORKEON__TYPESAFE`, a name written with `:` —, in any case.
 */
export function isDecisionModelVariable(name: string): boolean {
  const lowered = name.toLowerCase();
  if (lowered === DECISION_MODEL_KEY_VARIABLE.toLowerCase()) {
    return true;
  }
  return VARIABLE_LAYERS.some(({ prefix }) => lowered.startsWith(prefix.toLowerCase()) && isDecisionModelKey(lowered.slice(prefix.length).replaceAll('__', ':')));
}

/**
 * True when Orkeon reads the variable `name` into its `Llm` section, however its letters are cased
 * and whichever layer it belongs to: `ORKEON_Llm__BaseUrl`, `ORKEON_LLM__BASEURL`, `Llm__Model`,
 * `ORKEON_LLM__PROFILES__PAID__APIKEY`, a name written with `:`. .NET matches the prefix and the keys
 * without case, so two spellings of one key are two variables of which it keeps either.
 */
export function isLlmVariable(name: string): boolean {
  const lowered = name.toLowerCase();
  return VARIABLE_LAYERS.some(({ prefix }) => {
    if (!lowered.startsWith(prefix.toLowerCase())) {
      return false;
    }
    const key = lowered.slice(prefix.length).replaceAll('__', ':');
    return key === 'llm' || key.startsWith('llm:');
  });
}

/** The variables without any that sets a key of `Llm`: what a run inherits when the bench chooses its model. */
export function withoutLlmVariables(variables: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(variables).filter(([name]) => !isLlmVariable(name)));
}

/**
 * Secrets a tool hands to a paid model of its own, outside the `Llm` section: `image_generation`
 * reads `ORKEON_OPENAI_API_KEY` when it runs. A run on the simulated LLM never carries them.
 */
export const PAID_MODEL_SECRET_VARIABLES = ['ORKEON_OPENAI_API_KEY'] as const;

/**
 * The environment of a run on the simulated LLM: everything the caller has but its `Llm` variables,
 * the secrets of paid models and every variable that can register the decision model
 * (`isDecisionModelVariable`), then the variables that point the run at the stub. Laying the stub's
 * over the caller's would not do — a caller variable spelled in another case would stand beside the
 * injected one, and Orkeon could keep it. Without TypeSafe a decision task answers from its
 * fallback, as on a machine where TypeSafe is not configured.
 */
export function stubRunVariables(variables: Readonly<Record<string, string>>, injected: Readonly<Record<string, string>>): Record<string, string> {
  const secrets = PAID_MODEL_SECRET_VARIABLES.map((name) => name.toLowerCase());
  const kept = Object.entries(withoutLlmVariables(variables)).filter(([name]) => !secrets.includes(name.toLowerCase()) && !isDecisionModelVariable(name));
  return { ...Object.fromEntries(kept), ...injected };
}

/** Where the simulated LLM answers, and under which name and key: what a generated settings file points every provider at. */
export interface StubEndpoint {
  readonly baseUrl: string;
  readonly model: string;
  /** A fake, non-empty key: not a secret. */
  readonly apiKey: string;
}

/** True for a top-level key of a settings file that is, or lies in, the `Llm` section: `Llm`, `LLM`, `Llm:Profiles:x:BaseUrl`. */
function isLlmSettingsKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return lowered === 'llm' || lowered.startsWith('llm:');
}

/**
 * A settings object without the decision model's section: every property whose configuration path
 * is, or lies in, `Orkeon:TypeSafe` — `Orkeon.TypeSafe` nested, in any case, a flat
 * `"Orkeon:TypeSafe:BaseUrl"`, an `Orkeon` property `"TypeSafe:Guard"` — is left out, and the rest of
 * `Orkeon` is kept as it is.
 */
function withoutDecisionModel(settings: Readonly<Record<string, unknown>>, path = ''): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(settings)) {
    const key = path === '' ? name : `${path}:${name}`;
    if (isDecisionModelKey(key)) {
      continue;
    }
    const inside = DECISION_MODEL_KEY.startsWith(`${key.toLowerCase()}:`);
    kept[name] = inside && value !== null && typeof value === 'object' && !Array.isArray(value) ? withoutDecisionModel(value as Record<string, unknown>, key) : value;
  }
  return kept;
}

/**
 * The settings file of a run on the simulated LLM: `original` — the file the run would have read, as
 * parsed, or null when it would have read none — with its whole `Llm` section replaced by one that
 * points the default provider and every named profile at the stub, the section of the decision model
 * (`Orkeon:TypeSafe`) left out, and nothing else changed. No key of the original `Llm` is kept: an
 * endpoint, a key, the name of a variable that holds one never reach the run. The profiles are those
 * of every layer (`profileIds`): the ones the file declares and the ones variables declare, so that an
 * agent naming any of them reaches the stub.
 *
 * A file rather than variables: a profile is `ORKEON_Llm__Profiles__<id>__BaseUrl` as a variable, and
 * a shell between the bench and Orkeon (`#!/bin/sh` … `exec orkeon`) drops a variable whose name is
 * no identifier — a profile named `fast-remote`, `gpt.4` or `my profile` would keep the endpoint and
 * the key of the original file.
 */
export function stubSettings(original: unknown, stub: StubEndpoint, profileIds: readonly string[]): Record<string, unknown> {
  if (original !== null && (typeof original !== 'object' || Array.isArray(original))) {
    throw new DomainError('a settings file is a JSON object');
  }
  const provider = { BaseUrl: stub.baseUrl, Model: stub.model, ApiKey: stub.apiKey };
  const kept = Object.entries(withoutDecisionModel((original ?? {}) as Record<string, unknown>)).filter(([key]) => !isLlmSettingsKey(key));
  return { ...Object.fromEntries(kept), Llm: { ...provider, Profiles: Object.fromEntries(profileIds.map((id) => [id, { ...provider }])) } };
}

export const SETTINGS_FILE_NAME = 'appsettings.json';
/** The folder whose solution file ends the walk up (`RunnerSettings.FindSettingsByWalkingUp`). */
export const EXAMPLES_SOLUTION = 'Orkeon.Examples.sln';

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

const PROFILE_KEY = /^llm:profiles:([^:]+)(?::(.*))?$/;

/** A value .NET keeps as one: neither absent nor blank (`LlmSettings.HoldsValue`). */
function holdsValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

/**
 * The layer some entries make: configured when a key below `Llm`, outside `Llm:Profiles`, holds a
 * non-blank value (`"Llm": { "Model": null }` or a section of profiles alone is no default); a
 * profile for every name below `Llm:Profiles`, with or without a value; a base URL only from a
 * non-blank string. The decision model's part (`DecisionModelLayer`) is named `decisionSource`.
 */
export function llmLayer(source: string, entries: readonly ConfigurationEntry[], decisionSource: string = source): LlmLayer {
  let configured = false;
  let setsProvider = false;
  const baseUrls: string[] = [];
  const profiles = new Map<string, { id: string; baseUrls: string[] }>();
  let decisionConfigured = false;
  const decisionBaseUrls: string[] = [];
  for (const { key, value } of entries) {
    const lowered = key.toLowerCase();
    if (isDecisionModelKey(lowered)) {
      // Exists(): the section's own key counts only with a value, a key below it with or without one.
      decisionConfigured ||= lowered !== DECISION_MODEL_KEY || value !== undefined;
      if (lowered === `${DECISION_MODEL_KEY}:baseurl`) {
        decisionBaseUrls.push(typeof value === 'string' ? value.trim() : '');
      }
      continue;
    }
    const profile = PROFILE_KEY.exec(lowered);
    if (profile !== null) {
      const name = profile[1] as string;
      const entry = profiles.get(name) ?? { id: key.split(':')[2] as string, baseUrls: [] };
      profiles.set(name, entry);
      if (profile[2] === 'baseurl' && typeof value === 'string' && value.trim().length > 0) {
        entry.baseUrls.push(value.trim());
      }
      continue;
    }
    if (lowered.startsWith('llm:') && lowered !== 'llm:profiles' && holdsValue(value)) {
      configured = true;
    }
    if (lowered === 'llm:baseurl' && typeof value === 'string' && value.trim().length > 0) {
      baseUrls.push(value.trim());
    }
    setsProvider ||= lowered === 'llm:provider';
  }
  return {
    source,
    configured,
    baseUrls,
    setsProvider,
    profiles: [...profiles.values()],
    decisionModel: { source: decisionSource, configured: decisionConfigured, baseUrls: decisionBaseUrls },
  };
}

/** Of several base URLs one layer gives a key, the first that is not local: the one .NET keeps is not defined. */
function pickBaseUrl(urls: readonly string[], extraLocalHosts: readonly string[]): string {
  const isLocal = (url: string): boolean => {
    const host = baseUrlHost(url);
    return host !== null && isLocalHost(host, extraLocalHosts);
  };
  return urls.find((url) => !isLocal(url)) ?? (urls[0] as string);
}

/**
 * The decision model of a run: registered when a layer holds `Orkeon:TypeSafe` or `decisionKey` —
 * the name of a `TYPESAFE_API_KEY` variable holding a non-empty value — is given; its base URL is
 * that of the highest layer holding the key, whatever the value (`DecisionModelLayer.baseUrls`).
 */
export function effectiveDecisionModel(layers: readonly LlmLayer[], decisionKey: string | null = null, extraLocalHosts: readonly string[] = []): EffectiveDecisionModel {
  const configuredBy = [...layers.filter((layer) => layer.decisionModel.configured).map((layer) => layer.decisionModel.source), ...(decisionKey === null ? [] : [decisionKey])];
  const winner = layers.find((layer) => layer.decisionModel.baseUrls.length > 0)?.decisionModel;
  return {
    configured: configuredBy.length > 0,
    configuredBy,
    baseUrl: winner === undefined ? null : pickBaseUrl(winner.baseUrls, extraLocalHosts),
    baseUrlSource: winner?.source ?? null,
  };
}

/**
 * The layers, highest precedence first → what the rule judges: the base URL of the first layer that
 * sets one — of several, the first that is not local, since the one .NET keeps is not defined — and
 * configured when any layer is; then the decision model (`effectiveDecisionModel`, `decisionKey`).
 */
export function effectiveLlmSettings(layers: readonly LlmLayer[], extraLocalHosts: readonly string[] = [], decisionKey: string | null = null): EffectiveLlmSettings {
  const pick = (urls: readonly string[]): string => pickBaseUrl(urls, extraLocalHosts);
  const decisionModel = effectiveDecisionModel(layers, decisionKey, extraLocalHosts);

  const configuredBy = layers.filter((layer) => layer.configured).map((layer) => layer.source);
  const winner = layers.find((layer) => layer.baseUrls.length > 0);

  // Highest layer first, as the run gate lists them; the name as the highest layer spells it.
  const names = new Map<string, string>();
  for (const layer of layers) {
    for (const profile of layer.profiles) {
      if (!names.has(profile.id.toLowerCase())) {
        names.set(profile.id.toLowerCase(), profile.id);
      }
    }
  }
  const profiles = [...names.entries()].map(([name, id]): EffectiveProfile => {
    const declarations = layers.flatMap((layer) =>
      layer.profiles.filter((profile) => profile.id.toLowerCase() === name).map((profile) => ({ layer, profile })),
    );
    const set = declarations.find(({ profile }) => profile.baseUrls.length > 0);
    return {
      id,
      baseUrl: set === undefined ? null : pick(set.profile.baseUrls),
      baseUrlSource: set?.layer.source ?? null,
      definedBy: [...new Set(declarations.map(({ layer }) => layer.source))],
    };
  });

  if (winner === undefined) {
    return { baseUrl: null, configured: configuredBy.length > 0, baseUrlSource: null, configuredBy, profiles, decisionModel };
  }
  return { baseUrl: pick(winner.baseUrls), configured: true, baseUrlSource: winner.source, configuredBy, profiles, decisionModel };
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
