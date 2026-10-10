import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { crc32 } from '../../../src/domain/deployment/crc32.js';
import { buildZip, dosDateTime, type ZipEntry } from '../../../src/domain/deployment/zip-format.js';
import { readZip } from '../../fakes/zip-reader.js';

const AT = new Date('2026-10-10T14:07:31Z');
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function stored(path: string, content: string, mode = 0o644): ZipEntry {
  const data = text(content);
  return { path, method: 'store', data, size: data.length, crc32: crc32(data), mode };
}

function deflated(path: string, content: string, mode = 0o644): ZipEntry {
  const data = text(content);
  return { path, method: 'deflate', data: new Uint8Array(deflateRawSync(data)), size: data.length, crc32: crc32(data), mode };
}

describe('buildZip', () => {
  it('lays out local headers, a central directory and an end record another reader understands', () => {
    const run = 'echo run\n'.repeat(40);
    const bytes = buildZip([stored('teams/demo/mounts.json', '{}\n'), deflated('teams/demo/run.sh', run, 0o755)], { at: AT, comment: '{"team":"demo"}' });
    const zip = readZip(bytes);
    expect(zip.comment).toBe('{"team":"demo"}');
    expect(zip.entries.map((entry) => [entry.path, entry.method, entry.mode, entry.size])).toEqual([
      ['teams/demo/mounts.json', 0, 0o100644, 3],
      ['teams/demo/run.sh', 8, 0o100755, run.length],
    ]);
    expect(new TextDecoder().decode(zip.entries[1]?.content)).toBe(run);
    expect(zip.entries[1]?.compressedSize).toBeLessThan(run.length);
    expect(zip.entries[0]?.crc32).toBe(crc32(text('{}\n')));
    // Signatures at the expected places: local header first, end record last.
    expect(bytes.subarray(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(bytes.length).toBe(bytes.lastIndexOf(0x50) + 22 + '{"team":"demo"}'.length - 0);
  });

  it('writes the DOS time and date of the instant in UTC on every entry, two-second steps', () => {
    const zip = readZip(buildZip([stored('a.txt', 'a')], { at: AT, comment: '' }));
    const { time, date } = dosDateTime(AT);
    expect(zip.entries[0]).toMatchObject({ time, date });
    expect(time >> 11).toBe(14);
    expect((time >> 5) & 0x3f).toBe(7);
    expect((time & 0x1f) * 2).toBe(30);
    expect((date >> 9) + 1980).toBe(2026);
    expect((date >> 5) & 0xf).toBe(10);
    expect(date & 0x1f).toBe(10);
  });

  it('clamps a date the format cannot hold to its range', () => {
    expect(dosDateTime(new Date('1970-01-01T00:00:00Z')).date >> 9).toBe(0);
    expect(dosDateTime(new Date('2200-01-01T00:00:00Z')).date >> 9).toBe(2107 - 1980);
  });

  it('refuses a path a zip must not carry, and a path given twice', () => {
    for (const path of ['', '/abs', 'dir/', 'a//b', './a', 'a/../b', String.raw`a\b`]) {
      expect(() => buildZip([stored(path, 'x')], { at: AT, comment: '' })).toThrow(/not a path a zip archive may carry/);
    }
    expect(() => buildZip([stored('a', 'x'), stored('a', 'y')], { at: AT, comment: '' })).toThrow('"a" would appear twice in the archive');
  });

  it('holds an empty archive: an end record and nothing else', () => {
    const bytes = buildZip([], { at: AT, comment: '' });
    expect(bytes.length).toBe(22);
    expect(readZip(bytes)).toEqual({ comment: '', entries: [] });
  });

  it('keeps names and comments in UTF-8 and flags them so', () => {
    const zip = readZip(buildZip([stored('équipe/résumé.md', 'é')], { at: AT, comment: 'déployé' }));
    expect(zip.entries[0]?.path).toBe('équipe/résumé.md');
    expect(zip.comment).toBe('déployé');
  });
});
