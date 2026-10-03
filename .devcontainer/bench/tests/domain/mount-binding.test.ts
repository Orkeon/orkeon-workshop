import { describe, expect, it } from 'vitest';

import { bindMount, mountArgument, mountArguments, mountPathSegment, studioMountSpec } from '../../src/domain/mounts/mount-binding.js';
import { mountDeclarationSchema } from '../../src/domain/mounts/mount-declaration.js';

const TEAM = '/workspace/teams/demo';
const inputs = mountDeclarationSchema.parse({ root: '/workspace', access: 'ro', role: 'inputs', default: './input' });
const outputs = mountDeclarationSchema.parse({ root: '/output', access: 'rw', role: 'deliverables', default: './output' });

describe('bindMount', () => {
  it('resolves a relative binding against the team folder', () => {
    const binding = bindMount(inputs, './input', 'default', TEAM);
    expect(binding.physicalPath).toBe(`${TEAM}/input`);
    expect(binding.relativePath).toBe('./input');
    expect(binding.external).toBe(false);
    expect(binding.environment).toBe('default');
    expect(binding.declaredPath).toBe('./input');
  });

  it('keeps an absolute binding and flags it external when outside the team folder', () => {
    const binding = bindMount(inputs, '/srv/shared/inbox', 'prod', TEAM);
    expect(binding.physicalPath).toBe('/srv/shared/inbox');
    expect(binding.relativePath).toBeNull();
    expect(binding.external).toBe(true);
  });

  it('does not flag an absolute path inside the team folder', () => {
    const binding = bindMount(inputs, `${TEAM}/data/in`, 'default', TEAM);
    expect(binding.external).toBe(false);
    expect(binding.relativePath).toBe('./data/in');
  });

  it('flags a relative path that escapes the team folder', () => {
    expect(bindMount(inputs, '../other-team/input', 'default', TEAM).external).toBe(true);
  });

  it('is not fooled by a sibling folder sharing the prefix', () => {
    expect(bindMount(inputs, `${TEAM}-archive/input`, 'default', TEAM).external).toBe(true);
  });

  it.each(['C:\\Shares\\inbox', 'D:/data/in', '\\\\nas\\share\\inbox'])('keeps the Windows host path %s verbatim and external', (path) => {
    const binding = bindMount(inputs, path, 'prod', TEAM);
    expect(binding).toMatchObject({ physicalPath: path, relativePath: null, external: true });
    expect(mountArgument(binding)).toBe(`${path}:/workspace:ro`);
    expect(studioMountSpec(binding)).toBe(`${path}:/workspace:ro`);
  });
});

describe('mount arguments', () => {
  it('formats physical:virtual:access with an absolute physical path', () => {
    expect(mountArgument(bindMount(outputs, './output', 'default', TEAM))).toBe(`${TEAM}/output:/output:rw`);
  });

  it('puts every binding under one --mount flag, in order', () => {
    const bindings = [bindMount(inputs, './input', 'default', TEAM), bindMount(outputs, './output', 'default', TEAM)];
    expect(mountArguments(bindings)).toEqual(['--mount', `${TEAM}/input:/workspace:ro`, `${TEAM}/output:/output:rw`]);
  });

  it('appends --allow-external-mounts as soon as one binding is external', () => {
    const bindings = [bindMount(inputs, '/srv/inbox', 'prod', TEAM), bindMount(outputs, './output', 'prod', TEAM)];
    const args = mountArguments(bindings);
    expect(args.filter((arg) => arg === '--mount')).toHaveLength(1);
    expect(args.at(-1)).toBe('--allow-external-mounts');
  });

  it('yields nothing for no bindings', () => {
    expect(mountArguments([])).toEqual([]);
  });
});

describe('mountPathSegment', () => {
  it.each([
    ['/srv/a:b', '"/srv/a:b"'],
    ['/srv/a;b', '"/srv/a;b"'],
    ['/srv/say "hi"', '"/srv/say ""hi"""'],
    ['C:\\Shares\\', '"C:\\Shares\\"'],
    ['C:\\Shares\\a:b', '"C:\\Shares\\a:b"'],
    ['inbox|2', '"inbox|2"'],
    ['./a:b', '"./a:b"'],
  ])("quotes %s as Orkeon's mount grammar needs it: %s", (path, segment) => {
    expect(mountPathSegment(path)).toBe(segment);
  });

  it.each(['/srv/inbox', 'C:\\Shares\\inbox', 'd:/data/in', '\\\\nas\\share', './my notes', '/srv/a|b', './x|y', '/srv/$HOME'])('leaves %s as it is', (path) => {
    expect(mountPathSegment(path)).toBe(path);
  });

  it('quotes the path of the orkeon run argument and of the Studio card, never the virtual root', () => {
    expect(mountArgument(bindMount(inputs, '/srv/a:b;c', 'default', TEAM))).toBe('"/srv/a:b;c":/workspace:ro');
    expect(studioMountSpec(bindMount(inputs, './in;box', 'default', TEAM))).toBe('"./in;box":/workspace:ro');
    expect(mountArgument(bindMount(inputs, './in;box', 'default', TEAM))).toBe(`"${TEAM}/in;box":/workspace:ro`);
  });
});

describe('Studio card mounts', () => {
  it('writes ./-relative paths for bindings inside the team folder', () => {
    expect(studioMountSpec(bindMount(inputs, 'input', 'default', TEAM))).toBe('./input:/workspace:ro');
    expect(studioMountSpec(bindMount(outputs, `${TEAM}/output`, 'default', TEAM))).toBe('./output:/output:rw');
  });

  it('keeps an external binding absolute', () => {
    expect(studioMountSpec(bindMount(inputs, '/srv/inbox', 'prod', TEAM))).toBe('/srv/inbox:/workspace:ro');
  });
});
