import { describe, expect, it } from 'vitest';

import { findOpenAttempt, findUnclosedAttempt, updateOpenAttempt } from '../../src/application/attempts/attempt-store.js';
import { ApproveRemote } from '../../src/application/use-cases/approve-remote.js';
import { CloseAttempt } from '../../src/application/use-cases/close-attempt.js';
import { OpenAttempt } from '../../src/application/use-cases/open-attempt.js';
import { withRuns } from '../../src/domain/attempt.js';
import { parseId } from '../../src/domain/ids.js';
import { teamPaths, teamRefInWorkshop } from '../../src/domain/team-ref.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { WORKSHOP, demoTeam, fixture } from '../fakes/fixture-team.js';
import type { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const ATTEMPTS = `${WORKSHOP}/workbooks/demo/attempts`;
const CLOCK = new FixedClock(new Date('2026-09-30T19:12:00Z'));
const ORKEON = { 'orkeon --version': succeeded('orkeon 1.0.0-rc.4.src.20261006.g77ac8a9') };

function setup(commands: ConstructorParameters<typeof FakeProcessRunner>[0] = ORKEON, onRun?: ConstructorParameters<typeof FakeProcessRunner>[1]) {
  const { team, fileSystem } = demoTeam();
  const open = new OpenAttempt(fileSystem, new FakeProcessRunner(commands, onRun), CLOCK);
  const close = new CloseAttempt(fileSystem, new FixedClock(new Date('2026-10-01T08:00:00Z')));
  const approve = new ApproveRemote(fileSystem, CLOCK);
  return { team, fileSystem, open, close, approve };
}

async function manifest(fileSystem: InMemoryFileSystem, id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fileSystem.readText(`${ATTEMPTS}/${id}/manifest.json`)) as Record<string, unknown>;
}

