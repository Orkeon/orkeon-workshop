import { describe, expect, it } from 'vitest';

import { REFERENCE_ORKEON_VERSION, extractVersion } from '../../src/domain/orkeon-version.js';

describe('Orkeon version', () => {
  it('references the source build of main at f80665f', () => {
    expect(REFERENCE_ORKEON_VERSION).toBe('1.0.0-rc.6.src.20261030.gf80665f');
  });

  it.each([
    ['1.0.0-rc.4', '1.0.0-rc.4'],
    ['orkeon 1.0.0-rc.6.src.20261030.gf80665f+f80665f456a5', '1.0.0-rc.6.src.20261030.gf80665f'],
    ['orkeon 1.0.0-rc.4+abc', '1.0.0-rc.4+abc'.slice(0, 10)],
    ['Orkeon CLI version 1.2.3 (release)', '1.2.3'],
    ['no version here', null],
  ])('extracts from %s', (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });
});
