import { describe, expect, it } from 'vitest';

import { bindMount } from '../../src/domain/mounts/mount-binding.js';
import type { MountDeclaration } from '../../src/domain/mounts/mount-declaration.js';
import { UNKNOWN_MACHINE, judgeMountReach, type MachineFolders, type MountReach } from '../../src/domain/mounts/mount-reach.js';
import { parseVirtualRoot } from '../../src/domain/mounts/virtual-root.js';

// The cases of the spec of the rule (D40): team /ws/teams/alpha, home /home/u, ORKEON_WORKSHOP=/ws.
const TEAM = '/ws/teams/alpha';
const MACHINE: MachineFolders = { home: '/home/u', workshop: '/ws', orkeonSettings: null };

function judge(path: string, machine: MachineFolders = MACHINE, team: string = TEAM): MountReach {
  const declaration: MountDeclaration = { root: parseVirtualRoot('/notes'), access: 'rw', role: 'inputs', default: path };
  return judgeMountReach([bindMount(declaration, path, 'default', team)], team, machine);
}

const accepted: MountReach = { errors: [], warnings: [] };
const refused = (error: string): MountReach => ({ errors: [error], warnings: [] });
const holds = (path: string, what: string): MountReach => refused(`/notes is bound to ${path}, which holds ${what}: its agents would reach it — bind a folder of its own`);
const inside = (path: string, what: string): MountReach => refused(`/notes is bound to ${path}, inside ${what}: its agents would reach it — bind a folder of its own`);
const outside = (path: string): MountReach => ({
  errors: [],
  warnings: [
    `/notes is bound to ${path}, outside the team folder: Orkeon Studio launches the team only when this folder is declared, spelled exactly, in its Authorized folders (a container path never matches there)`,
  ],
});
const windows = (path: string): MountReach => ({
  errors: [],
  warnings: [`/notes is bound to the Windows path ${path}: the container cannot bind it, and Orkeon Studio only when it is declared, spelled exactly, in its Authorized folders`],
});

const HOME = "the home folder, with the settings and credentials of the machine's tools";
const SETTINGS = 'the settings of every team';
const SETTINGS_WALK = 'a folder where Orkeon looks for the settings of every run above the crews';
const HIDDEN = 'a hidden folder of the home folder, where tools keep their settings and credentials';
const APP_DATA = "the user's application data, with Orkeon Studio's settings and the tokens of its mail accounts";
const ORKEON_SETTINGS = "the machine's Orkeon settings and the OAuth tokens of its mail accounts";
const PROC = 'the environment of every process, with the key of the model';

describe('judgeMountReach: inside the team', () => {
  it.each(['.', './', TEAM, '/WS/Teams/Alpha'])('1. refuses the team folder itself: %s', (path) => {
    expect(judge(path)).toEqual(
      refused(
        '/notes is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as ./notes',
      ),
    );
  });

  it.each([
    ['./crew', 'crew'],
    ['./Crew/x', 'Crew/x'],
    ['/ws/teams/ALPHA/crew', 'crew'],
    ['./notes/../crew', 'crew'],
  ])('2. refuses %s, inside crew/', (path, spelled) => {
    expect(judge(path)).toEqual(
      refused(
        `/notes is bound to ./${spelled}, inside crew/: its agents would reach the definition of the team, and on a writable point change it or leave an appsettings.json that the next run reads — bind a folder of its own`,
      ),
    );
  });

  it.each(['./agents', './Tasks', './tasks/in'])('3. accepts %s: Studio and orkeon run read crew/ first, whatever the root holds', (path) => {
    expect(judge(path)).toEqual(accepted);
  });

  it.each([
    ['./appsettings', 'appsettings', 'appsettings'],
    ['./_shared/x', '_shared/x', '_shared'],
  ])('4. refuses %s, a name Orkeon keeps for settings', (path, spelled, name) => {
    expect(judge(path)).toEqual(
      refused(
        `/notes is bound to ./${spelled}: Orkeon looks for ${name}/appsettings.json in the team folder when it searches for settings above crew/, so that name is kept for settings — name the folder otherwise`,
      ),
    );
  });

  it.each(['./data/agents', './inbox', 'inbox', `${TEAM}/drafts`, '../alpha/output', './crewmates'])('5. accepts %s without a warning', (path) => {
    expect(judge(path)).toEqual(accepted);
  });
});

