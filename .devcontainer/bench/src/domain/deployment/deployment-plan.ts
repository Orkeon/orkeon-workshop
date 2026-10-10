import { FOLDER_KEEPER } from '../mounts/team-gitignore.js';
import { isWithin } from '../paths.js';

/** The folder of the workshop where `deploy` writes its archives (plan § 3.2, D45). */
export const DEPLOYMENTS_FOLDER = 'deployments';

/** Whether the team's own settings file goes into the archive — the question `/deploy` puts to the user (D45). */
export type SettingsChoice = 'include' | 'leave-out';

/** How the archive ends up saying what it did with the settings file. */
export type SettingsOutcome = 'included' | 'left-out' | 'none';

export interface DeploymentInput {
  readonly slug: string;
  /** Every regular file of the team folder, relative to it, `/`-separated, sorted; links left out. */
  readonly files: readonly string[];
  /** The folders of the team's mount points that lie inside the team, relative (`teamFolders`). */
  readonly mountFolders: readonly string[];
}

/** One file to pack: where it is read, where it lands in the archive, the mode `unzip` restores. */
export interface DeploymentEntry {
  readonly source: string;
  readonly archivePath: string;
  readonly mode: number;
}

export interface DeploymentPlan {
  readonly entries: readonly DeploymentEntry[];
  /** The data found in the folders of the mount points, by folder: counted, never packed. */
  readonly mountData: Readonly<Record<string, number>>;
  /** Dependencies and build output left out (`node_modules/`, `bin/`, `obj/`, `obj-linux/`, `*.tmp`). */
  readonly buildOutput: readonly string[];
  /** What forbids the deployment altogether: a settings file in the team folder, a `.env`. */
  readonly refusals: readonly string[];
  /** What the archive lacks to run as Studio runs it: a launcher or the card missing. */
  readonly warnings: readonly string[];
}

/** Folders a pushed workshop does not carry either (`gitignore.workshop`): dependencies and build output. */
export const BUILD_OUTPUT_FOLDERS = ['node_modules', 'bin', 'obj', 'obj-linux'] as const;

/** What the launchers and Studio need in the team folder (`orkeon-bench scaffold` writes the first four). */
const EXPECTED_FILES = ['run.sh', 'run.cmd', 'studio-team.json', '.gitignore', 'README.md'] as const;

const SETTINGS_FILE = /^appsettings.*\.json$/i;
const LAUNCHER = /\.sh$/;
const EXECUTABLE = 0o755;
const PLAIN = 0o644;

/**
 * Which files of a team folder a deployment carries (D45): the team as Orkeon Studio runs it —
 * `crew/`, `mounts.json`, the card, the launchers, the README, `tsconfig.json` and `typings/` for a
 * TypeScript crew —, every folder of a mount point reduced to its `.gitkeep` (the data a team reads,
 * writes and keeps is the workshop's, never shipped: the same line the team's `.gitignore` draws),
 * dependencies and build output left out. Refused, whatever else the folder holds: a settings file
 * Orkeon would read from the team folder (`appsettings*.json` at its root or in `crew/`, an
 * `appsettings/` or `_shared/` folder, D40) and a `.env` — a key never travels with a team.
 * Every file lands under `teams/<slug>/`, so that the archive unzips at the root of a workshop.
 */
export function planDeployment(input: DeploymentInput): DeploymentPlan {
  const entries: DeploymentEntry[] = [];
  const mountData: Record<string, number> = Object.fromEntries(input.mountFolders.map((folder) => [folder, 0]));
  const buildOutput: string[] = [];
  const refusals: string[] = [];
  for (const file of [...input.files].sort()) {
    const segments = file.split('/');
    const name = segments[segments.length - 1] as string;
    const refusal = refusalOf(file, segments, name);
    if (refusal !== null) {
      refusals.push(refusal);
      continue;
    }
    if (segments.some((segment) => (BUILD_OUTPUT_FOLDERS as readonly string[]).includes(segment)) || name.endsWith('.tmp')) {
      buildOutput.push(file);
      continue;
    }
    const mountFolder = innermostMountFolder(file, input.mountFolders);
    if (mountFolder !== null && !isKeeperOf(file, input.mountFolders)) {
      mountData[mountFolder] = (mountData[mountFolder] ?? 0) + 1;
      continue;
    }
    entries.push({ source: file, archivePath: `teams/${input.slug}/${file}`, mode: LAUNCHER.test(name) ? EXECUTABLE : PLAIN });
  }
  const warnings = EXPECTED_FILES.filter((expected) => !input.files.includes(expected)).map((missing) =>
    missing === 'README.md' ? 'README.md is missing: the archive says nothing of what the team does' : `${missing} is missing: run \`orkeon-bench scaffold ${input.slug}\` before deploying`,
  );
  return Object.freeze({ entries, mountData, buildOutput, refusals, warnings });
}

