import { describe, expect, it } from 'vitest';

import { CheckWorkbook } from '../../src/application/use-cases/check-workbook.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { FakeProcessRunner, NOT_FOUND, failed, succeeded } from '../fakes/fake-process-runner.js';
import { LIST_TOOLS_OUTPUT, cleanWorkshop, workbookFixture } from '../fakes/workbook-fixtures.js';

const LIST_TOOLS = 'orkeon run --list-tools';
const WORKBOOK = '/home/tester/Orkeon/workbooks/mail-triage';
const TESTS = '/home/tester/Orkeon/tests/mail-triage';

function setup(listTools = succeeded(LIST_TOOLS_OUTPUT)) {
  const { team, fileSystem } = cleanWorkshop();
  const runner = new FakeProcessRunner({ [LIST_TOOLS]: listTools });
  return { team, fileSystem, runner, paths: teamPaths(team), check: new CheckWorkbook(fileSystem, runner) };
}

describe('CheckWorkbook', () => {
  it('check design passes the clean workbook, with the catalogue of the installed Orkeon', async () => {
    const { team, check, runner } = setup();
    const result = await check.execute(team, { check: 'design' });
    expect(result).toMatchObject({ team: 'mail-triage', check: 'design', status: 'pass', errors: 0, warnings: 0, findings: [], skipped: [], tests: null });
    expect(result.ids.acceptance).toEqual(['AC-01', 'AC-02', 'AC-03']);
    expect(runner.calls).toEqual([{ command: 'orkeon', args: ['run', '--list-tools'] }]);
    expect(runner.timeouts).toEqual([20_000]);
  });

  it('check design --tests reads the tests of the four folders, and nothing beside them', async () => {
    const { team, check, fileSystem } = setup();
    fileSystem
      .addFile(`${TESTS}/datasets/nominal/README.md`, 'serves AC-09')
      .addFile(`${TESTS}/judges/reply-draft.md`, 'a rubric that cites nothing')
      .addFile(`${TESTS}/unit/node_modules/vitest/index.js`, 'no id here')
      .addFile(`${TESTS}/static/.gitkeep`, '')
      .addFile(`${TESTS}/static/README.md`, 'what the static expectations are')
      .addFile(`${TESTS}/unit/helpers.js`, 'export const mail = () => ({}); // cites nothing')
      .addFile(`${TESTS}/unit/vitest.config.js`, 'export default {};')
      .addFile(`${TESTS}/unit/dist/registry-update.test.js`, '// compiled, cites nothing')
      .addFile(`${TESTS}/static/__pycache__/check.cpython-312.pyc`, '\u0000\u0001')
      .addFile(`${TESTS}/static/expected-layout.json`, '{"files":["crew.ork.ts"]}')
      .addFile(`${TESTS}/static/notes.md`, 'see README')
      .addFile(`${TESTS}/component/coverage/ac-09.scenario.json`, '{ "covers": ["AC-09"] }')
      .addFile(`${TESTS}/e2e/expected/notes.txt`, 'no id here');
    const result = await check.execute(team, { check: 'design', tests: true });
    expect(result).toMatchObject({ status: 'pass', findings: [], tests: { files: 6, uncovered: [], orphans: [] } });
  });

  it('check design --tests finds a test below a sub-folder, and a team without tests', async () => {
    const { team, check, fileSystem } = setup();
    fileSystem.addFile(`${TESTS}/unit/tools/extra.test.js`, '// nothing cited');
    const result = await check.execute(team, { check: 'design', tests: true });
    expect(result.findings.map((finding) => [finding.code, finding.artefact])).toEqual([['test-orphan', 'unit/tools/extra.test.js']]);
    expect(result.tests).toEqual({ files: 7, uncovered: [], orphans: ['unit/tools/extra.test.js'] });

    for (const folder of ['static', 'unit', 'component', 'e2e']) {
      await fileSystem.remove(`${TESTS}/${folder}`);
    }
    const none = await check.execute(team, { check: 'design', tests: true });
    expect(none.findings[0]).toMatchObject({ code: 'tests-none', artefact: 'tests' });
    expect(none.tests).toMatchObject({ files: 0, orphans: [] });
  });

  it('check design --tests reports a link to nothing as a finding, and does not enter a folder reached through a link', async () => {
    const { team, check, fileSystem } = setup();
    fileSystem.addLink(`${TESTS}/component/dangling.scenario.json`, '/nonexistent').addLink(`${TESTS}/unit/loop`, `${TESTS}/unit`).addLink(`${TESTS}/e2e/shared`, `${TESTS}/component`);
    const result = await check.execute(team, { check: 'design', tests: true });
    expect(result.findings).toEqual([{ severity: 'error', code: 'test-unreadable', artefact: 'component/dangling.scenario.json', section: null, message: 'the file cannot be read: a link to nothing, or no file' }]);
    expect(result.tests).toEqual({ files: 7, uncovered: [], orphans: [] });
  });

  it('check test-plan reads neither the design, the plan, the status nor the catalogue', async () => {
    const { team, check, fileSystem, runner, paths } = setup();
    for (const file of [paths.designFile, paths.planFile, paths.statusFile]) {
      await fileSystem.remove(file);
    }
    const result = await check.execute(team, { check: 'test-plan', tests: true });
    expect(result).toMatchObject({ check: 'test-plan', status: 'pass', findings: [], skipped: [], tests: null });
    expect(runner.calls).toEqual([]);
  });

  it('reports the faulty design: exit data for the command, the findings in order', async () => {
    const { team, check, fileSystem, paths } = setup();
    fileSystem.addFile(paths.designFile, workbookFixture('faulty/DESIGN.md')).addFile(paths.planFile, workbookFixture('faulty/PLAN.md'));
    const result = await check.execute(team, { check: 'design' });
    expect(result).toMatchObject({ status: 'fail', errors: 5, warnings: 2 });
    expect(result.findings.map((finding) => finding.code)).toEqual(['unknown-tool', 'task-reads', 'deliverable', 'batch-id', 'coverage', 'deliverable-orphan', 'deliverable-orphan']);
  });

  it.each([
    ['orkeon is not on the PATH', NOT_FOUND, 'orkeon not found on PATH: tool names were not checked'],
    ['orkeon fails', failed(3, 'boom'), 'orkeon run --list-tools exited 3: tool names were not checked'],
    ['orkeon does not exit', { found: true, exitCode: null, stdout: '', stderr: '', stopped: 'timeout' as const }, 'orkeon run --list-tools did not exit (killed or timed out): tool names were not checked'],
    ['orkeon lists nothing', succeeded('Orkeon 1.0\n\n'), 'orkeon run --list-tools returned no tool: tool names were not checked'],
  ])('skips the tool catalogue when %s, and judges no tool name', async (_name, listTools, reason) => {
    const { team, check, fileSystem, paths } = setup(listTools);
    fileSystem.addFile(paths.designFile, workbookFixture('faulty/DESIGN.md'));
    const result = await check.execute(team, { check: 'design', commandTimeoutMs: 50 });
    expect(result.skipped).toEqual([{ check: 'tool-catalogue', reason }]);
    expect(result.findings.map((finding) => finding.code)).toEqual(['task-reads', 'deliverable', 'deliverable-orphan', 'deliverable-orphan']);
  });

  it.each([
    ['NEED.md', '/team-need'],
    ['ACCEPTANCE.md', '/team-test-plan'],
    ['TEST-PLAN.md', '/team-test-plan'],
    ['DESIGN.md', '/team-design'],
    ['PLAN.md', '/team-design'],
  ])('fails with file-not-found when %s is missing, naming the step that writes it', async (name, step) => {
    const { team, check, fileSystem } = setup();
    await fileSystem.remove(`${WORKBOOK}/${name}`);
    await expect(check.execute(team, { check: 'design' })).rejects.toMatchObject({ code: 'file-not-found', message: `${name} not found: ${WORKBOOK}/${name} — ${step} writes it` });
  });

  it('reports a missing bench configuration as a finding, not as a missing artefact', async () => {
    const { team, check, fileSystem, paths } = setup();
    await fileSystem.remove(paths.benchConfigFile);
    const result = await check.execute(team, { check: 'test-plan' });
    expect(result.status).toBe('fail');
    expect(result.findings).toEqual([{ severity: 'error', code: 'config-missing', artefact: 'bench.config.json', section: null, message: 'tests/<slug>/bench.config.json does not exist: `/team-test-plan` writes it from the plan' }]);
  });

  it('holds the light track of STATUS.md to its single batch', async () => {
    const { team, check, fileSystem, paths } = setup();
    fileSystem.addFile(paths.statusFile, workbookFixture('clean/workbook/STATUS.md').replace('track: full', 'track: light'));
    const result = await check.execute(team, { check: 'design' });
    expect(result.findings.map((finding) => [finding.code, finding.artefact])).toEqual([['light-track', 'PLAN.md']]);
  });

  it('skips the light track when STATUS.md is missing or cannot be read, and checks the rest', async () => {
    const { team, check, fileSystem, paths } = setup();
    await fileSystem.remove(paths.statusFile);
    const missing = await check.execute(team, { check: 'design' });
    expect(missing).toMatchObject({ status: 'pass', findings: [] });
    expect(missing.skipped).toEqual([{ check: 'light-track', reason: `STATUS.md not found: ${paths.statusFile}: the single batch of the light track was not checked` }]);

    fileSystem.addFile(paths.statusFile, '---\nphase: nowhere\n---\n');
    const unreadable = await check.execute(team, { check: 'design' });
    expect(unreadable.status).toBe('pass');
    expect(unreadable.skipped[0]?.reason).toMatch(/^invalid STATUS\.md front matter: phase: .*: the single batch of the light track was not checked$/);
  });

  it('writes nothing', async () => {
    const { team, check, fileSystem } = setup();
    const before = await fileSystem.digest('/home/tester/Orkeon');
    await check.execute(team, { check: 'design', tests: true });
    expect(await fileSystem.digest('/home/tester/Orkeon')).toEqual(before);
    expect(fileSystem.locked).toEqual([]);
  });
});
