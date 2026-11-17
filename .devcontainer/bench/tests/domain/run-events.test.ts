import { describe, expect, it } from 'vitest';

import { decisionFailureOf, parseRunEvents } from '../../src/domain/run-events.js';
import { fixture } from '../fakes/fixture-team.js';

const line = (event: Record<string, unknown>): string => JSON.stringify({ v: 2, ...event });

describe('parseRunEvents', () => {
  it('reads a run: tasks, tool calls and their results, the finish', () => {
    const events = parseRunEvents(
      [
        line({ kind: 'run.started', target: 'crew' }),
        line({ kind: 'task.started', agentId: 'Reader' }),
        line({ kind: 'tool.called', correlationId: 'a', toolName: 'file_read' }),
        line({ kind: 'tool.returned', correlationId: 'a', toolName: 'file_read', success: true }),
        line({ kind: 'tool.called', correlationId: 'b', toolName: 'file_write' }),
        line({ kind: 'tool.returned', correlationId: 'b', toolName: 'file_write', success: false }),
        line({ kind: 'delegation.started', correlationId: 'c', toRole: 'Writer' }),
        line({ kind: 'agent.spawned', correlationId: 'd', role: 'Helper' }),
        line({ kind: 'tool.called', toolName: 'list_mounts' }),
        line({ kind: 'tool.returned', correlationId: 'zzz', success: true }),
        line({ kind: 'input.needed', correlationId: 'e' }),
        line({ kind: 'task.completed', agentId: 'Reader', agentRole: 'Reader', success: true, skipped: false }),
        line({ kind: 'task.completed', agentId: 'graph', success: false, skipped: true }),
        line({ kind: 'cost.updated', tokens: 3 }),
        line({ kind: 'run.finished', success: true, exitCode: 0, promptTokens: 30, completionTokens: 15.4, durationMs: 2119 }),
        '',
      ].join('\n'),
    );
    expect(events.finished).toEqual({ success: true, exitCode: 0, promptTokens: 30, completionTokens: 15, durationMs: 2119, cappedTasks: 0, missingDeliverables: 0, waitingForInput: false });
    expect(events.tasks.map(({ role, success, skipped }) => ({ role, success, skipped }))).toEqual([
      { role: 'Reader', success: true, skipped: false },
      { role: 'graph', success: false, skipped: true },
    ]);
    expect(events.toolCalls).toEqual([
      { tool: 'file_read', success: true },
      { tool: 'file_write', success: false },
      { tool: 'delegate_work_to_coworker', success: null },
      { tool: 'spawn_agent', success: null },
      { tool: 'list_mounts', success: null },
    ]);
    expect(events.humanInputs).toBe(1);
    expect(events.errors).toEqual([]);
    expect(events.malformed).toBe(0);
    expect(events.cost).toEqual({ tokens: 3, promptTokens: 0, completionTokens: 0, model: null, provider: null });
  });

  it('keeps the last cost.updated, the cumulative figures of the run, and none when nothing was metered', () => {
    const events = parseRunEvents(fixture('runs/with-cost.events.jsonl'));
    expect(events.cost).toEqual({ tokens: 3468, promptTokens: 3353, completionTokens: 115, model: 'stub-model', provider: 'OpenAI' });
    expect(events.finished).toMatchObject({ promptTokens: 3353, completionTokens: 115 });
    expect(parseRunEvents(line({ kind: 'run.finished', success: true, exitCode: 0 })).cost).toBeNull();
  });

  it('keeps the errors, counts what is not an event, and has no finish for a killed run', () => {
    const events = parseRunEvents(
      [line({ kind: 'error', code: 'crew_failed', message: 'Task x failed' }), line({ kind: 'error', code: 'crew_cancelled' }), line({ kind: 'error' }), 'Unhandled exception.', '[1, 2]', '\r'].join('\r\n'),
    );
    expect(events.errors).toEqual(['Task x failed', 'crew_cancelled', 'error']);
    expect(events.malformed).toBe(2);
    expect(events.finished).toBeNull();
  });

  it('reads a finish without counts as zeros', () => {
    expect(parseRunEvents(line({ kind: 'run.finished', success: false, exitCode: 2, promptTokens: 'x', durationMs: -1 })).finished).toEqual({
      success: false,
      exitCode: 2,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: 0,
      cappedTasks: 0,
      missingDeliverables: 0,
      waitingForInput: false,
    });
  });

  it('reads the iteration cap and the missing deliverables of Orkeon 1.2.0, and a run that waits for an answer (exit 75)', () => {
    const events = parseRunEvents(
      [
        line({ kind: 'graph.node.entered', node: 'draft', visit: 1, task: 'draft' }),
        line({ kind: 'llm.fallback', profile: 'main', from: 'main', to: 'spare', reason: 'timeout' }),
        line({ kind: 'task.completed', taskId: 't1', agentRole: 'Writer', success: true, skipped: false, endedOnIterationCap: true, deliverableMissing: true }),
        line({ kind: 'task.completed', taskId: 't2', agentRole: 'Reader', success: true, skipped: false, endedOnIterationCap: false, deliverableMissing: false }),
        line({ kind: 'task.completed', taskId: 't3', agentRole: 'Old', success: true, skipped: false }),
        line({ kind: 'run.finished', success: false, exitCode: 75, status: 'waiting_for_input', requestId: 'q1', cappedTasks: 1, missingDeliverables: 1 }),
      ].join('\n'),
    );
    expect(events.malformed).toBe(0);
    expect(events.tasks.map(({ taskId, endedOnIterationCap, deliverableMissing }) => ({ taskId, endedOnIterationCap, deliverableMissing }))).toEqual([
      { taskId: 't1', endedOnIterationCap: true, deliverableMissing: true },
      { taskId: 't2', endedOnIterationCap: false, deliverableMissing: false },
      { taskId: 't3', endedOnIterationCap: false, deliverableMissing: false },
    ]);
    expect(events.finished).toMatchObject({ success: false, exitCode: 75, cappedTasks: 1, missingDeliverables: 1, waitingForInput: true });
  });
});

