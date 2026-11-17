import { describe, expect, it } from 'vitest';

import { DECISION_PROVIDER_VARIABLE, DEFAULT_BENCH_CONFIG, decisionOf, decisionVariables, parseBenchConfig, priceOf, profileNamed, profileNames, usdOf } from '../../src/domain/bench-config.js';
import { DomainError } from '../../src/domain/errors.js';
import { fixture } from '../fakes/fixture-team.js';

const demo = (): unknown => JSON.parse(fixture('workshop/tests/demo/bench.config.json'));

describe('parseBenchConfig', () => {
  it('parses the plan example', () => {
    const config = parseBenchConfig(demo());
    expect(config.levels.e2e_local).toEqual({ profile: 'machine', repeat: 3, pass_at: 2 });
    expect(config.levels.e2e_remote).toEqual({ profile: 'claude', repeat: 1 });
    expect(config.budget).toEqual({ local_minutes_max: 60, remote_usd_max: 2 });
    expect(config.retention).toEqual({ runs_keep: 10 });
    expect(profileNames(config)).toEqual(['machine', 'claude', 'stub']);
  });

  it('provides defaults for an empty configuration (D2: 2 USD cap, 10 runs kept)', () => {
    expect(DEFAULT_BENCH_CONFIG).toEqual({
      profiles: {},
      levels: {},
      budget: { local_minutes_max: 60, remote_usd_max: 2 },
      retention: { runs_keep: 10 },
    });
    expect(parseBenchConfig({ budget: { remote_usd_max: 5 } }).budget).toEqual({ local_minutes_max: 60, remote_usd_max: 5 });
  });

  it('rejects a level that names an unknown profile', () => {
    expect(() => parseBenchConfig({ levels: { e2e_remote: { profile: 'gpt' } } })).toThrow(/unknown profile "gpt"/);
  });

  it('accepts the implicit stub profile on a level', () => {
    expect(parseBenchConfig({ levels: { component: { profile: 'stub' } } }).levels.component).toEqual({ profile: 'stub', repeat: 1 });
  });

  it('rejects pass_at above repeat and an unknown level', () => {
    expect(() => parseBenchConfig({ levels: { e2e_local: { profile: 'machine', repeat: 2, pass_at: 3 } } })).toThrow(/pass_at/);
    expect(() => parseBenchConfig({ levels: { smoke: { profile: 'machine' } } })).toThrow(DomainError);
  });

  it('rejects a declared stub profile and a machine profile that is not orkeon-settings', () => {
    expect(() => parseBenchConfig({ profiles: { stub: { source: 'orkeon-settings' } } })).toThrow(/implicit/);
    expect(() => parseBenchConfig({ profiles: { machine: { baseUrl: 'https://x', model: 'm', keyEnv: 'K' } } })).toThrow(/orkeon-settings/);
  });

  it('rejects a named profile that stores a key instead of a key variable name', () => {
    expect(() => parseBenchConfig({ profiles: { claude: { baseUrl: 'https://x', model: 'm', apiKey: 'sk-1' } } })).toThrow(DomainError);
  });
});

describe('profileNamed', () => {
  const config = parseBenchConfig(demo());

  it('always knows machine and stub', () => {
    expect(profileNamed(config, 'machine')).toEqual({ kind: 'machine', name: 'machine' });
    expect(profileNamed(DEFAULT_BENCH_CONFIG, 'stub')).toMatchObject({ kind: 'stub', name: 'stub', baseUrl: null, model: 'stub-model' });
  });

  it('gives the stub its base URL once the port is known', () => {
    expect(profileNamed(DEFAULT_BENCH_CONFIG, 'stub', 8123)).toMatchObject({ baseUrl: 'http://127.0.0.1:8123/v1' });
  });

  it('returns a declared named profile', () => {
    expect(profileNamed(config, 'claude')).toMatchObject({ kind: 'named', name: 'claude', keyEnv: 'ANTHROPIC_API_KEY', timeoutSeconds: 600 });
  });

  it('lists the known names when the profile is unknown', () => {
    expect(() => profileNamed(config, 'gpt')).toThrow(/unknown profile "gpt" \(known: machine, claude, stub\)/);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])('does not take the inherited member "%s" for a profile', (name) => {
    expect(() => profileNamed(config, name)).toThrow(`unknown profile "${name}"`);
    expect(() => parseBenchConfig({ levels: { e2e_local: { profile: name } } })).toThrow(`unknown profile "${name}"`);
  });
});

