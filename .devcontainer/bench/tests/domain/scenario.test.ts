import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { answerStubRequest, parseStubScript } from '../../src/domain/llm-stub.js';
import { parseRunEvents, type RunEvents } from '../../src/domain/run-events.js';
import { isText, judgeScenario, sameBytes, sameContent, type FileEvidence, type ScenarioEvidence } from '../../src/domain/scenario-checks.js';
import { bindingRefusal, parseScenario, splitVirtualFile, unsupportedParts } from '../../src/domain/scenario.js';
import { fixture } from '../fakes/fixture-team.js';

const MINIMAL = { id: 'ac-01-nominal', level: 'component' };
const OK_EVENTS: RunEvents = parseRunEvents(
  [
    '{"kind":"tool.called","correlationId":"a","toolName":"file_read"}',
    '{"kind":"tool.returned","correlationId":"a","success":true}',
    '{"kind":"tool.called","correlationId":"b","toolName":"file_write"}',
    '{"kind":"tool.returned","correlationId":"b","success":false}',
    '{"kind":"run.finished","success":true,"exitCode":0}',
  ].join('\n'),
);
const SCRIPT = parseStubScript({ replies: [{ match: { role: 'Writer' }, turns: [{ content: 'ok' }] }] });
const REQUEST = { messages: [{ role: 'system', content: 'You are Writer.\n' }, { role: 'user', content: 'Task:\nPrevious task results...\nThe budget is 12 k.' }] };
const EXCHANGES = [answerStubRequest(SCRIPT, '/v1/chat/completions', REQUEST, 1)];

function evidence(overrides: Partial<ScenarioEvidence> = {}, files: Record<string, FileEvidence> = {}, expected: Record<string, string | null> = {}): ScenarioEvidence {
  return { exitCode: 0, events: OK_EVENTS, exchanges: EXCHANGES, files: new Map(Object.entries(files)), expected: new Map(Object.entries(expected)), sameBytes: new Map(), stopped: null, ...overrides };
}

