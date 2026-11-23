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
      ORKEON_Llm__ApiKeyEnvVar: '',
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
    expect(resolution.machine?.layers.map((layer) => layer.source)).toEqual(['ORKEON_Llm__* variables', USER_SETTINGS, 'Llm__* variables']);
    expect(resolution.warnings).toEqual([]);
  });

  it('warns when nothing creates an Llm section, and when a layer sets Llm:Provider', async () => {
    const none = await setup().resolve.execute(demoTeam().team, 'machine');
    expect(none.warnings).toEqual(['no Orkeon settings file and no Llm variable: orkeon run uses its echo provider']);
    const noLlm = await setup({ [USER_SETTINGS]: { RateLimiting: { QueueLimit: 32 } } }).resolve.execute(demoTeam().team, 'machine');
    expect(noLlm.warnings[0]).toMatch(/no default provider in .*appsettings\.json nor in the other layers: orkeon run uses its echo provider for every agent that names no profile/);
    const provider = await setup({ [USER_SETTINGS]: { Llm: { Provider: 'ollama', BaseUrl: 'http://localhost:11434' } } }).resolve.execute(demoTeam().team, 'machine');
    expect(provider.warnings).toEqual([`${USER_SETTINGS} set Llm:Provider, which is no setting: Orkeon refuses to start on it — remove it (the provider follows the base URL, then the model name, then the key)`]);
  });

  describe('a C# team (host/): the chain its host merges', () => {
    const HOST_FILES = (team: { folder: string }) => ({
      [`${team.folder}/host/Demo.sln`]: '',
      [`${team.folder}/host/src/Demo.Host/Demo.Host.csproj`]: '<Project />',
    });

    it('reads the team folder files and settings/<slug>/, never the user file of orkeon run', async () => {
      const { team } = demoTeam();
      const { resolve } = setup({
        ...HOST_FILES(team),
        [USER_SETTINGS]: OLLAMA,
        [`${team.folder}/appsettings.json`]: REMOTE,
        [`${team.folder}/appsettings.local.json`]: { Llm: { Model: 'gpt-y' } },
      });
      const resolution = await resolve.execute(team, 'machine');
      expect(resolution.machine?.layers.map((layer) => layer.source)).toEqual(['ORKEON_Llm__* variables', `${team.folder}/appsettings.local.json`, `${team.folder}/appsettings.json`]);
      expect(resolution.settingsFiles).toEqual([`${team.folder}/appsettings.local.json`, `${team.folder}/appsettings.json`]);
      expect(resolution.target.remote).toBe(true);
    });

    it('lays settings/<slug>/appsettings.json over the team folder files; a local endpoint there makes the run local', async () => {
      const { team } = demoTeam();
      const { resolve } = setup({ ...HOST_FILES(team), [`${team.folder}/appsettings.json`]: REMOTE, [teamPaths(team).settingsFile]: OLLAMA });
      const resolution = await resolve.execute(team, 'machine');
      expect(resolution.settingsFile).toBe(teamPaths(team).settingsFile);
      expect(resolution.machine?.effective.baseUrl).toBe('http://localhost:11434');
      expect(resolution.target.remote).toBe(false);
    });

    it('ignores the unprefixed Llm__ variables, which the host does not read, and counts the ORKEON_ ones', async () => {
      const { team } = demoTeam();
      const unprefixed = await setup({ ...HOST_FILES(team) }, { Llm__BaseUrl: 'https://api.openai.com/v1' }).resolve.execute(team, 'machine');
      expect(unprefixed.machine?.effective.configured).toBe(false);
      const prefixed = await setup({ ...HOST_FILES(team), [teamPaths(team).settingsFile]: OLLAMA }, { ORKEON_Llm__BaseUrl: 'https://api.openai.com/v1' }).resolve.execute(team, 'machine');
      expect(prefixed.target.remote).toBe(true);
    });

    it('a csproj alone under host/ (an older team) keeps the crew chain', async () => {
      const { team } = demoTeam();
      const resolution = await setup({ [`${team.folder}/host/Tools.csproj`]: '<Project />', [USER_SETTINGS]: OLLAMA }).resolve.execute(team, 'machine');
      expect(resolution.settingsFile).toBe(USER_SETTINGS);
    });
  });

  it('refuses a settings file that is not valid JSON', async () => {
    await expect(setup({ [USER_SETTINGS]: '{ "Llm": ' }).resolve.execute(demoTeam().team, 'machine')).rejects.toThrow(/is not valid JSON/);
  });

  it('resolves the stub profile even without a bench.config.json; the base URL waits for the port', async () => {
    const { team } = demoTeam();
    const resolve = new ResolveProfile(new InMemoryFileSystem().addDirectory(team.folder), new FakeEnvironment());
    const pending = await resolve.execute(team, 'stub');
    expect(pending.variables).toEqual({ ORKEON_Llm__Model: 'stub-model', ORKEON_Llm__ApiKey: 'stub', ORKEON_Llm__ApiKeyEnvVar: '' });
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
      // The legacy `_shared/appsettings.json` is no longer read (Orkeon 1.0.0-rc.7): the user settings stand.
      expect(await target('machine', { '/home/tester/Orkeon/_shared/appsettings.json': REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
      expect(await target('machine', { '/home/tester/Orkeon/appsettings/appsettings.json': REMOTE, [USER_SETTINGS]: OLLAMA })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
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
      expect(resolution.warnings[0]).toMatch(/no default provider in .*settings\/demo\/appsettings\.json/);
    });

    it('stops walking up after the folder of the Orkeon examples solution', async () => {
      const files = { '/home/tester/appsettings/appsettings.json': REMOTE, '/home/tester/Orkeon/Orkeon.Examples.sln': '', [USER_SETTINGS]: OLLAMA };
      expect(await target('machine', files)).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it('never reads the appsettings files of the working directory (Orkeon main at a2bb6c3)', async () => {
      expect(await target('machine', { [`${team.folder}/appsettings.json`]: REMOTE })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
      expect(await target('machine', { [`${team.folder}/appsettings.json`]: OLLAMA, [USER_SETTINGS]: REMOTE })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
      expect(await target('machine', { [`${team.folder}/appsettings.Staging.json`]: REMOTE }, { DOTNET_ENVIRONMENT: 'Staging' })).toMatchObject({ remote: false });
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

    it('reads the variables without prefix under the settings file, and the DOTNET_ ones no longer', async () => {
      expect(await target('machine', {}, { Llm__BaseUrl: 'https://api.example.com' })).toMatchObject({ baseUrlHost: 'api.example.com', remote: true });
      expect(await target('machine', {}, { DOTNET_Llm__Model: 'gpt-x' })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { Llm__BaseUrl: 'https://api.example.com' })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    });

    it('counts the run as remote when a named profile is, even with a local default: any agent may name it', async () => {
      const withProfiles = (profiles: Record<string, unknown>) => ({ [USER_SETTINGS]: { Llm: { BaseUrl: 'http://localhost:11434', Model: 'qwen3:8b', Profiles: profiles } } });
      expect(await target('machine', withProfiles({ claude: { BaseUrl: 'https://api.anthropic.com', Model: 'c', ApiKeyEnvVar: 'ANTHROPIC_API_KEY' } }))).toEqual({
        baseUrlHost: 'api.anthropic.com',
        remote: true,
        reason: 'remote-host',
        profile: 'claude',
      });
      expect(await target('machine', withProfiles({ ds: { Model: 'deepseek-chat' } }))).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url', profile: 'ds' });
      expect(await target('machine', withProfiles({ gpu: { BaseUrl: 'http://127.0.0.1:8000/v1' } }))).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
      expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Llm__Profiles__x__BaseUrl: 'https://api.example.com' })).toMatchObject({ remote: true, profile: 'x' });
      // A section of profiles alone: no default (echo), and still remote through its profile.
      expect(await target('machine', { [USER_SETTINGS]: { Llm: { Profiles: { claude: { BaseUrl: 'https://api.anthropic.com' } } } } })).toMatchObject({ remote: true, profile: 'claude' });
    });

    describe('the decision providers (TypeSafe or Liquid deduced from a section or a key, Kev named; Orkeon 1.2.0)', () => {
      const typesafe = (section: unknown) => ({ ...OLLAMA, Orkeon: { TypeSafe: section } });

      it('makes a run with a local Llm remote, configured in the settings file', async () => {
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ Model: 'jev' }) })).toEqual({ baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ Model: null }) })).toMatchObject({ remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: { ...OLLAMA, 'orkeon:typesafe:apikey': 'k' } })).toMatchObject({ remote: true, reason: 'decision-model' });
        // R-64: an empty section counts.
        expect(await target('machine', { [USER_SETTINGS]: typesafe({}) })).toEqual({ baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' });
      });

      it('counts the ORKEON_ variables, the unprefixed ones and TYPESAFE_API_KEY', async () => {
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Orkeon__TypeSafe__Model: '' })).toMatchObject({ remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { Orkeon__TypeSafe__Model: 'jev' })).toMatchObject({ remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { TYPESAFE_API_KEY: 'ts-key' })).toMatchObject({ baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { TYPESAFE_API_KEY: '' })).toMatchObject({ remote: false });
      });

      it('is local on a local base URL, the highest layer winning, and remote on one Orkeon cannot bind', async () => {
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ BaseUrl: 'http://localhost:8080/v1' }) })).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ BaseUrl: 'http://localhost:8080/v1' }) }, { ORKEON_Orkeon__TypeSafe__BaseUrl: 'https://ts.example.com/v1' })).toEqual({
          baseUrlHost: 'ts.example.com',
          remote: true,
          reason: 'decision-model',
        });
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ BaseUrl: 'https://ts.example.com/v1' }) }, { ORKEON_Orkeon__TypeSafe__BaseUrl: 'http://127.0.0.1:9/v1' })).toMatchObject({ remote: false });
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ BaseUrl: null }) }, { Orkeon__TypeSafe__BaseUrl: 'http://127.0.0.1:9/v1' })).toEqual({ baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: typesafe({ BaseUrl: 'http://ts.lan/v1' }) }, { HARNESS_LOCAL_LLM_HOSTS: 'ts.lan' })).toMatchObject({ remote: false });
      });

      it('resolves Liquid and Kev, and counts settings Orkeon refuses as remote with a warning', async () => {
        expect(await target('machine', { [USER_SETTINGS]: { ...OLLAMA, Orkeon: { Liquid: {} } } })).toEqual({ baseUrlHost: 'api.liquid.ai', remote: true, reason: 'decision-model' });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { LIQUID_API_KEY: 'lq' })).toMatchObject({ baseUrlHost: 'api.liquid.ai', remote: true });
        expect(await target('machine', { [USER_SETTINGS]: { ...OLLAMA, Orkeon: { Kev: {} } } }, { KEV_API_KEY: 'k' })).toMatchObject({ remote: false });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Orkeon__Decision__Provider: 'kev' })).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
        expect(await target('machine', { [USER_SETTINGS]: { ...OLLAMA, Orkeon: { Kev: { BaseUrl: 'http://127.0.0.1:1/v1' }, Decision: { Provider: 'Kev' } } } }, { ORKEON_Orkeon__Kev__ApiKeyEnvVar: 'MY_KEV' })).toMatchObject({ remote: false });
        const both = setup({ [USER_SETTINGS]: { ...OLLAMA, Orkeon: { TypeSafe: { BaseUrl: 'http://localhost:1/v1' }, Liquid: null } } });
        const refused = await both.resolve.execute(both.team, 'machine');
        expect(refused.decisionModel?.target).toEqual({ baseUrlHost: null, remote: true, reason: 'decision-model' });
        expect(refused.warnings).toEqual([expect.stringMatching(/^Orkeon refuses to start on the decision settings \(.*\): Both TypeSafe and Liquid are configured/)]);
        expect(await target('machine', { [USER_SETTINGS]: { ...OLLAMA, Orkeon: { TypeSafe: { BaseUrl: 'http://localhost:1/v1' } } } }, { LIQUID_API_KEY: 'lq' })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
        expect(await target('machine', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Orkeon__Decision__Provider: 'bogus' })).toEqual({ baseUrlHost: null, remote: true, reason: 'decision-model' });
      });

      it('keeps a remote LLM as the reason, judges a local named profile on it, never the stub', async () => {
        expect(await target('machine', { [USER_SETTINGS]: { ...REMOTE, Orkeon: { TypeSafe: { Model: 'jev' } } } })).toMatchObject({ baseUrlHost: 'api.openai.com', reason: 'remote-host' });
        const files = { [USER_SETTINGS]: OLLAMA, '/home/tester/Orkeon/tests/demo/bench.config.json': JSON.stringify({ profiles: { lan: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm', keyEnv: 'LAN_KEY' } } }) };
        expect(await target('lan', files, { TYPESAFE_API_KEY: 'k' })).toEqual({ baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' });
        expect(await target('lan', files)).toMatchObject({ remote: false });
        expect(await target('stub', files, { TYPESAFE_API_KEY: 'k' })).toMatchObject({ remote: false, reason: 'local-host' });
      });

      it('reports it and warns that the rule reads no circuit switch, --no-decision included', async () => {
        const { team: demo, resolve } = setup({ [USER_SETTINGS]: typesafe({ Model: 'jev' }) });
        const resolution = await resolve.execute(demo, 'machine');
        expect(resolution.decisionModel).toEqual({
          target: { baseUrlHost: 'api.typesafe.ai', remote: true, reason: 'decision-model' },
          effective: { configured: true, provider: 'typesafe', how: 'deduced', refusal: null, configuredBy: [USER_SETTINGS], baseUrl: 'https://api.typesafe.ai/v1', baseUrlSource: null, model: 'jev', keyVariable: 'TYPESAFE_API_KEY' },
        });
        expect(resolution.warnings).toEqual([
          `the decision model TypeSafe is configured (${USER_SETTINGS}) and its endpoint api.typesafe.ai is not local: decision tasks, the system_one_decide tool, decision profiles and the LLM judge call it while the decision circuit is on; --no-decision turns the circuit off (Orkeon 1.4.0), but the rule reads no circuit switch, so the run counts as remote`,
        ]);
        expect((await resolve.execute(demo, 'stub')).decisionModel).toBeNull();
        expect((await setup({ [USER_SETTINGS]: OLLAMA }).resolve.execute(demo, 'machine')).decisionModel).toBeNull();
      });
    });

    it('lists the decision profiles, and warns outside the stub that without a provider they take no decision', async () => {
      const files = { [USER_SETTINGS]: { ...OLLAMA, Orkeon: { Decision: { Profiles: { triage: { Target: 'fast', Stages: [{ Kind: 'verify', EscalateTo: 'fast' }] } } } } } };
      const warning = 'no decision provider is active, but Orkeon:Decision:Profiles:triage is declared: Orkeon registers it anyway, without the decision model (the circuit off, Orkeon 1.4.0): an agent naming one runs on the fallback of its route or its target, unguarded and never escalated, and a fail-closed one with a guard blocks every call — configure a provider, or name the target LLM profile instead';
      const { team: demo, resolve } = setup(files);
      const machine = await resolve.execute(demo, 'machine');
      expect(machine.decisionProfiles).toEqual([{ id: 'triage', target: 'fast' }]);
      expect(machine.warnings).toContain(warning);
      const stub = await resolve.execute(demo, 'stub');
      expect(stub.decisionProfiles).toEqual([{ id: 'triage', target: 'fast' }]);
      expect(stub.warnings).not.toContain(warning);
      const withProvider = await setup(files, { KEV_API_KEY: '', ORKEON_Orkeon__Decision__Provider: 'kev' }).resolve.execute(demo, 'machine');
      expect(withProvider.warnings).not.toContain(warning);
    });

    it('reports every provider for the machine profile, and warns about a remote named profile', async () => {
      const { team: demo, resolve } = setup({ [USER_SETTINGS]: { Llm: { BaseUrl: 'http://localhost:11434', Profiles: { claude: { BaseUrl: 'https://api.anthropic.com' } } } } });
      const resolution = await resolve.execute(demo, 'machine');
      expect(resolution.providers).toEqual([
        { baseUrlHost: 'localhost', remote: false, reason: 'local-host' },
        { baseUrlHost: 'api.anthropic.com', remote: true, reason: 'remote-host', profile: 'claude' },
      ]);
      expect(resolution.orkeonProfiles).toEqual(['claude']);
      expect(resolution.warnings).toEqual([
        'the named profile Llm:Profiles:claude is remote (api.anthropic.com): any agent of the crew may name it, so the run counts as remote',
      ]);
    });

    it('injects the stub and a named profile over every named profile of the run, with no key reference', async () => {
      const files = { [USER_SETTINGS]: { Llm: { BaseUrl: 'http://localhost:11434', ApiKeyEnvVar: 'GH_TOKEN', Profiles: { claude: { BaseUrl: 'https://api.anthropic.com' } } } } };
      const { team: demo, resolve } = setup(files);
      const stub = await resolve.execute(demo, 'stub', { stubPort: 8123 });
      expect(stub.target).toMatchObject({ remote: false });
      expect(stub.variables).toMatchObject({
        ORKEON_Llm__BaseUrl: 'http://127.0.0.1:8123/v1',
        ORKEON_Llm__ApiKeyEnvVar: '',
        ORKEON_Llm__Profiles__claude__BaseUrl: 'http://127.0.0.1:8123/v1',
        ORKEON_Llm__Profiles__claude__ApiKey: 'stub',
        ORKEON_Llm__Profiles__claude__ApiKeyEnvVar: '',
      });
      const claude = await resolve.execute(demo, 'claude');
      expect(claude.variables).toMatchObject({ ORKEON_Llm__Profiles__claude__BaseUrl: 'https://api.anthropic.com', ORKEON_Llm__ApiKeyEnvVar: '' });
      expect(claude.secretNames).toEqual(['ORKEON_Llm__ApiKey', 'ORKEON_Llm__Profiles__claude__ApiKey']);
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

    it('is remote without a base URL when the section holds only the prompt-cache default (Llm:Cache, Orkeon main at 151a762)', async () => {
      expect(await target('machine', { [USER_SETTINGS]: { Llm: { Cache: { SystemPrompt: true } } } })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
      expect(await target('machine', {}, { ORKEON_Llm__Cache__Tools: 'true' })).toMatchObject({ remote: true, reason: 'no-base-url' });
    });

    it('ignores ORKEON_Llm__BaseUrl for a named profile: the bench injects its own', async () => {
      expect(await target('claude', { [USER_SETTINGS]: OLLAMA }, { ORKEON_Llm__BaseUrl: 'http://127.0.0.1:1/v1' })).toMatchObject({ baseUrlHost: 'api.anthropic.com', remote: true });
    });
  });

  describe('the decision block of a level (D96)', () => {
    const LIQUID = { provider: 'liquid', base_url: 'https://api.liquid.example/v1', model: 'lfm', key_env: 'LIQUID_KEY', price_per_call: 0.002 };
    const KEV = { provider: 'kev', base_url: 'http://127.0.0.1:8070/v1' };
    const config = {
      profiles: { lan: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm', keyEnv: 'LAN_KEY' } },
      decision: KEV,
      levels: { e2e_local: { profile: 'machine' }, e2e_remote: { profile: 'lan', decision: LIQUID } },
    };
    const rig = (levelConfig: Record<string, unknown> = config, variables: Record<string, string> = { LIQUID_KEY: 'lq-SECRET', LAN_KEY: 'lan' }) => {
      const { team, fileSystem } = demoTeam();
      fileSystem.addFile(USER_SETTINGS, JSON.stringify(OLLAMA)).addFile(teamPaths(team).benchConfigFile, JSON.stringify(levelConfig));
      return { team, resolve: new ResolveProfile(fileSystem, new FakeEnvironment(variables)) };
    };

    it('takes the level\'s own block, injects its variables with the key variable\'s name only, and judges the target on it', async () => {
      const { team, resolve } = rig();
      const resolution = await resolve.execute(team, 'lan', { level: 'e2e_remote' });
      expect(resolution.decisionBlock).toEqual(LIQUID);
      expect(resolution.decisionVariables).toEqual({
        ORKEON_Orkeon__Decision__Provider: 'liquid',
        ORKEON_Orkeon__Liquid__BaseUrl: 'https://api.liquid.example/v1',
        ORKEON_Orkeon__Liquid__Model: 'lfm',
        ORKEON_Orkeon__Liquid__ApiKeyEnvVar: 'LIQUID_KEY',
      });
      expect(resolution.decisionModel?.effective).toMatchObject({ provider: 'liquid', model: 'lfm', keyVariable: 'LIQUID_KEY', baseUrl: 'https://api.liquid.example/v1' });
      expect(resolution.target).toEqual({ baseUrlHost: 'api.liquid.example', remote: true, reason: 'decision-model' });
      expect(JSON.stringify({ ...resolution, profile: null })).not.toContain('lq-SECRET');
    });

    it('falls back on the top-level block for a level without its own, and on it without a level', async () => {
      const { team, resolve } = rig();
      const local = await resolve.execute(team, 'machine', { level: 'e2e_local' });
      expect(local.decisionBlock).toEqual(KEV);
      expect(local.decisionVariables).toEqual({ ORKEON_Orkeon__Decision__Provider: 'kev', ORKEON_Orkeon__Kev__BaseUrl: 'http://127.0.0.1:8070/v1' });
      expect(local.target).toMatchObject({ remote: false });
      expect((await resolve.execute(team, 'machine')).decisionBlock).toEqual(KEV);
    });

    it('gives none to the stub, to the component level, and to a level that states null', async () => {
      const { team, resolve } = rig({ ...config, levels: { ...config.levels, e2e_local: { profile: 'machine', decision: null } } });
      for (const resolution of [await resolve.execute(team, 'stub', { level: 'component' }), await resolve.execute(team, 'machine', { level: 'component' }), await resolve.execute(team, 'machine', { level: 'e2e_local' })]) {
        expect(resolution.decisionBlock).toBeNull();
        expect(resolution.decisionVariables).toEqual({});
      }
      expect((await resolve.execute(team, 'stub', { level: 'e2e_remote' })).decisionBlock).toBeNull();
    });

    it('warns when the variable key_env names is not set', async () => {
      const { team, resolve } = rig(config, { LAN_KEY: 'lan' });
      const resolution = await resolve.execute(team, 'lan', { level: 'e2e_remote' });
      expect(resolution.warnings).toContain('LIQUID_KEY (key_env of the decision block) is not set: Liquid will be called without a key');
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
