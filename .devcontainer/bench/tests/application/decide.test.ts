import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import type { ProcessResult } from '../../src/application/ports/process-runner.js';
import { Decide, type DecideRequest } from '../../src/application/use-cases/decide.js';
import { DEFAULT_MAX_CONTEXT_BYTES, capContext } from '../../src/domain/decide.js';
import { DomainError } from '../../src/domain/errors.js';
import type { Adapters } from '../../src/infrastructure/node-adapters.js';
import { EXIT } from '../../src/interface/exit-codes.js';
import { createProgram } from '../../src/interface/program.js';
import { createServices } from '../../src/interface/services.js';
import { Session } from '../../src/interface/session.js';
import { StoreCompressor } from '../fakes/fake-compressor.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeHttpProbe } from '../fakes/fake-http-probe.js';
import { FakeLlmRecorder } from '../fakes/fake-llm-recorder.js';
import { FakeLlmStub, FakeShutdownSignal } from '../fakes/fake-llm-stub.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { FakeSchemaValidator } from '../fakes/fake-schema-validator.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';
import { RecordingOutput } from '../fakes/recording-output.js';

const KEV = { ORKEON_Orkeon__Decision__Provider: 'kev', ORKEON_Orkeon__Kev__BaseUrl: 'http://127.0.0.1:8009/v1' };

