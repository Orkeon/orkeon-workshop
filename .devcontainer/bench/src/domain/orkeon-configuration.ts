import { DomainError } from './errors.js';
import { DECISION_PROVIDERS, baseUrlHost, isLocalHost, type DecisionProvider, type DecisionProviderKey } from './llm-target.js';
import { isAbsolutePath, joinPath, normalizePath } from './paths.js';

/**
 * How Orkeon assembles the `Llm` section of a run, reduced to the facts the remote rule needs: the
 * base URL that wins for the default provider and for each named profile (`Llm:Profiles:<id>`), and
 * whether the default exists at all (D32, read on Orkeon `main` at 151a762:
 * `RunnerSettings.ComposeSources`, `RunnerSettings.ResolveSettingsPath`, `LlmSettings`). `orkeon run`,
 * a TypeScript run and `orkeon-harness-run` share it. The same layers carry the section of the
 * decision settings — the providers TypeSafe, Liquid and Kev, `Orkeon:Decision:*` (`effectiveDecisionModel`).
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
  /** What it says of the decision settings: the providers' sections, `Orkeon:Decision:Provider`, the guard. */
  readonly decisionModel: DecisionModelLayer;
  /** The decision profiles it declares (`Orkeon:Decision:Profiles:<name>`), in the order it declares them. */
  readonly decisionProfiles?: readonly DecisionProfileLayer[];
}

/** A decision profile as one source declares it. */
export interface DecisionProfileLayer {
  /** Its name as the source spells it; names compare case-insensitively. */
  readonly id: string;
  /** The LLM profile it decorates (`Target`, trimmed); null when the source sets none. */
  readonly target: string | null;
}

/**
 * The decision settings as one source holds them (Orkeon 1.2.0, `DecisionProviderChoice`,
 * `DecisionProviderDescriptor`, `GuardianLlmOptions`, `SettingsValidation`): each provider's section,
 * `Orkeon:Decision:Provider`, the LLM judge `Orkeon:Guardian:Llm` and its two former sections,
 * `Orkeon:Decision:Guard` and `Orkeon:TypeSafe:Guard`.
 */
export interface DecisionModelLayer {
  /** How a message names the source of `Orkeon:Decision:*`: a file path, or the variables (`ORKEON_Orkeon__Decision__* variables`). */
  readonly source: string;
  /** Each provider's section in this source. */
  readonly sections: Readonly<Record<DecisionProviderKey, DecisionSectionLayer>>;
  /** The values it gives `Orkeon:Decision:Provider`, trimmed (`''` for one that is no string); empty when it does not hold the key. */
  readonly providerNames: readonly string[];
  /** True when it holds the LLM judge's section, `Orkeon:Guardian:Llm`, or a key below it. */
  readonly guard: boolean;
  /**
   * The values it gives `Orkeon:Guardian:Llm:Enabled`, trimmed and lowercased (`''` for one that is no
   * string); empty when it does not hold the key. The judge is off by default.
   */
  readonly judgeEnabled: readonly string[];
  /** The values it gives `Orkeon:Guardian:Enabled`, as `judgeEnabled`. The guardian is on by default. */
  readonly guardianEnabled: readonly string[];
  /**
   * The former sections of the judge it holds, or holds a key below (`RETIRED_GUARD_SECTIONS`): Orkeon
   * refuses to start on either, as a key that is no setting.
   */
  readonly retiredGuards: readonly string[];
}

