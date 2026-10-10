import { DomainError } from '../errors.js';

/** How an entry's bytes are stored: as they are, or deflated (raw, no zlib header). */
export type ZipMethod = 'store' | 'deflate';

/** One file of the archive, its bytes already compressed by the caller. */
export interface ZipEntry {
  /** The path inside the archive, `/`-separated, no leading slash (`teams/demo/run.sh`). */
  readonly path: string;
  readonly method: ZipMethod;
  /** The bytes as stored: the file itself for `store`, its raw deflate stream otherwise. */
  readonly data: Uint8Array;
  /** The size and the CRC-32 of the file before compression. */
  readonly size: number;
  readonly crc32: number;
  /** The Unix mode `unzip` restores (`0o755` for a launcher, `0o644` otherwise). */
  readonly mode: number;
}

/** What one archive says of itself: written in the end-of-central-directory comment (`unzip -z`). */
export interface ZipOptions {
  /** The modification time written on every entry, in UTC (DOS time: two-second steps, 1980–2107). */
  readonly at: Date;
  readonly comment: string;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** Version needed to extract: 2.0 (deflate, plain file names). */
const VERSION_NEEDED = 20;
/** Version made by: Unix (3) in the high byte, so that the external attributes carry a mode; 3.0 in the low byte. */
const VERSION_MADE_BY = (3 << 8) | 30;
/** General purpose flag 11: the file names and the comment are UTF-8. */
const UTF8_NAMES = 0x0800;
const METHODS: Readonly<Record<ZipMethod, number>> = Object.freeze({ store: 0, deflate: 8 });
/** The classic format stops here: counts on 16 bits, sizes and offsets on 32. */
const MAX_ENTRIES = 0xffff;
const MAX_32 = 0xffffffff;
/** A regular file, in the high bits of the Unix mode (`S_IFREG`). */
const REGULAR_FILE = 0o100000;

/**
 * A zip archive (PKWARE APPNOTE 6.3.x, no zip64, no data descriptor, no directory entries) holding
 * `entries` in order. Pure: the caller compresses and hashes, this function lays the bytes out.
 */
export function buildZip(entries: readonly ZipEntry[], options: ZipOptions): Uint8Array {
  if (entries.length > MAX_ENTRIES) {
    throw new DomainError(`a deployment archive holds ${String(MAX_ENTRIES)} files at most, got ${String(entries.length)}`);
  }
  const encoder = new TextEncoder();
  const comment = encoder.encode(options.comment);
  if (comment.length > MAX_ENTRIES) {
    throw new DomainError('the comment of a zip archive holds 65535 bytes at most');
  }
  const { time, date } = dosDateTime(options.at);
  const names = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(validName(entry.path, names));
    if (entry.size > MAX_32 || entry.data.length > MAX_32) {
      throw new DomainError(`${entry.path} is too large for a zip archive without zip64 (4 GiB at most)`);
    }
    const local = new Writer(30 + name.length + entry.data.length);
    local.u32(LOCAL_HEADER).u16(VERSION_NEEDED).u16(UTF8_NAMES).u16(METHODS[entry.method]).u16(time).u16(date);
    local.u32(entry.crc32).u32(entry.data.length).u32(entry.size).u16(name.length).u16(0).bytes(name).bytes(entry.data);
    const central = new Writer(46 + name.length);
    central.u32(CENTRAL_HEADER).u16(VERSION_MADE_BY).u16(VERSION_NEEDED).u16(UTF8_NAMES).u16(METHODS[entry.method]).u16(time).u16(date);
    central.u32(entry.crc32).u32(entry.data.length).u32(entry.size).u16(name.length).u16(0).u16(0).u16(0).u16(0);
    central.u32(((REGULAR_FILE | (entry.mode & 0o7777)) << 16) >>> 0).u32(offset).bytes(name);
    locals.push(local.done());
    centrals.push(central.done());
    offset += local.length;
    if (offset > MAX_32) {
      throw new DomainError('a deployment archive holds 4 GiB at most (no zip64)');
    }
  }
  const centralSize = centrals.reduce((sum, block) => sum + block.length, 0);
  const end = new Writer(22 + comment.length);
  end.u32(END_OF_CENTRAL_DIRECTORY).u16(0).u16(0).u16(entries.length).u16(entries.length).u32(centralSize).u32(offset).u16(comment.length).bytes(comment);
  return concat([...locals, ...centrals, end.done()]);
}

/** The DOS time and date of an instant, in UTC; before 1980 the epoch of the format is written. */
export function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.min(Math.max(at.getUTCFullYear(), 1980), 2107);
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2);
  const date = ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  return { time, date };
}

function validName(path: string, seen: Set<string>): string {
  if (path.length === 0 || path.startsWith('/') || path.endsWith('/') || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') || path.includes('\\')) {
    throw new DomainError(`"${path}" is not a path a zip archive may carry (relative, /-separated, no . or .. segment)`);
  }
  if (seen.has(path)) {
    throw new DomainError(`"${path}" would appear twice in the archive`);
  }
  seen.add(path);
  return path;
}

function concat(blocks: readonly Uint8Array[]): Uint8Array {
  const total = blocks.reduce((sum, block) => sum + block.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const block of blocks) {
    out.set(block, position);
    position += block.length;
  }
  return out;
}

/** Little-endian writer over a buffer of known size. */
class Writer {
  private readonly view: DataView;
  private readonly buffer: Uint8Array;
  private position = 0;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
    this.view = new DataView(this.buffer.buffer);
  }

  get length(): number {
    return this.buffer.length;
  }

  u16(value: number): this {
    this.view.setUint16(this.position, value, true);
    this.position += 2;
    return this;
  }

  u32(value: number): this {
    this.view.setUint32(this.position, value >>> 0, true);
    this.position += 4;
    return this;
  }

  bytes(data: Uint8Array): this {
    this.buffer.set(data, this.position);
    this.position += data.length;
    return this;
  }

  done(): Uint8Array {
    if (this.position !== this.buffer.length) {
      throw new DomainError(`zip writer: ${String(this.position)} of ${String(this.buffer.length)} bytes written`);
    }
    return this.buffer;
  }
}
