import { describe, expect, it } from 'vitest';

import { REFERENCE_ORKEON_VERSION, extractVersion } from '../../src/domain/orkeon-version.js';

describe('Orkeon version', () => {
  it('references the source build of main at 80fdefe', () => {
    expect(REFERENCE_ORKEON_VERSION).toBe('1.0.0-rc.4.src.20261007.g80fdefe');
  });

  it.each([
    ['1.0.0-rc.4', '1.0.0-rc.4'],
    ['orkeon 1.0.0-rc.4.src.20261007.g80fdefe+80fdefe65246', '1.0.0-rc.4.src.20261007.g80fdefe'],
    ['orkeon 1.0.0-rc.4+abc', '1.0.0-rc.4+abc'.slice(0, 10)],
    ['Orkeon CLI version 1.2.3 (release)', '1.2.3'],
    ['no version here', null],
  ])('extracts from %s', (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });
});
