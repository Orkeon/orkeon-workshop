import { describe, expect, it } from 'vitest';

import { crc32 } from '../../../src/domain/deployment/crc32.js';

describe('crc32', () => {
  it('gives the check values of the IEEE polynomial', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('is an unsigned 32-bit integer whatever the input', () => {
    const crc = crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(crc)).toBe(true);
  });
});
