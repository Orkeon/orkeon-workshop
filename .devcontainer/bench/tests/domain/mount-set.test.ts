import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { isMountSetName, mountPointFolder, mountSetFolder, parseMountSet, resolveMountSet } from '../../src/domain/mounts/mount-set.js';
import { parseVirtualRoot } from '../../src/domain/mounts/virtual-root.js';
import { fixture } from '../fakes/fixture-team.js';

const TEAM = '/workspace/teams/demo';
const demo = (): unknown => JSON.parse(fixture('workshop/teams/demo/mounts.json'));

describe('parseMountSet', () => {
  it('parses the fixture mounts.json', () => {
    const set = parseMountSet(demo());
    expect(set.mounts.map((mount) => `${mount.root}:${mount.access}`)).toEqual(['/workspace:ro', '/output:rw', '/state:rw']);
  });

  it('takes mount points of any name and number', () => {
    const set = parseMountSet({
      mounts: [
        { root: '/mailbox', access: 'ro', role: 'mailbox', default: './mailbox' },
        { root: '/drafts', access: 'rwnd', role: 'deliverables', default: './drafts' },
      ],
    });
    expect(set.version).toBe(1);
    expect(set.mounts.map((mount) => mount.root)).toEqual(['/mailbox', '/drafts']);
  });

  it('refuses the environments of the first format and says what replaced them', () => {
    const mounts = [{ root: '/output', access: 'rw', role: 'deliverables', default: './output' }];
    expect(() => parseMountSet({ mounts, environments: { prod: { '/output': '/srv/out' } } })).toThrow(
      /environments: replaced by mount sets: a named set is the folder mounts\.<name>\/<team>\/ next to teams\//,
    );
    expect(() => parseMountSet({ mounts, environments: null })).toThrow(/environments: replaced by mount sets/);
  });

  it('rejects duplicate roots', () => {
    const mounts = [
      { root: '/output', access: 'rw', role: 'deliverables', default: './output' },
      { root: '/output', access: 'ro', role: 'reference', default: './ref' },
    ];
    expect(() => parseMountSet({ mounts })).toThrow(/duplicate root \/output/);
  });

  it('rejects an empty mount list and another version', () => {
    const mounts = [{ root: '/output', access: 'rw', role: 'deliverables', default: './output' }];
    expect(() => parseMountSet({ mounts: [] })).toThrow(DomainError);
    expect(() => parseMountSet({ version: 2, mounts })).toThrow(DomainError);
  });

  it.each(['~/inbox', '$HOME/inbox', '%USERPROFILE%\\inbox'])('rejects the unexpanded default %s', (path) => {
    expect(() => parseMountSet({ mounts: [{ root: '/workspace', access: 'ro', role: 'inputs', default: path }] })).toThrow(/mounts\.0\.default: not expanded/);
  });

  it.each(['/crew', '/script', '/llm-logs', '/sandbox', '/credentials'])('rejects the reserved root %s with the reason', (root) => {
    expect(() => parseMountSet({ mounts: [{ root, access: 'rw', role: 'state', default: './s' }] })).toThrow(/reserved/);
  });

  it('rejects a writable /plugins, naming the mount point', () => {
    const mounts = [
      { root: '/notes', access: 'ro', role: 'inputs', default: './notes' },
      { root: '/plugins', access: 'rw', role: 'reference', default: './plugins' },
    ];
    expect(() => parseMountSet({ mounts })).toThrow(
      'invalid mounts.json: mounts.1.access: /plugins is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it "access": "ro", or its agents could drop code that the next run executes',
    );
  });
});

