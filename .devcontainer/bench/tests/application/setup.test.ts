import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../src/application/errors.js';
import { SETUP_KEY_VARIABLE, Setup } from '../../src/application/use-cases/setup.js';
import { DomainError } from '../../src/domain/errors.js';
import { EMPTY_SETUP_STATE, applyKeys, applySubscription, keyVariableFor, parseSetupState, reapplyKeys, setupStatus } from '../../src/domain/setup.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const KEY = 'sk-test-0123456789';
const LOCAL = '/workspace/.claude/settings.local.json';
const STATE = '/workspace/.claude/local/setup.json';
const ORKEON = '/home/tester/.config/Orkeon/appsettings.json';
const OLLAMA = { Llm: { Model: 'qwen3:8b', BaseUrl: 'http://localhost:11434', TimeoutSeconds: 600 }, RateLimiting: { MaxConcurrentRequests: 1 } };

function workshop(variables: Record<string, string> = {}) {
  const files = new InMemoryFileSystem();
  const setup = new Setup(files, new FakeEnvironment({ ORKEON_WORKSHOP: '/workspace', ...variables }));
  const json = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await files.readText(path)) as Record<string, unknown>;
  return { files, setup, json };
}

describe('setup, the domain', () => {
  it('names the key variable of a provider, and keeps the Anthropic key away from Claude Code unless asked', () => {
    expect(keyVariableFor({ provider: 'openai', model: 'm', keyValue: KEY })).toBe('OPENAI_API_KEY');
    expect(keyVariableFor({ provider: 'anthropic', model: 'm', keyValue: KEY })).toBe('WORKSHOP_ANTHROPIC_API_KEY');
    expect(keyVariableFor({ provider: 'anthropic', model: 'm', keyValue: KEY, claudeOnKey: true })).toBe('ANTHROPIC_API_KEY');
    expect(keyVariableFor({ provider: 'custom', model: 'm', keyValue: KEY, keyVariable: 'MY_KEY' })).toBe('MY_KEY');
  });

  it('refuses an unknown provider, a name that is no variable, an ORKEON_ name, and ANTHROPIC_API_KEY by accident', () => {
    const refused = (request: Parameters<typeof keyVariableFor>[0]): string => {
      try {
        keyVariableFor(request);
        return 'accepted';
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        return (error as Error).message;
      }
    };
    expect(refused({ provider: 'nope', model: 'm', keyValue: KEY })).toContain("unknown provider 'nope'");
    expect(refused({ provider: 'custom', model: 'm', keyValue: KEY })).toContain('--key-variable');
    expect(refused({ provider: 'openai', model: 'm', keyValue: KEY, keyVariable: '1BAD' })).toContain('not a variable name');
    expect(refused({ provider: 'openai', model: 'm', keyValue: KEY, keyVariable: 'ORKEON_OPENAI' })).toContain('secret chain');
    expect(refused({ provider: 'anthropic', model: 'm', keyValue: KEY, keyVariable: 'ANTHROPIC_API_KEY' })).toContain('--claude-on-key');
    expect(refused({ provider: 'openai', model: 'm', keyValue: KEY, claudeOnKey: true })).toContain('anthropic provider only');
  });

  it('refuses an empty key, an empty model and a custom provider without a base URL', () => {
    const files = { local: {}, orkeon: {}, state: EMPTY_SETUP_STATE };
    expect(() => applyKeys(files, { provider: 'openai', model: 'm', keyValue: '  ' })).toThrow('the key is empty');
    expect(() => applyKeys(files, { provider: 'openai', model: ' ', keyValue: KEY })).toThrow('a model is required');
    expect(() => applyKeys(files, { provider: 'custom', model: 'm', keyValue: KEY, keyVariable: 'MY_KEY' })).toThrow('--base-url');
  });

  it('never puts the key in a line it prints', () => {
    const change = applyKeys({ local: {}, orkeon: OLLAMA, state: EMPTY_SETUP_STATE }, { provider: 'anthropic', model: 'claude-sonnet-5-5', keyValue: KEY });
    expect(change.lines.join('\n')).not.toContain(KEY);
    expect(JSON.stringify(change.orkeon)).not.toContain(KEY);
    expect(JSON.stringify(change.state)).not.toContain(KEY);
  });

  it('keeps what the Llm section held besides the model, the endpoint and the key, and drops an inline key', () => {
    const change = applyKeys({ local: {}, orkeon: { Llm: { Model: 'old', ApiKey: 'inline', TimeoutSeconds: 600 }, Other: 1 }, state: EMPTY_SETUP_STATE }, { provider: 'openai', model: 'gpt', keyValue: KEY });
    expect(change.orkeon).toEqual({ Llm: { Model: 'gpt', TimeoutSeconds: 600, BaseUrl: 'https://api.openai.com/v1', ApiKeyEnvVar: 'OPENAI_API_KEY' }, Other: 1 });
  });

  it('drops the window and the provider module of the model it replaces, and gives them back (D117)', () => {
    const request = { provider: 'openai', model: 'gpt', keyValue: KEY };
    const local = { Llm: { ...OLLAMA.Llm, contextWindowTokens: 8192, Provider: 'agent-cli' } };
    const change = applyKeys({ local: {}, orkeon: local, state: EMPTY_SETUP_STATE }, request);
    expect(change.orkeon['Llm']).toEqual({ Model: 'gpt', BaseUrl: 'https://api.openai.com/v1', TimeoutSeconds: 600, ApiKeyEnvVar: 'OPENAI_API_KEY' });
    expect(applySubscription(change).orkeon['Llm']).toEqual(local.Llm);
    // a new container wrote the local model's settings again
    expect(reapplyKeys({ ...change, orkeon: local })?.orkeon['Llm']).toEqual(change.orkeon['Llm']);
    // a key replaced: the window set by hand for that model stays
    const byHand = { Llm: { ...(change.orkeon['Llm'] as object), ContextWindowTokens: 400000 } };
    expect(applyKeys({ ...change, orkeon: byHand }, request).orkeon['Llm']).toEqual(byHand.Llm);
  });

  it('a state file that is not one is the empty state', () => {
    expect(parseSetupState('x')).toEqual(EMPTY_SETUP_STATE);
    expect(parseSetupState({ keys: ['OK', 3, 'not a name'], previousLlm: [], saved: 'yes', llm: { Model: 'm' } })).toEqual({ keys: ['OK'], previousLlm: null, previousRateLimiting: null, saved: false, llm: null });
  });

  it('subscription with nothing set up changes nothing', () => {
    const change = applySubscription({ local: { env: { MINE: '1' } }, orkeon: OLLAMA, state: EMPTY_SETUP_STATE });
    expect(change.local).toEqual({ env: { MINE: '1' } });
    expect(change.orkeon).toEqual(OLLAMA);
  });

  it('the status says a key variable the settings name is missing', () => {
    const files = { local: {}, orkeon: { Llm: { Model: 'gpt', BaseUrl: 'https://api.openai.com/v1', ApiKeyEnvVar: 'OPENAI_API_KEY' } }, state: EMPTY_SETUP_STATE };
    expect(setupStatus(files, () => false)).toMatchObject({ mode: 'subscription', keyVariable: 'OPENAI_API_KEY', keyMissing: true });
    expect(setupStatus(files, (name) => name === 'OPENAI_API_KEY').keyMissing).toBe(false);
  });
});

