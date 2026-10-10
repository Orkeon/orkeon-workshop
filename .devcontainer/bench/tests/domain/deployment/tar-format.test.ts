import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTar, paxRecord, type TarEntry } from '../../../src/domain/deployment/tar-format.js';
import { readTar } from '../../fakes/tar-reader.js';

const AT = new Date('2026-10-10T14:07:31Z');
const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const entry = (path: string, content: string, mode = 0o644): TarEntry => ({ path, data: text(content), mode });
const HAS_TAR = spawnSync('tar', ['--version']).status === 0;

describe('buildTar', () => {
  it('writes ustar headers, 512-byte blocks and two zero blocks at the end, every entry dated at the instant given', () => {
    const bytes = buildTar([entry('teams/demo/mounts.json', '{}\n'), entry('teams/demo/run.sh', 'echo\n'.repeat(200), 0o755)], { at: AT, comment: '' });
    expect(bytes.length % 512).toBe(0);
    expect(bytes.subarray(bytes.length - 1024).every((byte) => byte === 0)).toBe(true);
    const tar = readTar(bytes);
    expect(tar.comment).toBeNull();
    expect(tar.entries.map((e) => [e.path, e.mode.toString(8), e.size, e.type, e.mtime])).toEqual([
      ['teams/demo/mounts.json', '644', 3, '0', Math.floor(AT.getTime() / 1000)],
      ['teams/demo/run.sh', '755', 1000, '0', Math.floor(AT.getTime() / 1000)],
    ]);
    expect(new TextDecoder().decode(tar.entries[1]?.content)).toBe('echo\n'.repeat(200));
  });

  it('opens with a pax global header carrying the comment, which the reader gives back', () => {
    const tar = readTar(buildTar([entry('a.txt', 'a')], { at: AT, comment: '{"team":"demo"}' }));
    expect(tar.comment).toBe('{"team":"demo"}');
    expect(tar.entries.map((e) => e.path)).toEqual(['a.txt']);
  });

  it('splits a long path on a slash into ustar prefix and name, and refuses one that does not fit', () => {
    const folder = 'teams/demo/crew/tools/' + 'subfolder-'.repeat(8);
    const long = `${folder}/${'name-'.repeat(15)}.ts`;
    expect(long.length).toBeGreaterThan(100);
    expect(readTar(buildTar([entry(long, 'x')], { at: AT, comment: '' })).entries[0]?.path).toBe(long);
    expect(() => buildTar([entry(`${'a'.repeat(160)}/${'b'.repeat(120)}`, 'x')], { at: AT, comment: '' })).toThrow(/too long for a tar archive/);
  });

  it('refuses a path a tar must not carry, and a path given twice', () => {
    for (const path of ['', '/abs', 'dir/', 'a//b', './a', 'a/../b', String.raw`a\b`]) {
      expect(() => buildTar([entry(path, 'x')], { at: AT, comment: '' })).toThrow(/not a path a tar archive may carry/);
    }
    expect(() => buildTar([entry('a', 'x'), entry('a', 'y')], { at: AT, comment: '' })).toThrow('"a" would appear twice in the archive');
  });

  it('writes pax records whose length counts itself', () => {
    expect(new TextDecoder().decode(paxRecord('comment', 'x'))).toBe('13 comment=x\n');
    const long = paxRecord('comment', 'y'.repeat(90));
    const decoded = new TextDecoder().decode(long);
    expect(Number(decoded.split(' ')[0])).toBe(long.length);
  });

  it.skipIf(!HAS_TAR)('is read by the system tar, modes and comment included, without a word about the pax header', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orkeon-bench-tar-'));
    try {
      const archive = join(folder, 'a.tar');
      writeFileSync(archive, buildTar([entry('teams/demo/run.sh', '#!/bin/sh\n', 0o755), entry('teams/demo/README.md', '# demo\n')], { at: AT, comment: '{"team":"demo"}' }));
      const listing = execFileSync('tar', ['-tvf', archive], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(listing).toMatch(/^-rwxr-xr-x .* teams\/demo\/run\.sh$/m);
      expect(listing).toMatch(/^-rw-r--r-- .* teams\/demo\/README\.md$/m);
      expect(listing).not.toContain('pax_global_header');
      execFileSync('tar', ['-xf', archive, '-C', folder], { stdio: ['ignore', 'pipe', 'pipe'] });
      expect(execFileSync('sh', [join(folder, 'teams', 'demo', 'run.sh')], { encoding: 'utf8' })).toBe('');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
