import { gunzipSync } from 'node:zlib';

/** One entry of a tar archive, header fields decoded. */
export interface ReadTarEntry {
  readonly path: string;
  readonly mode: number;
  readonly size: number;
  readonly mtime: number;
  readonly type: string;
  readonly content: Uint8Array;
}

export interface ReadTar {
  /** The `comment` of the pax global header, when one opens the archive. */
  readonly comment: string | null;
  readonly entries: readonly ReadTarEntry[];
}

/** A plain reader of the ustar archives `buildTar` writes, gzipped or not, for the tests. */
export function readTar(bytes: Uint8Array): ReadTar {
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b ? new Uint8Array(gunzipSync(bytes)) : bytes;
  const decoder = new TextDecoder();
  const text = (start: number, length: number): string => decoder.decode(data.subarray(start, start + length)).replace(/\0.*$/s, '');
  const entries: ReadTarEntry[] = [];
  let comment: string | null = null;
  let position = 0;
  while (position + 512 <= data.length && data[position] !== 0) {
    const header = data.subarray(position, position + 512);
    const stored = Number.parseInt(text(position + 148, 8).trim(), 8);
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (sum !== stored) {
      throw new Error(`bad checksum at ${String(position)}`);
    }
    if (text(position + 257, 6) !== 'ustar') {
      throw new Error(`not ustar at ${String(position)}`);
    }
    const prefix = text(position + 345, 155);
    const path = prefix.length > 0 ? `${prefix}/${text(position, 100)}` : text(position, 100);
    const mode = Number.parseInt(text(position + 100, 8), 8);
    const size = Number.parseInt(text(position + 124, 12), 8);
    const mtime = Number.parseInt(text(position + 136, 12), 8);
    const type = text(position + 156, 1) || '0';
    const content = data.subarray(position + 512, position + 512 + size);
    position += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') {
      const record = decoder.decode(content);
      const match = /^\d+ comment=(.*)\n$/s.exec(record);
      comment = match === null ? null : (match[1] as string);
      continue;
    }
    entries.push({ path, mode, size, mtime, type, content });
  }
  return { comment, entries };
}
