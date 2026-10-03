import { describe, expect, it } from 'vitest';

import { ResolveProfile } from '../../src/application/use-cases/resolve-profile.js';
import { DomainError } from '../../src/domain/errors.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { demoTeam } from '../fakes/fixture-team.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const USER_SETTINGS = '/home/tester/.config/Orkeon/appsettings.json';
const OLLAMA = { Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b', TimeoutSeconds: 600 } };
const REMOTE = { Llm: { BaseUrl: 'https://api.openai.com/v1', Model: 'gpt-x' } };

/** The demo team, with settings files written where Orkeon looks for them. */
function setup(files: Record<string, unknown> = {}, variables: Record<string, string> = {}) {
  const { team, fileSystem } = demoTeam();
  for (const [path, content] of Object.entries(files)) {
    fileSystem.addFile(path, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return { team, resolve: new ResolveProfile(fileSystem, new FakeEnvironment(variables)) };
}

describe('ResolveProfile', () => {
  it('resolves a named profile and reads the key from the variable it names, never from the config', async () => {
    const { team, resolve } = setup({ [USER_SETTINGS]: OLLAMA }, { ANTHROPIC_API_KEY: 'sk-live' });
    const resolution = await resolve.execute(team, 'claude');
    expect(resolution.profile).toMatchObject({ kind: 'named', name: 'claude', model: '<to decide>' });
    expect(resolution.variables).toEqual({
      ORKEON_Llm__BaseUrl: 'https://api.anthropic.com',
      ORKEON_Llm__Model: '<to decide>',
      ORKEON_Llm__TimeoutSeconds: '600',
      ORKEON_Llm__ApiKey: 'sk-live',
    });
    expect(resolution.secretNames).toEqual(['ORKEON_Llm__ApiKey']);
    expect(resolution.keyPresent).toBe(true);
    expect(resolution.warnings).toEqual([]);
    expect(resolution.machine).toBeNull();
    expect(JSON.stringify(resolution.profile)).not.toContain('sk-live');
  });

  it('warns when the key variable is not set and leaves the key out', async () => {
    const { team, resolve } = setup();
    const resolution = await resolve.execute(team, 'claude');
    expect(resolution.keyPresent).toBe(false);
    expect(resolution.variables).not.toHaveProperty('ORKEON_Llm__ApiKey');
    expect(resolution.warnings).toEqual(['ANTHROPIC_API_KEY is not set: ORKEON_Llm__ApiKey will not be injected']);
  });

  it('describes what a run of the team would read for the machine profile, and injects nothing', async () => {
    const { team, resolve } = setup({ [USER_SETTINGS]: OLLAMA });
    const resolution = await resolve.execute(team, 'machine');
    expect(resolution.profile.kind).toBe('machine');
    expect(resolution.variables).toEqual({});
    expect(resolution.machine).toMatchObject({
      settingsFile: USER_SETTINGS,
      effective: { baseUrl: 'http://localhost:11434', configured: true, baseUrlSource: USER_SETTINGS, configuredBy: [USER_SETTINGS] },
    });
    expect(resolution.machine?.layers.map((layer) => layer.source)).toEqual(['ORKEON_Llm__* variables', USER_SETTINGS, 'Llm__* variables', 'DOTNET_Llm__* variables']);
    expect(resolution.warnings).toEqual([]);
  });

  it('warns when nothing creates an Llm section, and when a layer sets Llm:Provider', async () => {
    const none = await setup().resolve.execute(demoTeam().team, 'machine');
    expect(none.warnings).toEqual(['no Orkeon settings file and no Llm variable: orkeon run uses its echo provider']);
    const noLlm = await setup({ [USER_SETTINGS]: { RateLimiting: { QueueLimit: 32 } } }).resolve.execute(demoTeam().team, 'machine');
    expect(noLlm.warnings[0]).toMatch(/no Llm section in .*appsettings\.json nor in the other layers/);
    const provider = await setup({ [USER_SETTINGS]: { Llm: { Provider: 'ollama', BaseUrl: 'http://localhost:11434' } } }).resolve.execute(demoTeam().team, 'machine');
    expect(provider.warnings).toEqual([`${USER_SETTINGS} set Llm:Provider, which Orkeon does not read: the provider follows the base URL, then the model name, then the key`]);
  });

  it('refuses a settings file that is not valid JSON', async () => {
    await expect(setup({ [USER_SETTINGS]: '{ "Llm": ' }).resolve.execute(demoTeam().team, 'machine')).rejects.toThrow(/is not valid JSON/);
  });

  it('resolves the stub profile even without a bench.config.json; the base URL waits for the port', async () => {
    const { team } = demoTeam();
    const resolve = new ResolveProfile(new InMemoryFileSystem().addDirectory(team.folder), new FakeEnvironment());
    const pending = await resolve.execute(team, 'stub');
    expect(pending.variables).toEqual({ ORKEON_Llm__Model: 'stub-model', ORKEON_Llm__ApiKey: 'stub' });
    expect(pending.runtimeNames).toEqual(['ORKEON_Llm__BaseUrl']);
    const running = await resolve.execute(team, 'stub', { stubPort: 8123 });
    expect(running.variables.ORKEON_Llm__BaseUrl).toBe('http://127.0.0.1:8123/v1');
    expect(running.runtimeNames).toEqual([]);
    expect(running.secretNames).toEqual([]);
  });

  describe('target (is the profile remote?)', () => {
    const target = async (name: string, files: Record<string, unknown> = {}, variables: Record<string, string> = {}) => {
      const { team, resolve } = setup(files, variables);
      return (await resolve.execute(team, name)).target;
    };
    const { team } = demoTeam();
    const crew = teamPaths(team).crew;

    it('is remote for a named profile whose base URL host is not local', async () => {
      expect(await target('claude', { [USER_SETTINGS]: OLLAMA })).toEqual({ baseUrlHost: 'api.anthropic.com', remote: true, reason: 'remote-host' });
    });

    it('is never remote for the stub, whatever the machine targets', async () => {
      expect(await target('stub', { [USER_SETTINGS]: REMOTE }, { ORKEON_Llm__BaseUrl: 'https://api.openai.com/v1' })).toEqual({ baseUrlHost: '127.0.0.1', remote: false, reason: 'local-host' });
    });

    it('follows the Llm section of the user settings for the machine profile', async () => {
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA })).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
      expect(await target('machine', { [USER_SETTINGS]: REMOTE })).toEqual({ baseUrlHost: 'api.openai.com', remote: true, reason: 'remote-host' });
    });

    it('reads the user settings under XDG_CONFIG_HOME when it is set', async () => {
      expect(await target('machine', { '/xdg/Orkeon/appsettings.json': REMOTE, [USER_SETTINGS]: OLLAMA }, { XDG_CONFIG_HOME: '/xdg' })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
    });

    it('takes the settings file Orkeon resolves for the crew before the user settings', async () => {
      expect(await target('machine', { [`${crew}/appsettings.json`]: REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { [`${team.folder}/appsettings/appsettings.json`]: REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { '/home/tester/Orkeon/_shared/appsettings.json': REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { [`${crew}/appsettings.json`]: OLLAMA, [`${team.folder}/appsettings/appsettings.json`]: REMOTE })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it("takes the team's settings file of the workshop over every other one: the launchers pass it with --settings (D33)", async () => {
      const teamSettings = teamPaths(team).settingsFile;
      expect(teamSettings).toBe('/home/tester/Orkeon/settings/demo/appsettings.json');
      expect(await target('machine', { [teamSettings]: REMOTE, [`${crew}/appsettings.json`]: OLLAMA, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { [teamSettings]: { Orkeon: { Tools: { Email: { DefaultAccount: 'triage' } } } }, [USER_SETTINGS]: REMOTE })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
      const { resolve } = setup({ [teamSettings]: { Orkeon: {} }, [USER_SETTINGS]: OLLAMA });
      const resolution = await resolve.execute(team, 'machine');
      expect(resolution.machine?.settingsFile).toBe(teamSettings);
      expect(resolution.warnings[0]).toMatch(/no Llm section in .*settings\/demo\/appsettings\.json/);
    });

    it('stops walking up after the folder of the Orkeon examples solution', async () => {
      const files = { '/home/tester/appsettings/appsettings.json': REMOTE, '/home/tester/Orkeon/Orkeon.Examples.sln': '', [USER_SETTINGS]: OLLAMA };
      expect(await target('machine', files)).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it('reads the appsettings files of the working directory, under the settings file', async () => {
      expect(await target('machine', { [`${team.folder}/appsettings.json`]: REMOTE })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { [`${team.folder}/appsettings.Production.json`]: { Llm: { Model: 'gpt-x' } } })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
      expect(await target('machine', { [`${team.folder}/appsettings.json`]: REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
      expect(await target('machine', { [`${team.folder}/appsettings.Staging.json`]: REMOTE }, { DOTNET_ENVIRONMENT: 'Staging' })).toMatchObject({ remote: true });
    });

    it('counts the hosts of HARNESS_LOCAL_LLM_HOSTS as local, for the machine and for named profiles', async () => {
      const lan = { [USER_SETTINGS]: { Llm: { BaseUrl: 'http://gpu-box.lan:8000/v1', Model: 'm' } } };
      expect(await target('machine', lan)).toEqual({ baseUrlHost: 'gpu-box.lan', remote: true, reason: 'remote-host' });
      expect(await target('machine', lan, { HARNESS_LOCAL_LLM_HOSTS: '192.168.1.10 GPU-Box.lan' })).toEqual({ baseUrlHost: 'gpu-box.lan', remote: false, reason: 'local-host' });
      expect(await target('machine', lan, { HARNESS_LOCAL_LLM_HOSTS: 'other.lan,192.168.1.10' })).toMatchObject({ remote: true });
      expect(await target('claude', { [USER_SETTINGS]: OLLAMA }, { HARNESS_LOCAL_LLM_HOSTS: 'api.anthropic.com' })).toEqual({ baseUrlHost: 'api.anthropic.com', remote: false, reason: 'local-host' });
    });

    it('counts a model served by the host machine as local', async () => {
      expect(await target('machine', { [USER_SETTINGS]: { Llm: { BaseUrl: 'http://host.docker.internal:11434' } } })).toEqual({ baseUrlHost: 'host.docker.internal', remote: false, reason: 'local-host' });
    });

    it('lets ORKEON_Llm__BaseUrl override every file, in both directions, whatever the case of its name', async () => {
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Llm__BaseUrl: 'https://api.anthropic.com' })).toMatchObject({ baseUrlHost: 'api.anthropic.com', remote: true });
      expect(await target('machine', { [`${crew}/appsettings.json`]: REMOTE }, { ORKEON_LLM__BASEURL: 'http://127.0.0.1:8123/v1' })).toMatchObject({ baseUrlHost: '127.0.0.1', remote: false });
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Llm__BaseUrl: '  ' })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it('reads the variables without prefix and with DOTNET_, under the settings file', async () => {
      expect(await target('machine', {}, { Llm__BaseUrl: 'https://api.example.com' })).toMatchObject({ baseUrlHost: 'api.example.com', remote: true });
      expect(await target('machine', {}, { DOTNET_Llm__Model: 'gpt-x' })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { Llm__BaseUrl: 'https://api.example.com' })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it('is not remote, with no host, when no layer creates an Llm section (echo provider)', async () => {
      expect(await target('machine')).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
      expect(await target('machine', { [USER_SETTINGS]: { Llm: {} } })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
      expect(await target('machine', { [USER_SETTINGS]: { Orkeon: { Llm: { BaseUrl: 'https://api.example.com' } } } })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
    });

    it('is remote without a base URL as soon as a layer creates the section, whatever provider it names', async () => {
      const noBaseUrl = (llm: Record<string, unknown>) => ({ [USER_SETTINGS]: { Llm: llm } });
      expect(await target('machine', noBaseUrl({ Provider: 'ollama', Model: 'qwen3:8b' }))).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
      expect(await target('machine', noBaseUrl({ ApiKey: 'sk-file' }))).toMatchObject({ remote: true, reason: 'no-base-url' });
      expect(await target('machine', {}, { ORKEON_Llm__ApiKey: 'sk-env' })).toMatchObject({ remote: true, reason: 'no-base-url' });
      expect(await target('machine', {}, { ORKEON_Llm__Provider: 'ollama' })).toMatchObject({ remote: true, reason: 'no-base-url' });
    });

    it('ignores ORKEON_Llm__BaseUrl for a named profile: the bench injects its own', async () => {
      expect(await target('claude', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Llm__BaseUrl: 'http://127.0.0.1:1/v1' })).toMatchObject({ baseUrlHost: 'api.anthropic.com', remote: true });
    });
  });

  it('refuses an unknown profile, and any named profile when the team has no bench.config.json', async () => {
    const { team, resolve } = setup();
    await expect(resolve.execute(team, 'gpt')).rejects.toThrow(DomainError);
    const bare = new ResolveProfile(new InMemoryFileSystem().addDirectory(team.folder), new FakeEnvironment());
    await expect(bare.execute(team, 'claude')).rejects.toThrow(/known: machine, stub/);
  });

  it('refuses a malformed bench.config.json whatever the profile', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(teamPaths(team).benchConfigFile, '{ "levels": { "e2e_remote": { "profile": "gpt" } } }');
    const resolve = new ResolveProfile(fileSystem, new FakeEnvironment());
    await expect(resolve.execute(team, 'machine')).rejects.toThrow(/unknown profile "gpt"/);
  });
});
