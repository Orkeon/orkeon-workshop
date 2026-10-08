import { DomainError } from './errors.js';
import { joinPath, normalizePath } from './paths.js';

/** A team slug is the folder name under `<workshop>/teams/`: kebab-case, ASCII. */
export const TEAM_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

/** Points at one team folder; the only thing the rest of the domain needs to know about a team. */
export interface TeamRef {
  readonly slug: string;
  readonly folder: string;
}

export function createTeamRef(slug: string, folder: string): TeamRef {
  if (!TEAM_SLUG_PATTERN.test(slug)) {
    throw new DomainError(`invalid team slug "${slug}" (expected ${TEAM_SLUG_PATTERN.source})`);
  }
  if (!folder.startsWith('/')) {
    throw new DomainError(`a team folder must be an absolute path, got "${folder}"`);
  }
  return Object.freeze({ slug, folder: normalizePath(folder) });
}

/** `<workshopRoot>/teams/<slug>`: the catalogue Studio lists (D1, D8). */
export function teamRefInWorkshop(workshopRoot: string, slug: string): TeamRef {
  return createTeamRef(slug, joinPath(workshopRoot, 'teams', slug));
}

/** Prefix of the folder of a named mount set, at the root of the workshop: `mounts.<name>/<slug>/` (D28). */
export const MOUNT_SET_PREFIX = 'mounts.';

/**
 * The workshop of a team: two levels above the team folder (`<workshop>/teams/<slug>`). What goes
 * with a team without being the team — its workbook, its tests, its settings, its mount sets — sits
 * there, under the team's slug (D28, D29, D33).
 */
export function workshopOfTeam(teamFolder: string): string {
  return joinPath(teamFolder, '..', '..');
}

/**
 * The files and folders of a team the bench reads or writes (plan § 3.2). The team folder holds
 * only what Studio runs — the crew, the card, the launchers, `mounts.json`, the folders of the mount
 * points — while the workbook and the tests live in `workbooks/<slug>/` and `tests/<slug>/` (D29),
 * and the team's own Orkeon settings in `settings/<slug>/appsettings.json` (D33).
 */
export interface TeamPaths {
  readonly crew: string;
  readonly mountsFile: string;
  readonly studioCard: string;
  readonly runSh: string;
  readonly runCmd: string;
  /** Written by `scaffold`: git keeps the folders of the mount points, not the data in them. */
  readonly gitignore: string;
  readonly workbook: string;
  readonly statusFile: string;
  /** The artefacts of the method, in the order its steps write them (`check test-plan`, `check design`). */
  readonly needFile: string;
  readonly acceptanceFile: string;
  readonly testPlanFile: string;
  readonly designFile: string;
  readonly planFile: string;
  readonly decisions: string;
  readonly attempts: string;
  readonly runs: string;
  readonly tests: string;
  readonly benchConfigFile: string;
  /** The team's own Orkeon settings: the launchers pass it with `--settings` when it exists. */
  readonly settingsFile: string;
}

export function teamPaths(team: TeamRef): TeamPaths {
  const workshop = workshopOfTeam(team.folder);
  const workbook = joinPath(workshop, 'workbooks', team.slug);
  const tests = joinPath(workshop, 'tests', team.slug);
  return Object.freeze({
    crew: joinPath(team.folder, 'crew'),
    mountsFile: joinPath(team.folder, 'mounts.json'),
    studioCard: joinPath(team.folder, 'studio-team.json'),
    runSh: joinPath(team.folder, 'run.sh'),
    runCmd: joinPath(team.folder, 'run.cmd'),
    gitignore: joinPath(team.folder, '.gitignore'),
    workbook,
    statusFile: joinPath(workbook, 'STATUS.md'),
    needFile: joinPath(workbook, 'NEED.md'),
    acceptanceFile: joinPath(workbook, 'ACCEPTANCE.md'),
    testPlanFile: joinPath(workbook, 'TEST-PLAN.md'),
    designFile: joinPath(workbook, 'DESIGN.md'),
    planFile: joinPath(workbook, 'PLAN.md'),
    decisions: joinPath(workbook, 'decisions'),
    attempts: joinPath(workbook, 'attempts'),
    runs: joinPath(workbook, 'runs'),
    tests,
    benchConfigFile: joinPath(tests, 'bench.config.json'),
    settingsFile: joinPath(workshop, 'settings', team.slug, 'appsettings.json'),
  });
}
