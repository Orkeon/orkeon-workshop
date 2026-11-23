import { describe, expect, it } from 'vitest';

import {
  VARIABLE_LAYERS,
  crewSettingsFile,
  decisionKeyVariables,
  effectiveDecisionModel,
  effectiveDecisionProfiles,
  effectiveLlmSettings,
  flattenConfiguration,
  isDecisionModelVariable,
  isLlmVariable,
  overlayVariables,
  llmLayer,
  settingsWalk,
  stubRunVariables,
  stubSettings,
  userSettingsFile,
  variableEntries,
  withoutLlmVariables,
} from '../../src/domain/orkeon-configuration.js';
import { decisionModelTarget } from '../../src/domain/llm-target.js';

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
    decisionModel: llmLayer(source, []).decisionModel,
  });
  const decisionModel = { configured: false, provider: null, how: null, refusal: null, configuredBy: [], baseUrl: null, baseUrlSource: null, model: null, keyVariable: null };

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

describe('the decision settings of a layer (Orkeon 1.2.0, DecisionProviderChoice.HasSection, R-64)', () => {
  const decisionOf = (json: unknown) => layerOf(json).decisionModel;
  const typesafeOf = (json: unknown) => decisionOf(json).sections.typesafe;

  it('holds a section with any key at or below it, with or without a value, in any case and spelling', () => {
    expect(typesafeOf({ Orkeon: { TypeSafe: { Model: 'jev-latest' } } })).toEqual({ source: 'file', configured: true, baseUrls: [], models: ['jev-latest'], apiKeyEnvVars: [], apiKey: null });
    expect(typesafeOf({ orkeon: { typesafe: { model: null } } })).toMatchObject({ configured: true, models: [''] });
    expect(typesafeOf({ 'Orkeon:TypeSafe:ApiKeyEnvVar': 'MY_KEY' })).toMatchObject({ configured: true, apiKeyEnvVars: ['MY_KEY'] });
    expect(decisionOf({ Orkeon: { Liquid: { BaseUrl: 'https://l.example.com/v1' } } }).sections.liquid).toMatchObject({ configured: true, baseUrls: ['https://l.example.com/v1'] });
    expect(decisionOf({ ORKEON: { KEV: { ApiKey: 'k' } } }).sections.kev).toMatchObject({ configured: true, apiKey: true });
  });

  it('holds a section that is an empty object, a null, an empty string or array (R-64)', () => {
    for (const value of [{}, null, '', [], false]) {
      expect(typesafeOf({ Orkeon: { TypeSafe: value } }).configured, JSON.stringify(value)).toBe(true);
    }
    expect(typesafeOf({ 'Orkeon:TypeSafe': {} }).configured).toBe(true);
    expect(decisionOf({ Orkeon: { Liquid: {} } }).sections.liquid.configured).toBe(true);
  });

  it('holds none elsewhere', () => {
    const decision = decisionOf({ TypeSafe: { BaseUrl: 'https://api.typesafe.ai/v1' }, Orkeon: { TypeSafeX: { Model: 'm' }, Decision: { Enabled: true }, Kevin: {} } });
    expect(Object.values(decision.sections).map((section) => section.configured)).toEqual([false, false, false]);
    expect(decision).toMatchObject({ providerNames: [], guard: false, judgeEnabled: [], guardianEnabled: [], retiredGuards: [] });
  });

  it('reads Orkeon:Decision:Provider, the LLM judge (Orkeon:Guardian:Llm) and its two former sections', () => {
    expect(decisionOf({ Orkeon: { Decision: { Provider: ' Kev ' }, Guardian: { Llm: { Enabled: true } } } })).toMatchObject({ providerNames: ['Kev'], guard: true, judgeEnabled: ['true'], guardianEnabled: [], retiredGuards: [] });
    expect(decisionOf({ 'orkeon:guardian:enabled': 'False', Orkeon: { Guardian: { LLM: { FailMode: 'Open' } } } })).toMatchObject({ guard: true, judgeEnabled: [], guardianEnabled: ['false'] });
    expect(decisionOf({ Orkeon: { Guardian: { Enabled: true, DefaultPolicy: {} } } })).toMatchObject({ guard: false, guardianEnabled: ['true'] });
    expect(decisionOf({ 'orkeon:decision:provider': null, Orkeon: { 'TypeSafe:Guard': {}, Decision: { Guard: { Enabled: true } } } })).toMatchObject({
      providerNames: [''],
      guard: false,
      retiredGuards: ['Orkeon:TypeSafe:Guard', 'Orkeon:Decision:Guard'],
    });
  });

  it('keeps every value of a base URL, one that is no string as an empty string', () => {
    expect(typesafeOf({ Orkeon: { TypeSafe: { BaseUrl: ' http://localhost:8080/v1 ' } } }).baseUrls).toEqual(['http://localhost:8080/v1']);
    expect(typesafeOf({ Orkeon: { TypeSafe: { BaseUrl: null } } }).baseUrls).toEqual(['']);
    expect(typesafeOf({ Orkeon: { TypeSafe: { BaseUrl: '  ' } } }).baseUrls).toEqual(['']);
    expect(typesafeOf({ Orkeon: { TypeSafe: { BaseUrl: 8080 } } }).baseUrls).toEqual(['8080']);
  });

  it('reads both variable layers, an empty value included, each section under its own name', () => {
    const variables = { ORKEON_Orkeon__TypeSafe__Model: '', Orkeon__Liquid__BaseUrl: 'http://127.0.0.1:9/v1', ORKEON_Orkeon__Decision__Provider: 'liquid', ORKEON_Llm__Model: 'm' };
    const [orkeon, bare] = VARIABLE_LAYERS.map(({ prefix, source, decisionSource }) => llmLayer(source, variableEntries(prefix, variables), decisionSource));
    expect(orkeon?.decisionModel.sections.typesafe).toMatchObject({ source: 'ORKEON_Orkeon__TypeSafe__* variables', configured: true });
    expect(orkeon?.decisionModel).toMatchObject({ source: 'ORKEON_Orkeon__Decision__* variables', providerNames: ['liquid'] });
    expect(bare?.decisionModel.sections.liquid).toMatchObject({ source: 'Orkeon__Liquid__* variables', configured: true, baseUrls: ['http://127.0.0.1:9/v1'] });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_ORKEON__TYPESAFE: '' })).decisionModel.sections.typesafe.configured).toBe(true);
  });
});

