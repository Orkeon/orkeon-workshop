import { describe, expect, it } from 'vitest';

import { DEFAULT_BENCH_CONFIG, parseBenchConfig, profileNamed, profileNames } from '../../src/domain/bench-config.js';
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
