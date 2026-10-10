import { deflateRawSync, gzipSync } from 'node:zlib';

import type { Compressor } from '../application/ports/compressor.js';

/** `node:zlib` at its default level: an archive is written once and read many times. */
export class NodeCompressor implements Compressor {
  deflateRaw(data: Uint8Array): Uint8Array {
    return new Uint8Array(deflateRawSync(data));
  }

  gzip(data: Uint8Array): Uint8Array {
    return new Uint8Array(gzipSync(data));
  }
}
