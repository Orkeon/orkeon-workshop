import { describe, expect, it } from 'vitest';

import { REFERENCE_ORKEON_COMMIT, REFERENCE_ORKEON_VERSION, extractVersion, isReferenceVersion } from '../../src/domain/orkeon-version.js';

describe('Orkeon version', () => {
  it('references the released Orkeon 1.2.0, tagged at a9f3878', () => {
    expect(REFERENCE_ORKEON_VERSION).toBe('1.2.0');
    expect(REFERENCE_ORKEON_COMMIT).toBe('a9f3878');
  });

  it.each([
    ['1.0.0-rc.4', '1.0.0-rc.4'],
    ['orkeon 1.2.0', '1.2.0'],
    ['orkeon 1.2.0\n', '1.2.0'],
    ['orkeon 1.2.0+a9f3878aca94', '1.2.0'],
    ['orkeon 1.2.0-src.20261116.ga9f3878+a9f3878aca94', '1.2.0-src.20261116.ga9f3878'],
    ['orkeon 1.0.0-rc.6.src.20261102.gc101cbd+c101cbd6dd11', '1.0.0-rc.6.src.20261102.gc101cbd'],
    ['orkeon 1.3.0-dev', '1.3.0-dev'],
    ['Orkeon CLI version 1.2.3 (release)', '1.2.3'],
    ['no version here', null],
  ])('extracts from %s', (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });

  it.each([
    ['1.2.0', true],
    ['1.2.0-src.20261116.ga9f3878', true],
    ['1.2.0-src.20261120.g1234abc', false],
    ['1.2.0-src.20261116.ga9f3878x', false],
    ['1.2.0-dev', false],
    ['1.2.1', false],
    ['1.0.0-rc.6.src.20261102.gc101cbd', false],
  ])('%s is the reference: %s', (version, expected) => {
    expect(isReferenceVersion(version)).toBe(expected);
  });
});
