import { ATTEMPT_MANIFEST_FILE, isAttemptOpen, parseAttemptManifest, type AttemptManifest } from '../../domain/attempt.js';
import { DomainError } from '../../domain/errors.js';
import { ID_PATTERNS, type AttemptId } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from '../use-cases/read-json-file.js';

/** An attempt folder of a team's workbook and its manifest. */
export interface StoredAttempt {
  readonly id: AttemptId;
  /** `workbooks/<slug>/attempts/ATT-nnnn`. */
  readonly folder: string;
  readonly manifest: AttemptManifest;
}

/** An attempt folder that is not closed; its manifest is null when it has none that reads. */
export interface UnclosedAttempt {
  readonly id: AttemptId;
  readonly folder: string;
  readonly manifest: AttemptManifest | null;
  /** Why the manifest of the folder cannot be read, when it has one that does not parse; null otherwise. */
  readonly broken: string | null;
}

/** The lock every command takes to read and change the attempts of a team: `attempts/.lock`. */
const LOCK_FILE = '.lock';

/**
 * The `ATT-nnnn` folders of a team, lowest first. A plain file of that name — nobody but the bench
 * creates attempts, and it creates folders — stops every command, with what it is and how to get
 * out of it, rather than fail later on a folder that is none.
 */
export async function listAttemptIds(fileSystem: FileSystem, team: TeamRef): Promise<AttemptId[]> {
  const attempts = teamPaths(team).attempts;
  const ids = (await fileSystem.list(attempts)).filter((name): name is AttemptId => ID_PATTERNS.ATT.test(name)).sort();
  for (const id of ids) {
    if (!(await fileSystem.isDirectory(joinPath(attempts, id)))) {
      throw new ApplicationError('invalid-input', `${joinPath(attempts, id)} is a file, not an attempt folder: only orkeon-bench creates attempts, as folders — move that file away or remove it`);
    }
  }
  return ids;
}

/**
 * The attempt the hooks count as open (`harness_open_attempt`): the highest `ATT-nnnn` that has no
 * manifest, or whose manifest has `closed_at` null. A manifest that cannot be read — not JSON, not
 * the shape of one — makes its attempt unclosed too: the bench cannot tell, and `attempt close`
 * is the way out.
 */
export async function findUnclosedAttempt(fileSystem: FileSystem, team: TeamRef): Promise<UnclosedAttempt | null> {
  const ids = await listAttemptIds(fileSystem, team);
  for (const id of ids.reverse()) {
    const folder = joinPath(teamPaths(team).attempts, id);
    const manifestFile = joinPath(folder, ATTEMPT_MANIFEST_FILE);
    if (!(await fileSystem.exists(manifestFile))) {
      return { id, folder, manifest: null, broken: null };
    }
    let manifest: AttemptManifest;
    try {
      manifest = parseAttemptManifest(await readJsonFile(fileSystem, manifestFile));
    } catch (error) {
      if (error instanceof ApplicationError || error instanceof DomainError) {
        return { id, folder, manifest: null, broken: error.message };
      }
      throw error;
    }
    if (isAttemptOpen(manifest)) {
      return { id, folder, manifest, broken: null };
    }
  }
  return null;
}

/**
 * The open attempt of a team. An attempt folder without a manifest counts as open for the hooks;
 * the bench, which alone writes manifests, works in none — nor in one whose manifest cannot be
 * read — and names the command that closes it.
 */
export async function findOpenAttempt(fileSystem: FileSystem, team: TeamRef): Promise<StoredAttempt | null> {
  const unclosed = await findUnclosedAttempt(fileSystem, team);
  if (unclosed === null) {
    return null;
  }
  if (unclosed.manifest === null) {
    const what =
      unclosed.broken === null
        ? `${unclosed.folder} has no ${ATTEMPT_MANIFEST_FILE} — an \`attempt open\` that was interrupted, or a folder made by hand`
        : `the ${ATTEMPT_MANIFEST_FILE} of ${unclosed.folder} cannot be read (${unclosed.broken})`;
    throw new ApplicationError('invalid-input', `${what}: \`orkeon-bench attempt close ${team.slug}\` closes it`);
  }
  return { id: unclosed.id, folder: unclosed.folder, manifest: unclosed.manifest };
}

/** The open attempt, or the error that says how to open one. */
export async function requireOpenAttempt(fileSystem: FileSystem, team: TeamRef): Promise<StoredAttempt> {
  const attempt = await findOpenAttempt(fileSystem, team);
  if (attempt === null) {
    throw new ApplicationError('invalid-input', `no open attempt for ${team.slug}: open one with \`orkeon-bench attempt open ${team.slug}\``);
  }
  return attempt;
}

export async function writeAttemptManifest(fileSystem: FileSystem, folder: string, manifest: AttemptManifest): Promise<void> {
  await fileSystem.writeText(joinPath(folder, ATTEMPT_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Runs `action` alone among the commands that read and change the attempts of the team: what it
 * reads is what it changes. Without an `attempts/` folder there is nothing to guard.
 */
export async function withAttemptsLock<T>(fileSystem: FileSystem, team: TeamRef, action: () => Promise<T>): Promise<T> {
  const attempts = teamPaths(team).attempts;
  if (!(await fileSystem.isDirectory(attempts))) {
    return action();
  }
  const release = await fileSystem.lock(joinPath(attempts, LOCK_FILE));
  try {
    return await action();
  } finally {
    await release();
  }
}

/**
 * Changes the manifest of the team's open attempt as it is now, not as an earlier read left it:
 * read, changed and written under the lock. Fails when `expected` is no longer the open attempt —
 * it was closed in the meantime.
 */
export async function updateOpenAttempt(fileSystem: FileSystem, team: TeamRef, expected: AttemptId, change: (manifest: AttemptManifest) => AttemptManifest): Promise<StoredAttempt> {
  return withAttemptsLock(fileSystem, team, async () => {
    const attempt = await findOpenAttempt(fileSystem, team);
    if (attempt === null || attempt.id !== expected) {
      throw new ApplicationError('invalid-input', `${expected} is no longer the open attempt of ${team.slug}: it was closed while this command was running`);
    }
    const manifest = change(attempt.manifest);
    await writeAttemptManifest(fileSystem, attempt.folder, manifest);
    return { ...attempt, manifest };
  });
}
