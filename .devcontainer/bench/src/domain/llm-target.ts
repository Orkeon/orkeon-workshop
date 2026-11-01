import { STUB_HOST, type Profile } from './profile.js';

/**
 * Where a team's LLM calls go, and whether that is off the machine. This is the one rule the
 * budget gate relies on — the run-gate hook of the harness mirrors it, so change the two
 * together: a remote target needs an estimate, a cap and an explicit approval before any run
 * (plan § 6.4). The decision model a run may call besides its LLM — TypeSafe, Liquid or Kev — is
 * judged by the same rule (`decisionModelTarget`): a remote one makes the run remote, under the reason `decision-model`.
 */
export interface LlmTarget {
  /** Host of the resolved base URL; null when there is none or it cannot be read. */
  readonly baseUrlHost: string | null;
  readonly remote: boolean;
  readonly reason: LlmTargetReason;
  /**
   * The named profile (`Llm:Profiles:<id>`) this target is that of; absent or null for the default
   * provider, the `Llm` section.
   */
  readonly profile?: string | null;
}

export type LlmTargetReason = 'local-host' | 'remote-host' | 'unreadable-base-url' | 'no-base-url' | 'not-configured' | 'decision-model';

/** The key of a decision provider (`DecisionProviderKeys`, Orkeon `main` at c727c06). */
export type DecisionProviderKey = 'typesafe' | 'liquid' | 'kev';

/** What Orkeon knows of one decision provider (`DecisionProviderDescriptor`, `DecisionProviderDefaults`, c727c06). */
export interface DecisionProvider {
  readonly key: DecisionProviderKey;
  /** The name Orkeon's messages give it. */
  readonly displayName: string;
  /** Its configuration section. */
  readonly section: string;
  /** Its API root when `<section>:BaseUrl` is not set, or blank. */
  readonly baseUrl: string;
  /** Its model when `<section>:Model` is not set, or blank. */
  readonly model: string;
  /** The variable its key is read from when `<section>:ApiKeyEnvVar` is not set, or blank. */
  readonly apiKeyVariable: string;
  /** A hosted service: deduced from its section or its key variable. Kev, run locally, is never deduced. */
  readonly hosted: boolean;
}

/** The decision providers, in the order Orkeon lists them (`DecisionProviderDescriptor.All`). */
export const DECISION_PROVIDERS: readonly DecisionProvider[] = [
  { key: 'typesafe', displayName: 'TypeSafe', section: 'Orkeon:TypeSafe', baseUrl: 'https://api.typesafe.ai/v1', model: 'jev-latest', apiKeyVariable: 'TYPESAFE_API_KEY', hosted: true },
  { key: 'liquid', displayName: 'Liquid', section: 'Orkeon:Liquid', baseUrl: 'https://api.liquid.ai/decisions/v1', model: 'd1.1', apiKeyVariable: 'LIQUID_API_KEY', hosted: true },
  { key: 'kev', displayName: 'Kev', section: 'Orkeon:Kev', baseUrl: 'http://127.0.0.1:8009/v1', model: 'kev-latest', apiKeyVariable: 'KEV_API_KEY', hosted: false },
];

/** The provider of `key`, which `DecisionProviderKey` guarantees exists. */
export function decisionProvider(key: DecisionProviderKey): DecisionProvider {
  return DECISION_PROVIDERS.find((provider) => provider.key === key) as DecisionProvider;
}

/**
 * The decision model of a run, every layer applied (`effectiveDecisionModel`): whether Orkeon
 * registers a decision provider — or refuses to start on its settings —, which one, and the base URL
 * that wins.
 */
export interface DecisionModelSettings {
  /** True when Orkeon registers a decision provider for the run, or refuses the start on its settings. */
  readonly configured: boolean;
  /** The active provider; absent or null: TypeSafe, unless the start is refused. */
  readonly provider?: DecisionProviderKey | null | undefined;
  /** Why Orkeon refuses to start on the decision settings; absent or null when it starts. */
  readonly refusal?: string | null | undefined;
  /**
   * The base URL that wins; `''` when that value cannot be read; null or absent when no layer sets a
   * non-blank one — Orkeon then calls the provider's default (`DECISION_PROVIDERS`).
   */
  readonly baseUrl?: string | null | undefined;
}

