import { describe, expect, it } from 'vitest';

import {
  crewSettingsFile,
  effectiveLlmSettings,
  flattenConfiguration,
  hostEnvironment,
  llmLayer,
  settingsWalk,
  userSettingsFile,
  variableEntries,
  workingDirectoryFiles,
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
  it('is configured by any key under Llm, a key holding a colon included', () => {
    expect(layerOf({ Llm: { Model: 'gpt-x' } })).toMatchObject({ configured: true, baseUrls: [] });
    expect(layerOf({ llm: { apikey: 'k' } })).toMatchObject({ configured: true });
    expect(layerOf({ 'Llm:BaseUrl': 'https://api.example.com' })).toMatchObject({ configured: true, baseUrls: ['https://api.example.com'] });
    expect(layerOf({ Llm: { Thinking: {} } })).toMatchObject({ configured: true });
  });

  it('is configured by an Llm value, an empty array included, and not by an empty object or a null', () => {
    expect(layerOf({ Llm: 'x' })).toMatchObject({ configured: true });
    expect(layerOf({ Llm: [] })).toMatchObject({ configured: true });
    expect(layerOf({ Llm: { Model: null } })).toMatchObject({ configured: true });
    expect(layerOf({ Llm: {} })).toMatchObject({ configured: false });
    expect(layerOf({ Llm: null })).toMatchObject({ configured: false });
    expect(layerOf({ Orkeon: { Llm: { BaseUrl: 'https://api.example.com' } } })).toMatchObject({ configured: false, baseUrls: [] });
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

  it('makes a configured layer of a variable with an empty value', () => {
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm__Model: '' }))).toMatchObject({ configured: true, baseUrls: [] });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_Llm: 'x' }))).toMatchObject({ configured: true });
    expect(llmLayer('vars', variableEntries('ORKEON_', { ORKEON_LlmX__Model: 'm' }))).toMatchObject({ configured: false });
  });
});

describe('effectiveLlmSettings', () => {
  const layer = (source: string, configured: boolean, ...baseUrls: string[]) => ({ source, configured, baseUrls, setsProvider: false });

  it('takes the base URL of the highest layer that sets one', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('file', true, 'http://localhost:11434'), layer('cwd', true, 'https://api.example.com')])).toEqual({
      baseUrl: 'http://localhost:11434',
      configured: true,
      baseUrlSource: 'file',
      configuredBy: ['file', 'cwd'],
    });
  });

  it('is configured, without a base URL, when any layer creates the section', () => {
    expect(effectiveLlmSettings([layer('vars', false), layer('dotnet', true)])).toEqual({ baseUrl: null, configured: true, baseUrlSource: null, configuredBy: ['dotnet'] });
    expect(effectiveLlmSettings([])).toEqual({ baseUrl: null, configured: false, baseUrlSource: null, configuredBy: [] });
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

  it('reads the environment file before appsettings.json in the working directory', () => {
    expect(workingDirectoryFiles('/w/teams/a', 'Production')).toEqual(['/w/teams/a/appsettings.Production.json', '/w/teams/a/appsettings.json']);
    expect(hostEnvironment({})).toBe('Production');
    expect(hostEnvironment({ dotnet_environment: 'Staging' })).toBe('Staging');
    expect(hostEnvironment({ DOTNET_ENVIRONMENT: '' })).toBe('Production');
  });
});
