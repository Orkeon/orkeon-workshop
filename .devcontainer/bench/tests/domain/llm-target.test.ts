import { describe, expect, it } from 'vitest';

import { LOCAL_HOSTS_VARIABLE, baseUrlHost, isLocalHost, llmTarget, machineTarget, parseLocalHosts, profileTarget, providerTargets } from '../../src/domain/llm-target.js';
import { MACHINE_PROFILE, namedProfile, namedProfileSchema, stubProfile } from '../../src/domain/profile.js';

describe('isLocalHost', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '127.1.2.3',
    '127.255.255.255',
    '::1',
    '[::1]',
    '0.0.0.0',
    'host.docker.internal',
    'Host.Docker.Internal',
  ])('counts %s as local', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    'api.anthropic.com',
    '192.168.1.10',
    '10.0.0.1',
    '128.0.0.1',
    '0.0.0.1',
    '127.0.0.1.example.com',
    'localhost.example.com',
    'host.docker.internal.example.com',
    'localhost.',
    '127.0.0.256',
    '127.0.0',
    '::2',
    '',
    '   ',
  ])('counts %j as remote', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });

  it('accepts the extra local hosts it is given, whole names only and whatever the case', () => {
    const extra = ['gpu-box.lan', '192.168.1.10'];
    expect(isLocalHost('gpu-box.lan', extra)).toBe(true);
    expect(isLocalHost('GPU-Box.LAN', extra)).toBe(true);
    expect(isLocalHost('192.168.1.10', extra)).toBe(true);
    expect(isLocalHost('192.168.1.11', extra)).toBe(false);
    expect(isLocalHost('other.gpu-box.lan', extra)).toBe(false);
    expect(isLocalHost('gpu-box.lan', ['GPU-BOX.LAN'])).toBe(true);
    expect(isLocalHost('', [''])).toBe(false);
  });
});

describe('parseLocalHosts', () => {
  it('reads the variable the hook reads', () => {
    expect(LOCAL_HOSTS_VARIABLE).toBe('HARNESS_LOCAL_LLM_HOSTS');
  });

  it('splits on commas and spaces, lowercases, and drops empty entries', () => {
    expect(parseLocalHosts('gpu-box.lan,192.168.1.10')).toEqual(['gpu-box.lan', '192.168.1.10']);
    expect(parseLocalHosts('  GPU-Box.LAN   192.168.1.10 ,, [fd00::5] ')).toEqual(['gpu-box.lan', '192.168.1.10', 'fd00::5']);
    expect(parseLocalHosts('a.lan,\tb.lan\nc.lan')).toEqual(['a.lan', 'b.lan', 'c.lan']);
  });

  it('is empty for an unset or blank variable', () => {
    expect(parseLocalHosts(undefined)).toEqual([]);
    expect(parseLocalHosts(null)).toEqual([]);
    expect(parseLocalHosts('  , ')).toEqual([]);
  });
});

describe('baseUrlHost', () => {
  it.each([
    ['https://api.anthropic.com', 'api.anthropic.com'],
    ['https://API.Anthropic.com/v1/', 'api.anthropic.com'],
    ['http://127.0.0.1:8123/v1', '127.0.0.1'],
    ['http://localhost:11434', 'localhost'],
    ['http://[::1]:11434/api', '::1'],
    ['http://host.docker.internal:11434', 'host.docker.internal'],
    ['http://0.0.0.0:11434', '0.0.0.0'],
    ['localhost:11434', 'localhost'],
    ['api.openai.com/v1', 'api.openai.com'],
    ['http://user:secret@10.0.0.5:8080', '10.0.0.5'],
    ['http://127.0.0.1@evil.example', 'evil.example'],
  ])('reads %s as %s', (baseUrl, host) => {
    expect(baseUrlHost(baseUrl)).toBe(host);
  });

  it.each(['not a url', 'http://', '://'])('cannot read %j as a local host', (baseUrl) => {
    const host = baseUrlHost(baseUrl);
    expect(host === null || !isLocalHost(host)).toBe(true);
  });
});

