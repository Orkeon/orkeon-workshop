import { describe, expect, it } from 'vitest';

import {
  crewSettingsFile,
  effectiveDecisionModel,
  effectiveLlmSettings,
  flattenConfiguration,
  isDecisionModelVariable,
  isLlmVariable,
  llmLayer,
  settingsWalk,
  stubRunVariables,
  stubSettings,
  userSettingsFile,
  variableEntries,
  withoutLlmVariables,
} from '../../src/domain/orkeon-configuration.js';

const layerOf = (json: unknown) => llmLayer('file', flattenConfiguration(json));

describe('flattenConfiguration', () => {
  it('joins nested names with a colon and numbers array items, as .NET does', () => {
    expect(flattenConfiguration({ Llm: { BaseUrl: 'http://localhost:11434', Thinking: { Enabled: true } }, Hosts: ['a', 'b'] })).toEqual([
      { key: 'Llm:BaseUrl', value: 'http://localhost:11434' },
      { key: 'Llm:Thinking:Enabled', value: true },
      { key: 'Hosts:0', value: 'a' },
      { key: 'Hosts:1', value: 'b' },
    ]);
  });

  it('keeps an empty object or a null as a key without a value, and an empty array as an empty string', () => {
    expect(flattenConfiguration({ Llm: {}, Tags: [], Model: null })).toEqual([
      { key: 'Llm', value: undefined },
      { key: 'Tags', value: '' },
      { key: 'Model', value: undefined },
    ]);
  });

  it('gives nothing for a root that is not an object with keys', () => {
    expect(flattenConfiguration({})).toEqual([]);
    expect(flattenConfiguration('x')).toEqual([]);
  });
});

describe('llmLayer', () => {
  it('is configured by a key under Llm holding a non-blank value, a key holding a colon included', () => {
    expect(layerOf({ Llm: { Model: 'gpt-x' } })).toMatchObject({ configured: true, baseUrls: [] });
    expect(layerOf({ llm: { apikey: 'k' } })).toMatchObject({ configured: true });
    expect(layerOf({ 'Llm:BaseUrl': 'https://api.example.com' })).toMatchObject({ configured: true, baseUrls: ['https://api.example.com'] });
    expect(layerOf({ Llm: { Thinking: { Enabled: true } } })).toMatchObject({ configured: true });
    expect(layerOf({ Llm: { TimeoutSeconds: 600 } })).toMatchObject({ configured: true });
  });

  it('is not configured by keys without a value, blank values, Llm itself or profiles alone (LlmSettings.HasDefault)', () => {
    expect(layerOf({ Llm: 'x' })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: [] })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: { Model: null } })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: { Model: '  ', BaseUrl: '' } })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: { Thinking: {} } })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: {} })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: null })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: { Profiles: { claude: { BaseUrl: 'https://api.anthropic.com' } } } })).toMatchObject({ configured: false, baseUrls: [] });
    expect(layerOf({ Orkeon: { Llm: { BaseUrl: 'https://api.example.com' } } })).toMatchObject({ configured: false, baseUrls: [] });
  });

  it('reads every named profile, with or without a value, and its base URL', () => {
    const layer = layerOf({
      Llm: { Model: 'm', Profiles: { Claude: { BaseUrl: ' https://api.anthropic.com ', Model: 'c' }, local: { BaseUrl: 'http://localhost:11434' }, bare: {}, nothing: null } },
    });
    expect(layer.profiles).toEqual([
      { id: 'Claude', baseUrls: ['https://api.anthropic.com'] },
      { id: 'local', baseUrls: ['http://localhost:11434'] },
      { id: 'bare', baseUrls: [] },
      { id: 'nothing', baseUrls: [] },
    ]);
    expect(layer.baseUrls).toEqual([]);
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm__Profiles__ds__Model: 'deepseek-chat' })).profiles).toEqual([{ id: 'ds', baseUrls: [] }]);
  });

  it('takes a base URL from a non-blank string only, trimmed', () => {
    expect(layerOf({ Llm: { BaseUrl: '  http://localhost:11434 ' } }).baseUrls).toEqual(['http://localhost:11434']);
    expect(layerOf({ Llm: { BaseUrl: '   ' } }).baseUrls).toEqual([]);
    expect(layerOf({ Llm: { BaseUrl: 11434 } }).baseUrls).toEqual([]);
  });

  it('notes a Provider key, which Orkeon refuses at start', () => {
    expect(layerOf({ Llm: { Provider: 'ollama' } })).toMatchObject({ configured: true, setsProvider: true });
    expect(layerOf({ Llm: { Model: 'm' } })).toMatchObject({ setsProvider: false });
  });
});

