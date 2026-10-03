import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../src/application/use-cases/read-status.js';
import { DomainError } from '../../src/domain/errors.js';
import { teamPaths, teamRefInWorkshop } from '../../src/domain/team-ref.js';
import { demoTeam } from '../fakes/fixture-team.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

describe('ReadStatus', () => {
  it('reads the front matter and the log of the fixture team', async () => {
    const { team, fileSystem } = demoTeam();
    const reading = await new ReadStatus(fileSystem).execute(team);
    expect(reading.status).toEqual({
      phase: 'design',
      gate_passed: 'design',
      track: 'full',
      iteration: 0,
      attempt: null,
      batch: null,
      verdict: null,
      next_action: '/team-tests',
      updated_at: '2026-09-30T19:12:00Z',
    });
    expect(reading.log).toHaveLength(4);
    expect(reading.log[0]).toBe('2026-09-30 10:02 — /team-init — workbook and tests created (DEC-0001)');
    expect(reading.log[3]).toBe('2026-09-30 19:12 — /team-design — DESIGN.md, PLAN.md validated (gate 3)');
    expect(reading.warnings).toEqual([]);
  });

  it('reads the status the harness hooks are tested with', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(
      teamPaths(team).statusFile,
      '---\nphase: build\ngate_passed: design\nattempt: ATT-0002\nbatch: B1\nverdict: null\nnext_action: /team-build B1\nupdated_at: 2026-09-30T19:12:00Z\n---\n\n- 2026-09-30 19:12 — /team-build — B1 opened\n',
    );
    const reading = await new ReadStatus(fileSystem).execute(team);
    expect(reading.status).toMatchObject({ phase: 'build', gate_passed: 'design', track: 'full', iteration: 0, attempt: 'ATT-0002', batch: 'B1' });
    expect(reading.log).toEqual(['2026-09-30 19:12 — /team-build — B1 opened']);
  });

  it('reads the workbook of a team that has no folder yet, and the state an ITERATE leaves (D35, D38)', async () => {
    const team = teamRefInWorkshop('/home/tester/Orkeon', 'fresh');
    const fileSystem = new InMemoryFileSystem().addFile(
      teamPaths(team).statusFile,
      '---\nphase: build\ngate_passed: tests\ntrack: light\niteration: 1\nattempt: ATT-0003\nbatch: B1\nverdict: ITERATE\nnext_action: /team-build B1\nupdated_at: 2026-10-03T09:00:00Z\n---\n',
    );
    const reading = await new ReadStatus(fileSystem).execute(team);
    expect(reading.status).toMatchObject({ phase: 'build', gate_passed: 'tests', track: 'light', iteration: 1, verdict: 'ITERATE' });
    expect(reading.warnings).toEqual([]);
  });

  it('refuses a batch written with the L prefix of the test levels', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(teamPaths(team).statusFile, '---\nphase: build\nattempt: ATT-0002\nbatch: L1\nnext_action: /team-build\nupdated_at: 2026-09-30T19:12:00Z\n---\n');
    await expect(new ReadStatus(fileSystem).execute(team)).rejects.toThrow(/batch: expected a batch id such as B1/);
  });

  it('reports the inconsistencies of a readable status as warnings', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(teamPaths(team).statusFile, '---\nphase: need\ngate_passed: design\nnext_action: /team-need\nupdated_at: 2026-09-30T19:12:00Z\n---\n');
    const reading = await new ReadStatus(fileSystem).execute(team);
    expect(reading.warnings).toEqual(['gate_passed (design) is ahead of phase (need)']);
  });

  it('fails with file-not-found when STATUS.md is missing', async () => {
    const { team } = demoTeam();
    await expect(new ReadStatus(new InMemoryFileSystem()).execute(team)).rejects.toMatchObject({ code: 'file-not-found' });
  });

  it('surfaces domain errors of the front matter', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(teamPaths(team).statusFile, '---\nphase: nowhere\n---\n');
    await expect(new ReadStatus(fileSystem).execute(team)).rejects.toThrow(DomainError);
  });
});
