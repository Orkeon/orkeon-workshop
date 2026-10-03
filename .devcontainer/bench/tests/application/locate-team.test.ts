import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../src/application/errors.js';
import { LocateTeam } from '../../src/application/teams/locate-team.js';
import { WORKSHOP_ENV, workshopRoot } from '../../src/application/workshop.js';
import { DomainError } from '../../src/domain/errors.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

describe('workshopRoot', () => {
  it('defaults to ~/Orkeon, the host convention, when ORKEON_WORKSHOP is unset', () => {
    expect(workshopRoot(new FakeEnvironment({}, '/home/user'))).toBe('/home/user/Orkeon');
  });

  it('honours ORKEON_WORKSHOP', () => {
    expect(workshopRoot(new FakeEnvironment({ [WORKSHOP_ENV]: '/mnt/work/' }))).toBe('/mnt/work');
    expect(workshopRoot(new FakeEnvironment({ [WORKSHOP_ENV]: '  ' }, '/home/x'))).toBe('/home/x/Orkeon');
  });
});

describe('LocateTeam', () => {
  const fileSystem = new InMemoryFileSystem().addDirectory('/home/tester/Orkeon/teams/demo').addDirectory('/elsewhere/other');
  const locate = new LocateTeam(fileSystem, new FakeEnvironment({}, '/home/tester', '/elsewhere'));

  it('looks a slug up under <workshop>/teams', async () => {
    await expect(locate.execute('demo')).resolves.toEqual({ slug: 'demo', folder: '/home/tester/Orkeon/teams/demo' });
  });

  it('takes an absolute or relative path as the team folder', async () => {
    await expect(locate.execute('/elsewhere/other/')).resolves.toEqual({ slug: 'other', folder: '/elsewhere/other' });
    await expect(locate.execute('./other')).resolves.toEqual({ slug: 'other', folder: '/elsewhere/other' });
  });

  it('finds a team by its workbook or its tests alone: its folder comes with the first build batch (D35)', async () => {
    const early = new InMemoryFileSystem().addDirectory('/home/tester/Orkeon/workbooks/fresh').addDirectory('/home/tester/Orkeon/tests/planned');
    const locateEarly = new LocateTeam(early, new FakeEnvironment({}, '/home/tester'));
    await expect(locateEarly.execute('fresh')).resolves.toEqual({ slug: 'fresh', folder: '/home/tester/Orkeon/teams/fresh' });
    await expect(locateEarly.execute('planned')).resolves.toEqual({ slug: 'planned', folder: '/home/tester/Orkeon/teams/planned' });
    await expect(locateEarly.execute('/home/tester/Orkeon/teams/fresh')).resolves.toMatchObject({ slug: 'fresh' });
  });

  it('fails with team-not-found when none of its folder, workbook and tests exists', async () => {
    await expect(locate.execute('ghost')).rejects.toMatchObject({ code: 'team-not-found' } satisfies Partial<ApplicationError>);
    await expect(locate.execute('ghost')).rejects.toThrow(
      'team not found: none of /home/tester/Orkeon/teams/ghost, /home/tester/Orkeon/workbooks/ghost, /home/tester/Orkeon/tests/ghost exists',
    );
    const files = new InMemoryFileSystem().addFile('/home/tester/Orkeon/workbooks/ghost', 'a file, not a folder');
    await expect(new LocateTeam(files, new FakeEnvironment({}, '/home/tester')).execute('ghost')).rejects.toMatchObject({ code: 'team-not-found' });
  });

  it('rejects a malformed slug before touching the file system', async () => {
    await expect(locate.execute('Demo Team')).rejects.toThrow(DomainError);
  });
});
