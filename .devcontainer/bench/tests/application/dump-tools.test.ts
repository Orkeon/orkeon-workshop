import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../src/application/errors.js';
import { DumpTools } from '../../src/application/use-cases/dump-tools.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeLlmRecorder } from '../fakes/fake-llm-recorder.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const REQUEST = {
  tools: [
    { type: 'function', function: { name: 'file_read', description: 'Read.', parameters: { properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'file_write', description: 'Write.' } },
  ],
};

function setup(commands: Record<string, ReturnType<typeof succeeded>>, recorded: unknown[] = [REQUEST], variables: Record<string, string> = {}) {
  const processes = new FakeProcessRunner(commands);
  const files = new InMemoryFileSystem();
  const recorder = new FakeLlmRecorder(recorded);
  const dumpTools = new DumpTools(processes, files, new FakeEnvironment(variables), recorder);
  return { processes, files, recorder, dumpTools };
}

const LISTED = { 'orkeon run --list-tools': succeeded('file_read\nfile_write\n'), 'orkeon run crew': succeeded('OK\n') };

describe('DumpTools', () => {
  it('runs a throw-away crew against the recorder and returns the recorded schemas', async () => {
    const { processes, files, recorder, dumpTools } = setup(LISTED, [{ messages: [] }, REQUEST]);
    const dump = await dumpTools.execute();
    expect(dump.tools.map((tool) => tool.name)).toEqual(['file_read', 'file_write']);
    expect(dump.missing).toEqual([]);
    expect(processes.calls.map((call) => [call.command, ...call.args].join(' '))).toEqual(['orkeon run --list-tools', 'orkeon run crew']);
    expect(processes.options[1]?.cwd).toBe('/tmp/orkeon-tool-dump-1');
    expect(recorder.started).toBe(1);
    expect(recorder.stopped).toBe(1);
    expect(files.removed).toEqual(['/tmp/orkeon-tool-dump-1']);
    expect(await files.exists('/tmp/orkeon-tool-dump-1/crew/agents/recorder.yaml')).toBe(false);
  });

  it('points the run at the recorder and drops the caller own model settings', async () => {
    const { processes, dumpTools } = setup(LISTED, [REQUEST], {
      PATH: '/usr/bin',
      ORKEON_Llm__BaseUrl: 'https://api.example.com',
      ORKEON_Llm__ApiKey: 'secret',
      ORKEON_LLM__MODEL: 'gpt-x',
    });
    await dumpTools.execute();
    expect(processes.options[1]?.env).toEqual({
      PATH: '/usr/bin',
      ORKEON_Llm__BaseUrl: 'http://127.0.0.1:43210/v1',
      ORKEON_Llm__Model: 'stub-model',
      ORKEON_Llm__ApiKey: 'stub',
    });
  });

  it('names the listed tools that never reached the model', async () => {
    const { dumpTools } = setup({ ...LISTED, 'orkeon run --list-tools': succeeded('file_read\nfile_write\nweb_search\n') });
    expect((await dumpTools.execute()).missing).toEqual(['web_search']);
  });

  it('fails when orkeon is missing or cannot list its tools', async () => {
    await expect(setup({}).dumpTools.execute()).rejects.toThrow(new ApplicationError('process-failed', 'orkeon not found on PATH'));
    await expect(setup({ 'orkeon run --list-tools': failed(1, 'boom\nbad settings\n') }).dumpTools.execute()).rejects.toThrow(
      'orkeon run --list-tools failed (exit 1: bad settings)',
    );
  });

  it('fails, and still cleans up, when the run sends no request with tools', async () => {
    const { files, recorder, dumpTools } = setup({ ...LISTED, 'orkeon run crew': failed(1, 'Crew configuration references unknown tool(s): x') }, [{ messages: [] }]);
    await expect(dumpTools.execute()).rejects.toThrow('orkeon run crew sent no request with tools (exit 1: Crew configuration references unknown tool(s): x)');
    expect(recorder.stopped).toBe(1);
    expect(files.removed).toEqual(['/tmp/orkeon-tool-dump-1']);
  });
});
