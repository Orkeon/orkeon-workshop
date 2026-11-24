import { describe, expect, it } from 'vitest';

import {
  REFERENCE_ORKEON_COMMIT,
  REFERENCE_ORKEON_IS_RELEASE,
  REFERENCE_ORKEON_RELEASE,
  REFERENCE_ORKEON_SOURCE_VERSION,
  REFERENCE_ORKEON_VERSION,
  extractVersion,
  isReferenceVersion,
} from '../../src/domain/orkeon-version.js';

describe('Orkeon version', () => {
  it('references the release 1.4.0, the commit of its tag (D110)', () => {
    expect(REFERENCE_ORKEON_RELEASE).toBe('1.4.0');
    expect(REFERENCE_ORKEON_COMMIT).toBe('0389fd2');
    expect(REFERENCE_ORKEON_SOURCE_VERSION).toBe('1.4.0');
    expect(REFERENCE_ORKEON_IS_RELEASE).toBe(true);
    expect(REFERENCE_ORKEON_VERSION).toBe('1.4.0');
  });

  it.each([
    ['1.0.0-rc.4', '1.0.0-rc.4'],
    ['orkeon 1.2.0', '1.2.0'],
    ['orkeon 1.2.0\n', '1.2.0'],
    ['orkeon 1.2.0+a9f3878aca94', '1.2.0'],
    ['orkeon 1.2.0-src.20261116.ga9f3878+a9f3878aca94', '1.2.0-src.20261116.ga9f3878'],
    ['orkeon 1.3.0-src.20261118.g1b480bd+1b480bd1c7c2', '1.3.0-src.20261118.g1b480bd'],
    ['orkeon 1.3.0+d81bfab393ce', '1.3.0'],
    ['orkeon 1.4.0+0389fd291bde', '1.4.0'],
    ['orkeon 1.0.0-rc.6.src.20261102.gc101cbd+c101cbd6dd11', '1.0.0-rc.6.src.20261102.gc101cbd'],
    ['orkeon 1.3.0-dev', '1.3.0-dev'],
    ['Orkeon CLI version 1.2.3 (release)', '1.2.3'],
    ['no version here', null],
  ])('extracts from %s', (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });

  it.each([
    ['1.4.0', true],
    ['1.4.0-src.20261123.g0389fd2', true],
    ['1.3.0', false],
    ['1.3.0-src.20261118.gd81bfab', false],
    ['1.3.0-src.20261118.g1b480bd', false],
    ['1.2.0', false],
    ['1.4.1', false],
    ['1.2.0-src.20261117.g4709278', false],
    ['1.4.0-src.20261125.g1234abc', false],
    ['1.4.0-src.20261123.g0389fd2x', false],
    ['1.3.0-dev', false],
    ['1.0.0-rc.6.src.20261102.gc101cbd', false],
  ])('%s is the reference: %s', (version, expected) => {
    expect(isReferenceVersion(version)).toBe(expected);
  });
});
