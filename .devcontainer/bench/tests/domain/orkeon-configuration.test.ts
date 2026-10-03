import { describe, expect, it } from 'vitest';

import {
  crewSettingsFile,
  effectiveLlmSettings,
  flattenConfiguration,
  llmLayer,
  settingsWalk,
  userSettingsFile,
  variableEntries,
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

  it('notes a Provider key, which Orkeon does not read', () => {
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
  const layer = (source: string, configured: boolean, ...baseUrls: string[]) => ({ source, configured, baseUrls, setsProvider: false, profiles: [] });

  it('takes the base URL of the highest layer that sets one', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('file', true, 'http://localhost:11434'), layer('bare', true, 'https://api.example.com')])).toEqual({
      baseUrl: 'http://localhost:11434',
      configured: true,
      baseUrlSource: 'file',
      configuredBy: ['file', 'bare'],
      profiles: [],
    });
  });

  it('is configured, without a base URL, when any layer gives the default a value', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('bare', true)])).toEqual({ baseUrl: null, configured: true, baseUrlSource: null, configuredBy: ['bare'], profiles: [] });
    expect(effectiveLlmSettings([])).toEqual({ baseUrl: null, configured: false, baseUrlSource: null, configuredBy: [], profiles: [] });
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
