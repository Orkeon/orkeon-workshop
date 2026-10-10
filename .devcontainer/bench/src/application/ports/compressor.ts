/** The two compressions a deployment archive uses: raw deflate (RFC 1951) inside a zip entry, gzip (RFC 1952) around a tar. */
export interface Compressor {
  deflateRaw(data: Uint8Array): Uint8Array;
  gzip(data: Uint8Array): Uint8Array;
}