describe('variableEntries', () => {
  it('keeps the variables of a prefix, whatever their case, and reads __ as a colon', () => {
    const variables = { ORKEON_Llm__BaseUrl: 'http://a', orkeon_llm__model: 'm', ORKEON_Tools__X: '1', PATH: '/bin' };
    expect(variableEntries('ORKEON_', variables)).toEqual([
      { key: 'Llm:BaseUrl', value: 'http://a' },
      { key: 'llm:model', value: 'm' },
      { key: 'Tools:X', value: '1' },
    ]);
  });

  it('reads every variable for the empty prefix', () => {
    expect(variableEntries('', { Llm__BaseUrl: 'http://a', PATH: '/bin' })).toEqual([
      { key: 'Llm:BaseUrl', value: 'http://a' },
      { key: 'PATH', value: '/bin' },
    ]);
  });

  it('makes a configured layer of a variable with a value only: a blank one is absent', () => {
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm__Model: 'm' }))).toMatchObject({ configured: true, baseUrls: [] });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm__Model: '' }))).toMatchObject({ configured: false, baseUrls: [] });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm: 'x' }))).toMatchObject({ configured: false });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_LlmX__Model: 'm' }))).toMatchObject({ configured: false });
  });
});

describe('effectiveLlmSettings', () => {
  const layer = (source: string, configured: boolean, ...baseUrls: string[]) => ({
    source,
    configured,
    baseUrls,
    setsProvider: false,
    profiles: [],
    decisionModel: { source, configured: false, baseUrls: [] },
  });
  const decisionModel = { configured: false, configuredBy: [], baseUrl: null, baseUrlSource: null };

  it('takes the base URL of the highest layer that sets one', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('file', true, 'http://localhost:11434'), layer('bare', true, 'https://api.example.com')])).toEqual({
      baseUrl: 'http://localhost:11434',
      configured: true,
      baseUrlSource: 'file',
      configuredBy: ['file', 'bare'],
      profiles: [],
      decisionModel,
    });
  });

  it('is configured, without a base URL, when any layer gives the default a value', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('bare', true)])).toEqual({ baseUrl: null, configured: true, baseUrlSource: null, configuredBy: ['bare'], profiles: [], decisionModel });
    expect(effectiveLlmSettings([])).toEqual({ baseUrl: null, configured: false, baseUrlSource: null, configuredBy: [], profiles: [], decisionModel });
  });

  it('merges each named profile across layers, names compared without case, the highest base URL winning', () => {
    const vars = { ...layer('vars', false), profiles: [{ id: 'CLAUDE', baseUrls: [] }] };
    const file = { ...layer('file', true, 'http://localhost:11434'), profiles: [{ id: 'claude', baseUrls: ['https://api.anthropic.com'] }, { id: 'ds', baseUrls: [] }] };
    expect(effectiveLlmSettings([vars, file]).profiles).toEqual([
      { id: 'CLAUDE', baseUrl: 'https://api.anthropic.com', baseUrlSource: 'file', definedBy: ['vars', 'file'] },
      { id: 'ds', baseUrl: null, baseUrlSource: null, definedBy: ['file'] },
    ]);
  });

  it('keeps the first base URL that is not local when a layer sets several', () => {
    expect(effectiveLlmSettings([layer('vars', true, 'http://localhost:11434', 'https://api.example.com')]).baseUrl).toBe('https://api.example.com');
    expect(effectiveLlmSettings([layer('vars', true, 'http://localhost:11434', 'http://gpu-box.lan')], ['gpu-box.lan']).baseUrl).toBe('http://localhost:11434');
  });
});