/** One provider's section as one source holds it. */
export interface DecisionSectionLayer {
  /** How a message names it: a file path, or the variables (`ORKEON_Orkeon__TypeSafe__* variables`). */
  readonly source: string;
  /**
   * `DecisionProviderChoice.HasSection` on this source: a key that is, or lies below, the section,
   * with or without a value — an empty object or a `null` included (R-64).
   */
  readonly configured: boolean;
  /**
   * The values it gives `<section>:BaseUrl`, trimmed: a `null`, an empty object or anything that is
   * no string or number is kept as `''` — it still hides the layers under it, and Orkeon fills a blank
   * with the provider's default (`DecisionProviderDescriptor.FillBlanks`). Empty when it does not hold the key.
   */
  readonly baseUrls: readonly string[];
  /** The values it gives `<section>:Model`, trimmed, as `baseUrls`. */
  readonly models: readonly string[];
  /** The values it gives `<section>:ApiKeyEnvVar`, trimmed, as `baseUrls`. */
  readonly apiKeyEnvVars: readonly string[];
  /** Whether it holds `<section>:ApiKey`, and with a non-empty value: null when it does not hold it. The value itself is never kept. */
  readonly apiKey: boolean | null;
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
  /** The decision provider, every layer and the key variables applied. */
  readonly decisionModel: EffectiveDecisionModel;
}

/**
 * The decision model of a run, every layer applied (`effectiveDecisionModel`, Orkeon 1.2.0,
 * `DecisionProviderChoice.Resolve`).
 */
export interface EffectiveDecisionModel {
  /** True when Orkeon registers a decision provider for the run, or refuses its decision settings (`refusal`). */
  readonly configured: boolean;
  /** The active provider; null without one, and when the start is refused. */
  readonly provider: DecisionProviderKey | null;
  /** How it was chosen: named by `Orkeon:Decision:Provider`, or deduced from a section or a key variable. */
  readonly how: 'named' | 'deduced' | null;
  /**
   * Why Orkeon refuses to start on the decision settings — an LLM judge enabled without a provider
   * included, which a fail-open judge would survive —, in one sentence; null otherwise.
   */
  readonly refusal: string | null;
  /**
   * The layers that configure it, highest precedence first — those holding the provider's section, then
   * those naming it — then its key variable when it is set. For a refusal, every layer holding a decision
   * setting, then every key variable set.
   */
  readonly configuredBy: readonly string[];
  /**
   * The provider's base URL: the non-blank `<section>:BaseUrl` of the highest layer holding the key,
   * else its default (`DECISION_PROVIDERS`); null without a provider.
   */
  readonly baseUrl: string | null;
  /** The layer the base URL comes from; null when it is the default, or without a provider. */
  readonly baseUrlSource: string | null;
  /** The provider's model, chosen as the base URL; null without a provider. */
  readonly model: string | null;
  /** The variable its key is read from (`<section>:ApiKeyEnvVar`, else the default); null without a provider. */
  readonly keyVariable: string | null;
}

/** The prefixes of the two variable layers, matched case-insensitively as .NET does. */
export const VARIABLE_LAYERS = [
  { prefix: 'ORKEON_', source: 'ORKEON_Llm__* variables', decisionSource: (section: string) => `ORKEON_Orkeon__${section}__* variables` },
  { prefix: '', source: 'Llm__* variables', decisionSource: (section: string) => `Orkeon__${section}__* variables` },
] as const;

/** The setting that names the decision provider, whatever its case (`DecisionProviderChoice`, Orkeon 1.2.0). */
export const DECISION_PROVIDER_SETTING = 'Orkeon:Decision:Provider';

/**
 * The LLM judge's section (`GuardianLlmOptions.SectionName`, Orkeon 1.2.0): with `Enabled`, and unless
 * `Orkeon:Guardian:Enabled` is false, the decision model judges the input of every agent turn and the
 * output of every task (`Phases`), and a judge that cannot answer refuses the text (`FailMode: Closed`,
 * the default; `Open` lets it through). Enabled without a decision provider, Orkeon starts and every
 * crew run fails before its first task.
 */
export const GUARDIAN_LLM_SECTION = 'Orkeon:Guardian:Llm';

/** The setting that switches the whole guardian, the judge with it; on by default (`GuardianOptions`). */
export const GUARDIAN_ENABLED_SETTING = 'Orkeon:Guardian:Enabled';

/**
 * The decision profiles (`DecisionProfilesOptions`, Orkeon 1.2.0): each `Orkeon:Decision:Profiles:<name>` is
 * registered as an LLM profile a crew can name, whether a decision provider is active or not. Without one
 * (the decision circuit off, Orkeon 1.4.0, #433) it is built without the model: its calls go to the
 * route's fallback, else its target, with no guard and no escalation — a fail-closed profile with a guard
 * blocks them all. A malformed one refuses the start.
 */
