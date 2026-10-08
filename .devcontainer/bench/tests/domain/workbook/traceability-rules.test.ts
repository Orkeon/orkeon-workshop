import { describe, expect, it } from 'vitest';

import type { WorkbookIds } from '../../../src/domain/workbook/acceptance-rules.js';
import { isTestFile, traceability, type TestFile } from '../../../src/domain/workbook/traceability-rules.js';

const IDS: WorkbookIds = {
  criteria: [
    { id: 'AC-01', level: 'e2e_local', given: '`nominal`' },
    { id: 'AC-02', level: 'e2e_remote', given: '`nominal`' },
    { id: 'AC-03', level: 'static', given: 'the crew definition' },
  ],
  indicators: [{ id: 'IND-01', level: 'e2e_local', threshold: 100 }],
  invariants: [
    { id: 'INV-FS', level: 'component' },
    { id: 'INV-01', level: null },
  ],
  dropped: ['AC-04'],
};

const scenario = (path: string, fields: Record<string, unknown>): TestFile => ({ path, text: JSON.stringify(fields) });

const TESTS: TestFile[] = [
  { path: 'static/ac-03-tools.txt', text: '# AC-03\nemail_send\n' },
  { path: 'unit/dedupe.test.ts', text: "describe('dedupe (INV-01, IND-01)', () => {});" },
  scenario('component/inv-fs-roots.scenario.json', { covers: ['INV-FS'], level: 'component' }),
  scenario('e2e/ac-01-nominal.scenario.json', { covers: ['AC-01', 'AC-01'], level: 'e2e_local' }),
  scenario('e2e/ac-02-remote.scenario.json', { covers: ['AC-02'] }),
];

function found(files: readonly TestFile[], ids: WorkbookIds = IDS) {
  const traced = traceability(files, ids);
  return { ...traced, findings: traced.findings.map((finding) => [finding.code, finding.artefact, finding.section, finding.message]) };
}

describe('isTestFile', () => {
  it.each(['static/ac-03-tools.txt', 'static/layout/expected.json', 'static/readme.md', 'unit/dedupe.test.ts', 'unit/tools/dedupe.spec.js', 'unit/ac-07.scenario.json', 'component/ac-04.scenario.json', 'e2e/ac-01.scenario.json', 'e2e/remote/ac-06.scenario.json'])(
    'takes %s for a test',
    (path) => {
      expect(isTestFile(path)).toBe(true);
    },
  );

  it.each([
    'unit/helpers.ts',
    'unit/vitest.config.ts',
    'unit/package.json',
    'unit/fixtures/sample.eml',
    'unit/test.ts',
    'unit/dedupe.test',
    'static/README.md',
    'static/layout/README.md',
    'component/ac-04.stub.json',
    'e2e/README.md',
    'static/.gitkeep',
    'unit/.cache/x.ts',
    'unit/node_modules/vitest/index.js',
    'unit/datasets/sample.eml',
    'unit/dist/dedupe.test.js',
    'unit/build/dedupe.test.js',
    'static/__pycache__/check.cpython-312.pyc',
    'component/coverage/ac-04.scenario.json',
    'e2e/bin/ac-01.scenario.json',
    'e2e/obj/ac-01.scenario.json',
    'datasets/nominal/manifest.json',
    'judges/reply-draft.md',
    'bench.config.json',
    'ac-01.scenario.json',
    'static',
  ])('takes %s for no test', (path) => {
    expect(isTestFile(path)).toBe(false);
  });
});