describe('llmTarget', () => {
  it('lets the base URL decide alone', () => {
    expect(llmTarget({ baseUrl: 'http://localhost:11434' })).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
    expect(llmTarget({ baseUrl: 'http://127.0.0.1:8123/v1', configured: true })).toEqual({ baseUrlHost: '127.0.0.1', remote: false, reason: 'local-host' });
    expect(llmTarget({ baseUrl: 'https://api.anthropic.com' })).toEqual({ baseUrlHost: 'api.anthropic.com', remote: true, reason: 'remote-host' });
  });

  it('counts a model served by the host machine as local', () => {
    expect(llmTarget({ baseUrl: 'http://host.docker.internal:11434' })).toEqual({ baseUrlHost: 'host.docker.internal', remote: false, reason: 'local-host' });
    expect(llmTarget({ baseUrl: 'http://0.0.0.0:11434' })).toEqual({ baseUrlHost: '0.0.0.0', remote: false, reason: 'local-host' });
  });

  it('counts a LAN model server as local only when it is listed', () => {
    const baseUrl = 'http://GPU-Box.lan:8000/v1';
    expect(llmTarget({ baseUrl })).toEqual({ baseUrlHost: 'gpu-box.lan', remote: true, reason: 'remote-host' });
    expect(llmTarget({ baseUrl }, parseLocalHosts('192.168.1.10, gpu-box.lan'))).toEqual({ baseUrlHost: 'gpu-box.lan', remote: false, reason: 'local-host' });
    expect(llmTarget({ baseUrl: 'https://api.openai.com/v1' }, parseLocalHosts('gpu-box.lan'))).toMatchObject({ remote: true });
  });

  it('treats a base URL it cannot read as remote: it is not known to be local', () => {
    expect(llmTarget({ baseUrl: 'not a url' })).toEqual({ baseUrlHost: null, remote: true, reason: 'unreadable-base-url' });
  });

  it('counts an Llm section without a base URL as remote: Orkeon infers the provider and calls its endpoint', () => {
    expect(llmTarget({ configured: true })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
    expect(llmTarget({ baseUrl: '  ', configured: true })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
  });

  it('is not remote, with no host, without an Llm section (echo provider)', () => {
    expect(llmTarget({})).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
    expect(llmTarget({ baseUrl: null, configured: false })).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
  });
});

describe('providerTargets and machineTarget', () => {
  const local = { baseUrl: 'http://localhost:11434', configured: true };

  it('judges the default, then every named profile on its own base URL', () => {
    expect(providerTargets({ ...local, profiles: [{ id: 'claude', baseUrl: 'https://api.anthropic.com' }, { id: 'ds', baseUrl: null }] })).toEqual([
      { baseUrlHost: 'localhost', remote: false, reason: 'local-host' },
      { baseUrlHost: 'api.anthropic.com', remote: true, reason: 'remote-host', profile: 'claude' },
      { baseUrlHost: null, remote: true, reason: 'no-base-url', profile: 'ds' },
    ]);
  });

  it('is the default unless a named profile is remote, then the first remote one', () => {
    expect(machineTarget(local)).toEqual({ baseUrlHost: 'localhost', remote: false, reason: 'local-host' });
    expect(machineTarget({ ...local, profiles: [{ id: 'gpu', baseUrl: 'http://127.0.0.1:8000/v1' }] })).toMatchObject({ remote: false });
    expect(machineTarget({ ...local, profiles: [{ id: 'gpu', baseUrl: 'http://gpu.lan' }] }, ['gpu.lan'])).toMatchObject({ remote: false });
    expect(machineTarget({ ...local, profiles: [{ id: 'a', baseUrl: null }, { id: 'b', baseUrl: 'https://x.example' }] })).toEqual({
      baseUrlHost: null,
      remote: true,
      reason: 'no-base-url',
      profile: 'a',
    });
    expect(machineTarget({ baseUrl: 'https://api.openai.com', configured: true, profiles: [{ id: 'b', baseUrl: 'https://x.example' }] })).toEqual({
      baseUrlHost: 'api.openai.com',
      remote: true,
      reason: 'remote-host',
    });
    expect(machineTarget({ configured: false, profiles: [{ id: 'claude', baseUrl: 'https://api.anthropic.com' }] })).toMatchObject({ remote: true, profile: 'claude' });
  });
});

describe('profileTarget', () => {
  const settings = (baseUrl: string) => namedProfileSchema.parse({ baseUrl, model: 'm', keyEnv: 'KEY' });

  it('judges a named profile by its own base URL, whatever the machine says', () => {
    expect(profileTarget(namedProfile('claude', settings('https://api.anthropic.com')), { baseUrl: 'http://localhost:11434' })).toMatchObject({ baseUrlHost: 'api.anthropic.com', remote: true });
    expect(profileTarget(namedProfile('lan', settings('http://127.0.0.1:1234/v1')), { baseUrl: 'https://api.openai.com' })).toMatchObject({ baseUrlHost: '127.0.0.1', remote: false });
  });

  it('applies the extra local hosts to a named profile', () => {
    const lan = namedProfile('lan', settings('http://gpu-box.lan:8000/v1'));
    expect(profileTarget(lan)).toMatchObject({ remote: true, reason: 'remote-host' });
    expect(profileTarget(lan, {}, ['gpu-box.lan'])).toMatchObject({ remote: false, reason: 'local-host' });
  });

  it('never counts the stub as remote, with or without its port', () => {
    expect(profileTarget(stubProfile())).toEqual({ baseUrlHost: '127.0.0.1', remote: false, reason: 'local-host' });
    expect(profileTarget(stubProfile(8123), { baseUrl: 'https://api.openai.com' })).toMatchObject({ baseUrlHost: '127.0.0.1', remote: false });
  });

  it('judges the machine profile by the machine settings', () => {
    expect(profileTarget(MACHINE_PROFILE, { baseUrl: 'http://localhost:11434' })).toMatchObject({ baseUrlHost: 'localhost', remote: false });
    expect(profileTarget(MACHINE_PROFILE, { baseUrl: 'https://api.openai.com/v1' })).toMatchObject({ baseUrlHost: 'api.openai.com', remote: true });
    expect(profileTarget(MACHINE_PROFILE, { baseUrl: 'http://gpu-box.lan:8000' }, ['gpu-box.lan'])).toMatchObject({ baseUrlHost: 'gpu-box.lan', remote: false });
    expect(profileTarget(MACHINE_PROFILE, { configured: true })).toEqual({ baseUrlHost: null, remote: true, reason: 'no-base-url' });
    expect(profileTarget(MACHINE_PROFILE)).toEqual({ baseUrlHost: null, remote: false, reason: 'not-configured' });
  });
});