describe('the decision model of a layer (Orkeon:TypeSafe, Exists() semantics checked on a build of f80665f)', () => {
  const decisionOf = (json: unknown) => layerOf(json).decisionModel;

  it('exists with a key below the section, with or without a value, in any case and spelling', () => {
    expect(decisionOf({ Orkeon: { TypeSafe: { Model: 'jev-latest' } } })).toEqual({ source: 'file', configured: true, baseUrls: [] });
    expect(decisionOf({ orkeon: { typesafe: { guard: null } } })).toMatchObject({ configured: true });
    expect(decisionOf({ Orkeon: { TypeSafe: { Guard: {} } } })).toMatchObject({ configured: true });
    expect(decisionOf({ 'Orkeon:TypeSafe:ApiKeyEnvVar': 'MY_KEY' })).toMatchObject({ configured: true });
    expect(decisionOf({ Orkeon: { 'TypeSafe:Guard': { Enabled: true } } })).toMatchObject({ configured: true });
  });

  it('exists when the section itself holds a value: an empty string, an empty array, a scalar', () => {
    expect(decisionOf({ Orkeon: { TypeSafe: '' } })).toMatchObject({ configured: true });
    expect(decisionOf({ Orkeon: { TypeSafe: [] } })).toMatchObject({ configured: true });
    expect(decisionOf({ Orkeon: { TypeSafe: false } })).toMatchObject({ configured: true });
  });

  it('does not exist as an empty object or a null, nor anywhere else', () => {
    expect(decisionOf({ Orkeon: { TypeSafe: {} } })).toMatchObject({ configured: false });
    expect(decisionOf({ Orkeon: { TypeSafe: null } })).toMatchObject({ configured: false });
    expect(decisionOf({ 'Orkeon:TypeSafe': {} })).toMatchObject({ configured: false });
    expect(decisionOf({ TypeSafe: { BaseUrl: 'https://api.typesafe.ai/v1' }, Orkeon: { TypeSafeX: { Model: 'm' }, Decision: { Enabled: true } } })).toEqual({ source: 'file', configured: false, baseUrls: [] });
  });

  it('keeps every value of its base URL, one Orkeon cannot bind as an empty string', () => {
    expect(decisionOf({ Orkeon: { TypeSafe: { BaseUrl: ' http://localhost:8080/v1 ' } } }).baseUrls).toEqual(['http://localhost:8080/v1']);
    expect(decisionOf({ Orkeon: { TypeSafe: { BaseUrl: null } } })).toEqual({ source: 'file', configured: true, baseUrls: [''] });
    expect(decisionOf({ Orkeon: { TypeSafe: { BaseUrl: '  ' } } }).baseUrls).toEqual(['']);
    expect(decisionOf({ Orkeon: { TypeSafe: { BaseUrl: 8080 } } }).baseUrls).toEqual(['']);
  });

  it('reads both variable layers, an empty value included, under the name given', () => {
    const variables = { ORKEON_Orkeon__TypeSafe__Guard__Enabled: '', Orkeon__TypeSafe__BaseUrl: 'http://127.0.0.1:9/v1', ORKEON_Llm__Model: 'm' };
    expect(llmLayer('vars', variableEntries('ORKEON_', variables), 'ts-vars').decisionModel).toEqual({ source: 'ts-vars', configured: true, baseUrls: [] });
    expect(llmLayer('bare', variableEntries('', variables)).decisionModel).toEqual({ source: 'bare', configured: true, baseUrls: ['http://127.0.0.1:9/v1'] });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_ORKEON__TYPESAFE: '' })).decisionModel).toMatchObject({ configured: true });
  });
});