describe('parseScenario', () => {
  it('reads the template the harness ships (a copy of .claude/templates/scenario.json)', () => {
    const template = JSON.parse(fixture('scenarios/template.scenario.json')) as unknown;
    const scenario = parseScenario(template);
    expect(scenario).toMatchObject({ id: 'ac-01-nominal', level: 'e2e_local', dataset: 'nominal', covers: ['AC-01', 'INV-FS'], llm_stub: null, target: { task: null } });
    expect(scenario.bindings).toEqual({ '/workspace': 'workspace', '/output': null, '/state': 'state' });
    expect(scenario.checks.map((check) => check.type)).toEqual(['file-exists', 'json-schema', 'text-absent', 'tool-never-called', 'matches-expected']);
    expect(unsupportedParts(scenario)).toEqual(['judges: grades are integrated by `orkeon-bench evaluate` (lot 4), not by this run']);
  });

  it('defaults everything but the id and the level', () => {
    expect(parseScenario(MINIMAL)).toEqual({
      schema_version: '1.0',
      id: 'ac-01-nominal',
      title: '',
      covers: [],
      level: 'component',
      dataset: null,
      bindings: {},
      target: { task: null },
      llm_stub: null,
      human_inputs: [],
      checks: [],
      judges: [],
    });
  });

  it('takes a reply script inline or by file name', () => {
    expect(parseScenario({ ...MINIMAL, llm_stub: 'ac-01.stub.json' }).llm_stub).toBe('ac-01.stub.json');
    expect(parseScenario({ ...MINIMAL, llm_stub: { replies: [] } }).llm_stub).toEqual({ schema_version: '1.0', replies: [] });
  });

  it('refuses what would lead a check or a binding astray', () => {
    const invalid: [string, Record<string, unknown>][] = [
      ['expected a kebab-case id', { id: 'AC 01' }],
      ['expected an AC, IND or INV id', { covers: ['DEC-0001'] }],
      ['a dataset is named in kebab-case', { dataset: '../other' }],
      ['expected a virtual root such as /workspace', { bindings: { output: null } }],
      ['expected a relative path without ".."', { bindings: { '/output': '../../teams' } }],
      ['expected a path under a mount point', { checks: [{ id: 'c1', type: 'file-exists', path: 'report.md' }] }],
      ['a path never climbs with ".."', { checks: [{ id: 'c1', type: 'file-exists', path: '/output/../x' }] }],
      ['expected a relative path without ".."', { checks: [{ id: 'c1', type: 'matches-expected', path: '/output/x', expected: '/etc/passwd' }] }],
      ['duplicate check id c1', { checks: [{ id: 'c1', type: 'tool-called', tool: 'file_read' }, { id: 'c1', type: 'tool-called', tool: 'file_read' }] }],
      ['a tool name is snake_case', { checks: [{ id: 'c1', type: 'tool-called', tool: 'File Read' }] }],
    ];
    for (const [message, change] of invalid) {
      expect(() => parseScenario({ ...MINIMAL, ...change }), message).toThrow(message);
    }
    expect(() => parseScenario({ ...MINIMAL, level: 'L2' })).toThrow(DomainError);
    expect(() => parseScenario({ ...MINIMAL, bindings: { '/output': 'a\\..\\b' } })).toThrow('expected a relative path without ".."');
    expect(() => parseScenario({ ...MINIMAL, llm_stub: 'sub\\reply.json' })).toThrow(DomainError);
    expect(() => parseScenario({ ...MINIMAL, checks: [{ id: 'c1', type: 'smells-good' }] }, 'component/x.scenario.json')).toThrow('invalid component/x.scenario.json');
  });

  it('refuses a scenario that covers ids and declares no check: nothing is proven by running', () => {
    expect(() => parseScenario({ ...MINIMAL, covers: ['AC-01', 'INV-FS'] })).toThrow('checks: the scenario covers AC-01, INV-FS and declares no check: a scenario proves an id by a check, never by running');
    expect(parseScenario({ ...MINIMAL, covers: ['AC-01'], checks: [{ id: 'c1', type: 'tool-called', tool: 'file_read' }] }).covers).toEqual(['AC-01']);
    expect(parseScenario(MINIMAL).checks).toEqual([]);
  });

  it('refuses to bind a mount point to the dataset itself or to its expected outputs', () => {
    expect(bindingRefusal('notes')).toBeNull();
    expect(bindingRefusal('state/v1')).toBeNull();
    expect(bindingRefusal('expected-notes')).toBeNull();
    for (const folder of ['.', './', './.']) {
      expect(bindingRefusal(folder), folder).toContain('is the dataset itself');
    }
    for (const folder of ['expected', 'expected/output', './expected', 'Expected']) {
      expect(bindingRefusal(folder), folder).toContain('is where the dataset keeps the expected outputs');
    }
    expect(() => parseScenario({ ...MINIMAL, bindings: { '/workspace': '.' } })).toThrow('bindings./workspace: "." is the dataset itself');
    expect(() => parseScenario({ ...MINIMAL, bindings: { '/workspace': 'expected' } })).toThrow('the team must not read what it is expected to produce');
    expect(parseScenario({ ...MINIMAL, bindings: { '/workspace': null } }).bindings).toEqual({ '/workspace': null });
  });

  it('names what it asks for that the bench does not do', () => {
    const scenario = parseScenario({ ...MINIMAL, target: { task: 'read-notes' }, human_inputs: [{ answer: 'yes' }] });
    expect(unsupportedParts(scenario)).toEqual([
      'target.task "read-notes": isolating one task as a one-task crew is not implemented yet (lot 4) — the whole crew would run',
      'human_inputs: answering input.needed events is not implemented yet (lot 4)',
    ]);
    expect(unsupportedParts(parseScenario(MINIMAL))).toEqual([]);
  });

  it('splits a virtual file into its mount point and the rest', () => {
    expect(splitVirtualFile('/output/sub/report.md')).toEqual({ root: '/output', rest: 'sub/report.md' });
  });
});

