import { describe, expect, it } from 'vitest';

import { ownProperty } from '../../src/domain/records.js';

describe('ownProperty', () => {
  it('returns the value of an own key', () => {
    expect(ownProperty({ prod: '/srv' }, 'prod')).toBe('/srv');
  });

  it('ignores a missing key and anything inherited from Object.prototype', () => {
    const record: Record<string, string> = { prod: '/srv' };
    expect(ownProperty(record, 'staging')).toBeUndefined();
    expect(ownProperty(record, 'constructor')).toBeUndefined();
    expect(ownProperty(record, 'toString')).toBeUndefined();
    expect(ownProperty(record, '__proto__')).toBeUndefined();
  });

  it('still returns an own key that shadows an inherited one', () => {
    expect(ownProperty(JSON.parse('{"constructor":"mine"}') as Record<string, string>, 'constructor')).toBe('mine');
  });
});
