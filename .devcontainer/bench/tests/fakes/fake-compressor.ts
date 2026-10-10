import type { Compressor } from '../../src/application/ports/compressor.js';

/** Compresses nothing: every entry is then stored, and the archive is readable without inflating. */
export class StoreCompressor implements Compressor {
  readonly calls: number[] = [];

  deflateRaw(data: Uint8Array): Uint8Array {
    this.calls.push(data.length);
    return data;
  }

  /** A gzip member whose deflate stream stores the bytes as they are: readable by any gunzip. */
  gzip(data: Uint8Array): Uint8Array {
    return storedGzip(data);
  }
}

/** RFC 1952 around one or more RFC 1951 stored blocks (65535 bytes each), with the CRC-32 and the size the format wants. */
function storedGzip(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3])];
  let offset = 0;
  do {
    const chunk = data.subarray(offset, Math.min(offset + 65535, data.length));
    offset += chunk.length;
    const final = offset >= data.length ? 1 : 0;
    const size = chunk.length;
    blocks.push(new Uint8Array([final, size & 0xff, size >> 8, ~size & 0xff, (~size >> 8) & 0xff]), chunk);
  } while (offset < data.length);
  const trailer = new Uint8Array(8);
  new DataView(trailer.buffer).setUint32(0, crc32(data), true);
  new DataView(trailer.buffer).setUint32(4, data.length >>> 0, true);
  blocks.push(trailer);
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let position = 0;
  for (const block of blocks) {
    out.set(block, position);
    position += block.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