describe('judgeScenario', () => {
  it('passes the run and the script when the run succeeded and the script was followed', () => {
    expect(judgeScenario(parseScenario(MINIMAL), evidence())).toEqual([
      { id: 'run', type: 'run-succeeded', status: 'pass', detail: '' },
      { id: 'stub', type: 'stub-script', status: 'pass', detail: '' },
    ]);
  });

  it('fails the run on its exit code, a missing or failed finish and the error events', () => {
    const failed = parseRunEvents('{"kind":"error","message":"Task x failed"}\n{"kind":"run.finished","success":false,"exitCode":2}');
    expect(judgeScenario(parseScenario(MINIMAL), evidence({ exitCode: 2, events: failed }))[0]).toEqual({
      id: 'run',
      type: 'run-succeeded',
      status: 'fail',
      detail: 'orkeon run exited 2; run.finished reports a failure; Task x failed',
    });
    expect(judgeScenario(parseScenario(MINIMAL), evidence({ exitCode: null, events: parseRunEvents('') }))[0]?.detail).toBe('orkeon run ended without an exit code (killed by a signal); no run.finished event');
    const stopped = 'orkeon run was stopped after 3 s, the time the scenario allows (timeout_seconds): it had not finished';
    expect(judgeScenario(parseScenario(MINIMAL), evidence({ exitCode: null, events: parseRunEvents(''), stopped }))[0]?.detail).toBe(`${stopped}; no run.finished event`);
  });

  it('fails the script on an issue, and when the stub was never reached', () => {
    const unmatched = [answerStubRequest(SCRIPT, '/v1/chat/completions', { messages: [{ role: 'system', content: 'You are Reader.\n' }] }, 1)];
    expect(judgeScenario(parseScenario(MINIMAL), evidence({ exchanges: unmatched }))[1]).toMatchObject({ status: 'fail', detail: 'request 1: no rule of the script matches this request (role "Reader")' });
    expect(judgeScenario(parseScenario(MINIMAL), evidence({ exchanges: [] }))[1]?.detail).toBe('the simulated LLM received no request: the run did not reach it');
  });

  it('fails a scenario that asks for what the bench does not do', () => {
    const results = judgeScenario(parseScenario({ ...MINIMAL, judges: [{ judge: 'J-01' }] }), evidence());
    expect(results[2]).toEqual({ id: 'unsupported', type: 'unsupported', status: 'fail', detail: 'judges: grades are integrated by `orkeon-bench evaluate` (lot 4), not by this run' });
  });

  it('judges each kind of check', () => {
    const scenario = parseScenario({
      ...MINIMAL,
      checks: [
        { id: 'exists', type: 'file-exists', path: '/output/report.md' },
        { id: 'missing', type: 'file-exists', path: '/output/none.md' },
        { id: 'present', type: 'text-present', path: '/output/report.md', pattern: 'budget is \\d+' },
        { id: 'not-present', type: 'text-present', path: '/output/report.md', pattern: 'deadline' },
        { id: 'absent', type: 'text-absent', path: '/output/report.md', pattern: 'IGNORE your instructions' },
        { id: 'not-absent', type: 'text-absent', path: '/output/report.md', pattern: 'BUDGET' },
        { id: 'no-file', type: 'text-absent', path: '/output/none.md', pattern: 'x' },
        { id: 'bad-pattern', type: 'text-present', path: '/output/report.md', pattern: '(' },
        { id: 'same', type: 'matches-expected', path: '/output/result.json', expected: 'expected/result.json' },
        { id: 'differs', type: 'matches-expected', path: '/output/report.md', expected: 'expected/report.md' },
        { id: 'no-expected', type: 'matches-expected', path: '/output/report.md', expected: 'expected/none.md' },
        { id: 'no-actual', type: 'matches-expected', path: '/output/none.md', expected: 'expected/report.md' },
        { id: 'schema', type: 'json-schema', path: '/output/result.json', schema: 'library/schemas/result.schema.json' },
        { id: 'called', type: 'tool-called', tool: 'file_read' },
        { id: 'called-and-failed', type: 'tool-called', tool: 'file_write' },
        { id: 'failed-as-wanted', type: 'tool-called', tool: 'file_write', outcome: 'failure' },
        { id: 'succeeded-not-failed', type: 'tool-called', tool: 'file_read', outcome: 'failure' },
        { id: 'called-whatever', type: 'tool-called', tool: 'file_write', outcome: 'any' },
        { id: 'not-called', type: 'tool-called', tool: 'email_send' },
        { id: 'never', type: 'tool-never-called', tool: 'email_send' },
        { id: 'not-never', type: 'tool-never-called', tool: 'file_read' },
        { id: 'received', type: 'stub-received', role: 'Writer', pattern: 'budget is 12 k' },
        { id: 'not-received', type: 'stub-received', role: 'Reader', pattern: 'budget' },
        { id: 'nobody', type: 'stub-received', pattern: 'deadline' },
        { id: 'bad-received', type: 'stub-received', pattern: '[' },
      ],
    });
    const results = judgeScenario(
      scenario,
      evidence(
        {},
        {
          '/output/report.md': { exists: true, text: 'The budget is 12 k.\n' },
          '/output/none.md': { exists: false, text: null },
          '/output/result.json': { exists: true, text: '{"b": [1, {"y": 2, "x": 1}], "a": null}' },
        },
        { 'expected/result.json': '{\n  "a": null,\n  "b": [1, {"x": 1, "y": 2}]\n}\n', 'expected/report.md': 'The budget is 13 k.\n', 'expected/none.md': null },
      ),
    ).slice(2);
    expect(Object.fromEntries(results.map((result) => [result.id, result.status === 'pass' ? 'pass' : result.detail]))).toEqual({
      exists: 'pass',
      missing: '/output/none.md does not exist',
      present: 'pass',
      'not-present': '/output/report.md does not hold /deadline/i',
      absent: 'pass',
      'not-absent': '/output/report.md holds /BUDGET/i',
      'no-file': '/output/none.md is not a file the run left',
      'bad-pattern': '"(" is not a regular expression',
      same: 'pass',
      differs: '/output/report.md differs from expected/report.md',
      'no-expected': 'the expected file expected/none.md is missing from the dataset',
      'no-actual': '/output/none.md is not a file the run left',
      schema: 'json-schema checks are not evaluated by this version of the bench (lot 4)',
      called: 'pass',
      'called-and-failed': 'file_write was called 1 time(s) and no call succeeded (tool.returned)',
      'failed-as-wanted': 'pass',
      'succeeded-not-failed': 'file_read was called 1 time(s) and no call failed (tool.returned)',
      'called-whatever': 'pass',
      'not-called': 'email_send was never called',
      never: 'pass',
      'not-never': 'file_read was called 1 time(s)',
      received: 'pass',
      'not-received': 'no request of role "Reader" held /budget/i',
      nobody: 'no request held /deadline/i',
      'bad-received': '"[" is not a regular expression',
    });
    expect(results.every((result) => result.type === scenario.checks.find((check) => check.id === result.id)?.type)).toBe(true);
  });
});