describe('effectiveDecisionModel (DecisionProviderChoice.Resolve, Orkeon 1.2.0)', () => {
  const file = (json: unknown, source = 'file') => llmLayer(source, flattenConfiguration(json));
  const none = { configured: false, provider: null, how: null, refusal: null, configuredBy: [], baseUrl: null, baseUrlSource: null, model: null, keyVariable: null };

  it('is none without any decision setting', () => {
    expect(effectiveDecisionModel([file({ Llm: { Model: 'm' } })])).toEqual(none);
    expect(effectiveDecisionModel([])).toEqual(none);
  });

  it('resolves each provider with its defaults', () => {
    expect(effectiveDecisionModel([file({ Orkeon: { TypeSafe: { Model: 'jev' } } })])).toEqual({
      configured: true,
      provider: 'typesafe',
      how: 'deduced',
      refusal: null,
      configuredBy: ['file'],
      baseUrl: 'https://api.typesafe.ai/v1',
      baseUrlSource: null,
      model: 'jev',
      keyVariable: 'TYPESAFE_API_KEY',
    });
    expect(effectiveDecisionModel([file({ Orkeon: { Liquid: { ApiKey: 'k' } } })])).toMatchObject({ provider: 'liquid', how: 'deduced', baseUrl: 'https://api.liquid.ai/decisions/v1', model: 'd1.1', keyVariable: 'LIQUID_API_KEY' });
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Provider: 'kev' } } })])).toMatchObject({ provider: 'kev', how: 'named', baseUrl: 'http://127.0.0.1:8009/v1', model: 'kev-latest', keyVariable: 'KEV_API_KEY', configuredBy: ['file'] });
  });

  it('names a provider in any case, over the sections and keys of the others', () => {
    const layers = [file({ Orkeon: { Decision: { Provider: 'LIQUID' }, TypeSafe: { Model: 'jev' }, Liquid: { Model: 'd2' } } })];
    expect(effectiveDecisionModel(layers, ['TYPESAFE_API_KEY'])).toMatchObject({ provider: 'liquid', how: 'named', model: 'd2', refusal: null });
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Provider: '  ' } } })])).toEqual(none);
    // The highest layer holding the name masks the lower ones; a blank value there means deduce.
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Provider: '' } } }, 'vars'), file({ Orkeon: { Decision: { Provider: 'kev' }, Liquid: {} } })])).toMatchObject({ provider: 'liquid', how: 'deduced' });
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Provider: 'typesafe' } } }, 'vars'), file({ Orkeon: { Decision: { Provider: 'kev' } } })])).toMatchObject({ provider: 'typesafe', how: 'named', configuredBy: ['vars'] });
  });

  it('refuses a provider name it does not know', () => {
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Provider: 'openai' }, TypeSafe: {} } })])).toMatchObject({
      configured: true,
      provider: null,
      refusal: "Orkeon:Decision:Provider is 'openai'; valid names are typesafe, liquid, kev.",
      configuredBy: ['file'],
    });
  });

  it('deduces from a section first, even an empty one (R-64), then from a key variable', () => {
    expect(effectiveDecisionModel([file({ Orkeon: { TypeSafe: {} } })])).toMatchObject({ provider: 'typesafe', how: 'deduced' });
    expect(effectiveDecisionModel([file({ Orkeon: { Liquid: null } })], ['TYPESAFE_API_KEY'])).toMatchObject({ provider: 'liquid', configuredBy: ['file'] });
    expect(effectiveDecisionModel([file({})], ['LIQUID_API_KEY'])).toMatchObject({ provider: 'liquid', how: 'deduced', configuredBy: ['LIQUID_API_KEY'] });
    expect(effectiveDecisionModel([file({})], ['typesafe_api_key'])).toMatchObject({ provider: 'typesafe', configuredBy: ['typesafe_api_key'] });
  });

  it('never deduces Kev, from its section or its key', () => {
    expect(effectiveDecisionModel([file({ Orkeon: { Kev: { BaseUrl: 'http://127.0.0.1:8009/v1' } } })], ['KEV_API_KEY'])).toEqual(none);
    expect(effectiveDecisionModel([file({ Orkeon: { Kev: {}, Liquid: {} } })])).toMatchObject({ provider: 'liquid' });
  });

  it('refuses two hosted candidates at the same step', () => {
    const refusal = 'Both TypeSafe and Liquid are configured for the decision model; name one with Orkeon:Decision:Provider.';
    expect(effectiveDecisionModel([file({ Orkeon: { TypeSafe: {} } }), file({ Orkeon: { Liquid: { Model: 'd1' } } }, 'other')])).toMatchObject({ configured: true, provider: null, refusal, configuredBy: ['file', 'other'] });
    expect(effectiveDecisionModel([file({})], ['TYPESAFE_API_KEY', 'LIQUID_API_KEY'])).toMatchObject({ refusal, configuredBy: ['TYPESAFE_API_KEY', 'LIQUID_API_KEY'] });
  });

  it('refuses the two former sections of the LLM judge, with or without a provider (Orkeon 1.2.0: "is not a setting")', () => {
    expect(effectiveDecisionModel([file({ Orkeon: { TypeSafe: { Guard: { Enabled: true } } } })]).refusal).toMatch(/^Orkeon:TypeSafe:Guard is not a setting any more: the LLM judge has its own section, Orkeon:Guardian:Llm/);
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Guard: { Enabled: true } } } })])).toMatchObject({
      configured: true,
      provider: null,
      refusal: 'Orkeon:Decision:Guard is not a setting any more: the LLM judge has its own section, Orkeon:Guardian:Llm; move its keys there (FailClosed is now FailMode: Closed or Open).',
      configuredBy: ['file'],
    });
    expect(effectiveDecisionModel([file({ Orkeon: { Decision: { Guard: { Enabled: true } }, Liquid: {} } })])).toMatchObject({ provider: null, refusal: expect.stringMatching(/^Orkeon:Decision:Guard is not a setting any more/) });
    expect(effectiveDecisionModel([llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Orkeon__Decision__Guard__Enabled: 'true' })), file({})]).refusal).toMatch(/^Orkeon:Decision:Guard is not a setting any more/);
  });

  it('gives the LLM judge enabled without a provider as a refusal: Orkeon refuses to start under FailMode Closed', () => {
    const judging = /^Orkeon:Guardian:Llm:Enabled is true, but no decision provider is active: the decision circuit is off, so Orkeon refuses to start under FailMode Closed/;
    expect(effectiveDecisionModel([file({ Orkeon: { Guardian: { Llm: { Enabled: true } } } })])).toMatchObject({ configured: true, provider: null, refusal: expect.stringMatching(judging), configuredBy: ['file'] });
    expect(effectiveDecisionModel([file({ Orkeon: { Guardian: { Llm: { Enabled: 'True' } } } })]).refusal).toMatch(judging);
    // The section alone, the judge off, or the whole guardian off: nothing calls the decision model.
    for (const guardian of [{ Llm: { Enabled: false } }, { Llm: { FailMode: 'Open', BlockThreshold: 0.9 } }, { Enabled: false, Llm: { Enabled: true } }]) {
      expect(effectiveDecisionModel([file({ Orkeon: { Guardian: guardian } })]), JSON.stringify(guardian)).toMatchObject({ configured: false, refusal: null });
    }
    // The highest layer holding the switch wins.
    expect(effectiveDecisionModel([file({ Orkeon: { Guardian: { Llm: { Enabled: false } } } }, 'vars'), file({ Orkeon: { Guardian: { Llm: { Enabled: true } } } })]).refusal).toBeNull();
    expect(effectiveDecisionModel([file({ Orkeon: { Guardian: { Llm: { Enabled: true } } } }, 'vars'), file({ Orkeon: { Guardian: { Llm: { Enabled: false } } } })]).refusal).toMatch(judging);
    // With a provider, the judge calls it: no refusal.
    expect(effectiveDecisionModel([file({ Orkeon: { Guardian: { Llm: { Enabled: true } }, Liquid: {} } })])).toMatchObject({ provider: 'liquid', refusal: null });
  });

  it('takes the non-blank base URL, model and key variable of the highest layer holding them, else the defaults', () => {
    const layers = [file({ Orkeon: { TypeSafe: { BaseUrl: 'https://ts.example.com/v1' } } }, 'vars'), file({ Orkeon: { TypeSafe: { BaseUrl: 'http://localhost:9/v1', Model: 'jev-2' } } })];
    expect(effectiveDecisionModel(layers)).toMatchObject({ baseUrl: 'https://ts.example.com/v1', baseUrlSource: 'vars', model: 'jev-2', configuredBy: ['vars', 'file'] });
    const blank = [file({ Orkeon: { TypeSafe: { BaseUrl: null } } }, 'vars'), file({ Orkeon: { TypeSafe: { BaseUrl: 'http://localhost:9/v1' } } })];
    expect(effectiveDecisionModel(blank)).toMatchObject({ baseUrl: 'https://api.typesafe.ai/v1', baseUrlSource: null });
    const unbindable = effectiveDecisionModel([file({ Orkeon: { TypeSafe: { BaseUrl: { Host: 'localhost' } } } })]);
    expect(unbindable).toMatchObject({ provider: 'typesafe', baseUrlSource: 'file' });
    expect(decisionModelTarget({ configured: true, provider: 'typesafe', baseUrl: unbindable.baseUrl })).toEqual({ baseUrlHost: null, remote: true, reason: 'decision-model' });
    expect(effectiveDecisionModel([llmLayer('vars', variableEntries('', { 'Orkeon:TypeSafe:BaseUrl': 'http://localhost:9/v1', 'ORKEON:TYPESAFE:BASEURL': 'https://ts.example.com/v1' }))]).baseUrl).toBe('https://ts.example.com/v1');
  });

  it('reads the key from the variable ApiKeyEnvVar names', () => {
    const layers = [file({ Orkeon: { Liquid: { ApiKeyEnvVar: 'MY_LIQUID' } } })];
    expect(effectiveDecisionModel(layers, ['MY_LIQUID', 'LIQUID_API_KEY'])).toMatchObject({ provider: 'liquid', keyVariable: 'MY_LIQUID', configuredBy: ['file', 'MY_LIQUID'] });
    expect(decisionKeyVariables(layers, { MY_LIQUID: 'k', LIQUID_API_KEY: 'k2', KEV_API_KEY: '', OTHER: 'x' })).toEqual(['MY_LIQUID', 'LIQUID_API_KEY']);
  });

  it('refuses a named Kev whose address is no http address, or would carry a key in clear off the machine', () => {
    const kev = (section: Record<string, unknown>) => [file({ Orkeon: { Decision: { Provider: 'kev' }, Kev: section } })];
    expect(effectiveDecisionModel(kev({ BaseUrl: 'ftp://kev.lan/v1' })).refusal).toBe("Orkeon:Kev:BaseUrl 'ftp://kev.lan/v1' is not an absolute http or https address.");
    expect(effectiveDecisionModel(kev({ BaseUrl: 'http://kev.lan:8009/v1', ApiKey: 'k' })).refusal).toMatch(/is neither https nor a loopback address/);
    expect(effectiveDecisionModel(kev({ BaseUrl: 'http://host.docker.internal:8009/v1' }), ['KEV_API_KEY']).refusal).toMatch(/is neither https nor a loopback address/);
    expect(effectiveDecisionModel(kev({ BaseUrl: 'http://kev.lan:8009/v1' }))).toMatchObject({ provider: 'kev', refusal: null, baseUrl: 'http://kev.lan:8009/v1' });
    expect(effectiveDecisionModel(kev({ BaseUrl: 'https://kev.example.com/v1', ApiKey: 'k' })).refusal).toBeNull();
    expect(effectiveDecisionModel(kev({ ApiKey: 'k' })).refusal).toBeNull();
  });
});

