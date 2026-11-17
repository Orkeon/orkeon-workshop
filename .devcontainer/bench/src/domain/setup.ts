import { DomainError } from './errors.js';

/**
 * The two ways a workshop gets its model keys (D108, D109).
 *
 * - `subscription`: no model key on disk. Claude Code is signed in with a Claude plan, the teams run
 *   on the local model (Ollama). Orkeon cannot use the plan itself: its Anthropic provider sends an
 *   API key and nothing else.
 * - `keys`: the keys live in the `env` block of `.claude/settings.local.json`, which Claude Code gives
 *   to every command and MCP server it starts (V-59) — so `orkeon`, `orkeon-code` and `orkeon mcp
 *   serve` read them with no file of their own. Orkeon's settings name the variable
 *   (`Llm:ApiKeyEnvVar`), never the value.
 *
 * Everything here is pure: the settings come in as parsed JSON and go out the same way.
 */
export type SetupMode = 'subscription' | 'keys';

/** A model provider `setup keys` knows: where Orkeon calls it and the variable that holds its key. */
export interface SetupProvider {
  readonly id: string;
  readonly baseUrl: string;
  readonly keyVariable: string;
}

/**
 * Orkeon's own endpoints and conventional key variables (`LlmProviderEndpoints`,
 * `ModelProviderCatalog`, Orkeon 1.2.0). Orkeon reads no `Provider` key: the base URL decides.
 */