function refusalOf(file: string, segments: readonly string[], name: string): string | null {
  if (name === '.env' || name.startsWith('.env.')) {
    return `${file}: an environment file never travels with a team (a key lives in the environment of the machine that runs it)`;
  }
  if (SETTINGS_FILE.test(name) && (segments.length === 1 || (segments.length === 2 && segments[0] === 'crew'))) {
    return `${file}: a settings file in the team folder is read by Orkeon in place of the machine's (D40); a team's settings live in settings/<slug>/appsettings.json`;
  }
  if (segments.length > 1 && (segments[0] === 'appsettings' || segments[0] === '_shared')) {
    return `${file}: an ${segments[0] as string}/ folder in the team folder holds a settings file Orkeon reads for every run that names none (D40)`;
  }
  return null;
}

/** The deepest folder of a mount point `file` lies in, or null. */
function innermostMountFolder(file: string, folders: readonly string[]): string | null {
  let innermost: string | null = null;
  for (const folder of folders) {
    if (isWithin(folder, file) && file !== folder && (innermost === null || folder.length > innermost.length)) {
      innermost = folder;
    }
  }
  return innermost;
}

/** `<folder>/.gitkeep` of a mount point folder: the one file of the folder that is shipped. */
function isKeeperOf(file: string, folders: readonly string[]): boolean {
  return folders.some((folder) => file === `${folder}/${FOLDER_KEEPER}`);
}

/** The two shapes of a deployment archive (D45): a zip, or a gzipped tar, which every Unix unpacker restores with its file modes. */
export const ARCHIVE_FORMATS = ['zip', 'tar.gz'] as const;
export type ArchiveFormat = (typeof ARCHIVE_FORMATS)[number];

export function isArchiveFormat(value: string): value is ArchiveFormat {
  return (ARCHIVE_FORMATS as readonly string[]).includes(value);
}

/** `<slug>-<yyyymmdd>.<zip|tar.gz>`, in UTC; `-2`, `-3`… when the day's name is taken in that format. */
export function deploymentArchiveName(slug: string, at: Date, taken: readonly string[], format: ArchiveFormat = 'zip'): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${String(at.getUTCFullYear())}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
  const first = `${slug}-${stamp}.${format}`;
  if (!taken.includes(first)) {
    return first;
  }
  for (let ordinal = 2; ; ordinal += 1) {
    const candidate = `${slug}-${stamp}-${String(ordinal)}.${format}`;
    if (!taken.includes(candidate)) {
      return candidate;
    }
  }
}

/** The `yyyy-mm-dd` of the archive, in UTC, as the comment of the archive and the result say it. */
export function deploymentDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * A settings file holds no secret (`FROZEN-LITERALS.md` § 4): a key whose last segment ends with
 * `ApiKey`, `Password`, `Secret` or `Token` and holds a value, or any value under `Secrets:`, keeps
 * the file out of an archive. `…EnvVar` and `…EnvironmentVariable` name a variable: allowed.
 */
export function secretKeysOf(entries: readonly { key: string; value: unknown }[]): string[] {
  return entries
    .filter(({ key, value }) => holdsValue(value) && (key.toLowerCase().startsWith('secrets:') || /(apikey|password|secret|token)$/i.test(key.split(':').pop() ?? '')))
    .map(({ key }) => key);
}

function holdsValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}