describe('the settings chain and the other files', () => {
  it('looks next to the crew, then walks up to the root', () => {
    expect(crewSettingsFile('/w/teams/a/crew')).toBe('/w/teams/a/crew/appsettings.json');
    expect(settingsWalk('/w/teams/a/crew').map(({ folder }) => folder)).toEqual(['/w/teams/a/crew', '/w/teams/a', '/w/teams', '/w', '/']);
    expect(settingsWalk('/w')[0]?.candidates).toEqual(['/w/appsettings/appsettings.json']);
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
    for (const name of ['LIQUID_API_KEY', 'kev_api_key', 'ORKEON_Orkeon__Liquid__BaseUrl', 'Orkeon__Kev__Model', 'ORKEON_Orkeon__Decision__Provider', 'orkeon__decision__guard__enabled', 'ORKEON_Orkeon__Guardian__Llm__Enabled', 'Orkeon__Guardian__Llm__FailMode', 'TYPESAFE_API_KEY', 'typesafe_api_key', 'ORKEON_Orkeon__TypeSafe__BaseUrl', 'ORKEON_ORKEON__TYPESAFE__APIKEY', 'orkeon_orkeon__typesafe', 'Orkeon__TypeSafe__Guard__Enabled', 'ORKEON__TYPESAFE__MODEL', 'ORKEON_Orkeon:TypeSafe:BaseUrl', 'Orkeon:TypeSafe']) {
      expect(isDecisionModelVariable(name), name).toBe(true);
    }
    for (const name of ['TYPESAFE_API_KEY_FILE', 'MY_TYPESAFE_API_KEY', 'ORKEON_Orkeon__TypeSafeX', 'ORKEON_TypeSafe__BaseUrl', 'TypeSafe__BaseUrl', 'ORKEON_Orkeon__Decision__Enabled', 'ORKEON_Orkeon__Guardian__Enabled', 'ORKEON_Orkeon__Guardian__LlmX', 'ORKEON_Orkeon__Decision__ProviderX', 'ORKEON_Orkeon__Liquidity', 'DOTNET_Orkeon__TypeSafe__BaseUrl']) {
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
      LIQUID_API_KEY: 'lq-real',
      KEV_API_KEY: 'kev-real',
      ORKEON_Orkeon__Liquid__BaseUrl: 'https://api.liquid.ai/decisions/v1',
      Orkeon__Kev__ApiKey: 'kev-real-2',
      ORKEON_Orkeon__Decision__Provider: 'kev',
      Orkeon__Decision__Guard__Enabled: 'true',
      ORKEON_Orkeon__Guardian__Llm__Enabled: 'true',
      ORKEON_Orkeon__Guardian__Enabled: 'true',
    };
    const injected = { ORKEON_Llm__BaseUrl: 'http://127.0.0.1:43210/v1', ORKEON_Llm__ApiKey: 'stub' };
    expect(stubRunVariables(caller, injected)).toEqual({ PATH: '/usr/bin', ORKEON_TAVILY_API_KEY: 'tvly', ORKEON_Orkeon__Decision__Enabled: 'true', ORKEON_Orkeon__Guardian__Enabled: 'true', ...injected });
  });
});

