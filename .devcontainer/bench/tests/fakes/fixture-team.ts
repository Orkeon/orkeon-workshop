import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { teamPaths, teamRefInWorkshop, type TeamRef } from '../../src/domain/team-ref.js';
import { InMemoryFileSystem } from './in-memory-file-system.js';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
/** A small workshop: `teams/demo/`, and its workbook and tests next to `teams/` (D29). */
export const FIXTURE_WORKSHOP_DIR = join(FIXTURES_DIR, 'workshop');
export const WORKSHOP = '/home/tester/Orkeon';

export function fixture(relativePath: string): string {
  return readFileSync(join(FIXTURES_DIR, relativePath), 'utf8');
}

/** The demo fixture team loaded into an in-memory file system under a fake workshop. */
export function demoTeam(): { team: TeamRef; fileSystem: InMemoryFileSystem } {
  const team = teamRefInWorkshop(WORKSHOP, 'demo');
  const paths = teamPaths(team);
  const fileSystem = new InMemoryFileSystem()
    .addDirectory(team.folder)
    .addFile(paths.mountsFile, fixture('workshop/teams/demo/mounts.json'))
    .addFile(paths.statusFile, fixture('workshop/workbooks/demo/STATUS.md'))
    .addFile(paths.benchConfigFile, fixture('workshop/tests/demo/bench.config.json'));
  return { team, fileSystem };
}