describe('judgeMountReach: outside the team', () => {
  it.each([
    ['/', '/', 'the whole file system'],
    ['/home/u', '/home/u', HOME],
    ['/home', '/home', HOME],
    ['/ws', '/ws', 'the workshop'],
    ['/WS', '/WS', 'the workshop'],
    ['../..', '/ws', 'the workshop'],
    ['/ws/teams', '/ws/teams', 'every team'],
    ['..', '/ws/teams', 'every team'],
    ['/ws/settings', '/ws/settings', SETTINGS],
    ['/ws/references', '/ws/references', 'the reference documents Claude builds teams from'],
    ['/ws/.devcontainer', '/ws/.devcontainer', "the workshop's container configuration, which runs at its next start"],
    ['/ws/teams/appsettings', '/ws/teams/appsettings', SETTINGS_WALK],
    ['/ws/_shared', '/ws/_shared', SETTINGS_WALK],
    ['/appsettings', '/appsettings', SETTINGS_WALK],
    ['/proc', '/proc', PROC],
    ['/ws/mounts.test', '/ws/mounts.test', 'the mount sets of every team'],
  ])('6-10, 15-18, 21, 24. refuses %s, which holds a guarded folder', (path, shown, what) => {
    expect(judge(path)).toEqual(holds(shown, what));
  });

  it.each([
    ['/ws/settings/alpha', '/ws/settings/alpha', SETTINGS],
    ['../../settings/beta', '/ws/settings/beta', SETTINGS],
    ['/ws/workbooks/alpha', '/ws/workbooks/alpha', 'the workbooks of every team, with the approvals of paid runs'],
    ['/ws/tests/alpha/datasets', '/ws/tests/alpha/datasets', 'the tests of every team, with their budgets'],
    ['/ws/.claude/skills', '/ws/.claude/skills', 'the harness'],
    ['/ws/library/datasets', '/ws/library/datasets', "the workshop's library, which other teams are built from"],
    ['/ws/.git/hooks', '/ws/.git/hooks', "the workshop's git repository, whose hooks run at the next git command"],
    ['/ws/teams/_shared/x', '/ws/teams/_shared/x', SETTINGS_WALK],
    ['/home/u/.ssh', '/home/u/.ssh', HIDDEN],
    ['/home/u/.config/gh', '/home/u/.config/gh', HIDDEN],
    ['/home/u/.config/Orkeon', '/home/u/.config/Orkeon', HIDDEN],
    ['/home/u/.claude', '/home/u/.claude', HIDDEN],
    ['/home/u/AppData/Roaming/Orkeon', '/home/u/AppData/Roaming/Orkeon', APP_DATA],
    ['/proc/1', '/proc/1', PROC],
  ])('10-14, 16, 17, 19-21. refuses %s, inside a guarded folder', (path, shown, what) => {
    expect(judge(path)).toEqual(inside(shown, what));
  });

  it.each([
    ['/ws/teams/beta/inbox', '/ws/teams/beta/inbox'],
    ['/ws/teams/alphabet', '/ws/teams/alphabet'],
    ['../alpha-archive', '/ws/teams/alpha-archive'],
    ['/ws/Teams/Beta', '/ws/Teams/Beta'],
  ])('22. refuses %s, inside another team', (path, shown) => {
    expect(judge(path)).toEqual(
      refused(`/notes is bound to ${shown}, inside another team: the agents of a team never reach the folders of another — share through a folder of its own`),
    );
  });

  it('23. refuses a folder of the mount set of another team', () => {
    expect(judge('/ws/mounts.test/beta/inbox')).toEqual(
      refused(
        '/notes is bound to /ws/mounts.test/beta/inbox, inside a mount set of another team: the agents of a team never reach the folders of another — share through a folder of its own',
      ),
    );
  });

  it.each(['/ws/mounts.test/alpha/inbox', '/ws/inbox', '/home/u/projects/in', '/srv/archive'])(
    '25. lets %s through, with the warning that Studio needs it declared',
    (path) => {
      expect(judge(path)).toEqual(outside(path));
    },
  );

  it('26. guards the configured workshop too, for a team of another workshop', () => {
    const team = '/srv/x/teams/gamma';
    expect(judge('/ws/settings', MACHINE, team)).toEqual(holds('/ws/settings', SETTINGS));
    expect(judge('/ws/teams/alpha', MACHINE, team)).toEqual(
      refused('/notes is bound to /ws/teams/alpha, inside another team: the agents of a team never reach the folders of another — share through a folder of its own'),
    );
    expect(judge('/srv/x/settings/gamma', MACHINE, team)).toEqual(inside('/srv/x/settings/gamma', SETTINGS));
  });

  it("27. guards $XDG_CONFIG_HOME/Orkeon, the machine's Orkeon settings", () => {
    const machine: MachineFolders = { ...MACHINE, orkeonSettings: '/cfg/Orkeon' };
    expect(judge('/cfg/Orkeon', machine)).toEqual(holds('/cfg/Orkeon', ORKEON_SETTINGS));
    expect(judge('/cfg/Orkeon/x', machine)).toEqual(inside('/cfg/Orkeon/x', ORKEON_SETTINGS));
    expect(judge('/cfg', machine)).toEqual(holds('/cfg', ORKEON_SETTINGS));
    expect(judge('/cfg/Orkeon')).toEqual(outside('/cfg/Orkeon'));
  });

  it('names the team folder held by a folder that is not its workshop', () => {
    expect(judge('/srv/x/crews', MACHINE, '/srv/x/crews/gamma')).toEqual(holds('/srv/x/crews', 'the team folder'));
  });
});

