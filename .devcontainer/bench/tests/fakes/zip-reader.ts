import { inflateRawSync } from 'node:zlib';

/** One entry of a zip archive, as the central directory and the local header describe it. */
export interface ReadZipEntry {
  readonly path: string;
  readonly method: number;
  readonly crc32: number;
  readonly size: number;
  readonly compressedSize: number;
  /** The Unix mode of the external attributes (`0o100755` for an executable regular file). */
  readonly mode: number;
  readonly time: number;
  readonly date: number;
  readonly content: Uint8Array;
}

export interface ReadZip {
  readonly comment: string;
  readonly entries: readonly ReadZipEntry[];
}

/**
 * A plain reader of the format `buildZip` writes (central directory, local headers, raw deflate),
 * for the tests: enough to check that another tool would read the archive, without that tool.
 */
export function readZip(bytes: Uint8Array): ReadZip {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let end = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new Error('no end of central directory');
  }
  const count = view.getUint16(end + 10, true);
  const centralOffset = view.getUint32(end + 16, true);
  const commentLength = view.getUint16(end + 20, true);
  const comment = decoder.decode(bytes.subarray(end + 22, end + 22 + commentLength));
  const entries: ReadZipEntry[] = [];
  let position = centralOffset;
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(position, true) !== 0x02014b50) {
      throw new Error(`bad central header at ${String(position)}`);
    }
    const method = view.getUint16(position + 10, true);
    const time = view.getUint16(position + 12, true);
    const date = view.getUint16(position + 14, true);
    const crc = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const entryCommentLength = view.getUint16(position + 32, true);
    const mode = view.getUint32(position + 38, true) >>> 16;
    const localOffset = view.getUint32(position + 42, true);
    const path = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    position += 46 + nameLength + extraLength + entryCommentLength;
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`bad local header for ${path}`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const stored = bytes.subarray(dataStart, dataStart + compressedSize);
    const content = method === 8 ? new Uint8Array(inflateRawSync(stored)) : method === 0 ? stored : (() => { throw new Error(`method ${String(method)} of ${path}`); })();
    if (content.length !== size) {
      throw new Error(`${path}: ${String(content.length)} bytes inflated, ${String(size)} announced`);
    }
    entries.push({ path, method, crc32: crc, size, compressedSize, mode, time, date, content });
  }
  return { comment, entries };
}
