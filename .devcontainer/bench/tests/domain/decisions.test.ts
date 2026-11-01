import { describe, expect, it } from 'vitest';

import { DECISION_TOOL, decisionCalls, decisionSummary, decisionTasksNamed } from '../../src/domain/decisions.js';
import { evaluateIndicators, measureOf } from '../../src/domain/indicators.js';
import { parseDecision, parseRunEvents, type RunEvents } from '../../src/domain/run-events.js';
import { judgeScenario, type ScenarioEvidence } from '../../src/domain/scenario-checks.js';
import { NO_FACTS, type ScenarioResult } from '../../src/domain/scenario-result.js';
import { parseScenario } from '../../src/domain/scenario.js';

// The task.completed events of Orkeon 0ea39d9 (VERIFICATIONS V-54): a decision task, a task it gated off, one it let run.
const ANSWERED = '{"route":{"chosen":"fix","probabilities":{"ignore":0.08,"fix":0.92},"confidence":0.92}}';
const DEFAULTED = '{"route":{"chosen":"ignore","probabilities":{"fix":0,"ignore":1},"confidence":1},"defaulted":true}';

function stream(decision: string, defaulted: boolean, extra: Record<string, unknown>[] = []): RunEvents {
  const chosen = defaulted ? 'ignore' : 'fix';
  const skippedRole = chosen === 'fix' ? 'Skipper' : 'Fixer';
  return parseRunEvents(
    [
      { kind: 'task.completed', taskId: '01M6AXJYQFGZA4SEFN6GN6GN00', agentId: 'decision', agentRole: 'decision', success: true, skipped: false, isDecision: true, defaulted, decision },
      { kind: 'task.completed', taskId: '01M6AXJYQFGZA4SEFN6GN6GN01', agentId: chosen === 'fix' ? 'fixer' : 'skipper', agentRole: chosen === 'fix' ? 'Fixer' : 'Skipper', success: true, skipped: false, isDecision: false, defaulted: false },
      {
        kind: 'task.completed',
        taskId: '01M6AXJYQFGZA4SEFN6GN6GN02',
        agentId: skippedRole.toLowerCase(),
        agentRole: skippedRole,
        success: false,
        skipped: true,
        isDecision: false,
        defaulted: false,
        skipReason: `condition of task 01M6AXJYQFGZA4SEFN6GN6GN02 did not hold on decision task triage: ${decision}`,
      },
      ...extra,
      { kind: 'run.finished', success: true, exitCode: 0 },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n'),
  );
}

function evidence(events: RunEvents): ScenarioEvidence {
  return { exitCode: 0, events, exchanges: [], files: new Map(), expected: new Map(), sameBytes: new Map(), schemaViolations: new Map(), stopped: null };
}

describe('decision events (D96)', () => {
  it('reads isDecision, defaulted, the answers and the skip reason of task.completed', () => {
    const [decision, , skipped] = stream(ANSWERED, false).tasks;
    expect(decision).toMatchObject({ taskId: '01M6AXJYQFGZA4SEFN6GN6GN00', role: 'decision', isDecision: true, defaulted: false, decision: [{ question: 'route', chosen: 'fix', confidence: 0.92 }], decisionUnparsed: false, skipReason: null });
    expect(skipped).toMatchObject({ role: 'Skipper', skipped: true, isDecision: false, decision: null });
    expect(skipped?.skipReason).toMatch(/^condition of task \S+ did not hold on decision task triage: /);
    expect(stream(DEFAULTED, true).tasks[0]?.decision).toEqual([{ question: 'route', chosen: 'ignore', confidence: 1 }]);
  });

  it('never guesses an answer it cannot read', () => {
    expect(parseDecision('{not json')).toBeNull();
    expect(parseDecision('"fix"')).toBeNull();
    expect(parseDecision({ route: { probabilities: { fix: 1 } } })).toBeNull();
    expect(parseDecision({ route: { chosen: 'fix', confidence: 'high' } })).toEqual([{ question: 'route', chosen: 'fix', confidence: null }]);
    const malformed = parseRunEvents(JSON.stringify({ kind: 'task.completed', isDecision: true, success: true, decision: '{"route":3}' }));
    expect(malformed.tasks[0]).toMatchObject({ isDecision: true, decision: null, decisionUnparsed: true });
  });

  it('sums up the decision tasks of a run, and counts its calls to the decision model', () => {
    expect(decisionSummary(stream(ANSWERED, false))).toEqual({ tasks: 1, defaulted: 0, confidence_min: 0.92 });
    expect(decisionSummary(stream(DEFAULTED, true))).toEqual({ tasks: 1, defaulted: 1, confidence_min: 1 });
    expect(decisionSummary(parseRunEvents('{"kind":"run.finished","success":true}'))).toBeNull();
    const asked = stream(ANSWERED, false, [{ kind: 'tool.called', toolName: DECISION_TOOL, correlationId: 'c1' }, { kind: 'tool.called', toolName: 'file_read', correlationId: 'c2' }]);
    expect(decisionCalls(asked)).toBe(2);
  });

  it('finds a decision task by its role or agent, by the key a gated task names, or says it did not run', () => {
    const events = stream(ANSWERED, false);
    expect(decisionTasksNamed(events, 'decision').tasks).toHaveLength(1);
    expect(decisionTasksNamed(events, 'triage').tasks).toHaveLength(1);
    expect(decisionTasksNamed(events, 'other')).toEqual({ tasks: [], notRun: false });
    const notRun = parseRunEvents(JSON.stringify({ kind: 'task.completed', agentRole: 'Fixer', skipped: true, skipReason: 'decision triage did not run' }));
    expect(decisionTasksNamed(notRun, 'triage')).toEqual({ tasks: [], notRun: true });
  });
});

describe('decision checks (D96)', () => {
  const scenario = (checks: unknown[], level = 'e2e_local') => parseScenario({ id: 'ac-01-route', level, checks });
  const statuses = (events: RunEvents, checks: unknown[]) => judgeScenario(scenario(checks), evidence(events), { stub: false }).slice(1).map((result) => [result.id, result.status, result.detail]);

  it('decision-answered: the decision model answered, not the fallback', () => {
    expect(statuses(stream(ANSWERED, false), [{ id: 'a', type: 'decision-answered', task: 'triage' }])).toEqual([['a', 'pass', '']]);
    expect(statuses(stream(DEFAULTED, true), [{ id: 'a', type: 'decision-answered', task: 'triage' }])).toEqual([['a', 'fail', 'the decision triage answered from its fallback (defaulted): no decision model answered']]);
    expect(statuses(parseRunEvents(''), [{ id: 'a', type: 'decision-answered', task: 'triage' }])[0]?.[1]).toBe('fail');
  });

  it('decision-chose and task-skipped: the option chosen, the branch left out', () => {
    const checks = [
      { id: 'c', type: 'decision-chose', task: 'triage', question: 'route', option: 'fix' },
      { id: 's', type: 'task-skipped', task: 'Skipper' },
      { id: 'r', type: 'task-skipped', task: 'Fixer' },
    ];
    expect(statuses(stream(ANSWERED, false), checks)).toEqual([
      ['c', 'pass', ''],
      ['s', 'pass', ''],
      ['r', 'fail', 'Fixer ran: it was not skipped'],
    ]);
    expect(statuses(stream(DEFAULTED, true), checks)[0]).toEqual(['c', 'fail', 'the decision triage chose ignore for route, not fix']);
  });

  it('refuses decision-answered on a level run on the stub, where a decision always answers from its fallback', () => {
    expect(() => scenario([{ id: 'a', type: 'decision-answered', task: 'triage' }], 'component')).toThrow(/decision-answered needs a decision model/);
    expect(scenario([{ id: 'c', type: 'decision-chose', task: 'triage', question: 'route', option: 'ignore' }], 'component').checks).toHaveLength(1);
  });
});

describe('decision measures (D96)', () => {
  const result = (id: string, decisions?: ScenarioResult['decisions']): ScenarioResult => ({
    id,
    title: id,
    file: `e2e/${id}.scenario.json`,
    level: 'e2e_local',
    iteration: 1,
    status: 'pass',
    covers: [],
    run: `RUN-20261101-080${id.length}-machine` as ScenarioResult['run'],
    dataset: null,
    datasets: [],
    model: 'm',
    exit_code: 0,
    duration_seconds: 1,
    tokens_in: 1,
    tokens_out: 1,
    usd: 0,
    tool_calls: 0,
    human_inputs: 0,
    ...(decisions === undefined ? {} : { decisions }),
    indicators: [
      { id: 'IND-01', measure: 'decision_defaulted_rate' },
      { id: 'IND-02', measure: 'decision_confidence_min' },
    ],
    checks: [],
    facts: NO_FACTS,
  });

  it('measures the share of defaulted decisions and the lowest confidence, on the runs that completed a decision task', () => {
    expect(measureOf(result('a', { tasks: 4, defaulted: 1, confidence_min: 0.6 }), 'decision_defaulted_rate')).toBe(0.25);
    expect(measureOf(result('a'), 'decision_confidence_min')).toBeNull();
    const declared = [
      { id: 'IND-01', threshold: 0.1, direction: '<=' as const },
      { id: 'IND-02', threshold: 0.7, direction: '>=' as const },
    ];
    const indicators = evaluateIndicators(['IND-01', 'IND-02'], declared, [result('a', { tasks: 2, defaulted: 0, confidence_min: 0.9 }), result('bb', { tasks: 2, defaulted: 1, confidence_min: 0.6 }), result('ccc')]);
    expect(indicators['IND-01']).toMatchObject({ value: 0.25, status: 'fail' });
    expect(indicators['IND-02']).toMatchObject({ value: 0.6, status: 'fail' });
    expect(evaluateIndicators(['IND-01'], declared, [result('ccc')])['IND-01']).toMatchObject({ status: 'not_run', note: 'not run: no run of a scenario that measures it completed a decision task' });
  });
});
