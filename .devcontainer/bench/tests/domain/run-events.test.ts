import { describe, expect, it } from 'vitest';

import { parseRunEvents } from '../../src/domain/run-events.js';
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
    expect(events.finished).toEqual({ success: true, exitCode: 0, promptTokens: 30, completionTokens: 15, durationMs: 2119 });
    expect(events.tasks).toEqual([
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
    });
  });
});

describe('parseRunEvents on streams recorded from orkeon run (a build of fb26364, the simulated LLM)', () => {
  it('reads a run that succeeded although one tool call was refused', () => {
    const events = parseRunEvents(fixture('runs/stub-refused-write.events.jsonl'));
    expect(events.finished).toEqual({ success: true, exitCode: 0, promptTokens: 3353, completionTokens: 115, durationMs: 1432 });
    expect(events.tasks).toEqual([
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
    expect(events.tasks).toEqual([
      { role: 'Reader', success: true, skipped: false },
      { role: 'Writer', success: false, skipped: false },
    ]);
    expect(events.toolCalls.map((call) => `${call.tool}:${String(call.success)}`)).toEqual(['file_read:true', 'file_write:false', 'file_write:false', 'file_write:false']);
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0]).toContain('(Writer) failed: The agent did not produce a final answer within the allowed iterations');
    expect(events.malformed).toBe(0);
  });
});
