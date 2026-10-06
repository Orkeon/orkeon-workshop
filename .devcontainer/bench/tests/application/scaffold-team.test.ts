import { describe, expect, it } from 'vitest';

import { ScaffoldTeam } from '../../src/application/use-cases/scaffold-team.js';
import { teamPaths, teamRefInWorkshop } from '../../src/domain/team-ref.js';
import { WORKSHOP } from '../fakes/fixture-team.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const team = teamRefInWorkshop(WORKSHOP, 'mail-triage');
const paths = teamPaths(team);
const MOUNTS = JSON.stringify({
  mounts: [
    { root: '/mailbox', access: 'ro', role: 'mailbox', default: './mailbox' },
    { root: '/output', access: 'rw', role: 'deliverables', default: './output' },
    { root: '/archive', access: 'ro', role: 'archive', default: '/srv/archive' },
  ],
});

/** A YAML crew as the generator skill writes it: config.yaml beside one file per agent and per task. */
function withYamlCrew(fileSystem: InMemoryFileSystem): InMemoryFileSystem {
  return fileSystem
    .addFile(`${paths.crew}/config.yaml`, 'name: mail-triage\n')
    .addFile(`${paths.crew}/agents/triager.yaml`, 'role: Triager\n')
    .addFile(`${paths.crew}/tasks/triage.yaml`, 'agent: triager\n');
}

function yamlTeam(mounts: string = MOUNTS): InMemoryFileSystem {
  return withYamlCrew(new InMemoryFileSystem().addFile(paths.mountsFile, mounts));
}

const MACHINE = { home: '/home/tester', workshop: null, orkeonSettings: null };