describe('judgeMountReach: Windows paths', () => {
  it.each([
    ['C:\\Users\\me', HOME],
    ['C:\\Users\\me\\Orkeon\\settings', SETTINGS],
    ['c:/users/ME/orkeon/', 'the workshop'],
    ['C:\\Users\\me\\Orkeon\\teams', 'every team'],
  ])('28. refuses %s, which holds a guarded folder of the Windows host', (path, what) => {
    expect(judge(path)).toEqual(holds(path, what));
  });

  it.each([
    ['C:\\Users\\me\\.claude', HIDDEN],
    ['C:\\Users\\me\\AppData\\Roaming\\Orkeon', APP_DATA],
    ['C:\\Users\\me\\Orkeon\\tests\\alpha', 'the tests of every team, with their budgets'],
    ['C:\\Users\\me\\Orkeon\\teams\\_shared\\x', SETTINGS_WALK],
  ])('28. refuses %s, inside a guarded folder of the Windows host', (path, what) => {
    expect(judge(path)).toEqual(inside(path, what));
  });

  it('28. refuses a reserved folder of the team as spelled on the Windows host', () => {
    expect(judge('C:\\Users\\me\\Orkeon\\teams\\alpha\\crew').errors).toEqual([
      '/notes is bound to ./crew, inside crew/: its agents would reach the definition of the team, and on a writable point change it or leave an appsettings.json that the next run reads — bind a folder of its own',
    ]);
    expect(judge('C:\\Users\\me\\Orkeon\\Teams\\Alpha\\Crew\\x\\').errors[0]).toMatch(/^\/notes is bound to \.\/Crew\/x, inside crew\//);
    expect(judge('C:\\Users\\me\\Orkeon\\teams\\alpha').errors[0]).toMatch(/^\/notes is bound to the team folder itself/);
  });

  it('resolves . and .. in a Windows path as the host does before judging it', () => {
    const settings = 'C:\\Users\\me\\Orkeon\\teams\\alpha\\..\\..\\settings\\alpha';
    expect(judge(settings)).toEqual(inside(settings, SETTINGS));
    expect(judge('C:\\Users\\me\\Orkeon\\teams\\alpha\\.\\crew').errors[0]).toMatch(/^\/notes is bound to \.\/crew, inside crew\//);
    expect(judge('C:\\Users\\me\\Orkeon\\teams\\alpha\\notes\\..').errors[0]).toMatch(/^\/notes is bound to the team folder itself/);
    expect(judge('C:\\..\\Users\\me')).toEqual(holds('C:\\..\\Users\\me', HOME));
    expect(judge('C:\\Users\\me\\\\Orkeon\\\\settings')).toEqual(holds('C:\\Users\\me\\\\Orkeon\\\\settings', SETTINGS));
  });

  it('refuses another team of the Windows workshop', () => {
    expect(judge('C:\\Users\\me\\Orkeon\\teams\\beta\\inbox').errors).toEqual([
      '/notes is bound to C:\\Users\\me\\Orkeon\\teams\\beta\\inbox, inside another team: the agents of a team never reach the folders of another — share through a folder of its own',
    ]);
  });

  it.each(['C:\\Users\\me\\Orkeon\\teams\\alpha\\inbox', 'C:\\Users\\me\\Documents\\in', 'D:\\Data\\in', '\\\\nas\\share\\in', 'C:\\Users'])(
    '29. only warns about %s, which the container cannot bind',
    (path) => {
      expect(judge(path)).toEqual(windows(path));
    },
  );
});

describe('judgeMountReach: a folder name ending with a dot or a space', () => {
  it.each([
    ['./crew.', 'crew.'],
    ['./notes ', 'notes '],
    ['./notes./in', 'notes.'],
    ['/srv/data./in', 'data.'],
    ['C:\\Data\\in.', 'in.'],
    ['./...', '...'],
  ])('refuses %s: Windows drops the dot or the space', (path, name) => {
    expect(judge(path)).toEqual(
      refused(
        `/notes is bound to ${path}, whose folder name "${name}" ends with a dot or a space: Windows drops them, so on the host Orkeon Studio and run.cmd would bind another folder — name the folder without them`,
      ),
    );
  });

  it.each(['./notes/', './notes/.', './a/../notes', './.notes'])('lets %s through: . and .. are resolved, a leading dot is kept', (path) => {
    expect(judge(path)).toEqual(accepted);
  });
});

describe('judgeMountReach: what it is given', () => {
  it('leaves out the folders of the home when it is unknown', () => {
    expect(judge('/home/u/.ssh', UNKNOWN_MACHINE)).toEqual(outside('/home/u/.ssh'));
    expect(judge('/home/u/AppData/x', { ...MACHINE, home: null })).toEqual(outside('/home/u/AppData/x'));
    expect(judge('/', UNKNOWN_MACHINE)).toEqual(holds('/', 'the whole file system'));
    expect(judge('/ws/settings', UNKNOWN_MACHINE)).toEqual(holds('/ws/settings', SETTINGS));
  });

  it('ignores a blank or relative folder of the machine, and a configured workshop that is the team’s own', () => {
    const blank: MachineFolders = { home: '  ', workshop: '', orkeonSettings: 'cfg/Orkeon' };
    expect(judge('/home/u/.ssh', blank)).toEqual(outside('/home/u/.ssh'));
    expect(judge('/cfg/Orkeon/x', blank)).toEqual(outside('/cfg/Orkeon/x'));
    expect(judge('/WS/Settings/', { ...MACHINE, workshop: ' /WS/ ' })).toEqual(holds('/WS/Settings', SETTINGS));
  });

  it('judges the path as written: a symbolic link is not followed, only . and .. are resolved', () => {
    expect(judge('./inbox/../../beta')).toEqual(
      refused('/notes is bound to /ws/teams/beta, inside another team: the agents of a team never reach the folders of another — share through a folder of its own'),
    );
    expect(judge('/srv//archive/')).toEqual(outside('/srv/archive'));
  });

  it('reports every binding, in order', () => {
    const declarations: MountDeclaration[] = [
      { root: parseVirtualRoot('/one'), access: 'rw', role: 'state', default: '.' },
      { root: parseVirtualRoot('/two'), access: 'ro', role: 'inputs', default: '/srv/two' },
      { root: parseVirtualRoot('/three'), access: 'ro', role: 'inputs', default: './_shared' },
      { root: parseVirtualRoot('/four'), access: 'ro', role: 'inputs', default: 'D:\\four' },
    ];
    const bindings = declarations.map((declaration) => bindMount(declaration, declaration.default, 'default', TEAM));
    const { errors, warnings } = judgeMountReach(bindings, TEAM, MACHINE);
    expect(errors.map((error) => error.split(' ')[0])).toEqual(['/one', '/three']);
    expect(warnings.map((warning) => warning.split(' ')[0])).toEqual(['/two', '/four']);
  });
});