/** The LLM settings as Orkeon will see them, every layer applied (`effectiveLlmSettings`). */
export interface LlmSettings {
  readonly baseUrl?: string | null | undefined;
  /**
   * True when one of Orkeon's layers gives the default provider a value (a key of `Llm` besides
   * `Profiles`). Without one it runs its offline echo provider for every agent naming no profile.
   */
  readonly configured?: boolean | undefined;
  /** The named profiles, each a provider of its own, every layer applied. */
  readonly profiles?: readonly { readonly id: string; readonly baseUrl: string | null }[] | undefined;
  /** The decision model the run may call besides its LLM; absent: none. */
  readonly decisionModel?: DecisionModelSettings | undefined;
}

/**
 * Hosts that are the machine itself, or the machine that hosts the container:
 * `host.docker.internal` is where a model served by the host is reached (Ollama in host mode).
 * Every address of 127.0.0.0/8 is local too.
 */
export const LOCAL_HOST_NAMES: readonly string[] = ['localhost', '::1', '0.0.0.0', 'host.docker.internal'];

/** Environment variable listing more local hosts, for a model server on the LAN. */
export const LOCAL_HOSTS_VARIABLE = 'HARNESS_LOCAL_LLM_HOSTS';

const IPV4_127 = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
}

/**
 * The value of `HARNESS_LOCAL_LLM_HOSTS`: host names or IP addresses separated by commas or
 * spaces, case-insensitive. Hosts only — no scheme, no port.
 */
export function parseLocalHosts(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .map(normalizeHost)
    .filter((host) => host.length > 0);
}

/**
 * A host is local when it is `localhost`, `::1`, `0.0.0.0`, `host.docker.internal`, any address
 * of 127.0.0.0/8, or one of `extraLocalHosts` (see `parseLocalHosts`). Anything else is remote.
 */
export function isLocalHost(host: string, extraLocalHosts: readonly string[] = []): boolean {
  const name = normalizeHost(host);
  if (name.length === 0) {
    return false;
  }
  return LOCAL_HOST_NAMES.includes(name) || IPV4_127.test(name) || extraLocalHosts.some((extra) => normalizeHost(extra) === name);
}

/**
 * Host of a base URL as a URL parser reads it (lowercase, without the brackets of an IPv6
 * literal); null when it cannot be read. A value without a scheme (`localhost:11434`) is read
 * as `http://…` — Orkeon refuses such an address at start (since 63be532): no call leaves with it.
 */
export function baseUrlHost(baseUrl: string): string | null {
  const value = baseUrl.trim();
  for (const candidate of [value, `http://${value}`]) {
    try {
      const { hostname } = new URL(candidate);
      if (hostname.length > 0) {
        return normalizeHost(hostname);
      }
    } catch {
      // not a URL as written: try the next reading
    }
  }
  return null;
}

/**
 * The rule for one provider — the default, or a named profile judged as `configured` — in order
 * (D32: checked on Orkeon `main` at 151a762, `LlmProviderFactory`, `LlmSettings`):
 * 1. a base URL decides alone: remote unless its host is local (`isLocalHost`); an unreadable
 *    one is remote (it is not known to be local);
 * 2. without a base URL, an `Llm` section means Orkeon infers the provider from the model name
 *    (`gpt-5.6-sol` when none is set), then from the key, and calls that provider's default
 *    endpoint — OpenAI's when nothing matches: not known to be local, so remote. A model name
 *    routed to Ollama (`llama…`) would stay on the machine; the rule does not try to tell. Orkeon
 *    reads no `Provider` key, so a named provider decides nothing;
 * 3. no `Llm` section in any layer (`orkeon-configuration.ts`): Orkeon runs its offline echo
 *    provider — not remote, no host.
 */
export function llmTarget(settings: LlmSettings, extraLocalHosts: readonly string[] = []): LlmTarget {
  const baseUrl = settings.baseUrl?.trim() ?? '';
  if (baseUrl.length > 0) {
    const host = baseUrlHost(baseUrl);
    if (host === null) {
      return { baseUrlHost: null, remote: true, reason: 'unreadable-base-url' };
    }
    return isLocalHost(host, extraLocalHosts)
      ? { baseUrlHost: host, remote: false, reason: 'local-host' }
      : { baseUrlHost: host, remote: true, reason: 'remote-host' };
  }
  return settings.configured === true
    ? { baseUrlHost: null, remote: true, reason: 'no-base-url' }
    : { baseUrlHost: null, remote: false, reason: 'not-configured' };
}