describe('parseRunEvents on streams recorded from orkeon run (a build of fb26364, the simulated LLM)', () => {
  it('reads a run that succeeded although one tool call was refused', () => {
    const events = parseRunEvents(fixture('runs/stub-refused-write.events.jsonl'));
    expect(events.finished).toEqual({ success: true, exitCode: 0, promptTokens: 3353, completionTokens: 115, durationMs: 1432, cappedTasks: 0, missingDeliverables: 0, waitingForInput: false });
    expect(events.tasks.map(({ role, success, skipped }) => ({ role, success, skipped }))).toEqual([
      { role: 'Reader', success: true, skipped: false },
      { role: 'Writer', success: true, skipped: false },
    ]);
    expect(events.toolCalls).toEqual([
      { tool: 'file_read', success: true },
      { tool: 'file_write', success: false },
      { tool: 'file_read', success: true },
    ]);
    expect(events).toMatchObject({ humanInputs: 0, errors: [], malformed: 0 });
  });

  it('reads a run whose crew failed: the failed task, the error, exit code 2', () => {
    const events = parseRunEvents(fixture('runs/stub-crew-failed.events.jsonl'));
    expect(events.finished).toMatchObject({ success: false, exitCode: 2 });
    expect(events.tasks.map(({ role, success, skipped }) => ({ role, success, skipped }))).toEqual([
      { role: 'Reader', success: true, skipped: false },
      { role: 'Writer', success: false, skipped: false },
    ]);
    expect(events.toolCalls.map((call) => `${call.tool}:${String(call.success)}`)).toEqual(['file_read:true', 'file_write:false', 'file_write:false', 'file_write:false']);
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0]).toContain('(Writer) failed: The agent did not produce a final answer within the allowed iterations');
    expect(events.malformed).toBe(0);
  });
});