export const DECISION_PROFILES_SECTION = 'Orkeon:Decision:Profiles';

/**
 * The judge's former sections: `Orkeon:Decision:Guard` (until 1.0.0-rc.6) and `Orkeon:TypeSafe:Guard`
 * (before it). Orkeon 1.2.0 refuses to start on either, in a file or a variable, with or without a
 * decision provider: "… is not a setting" (checked on the CLI).
 */
export const RETIRED_GUARD_SECTIONS = ['Orkeon:Decision:Guard', 'Orkeon:TypeSafe:Guard'] as const;

/**
 * The variables whose non-empty value lets Orkeon deduce a hosted provider, or holds a provider's key
 * (`DecisionProviderDefaults`): `TYPESAFE_API_KEY`, `LIQUID_API_KEY`, `KEV_API_KEY`. Orkeon reads them
 * by their exact name on Linux; the rule and the stub match them in any case, as Windows does.
 */
export const DECISION_KEY_VARIABLES: readonly string[] = DECISION_PROVIDERS.map((provider) => provider.apiKeyVariable);

/**
 * What a run on the simulated LLM leaves out, lowercased: every provider's section, the provider's name,
 * the LLM judge — which, left on without a provider, would fail every run — with its former sections,
 * and the decision profiles.
 */
const DECISION_PATHS = [...DECISION_PROVIDERS.map((provider) => provider.section), DECISION_PROVIDER_SETTING, GUARDIAN_LLM_SECTION, ...RETIRED_GUARD_SECTIONS, DECISION_PROFILES_SECTION].map((path) =>
  path.toLowerCase(),
);

/** True when the lowercased `key` is `path` or lies below it. */
function isAtOrBelow(key: string, path: string): boolean {
  return key === path || key.startsWith(`${path}:`);
}

/**
 * True for a configuration key that is, or lies in, a decision setting, whatever its case: a
 * provider's section (`Orkeon:TypeSafe`, `Orkeon:Liquid`, `Orkeon:Kev`), `Orkeon:Decision:Provider`,
 * `Orkeon:Guardian:Llm`, the retired `Orkeon:Decision:Guard` or `Orkeon:Decision:Profiles`.
 */
function isDecisionModelKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return DECISION_PATHS.some((path) => isAtOrBelow(lowered, path));
}

/**
 * True when the variable `name` can give the run a decision provider, a decision profile, or refuse
 * its start: one of `DECISION_KEY_VARIABLES`, or a key of a decision setting in either variable layer —
 * `ORKEON_Orkeon__TypeSafe__BaseUrl`, `Orkeon__Liquid__ApiKey`, `ORKEON_ORKEON__KEV`,
 * `ORKEON_Orkeon__Decision__Provider`, `Orkeon__Guardian__Llm__Enabled`,
 * `ORKEON_Orkeon__Decision__Profiles__triage__Target`, a name written with `:` —, in any case.
 */
