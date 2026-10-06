import { z } from 'zod';

import { DomainError } from './errors.js';

export const MACHINE_PROFILE_NAME = 'machine';
export const STUB_PROFILE_NAME = 'stub';
export const DEFAULT_TIMEOUT_SECONDS = 600;

/**
 * Orkeon configuration keys as environment variables (plan § 6.4, D2). Frozen literals: Orkeon
 * reads `ORKEON_<Section>__<Key>`. The bench injects base URL, model, key and timeout for a
 * named profile. There is no provider key: Orkeon infers the provider (D32). `ApiKeyEnvVar` is
 * injected blank, which Orkeon reads as absent: the key a settings file points to never reaches
 * the injected endpoint.
 */
export const LLM_VARIABLES = {
  baseUrl: 'ORKEON_Llm__BaseUrl',
  model: 'ORKEON_Llm__Model',
  apiKey: 'ORKEON_Llm__ApiKey',
  apiKeyEnvVar: 'ORKEON_Llm__ApiKeyEnvVar',
  timeoutSeconds: 'ORKEON_Llm__TimeoutSeconds',
} as const;

/**
 * The same keys for the named profile `id` of Orkeon's settings (`Llm:Profiles:<id>`): the stub and
 * a named bench profile are injected over every profile of the run too, since any agent of the crew
 * may name one (D32, fb26364).
 */
export function profileLlmVariables(id: string): { readonly [K in keyof typeof LLM_VARIABLES]: string } {
  const prefix = `ORKEON_Llm__Profiles__${id}__`;
  return { baseUrl: `${prefix}BaseUrl`, model: `${prefix}Model`, apiKey: `${prefix}ApiKey`, apiKeyEnvVar: `${prefix}ApiKeyEnvVar`, timeoutSeconds: `${prefix}TimeoutSeconds` };
}

/**
 * The simulated LLM (plan § 6.3, verified on rc.4): Orkeon picks its `openai` provider for
 * `http://127.0.0.1:<port>/v1` with a neutral model name and a non-empty key. `localhost` or
 * port 11434 would make it infer Ollama, so the stub never listens there. The port is chosen
 * when the stub server starts.
 */
export const STUB_HOST = '127.0.0.1';
export const STUB_MODEL = 'stub-model';
export const STUB_API_KEY = 'stub';
export const OLLAMA_PORT = 11434;

export function stubBaseUrl(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DomainError(`invalid stub port ${String(port)} (expected an integer between 1 and 65535)`);
  }
  if (port === OLLAMA_PORT) {
    throw new DomainError(`the stub cannot listen on port ${OLLAMA_PORT}: Orkeon would infer the Ollama provider`);
  }
  return `http://${STUB_HOST}:${port}/v1`;
}

/** `"machine": { "source": "orkeon-settings" }` — the LLM settings of the machine, nothing injected. */
export const machineProfileSchema = z.object({ source: z.literal('orkeon-settings') });

/** A named profile: the key is never stored, only the name of the variable that carries it. */
export const namedProfileSchema = z.object({
  baseUrl: z.url(),
  model: z.string().min(1),
  keyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'expected an environment variable name'),
  timeoutSeconds: z.int().positive().default(DEFAULT_TIMEOUT_SECONDS),
});
export type NamedProfileSettings = z.infer<typeof namedProfileSchema>;

export interface MachineProfile {
  readonly kind: 'machine';
  readonly name: typeof MACHINE_PROFILE_NAME;
}

export interface StubProfile {
  readonly kind: 'stub';
  readonly name: typeof STUB_PROFILE_NAME;
  /** Null until the stub server has a port. */
  readonly baseUrl: string | null;
  readonly model: string;
  /** A fake, non-empty key: not a secret. */
  readonly apiKey: string;
}

export type NamedProfile = { readonly kind: 'named'; readonly name: string } & NamedProfileSettings;

export type Profile = MachineProfile | StubProfile | NamedProfile;

export const MACHINE_PROFILE: MachineProfile = Object.freeze({ kind: 'machine', name: MACHINE_PROFILE_NAME });

/** The stub profile; pass the port once the stub server listens. */
export function stubProfile(port?: number): StubProfile {
  return Object.freeze({
    kind: 'stub',
    name: STUB_PROFILE_NAME,
    baseUrl: port === undefined ? null : stubBaseUrl(port),
    model: STUB_MODEL,
    apiKey: STUB_API_KEY,
  });
}

export function namedProfile(name: string, settings: NamedProfileSettings): NamedProfile {
  if (name === MACHINE_PROFILE_NAME || name === STUB_PROFILE_NAME) {
    throw new DomainError(`"${name}" is a reserved profile name`);
  }
  return Object.freeze({ kind: 'named', name, ...settings });
}

/** What the bench exports before launching a team with a profile. */
export interface ProfileVariables {
  /** Variable name to value; includes the key value when the profile has one. Never persist. */
  readonly variables: Readonly<Record<string, string>>;
  /** Names of the variables whose value is a secret (to redact in any output). */
  readonly secretNames: readonly string[];
  /** Names of the variables whose value is only known at run time (the stub base URL). */
  readonly runtimeNames: readonly string[];
  /** For a named profile, the environment variable the key is read from. */
  readonly keyEnv: string | null;
  /** False when a named profile's key variable was not set. */
  readonly keyPresent: boolean;
}

export interface ProfileSecrets {
  /** Value of the variable named by `keyEnv`, when set. */
  readonly apiKey?: string | undefined;
}

/**
 * The variables a profile injects: nothing for the machine profile; for the stub and a named
 * profile, the default provider and every named profile of the run (`profileIds`, from its layers)
 * pointed at the same endpoint.
 */
export function profileVariables(profile: Profile, secrets: ProfileSecrets = {}, profileIds: readonly string[] = []): ProfileVariables {
  const targets = [LLM_VARIABLES, ...profileIds.map(profileLlmVariables)];
  switch (profile.kind) {
    case 'machine':
      return Object.freeze({ variables: {}, secretNames: [], runtimeNames: [], keyEnv: null, keyPresent: true });
    case 'stub': {
      const variables: Record<string, string> = {};
      const runtimeNames: string[] = [];
      for (const names of targets) {
        variables[names.model] = profile.model;
        variables[names.apiKey] = profile.apiKey;
        variables[names.apiKeyEnvVar] = '';
        if (profile.baseUrl !== null) {
          variables[names.baseUrl] = profile.baseUrl;
        } else {
          runtimeNames.push(names.baseUrl);
        }
      }
      return Object.freeze({ variables, secretNames: [], runtimeNames, keyEnv: null, keyPresent: true });
    }
    case 'named': {
      const variables: Record<string, string> = {};
      const keyPresent = secrets.apiKey !== undefined && secrets.apiKey.length > 0;
      for (const names of targets) {
        variables[names.baseUrl] = profile.baseUrl;
        variables[names.model] = profile.model;
        variables[names.timeoutSeconds] = String(profile.timeoutSeconds);
        variables[names.apiKeyEnvVar] = '';
        if (keyPresent) {
          variables[names.apiKey] = secrets.apiKey as string;
        }
      }
      return Object.freeze({ variables, secretNames: targets.map((names) => names.apiKey), runtimeNames: [], keyEnv: profile.keyEnv, keyPresent });
    }
  }
}
