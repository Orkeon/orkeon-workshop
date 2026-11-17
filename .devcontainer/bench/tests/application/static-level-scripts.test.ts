import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHECK_SCRIPTS } from '../../src/application/runs/static-level.js';

// The harness deploys `.devcontainer/harness/claude/` as a workshop's `.claude/`: a check script L0
// names must exist there, or L0 reports `check-script` as skipped in every workshop.
// A check of the checkout's layout: the image copies the bench alone (no `../harness` beside it), so
// the test is skipped there — the image's evals check the deployed harness instead.
const HARNESS_CLAUDE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'harness', 'claude');

describe.skipIf(!existsSync(HARNESS_CLAUDE))('the check scripts of L0', () => {
  it.each(Object.entries(CHECK_SCRIPTS))('the %s check script is one the harness ships', (_kind, script) => {
    expect(script.startsWith('.claude/')).toBe(true);
    expect(existsSync(join(HARNESS_CLAUDE, script.slice('.claude/'.length)))).toBe(true);
  });
});
