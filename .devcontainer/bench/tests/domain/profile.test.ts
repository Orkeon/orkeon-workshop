import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import {
  LLM_VARIABLES,
  MACHINE_PROFILE,
  namedProfile,
  namedProfileSchema,
  profileVariables,
  stubBaseUrl,
  stubProfile,
} from '../../src/domain/profile.js';

const claude = namedProfile('claude', namedProfileSchema.parse({ baseUrl: 'https://api.anthropic.com', model: 'claude-x', keyEnv: 'ANTHROPIC_API_KEY' }));

describe('named profiles', () => {
  it('defaults the timeout to 600 s', () => {
    expect(claude).toMatchObject({ kind: 'named', name: 'claude', timeoutSeconds: 600 });
  });

  it('refuses the reserved names', () => {
    const settings = namedProfileSchema.parse({ baseUrl: 'http://x', model: 'm', keyEnv: 'K' });
    expect(() => namedProfile('machine', settings)).toThrow(DomainError);
    expect(() => namedProfile('stub', settings)).toThrow(DomainError);
  });

  it.each([
    ['a non-URL base', { baseUrl: 'api.anthropic.com', model: 'm', keyEnv: 'K' }],
    ['a lowercase key variable', { baseUrl: 'https://x', model: 'm', keyEnv: 'api_key' }],
    ['an empty model', { baseUrl: 'https://x', model: '', keyEnv: 'K' }],
    ['a zero timeout', { baseUrl: 'https://x', model: 'm', keyEnv: 'K', timeoutSeconds: 0 }],
  ])('rejects %s', (_label, input) => {
    expect(namedProfileSchema.safeParse(input).success).toBe(false);
  });
});

describe('stub profile', () => {
  it('is reached at http://127.0.0.1:<port>/v1 with a neutral model and a non-empty key', () => {
    expect(stubProfile(8123)).toEqual({ kind: 'stub', name: 'stub', baseUrl: 'http://127.0.0.1:8123/v1', model: 'stub-model', apiKey: 'stub' });
  });

  it('has no base URL until the stub server has a port', () => {
    expect(stubProfile().baseUrl).toBeNull();
  });

  it('refuses port 11434 (Orkeon would infer Ollama) and invalid ports', () => {
    expect(() => stubBaseUrl(11434)).toThrow(/Ollama/);
    expect(() => stubProfile(0)).toThrow(DomainError);
    expect(() => stubProfile(70_000)).toThrow(DomainError);
    expect(() => stubProfile(80.5)).toThrow(DomainError);
  });
});

describe('profileVariables', () => {
  it('injects nothing for the machine profile', () => {
    expect(profileVariables(MACHINE_PROFILE)).toEqual({ variables: {}, secretNames: [], runtimeNames: [], keyEnv: null, keyPresent: true });
  });

  it('points the stub profile at the running stub server', () => {
    expect(profileVariables(stubProfile(8123))).toEqual({
      variables: { ORKEON_Llm__Model: 'stub-model', ORKEON_Llm__ApiKey: 'stub', ORKEON_Llm__ApiKeyEnvVar: '', ORKEON_Llm__BaseUrl: 'http://127.0.0.1:8123/v1' },
      secretNames: [],
      runtimeNames: [],
      keyEnv: null,
      keyPresent: true,
    });
  });

  it('leaves the stub base URL to run time while no port is known', () => {
    const result = profileVariables(stubProfile());
    expect(result.variables).toEqual({ ORKEON_Llm__Model: 'stub-model', ORKEON_Llm__ApiKey: 'stub', ORKEON_Llm__ApiKeyEnvVar: '' });
    expect(result.runtimeNames).toEqual([LLM_VARIABLES.baseUrl]);
  });

  it('maps a named profile to ORKEON_Llm__* and takes the key it is given', () => {
    const result = profileVariables(claude, { apiKey: 'sk-secret' });
    expect(result.variables).toEqual({
      ORKEON_Llm__BaseUrl: 'https://api.anthropic.com',
      ORKEON_Llm__Model: 'claude-x',
      ORKEON_Llm__TimeoutSeconds: '600',
      ORKEON_Llm__ApiKeyEnvVar: '',
      ORKEON_Llm__ApiKey: 'sk-secret',
    });
    expect(result.secretNames).toEqual(['ORKEON_Llm__ApiKey']);
    expect(result.keyEnv).toBe('ANTHROPIC_API_KEY');
    expect(result.keyPresent).toBe(true);
  });

  it('points the stub and a named profile at every named profile of the run too, with no key reference', () => {
    const stub = profileVariables(stubProfile(8123), {}, ['claude']);
    expect(stub.variables).toMatchObject({
      ORKEON_Llm__Profiles__claude__BaseUrl: 'http://127.0.0.1:8123/v1',
      ORKEON_Llm__Profiles__claude__Model: 'stub-model',
      ORKEON_Llm__Profiles__claude__ApiKey: 'stub',
      ORKEON_Llm__Profiles__claude__ApiKeyEnvVar: '',
    });
    expect(profileVariables(stubProfile(), {}, ['claude']).runtimeNames).toEqual(['ORKEON_Llm__BaseUrl', 'ORKEON_Llm__Profiles__claude__BaseUrl']);
    const named = profileVariables(claude, { apiKey: 'sk-secret' }, ['claude', 'ds']);
    expect(named.variables).toMatchObject({ ORKEON_Llm__Profiles__ds__BaseUrl: 'https://api.anthropic.com', ORKEON_Llm__Profiles__ds__ApiKey: 'sk-secret' });
    expect(named.secretNames).toEqual(['ORKEON_Llm__ApiKey', 'ORKEON_Llm__Profiles__claude__ApiKey', 'ORKEON_Llm__Profiles__ds__ApiKey']);
  });

  it('omits the key variable when the environment does not carry it', () => {
    const result = profileVariables(claude, {});
    expect(result.keyPresent).toBe(false);
    expect(result.variables).not.toHaveProperty(LLM_VARIABLES.apiKey);
    expect(profileVariables(claude, { apiKey: '' }).keyPresent).toBe(false);
  });
});