export function isDecisionModelVariable(name: string): boolean {
  const lowered = name.toLowerCase();
  if (DECISION_KEY_VARIABLES.some((variable) => variable.toLowerCase() === lowered)) {
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
 * `injected` laid over `variables`, without any caller variable spelled like an injected one in
 * another case: .NET reads the names without case and could keep either (D96, the decision block).
 */
export function overlayVariables(variables: Readonly<Record<string, string>>, injected: Readonly<Record<string, string>>): Record<string, string> {
  const names = new Set(Object.keys(injected).map((name) => name.toLowerCase()));
  const kept = Object.entries(variables).filter(([name]) => !names.has(name.toLowerCase()));
  return { ...Object.fromEntries(kept), ...injected };
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
 * injected one, and Orkeon could keep it. Without a decision provider a decision task answers from
 * its fallback, as on a machine where none is configured, and no decision setting refuses the start;
 * a decision profile a variable declares is left out too, and `stubSettings` makes its name a plain
 * profile on the stub.
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
 * A settings object without the decision settings: every property whose configuration path is, or
 * lies in, a provider's section, `Orkeon:Decision:Provider`, `Orkeon:Guardian:Llm`, the retired
 * `Orkeon:Decision:Guard` or `Orkeon:Decision:Profiles` —
 * `Orkeon.TypeSafe` nested, in any case, a flat `"Orkeon:Liquid:BaseUrl"`, an `Orkeon` property
 * `"Decision:Provider"` — is left out, and the rest of `Orkeon` (`Orkeon:Decision:Enabled` too) is
 * kept as it is.
 */
function withoutDecisionModel(settings: Readonly<Record<string, unknown>>, path = ''): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(settings)) {
    const key = path === '' ? name : `${path}:${name}`;
    if (isDecisionModelKey(key)) {
      continue;
    }
    const inside = DECISION_PATHS.some((stripped) => stripped.startsWith(`${key.toLowerCase()}:`));
    kept[name] = inside && value !== null && typeof value === 'object' && !Array.isArray(value) ? withoutDecisionModel(value as Record<string, unknown>, key) : value;
  }
  return kept;
}

/**
 * The settings file of a run on the simulated LLM: `original` — the file the run would have read, as
 * parsed, or null when it would have read none — with its whole `Llm` section replaced by one that
 * points the default provider and every named profile at the stub, the section of the decision model
 * (`withoutDecisionModel`) left out, and nothing else changed. No key of the original `Llm` is kept: an
 * endpoint, a key, the name of a variable that holds one never reach the run. The profiles are those
 * of every layer (`profileIds`): the ones the file declares and the ones variables declare, so that an
 * agent naming any of them reaches the stub. So are the decision profiles (`decisionProfileIds`): with
 * no decision provider in a stub run, Orkeon would register each and throw at its first use ("no
 * decision model is registered"); their section is left out and each name becomes a plain profile on
 * the stub — where its target would have pointed too, every profile of the run being the stub.
 *
 * A file rather than variables: a profile is `ORKEON_Llm__Profiles__<id>__BaseUrl` as a variable, and
 * a shell between the bench and Orkeon (`#!/bin/sh` … `exec orkeon`) drops a variable whose name is
 * no identifier — a profile named `fast-remote`, `gpt.4` or `my profile` would keep the endpoint and
 * the key of the original file.
 */
export function stubSettings(original: unknown, stub: StubEndpoint, profileIds: readonly string[], decisionProfileIds: readonly string[] = []): Record<string, unknown> {
  if (original !== null && (typeof original !== 'object' || Array.isArray(original))) {
    throw new DomainError('a settings file is a JSON object');
  }
  // `CallMode: Buffer`: Orkeon streams by default (`Llm:CallMode` Auto, `CallModeLlmProvider`, Orkeon
  // 1.2.0) and the stub answers buffered JSON only, so every call on it is pinned to one answer.
  const provider = { BaseUrl: stub.baseUrl, Model: stub.model, ApiKey: stub.apiKey, CallMode: 'Buffer' };
  const kept = Object.entries(withoutDecisionModel((original ?? {}) as Record<string, unknown>)).filter(([key]) => !isLlmSettingsKey(key));
  const names = new Map<string, string>();
  for (const id of [...profileIds, ...decisionProfileIds]) {
    if (!names.has(id.toLowerCase())) {
      names.set(id.toLowerCase(), id);
    }
  }
  return { ...Object.fromEntries(kept), Llm: { ...provider, Profiles: Object.fromEntries([...names.values()].map((id) => [id, { ...provider }])) } };
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
const DECISION_PROFILE_KEY = /^orkeon:decision:profiles:([^:]+)(?::(.*))?$/;

/** A value .NET keeps as one: neither absent nor blank (`LlmSettings.HoldsValue`). */
function holdsValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

/** A value as Orkeon binds it into a string: trimmed, `''` for what is no string, number nor boolean. */
function settingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** What a decision base URL holding only sub-keys reads as: no address, so no host and remote. */
const UNBINDABLE_BASE_URL = '(a section with sub-keys, no value)';

/** How the decision settings of a source are named: one name, or one per section (`VARIABLE_LAYERS`). */
export type DecisionSource = string | ((section: string) => string);

/** The decision settings some entries hold (`DecisionModelLayer`); `entries` are those of one source. */
function decisionLayer(entries: readonly ConfigurationEntry[], decisionSource: DecisionSource): DecisionModelLayer {
  const label = (section: string): string => (typeof decisionSource === 'string' ? decisionSource : decisionSource(section.split(':')[1] as string));
  const sections = Object.fromEntries(
    DECISION_PROVIDERS.map((provider) => [provider.key, { source: label(provider.section), configured: false, baseUrls: [] as string[], models: [] as string[], apiKeyEnvVars: [] as string[], apiKey: null as boolean | null }]),
  ) as Record<DecisionProviderKey, { source: string; configured: boolean; baseUrls: string[]; models: string[]; apiKeyEnvVars: string[]; apiKey: boolean | null }>;
  const providerNames: string[] = [];
  let guard = false;
  const judgeEnabled: string[] = [];
  const guardianEnabled: string[] = [];
  const retiredGuards: string[] = [];
  for (const { key, value } of entries) {
    const lowered = key.toLowerCase();
    for (const provider of DECISION_PROVIDERS) {
      const path = provider.section.toLowerCase();
      if (!isAtOrBelow(lowered, path)) {
        continue;
      }
      const section = sections[provider.key];
      section.configured = true;
      const leaf = lowered.slice(path.length + 1);
      if (leaf === 'baseurl') {
        section.baseUrls.push(settingText(value));
      } else if (leaf.startsWith('baseurl:')) {
        // A BaseUrl holding only sub-keys binds to no string: Orkeon cannot read it, so no host.
        if (!section.baseUrls.includes(UNBINDABLE_BASE_URL)) {
          section.baseUrls.push(UNBINDABLE_BASE_URL);
        }
      } else if (leaf === 'model') {
        section.models.push(settingText(value));
      } else if (leaf === 'apikeyenvvar') {
        section.apiKeyEnvVars.push(settingText(value));
      } else if (leaf === 'apikey') {
        section.apiKey = section.apiKey === true || (value !== undefined && value !== null && String(value).length > 0);
      }
    }
    if (lowered === DECISION_PROVIDER_SETTING.toLowerCase()) {
      providerNames.push(settingText(value));
    }
    guard ||= isAtOrBelow(lowered, GUARDIAN_LLM_SECTION.toLowerCase());
    if (lowered === `${GUARDIAN_LLM_SECTION}:Enabled`.toLowerCase()) {
      judgeEnabled.push(settingText(value).toLowerCase());
    }
    if (lowered === GUARDIAN_ENABLED_SETTING.toLowerCase()) {
      guardianEnabled.push(settingText(value).toLowerCase());
    }
    for (const retired of RETIRED_GUARD_SECTIONS) {
      if (isAtOrBelow(lowered, retired.toLowerCase()) && !retiredGuards.includes(retired)) {
        retiredGuards.push(retired);
      }
    }
  }
  return { source: label('Orkeon:Decision'), sections, providerNames, guard, judgeEnabled, guardianEnabled, retiredGuards };
}

/**
 * The layer some entries make: configured when a key below `Llm`, outside `Llm:Profiles`, holds a
 * non-blank value (`"Llm": { "Model": null }` or a section of profiles alone is no default); a
 * profile for every name below `Llm:Profiles`, with or without a value; a base URL only from a
 * non-blank string. The decision settings (`DecisionModelLayer`) are named by `decisionSource`.
 */
export function llmLayer(source: string, entries: readonly ConfigurationEntry[], decisionSource: DecisionSource = source): LlmLayer {
  let configured = false;
  let setsProvider = false;
  const baseUrls: string[] = [];
  const profiles = new Map<string, { id: string; baseUrls: string[] }>();
  const decisionProfiles = new Map<string, { id: string; target: string | null }>();
  for (const { key, value } of entries) {
    const lowered = key.toLowerCase();
    const decisionProfile = DECISION_PROFILE_KEY.exec(lowered);
    if (decisionProfile !== null) {
      const name = decisionProfile[1] as string;
      const entry = decisionProfiles.get(name) ?? { id: key.split(':')[3] as string, target: null };
      decisionProfiles.set(name, entry);
      if (decisionProfile[2] === 'target' && settingText(value).length > 0) {
        entry.target = settingText(value);
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
    decisionModel: decisionLayer(entries, decisionSource),
    decisionProfiles: [...decisionProfiles.values()],
  };
}

/**
 * The decision profiles of the run's layers, highest precedence first: each name once, as the highest
 * layer spells it, with the target of the highest layer that sets one.
 */
export function effectiveDecisionProfiles(layers: readonly LlmLayer[]): DecisionProfileLayer[] {
  const found = new Map<string, { id: string; target: string | null }>();
  for (const layer of layers) {
    for (const profile of layer.decisionProfiles ?? []) {
      const entry = found.get(profile.id.toLowerCase()) ?? { id: profile.id, target: null };
      found.set(profile.id.toLowerCase(), entry);
      entry.target ??= profile.target;
    }
  }
  return [...found.values()];
}

/** Of several base URLs one layer gives a key, the first that is not local: the one .NET keeps is not defined. */
function pickBaseUrl(urls: readonly string[], extraLocalHosts: readonly string[]): string {
  const isLocal = (url: string): boolean => {
    const host = baseUrlHost(url);
    return host !== null && isLocalHost(host, extraLocalHosts);
  };
  return urls.find((url) => !isLocal(url)) ?? (urls[0] as string);
}

/** `Uri.IsLoopback`: `localhost`, an address of 127.0.0.0/8, `::1` — not `host.docker.internal`, not `0.0.0.0`. */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * The names of the variables of `variables` that hold a decision key, each with a non-empty value:
 * the default key variables (`DECISION_KEY_VARIABLES`) and every one a layer names with
 * `<section>:ApiKeyEnvVar`, matched in any case (fail-closed). Names only: the values stay where they are.
 */
export function decisionKeyVariables(layers: readonly LlmLayer[], variables: Readonly<Record<string, string>>): string[] {
  const named = layers.flatMap((layer) => DECISION_PROVIDERS.flatMap((provider) => layer.decisionModel.sections[provider.key].apiKeyEnvVars));
  const candidates = new Set([...DECISION_KEY_VARIABLES, ...named].filter((name) => name.length > 0).map((name) => name.toLowerCase()));
  return Object.entries(variables)
    .filter(([name, value]) => value.length > 0 && candidates.has(name.toLowerCase()))
    .map(([name]) => name);
}

/**
 * The decision model of a run (Orkeon 1.2.0, `DecisionProviderChoice.Resolve`, checked in its sources
 * and, for the guard's sections, on the CLI), over the layers, highest precedence first, and `decisionKeys` — the names of the key
 * variables holding a non-empty value (`decisionKeyVariables`):
 * 1. `Orkeon:Decision:Provider`, from the highest layer holding a non-blank value, names the provider,
 *    in any case; any other name refuses the start;
 * 2. else the provider is deduced from the hosted ones alone (TypeSafe, Liquid): a provider whose
 *    section exists in a layer — even an empty `{}` (R-64) — counts first, then one whose default key
 *    variable is set; two candidates at the same step refuse the start. Kev is never deduced;
 * 3. Kev, named, refuses the start when its base URL is no absolute http or https address, or when a
 *    key is configured and the address is neither https nor loopback;
 * 4. a former section of the LLM judge, `Orkeon:Decision:Guard` or `Orkeon:TypeSafe:Guard`, refuses the
 *    start, with or without a provider;
 * 5. the LLM judge enabled (`Orkeon:Guardian:Llm:Enabled` true in the highest layer holding it, and
 *    `Orkeon:Guardian:Enabled` not false) without an active provider is given as a refusal too: the
 *    decision circuit off, Orkeon 1.4.0 refuses to start under `FailMode: Closed`, the default (`--validate`
 *    included, exit 1), and leaves the judge out under `Open` — which the rule does not read: fail-closed.
 *    The section alone, the judge off, refuses nothing.
 * The provider's base URL, model and key variable are those of the highest layer holding a non-blank
 * value, else its defaults (`DecisionProviderDescriptor.FillBlanks`).
 */
export function effectiveDecisionModel(layers: readonly LlmLayer[], decisionKeys: readonly string[] = [], extraLocalHosts: readonly string[] = []): EffectiveDecisionModel {
  const keysOf = (variable: string): string[] => decisionKeys.filter((name) => name.toLowerCase() === variable.toLowerCase());
  const none: EffectiveDecisionModel = { configured: false, provider: null, how: null, refusal: null, configuredBy: [], baseUrl: null, baseUrlSource: null, model: null, keyVariable: null };
  const refuse = (refusal: string): EffectiveDecisionModel => {
    const holding = layers.flatMap(({ decisionModel: layer }) => [
      ...DECISION_PROVIDERS.filter((provider) => layer.sections[provider.key].configured).map((provider) => layer.sections[provider.key].source),
      ...(layer.providerNames.length > 0 || layer.guard || layer.retiredGuards.length > 0 ? [layer.source] : []),
    ]);
    return { ...none, configured: true, refusal, configuredBy: [...new Set([...holding, ...decisionKeys])] };
  };

  let provider: DecisionProvider | undefined;
  let how: 'named' | 'deduced';
  // The highest layer holding Orkeon:Decision:Provider masks the lower ones; a blank value there means deduce.
  const naming = layers.find((layer) => layer.decisionModel.providerNames.length > 0)?.decisionModel;
  const names = naming?.providerNames.filter((name) => name.length > 0) ?? [];
  if (naming !== undefined && names.length > 0) {
    const unknown = names.find((name) => !DECISION_PROVIDERS.some((candidate) => candidate.key === name.toLowerCase()));
    if (unknown !== undefined) {
      return refuse(`${DECISION_PROVIDER_SETTING} is '${unknown}'; valid names are ${DECISION_PROVIDERS.map((candidate) => candidate.key).join(', ')}.`);
    }
    const keys = [...new Set(names.map((name) => name.toLowerCase()))];
    if (keys.length > 1) {
      return refuse(`${naming.source} gives ${DECISION_PROVIDER_SETTING} several values (${keys.join(', ')}): which one .NET keeps is not defined.`);
    }
    provider = DECISION_PROVIDERS.find((candidate) => candidate.key === keys[0]);
    how = 'named';
  } else {
    const hosted = DECISION_PROVIDERS.filter((candidate) => candidate.hosted);
    const bySection = hosted.filter((candidate) => layers.some((layer) => layer.decisionModel.sections[candidate.key].configured));
    const candidates = bySection.length > 0 ? bySection : hosted.filter((candidate) => keysOf(candidate.apiKeyVariable).length > 0);
    if (candidates.length > 1) {
      return refuse(`Both ${candidates.map((candidate) => candidate.displayName).join(' and ')} are configured for the decision model; name one with ${DECISION_PROVIDER_SETTING}.`);
    }
    provider = candidates[0];
    how = 'deduced';
  }

  const retired = layers.flatMap((layer) => layer.decisionModel.retiredGuards)[0];
  if (retired !== undefined) {
    return refuse(`${retired} is not a setting any more: the LLM judge has its own section, ${GUARDIAN_LLM_SECTION}; move its keys there (FailClosed is now FailMode: Closed or Open).`);
  }
  if (provider === undefined) {
    /** The value of the highest layer holding a switch; `fallback` when none holds it. */
    const switched = (values: (layer: DecisionModelLayer) => readonly string[], fallback: boolean): boolean => {
      const held = layers.map((layer) => values(layer.decisionModel)).find((found) => found.length > 0);
      return held === undefined ? fallback : fallback ? !held.every((value) => value === 'false') : held.includes('true');
    };
    const judging = switched((layer) => layer.judgeEnabled, false) && switched((layer) => layer.guardianEnabled, true);
    return judging
      ? refuse(`${GUARDIAN_LLM_SECTION}:Enabled is true, but no decision provider is active: the decision circuit is off, so Orkeon refuses to start under FailMode Closed (the default) and leaves the judge out under Open (Orkeon 1.4.0).`)
      : none;
  }

  const active = provider;
  const sectionOf = (layer: LlmLayer): DecisionSectionLayer => layer.decisionModel.sections[active.key];
  /** The non-blank values of the highest layer holding the key, and that layer's name: Orkeon fills a blank with the default. */
  const winning = (values: (section: DecisionSectionLayer) => readonly string[]): { values: string[]; source: string | null } => {
    const layer = layers.find((candidate) => values(sectionOf(candidate)).length > 0);
    const kept = layer === undefined ? [] : values(sectionOf(layer)).filter((value) => value.length > 0);
    return { values: kept, source: layer === undefined || kept.length === 0 ? null : sectionOf(layer).source };
  };
  const url = winning((section) => section.baseUrls);
  const baseUrl = url.values.length > 0 ? pickBaseUrl(url.values, extraLocalHosts) : active.baseUrl;
  const model = winning((section) => section.models).values[0] ?? active.model;
  const keyVariable = winning((section) => section.apiKeyEnvVars).values[0] ?? active.apiKeyVariable;
  const keyNames = keysOf(keyVariable);

  if (!active.hosted) {
    let address: URL | null = null;
    try {
      address = new URL(baseUrl);
    } catch {
      // not an absolute address
    }
    if (address === null || (address.protocol !== 'http:' && address.protocol !== 'https:')) {
      return refuse(`${active.section}:BaseUrl '${baseUrl}' is not an absolute http or https address.`);
    }
    const apiKey = layers.map((layer) => sectionOf(layer).apiKey).find((held) => held !== null) ?? false;
    const host = baseUrlHost(baseUrl) ?? '';
    if ((apiKey || keyNames.length > 0) && address.protocol !== 'https:' && !isLoopbackHost(host)) {
      return refuse(`${active.section}:BaseUrl '${baseUrl}' is neither https nor a loopback address: the API key would travel in clear to another machine.`);
    }
  }

  const configuredBy = [
    ...layers.filter((layer) => sectionOf(layer).configured).map((layer) => sectionOf(layer).source),
    ...(how === 'named' && naming !== undefined ? [naming.source] : []),
    ...keyNames,
  ];
  return { configured: true, provider: active.key, how, refusal: null, configuredBy: [...new Set(configuredBy)], baseUrl, baseUrlSource: url.source, model, keyVariable };
}

/**
 * The layers, highest precedence first → what the rule judges: the base URL of the first layer that
 * sets one — of several, the first that is not local, since the one .NET keeps is not defined — and
 * configured when any layer is; then the decision model (`effectiveDecisionModel`, `decisionKeys`).
 */
export function effectiveLlmSettings(layers: readonly LlmLayer[], extraLocalHosts: readonly string[] = [], decisionKeys: readonly string[] = []): EffectiveLlmSettings {
  const pick = (urls: readonly string[]): string => pickBaseUrl(urls, extraLocalHosts);
  const decisionModel = effectiveDecisionModel(layers, decisionKeys, extraLocalHosts);

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
 * Step 3: the folders it walks, from the crew folder up to the root, each with its one candidate,
 * `appsettings/appsettings.json` (Orkeon 1.2.0, `RunnerSettings.FindSettingsByWalkingUp`: the legacy
 * `_shared/appsettings.json` is no longer read since 1.0.0-rc.7). The walk ends at the first candidate
 * that exists, or after the folder holding `EXAMPLES_SOLUTION`.
 */
export function settingsWalk(crewFolder: string): { folder: string; candidates: [string] }[] {
  const steps: { folder: string; candidates: [string] }[] = [];
  for (let folder = normalizePath(crewFolder); ; folder = joinPath(folder, '..')) {
    steps.push({ folder, candidates: [joinPath(folder, 'appsettings', SETTINGS_FILE_NAME)] });
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