describe('OpenAttempt', () => {
  it('opens ATT-0001 with its manifest and a snapshot of the crew and of mounts.json', async () => {
    const { team, fileSystem, open } = setup();
    fileSystem.addFile(`${team.folder}/crew/config.yaml`, 'name: demo\n').addFile(`${team.folder}/crew/tools/score/domain.ts`, 'export {};\n');
    const opened = await open.execute(team, 'team-build');
    expect(opened).toMatchObject({ id: 'ATT-0001', folder: `${ATTEMPTS}/ATT-0001` });
    expect(await manifest(fileSystem, 'ATT-0001')).toEqual({
      attempt: 'ATT-0001',
      opened_at: '2026-09-30T19:12:00.000Z',
      closed_at: null,
      opened_by: 'team-build',
      design_snapshot: 'design-snapshot/',
      orkeon_version: '1.0.0-rc.4.src.20261006.g77ac8a9',
      runs: [],
      remote_approval: null,
      verdict: null,
    });
    expect(opened.manifest).toEqual(await manifest(fileSystem, 'ATT-0001'));
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/design-snapshot/crew/config.yaml`)).toBe('name: demo\n');
    expect(await fileSystem.exists(`${ATTEMPTS}/ATT-0001/design-snapshot/crew/tools/score/domain.ts`)).toBe(true);
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/design-snapshot/mounts.json`)).toBe(await fileSystem.readText(teamPaths(team).mountsFile));
    expect((await fileSystem.readText(`${ATTEMPTS}/ATT-0001/manifest.json`)).endsWith('}\n')).toBe(true);
    expect(fileSystem.locked.every((path) => path === `${ATTEMPTS}/.lock`)).toBe(true);
  });

  it('writes the manifest before anything that takes time: the folder never stands without one', async () => {
    const seen: unknown[] = [];
    const { team, fileSystem, open } = setup(ORKEON, async (line) => {
      if (line === 'orkeon --version') {
        seen.push(JSON.parse(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/manifest.json`)));
      }
    });
    fileSystem.addFile(`${team.folder}/crew/config.yaml`, 'name: demo\n');
    await open.execute(team);
    expect(seen).toEqual([expect.objectContaining({ attempt: 'ATT-0001', closed_at: null, orkeon_version: 'unknown', design_snapshot: null })]);
  });

  it('opens before the team has a crew, without a snapshot, by hand by default, whatever orkeon answers', async () => {
    const { team, fileSystem, open } = setup({ 'orkeon --version': failed(1, 'boom') });
    const opened = await open.execute(team, '  ');
    expect(opened.manifest).toMatchObject({ design_snapshot: null, opened_by: 'manual', orkeon_version: 'unknown' });
    expect(await fileSystem.exists(`${ATTEMPTS}/ATT-0001/design-snapshot`)).toBe(false);
    expect((await setup({}).open.execute(team)).manifest.orkeon_version).toBe('unknown');
  });

  it('refuses a name that is not one short line, before it creates anything', async () => {
    const { team, fileSystem, open } = setup();
    await expect(open.execute(team, 'a\nb')).rejects.toThrow('--by names who opens the attempt in one short line');
    expect(await fileSystem.exists(ATTEMPTS)).toBe(false);
  });

  it('refuses a second open attempt, then numbers the next one after the closed ones', async () => {
    const { team, open, close } = setup();
    await open.execute(team);
    await expect(open.execute(team)).rejects.toMatchObject({
      code: 'invalid-input',
      message: 'ATT-0001 is still open for demo: close it with `orkeon-bench attempt close demo` before opening another',
    });
    await close.execute(team);
    expect((await open.execute(team)).id).toBe('ATT-0002');
  });

  it('lets one of two commands started together open the attempt, and tells the other it is open', async () => {
    const { team, fileSystem, open } = setup();
    fileSystem.addFile(`${team.folder}/crew/config.yaml`, 'name: demo\n');
    const results = await Promise.allSettled([open.execute(team, 'first'), open.execute(team, 'second'), open.execute(team, 'third')]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    for (const refused of results.slice(1)) {
      expect((refused as PromiseRejectedResult).reason).toMatchObject({ code: 'invalid-input', message: expect.stringContaining('ATT-0001 is still open for demo') });
    }
    expect(await fileSystem.list(ATTEMPTS)).toEqual(['ATT-0001']);
    expect(await manifest(fileSystem, 'ATT-0001')).toMatchObject({ opened_by: 'first', closed_at: null, design_snapshot: 'design-snapshot/' });
  });

  it('never takes a folder that exists: the name of an attempt is taken by creating it', async () => {
    const { team, fileSystem, open } = setup();
    // A process that does not take the lock creates the folder between the listing that names it and its creation.
    const list = fileSystem.list.bind(fileSystem);
    let listings = 0;
    fileSystem.list = async (path: string) => {
      const names = await list(path);
      if (path === ATTEMPTS && (listings += 1) === 2) {
        fileSystem.addDirectory(`${ATTEMPTS}/ATT-0001`);
      }
      return names;
    };
    fileSystem.addDirectory(ATTEMPTS);
    await expect(open.execute(team)).rejects.toThrow('ATT-0001 was opened by another command at the same moment: nothing was opened twice');
    expect(await fileSystem.exists(`${ATTEMPTS}/ATT-0001/manifest.json`)).toBe(false);
  });

  it('needs the workbook, not the team folder', async () => {
    const { fileSystem, open } = setup();
    await expect(open.execute(teamRefInWorkshop(WORKSHOP, 'ghost'))).rejects.toMatchObject({
      code: 'file-not-found',
      message: `no workbook for ghost: ${WORKSHOP}/workbooks/ghost does not exist (/team-init creates it)`,
    });
    fileSystem.addDirectory(`${WORKSHOP}/workbooks/early`);
    expect((await open.execute(teamRefInWorkshop(WORKSHOP, 'early'))).manifest.design_snapshot).toBeNull();
  });
});

describe('an attempt folder without a manifest', () => {
  it('stops every command but close, each naming the command that gets out of it', async () => {
    const { team, fileSystem, open, approve } = setup();
    fileSystem.addDirectory(`${ATTEMPTS}/ATT-0001`);
    const message = `${ATTEMPTS}/ATT-0001 has no manifest.json — an \`attempt open\` that was interrupted, or a folder made by hand: \`orkeon-bench attempt close demo\` closes it`;
    await expect(open.execute(team)).rejects.toMatchObject({ code: 'invalid-input', message });
    await expect(approve.execute(team, '1')).rejects.toMatchObject({ message });
    await expect(findOpenAttempt(fileSystem, team)).rejects.toMatchObject({ message });
    expect(await findUnclosedAttempt(fileSystem, team)).toEqual({ id: 'ATT-0001', folder: `${ATTEMPTS}/ATT-0001`, manifest: null, broken: null });
  });

  it('is closed as abandoned by attempt close, and the next attempt opens', async () => {
    const { team, fileSystem, open, close } = setup();
    fileSystem.addDirectory(`${ATTEMPTS}/ATT-0001`);
    await expect(close.execute(team, 'ITERATE')).rejects.toThrow('ATT-0001 has no manifest that can be read: it can only be closed as abandoned, without a verdict');
    const closed = await close.execute(team);
    expect(closed).toMatchObject({ id: 'ATT-0001', abandoned: true, kept: null });
    expect(await manifest(fileSystem, 'ATT-0001')).toMatchObject({ closed_at: '2026-10-01T08:00:00.000Z', opened_by: 'unknown', verdict: null });
    expect(await findUnclosedAttempt(fileSystem, team)).toBeNull();
    expect((await open.execute(team)).id).toBe('ATT-0002');
  });
});

describe('two dead ends made by hand', () => {
  it('says what a plain file named like an attempt is, and how to get out of it', async () => {
    const { team, fileSystem, open, close, approve } = setup();
    fileSystem.addFile(`${ATTEMPTS}/ATT-0009`, 'notes taken by hand\n');
    const message = `${ATTEMPTS}/ATT-0009 is a file, not an attempt folder: only orkeon-bench creates attempts, as folders — move that file away or remove it`;
    await expect(open.execute(team)).rejects.toMatchObject({ code: 'invalid-input', message });
    await expect(close.execute(team)).rejects.toMatchObject({ message });
    await expect(approve.execute(team, '1')).rejects.toMatchObject({ message });
    await fileSystem.remove(`${ATTEMPTS}/ATT-0009`);
    expect((await open.execute(team)).id).toBe('ATT-0001');
  });

  it('stops on a manifest that cannot be read, naming attempt close — which abandons the attempt and keeps the file', async () => {
    const { team, fileSystem, open, close, approve } = setup();
    await open.execute(team);
    const file = `${ATTEMPTS}/ATT-0001/manifest.json`;
    for (const [broken, why] of [
      ['{ "attempt": "ATT-0001", "closed_at": nul', 'is not valid JSON'],
      ['{"attempt": "ATT-0001", "opened_at": "x"}', 'invalid attempt manifest'],
    ] as const) {
      fileSystem.addFile(file, broken);
      const stopped = { code: 'invalid-input', message: expect.stringMatching(new RegExp(`^the manifest\\.json of ${ATTEMPTS}/ATT-0001 cannot be read \\(.*${why}.*\\): \`orkeon-bench attempt close demo\` closes it$`)) };
      await expect(open.execute(team)).rejects.toMatchObject(stopped);
      await expect(approve.execute(team, '1')).rejects.toMatchObject(stopped);
      await expect(findOpenAttempt(fileSystem, team)).rejects.toMatchObject(stopped);
      await expect(close.execute(team, 'ITERATE')).rejects.toThrow('ATT-0001 has no manifest that can be read: it can only be closed as abandoned, without a verdict');
      const closed = await close.execute(team);
      expect(closed).toMatchObject({ id: 'ATT-0001', abandoned: true, kept: `${ATTEMPTS}/ATT-0001/manifest.broken.json` });
      expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/manifest.broken.json`)).toBe(broken);
      expect(await manifest(fileSystem, 'ATT-0001')).toMatchObject({ closed_at: '2026-10-01T08:00:00.000Z', verdict: null, note: 'closed as abandoned: its manifest could not be read, and is kept as manifest.broken.json' });
      expect(await findUnclosedAttempt(fileSystem, team)).toBeNull();
    }
    expect((await open.execute(team)).id).toBe('ATT-0002');
  });
});

describe('CloseAttempt', () => {
  it('closes the open attempt, with the verdict when given', async () => {
    const { team, fileSystem, open, close } = setup();
    await open.execute(team);
    const closed = await close.execute(team, 'ITERATE');
    expect(closed).toMatchObject({ abandoned: false, manifest: { closed_at: '2026-10-01T08:00:00.000Z', verdict: 'ITERATE' } });
    expect(await manifest(fileSystem, 'ATT-0001')).toMatchObject({ closed_at: '2026-10-01T08:00:00.000Z', verdict: 'ITERATE' });
    expect(await findOpenAttempt(fileSystem, team)).toBeNull();
  });

  it('has nothing to close without an open attempt', async () => {
    const { team, open, close } = setup();
    const none = { code: 'invalid-input', message: 'no open attempt for demo: open one with `orkeon-bench attempt open demo`' };
    await expect(close.execute(team)).rejects.toMatchObject(none);
    await open.execute(team);
    await close.execute(team);
    await expect(close.execute(team)).rejects.toMatchObject(none);
  });

  it('closes ACCEPTED only on a report of the attempt whose verdict input accepts', async () => {
    const { team, fileSystem, open, close } = setup();
    await open.execute(team);
    const report = `${ATTEMPTS}/ATT-0001/report.json`;
    await expect(close.execute(team, 'ACCEPTED')).rejects.toMatchObject({
      code: 'invalid-input',
      message: 'ATT-0001 cannot be closed ACCEPTED: it has no report.json — an attempt is accepted on the report of a run (`orkeon-bench run`)',
    });
    const accepted = JSON.parse(fixture('reports/accepted-report.json')) as { acceptance: Record<string, { status: string }>; verdict_input: Record<string, boolean> };
    fileSystem.addFile(report, JSON.stringify({ ...accepted, schema_version: '0.9' }));
    await expect(close.execute(team, 'ACCEPTED')).rejects.toThrow(`ATT-0001 cannot be closed ACCEPTED: ${report} is not a valid report`);
    fileSystem.addFile(report, JSON.stringify({ ...accepted, acceptance: { ...accepted.acceptance, 'AC-02': { status: 'not_run', level: 'e2e_local', evidence: '' } } }));
    await expect(close.execute(team, 'ACCEPTED')).rejects.toThrow(`${report} is not a valid report`);
    fileSystem.addFile(report, JSON.stringify({ ...accepted, acceptance: { ...accepted.acceptance, 'AC-02': { status: 'not_run', level: 'e2e_local', evidence: '' } }, verdict_input: { ...accepted.verdict_input, all_ac_pass: false } }));
    await expect(close.execute(team, 'ACCEPTED')).rejects.toThrow('ATT-0001 cannot be closed ACCEPTED: its report does not accept — all_ac_pass=false all_inv_pass=true indicators_in_range=true');
    expect((await manifest(fileSystem, 'ATT-0001')).closed_at).toBeNull();
    fileSystem.addFile(report, JSON.stringify(accepted));
    expect((await close.execute(team, 'ACCEPTED')).manifest.verdict).toBe('ACCEPTED');
  });

  it('closes with another verdict whatever the report says', async () => {
    const { team, open, close } = setup();
    await open.execute(team);
    expect((await close.execute(team, 'BLOCKED')).manifest.verdict).toBe('BLOCKED');
  });

  it('finds the highest open attempt, as the hooks do', async () => {
    const { team, fileSystem } = setup();
    const entry = (id: string, closedAt: string | null): string => JSON.stringify({ attempt: id, opened_at: 'x', closed_at: closedAt, opened_by: 'me', design_snapshot: null, orkeon_version: '' });
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/manifest.json`, entry('ATT-0001', null)).addFile(`${ATTEMPTS}/ATT-0002/manifest.json`, entry('ATT-0002', '2026-10-01T08:00:00Z')).addFile(`${ATTEMPTS}/notes.md`, '').addFile(`${ATTEMPTS}/.lock`, '');
    expect((await findOpenAttempt(fileSystem, team))?.id).toBe('ATT-0001');
  });
});

describe('a manifest changed by two commands', () => {
  it('is changed as it stands, not as an earlier read left it', async () => {
    const { team, fileSystem, open, approve } = setup();
    const opened = await open.execute(team);
    await approve.execute(team, '1');
    const run = parseId('RUN', 'RUN-20260930-1912-stub');
    const updated = await updateOpenAttempt(fileSystem, team, opened.id, (current) => withRuns(current, [run]));
    expect(updated.manifest).toMatchObject({ runs: [run], remote_approval: { estimated_usd: 1 } });
    expect(await manifest(fileSystem, 'ATT-0001')).toMatchObject({ runs: [run], remote_approval: { estimated_usd: 1 } });
  });

  it('refuses the change once the attempt is closed', async () => {
    const { team, fileSystem, open, close } = setup();
    const opened = await open.execute(team);
    await close.execute(team);
    await expect(updateOpenAttempt(fileSystem, team, opened.id, (current) => current)).rejects.toThrow('ATT-0001 is no longer the open attempt of demo: it was closed while this command was running');
    expect((await manifest(fileSystem, 'ATT-0001')).closed_at).toBe('2026-10-01T08:00:00.000Z');
  });
});

describe('ApproveRemote', () => {
  it('writes the marker the run gate reads, and the same approval in the manifest', async () => {
    const { team, fileSystem, open, approve } = setup();
    await open.execute(team);
    const record = await approve.execute(team, ' 1.50 ');
    const approval = { by: 'user', at: '2026-09-30T19:12:00.000Z', estimated_usd: 1.5, cap_usd: 2, source: '/team-approve remote 1.50' };
    expect(record).toEqual({ attempt: 'ATT-0001', file: `${ATTEMPTS}/ATT-0001/remote-approval.json`, approval });
    expect(JSON.parse(await fileSystem.readText(record.file))).toEqual(approval);
    expect((await manifest(fileSystem, 'ATT-0001')).remote_approval).toEqual(approval);
  });

  it('reads a bench configuration saved with a byte order mark, as jq does', async () => {
    const { team, fileSystem, open, approve } = setup();
    await open.execute(team);
    const config = teamPaths(team).benchConfigFile;
    fileSystem.addFile(config, `﻿${await fileSystem.readText(config)}`);
    expect((await approve.execute(team, '1')).approval.cap_usd).toBe(2);
  });

  it('writes nothing when anything is missing: an amount, an open attempt, a cap, room under the cap', async () => {
    const { team, fileSystem, open, close, approve } = setup();
    const marker = `${ATTEMPTS}/ATT-0001/remote-approval.json`;
    await expect(approve.execute(team, '1')).rejects.toThrow('no open attempt for demo');
    await open.execute(team);
    await expect(approve.execute(team, 'a lot')).rejects.toThrow('"a lot" is not an amount of USD');
    await expect(approve.execute(team, '2.5')).rejects.toThrow('2.5 USD is above the cap of 2 USD');
    const config = teamPaths(team).benchConfigFile;
    const stated = await fileSystem.readText(config);
    fileSystem.addFile(config, '[]');
    await expect(approve.execute(team, '1')).rejects.toThrow('invalid bench.config.json');
    for (const content of ['{}', '{"budget": {"local_minutes_max": 30}}']) {
      fileSystem.addFile(config, content);
      await expect(approve.execute(team, '1'), content).rejects.toThrow(`no cap for a remote run: ${config} states no budget.remote_usd_max`);
    }
    await fileSystem.remove(config);
    await expect(approve.execute(team, '1')).rejects.toMatchObject({ code: 'file-not-found', message: expect.stringContaining('no cap for a remote run') });
    fileSystem.addFile(config, stated);
    expect(await fileSystem.exists(marker)).toBe(false);
    expect((await manifest(fileSystem, 'ATT-0001')).remote_approval).toBeNull();
    await close.execute(team);
    await expect(approve.execute(team, '1')).rejects.toThrow('no open attempt for demo');
    expect(await fileSystem.exists(marker)).toBe(false);
  });
});
