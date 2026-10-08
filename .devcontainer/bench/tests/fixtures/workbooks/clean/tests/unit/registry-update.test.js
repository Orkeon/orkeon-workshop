// INV-INCR — a key already in the registry is not added twice, a new one is.
import { describe, expect, it } from 'vitest';

import { addKeys } from '../../../teams/mail-triage/crew/tools/registry-update/domain.js';

describe('registry_update (INV-INCR)', () => {
  it('adds the new keys, sorted, each once', () => {
    expect(addKeys(['a.eml'], ['b.eml', 'a.eml'])).toEqual(['a.eml', 'b.eml']);
  });
});