describe('effectiveDecisionModel', () => {
  const layer = (source: string, configured: boolean, ...baseUrls: string[]) => ({
    source,
    configured: false,
    baseUrls: [],
    setsProvider: false,
    profiles: [],
    decisionModel: { source, configured, baseUrls },
  });

  it('is configured by any layer, or by TYPESAFE_API_KEY alone', () => {
    expect(effectiveDecisionModel([layer('vars', false), layer('file', true)])).toEqual({ configured: true, configuredBy: ['file'], baseUrl: null, baseUrlSource: null });
    expect(effectiveDecisionModel([layer('vars', false)], 'TYPESAFE_API_KEY')).toEqual({ configured: true, configuredBy: ['TYPESAFE_API_KEY'], baseUrl: null, baseUrlSource: null });
    expect(effectiveDecisionModel([layer('vars', false)])).toMatchObject({ configured: false, configuredBy: [] });
  });

  it('takes the base URL of the highest layer holding the key, even one Orkeon cannot bind', () => {
    expect(effectiveDecisionModel([layer('vars', true, 'https://ts.example.com/v1'), layer('file', true, 'http://localhost:9/v1')])).toMatchObject({ baseUrl: 'https://ts.example.com/v1', baseUrlSource: 'vars' });
    expect(effectiveDecisionModel([layer('vars', false), layer('file', true, ''), layer('bare', true, 'http://localhost:9/v1')])).toMatchObject({ baseUrl: '', baseUrlSource: 'file' });
    expect(effectiveDecisionModel([layer('vars', true, 'http://localhost:9/v1', 'https://ts.example.com/v1')]).baseUrl).toBe('https://ts.example.com/v1');
  });
});

describe('the settings chain and the other files', () => {
  it('looks next to the crew, then walks up to the root', () => {
    expect(crewSettingsFile('/w/teams/a/crew')).toBe('/w/teams/a/crew/appsettings.json');
    expect(settingsWalk('/w/teams/a/crew').map(({ folder }) => folder)).toEqual(['/w/teams/a/crew', '/w/teams/a', '/w/teams', '/w', '/']);
    expect(settingsWalk('/w')[0]?.candidates).toEqual(['/w/appsettings/appsettings.json', '/w/_shared/appsettings.json']);
  });

  it('finds the user file under XDG_CONFIG_HOME, else ~/.config', () => {
    expect(userSettingsFile('/x', '/home/u')).toBe('/x/Orkeon/appsettings.json');
    expect(userSettingsFile(undefined, '/home/u')).toBe('/home/u/.config/Orkeon/appsettings.json');
    expect(userSettingsFile('', '/home/u')).toBe('/home/u/.config/Orkeon/appsettings.json');
  });

});

