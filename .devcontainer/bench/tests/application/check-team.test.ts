import { describe, expect, it } from 'vitest';

import { CheckTeam } from '../../src/application/use-cases/check-team.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { FakeProcessRunner, NOT_FOUND, failed, succeeded } from '../fakes/fake-process-runner.js';
import { LIST_TOOLS_OUTPUT, cleanWorkshop, workbookFixture } from '../fakes/workbook-fixtures.js';

const LIST_TOOLS = 'orkeon run --list-tools';
const WORKBOOK = '/home/tester/Orkeon/workbooks/mail-triage';
const TESTS = '/home/tester/Orkeon/tests/mail-triage';

function setup(listTools = succeeded(LIST_TOOLS_OUTPUT)) {
  const { team, fileSystem } = cleanWorkshop();
  const runner = new FakeProcessRunner({ [LIST_TOOLS]: listTools });
  return { team, fileSystem, runner, paths: teamPaths(team), check: new CheckTeam(fileSystem, runner) };
}

describe('CheckTeam', () => {
  it('check team passes the clean workbook, with the catalogue of the installed Orkeon', async () => {
    const { team, check, runner } = setup();
    const result = await check.execute(team);
    expect(result).toMatchObject({ team: 'mail-triage', check: 'team', status: 'pass', errors: 0, warnings: 0, findings: [], skipped: [], tests: null });
    expect(result.ids.acceptance).toEqual(['AC-01', 'AC-02', 'AC-03']);
    expect(runner.calls).toEqual([{ command: 'orkeon', args: ['run', '--list-tools'] }]);
    expect(runner.timeouts).toEqual([20_000]);
  });

  it('check team --tests reads the tests of the four folders, and nothing beside them', async () => {
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
    const result = await check.execute(team, { tests: true });
    expect(result).toMatchObject({ status: 'pass', findings: [], tests: { files: 6, uncovered: [], orphans: [] } });
  });

  it('check team --tests finds a test below a sub-folder, and a team without tests', async () => {
    const { team, check, fileSystem } = setup();
    fileSystem.addFile(`${TESTS}/unit/tools/extra.test.js`, '// nothing cited');
    const result = await check.execute(team, { tests: true });
    expect(result.findings.map((finding) => [finding.code, finding.artefact])).toEqual([['test-orphan', 'unit/tools/extra.test.js']]);
    expect(result.tests).toEqual({ files: 7, uncovered: [], orphans: ['unit/tools/extra.test.js'] });

    for (const folder of ['static', 'unit', 'component', 'e2e']) {
      await fileSystem.remove(`${TESTS}/${folder}`);
    }
    const none = await check.execute(team, { tests: true });
    expect(none.findings[0]).toMatchObject({ code: 'tests-none', artefact: 'tests' });
    expect(none.tests).toMatchObject({ files: 0, orphans: [] });
  });

  it('check team --tests reports a link to nothing as a finding, and does not enter a folder reached through a link', async () => {
    const { team, check, fileSystem } = setup();
    fileSystem.addLink(`${TESTS}/component/dangling.scenario.json`, '/nonexistent').addLink(`${TESTS}/unit/loop`, `${TESTS}/unit`).addLink(`${TESTS}/e2e/shared`, `${TESTS}/component`);
    const result = await check.execute(team, { tests: true });
    expect(result.findings).toEqual([{ severity: 'error', code: 'test-unreadable', artefact: 'component/dangling.scenario.json', section: null, message: 'the file cannot be read: a link to nothing, or no file' }]);
    expect(result.tests).toEqual({ files: 7, uncovered: [], orphans: [] });
  });

  it('reads neither STATUS.md nor the tests unless asked', async () => {
    const { team, check, fileSystem, paths } = setup();
    await fileSystem.remove(paths.statusFile);
    const result = await check.execute(team);
    expect(result).toMatchObject({ check: 'team', status: 'pass', findings: [], skipped: [], tests: null });
  });

  it('reports the faulty team: exit data for the command, the findings in order, each under its part', async () => {
    const { team, check, fileSystem, paths } = setup();
    fileSystem.addFile(paths.teamFile, workbookFixture('faulty/TEAM.md'));
    const result = await check.execute(team);
    expect(result).toMatchObject({ status: 'fail', errors: 5, warnings: 2 });
    expect(result.findings.map((finding) => `${finding.code} ${finding.artefact} § ${String(finding.section)}`)).toEqual([
      'unknown-tool TEAM.md § Design § Agents',
      'task-reads TEAM.md § Design § Tasks and DAG',
      'deliverable TEAM.md § Design § Deliverables and schemas',
      'batch-id TEAM.md § Plan § Batches',
      'coverage TEAM.md § Plan § Batches',
      'deliverable-orphan TEAM.md § Design § Deliverables and schemas',
      'deliverable-orphan TEAM.md § Design § Tasks and DAG',
    ]);
  });

  it.each([
    ['orkeon is not on the PATH', NOT_FOUND, 'orkeon not found on PATH: tool names were not checked'],
    ['orkeon fails', failed(3, 'boom'), 'orkeon run --list-tools exited 3: tool names were not checked'],
    ['orkeon does not exit', { found: true, exitCode: null, stdout: '', stderr: '', stopped: 'timeout' as const }, 'orkeon run --list-tools did not exit (killed or timed out): tool names were not checked'],
    ['orkeon lists nothing', succeeded('Orkeon 1.0\n\n'), 'orkeon run --list-tools returned no tool: tool names were not checked'],
  ])('skips the tool catalogue when %s, and judges no tool name', async (_name, listTools, reason) => {
    const { team, check, fileSystem, paths } = setup(listTools);
    fileSystem.addFile(paths.teamFile, workbookFixture('faulty/TEAM.md'));
    const result = await check.execute(team, { commandTimeoutMs: 50 });
    expect(result.skipped).toEqual([{ check: 'tool-catalogue', reason }]);
    expect(result.findings.map((finding) => finding.code)).toEqual(['task-reads', 'deliverable', 'batch-id', 'coverage', 'deliverable-orphan', 'deliverable-orphan']);
  });

  it('fails with file-not-found when TEAM.md is missing, naming the step that writes it', async () => {
    const { team, check, fileSystem } = setup();
    await fileSystem.remove(`${WORKBOOK}/TEAM.md`);
    await expect(check.execute(team)).rejects.toMatchObject({ code: 'file-not-found', message: `TEAM.md not found: ${WORKBOOK}/TEAM.md — /team-init writes it` });
  });

  it('reports a missing bench configuration as a finding, not as a missing artefact', async () => {
    const { team, check, fileSystem, paths } = setup();
    await fileSystem.remove(paths.benchConfigFile);
    const result = await check.execute(team);
    expect(result.status).toBe('fail');
    expect(result.findings).toEqual([{ severity: 'error', code: 'config-missing', artefact: 'bench.config.json', section: null, message: 'tests/<slug>/bench.config.json does not exist: `/team-spec` writes it' }]);
  });

  it('writes nothing', async () => {
    const { team, check, fileSystem } = setup();
    const before = await fileSystem.digest('/home/tester/Orkeon');
    await check.execute(team, { tests: true });
    expect(await fileSystem.digest('/home/tester/Orkeon')).toEqual(before);
    expect(fileSystem.locked).toEqual([]);
  });
});