describe('decisionFailureOf', () => {
  const DOWN = 'kev could not be reached at http://127.0.0.1:9/v1: Connection refused (127.0.0.1:9)';
  const run = (...events: Record<string, unknown>[]) => parseRunEvents(events.map(line).join('\n'));
  const decisionTask = (success = false) => ({ kind: 'task.completed', taskId: 'route', agentId: 'route', agentRole: 'decision', isDecision: true, success, skipped: false });
  const writerFailed = { kind: 'task.completed', taskId: 'write', agentId: 'Writer', agentRole: 'Writer', success: false, skipped: false };
  const crewFailed = (message: string) => ({ kind: 'error', code: 'crew_failed', message });
  const BLOCK = "Task write (Writer) failed: Blocked by the decision stage 'guard' of profile 'strict': the request matches the risk 'secret_leak' at 0.95";

  it('classes a decision task its provider failed to answer as decision_provider, cause unreachable', () => {
    const events = run(
      decisionTask(),
      { kind: 'task.completed', taskId: 'write', agentId: 'Writer', agentRole: 'Writer', success: false, skipped: true },
      crewFailed(`Task route (decision) failed: ${DOWN}; Task write (Writer) skipped: an upstream task failed`),
      { kind: 'run.finished', success: false, exitCode: 2 },
    );
    expect(decisionFailureOf(events)).toEqual({ kind: 'decision_provider', cause: 'unreachable', detail: `Task route (decision) failed: ${DOWN}` });
    for (const reason of ['kev did not answer within 30 s at http://127.0.0.1:8009/v1 (Orkeon:Kev:TimeoutSeconds).', 'typesafe rate limit reached (429) after the retries.', 'liquid is overloaded (529) after the retries.', 'kev answered 503: busy']) {
      expect(decisionFailureOf(run(decisionTask(), crewFailed(`Task route (decision) failed: ${reason}`)))).toMatchObject({ kind: 'decision_provider', cause: 'unreachable' });
    }
  });

  it('classes a refused or missing key as decision_provider, cause key', () => {
    for (const reason of ['typesafe refused the key: set TYPESAFE_API_KEY or Orkeon:TypeSafe:ApiKey.', 'No liquid API key: set the environment variable LIQUID_API_KEY, or Orkeon:Liquid:ApiKey.']) {
      expect(decisionFailureOf(run(decisionTask(), crewFailed(`Task route (decision) failed: ${reason}`)))).toMatchObject({ kind: 'decision_provider', cause: 'key' });
    }
  });

  it('leaves to the team a decision request the team built wrong: invalid, 400/422, a state over the context limit', () => {
    for (const reason of [
      'Invalid decision request: questions[0].options must hold at least two options',
      'kev refused the request: options: field required',
      'typesafe refused the request: the state is over the model\'s context limit (32000 tokens); set long context on the task to use 128000.',
      'kev answered 302: moved',
    ]) {
      expect(decisionFailureOf(run(decisionTask(), crewFailed(`Task route (decision) failed: ${reason}`)))).toBeNull();
    }
  });

  it('classes a call a decision stage blocked as decision_blocked, read at the start of the failed task\'s reason', () => {
    expect(decisionFailureOf(run(writerFailed, crewFailed(BLOCK)))).toEqual({ kind: 'decision_blocked', detail: BLOCK });
  });

  it('is not fooled by a block quoted further on, nor by a part whose task the stream does not show failing', () => {
    const quoted = "Task write (Writer) failed: Tool 'file_write' failed: Blocked by the decision stage 'guard' of profile 'strict': the request matches the risk 'x' at 1";
    expect(decisionFailureOf(run(writerFailed, crewFailed(quoted)))).toBeNull();
    expect(decisionFailureOf(run(crewFailed(BLOCK)))).toBeNull();
  });

  it('classes a fail-closed stage by its cause: the provider down is decision_provider, a bad request the team', () => {
    const closed = (cause: string) => run(writerFailed, crewFailed(`Task write (Writer) failed: Blocked by the decision stage 'guard' of profile 'strict': the decision stage failed and the profile is fail-closed: ${cause}`));
    expect(decisionFailureOf(closed(DOWN))).toMatchObject({ kind: 'decision_provider', cause: 'unreachable' });
    expect(decisionFailureOf(closed('Invalid decision request: state is empty'))).toBeNull();
  });

  it('classes the LLM judge (Orkeon:Guardian:Llm, Orkeon 1.2.0): unavailable and fail-closed by its cause, a risk it found as decision_blocked, the guardian\'s own rules as the team\'s', () => {
    const judged = (verdict: string) => run(writerFailed, crewFailed(`Task write (Writer) failed: Blocked by Guardian (input): ${verdict}`));
    // The sentence of the published CLI, a refused key.
    const refusedKey = 'the decision model could not judge the input: typesafe refused the key: set TYPESAFE_API_KEY or Orkeon:TypeSafe:ApiKey. (TypeSafe request req_01)';
    expect(decisionFailureOf(judged(refusedKey))).toEqual({ kind: 'decision_provider', cause: 'key', detail: `Task write (Writer) failed: Blocked by Guardian (input): ${refusedKey}` });
    expect(decisionFailureOf(judged(`the decision model could not judge the input: ${DOWN}`))).toMatchObject({ kind: 'decision_provider', cause: 'unreachable' });
    expect(decisionFailureOf(run(writerFailed, crewFailed(`Task write (Writer) failed: Blocked by Guardian (output): the decision model could not judge the output: ${DOWN}`)))).toMatchObject({ kind: 'decision_provider', cause: 'unreachable' });
    expect(decisionFailureOf(judged("The input matches the risk 'prompt_injection' at 0.93."))).toMatchObject({ kind: 'decision_blocked' });
    expect(decisionFailureOf(judged('the decision model could not judge the input: Invalid decision request: state is empty'))).toBeNull();
    expect(decisionFailureOf(judged('the input of 400000 characters is longer than the 200000 characters the judge reads in full (fail mode: Closed)'))).toBeNull();
    expect(decisionFailureOf(judged('prompt injection pattern detected'))).toBeNull();
    // Quoted further on in an ordinary failure, it is no judge's sentence.
    expect(decisionFailureOf(run(writerFailed, crewFailed(`Task write (Writer) failed: the model wrote "Blocked by Guardian (input): the decision model could not judge the input: ${DOWN}"`)))).toBeNull();
  });

  it('classes a parallel run where a team failure sits next to a provider failure as team, listing the provider failure', () => {
    const events = run(decisionTask(), writerFailed, crewFailed(`Task route (decision) failed: ${DOWN}; Task write (Writer) failed: The agent did not produce a final answer within the allowed iterations`));
    const failure = decisionFailureOf(events);
    expect(failure?.kind).toBe('team');
    expect(failure?.detail).toContain(`decision_provider: Task route (decision) failed: ${DOWN}`);
  });

  it('reads a script that did not catch the block from stderr, only without an error event and only on Orkeon\'s own line', () => {
    const stderr = "Script rejected with: DecisionBlockedError: Blocked by the decision stage 'guard' of profile 'strict': the request matches the risk 'x' at 0.9";
    expect(decisionFailureOf(run({ kind: 'run.finished', success: false, exitCode: 1 }), stderr)).toEqual({ kind: 'decision_blocked', detail: stderr });
    expect(decisionFailureOf(run({ kind: 'run.finished', success: false, exitCode: 1 }), `log: the input said ${stderr}`)).toBeNull();
    expect(decisionFailureOf(run(writerFailed, crewFailed('Task write (Writer) failed: boom')), stderr)).toBeNull();
  });

  it('leaves an ordinary failure to the team', () => {
    const events = parseRunEvents(fixture('runs/stub-crew-failed.events.jsonl'));
    expect(decisionFailureOf(events, 'some stderr')).toBeNull();
  });

  it('keeps the decision model out of the run model: a decision cost names no model', () => {
    const events = run(
      { kind: 'cost.updated', tokens: 10, promptTokens: 8, completionTokens: 2, model: 'stub-model', provider: 'ollama' },
      { kind: 'cost.updated', tokens: 12, promptTokens: 9, completionTokens: 3, model: 'kev-fake', provider: 'kev', operation: 'decision' },
    );
    expect(events.cost).toMatchObject({ model: 'stub-model', provider: 'ollama' });
  });
});
