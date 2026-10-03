import { describe, expect, it } from 'vitest';

import { baseName, isAbsolutePath, isWindowsAbsolutePath, isWithin, joinPath, normalizePath, relativeWithin, resolvePath } from '../../src/domain/paths.js';

describe('normalizePath', () => {
  it.each([
    ['/a/b/../c', '/a/c'],
    ['/a//b/./c/', '/a/b/c'],
    ['/../a', '/a'],
    ['a/../../b', '../b'],
    ['./x', 'x'],
    ['.', '.'],
    ['/', '/'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('path helpers', () => {
  it('joins and resolves against a base', () => {
    expect(joinPath('/workspace', 'teams', 'demo')).toBe('/workspace/teams/demo');
    expect(resolvePath('/teams/demo', './input')).toBe('/teams/demo/input');
    expect(resolvePath('/teams/demo', '/srv/shared')).toBe('/srv/shared');
    expect(resolvePath('/teams/demo', '../other/input')).toBe('/teams/other/input');
  });

  it('knows whether a path lies within a folder', () => {
    expect(isWithin('/teams/demo', '/teams/demo')).toBe(true);
    expect(isWithin('/teams/demo', '/teams/demo/input')).toBe(true);
    expect(isWithin('/teams/demo', '/teams/demo-2/input')).toBe(false);
    expect(isWithin('/teams/demo', '/srv/shared')).toBe(false);
    expect(isWithin('/', '/srv')).toBe(true);
  });

  it('expresses a path relative to the folder that contains it', () => {
    expect(relativeWithin('/teams/demo', '/teams/demo/input')).toBe('./input');
    expect(relativeWithin('/teams/demo', '/teams/demo/data/in')).toBe('./data/in');
    expect(relativeWithin('/teams/demo', '/teams/demo')).toBe('./');
    expect(relativeWithin('/teams/demo', '/srv/shared')).toBeNull();
  });

  it('recognizes a path of the Windows host', () => {
    expect(isWindowsAbsolutePath('C:\\Shares\\inbox')).toBe(true);
    expect(isWindowsAbsolutePath('d:/data')).toBe(true);
    expect(isWindowsAbsolutePath('\\\\nas\\share')).toBe(true);
    expect(isWindowsAbsolutePath('/srv/shared')).toBe(false);
    expect(isWindowsAbsolutePath('./c:odd')).toBe(false);
  });

  it('exposes absolute-ness and base names', () => {
    expect(isAbsolutePath('/x')).toBe(true);
    expect(isAbsolutePath('x')).toBe(false);
    expect(baseName('/teams/demo/')).toBe('demo');
    expect(baseName('demo')).toBe('demo');
  });
});
