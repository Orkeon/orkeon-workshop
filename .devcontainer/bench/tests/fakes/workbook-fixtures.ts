import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { teamPaths, teamRefInWorkshop, type TeamRef } from '../../src/domain/team-ref.js';
import type { DesignInputs } from '../../src/domain/workbook/check-workbook.js';
import type { TestFile } from '../../src/domain/workbook/traceability-rules.js';
import { FIXTURES_DIR, WORKSHOP, fixture } from './fixture-team.js';
import { InMemoryFileSystem } from './in-memory-file-system.js';

/**
 * `tests/fixtures/workbooks/`: `clean/` — the workbook and the tests of a small mail-triage team,
 * which pass every check without a finding —, `faulty/` — its design and its plan with five
 * deliberate faults — and `templates/` — the harness templates as shipped.
 */
export const WORKBOOKS_DIR = join(FIXTURES_DIR, 'workbooks');

/** What `orkeon run --list-tools` prints for the fixtures: one name per line. */
export const TOOL_CATALOGUE = ['email_draft', 'email_parser', 'email_read', 'email_search', 'email_send', 'file_read', 'file_write', 'json_tool'];
export const LIST_TOOLS_OUTPUT = `${TOOL_CATALOGUE.join('\n')}\n`;

export function workbookFixture(path: string): string {
  return fixture(`workbooks/${path}`);
}

function filesBelow(folder: string, prefix = ''): string[] {
  return readdirSync(folder)
    .sort()
    .flatMap((name) => (statSync(join(folder, name)).isDirectory() ? filesBelow(join(folder, name), `${prefix}${name}/`) : [`${prefix}${name}`]));
}

/** The test files of the clean workbook, as the traceability reads them. */
export function cleanTestFiles(): TestFile[] {
  return filesBelow(join(WORKBOOKS_DIR, 'clean', 'tests'))
    .filter((path) => path.includes('/'))
    .map((path) => ({ path, text: workbookFixture(`clean/tests/${path}`) }));
}

/** Everything `check design --tests` reads of the clean workbook, with the catalogue of the fixtures. */
export function cleanInputs(): DesignInputs {
  return {
    need: workbookFixture('clean/workbook/NEED.md'),
    acceptance: workbookFixture('clean/workbook/ACCEPTANCE.md'),
    testPlan: workbookFixture('clean/workbook/TEST-PLAN.md'),
    benchConfig: workbookFixture('clean/tests/bench.config.json'),
    design: workbookFixture('clean/workbook/DESIGN.md'),
    plan: workbookFixture('clean/workbook/PLAN.md'),
    track: { track: 'full' },
    catalogue: { tools: TOOL_CATALOGUE },
    tests: cleanTestFiles(),
  };
}

/** The harness templates as shipped, read as the artefacts of a team. */
export function templateInputs(): DesignInputs {
  return {
    need: workbookFixture('templates/NEED.md'),
    acceptance: workbookFixture('templates/ACCEPTANCE.md'),
    testPlan: workbookFixture('templates/TEST-PLAN.md'),
    benchConfig: workbookFixture('templates/bench.config.json'),
    design: workbookFixture('templates/DESIGN.md'),
    plan: workbookFixture('templates/PLAN.md'),
    track: { track: 'full' },
    catalogue: { tools: TOOL_CATALOGUE },
    tests: [],
  };
}

/** The clean workbook and its tests loaded into an in-memory workshop, for a team that has no folder yet (D35). */
export function cleanWorkshop(slug = 'mail-triage'): { team: TeamRef; fileSystem: InMemoryFileSystem } {
  const team = teamRefInWorkshop(WORKSHOP, slug);
  const paths = teamPaths(team);
  const fileSystem = new InMemoryFileSystem();
  for (const name of filesBelow(join(WORKBOOKS_DIR, 'clean', 'workbook'))) {
    fileSystem.addFile(`${paths.workbook}/${name}`, workbookFixture(`clean/workbook/${name}`));
  }
  for (const name of filesBelow(join(WORKBOOKS_DIR, 'clean', 'tests'))) {
    fileSystem.addFile(`${paths.tests}/${name}`, workbookFixture(`clean/tests/${name}`));
  }
  return { team, fileSystem };
}