describe('the price of a profile', () => {
  const priced = (): unknown => {
    const config = demo() as { profiles: Record<string, Record<string, unknown>> };
    config.profiles.claude = { ...config.profiles.claude, price: { input_per_million: 3, output_per_million: 15 } };
    return config;
  };

  it('is read from the profile, in USD per million tokens, and kept out of the profile the run gets', () => {
    const config = parseBenchConfig(priced());
    expect(priceOf(config, 'claude')).toEqual({ input_per_million: 3, output_per_million: 15 });
    expect(profileNamed(config, 'claude')).not.toHaveProperty('price');
  });

  it('is null for machine, stub, an unknown profile and a profile without one', () => {
    const config = parseBenchConfig(demo());
    for (const name of ['machine', 'stub', 'gpt', 'claude', 'toString']) {
      expect(priceOf(config, name), name).toBeNull();
    }
  });

  it('is refused when negative or incomplete', () => {
    const config = demo() as { profiles: Record<string, Record<string, unknown>> };
    config.profiles.claude = { ...config.profiles.claude, price: { input_per_million: -1 } };
    expect(() => parseBenchConfig(config)).toThrow(/^invalid bench.config.json: profiles\.claude: /);
    config.profiles.claude = { ...config.profiles.claude, price: { input_per_million: 1, output_per_million: 2, currency: 'EUR' } };
    expect(priceOf(parseBenchConfig(config), 'claude')).toEqual({ input_per_million: 1, output_per_million: 2 });
  });

  it('prices the tokens of a run', () => {
    expect(usdOf(1_000_000, 0, { input_per_million: 3, output_per_million: 15 })).toBe(3);
    expect(usdOf(200_000, 10_000, { input_per_million: 3, output_per_million: 15 })).toBeCloseTo(0.75, 10);
    expect(usdOf(0, 0, { input_per_million: 3, output_per_million: 15 })).toBe(0);
  });
});

describe('decision block (D96)', () => {
  const withDecision = (decision: unknown, levels: Record<string, unknown> = {}) =>
    parseBenchConfig({ ...(demo() as Record<string, unknown>), decision, levels: { ...(demo() as { levels: Record<string, unknown> }).levels, ...levels } });

  it('reads a top-level block, overridden or switched off per level, never on the levels run on the stub', () => {
    const config = withDecision(
      { provider: 'typesafe', model: 'jev-latest', key_env: 'TYPESAFE_API_KEY', price_per_call: 0.002 },
      { e2e_local: { profile: 'machine', repeat: 1, decision: { provider: 'kev', base_url: 'http://127.0.0.1:8765/v1' } }, e2e_remote: { profile: 'claude', decision: null } },
    );
    expect(decisionOf(config)).toEqual({ provider: 'typesafe', model: 'jev-latest', key_env: 'TYPESAFE_API_KEY', price_per_call: 0.002 });
    expect(decisionOf(config, 'e2e_local')).toEqual({ provider: 'kev', base_url: 'http://127.0.0.1:8765/v1' });
    expect(decisionOf(config, 'e2e_remote')).toBeNull();
    for (const level of ['static', 'unit', 'component'] as const) {
      expect(decisionOf(config, level)).toBeNull();
    }
    expect(decisionOf(parseBenchConfig(demo()), 'e2e_local')).toBeNull();
    const inherited = withDecision({ provider: 'liquid' });
    expect(decisionOf(inherited, 'e2e_remote')).toEqual({ provider: 'liquid' });
  });

  it('turns a block into the variables of its provider section, the key never among them', () => {
    expect(decisionVariables({ provider: 'typesafe', base_url: 'https://api.typesafe.ai/v1', model: 'jev-latest', key_env: 'TYPESAFE_API_KEY', price_per_call: 0.01 })).toEqual({
      [DECISION_PROVIDER_VARIABLE]: 'typesafe',
      ORKEON_Orkeon__TypeSafe__BaseUrl: 'https://api.typesafe.ai/v1',
      ORKEON_Orkeon__TypeSafe__Model: 'jev-latest',
      ORKEON_Orkeon__TypeSafe__ApiKeyEnvVar: 'TYPESAFE_API_KEY',
    });
    expect(decisionVariables({ provider: 'liquid' })).toEqual({ ORKEON_Orkeon__Decision__Provider: 'liquid' });
    expect(decisionVariables({ provider: 'kev', model: 'd1-open' })).toEqual({ ORKEON_Orkeon__Decision__Provider: 'kev', ORKEON_Orkeon__Kev__Model: 'd1-open' });
  });

  it('refuses a key where key_env names a variable, an unknown provider or key, a negative price', () => {
    expect(() => withDecision({ provider: 'typesafe', key_env: 'sk-live-0123456789abcdef' })).toThrow(/decision\.key_env: expected an environment variable name/);
    expect(() => withDecision({ provider: 'typesafe', key_env: 'ts_abc123' })).toThrow(/expected an environment variable name/);
    expect(() => withDecision({ provider: 'openai' })).toThrow(/decision\.provider/);
    expect(() => withDecision({ provider: 'kev', api_key: 'x' })).toThrow(/api_key/);
    expect(() => withDecision({ provider: 'kev', price_per_call: -1 })).toThrow(/decision\.price_per_call/);
    expect(() => withDecision(undefined, { e2e_local: { profile: 'machine', decision: { provider: 'kev', key_env: 'not a name' } } })).toThrow(/levels\.e2e_local\.decision\.key_env/);
  });
});
