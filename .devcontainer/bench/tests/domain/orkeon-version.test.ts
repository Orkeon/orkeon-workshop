import { describe, expect, it } from 'vitest';

import { REFERENCE_ORKEON_VERSION, extractVersion } from '../../src/domain/orkeon-version.js';

describe('Orkeon version', () => {
  it('references the source build of main at ad6dc63', () => {
    expect(REFERENCE_ORKEON_VERSION).toBe('1.0.0-rc.4.src.20261011.gad6dc63');
  });

  it.each([
    ['1.0.0-rc.4', '1.0.0-rc.4'],
    ['orkeon 1.0.0-rc.4.src.20261011.gad6dc63+ad6dc63f4571', '1.0.0-rc.4.src.20261011.gad6dc63'],
    ['orkeon 1.0.0-rc.4+abc', '1.0.0-rc.4+abc'.slice(0, 10)],
    ['Orkeon CLI version 1.2.3 (release)', '1.2.3'],
    ['no version here', null],
  ])('extracts from %s', (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });
});