export const SETUP_PROVIDERS: readonly SetupProvider[] = [
  { id: 'anthropic', baseUrl: 'https://api.anthropic.com', keyVariable: 'ANTHROPIC_API_KEY' },
  { id: 'openai', baseUrl: 'https://api.openai.com/v1', keyVariable: 'OPENAI_API_KEY' },
  { id: 'mistral', baseUrl: 'https://api.mistral.ai/v1', keyVariable: 'MISTRAL_API_KEY' },
  { id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyVariable: 'GEMINI_API_KEY' },
  { id: 'deepseek', baseUrl: 'https://api.deepseek.com', keyVariable: 'DEEPSEEK_API_KEY' },
  { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', keyVariable: 'OPENROUTER_API_KEY' },
  { id: 'grok', baseUrl: 'https://api.x.ai/v1', keyVariable: 'XAI_API_KEY' },
  { id: 'together', baseUrl: 'https://api.together.xyz/v1', keyVariable: 'TOGETHER_API_KEY' },
];

/** The variable Claude Code itself reads: set, Claude Code bills the API account instead of the plan. */
export const CLAUDE_KEY_VARIABLE = 'ANTHROPIC_API_KEY';

/** The Anthropic key of the teams when Claude Code stays on the plan: a name Claude Code does not read. */
export const WORKSHOP_ANTHROPIC_KEY_VARIABLE = 'WORKSHOP_ANTHROPIC_API_KEY';

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type JsonObject = Record<string, unknown>;

/** What `setup` remembers between two calls: `.claude/local/setup.json`. */
export interface SetupState {
  /** The variables `setup keys` wrote into the `env` block: what `setup subscription` removes, and nothing else. */
  readonly keys: readonly string[];
  /** The `Llm` section of Orkeon's settings before the first `setup keys`; null when there was none. */
  readonly previousLlm: JsonObject | null;
  /**
   * The `RateLimiting` section of Orkeon's settings before the first `setup keys`, saved with
   * `previousLlm`: the local model takes one request at a time (`MaxConcurrentRequests: 1`, written by
   * the image), a hosted provider does not, so `setup keys` lifts that bound and `setup subscription`
   * gives the section back. Null when there was none.
   */
  readonly previousRateLimiting: JsonObject | null;
  /** True once `previousLlm` and `previousRateLimiting` hold what to give back. */
  readonly saved: boolean;
  /**
   * What `setup keys` chose for the teams — `Model`, `BaseUrl`, `ApiKeyEnvVar` — kept in the workshop:
   * Orkeon's settings live in the home of the container, which a new container starts without, while
   * the key stays in the workshop's folder. `setup apply` writes it back (`reapplyKeys`). Null: none.
   */
  readonly llm: JsonObject | null;
}

export const EMPTY_SETUP_STATE: SetupState = Object.freeze({ keys: [], previousLlm: null, previousRateLimiting: null, saved: false, llm: null });

/** The keys of `RateLimiting` that bound a local model to one request at a time (`init-orkeon.sh`). */
const LOCAL_RATE_KEYS = ['MaxConcurrentRequests', 'QueueLimit'] as const;

/** The three keys of the `Llm` section `setup keys` owns. */
const OWNED_LLM_KEYS = ['Model', 'BaseUrl', 'ApiKeyEnvVar'] as const;

export interface KeysRequest {
  /** One of `SETUP_PROVIDERS`, or `custom` with `baseUrl` and `keyVariable`. */
  readonly provider: string;
  readonly model: string;
  /** The key itself. Never printed, never returned in a message. */
  readonly keyValue: string;
  readonly baseUrl?: string | undefined;
  readonly keyVariable?: string | undefined;
  /** Anthropic only: Claude Code takes the key too, and bills the API account. */
  readonly claudeOnKey?: boolean | undefined;
}

export interface SetupFiles {
  /** `.claude/settings.local.json`, parsed; `{}` when the file does not exist. */
  readonly local: JsonObject;
  /** Orkeon's user settings, parsed; `{}` when the file does not exist. */
  readonly orkeon: JsonObject;
  readonly state: SetupState;
}

export interface SetupChange extends SetupFiles {
  /** What changed, one line each, without any key value. */
  readonly lines: readonly string[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function section(parent: JsonObject, name: string): JsonObject {
  const value = parent[name];
  return isObject(value) ? { ...value } : {};
}

/** The `env` block of `.claude/settings.local.json`; one that is not an object is refused, never replaced. */
function envBlock(local: JsonObject): JsonObject {
  if ('env' in local && !isObject(local['env'])) {
    throw new DomainError('the env block of .claude/settings.local.json is not an object: nothing written');
  }
  return section(local, 'env');
}

/** Reads `.claude/local/setup.json`; anything that is not a state is the empty one. */
export function parseSetupState(value: unknown): SetupState {
  if (!isObject(value)) {
    return EMPTY_SETUP_STATE;
  }
  const keys = Array.isArray(value['keys']) ? value['keys'].filter((key): key is string => typeof key === 'string' && VARIABLE_NAME.test(key)) : [];
  const previousLlm = isObject(value['previousLlm']) ? value['previousLlm'] : null;
  const llm = isObject(value['llm']) && OWNED_LLM_KEYS.every((key) => typeof (value['llm'] as JsonObject)[key] === 'string') ? value['llm'] : null;
  const previousRateLimiting = isObject(value['previousRateLimiting']) ? value['previousRateLimiting'] : null;
  return { keys, previousLlm, previousRateLimiting, saved: value['saved'] === true, llm };
}

/** The variable `setup keys` writes for a request, checked. */
export function keyVariableFor(request: KeysRequest): string {
  const provider = SETUP_PROVIDERS.find((candidate) => candidate.id === request.provider);
  if (provider === undefined && request.provider !== 'custom') {
    throw new DomainError(`unknown provider '${request.provider}'`, [`known: ${SETUP_PROVIDERS.map((candidate) => candidate.id).join(', ')}, custom`]);
  }
  if (request.claudeOnKey === true && request.provider !== 'anthropic') {
    throw new DomainError('--claude-on-key applies to the anthropic provider only');
  }
  let variable = request.keyVariable?.trim() ?? '';
  if (variable.length === 0) {
    if (provider === undefined) {
      throw new DomainError('the custom provider needs --key-variable');
    }
    variable = provider.id === 'anthropic' && request.claudeOnKey !== true ? WORKSHOP_ANTHROPIC_KEY_VARIABLE : provider.keyVariable;
  }
  if (!VARIABLE_NAME.test(variable)) {
    throw new DomainError(`'${variable}' is not a variable name`);
  }
  if (/^ORKEON_/i.test(variable)) {
    throw new DomainError(`'${variable}' starts with ORKEON_: Orkeon loads every such variable into its configuration and its secret chain, where the tools of a crew can read it`);
  }
  if (variable === CLAUDE_KEY_VARIABLE && request.claudeOnKey !== true) {
    throw new DomainError(`${CLAUDE_KEY_VARIABLE} is the variable Claude Code reads: set there, Claude Code bills the API account instead of the plan`, ['pass --claude-on-key to mean it']);
  }
  return variable;
}

/** `setup keys`: the key into the `env` block, its name into Orkeon's `Llm` section. */
export function applyKeys(files: SetupFiles, request: KeysRequest): SetupChange {
  const variable = keyVariableFor(request);
  const provider = SETUP_PROVIDERS.find((candidate) => candidate.id === request.provider);
  const baseUrl = (request.baseUrl?.trim() ?? '') || provider?.baseUrl || '';
  const model = request.model.trim();
  if (baseUrl.length === 0) {
    throw new DomainError('the custom provider needs --base-url');
  }
  if (model.length === 0) {
    throw new DomainError('a model is required');
  }
  if (request.keyValue.trim().length === 0) {
    throw new DomainError('the key is empty: nothing written');
  }

  const env = envBlock(files.local);
  // A key setup wrote for Claude Code earlier (`--claude-on-key`) goes when this call does not ask for
  // it again: Claude Code would keep billing the API account while the line below says the plan.
  const owned = new Set(files.state.keys);
  if (variable !== CLAUDE_KEY_VARIABLE && owned.has(CLAUDE_KEY_VARIABLE)) {
    delete env[CLAUDE_KEY_VARIABLE];
    owned.delete(CLAUDE_KEY_VARIABLE);
  }
  env[variable] = request.keyValue.trim();
  const previous = isObject(files.orkeon['Llm']) ? files.orkeon['Llm'] : null;
  const llm = section(files.orkeon, 'Llm');
  delete llm['ApiKey'];
  llm['Model'] = model;
  llm['BaseUrl'] = baseUrl;
  llm['ApiKeyEnvVar'] = variable;

  const state: SetupState = {
    keys: [...owned.add(variable)].sort(),
    previousLlm: files.state.saved ? files.state.previousLlm : previous,
    previousRateLimiting: files.state.saved ? files.state.previousRateLimiting : rateLimitingOf(files.orkeon),
    saved: true,
    llm: { Model: model, BaseUrl: baseUrl, ApiKeyEnvVar: variable },
  };
  const lines = [
    `mode keys: ${variable} written to the env block of .claude/settings.local.json (the value is not shown)`,
    `Orkeon: Llm.Model=${model}, Llm.BaseUrl=${baseUrl}, Llm.ApiKeyEnvVar=${variable}${isObject(files.orkeon['RateLimiting']) && LOCAL_RATE_KEYS.some((key) => key in (files.orkeon['RateLimiting'] as JsonObject)) ? '; the one-request-at-a-time bound of the local model is lifted' : ''}`,
    CLAUDE_KEY_VARIABLE in env
      ? `Claude Code: ${CLAUDE_KEY_VARIABLE} is in the env block — it bills the API account, not the plan`
      : 'Claude Code: stays on its sign-in (the plan); this key is the teams\' alone',
    'restart Claude Code: a session reads the env block when it starts',
  ];
  return { local: { ...files.local, env }, orkeon: withoutLocalRate({ ...files.orkeon, Llm: llm }), state, lines };
}

/** `setup subscription`: the keys `setup keys` wrote go, and Orkeon gets back the `Llm` section it had. */
export function applySubscription(files: SetupFiles): SetupChange {
  const env = envBlock(files.local);
  const removed = files.state.keys.filter((key) => key in env);
  for (const key of removed) {
    delete env[key];
  }
  const local: JsonObject = { ...files.local };
  if (Object.keys(env).length > 0) {
    local['env'] = env;
  } else {
    delete local['env'];
  }

  const orkeon: JsonObject = { ...files.orkeon };
  const lines = [removed.length > 0 ? `mode subscription: removed ${removed.join(', ')} from the env block of .claude/settings.local.json` : 'mode subscription: no key of setup in .claude/settings.local.json'];
  if (files.state.saved) {
    if (files.state.previousLlm === null) {
      delete orkeon['Llm'];
      lines.push('Orkeon: the Llm section is removed (there was none before setup keys) — orkeon init --provider ollama --model <model> writes one');
    } else {
      orkeon['Llm'] = files.state.previousLlm;
      lines.push(`Orkeon: the Llm section is back to what it was (${describeLlm(files.state.previousLlm)})`);
    }
    if (files.state.previousRateLimiting === null) {
      delete orkeon['RateLimiting'];
    } else {
      orkeon['RateLimiting'] = files.state.previousRateLimiting;
    }
  }
  if (removed.length > 0) {
    lines.push('restart Claude Code: a session reads the env block when it starts');
  }
  return { local, orkeon, state: EMPTY_SETUP_STATE, lines };
}

/**
 * `setup apply`, at the start of a container: a workshop in mode keys whose Orkeon settings no
 * longer name what `setup keys` chose — a new container wrote its own, for the local model — gets
 * that choice back, over what the settings hold now, which becomes what `setup subscription` gives
 * back. Null when there is nothing to do.
 */
export function reapplyKeys(files: SetupFiles): SetupChange | null {
  const chosen = files.state.llm;
  const env = envBlock(files.local);
  if (chosen === null || !files.state.keys.some((key) => key in env)) {
    return null;
  }
  const current = isObject(files.orkeon['Llm']) ? files.orkeon['Llm'] : null;
  if (current !== null && OWNED_LLM_KEYS.every((key) => current[key] === chosen[key])) {
    return null;
  }
  const llm = section(files.orkeon, 'Llm');
  delete llm['ApiKey'];
  for (const key of OWNED_LLM_KEYS) {
    llm[key] = chosen[key];
  }
  return {
    local: files.local,
    orkeon: withoutLocalRate({ ...files.orkeon, Llm: llm }),
    // What the settings hold now is what `subscription` gives back — unless it is setup's own
    // section, edited by hand since: then what was saved before it stays.
    state: ownsSection(current, files.state) ? files.state : { ...files.state, previousLlm: current, previousRateLimiting: rateLimitingOf(files.orkeon), saved: true },
    lines: [`mode keys: Orkeon's settings put back on what setup keys chose (${describeLlm(chosen)}, key variable ${String(chosen['ApiKeyEnvVar'])})`],
  };
}

function rateLimitingOf(orkeon: JsonObject): JsonObject | null {
  return isObject(orkeon['RateLimiting']) ? orkeon['RateLimiting'] : null;
}

/** Orkeon's settings without the one-request-at-a-time bound of the local model; the rest of `RateLimiting` stays. */
function withoutLocalRate(orkeon: JsonObject): JsonObject {
  if (!isObject(orkeon['RateLimiting'])) {
    return orkeon;
  }
  const rate = { ...orkeon['RateLimiting'] };
  for (const key of LOCAL_RATE_KEYS) {
    delete rate[key];
  }
  const result: JsonObject = { ...orkeon };
  if (Object.keys(rate).length > 0) {
    result['RateLimiting'] = rate;
  } else {
    delete result['RateLimiting'];
  }
  return result;
}

/** True when an `Llm` section names a key variable setup wrote: it is setup's, not the user's earlier one. */
function ownsSection(llm: JsonObject | null, state: SetupState): boolean {
  const variable = llm === null ? null : llm['ApiKeyEnvVar'];
  return state.saved && typeof variable === 'string' && state.keys.includes(variable);
}

function describeLlm(llm: JsonObject): string {
  const model = typeof llm['Model'] === 'string' ? llm['Model'] : '?';
  const baseUrl = typeof llm['BaseUrl'] === 'string' ? llm['BaseUrl'] : 'no base URL';
  return `${model} at ${baseUrl}`;
}

export interface SetupStatus {
  readonly mode: SetupMode;
  /** The variables of setup present in the `env` block; names only. */
  readonly keys: readonly string[];
  /** True when the `env` block gives Claude Code an API key. */
  readonly claudeOnKey: boolean;
  readonly model: string | null;
  readonly baseUrl: string | null;
  /** The variable Orkeon's settings name for the key; null when none. */
  readonly keyVariable: string | null;
  /** True when that variable is neither in the `env` block nor in the environment of this command. */
  readonly keyMissing: boolean;
}

/** Where things stand; `environmentHas` tells whether a variable is set for this command. */
export function setupStatus(files: SetupFiles, environmentHas: (name: string) => boolean): SetupStatus {
  const env = section(files.local, 'env');
  const keys = files.state.keys.filter((key) => key in env);
  const llm = section(files.orkeon, 'Llm');
  const text = (name: string): string | null => (typeof llm[name] === 'string' && llm[name].trim().length > 0 ? llm[name] : null);
  const keyVariable = text('ApiKeyEnvVar');
  return {
    mode: keys.length > 0 ? 'keys' : 'subscription',
    keys,
    claudeOnKey: CLAUDE_KEY_VARIABLE in env,
    model: text('Model'),
    baseUrl: text('BaseUrl'),
    keyVariable,
    keyMissing: keyVariable !== null && !(keyVariable in env) && !environmentHas(keyVariable),
  };
}
