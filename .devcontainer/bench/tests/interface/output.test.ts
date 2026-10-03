import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleOutput } from '../../src/interface/output.js';

describe('ConsoleOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes lines and JSON to stdout, errors to stderr', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const output = new ConsoleOutput();
    output.line('one line');
    output.json({ ok: true, checks: [] });
    output.error('error: nope');
    expect(stdout.mock.calls.map((call) => call[0])).toEqual(['one line\n', '{\n  "ok": true,\n  "checks": []\n}\n']);
    expect(stderr.mock.calls.map((call) => call[0])).toEqual(['error: nope\n']);
  });
});