describe('the decision profiles of the layers (Orkeon:Decision:Profiles, Orkeon 1.2.0)', () => {
  it('reads each name once, as the highest layer spells it, with the target of the highest layer that sets one', () => {
    const variables = llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Orkeon__Decision__Profiles__TRIAGE__FailClosed: 'true' }));
    const file = layerOf({ Orkeon: { Decision: { Profiles: { triage: { Target: ' fast ' }, gate: { Target: '' } } } }, Llm: { Profiles: { fast: {} } } });
    expect(file.decisionProfiles).toEqual([
      { id: 'triage', target: 'fast' },
      { id: 'gate', target: null },
    ]);
    expect(file.profiles.map((profile) => profile.id)).toEqual(['fast']);
    expect(effectiveDecisionProfiles([variables, file])).toEqual([
      { id: 'TRIAGE', target: 'fast' },
      { id: 'gate', target: null },
    ]);
    expect(effectiveDecisionProfiles([layerOf({ Llm: { Model: 'm' } })])).toEqual([]);
  });

  it('counts a decision-profile variable among those a stub run leaves out', () => {
    expect(isDecisionModelVariable('ORKEON_Orkeon__Decision__Profiles__triage__Target')).toBe(true);
    expect(isDecisionModelVariable('orkeon__decision__profiles__x__stages__0__kind')).toBe(true);
    expect(stubRunVariables({ PATH: '/usr/bin', ORKEON_Orkeon__Decision__Profiles__triage__Target: 'fast' }, {})).toEqual({ PATH: '/usr/bin' });
  });
});

