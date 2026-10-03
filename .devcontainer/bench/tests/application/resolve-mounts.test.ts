import { describe, expect, it } from 'vitest';

import { ResolveMounts } from '../../src/application/use-cases/resolve-mounts.js';
import { DomainError } from '../../src/domain/errors.js';
import { WORKSHOP, demoTeam } from '../fakes/fixture-team.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

describe('ResolveMounts', () => {
  it("turns mounts.json into the orkeon run arguments of the team's own folders", async () => {
    const { team, fileSystem } = demoTeam();
    const resolution = await new ResolveMounts(fileSystem).execute(team);
    expect(resolution.arguments).toEqual([
      '--mount',
      `${team.folder}/input:/workspace:ro`,
      `${team.folder}/output:/output:rw`,
      `${team.folder}/state:/state:rw`,
    ]);
  });

  it('binds a named set that exists, and adds --allow-external-mounts', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addDirectory(`${WORKSHOP}/mounts.test/demo`);
    const resolution = await new ResolveMounts(fileSystem).execute(team, 'test');
    expect(resolution.setFolder).toBe(`${WORKSHOP}/mounts.test/demo`);
    expect(resolution.arguments).toContain(`${WORKSHOP}/mounts.test/demo/workspace:/workspace:ro`);
    expect(resolution.arguments.at(-1)).toBe('--allow-external-mounts');
  });

  it('refuses a set without a folder for this team, naming the folder and the sets that exist', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addDirectory(`${WORKSHOP}/mounts.demo/demo`).addDirectory(`${WORKSHOP}/mounts.test/demo`).addDirectory(`${WORKSHOP}/mounts.other/another-team`);
    fileSystem.addDirectory(`${WORKSHOP}/mounts.Bad/demo`).addFile(`${WORKSHOP}/mounts.txt`, '');
    await expect(new ResolveMounts(fileSystem).execute(team, 'staging')).rejects.toMatchObject({
      code: 'invalid-input',
      message: `unknown environment "staging": ${WORKSHOP}/mounts.staging/demo does not exist (known: default, demo, test)`,
    });
  });

  it('judges the team folders against the folders of the machine it is given', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(`${team.folder}/mounts.json`, JSON.stringify({ mounts: [{ root: '/notes', access: 'ro', role: 'inputs', default: '/srv/ws/settings/demo' }] }));
    expect((await new ResolveMounts(fileSystem).execute(team)).warnings).toEqual([expect.stringContaining('/notes is bound to /srv/ws/settings/demo, outside the team folder')]);
    await expect(new ResolveMounts(fileSystem, { home: null, workshop: '/srv/ws', orkeonSettings: null }).execute(team)).rejects.toThrow(
      'mounts.json: /notes is bound to /srv/ws/settings/demo, inside the settings of every team: its agents would reach it — bind a folder of its own',
    );
  });

  it('refuses a set name that is not kebab-case before looking at the disk', async () => {
    const { team, fileSystem } = demoTeam();
    await expect(new ResolveMounts(fileSystem).execute(team, '../x')).rejects.toThrow(DomainError);
  });

  it('fails with file-not-found when mounts.json is missing', async () => {
    const { team } = demoTeam();
    await expect(new ResolveMounts(new InMemoryFileSystem()).execute(team)).rejects.toMatchObject({ code: 'file-not-found' });
  });

  it('fails with invalid-input on malformed JSON', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(`${team.folder}/mounts.json`, '{ mounts: [ }');
    await expect(new ResolveMounts(fileSystem).execute(team)).rejects.toMatchObject({ code: 'invalid-input' });
  });
});