/** The event stream of a decision task Kev answered (`orkeon run --events jsonl`, Orkeon c727c06, kev-4b). */
function answered(decision: unknown): string {
  return [
    { v: 2, seq: 1, kind: 'run.started', target: 'crew' },
    { v: 2, seq: 2, kind: 'task.started', agentId: 'decision', taskId: '01M6C1R4JTF0BJT6XCTX8G2Y4Q', agentRole: 'decision' },
    { v: 2, seq: 3, kind: 'cost.updated', tokens: 89, promptTokens: 37, completionTokens: 52, model: 'kev-latest', provider: 'kev', operation: 'decision' },
    { v: 2, seq: 4, kind: 'task.completed', agentId: 'decision', taskId: '01M6C1R4JTF0BJT6XCTX8G2Y4Q', agentRole: 'decision', success: true, skipped: false, defaulted: false, isDecision: true, decision: JSON.stringify(decision) },
    { v: 2, seq: 5, kind: 'run.finished', success: true, exitCode: 0 },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');
}

const DOWN: ProcessResult = {
  found: true,
  exitCode: 2,
  stdout: [
    { kind: 'task.completed', agentRole: 'decision', success: false, skipped: false, defaulted: false, isDecision: true },
    { kind: 'error', code: 'crew_failed', message: 'Task 01M (decision) failed: kev could not be reached at http://127.0.0.1:8019/v1: Connection refused (127.0.0.1:8019)' },
    { kind: 'run.finished', success: false, exitCode: 2 },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n'),
  stderr: 'ERROR: Task 01M (decision) failed: kev could not be reached\n',
};

const CIRCUIT_OFF: ProcessResult = {
  found: true,
  exitCode: 2,
  stdout: JSON.stringify({ kind: 'error', code: 'crew_failed', message: "Decision task 'decide' has neither a fallback nor an otherwise task." }),
  stderr: "ERROR: Decision task 'decide' has neither a fallback nor an otherwise task.\n",
};

function setup(variables: Record<string, string>, result: ProcessResult = succeeded('')) {
  const files = new InMemoryFileSystem();
  const written: Record<string, string> = {};
  const writeText = files.writeText.bind(files);
  files.writeText = async (path: string, content: string) => {
    written[path] = content;
    await writeText(path, content);
  };
  const processes = new FakeProcessRunner({ 'orkeon run crew': result });
  return { files, written, processes, decide: new Decide(processes, files, new FakeEnvironment(variables)) };
}

const CHOICE: DecideRequest = { kind: 'choice', question: 'Classify the ticket', options: [{ name: 'bug', description: 'a defect' }, { name: 'billing', description: 'an invoice question' }] };

describe('Decide', () => {
  it('without a decision provider, answers no-model and never starts orkeon', async () => {
    const { decide, processes, files } = setup({ PATH: '/usr/bin' });
    const outcome = await decide.execute(CHOICE);
    expect(outcome.status).toBe('no-model');
    expect(processes.calls).toEqual([]);
    expect(files.removed).toEqual(['/tmp/orkeon-bench-decide-1']);
  });

  it('a hosted provider is a paid remote call: no-model unless allowRemote', async () => {
    const result = answered({ answer: { chosen: 'bug', probabilities: { bug: 0.9, billing: 0.1 }, confidence: 0.8 } });
    const refused = setup({ TYPESAFE_API_KEY: 'k' }, succeeded(result));
    const outcome = await refused.decide.execute(CHOICE);
    expect(outcome).toEqual({ status: 'no-model', reason: expect.stringContaining('TypeSafe at https://api.typesafe.ai/v1 is remote') });
    expect(refused.processes.calls).toEqual([]);
    const allowed = setup({ TYPESAFE_API_KEY: 'k' }, succeeded(result));
    expect((await allowed.decide.execute({ ...CHOICE, allowRemote: true })).status).toBe('answered');
  });

  it('writes a crew of one agent and one decision task without a fallback, and runs it with the events', async () => {
    const { decide, processes, written } = setup(KEV, succeeded(answered({ answer: { chosen: 'billing', probabilities: { bug: 0.1647, billing: 0.8353 }, confidence: 0.6706 } })));
    const outcome = await decide.execute({ ...CHOICE, settingsFile: '/work/appsettings.json' });
    expect(processes.calls[0]?.args).toEqual(['run', 'crew', '--events', 'jsonl', '--settings', '/work/appsettings.json']);
    expect(processes.options[0]?.cwd).toBe('/tmp/orkeon-bench-decide-1');
    expect(processes.options[0]?.env).toBeUndefined();
    const task = parseYaml(written['/tmp/orkeon-bench-decide-1/crew/tasks/decide.yaml'] ?? '') as { decision: Record<string, unknown> };
    expect(task.decision).toEqual({ questions: { answer: { choice: { bug: 'a defect', billing: 'an invoice question' }, instructions: 'Classify the ticket' } } });
    expect(Object.keys(written).sort()).toEqual(['/tmp/orkeon-bench-decide-1/crew/agents/holder.yaml', '/tmp/orkeon-bench-decide-1/crew/config.yaml', '/tmp/orkeon-bench-decide-1/crew/tasks/decide.yaml']);
    expect(outcome).toEqual({ status: 'answered', answer: { kind: 'choice', answer: 'billing', confidence: 0.6706, probabilities: { bug: 0.1647, billing: 0.8353 }, provider: 'kev', model: 'kev-latest' } });
  });

  it('puts the context file under the question, and a noul question is its statement', async () => {
    const { decide, files, written } = setup(KEV, succeeded(answered({ answer: { chosen: 'no', probability: 0.4497, probabilities: {}, confidence: 0.5503 } })));
    files.addFile('/work/ticket.txt', 'Charged twice.\n');
    const outcome = await decide.execute({ kind: 'noul', question: 'The ticket is about money.', options: [], contextFile: '/work/ticket.txt' });
    const task = parseYaml(written['/tmp/orkeon-bench-decide-1/crew/tasks/decide.yaml'] ?? '') as { decision: Record<string, unknown> };
    expect(task.decision).toEqual({ questions: { answer: { noul: 'The ticket is about money.\n\nContext:\nCharged twice.' } } });
    expect(outcome).toEqual({
      status: 'answered',
      answer: { kind: 'noul', answer: 'no', confidence: 0.5503, probabilities: { yes: 0.4497, no: 0.5503 }, probability: 0.4497, provider: 'kev', model: 'kev-latest', context: { bytes: 14, original_bytes: 14, truncated: false } },
    });
  });

  it('cuts a context over --max-context-bytes (4096 by default) on a line boundary, and says so in the answer', async () => {
    const { decide, files, written } = setup(KEV, succeeded(answered({ answer: { chosen: 'yes', probability: 0.7, probabilities: {}, confidence: 0.7 } })));
    // A TEAM.md-sized file: 37 KB, which the local Kev answers 500 to.
    const big = Array.from({ length: 900 }, (_, index) => `line ${String(index).padStart(3, '0')} of the specification, some words`).join('\n');
    files.addFile('/work/TEAM.md', big);
    const outcome = await decide.execute({ kind: 'noul', question: 'It is a specification.', options: [], contextFile: '/work/TEAM.md' });
    const prompt = (parseYaml(written['/tmp/orkeon-bench-decide-1/crew/tasks/decide.yaml'] ?? '') as { decision: { questions: { answer: { noul: string } } } }).decision.questions.answer.noul;
    const context = prompt.slice(prompt.indexOf('Context:\n') + 'Context:\n'.length);
    expect(Buffer.byteLength(context)).toBeLessThanOrEqual(DEFAULT_MAX_CONTEXT_BYTES);
    expect(context.endsWith('some words')).toBe(true);
    expect(big.startsWith(context)).toBe(true);
    expect(outcome.status === 'answered' && outcome.answer.context).toEqual({ bytes: Buffer.byteLength(context), original_bytes: Buffer.byteLength(big), truncated: true });
    const small = setup(KEV, succeeded(answered({ answer: { chosen: 'yes', probability: 0.7, probabilities: {}, confidence: 0.7 } })));
    small.files.addFile('/work/TEAM.md', big);
    const capped = await small.decide.execute({ kind: 'noul', question: 'It is a specification.', options: [], contextFile: '/work/TEAM.md', maxContextBytes: 100 });
    expect(capped.status === 'answered' && capped.answer.context).toEqual({ bytes: 83, original_bytes: Buffer.byteLength(big), truncated: true });
  });

  it('names a score by its levels: the nearest level, the probabilities by level', async () => {
    const { decide } = setup(KEV, succeeded(answered({ answer: { score: 1.7968, probabilities: { '3': 0.1661, '1': 0.3141, '2': 0.4922, '0': 0.0276 }, confidence: 0.4646 } })));
    const levels = ['poor', 'fair', 'good', 'excellent'].map((name) => ({ name, description: name }));
    const outcome = await decide.execute({ kind: 'score', question: 'How good?', options: levels });
    expect(outcome).toEqual({
      status: 'answered',
      answer: { kind: 'score', answer: 'good', score: 1.7968, confidence: 0.4646, probabilities: { poor: 0.0276, fair: 0.3141, good: 0.4922, excellent: 0.1661 }, provider: 'kev', model: 'kev-latest' },
    });
  });

  it('a provider that cannot be reached is a failure with its reason', async () => {
    const { decide } = setup(KEV, DOWN);
    expect(await decide.execute(CHOICE)).toEqual({ status: 'failed', reason: expect.stringContaining('kev could not be reached') });
  });

  it('the decision circuit off at entry (Orkeon:Decision:Enabled=false) is no-model', async () => {
    const { decide } = setup(KEV, CIRCUIT_OFF);
    expect((await decide.execute(CHOICE)).status).toBe('no-model');
  });

  it('an answer outside the options, or settings Orkeon refuses, is a failure', async () => {
    const outside = setup(KEV, succeeded(answered({ answer: { chosen: 'other', confidence: 0.9 } })));
    expect((await outside.decide.execute(CHOICE)).status).toBe('failed');
    const refused = setup({ ORKEON_Orkeon__Decision__Provider: 'bogus' });
    expect(await refused.decide.execute(CHOICE)).toEqual({ status: 'failed', reason: expect.stringContaining("Orkeon:Decision:Provider is 'bogus'") });
    expect(refused.processes.calls).toEqual([]);
  });

  it('refuses a question Orkeon would refuse, and a missing context file', async () => {
    const { decide } = setup(KEV);
    await expect(decide.execute({ ...CHOICE, options: [{ name: 'bug', description: 'bug' }] })).rejects.toBeInstanceOf(DomainError);
    await expect(decide.execute({ ...CHOICE, options: [CHOICE.options[0]!, CHOICE.options[0]!] })).rejects.toThrow('--option given twice: bug');
    await expect(decide.execute({ kind: 'score', question: ' ', options: [] })).rejects.toThrow('--question is empty');
    await expect(decide.execute({ ...CHOICE, contextFile: '/nowhere.txt' })).rejects.toThrow('context file not found');
  });
});

async function cli(args: string[], variables: Record<string, string>, result: ProcessResult = failed(1, '')): Promise<{ code: number; output: RecordingOutput }> {
  const adapters: Adapters = {
    fileSystem: new InMemoryFileSystem(),
    processRunner: new FakeProcessRunner({ 'orkeon run crew': result }),
    httpProbe: new FakeHttpProbe({}),
    clock: new FixedClock(new Date('2026-11-01T12:00:00Z')),
    environment: new FakeEnvironment(variables),
    llmRecorder: new FakeLlmRecorder([]),
    llmStub: new FakeLlmStub([]),
    shutdownSignal: new FakeShutdownSignal(false),
    compressor: new StoreCompressor(),
    schemaValidator: new FakeSchemaValidator(),
  };
  const output = new RecordingOutput();
  const session = new Session(output);
  await createProgram(createServices(adapters), session).parseAsync(args, { from: 'user' });
  return { code: session.exitCode, output };
}

describe('orkeon-bench decide', () => {
  it('without a model: exit 4, one notice on stderr, nothing on stdout', async () => {
    const { code, output } = await cli(['decide', 'noul', '--question', 'It is about money.'], {});
    expect(code).toBe(EXIT.noDecisionModel);
    expect(code).toBe(4);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([expect.stringMatching(/^notice: no decision model: /)]);
  });

  it('answered: the JSON answer on stdout, exit 0', async () => {
    const { code, output } = await cli(['decide', 'choice', '--question', 'Which?', '--option', 'bug=a defect', '--option', 'billing'], KEV, succeeded(answered({ answer: { chosen: 'billing', probabilities: { bug: 0.2, billing: 0.8 }, confidence: 0.6 } })));
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(output.text)).toEqual({ kind: 'choice', answer: 'billing', confidence: 0.6, probabilities: { bug: 0.2, billing: 0.8 }, provider: 'kev', model: 'kev-latest' });
  });

  it('a provider down: exit 5, one error line, nothing on stdout', async () => {
    const { code, output } = await cli(['decide', 'score', '--question', 'How?', '--level', 'low', '--level', 'high'], KEV, DOWN);
    expect(code).toBe(EXIT.decisionFailed);
    expect(code).toBe(5);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([expect.stringMatching(/^error: the decision model failed: .*could not be reached/)]);
  });

  it('bad usage stays exit 2, a --max-context-bytes that is not a whole number of bytes included', async () => {
    expect((await cli(['decide', 'choice', '--question', 'Which?', '--option', 'one'], KEV)).code).toBe(EXIT.error);
    for (const bad of ['0', '-5', '4k', '1.5']) {
      const { code, output } = await cli(['decide', 'noul', '--question', 'It is.', '--max-context-bytes', bad], KEV);
      expect(code).toBe(EXIT.error);
      expect(output.stderr.join('\n')).toContain('--max-context-bytes takes a whole number of bytes');
    }
  });
});

describe('capContext', () => {
  it('keeps a context that fits, trimmed', () => {
    expect(capContext('  a\nb \n', 10)).toEqual({ text: 'a\nb', context: { bytes: 3, original_bytes: 3, truncated: false } });
  });

  it('cuts on the last line that fits whole, counting UTF-8 bytes', () => {
    // "é" is two bytes: "ab\ncé" is 6 bytes, over 5.
    expect(capContext('ab\ncé\nd', 5)).toEqual({ text: 'ab', context: { bytes: 2, original_bytes: 8, truncated: true } });
    expect(capContext('ab\ncé\nd', 6)).toEqual({ text: 'ab\ncé', context: { bytes: 6, original_bytes: 8, truncated: true } });
  });

  it('cuts a first line longer than the cap on a character, never inside one', () => {
    expect(capContext('ééé\nx', 5)).toEqual({ text: 'éé', context: { bytes: 4, original_bytes: 8, truncated: true } });
  });
});