describe('Setup', () => {
  it('status of a fresh workshop: subscription, the local model, nothing written', async () => {
    const { files, setup } = workshop();
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    const report = await setup.status();
    expect(report).toMatchObject({ mode: 'subscription', keys: [], claudeOnKey: false, model: 'qwen3:8b', baseUrl: 'http://localhost:11434', keyVariable: null, keyMissing: false, remote: false });
    expect(report.paths).toEqual({ local: LOCAL, state: STATE, orkeon: ORKEON });
    expect(await files.exists(LOCAL)).toBe(false);
  });

  it('keys: the key goes to the env block, owner only, beside what the file held; Orkeon gets the name', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(LOCAL, JSON.stringify({ env: { HARNESS_CONTEXT_LOG: '1' }, permissions: { allow: ['Bash(*)'] } }));
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    const result = await setup.keys({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(await json(LOCAL)).toEqual({ env: { HARNESS_CONTEXT_LOG: '1', WORKSHOP_ANTHROPIC_API_KEY: KEY }, permissions: { allow: ['Bash(*)'] } });
    expect(files.isOwnerOnly(LOCAL)).toBe(true);
    expect(await json(ORKEON)).toEqual({ Llm: { Model: 'claude-sonnet-5-5', BaseUrl: 'https://api.anthropic.com', TimeoutSeconds: 600, ApiKeyEnvVar: 'WORKSHOP_ANTHROPIC_API_KEY' } });
    expect(result.lines.join('\n')).toContain('one-request-at-a-time bound of the local model is lifted');
    expect(await files.readText(ORKEON)).not.toContain(KEY);
    expect(await files.readText(STATE)).not.toContain(KEY);
    expect(result.lines.join('\n')).not.toContain(KEY);
    expect(result.report).toMatchObject({ mode: 'keys', keys: ['WORKSHOP_ANTHROPIC_API_KEY'], claudeOnKey: false, remote: true, keyMissing: false });
  });

  it('keys with --claude-on-key writes ANTHROPIC_API_KEY and says Claude Code is on the key', async () => {
    const { setup } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    const result = await setup.keys({ provider: 'anthropic', model: 'claude-sonnet-5-5', claudeOnKey: true });
    expect(result.report).toMatchObject({ keys: ['ANTHROPIC_API_KEY'], claudeOnKey: true });
    expect(result.lines.join('\n')).toContain('bills the API account');
  });

  it('keys without a key in the environment writes nothing', async () => {
    const { files, setup } = workshop();
    await expect(setup.keys({ provider: 'openai', model: 'gpt' })).rejects.toBeInstanceOf(ApplicationError);
    expect(await files.exists(LOCAL)).toBe(false);
  });

  it('subscription after keys: the key goes, the user\'s own env stays, Orkeon is back on what it had', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(LOCAL, JSON.stringify({ env: { MINE: '1' } }));
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    await setup.keys({ provider: 'openai', model: 'gpt' });
    await setup.keys({ provider: 'mistral', model: 'large' });
    expect((await setup.status()).keys).toEqual(['MISTRAL_API_KEY', 'OPENAI_API_KEY']);
    const result = await setup.subscription();
    expect(await json(LOCAL)).toEqual({ env: { MINE: '1' } });
    expect(await json(ORKEON)).toEqual(OLLAMA);
    expect(result.report).toMatchObject({ mode: 'subscription', keys: [], remote: false });
    expect(result.lines[0]).toContain('removed MISTRAL_API_KEY, OPENAI_API_KEY');
  });

  it('subscription when Orkeon had no settings before keys removes the Llm section it wrote', async () => {
    const { setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    await setup.keys({ provider: 'openai', model: 'gpt' });
    const result = await setup.subscription();
    expect(await json(ORKEON)).toEqual({});
    expect(await json(LOCAL)).toEqual({});
    expect(result.lines.join('\n')).toContain('orkeon init --provider ollama');
  });

  it('apply: a new container, whose settings are the local model\'s again, gets the choice of setup keys back; then nothing more', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    await setup.keys({ provider: 'openai', model: 'gpt' });
    expect((await setup.apply()).lines).toEqual([]);
    const fresh = { Llm: { Model: 'qwen3:14b', BaseUrl: 'http://localhost:11434', TimeoutSeconds: 600 } };
    await files.writeText(ORKEON, JSON.stringify(fresh));
    const result = await setup.apply();
    expect(result.lines.join('\n')).toContain('put back on what setup keys chose (gpt at https://api.openai.com/v1, key variable OPENAI_API_KEY)');
    expect(result.lines.join('\n')).not.toContain(KEY);
    expect(await json(ORKEON)).toEqual({ Llm: { Model: 'gpt', BaseUrl: 'https://api.openai.com/v1', TimeoutSeconds: 600, ApiKeyEnvVar: 'OPENAI_API_KEY' } });
    expect((await setup.apply()).lines).toEqual([]);
    await setup.subscription();
    expect(await json(ORKEON)).toEqual(fresh);
    expect((await setup.apply()).lines).toEqual([]);
  });

  it('apply does nothing in a workshop that never ran setup keys, or whose key is gone from the env block', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    expect((await setup.apply()).lines).toEqual([]);
    expect(await files.exists(LOCAL)).toBe(false);
    await setup.keys({ provider: 'openai', model: 'gpt' });
    await files.writeText(LOCAL, '{}');
    await files.writeText(ORKEON, JSON.stringify(OLLAMA));
    expect((await setup.apply()).lines).toEqual([]);
    expect(await json(ORKEON)).toEqual(OLLAMA);
    expect(reapplyKeys({ local: {}, orkeon: {}, state: EMPTY_SETUP_STATE })).toBeNull();
  });

  it('apply keeps what subscription gives back when the settings it finds are setup\'s own, edited by hand', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(ORKEON, JSON.stringify(OLLAMA));
    await setup.keys({ provider: 'openai', model: 'gpt-a' });
    const edited = await json(ORKEON);
    (edited['Llm'] as Record<string, unknown>)['Model'] = 'gpt-b';
    await files.writeText(ORKEON, JSON.stringify(edited));
    await setup.apply();
    await setup.subscription();
    expect(await json(ORKEON)).toEqual(OLLAMA);
  });

  it('keys for anthropic without --claude-on-key, after one with it, takes ANTHROPIC_API_KEY back out: Claude Code returns to the plan', async () => {
    const { setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    await setup.keys({ provider: 'anthropic', model: 'm', claudeOnKey: true });
    const result = await setup.keys({ provider: 'anthropic', model: 'm' });
    expect(await json(LOCAL)).toEqual({ env: { WORKSHOP_ANTHROPIC_API_KEY: KEY } });
    expect(result.report).toMatchObject({ keys: ['WORKSHOP_ANTHROPIC_API_KEY'], claudeOnKey: false });
    expect(result.lines.join('\n')).toContain('stays on its sign-in');
  });

  it('a user\'s own ANTHROPIC_API_KEY is left alone, and the line says Claude Code is on it', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(LOCAL, JSON.stringify({ env: { ANTHROPIC_API_KEY: 'theirs' } }));
    const result = await setup.keys({ provider: 'openai', model: 'gpt' });
    expect((await json(LOCAL))['env']).toEqual({ ANTHROPIC_API_KEY: 'theirs', OPENAI_API_KEY: KEY });
    expect(result.lines.join('\n')).toContain('bills the API account');
    await setup.subscription();
    expect(await json(LOCAL)).toEqual({ env: { ANTHROPIC_API_KEY: 'theirs' } });
  });

  it('a settings file that is not JSON is refused without a word of its content, and an env block that is not an object is never replaced', async () => {
    const { files, setup } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    files.addFile(LOCAL, '{"env":{"OPENAI_API_KEY":sk-LEAKME1234567890}}');
    const message = await setup.status().then(() => 'accepted', (error: unknown) => (error as Error).message);
    expect(message).toContain('is not valid JSON');
    expect(message).not.toContain('LEAKME');
    await files.writeText(LOCAL, '{"env":"oops"}');
    await expect(setup.keys({ provider: 'openai', model: 'gpt' })).rejects.toThrow('env block of .claude/settings.local.json is not an object');
    expect(await files.readText(LOCAL)).toBe('{"env":"oops"}');
  });

  it('keys lifts the one-request-at-a-time bound of the local model and keeps the other rate limits; subscription gives the section back', async () => {
    const { files, setup, json } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    const local = { Llm: { Model: 'qwen3:8b', BaseUrl: 'http://localhost:11434' }, RateLimiting: { MaxConcurrentRequests: 1, QueueLimit: 32, GlobalRequestsPerMinute: 60 } };
    files.addFile(ORKEON, JSON.stringify(local));
    await setup.keys({ provider: 'openai', model: 'gpt' });
    expect((await json(ORKEON))['RateLimiting']).toEqual({ GlobalRequestsPerMinute: 60 });
    await setup.subscription();
    expect(await json(ORKEON)).toEqual(local);
  });

  it('writes under --root, a relative one resolved from the current directory', async () => {
    const { files, setup } = workshop({ [SETUP_KEY_VARIABLE]: KEY });
    await setup.keys({ provider: 'openai', model: 'gpt' }, 'checkout');
    expect(await files.exists('/home/tester/work/checkout/.claude/settings.local.json')).toBe(true);
    expect(await files.exists(LOCAL)).toBe(false);
  });

  it('refuses a settings file that is not an object', async () => {
    const { files, setup } = workshop();
    files.addFile(LOCAL, '[]');
    await expect(setup.status()).rejects.toThrow('is not a JSON object');
  });
});
