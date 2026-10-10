import { DomainError } from '../errors.js';

/** One file of a tar archive. */
export interface TarEntry {
  /** The path inside the archive, `/`-separated, no leading slash. */
  readonly path: string;
  readonly data: Uint8Array;
  /** The Unix mode written on the entry (`0o755` for a launcher, `0o644` otherwise). */
  readonly mode: number;
}

export interface TarOptions {
  /** The modification time written on every entry. */
  readonly at: Date;
  /**
   * Written as a pax global extended header, keyword `comment` — a text every extractor ignores by
   * standard (POSIX.1-2001 pax), readable with Python's `tarfile` (`pax_headers`). Empty: no header.
   */
  readonly comment: string;
}

const BLOCK = 512;
/** ustar: a name of 100 bytes at most, or split on a `/` into a prefix of 155 and a name of 100. */
const NAME_MAX = 100;
const PREFIX_MAX = 155;
const REGULAR_FILE = '0';
const PAX_GLOBAL_HEADER = 'g';
const encoder = new TextEncoder();

/**
 * A tar archive (POSIX ustar, every path within ustar's limits; an optional pax global header first),
 * uncompressed — the caller gzips it. Pure: the bytes laid out from the entries, as `buildZip` does.
 * No directory entries: an extractor creates the folders a path needs.
 */
export function buildTar(entries: readonly TarEntry[], options: TarOptions): Uint8Array {
  const blocks: Uint8Array[] = [];
  const mtime = Math.max(0, Math.floor(options.at.getTime() / 1000));
  if (options.comment.length > 0) {
    const record = paxRecord('comment', options.comment);
    blocks.push(header({ name: 'pax_global_header', mode: 0o644, size: record.length, mtime, type: PAX_GLOBAL_HEADER }), padded(record));
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new DomainError(`"${entry.path}" would appear twice in the archive`);
    }
    seen.add(entry.path);
    const { name, prefix } = splitName(entry.path);
    blocks.push(header({ name, prefix, mode: entry.mode & 0o7777, size: entry.data.length, mtime, type: REGULAR_FILE }), padded(entry.data));
  }
  blocks.push(new Uint8Array(2 * BLOCK));
  return concat(blocks);
}

/** `<length> <keyword>=<value>\n`, the length counting itself (pax). */
export function paxRecord(keyword: string, value: string): Uint8Array {
  const body = encoder.encode(` ${keyword}=${value}\n`);
  let length = body.length + 1;
  while (String(length).length + body.length !== length) {
    length = String(length).length + body.length;
  }
  return concat([encoder.encode(String(length)), body]);
}

function splitName(path: string): { name: string; prefix: string } {
  if (path.length === 0 || path.startsWith('/') || path.endsWith('/') || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') || path.includes('\\')) {
    throw new DomainError(`"${path}" is not a path a tar archive may carry (relative, /-separated, no . or .. segment)`);
  }
  const bytes = encoder.encode(path);
  if (bytes.length <= NAME_MAX) {
    return { name: path, prefix: '' };
  }
  // Split on a slash so that the prefix fits 155 bytes and the name 100; both measured in UTF-8.
  for (let cut = path.lastIndexOf('/'); cut > 0; cut = path.lastIndexOf('/', cut - 1)) {
    const prefix = path.slice(0, cut);
    const name = path.slice(cut + 1);
    if (encoder.encode(prefix).length <= PREFIX_MAX && encoder.encode(name).length <= NAME_MAX) {
      return { name, prefix };
    }
  }
  throw new DomainError(`"${path}" is too long for a tar archive (100 bytes, or 155 + 100 around a slash)`);
}

interface HeaderFields {
  readonly name: string;
  readonly prefix?: string;
  readonly mode: number;
  readonly size: number;
  readonly mtime: number;
  readonly type: string;
}

function header(fields: HeaderFields): Uint8Array {
  if (fields.size > 0o77777777777) {
    throw new DomainError(`${fields.name} is too large for a tar archive (8 GiB at most)`);
  }
  const block = new Uint8Array(BLOCK);
  const write = (offset: number, text: string): void => {
    block.set(encoder.encode(text), offset);
  };
  const octal = (value: number, width: number): string => `${value.toString(8).padStart(width - 1, '0')}\0`;
  write(0, fields.name);
  write(100, octal(fields.mode, 8));
  write(108, octal(0, 8));
  write(116, octal(0, 8));
  write(124, octal(fields.size, 12));
  write(136, octal(fields.mtime, 12));
  write(148, '        ');
  write(156, fields.type);
  write(257, 'ustar\0');
  write(263, '00');
  write(345, fields.prefix ?? '');
  const checksum = block.reduce((sum, byte) => sum + byte, 0);
  write(148, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return block;
}

function padded(data: Uint8Array): Uint8Array {
  const rest = data.length % BLOCK;
  if (rest === 0) {
    return data;
  }
  const out = new Uint8Array(data.length + BLOCK - rest);
  out.set(data, 0);
  return out;
}

function concat(blocks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let position = 0;
  for (const block of blocks) {
    out.set(block, position);
    position += block.length;
  }
  return out;
}
