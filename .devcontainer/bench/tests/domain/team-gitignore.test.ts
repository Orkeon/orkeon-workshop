import { describe, expect, it } from 'vitest';

import { bindMount } from '../../src/domain/mounts/mount-binding.js';
import { renderTeamGitignore, teamFolders } from '../../src/domain/mounts/team-gitignore.js';
import { parseVirtualRoot } from '../../src/domain/mounts/virtual-root.js';

const TEAM = '/workspace/teams/mail-triage';

function gitignore(...paths: string[]): string[] {
  const bindings = paths.map((path, index) => bindMount({ root: parseVirtualRoot(`/point-${String(index)}`), access: 'rw', role: 'state', default: path }, path, 'default', TEAM));
  return renderTeamGitignore(bindings)
    .split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe('renderTeamGitignore', () => {
  it('keeps each folder of a mount point through its .gitkeep, in declaration order, once each', () => {
    expect(gitignore('./mailbox', './output', 'mailbox', '/srv/archive')).toEqual(['/mailbox/*', '!/mailbox/.gitkeep', '/output/*', '!/output/.gitkeep']);
  });

  it('puts a folder after the one that holds it, and takes it back with every folder between them', () => {
    expect(gitignore('./data/a/logs', './output', './data')).toEqual([
      '/output/*',
      '!/output/.gitkeep',
      '/data/*',
      '!/data/.gitkeep',
      '!/data/a/',
      '/data/a/*',
      '!/data/a/logs/',
      '/data/a/logs/*',
      '!/data/a/logs/.gitkeep',
    ]);
  });

  it('takes back a folder between two only once, so that the second inner folder leaves the first kept', () => {
    expect(gitignore('./data', './data/a/x', './data/a/y', './data/a/y/z')).toEqual([
      '/data/*',
      '!/data/.gitkeep',
      '!/data/a/',
      '/data/a/*',
      '!/data/a/x/',
      '/data/a/x/*',
      '!/data/a/x/.gitkeep',
      '!/data/a/y/',
      '/data/a/y/*',
      '!/data/a/y/.gitkeep',
      '!/data/a/y/z/',
      '/data/a/y/z/*',
      '!/data/a/y/z/.gitkeep',
    ]);
  });

  it('does not take a folder sharing a prefix for one inside', () => {
    expect(gitignore('./data', './database')).toEqual(['/data/*', '!/data/.gitkeep', '/database/*', '!/database/.gitkeep']);
  });

  it('escapes the characters git reads as wildcards, in a taken-back folder too', () => {
    expect(gitignore('./in [1]', './in [1]/a*/b')).toEqual(['/in \\[1]/*', '!/in \\[1]/.gitkeep', '!/in \\[1]/a\\*/', '/in \\[1]/a\\*/*', '!/in \\[1]/a\\*/b/', '/in \\[1]/a\\*/b/*', '!/in \\[1]/a\\*/b/.gitkeep']);
  });
});

describe('teamFolders', () => {
  it('lists the folders inside the team, relative, without the outside ones', () => {
    const bindings = ['./a', '/srv/b', 'C:\\c', './a', `${TEAM}/d/e`].map((path, index) =>
      bindMount({ root: parseVirtualRoot(`/p${String(index)}`), access: 'ro', role: 'inputs', default: path }, path, 'default', TEAM),
    );
    expect(teamFolders(bindings)).toEqual(['a', 'd/e']);
  });
});