describe('the Llm variables of an environment', () => {
  it('recognises every spelling Orkeon reads into its Llm section', () => {
    const read = [
      'ORKEON_Llm__BaseUrl',
      'ORKEON_LLM__BASEURL',
      'orkeon_llm__apikey',
      'Orkeon_Llm__Model',
      'ORKEON_Llm__BASEURL',
      'ORKEON_LLM__PROFILES__PAID__APIKEY',
      'ORKEON_Llm__Profiles__paid__BaseUrl',
      'Llm__Model',
      'LLM__BASEURL',
      'llm__profiles__x__model',
      'ORKEON_Llm:BaseUrl',
      'Llm:ApiKey',
      'ORKEON_Llm',
      'llm',
    ];
    for (const name of read) {
      expect(isLlmVariable(name), name).toBe(true);
    }
  });

  it('leaves the variables that only look like them', () => {
    for (const name of ['PATH', 'ORKEON_WORKSHOP', 'ORKEON_LLM_API_KEY', 'ORKEON_Llmx__BaseUrl', 'MY_Llm__Model', 'LLMS__X', 'ORKEON_Orkeon__Rag__LlmProfile', 'DOTNET_Llm__Model']) {
      expect(isLlmVariable(name), name).toBe(false);
    }
  });

  it('recognises every variable that registers the decision model, and only those', () => {
    for (const name of ['TYPESAFE_API_KEY', 'typesafe_api_key', 'ORKEON_Orkeon__TypeSafe__BaseUrl', 'ORKEON_ORKEON__TYPESAFE__APIKEY', 'orkeon_orkeon__typesafe', 'Orkeon__TypeSafe__Guard__Enabled', 'ORKEON__TYPESAFE__MODEL', 'ORKEON_Orkeon:TypeSafe:BaseUrl', 'Orkeon:TypeSafe']) {
      expect(isDecisionModelVariable(name), name).toBe(true);
    }
    for (const name of ['TYPESAFE_API_KEY_FILE', 'MY_TYPESAFE_API_KEY', 'ORKEON_Orkeon__TypeSafeX', 'ORKEON_TypeSafe__BaseUrl', 'TypeSafe__BaseUrl', 'ORKEON_Orkeon__Decision__Enabled', 'DOTNET_Orkeon__TypeSafe__BaseUrl']) {
      expect(isDecisionModelVariable(name), name).toBe(false);
    }
  });

  it('drops them all, whatever their case', () => {
    expect(withoutLlmVariables({ PATH: '/usr/bin', ORKEON_LLM__BASEURL: 'https://api.example.com', Llm__Model: 'm', ORKEON_WORKSHOP: '/workspace' })).toEqual({ PATH: '/usr/bin', ORKEON_WORKSHOP: '/workspace' });
  });

  it('builds the environment of a stub run from what is left, then the injected variables alone', () => {
    const caller = {
      PATH: '/usr/bin',
      ORKEON_LLM__BASEURL: 'https://api.example.com/v1',
      ORKEON_LLM__APIKEY: 'sk-real',
      ORKEON_Llm__Temperature: '0',
      ORKEON_LLM__PROFILES__PAID__BASEURL: 'https://api.example.com/v1',
      Llm__ApiKey: 'sk-real-2',
      ORKEON_OPENAI_API_KEY: 'sk-images',
      orkeon_openai_api_key: 'sk-images-2',
      ORKEON_TAVILY_API_KEY: 'tvly',
      TYPESAFE_API_KEY: 'ts-real',
      typesafe_api_key: 'ts-real-2',
      ORKEON_Orkeon__TypeSafe__BaseUrl: 'https://api.typesafe.ai/v1',
      ORKEON_ORKEON__TYPESAFE__GUARD__ENABLED: '',
      Orkeon__TypeSafe__ApiKey: 'ts-real-3',
      ORKEON_Orkeon__Decision__Enabled: 'true',
    };
    const injected = { ORKEON_Llm__BaseUrl: 'http://127.0.0.1:43210/v1', ORKEON_Llm__ApiKey: 'stub' };
    expect(stubRunVariables(caller, injected)).toEqual({ PATH: '/usr/bin', ORKEON_TAVILY_API_KEY: 'tvly', ORKEON_Orkeon__Decision__Enabled: 'true', ...injected });
  });
});