describe('the settings file of a run on the simulated LLM', () => {
  const STUB = { baseUrl: 'http://127.0.0.1:43210/v1', model: 'stub-model', apiKey: 'stub' };
  const provider = { BaseUrl: STUB.baseUrl, Model: STUB.model, ApiKey: STUB.apiKey, CallMode: 'Buffer' };

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
      Orkeon: { TypeSafe: { BaseUrl: 'https://api.typesafe.ai/v1', ApiKey: 'ts-FILE', Guard: { Enabled: true } }, Liquid: { ApiKey: 'lq-FILE' }, KEV: {}, Decision: { Enabled: true, Provider: 'liquid', Guard: { Enabled: true } }, Guardian: { Enabled: true, Llm: { Enabled: true, FailMode: 'Closed' } }, Tools: { X: 1 } },
      'Orkeon:Guardian:Llm:Phases': ['Input'],
      'Orkeon:Decision:Provider': 'kev',
      'orkeon:kev:baseurl': 'http://kev.lan/v1',
      orkeon: { typesafe: { model: 'jev' }, 'TypeSafe:Guard': { Enabled: true }, 'typesafe:apikey': 'ts-FILE-2', TypeSafeX: 'kept' },
      'Orkeon:TypeSafe': { ApiKey: 'ts-FILE-3' },
      'ORKEON:TYPESAFE:BASEURL': 'https://api.typesafe.ai/v1',
      'Orkeon:Rag:LlmProfile': 'review',
      TypeSafe: 'kept',
    };
    const settings = stubSettings(original, STUB, []);
    expect(settings).toEqual({
      Orkeon: { Decision: { Enabled: true }, Guardian: { Enabled: true }, Tools: { X: 1 } },
      orkeon: { TypeSafeX: 'kept' },
      'Orkeon:Rag:LlmProfile': 'review',
      TypeSafe: 'kept',
      Llm: { ...provider, Profiles: {} },
    });
    expect(JSON.stringify(settings)).not.toMatch(/ts-FILE|lq-FILE|typesafe\.ai|jev|kev|liquid|Guard\b|Llm":\{"Enabled|FailMode|Phases|Provider/i);
    expect(stubSettings({ Orkeon: 'x', 'Orkeon:Decision': { TypeSafe: { BaseUrl: 'kept' } } }, STUB, [])).toEqual({ Orkeon: 'x', 'Orkeon:Decision': { TypeSafe: { BaseUrl: 'kept' } }, Llm: { ...provider, Profiles: {} } });
  });

  it('leaves out the decision profiles and makes each name a plain profile on the stub: no provider, so Orkeon would throw at their first use', () => {
    const original = {
      Llm: { Profiles: { fast: { BaseUrl: 'https://api.example.com/v1' } } },
      Orkeon: { Decision: { Enabled: true, Profiles: { triage: { Target: 'fast', Stages: [{ Kind: 'route', Routes: { fast: 'easy' } }] } } } },
      'orkeon:decision:profiles:Gate:Target': 'fast',
    };
    const layers = [llmLayer('file', flattenConfiguration(original))];
    const settings = stubSettings(original, STUB, ['fast'], effectiveDecisionProfiles(layers).map((profile) => profile.id));
    expect(settings).toEqual({ Orkeon: { Decision: { Enabled: true } }, Llm: { ...provider, Profiles: { fast: provider, triage: provider, Gate: provider } } });
    expect(JSON.stringify(settings)).not.toMatch(/Stages|Target|route/);
    // A name both a profile and a decision profile appears once, as the profile spells it.
    expect(stubSettings(null, STUB, ['Triage'], ['triage'])).toEqual({ Llm: { ...provider, Profiles: { Triage: provider } } });
  });

  it('makes one from nothing when the run would have read no settings file, and refuses what is no JSON object', () => {
    expect(stubSettings(null, STUB, [])).toEqual({ Llm: { ...provider, Profiles: {} } });
    expect(() => stubSettings([], STUB, [])).toThrow('a settings file is a JSON object');
    expect(() => stubSettings('x', STUB, [])).toThrow('a settings file is a JSON object');
  });
});

describe('overlayVariables (D96)', () => {
  it('lays the injected variables over the caller, replacing each of their names whatever its case', () => {
    expect(overlayVariables({ PATH: '/bin', orkeon_orkeon__decision__provider: 'liquid', ORKEON_Orkeon__Kev__Model: 'old' }, { ORKEON_Orkeon__Decision__Provider: 'kev', ORKEON_Orkeon__Kev__Model: 'd1' })).toEqual({
      PATH: '/bin',
      ORKEON_Orkeon__Decision__Provider: 'kev',
      ORKEON_Orkeon__Kev__Model: 'd1',
    });
    expect(overlayVariables({ PATH: '/bin' }, {})).toEqual({ PATH: '/bin' });
  });
});
