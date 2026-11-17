import { describe, expect, it } from 'vitest';

import { DECISION_TOOL, decisionCalls, decisionSummary, decisionTasksNamed, resolveTaskName } from '../../src/domain/decisions.js';
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

  it('task-skipped by the file stem of a YAML task: resolved to its agent\'s role, the events carrying no stem (Orkeon 1.2.0)', () => {
    const crewTasks = [
      { stem: 'triage', agent: null, role: null },
      { stem: 'fix_it', agent: 'fixer', role: 'Fixer' },
      { stem: 'skip_it', agent: 'skipper', role: 'Skipper' },
      { stem: 'note_a', agent: 'scribe', role: 'Scribe' },
      { stem: 'note_b', agent: 'scribe', role: 'Scribe' },
    ];
    const judge = (checks: unknown[]) => judgeScenario(scenario(checks), { ...evidence(stream(ANSWERED, false)), crewTasks }, { stub: false }).slice(1).map((result) => [result.id, result.status, result.detail]);
    expect(judge([{ id: 's', type: 'task-skipped', task: 'skip_it' }, { id: 'r', type: 'task-skipped', task: 'fix_it' }])).toEqual([
      ['s', 'pass', ''],
      ['r', 'fail', 'fix_it ran: it was not skipped'],
    ]);
    // Without the crew (a TypeScript one), a stem matches nothing the events carry.
    expect(statuses(stream(ANSWERED, false), [{ id: 's', type: 'task-skipped', task: 'skip_it' }])[0]?.[1]).toBe('fail');
    // Two tasks of one role, or a task without an agent: the events cannot tell them apart, and the detail says so.
    expect(judge([{ id: 'n', type: 'task-skipped', task: 'note_a' }])).toEqual([['n', 'fail', 'note_a cannot be found in the events: the tasks note_a, note_b share the role Scribe, and the events name a task by its role alone: give the task an agent of its own']]);
    expect(judge([{ id: 't', type: 'task-skipped', task: 'triage' }])[0]?.[2]).toContain('names no agent');
    expect(resolveTaskName('Skipper', crewTasks)).toBeNull();
    expect(resolveTaskName('skip_it', crewTasks)).toEqual({ role: 'Skipper' });
  });

  it('decision-chose with defaulted: the option must come from the fallback (true) or from the model (false)', () => {
    const fromFallback = [{ id: 'd', type: 'decision-chose', task: 'triage', question: 'route', option: 'ignore', defaulted: true }];
    expect(statuses(stream(DEFAULTED, true), fromFallback)).toEqual([['d', 'pass', '']]);
    const fromModel = [{ id: 'd', type: 'decision-chose', task: 'triage', question: 'route', option: 'fix', defaulted: true }];
    expect(statuses(stream(ANSWERED, false), fromModel)).toEqual([['d', 'fail', 'the decision triage chose fix, but not from its fallback: a decision model answered (defaulted false)']]);
    expect(statuses(stream(DEFAULTED, true), [{ ...fromFallback[0], defaulted: false }])).toEqual([['d', 'fail', 'the decision triage chose ignore from its fallback (defaulted): no decision model answered']]);
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

  it('measures the defaulted rate of the fallback when no decision model could answer — none configured, a stub run, --no-decision — and says so', () => {
    const declared = [
      { id: 'IND-01', threshold: 0.1, direction: '<=' as const },
      { id: 'IND-02', threshold: 0.7, direction: '>=' as const },
    ];
    const atLeastOne = [{ id: 'IND-01', threshold: 1, direction: '>=' as const }];
    const without = (id: string, state: 'none' | 'off'): ScenarioResult => ({ ...result(id, { tasks: 2, defaulted: 2, confidence_min: null }), decision_model: state });
    const none = evaluateIndicators(['IND-01', 'IND-02'], declared, [without('a', 'none'), without('bb', 'none')]);
    // The stub's fallback is measured: what AC-17 and an IND `decision_defaulted_rate >= 1` at L2 ask.
    expect(none['IND-01']).toEqual({ value: 1, threshold: 0.1, status: 'fail', measure: 'decision_defaulted_rate', note: "decision_defaulted_rate <= 0.1 over 2 run(s), with no decision model active (no decision model configured (or a stub run)): the fallback's answers" });
    expect(evaluateIndicators(['IND-01'], atLeastOne, [without('a', 'none')])['IND-01']).toMatchObject({ value: 1, status: 'pass' });
    // The fallback's answers carry no confidence: nothing to measure.
    expect(none['IND-02']).toMatchObject({ status: 'not_applicable', note: expect.stringContaining('the fallback answers carry no confidence') });
    expect(evaluateIndicators(['IND-01'], atLeastOne, [without('a', 'off')])['IND-01']).toMatchObject({ status: 'pass', note: expect.stringContaining('--no-decision') });
    // A run that completed no decision task without a model has nothing to measure: not applicable.
    expect(evaluateIndicators(['IND-01'], declared, [{ ...result('a'), decision_model: 'none' }])['IND-01']).toMatchObject({ status: 'not_applicable', note: expect.stringContaining('no decision task completed') });
    // A configured provider that answered badly still fails; the runs without one are left out of the mean.
    const mixed = evaluateIndicators(['IND-01'], declared, [{ ...result('a', { tasks: 2, defaulted: 1, confidence_min: 0.4 }), decision_model: 'active' }, without('bb', 'none')]);
    expect(mixed['IND-01']).toMatchObject({ value: 0.5, status: 'fail', note: 'decision_defaulted_rate <= 0.1 over 1 run(s)' });
    expect(evaluateIndicators(['IND-01'], declared, [result('a', { tasks: 2, defaulted: 2, confidence_min: null })])['IND-01']).toMatchObject({ value: 1, status: 'fail' });
  });

  it('never hides a declared decision model that answered in no run: the fallback is measured and the note names it; nothing to measure is not_run', () => {
    const declared = [
      { id: 'IND-01', threshold: 1, direction: '>=' as const },
      { id: 'IND-02', threshold: 0.7, direction: '>=' as const },
    ];
    const without = (id: string, state: 'none' | 'off'): ScenarioResult => ({ ...result(id, { tasks: 2, defaulted: 2, confidence_min: null }), decision_model: state });
    // Only stub runs at L2, the declared provider never active: the fallback rate is measured and in range…
    const stub = evaluateIndicators(['IND-01', 'IND-02'], declared, [without('a', 'none')], true);
    expect(stub['IND-01']).toMatchObject({ value: 1, status: 'pass', note: expect.stringContaining('TEAM.md declares a decision model whose answers no run measured') });
    // …but the lowest confidence has nothing to read: unproven, not hidden as not applicable.
    expect(stub['IND-02']).toMatchObject({ status: 'not_run', note: expect.stringContaining('TEAM.md declares a decision model') });
    expect(evaluateIndicators(['IND-01'], declared, [{ ...result('a'), decision_model: 'none' }], true)['IND-01']).toMatchObject({ status: 'not_run', note: expect.stringContaining('no decision task completed') });
    // Stub and --no-decision runs together.
    expect(evaluateIndicators(['IND-01'], declared, [without('a', 'none'), without('bb', 'off')], true)['IND-01']).toMatchObject({ value: 1, status: 'pass', note: expect.stringContaining('a stub run or --no-decision') });
    // Mixed active and none: judged on the active runs alone.
    const mixed = evaluateIndicators(['IND-01'], [{ id: 'IND-01', threshold: 0.1, direction: '<=' as const }], [{ ...result('a', { tasks: 2, defaulted: 0, confidence_min: 0.9 }), decision_model: 'active' }, without('bb', 'none')], true);
    expect(mixed['IND-01']).toMatchObject({ value: 0, status: 'pass', note: 'decision_defaulted_rate <= 0.1 over 1 run(s)' });
  });
});