describe('the settings file of a run on the simulated LLM', () => {
  const STUB = { baseUrl: 'http://127.0.0.1:43210/v1', model: 'stub-model', apiKey: 'stub' };
  const provider = { BaseUrl: STUB.baseUrl, Model: STUB.model, ApiKey: STUB.apiKey };

  it('points the default provider and every profile at the stub, whatever the profile is called', () => {
    const original = {
      Llm: { BaseUrl: 'https://api.example.com/v1', Model: 'm', ApiKey: 'sk-FILE', ApiKeyEnvVar: 'MY_KEY', Temperature: 0.2, Profiles: { 'fast-remote': { BaseUrl: 'https://api.example.com/v2', ApiKey: 'sk-FILE-2' } } },
    };
    const settings = stubSettings(original, STUB, ['fast-remote', 'gpt.4', 'my profile', 'PAID']);
    expect(settings).toEqual({ Llm: { ...provider, Profiles: { 'fast-remote': provider, 'gpt.4': provider, 'my profile': provider, PAID: provider } } });
    expect(JSON.stringify(settings)).not.toMatch(/sk-FILE|api\.example\.com|MY_KEY|Temperature/);
  });

  it('keeps everything that is not the Llm section, as it is', () => {
    const rest = {
      RateLimiting: { MaxConcurrentRequests: 1, QueueLimit: 32 },
      Orkeon: { Tools: { Email: { Accounts: { support: { Host: 'mail.example.com' } } } }, Rag: { LlmProfile: 'review' } },
      'Orkeon:Guardian:Enabled': true,
    };
    const settings = stubSettings({ ...rest, Llm: { Model: 'm' } }, STUB, []);
    expect(settings).toEqual({ ...rest, Llm: { ...provider, Profiles: {} } });
    expect(Object.keys(settings)).toEqual(['RateLimiting', 'Orkeon', 'Orkeon:Guardian:Enabled', 'Llm']);
  });

  it('drops the Llm section however the file spells it: another case, a key written as a path', () => {
    const settings = stubSettings({ LLM: { ApiKey: 'sk-1' }, 'Llm:ApiKey': 'sk-2', 'llm:profiles:paid:apikey': 'sk-3', llm: null, Llms: 'kept', 'Orkeon:Llm': 'kept' }, STUB, ['paid']);
    expect(settings).toEqual({ Llms: 'kept', 'Orkeon:Llm': 'kept', Llm: { ...provider, Profiles: { paid: provider } } });
  });

  it('leaves out the section of the decision model however the file spells it, and keeps the rest of Orkeon', () => {
    const original = {
      Orkeon: { TypeSafe: { BaseUrl: 'https://api.typesafe.ai/v1', ApiKey: 'ts-FILE', Guard: { Enabled: true } }, Decision: { Enabled: true }, Tools: { X: 1 } },
      orkeon: { typesafe: { model: 'jev' }, 'TypeSafe:Guard': { Enabled: true }, 'typesafe:apikey': 'ts-FILE-2', TypeSafeX: 'kept' },
      'Orkeon:TypeSafe': { ApiKey: 'ts-FILE-3' },
      'ORKEON:TYPESAFE:BASEURL': 'https://api.typesafe.ai/v1',
      'Orkeon:Rag:LlmProfile': 'review',
      TypeSafe: 'kept',
    };
    const settings = stubSettings(original, STUB, []);
    expect(settings).toEqual({
      Orkeon: { Decision: { Enabled: true }, Tools: { X: 1 } },
      orkeon: { TypeSafeX: 'kept' },
      'Orkeon:Rag:LlmProfile': 'review',
      TypeSafe: 'kept',
      Llm: { ...provider, Profiles: {} },
    });
    expect(JSON.stringify(settings)).not.toMatch(/ts-FILE|typesafe\.ai|jev/);
    expect(stubSettings({ Orkeon: 'x', 'Orkeon:Decision': { TypeSafe: { BaseUrl: 'kept' } } }, STUB, [])).toEqual({ Orkeon: 'x', 'Orkeon:Decision': { TypeSafe: { BaseUrl: 'kept' } }, Llm: { ...provider, Profiles: {} } });
  });

  it('makes one from nothing when the run would have read no settings file, and refuses what is no JSON object', () => {
    expect(stubSettings(null, STUB, [])).toEqual({ Llm: { ...provider, Profiles: {} } });
    expect(() => stubSettings([], STUB, [])).toThrow('a settings file is a JSON object');
    expect(() => stubSettings('x', STUB, [])).toThrow('a settings file is a JSON object');
  });
});