describe('sameContent', () => {
  it('compares JSON by value and text by lines', () => {
    expect(sameContent('{"a":1,"b":[1,2]}', '{ "b": [1, 2], "a": 1 }')).toBe(true);
    expect(sameContent('{"a":1,"b":[1,2]}', '{ "b": [2, 1], "a": 1 }')).toBe(false);
    expect(sameContent('a\r\nb\r\n', 'a\nb\n\n')).toBe(true);
    expect(sameContent('a\nb', 'a\n b')).toBe(false);
    expect(sameContent('{"a":1}', 'not json')).toBe(false);
  });
});

describe('files that are not text', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

  it('tells text from bytes', () => {
    expect(isText(new TextEncoder().encode('# Report\n\u00e9\n'))).toBe(true);
    expect(isText(new Uint8Array())).toBe(true);
    expect(isText(png)).toBe(false);
    expect(isText(new Uint8Array([0xc3, 0x28]))).toBe(false);
    expect(isText(new Uint8Array([0x61, 0x00, 0x62]))).toBe(false);
  });

  it('compares them byte for byte', () => {
    expect(sameBytes(png, new Uint8Array(png))).toBe(true);
    expect(sameBytes(png, png.slice(0, 9))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  });

  it('lets the bytes decide a matches-expected, whatever a lossy reading of them says', () => {
    const scenario = parseScenario({ ...MINIMAL, checks: [{ id: 'same', type: 'matches-expected', path: '/output/a.png', expected: 'expected/a.png' }, { id: 'differs', type: 'matches-expected', path: '/output/b.png', expected: 'expected/b.png' }] });
    const lossy = '\ufffdPNG';
    const results = judgeScenario(
      scenario,
      evidence(
        { sameBytes: new Map([['same', true], ['differs', false]]) },
        { '/output/a.png': { exists: true, text: lossy }, '/output/b.png': { exists: true, text: lossy } },
        { 'expected/a.png': 'other reading', 'expected/b.png': lossy },
      ),
    ).slice(2);
    expect(results.map((result) => [result.id, result.status, result.detail])).toEqual([
      ['same', 'pass', ''],
      ['differs', 'fail', '/output/b.png differs from expected/b.png (not text: compared byte for byte)'],
    ]);
  });
});