describe('traceability', () => {
  it('finds nothing where every test cites a declared id and every criterion and invariant has a test of its level', () => {
    expect(found(TESTS)).toEqual({ summary: { files: 5, uncovered: [], orphans: [] }, findings: [] });
  });

  it('reads only the tests among the files it is given', () => {
    const others: TestFile[] = [
      { path: 'component/ac-04.stub.json', text: '{ "replies": [] }' },
      { path: 'static/.gitkeep', text: '' },
      { path: 'static/README.md', text: 'What the static expectations are, without an id.' },
      { path: 'unit/helpers.ts', text: 'export const mail = (name: string) => name; // cites nothing, and AC-09 is unknown' },
      { path: 'unit/vitest.config.ts', text: 'export default {};' },
      { path: 'datasets/nominal/README.md', text: 'AC-09' },
    ];
    expect(found([...TESTS, ...others])).toEqual({ summary: { files: 5, uncovered: [], orphans: [] }, findings: [] });
  });

  it('takes a file of static/ for a test once it cites an id, in its text or by its name — a note or an expected layout is none', () => {
    const notes: TestFile[] = [{ path: 'static/expected-layout.json', text: '{"files":["crew.ork.ts"]}' }, { path: 'static/notes.md', text: 'see README' }, { path: 'static/inventory.txt', text: 'inv-entory' }];
    expect(found([...TESTS, ...notes])).toEqual({ summary: { files: 5, uncovered: [], orphans: [] }, findings: [] });
    const named = TESTS.map((file) => (file.path === 'static/ac-03-tools.txt' ? { ...file, text: 'email_send\n' } : file));
    expect(found([...named, { path: 'static/inv-fs-roots.json', text: '{}' }, { path: 'static/ind-01-count.txt', text: '' }])).toEqual({ summary: { files: 7, uncovered: [], orphans: [] }, findings: [] });
    // Named after an id that does not exist: a test, and a wrong one.
    expect(found([...TESTS, { path: 'static/ac-09-later.txt', text: '' }]).findings).toEqual([['test-unknown-id', 'static/ac-09-later.txt', null, 'the test cites an id that is not one to prove — `ACCEPTANCE.md` does not declare `AC-09`']]);
    // Elsewhere a name cites nothing: a unit test names its id in its text.
    expect(found([...TESTS, { path: 'unit/ac-03-tools.test.ts', text: 'it("works")' }]).findings.map(([code]) => code)).toEqual(['test-orphan']);
  });

  it('reports a test file that cannot be read, and goes on', () => {
    const traced = found([...TESTS, { path: 'component/dangling.scenario.json', text: null }, { path: 'unit/gone.test.ts', text: null }]);
    expect(traced.summary).toEqual({ files: 7, uncovered: [], orphans: [] });
    expect(traced.findings).toEqual([
      ['test-unreadable', 'component/dangling.scenario.json', null, 'the file cannot be read: a link to nothing, or no file'],
      ['test-unreadable', 'unit/gone.test.ts', null, 'the file cannot be read: a link to nothing, or no file'],
    ]);
  });

  it('refuses a scenario whose level is none the bench knows: it would have passed for a test of its folder', () => {
    const ids: WorkbookIds = { ...IDS, criteria: [{ id: 'AC-01', level: 'e2e_remote', given: '`nominal`' }], invariants: [] };
    const traced = found([scenario('e2e/ac-01.scenario.json', { covers: ['AC-01'], level: 'local' }), scenario('e2e/other.scenario.json', { covers: ['AC-01'], level: 3 }), scenario('e2e/label.scenario.json', { covers: ['AC-01'], level: 'L4' })], ids);
    expect(traced.findings).toEqual([
      ['test-unreadable', 'e2e/ac-01.scenario.json', null, '`level` is none of the levels the bench knows (static, unit, component, e2e_local, e2e_remote)'],
      ['test-unreadable', 'e2e/other.scenario.json', null, '`level` is none of the levels the bench knows (static, unit, component, e2e_local, e2e_remote)'],
      // A label is the way the workbook writes a level, not a scenario: `scenarioSchema` refuses it, and so no run would take the file.
      ['test-unreadable', 'e2e/label.scenario.json', null, '`level` is none of the levels the bench knows (static, unit, component, e2e_local, e2e_remote)'],
      ['untested', 'ACCEPTANCE.md', 'Acceptance criteria', '`AC-01` is cited by no test'],
    ]);
  });

  it('refuses a scenario whose level its folder does not serve: no run picks it up there', () => {
    const ids: WorkbookIds = { ...IDS, criteria: [{ id: 'AC-01', level: 'e2e_local', given: '`nominal`' }], invariants: [] };
    expect(found([scenario('component/ac-01-nominal.scenario.json', { covers: ['AC-01'], level: 'e2e_local' })], ids).findings).toEqual([
      ['test-level', 'component/ac-01-nominal.scenario.json', null, 'the scenario says level `e2e_local` (L3) and lies in `component/`, which serves L2: no run picks it up at its level'],
    ]);
    expect(found([scenario('e2e/ac-01-nominal.scenario.json', { covers: ['AC-01'], level: 'component' })], ids).findings.map(([code, artefact, , message]) => [code, artefact, (message as string).slice(0, 50)])).toEqual([
      ['test-level', 'e2e/ac-01-nominal.scenario.json', 'the scenario says level `component` (L2) and lies '],
      ['test-level', 'ACCEPTANCE.md', '`AC-01` sits at L3 and is cited only by tests of a'],
    ]);
    expect(found([scenario('e2e/ac-01-nominal.scenario.json', { covers: ['AC-01'], level: 'e2e_local' }), scenario('e2e/ac-01-remote.scenario.json', { covers: ['AC-01'], level: 'e2e_remote' })], ids).findings).toEqual([]);
  });

  it('finds no test file at all', () => {
    const traced = found([], { ...IDS, criteria: [], invariants: [] });
    expect(traced).toEqual({ summary: { files: 0, uncovered: [], orphans: [] }, findings: [['tests-none', 'tests', null, 'no test file under `static/`, `unit/`, `component/`, `e2e/`: the tests exist before the team']] });
  });

  it('refuses a test that cites no id: a scenario without covers, a file without an id in its text', () => {
    const orphans = [scenario('component/smoke.scenario.json', { covers: [] }), scenario('e2e/smoke.scenario.json', { id: 'smoke' }), { path: 'unit/helpers.test.ts', text: 'export const AC = 1; // AC-1, MAC-01, INV-fs' }];
    const traced = found([...TESTS, ...orphans]);
    expect(traced.summary).toEqual({ files: 8, uncovered: [], orphans: ['component/smoke.scenario.json', 'e2e/smoke.scenario.json', 'unit/helpers.test.ts'] });
    expect(traced.findings).toEqual(orphans.map((file) => ['test-orphan', file.path, null, 'the test cites no id: a test names the `AC-`, `IND-` or `INV-` id it proves']));
  });

  it('refuses a cited id that is unknown or dropped', () => {
    const traced = found([...TESTS, scenario('component/old.scenario.json', { covers: ['AC-04', 'INV-FS'] }), { path: 'unit/extra.test.ts', text: '// AC-09 and INV-SPEED' }]);
    expect(traced.findings).toEqual([
      ['test-unknown-id', 'component/old.scenario.json', null, 'the test cites an id that is not one to prove — `AC-04` is dropped'],
      ['test-unknown-id', 'unit/extra.test.ts', null, 'the test cites an id that is not one to prove — `ACCEPTANCE.md` does not declare `AC-09`'],
      ['test-unknown-id', 'unit/extra.test.ts', null, 'the test cites an id that is not one to prove — `ACCEPTANCE.md` does not declare `INV-SPEED`'],
    ]);
  });

  it('refuses a scenario that is not JSON, or whose covers is not a list of ids — and counts it among the files', () => {
    const broken = [{ path: 'component/a.scenario.json', text: '{ "covers": [' }, scenario('component/b.scenario.json', { covers: 'AC-01' }), scenario('component/c.scenario.json', { covers: ['AC-01', 2] }), { path: 'component/d.scenario.json', text: '[]' }];
    const traced = found([...TESTS, ...broken]);
    expect(traced.summary).toEqual({ files: 9, uncovered: [], orphans: ['component/d.scenario.json'] });
    expect(traced.findings.map(([code, artefact, , message]) => [code, artefact, (message as string).split(':')[0]])).toEqual([
      ['test-unreadable', 'component/a.scenario.json', 'not valid JSON'],
      ['test-unreadable', 'component/b.scenario.json', '`covers` is not a list of ids'],
      ['test-unreadable', 'component/c.scenario.json', '`covers` is not a list of ids'],
      ['test-orphan', 'component/d.scenario.json', 'the test cites no id'],
    ]);
  });

  it('names the active criteria and the invariants no test cites — never an indicator', () => {
    const traced = found(TESTS.filter((file) => file.path.startsWith('e2e/')));
    expect(traced.summary).toEqual({ files: 2, uncovered: ['AC-03', 'INV-FS', 'INV-01'], orphans: [] });
    expect(traced.findings).toEqual([
      ['untested', 'ACCEPTANCE.md', 'Acceptance criteria', '`AC-03` is cited by no test'],
      ['untested', 'ACCEPTANCE.md', 'Invariants', '`INV-FS` is cited by no test'],
      ['untested', 'ACCEPTANCE.md', 'Invariants', '`INV-01` is cited by no test'],
    ]);
  });

  it('refuses an id cited only by tests of another level — the level a scenario names, else the one of its folder', () => {
    const tests = [
      { path: 'unit/tools.test.ts', text: '// AC-03, INV-01' },
      scenario('e2e/inv-fs.scenario.json', { covers: ['INV-FS'] }),
      scenario('component/ac-01.scenario.json', { covers: ['AC-01'] }),
      scenario('e2e/ac-02.scenario.json', { covers: ['AC-02'], level: 'e2e_local' }),
    ];
    expect(found(tests).findings).toEqual([
      ['test-level', 'ACCEPTANCE.md', 'Acceptance criteria', '`AC-01` sits at L3 and is cited only by tests of another level: component/ac-01.scenario.json (L2)'],
      ['test-level', 'ACCEPTANCE.md', 'Acceptance criteria', '`AC-02` sits at L4 and is cited only by tests of another level: e2e/ac-02.scenario.json (L3)'],
      ['test-level', 'ACCEPTANCE.md', 'Acceptance criteria', '`AC-03` sits at L0 and is cited only by tests of another level: unit/tools.test.ts (L1)'],
      ['test-level', 'ACCEPTANCE.md', 'Invariants', '`INV-FS` sits at L2 and is cited only by tests of another level: e2e/inv-fs.scenario.json (L3, L4)'],
    ]);
  });

  it('accepts a test of the right level among others, and e2e/ for L3 as for L4', () => {
    const tests = [...TESTS, scenario('component/ac-01-wiring.scenario.json', { covers: ['AC-01', 'AC-02', 'AC-03'] })];
    expect(found(tests).findings).toEqual([]);
    const remote = TESTS.map((file) => (file.path === 'e2e/ac-01-nominal.scenario.json' ? scenario(file.path, { covers: ['AC-01'] }) : file));
    expect(found(remote).findings).toEqual([]);
  });
});