describe('ScaffoldTeam', () => {
  it('writes both launchers, the mounts of the card and the folders of the mount points inside the team', async () => {
    const fileSystem = yamlTeam();
    const result = await new ScaffoldTeam(fileSystem).execute(team);
    expect(result).toEqual({
      kind: 'yaml',
      target: 'crew',
      written: ['run.sh', 'run.cmd', 'studio-team.json', '.gitignore'],
      created: ['mailbox', 'output'],
      placeholders: ['mailbox/.gitkeep', 'output/.gitkeep'],
      studioMounts: ['./mailbox:/mailbox:ro', './output:/output:rw', '/srv/archive:/archive:ro'],
      warnings: [expect.stringMatching(/^\/archive is bound to \/srv\/archive, outside the team folder: Orkeon Studio launches the team only when/)],
    });
    expect(fileSystem.isExecutable(paths.runSh)).toBe(true);
    expect(fileSystem.isExecutable(paths.runCmd)).toBe(false);
    expect(await fileSystem.readText(paths.runSh)).toContain('"\\"$DIR/mailbox\\":/mailbox:ro"');
    expect(await fileSystem.readText(paths.runCmd)).toContain('\r\n');
    expect(await fileSystem.isDirectory(`${team.folder}/mailbox`)).toBe(true);
    expect(await fileSystem.isDirectory('/srv/archive')).toBe(false);
    expect(await fileSystem.readText(`${team.folder}/mailbox/.gitkeep`)).toBe('');
    expect((await fileSystem.readText(paths.gitignore)).split('\n').filter((line) => !line.startsWith('#'))).toEqual([
      '/mailbox/*',
      '!/mailbox/.gitkeep',
      '/output/*',
      '!/output/.gitkeep',
      '',
    ]);
    expect(JSON.parse(await fileSystem.readText(paths.studioCard))).toEqual({
      name: 'mail-triage',
      description: '',
      mounts: ['./mailbox:/mailbox:ro', './output:/output:rw', '/srv/archive:/archive:ro'],
    });
  });

  it('replaces only the mounts of an existing card, in place, and creates no folder or .gitkeep twice', async () => {
    const fileSystem = yamlTeam()
      .addDirectory(`${team.folder}/mailbox`)
      .addFile(`${team.folder}/mailbox/.gitkeep`, '')
      .addFile(paths.studioCard, JSON.stringify({ name: 'Mail triage', mounts: ['./input:/workspace:ro'], profile: 'local', extra: 1 }));
    const result = await new ScaffoldTeam(fileSystem).execute(team);
    expect(result.created).toEqual(['output']);
    expect(result.placeholders).toEqual(['output/.gitkeep']);
    const card = JSON.parse(await fileSystem.readText(paths.studioCard)) as Record<string, unknown>;
    expect(Object.keys(card)).toEqual(['name', 'mounts', 'profile', 'extra']);
    expect(card.mounts).toEqual(['./mailbox:/mailbox:ro', './output:/output:rw', '/srv/archive:/archive:ro']);
  });

  it('starts the script of a TypeScript crew', async () => {
    const fileSystem = new InMemoryFileSystem().addFile(paths.mountsFile, MOUNTS).addFile(`${paths.crew}/crew.ork.ts`, 'globalThis.crew = crew;\n');
    const result = await new ScaffoldTeam(fileSystem).execute(team);
    expect(result).toMatchObject({ kind: 'typescript', target: 'crew/crew.ork.ts' });
    expect(await fileSystem.readText(paths.runSh)).toContain('exec orkeon run "$DIR/crew/crew.ork.ts" "$@" --mount');
  });

  it('refuses a folder without a crew, a single-file crew, and a YAML crew beside a script, and writes nothing then', async () => {
    await expect(new ScaffoldTeam(new InMemoryFileSystem().addFile(paths.mountsFile, MOUNTS)).execute(team)).rejects.toThrow(/no crew to launch/);
    const single = new InMemoryFileSystem().addFile(paths.mountsFile, MOUNTS).addFile(`${paths.crew}/config.yaml`, 'name: mail-triage\nagents: {}\n');
    await expect(new ScaffoldTeam(single).execute(team)).rejects.toThrow(`no crew to launch in ${paths.crew}: write crew/config.yaml with crew/agents/ and crew/tasks/`);
    const both = yamlTeam().addFile(`${paths.crew}/crew.ork.ts`, '');
    await expect(new ScaffoldTeam(both).execute(team)).rejects.toThrow(
      `${paths.crew} holds both a YAML crew (agents/, tasks/) and crew.ork.ts: orkeon run refuses such a folder as ambiguous, and Studio finds no crew in it`,
    );
    expect(await both.exists(paths.runSh)).toBe(false);
  });

  it('reads the flat triplet as a YAML crew', async () => {
    const fileSystem = new InMemoryFileSystem()
      .addFile(paths.mountsFile, MOUNTS)
      .addFile(`${paths.crew}/crew.yaml`, '')
      .addFile(`${paths.crew}/agents.yaml`, '')
      .addFile(`${paths.crew}/tasks.yaml`, '');
    expect(await new ScaffoldTeam(fileSystem).execute(team)).toMatchObject({ kind: 'yaml', target: 'crew' });
  });

  it.each([
    ['.', 'the team folder itself'],
    ['./crew', 'inside crew/'],
    ['./_shared', 'Orkeon looks for _shared/appsettings.json in the team folder'],
    ['./appsettings', 'Orkeon looks for appsettings/appsettings.json in the team folder'],
    ['/home/tester/.claude', 'inside a hidden folder of the home folder'],
    ['../other/output', 'inside another team'],
    [`${WORKSHOP}/workbooks/mail-triage`, 'inside the workbooks of every team, with the approvals of paid runs'],
  ])('refuses a mount point bound to %s, and writes nothing then', async (path, reason) => {
    const fileSystem = yamlTeam(JSON.stringify({ mounts: [{ root: '/drafts', access: 'rw', role: 'deliverables', default: path }] }));
    await expect(new ScaffoldTeam(fileSystem, MACHINE).execute(team)).rejects.toThrow(reason);
    expect(await fileSystem.exists(paths.runSh)).toBe(false);
    expect(await fileSystem.exists(paths.gitignore)).toBe(false);
  });

  it('escapes the characters a .gitignore pattern would read as wildcards', async () => {
    const fileSystem = yamlTeam(JSON.stringify({ mounts: [{ root: '/drafts', access: 'rw', role: 'deliverables', default: './drafts [v2]' }] }));
    await new ScaffoldTeam(fileSystem).execute(team);
    expect(await fileSystem.readText(paths.gitignore)).toContain('/drafts \\[v2]/*\n!/drafts \\[v2]/.gitkeep\n');
  });

  it('creates a folder that holds another, reports both, and takes the inner one back in the .gitignore', async () => {
    const mounts = JSON.stringify({
      mounts: [
        { root: '/state', access: 'rw', role: 'state', default: './data/state' },
        { root: '/logs', access: 'rw', role: 'state', default: './data/a/logs' },
        { root: '/data', access: 'rw', role: 'deliverables', default: './data' },
      ],
    });
    const fileSystem = yamlTeam(mounts);
    const result = await new ScaffoldTeam(fileSystem).execute(team);
    expect(result.created).toEqual(['data/state', 'data/a/logs', 'data']);
    expect(result.placeholders).toEqual(['data/state/.gitkeep', 'data/a/logs/.gitkeep', 'data/.gitkeep']);
    expect((await fileSystem.readText(paths.gitignore)).split('\n').filter((line) => !line.startsWith('#'))).toEqual([
      '/data/*',
      '!/data/.gitkeep',
      '!/data/state/',
      '/data/state/*',
      '!/data/state/.gitkeep',
      '!/data/a/',
      '/data/a/*',
      '!/data/a/logs/',
      '/data/a/logs/*',
      '!/data/a/logs/.gitkeep',
      '',
    ]);
  });

  it('refuses a card that is not a JSON object, and writes nothing then', async () => {
    const fileSystem = yamlTeam().addFile(paths.studioCard, '[]');
    await expect(new ScaffoldTeam(fileSystem).execute(team)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(await fileSystem.exists(paths.runSh)).toBe(false);
  });

  it('needs mounts.json', async () => {
    const fileSystem = new InMemoryFileSystem().addFile(`${paths.crew}/config.yaml`, '');
    await expect(new ScaffoldTeam(fileSystem).execute(team)).rejects.toMatchObject({ code: 'file-not-found' });
  });

  it('turns a write failure into write-failed', async () => {
    const fileSystem = yamlTeam().addDirectory(paths.runSh);
    await expect(new ScaffoldTeam(fileSystem).execute(team)).rejects.toMatchObject({ code: 'write-failed' });
  });
});