describe('mount set folders', () => {
  it('puts a named set two levels above the team folder, under the team name', () => {
    expect(mountSetFolder(TEAM, 'test')).toBe('/workspace/mounts.test/demo');
    expect(mountSetFolder('/workspace/library/examples/teams/mail-triage', 'demo')).toBe('/workspace/library/examples/mounts.demo/mail-triage');
  });

  it('names the folder of a mount point after the point, without its slash', () => {
    expect(mountPointFolder(parseVirtualRoot('/mailbox'))).toBe('mailbox');
    expect(mountPointFolder(parseVirtualRoot('/workspace'))).toBe('workspace');
  });

  it.each([
    ['test', true],
    ['demo-2', true],
    ['Test', false],
    ['2nd', false],
    ['a_b', false],
    ['', false],
  ])('accepts %j as a set name: %s', (name, expected) => {
    expect(isMountSetName(name)).toBe(expected);
  });
});

describe('resolveMountSet', () => {
  it('binds the defaults in declaration order and builds the orkeon run arguments', () => {
    const resolution = resolveMountSet(parseMountSet(demo()), TEAM);
    expect(resolution.environment).toBe('default');
    expect(resolution.setFolder).toBeNull();
    expect(resolution.allowExternal).toBe(false);
    expect(resolution.arguments).toEqual([
      '--mount',
      `${TEAM}/input:/workspace:ro`,
      `${TEAM}/output:/output:rw`,
      `${TEAM}/state:/state:rw`,
    ]);
    expect(resolution.studioMounts).toEqual(['./input:/workspace:ro', './output:/output:rw', './state:/state:rw']);
    expect(resolution.warnings).toEqual([]);
  });

  it('refuses a default folder the agents must never reach, and warns about one Studio would refuse', () => {
    const point = (path: string): unknown => ({ mounts: [{ root: '/drafts', access: 'rw', role: 'deliverables', default: path }] });
    expect(() => resolveMountSet(parseMountSet(point('.')), TEAM)).toThrow(/^mounts\.json: \/drafts is bound to the team folder itself/);
    const machine = { home: '/home/node', workshop: null, orkeonSettings: null };
    expect(() => resolveMountSet(parseMountSet(point('/home/node/.claude')), TEAM, 'default', machine)).toThrow(
      'mounts.json: /drafts is bound to /home/node/.claude, inside a hidden folder of the home folder, where tools keep their settings and credentials: its agents would reach it — bind a folder of its own',
    );
    expect(resolveMountSet(parseMountSet(point('/srv/drafts')), TEAM).warnings).toEqual([expect.stringContaining('/drafts is bound to /srv/drafts, outside the team folder')]);
  });

  it('judges only the default set: the folders of a named set lie outside the team by construction', () => {
    expect(resolveMountSet(parseMountSet(demo()), TEAM, 'test').warnings).toEqual([]);
  });

  it('binds every point of a named set to its folder in mounts.<name>/<team>/, all external', () => {
    const resolution = resolveMountSet(parseMountSet(demo()), TEAM, 'test');
    expect(resolution.setFolder).toBe('/workspace/mounts.test/demo');
    expect(resolution.bindings.map((binding) => [binding.root, binding.physicalPath, binding.external, binding.environment])).toEqual([
      ['/workspace', '/workspace/mounts.test/demo/workspace', true, 'test'],
      ['/output', '/workspace/mounts.test/demo/output', true, 'test'],
      ['/state', '/workspace/mounts.test/demo/state', true, 'test'],
    ]);
    expect(resolution.arguments).toEqual([
      '--mount',
      '/workspace/mounts.test/demo/workspace:/workspace:ro',
      '/workspace/mounts.test/demo/output:/output:rw',
      '/workspace/mounts.test/demo/state:/state:rw',
      '--allow-external-mounts',
    ]);
    expect(resolution.studioMounts[0]).toBe('/workspace/mounts.test/demo/workspace:/workspace:ro');
  });

  it.each(['Staging', '__proto__', 'toString', 'a b', '../x'])('refuses the set name %j before any path is built', (name) => {
    expect(() => resolveMountSet(parseMountSet(demo()), TEAM, name)).toThrow(`unknown environment "${name}": a mount set is named in kebab-case`);
  });
});
