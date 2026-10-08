import { STUB_HOST, type Profile } from './profile.js';

/**
 * Where a team's LLM calls go, and whether that is off the machine. This is the one rule the
 * budget gate relies on — the run-gate hook of the harness mirrors it, so change the two
 * together: a remote target needs an estimate, a cap and an explicit approval before any run
 * (plan § 6.4).
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

export type LlmTargetReason = 'local-host' | 'remote-host' | 'unreadable-base-url' | 'no-base-url' | 'not-configured';

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
 * as `http://…`.
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
 * (D32: checked on Orkeon `main` at bd3420c, `LlmProviderFactory`, `LlmSettings`):
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
 * not read (a script may compute the name).
 */
export function machineTarget(settings: LlmSettings, extraLocalHosts: readonly string[] = []): LlmTarget {
  const [defaultTarget, ...profiles] = providerTargets(settings, extraLocalHosts) as [LlmTarget, ...LlmTarget[]];
  return defaultTarget.remote ? defaultTarget : (profiles.find((target) => target.remote) ?? defaultTarget);
}

/**
 * The target of a bench profile: a named profile by its base URL, the stub never remote, the
 * machine profile by the machine's settings (`machineTarget`). The stub and a named profile are
 * injected over the default and over every named profile of the run (`profileVariables`).
 */
export function profileTarget(profile: Profile, machine: LlmSettings = {}, extraLocalHosts: readonly string[] = []): LlmTarget {
  switch (profile.kind) {
    case 'named':
      return llmTarget({ baseUrl: profile.baseUrl }, extraLocalHosts);
    case 'stub':
      return { baseUrlHost: STUB_HOST, remote: false, reason: 'local-host' };
    case 'machine':
      return machineTarget(machine, extraLocalHosts);
  }
}