/**
 * Where the decision model of a run goes (D32: checked on Orkeon `main` at c727c06,
 * `DecisionProviderChoice`, `DecisionProviderDescriptor`, `DecisionProviderServiceCollectionExtensions`);
 * null when the run has none. Orkeon registers the provider `Orkeon:Decision:Provider` names, else the
 * one hosted provider whose section exists or whose key variable is set (`effectiveDecisionModel`).
 * Decision tasks, the `system_one_decide` tool and the input guard (`Orkeon:Decision:Guard`) then call
 * it; `orkeon run --no-decision` switches off the decision tasks alone, so it changes nothing here.
 * It is remote, reason `decision-model`, unless the base URL that wins is on a local host
 * (`isLocalHost`): unset or blank, it is the provider's default — Kev's is local; a value that cannot
 * be read is not known to be local. A local one is `local-host`. Settings Orkeon refuses to start on
 * count as remote too, reason `decision-model`, without a host: fail-closed.
 */
export function decisionModelTarget(model: DecisionModelSettings | undefined, extraLocalHosts: readonly string[] = []): LlmTarget | null {
  if (model?.configured !== true) {
    return null;
  }
  if (model.refusal != null) {
    return { baseUrlHost: null, remote: true, reason: 'decision-model' };
  }
  const baseUrl = model.baseUrl ?? decisionProvider(model.provider ?? 'typesafe').baseUrl;
  const host = baseUrl.trim().length === 0 ? null : baseUrlHost(baseUrl);
  if (host !== null && isLocalHost(host, extraLocalHosts)) {
    return { baseUrlHost: host, remote: false, reason: 'local-host' };
  }
  return { baseUrlHost: host, remote: true, reason: 'decision-model' };
}

/** `target`, unless it is not remote and the decision model is: then the decision model's. */
function withDecisionModel(target: LlmTarget, model: DecisionModelSettings | undefined, extraLocalHosts: readonly string[]): LlmTarget {
  if (target.remote) {
    return target;
  }
  const decision = decisionModelTarget(model, extraLocalHosts);
  return decision?.remote === true ? decision : target;
}

/**
 * Every provider a run may call: the default, then each named profile (`Llm:Profiles:<id>`), which
 * any agent of the crew may name (`llm: { profile: … }`, `.withProfile(…)`, `--llm-profile`, the
 * RAG's `Orkeon:Rag:LlmProfile`). A profile is judged on its own base URL: without one, Orkeon
 * infers its provider from its model — remote.
 */
export function providerTargets(settings: LlmSettings, extraLocalHosts: readonly string[] = []): LlmTarget[] {
  return [
    llmTarget(settings, extraLocalHosts),
    ...(settings.profiles ?? []).map((profile) => ({ ...llmTarget({ baseUrl: profile.baseUrl, configured: true }, extraLocalHosts), profile: profile.id })),
  ];
}

/**
 * The target of a run on the machine's settings: the default's, unless a named profile is remote —
 * then the first remote one, since the crew may name it. Fail-closed: which profiles a crew names is
 * not read (a script may compute the name). When no LLM is remote, the decision model's when it is
 * (`decisionModelTarget`).
 */
export function machineTarget(settings: LlmSettings, extraLocalHosts: readonly string[] = []): LlmTarget {
  const [defaultTarget, ...profiles] = providerTargets(settings, extraLocalHosts) as [LlmTarget, ...LlmTarget[]];
  const target = defaultTarget.remote ? defaultTarget : (profiles.find((candidate) => candidate.remote) ?? defaultTarget);
  return withDecisionModel(target, settings.decisionModel, extraLocalHosts);
}

/**
 * The target of a bench profile: a named profile by its base URL, the stub never remote, the
 * machine profile by the machine's settings (`machineTarget`). The stub and a named profile are
 * injected over the default and over every named profile of the run (`profileVariables`). A named
 * profile injects nothing over the decision model: a local one is judged on the machine's
 * (`machine.decisionModel`), which its run keeps. The stub's run keeps none (`stubRunVariables`,
 * `stubSettings`).
 */
export function profileTarget(profile: Profile, machine: LlmSettings = {}, extraLocalHosts: readonly string[] = []): LlmTarget {
  switch (profile.kind) {
    case 'named':
      return withDecisionModel(llmTarget({ baseUrl: profile.baseUrl }, extraLocalHosts), machine.decisionModel, extraLocalHosts);
    case 'stub':
      return { baseUrlHost: STUB_HOST, remote: false, reason: 'local-host' };
    case 'machine':
      return machineTarget(machine, extraLocalHosts);
  }
}
