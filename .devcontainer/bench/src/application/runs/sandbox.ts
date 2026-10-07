import type { FileSystem, LeftoverDirectory } from '../ports/file-system.js';

/** The prefix of the sandbox of a run, under the system's temporary folder. */
export const SANDBOX_PREFIX = 'orkeon-bench-run-';

/**
 * What to say of the sandboxes a run left behind, or null when there is none. A run removes its
 * sandbox whatever happens to it — except when it is killed outright (SIGKILL, a machine that
 * stops): nothing can then stop the `orkeon run` it started, which leads a group of its own, nor
 * remove the folder. The bench does not remove it either: that run may still be writing there.
 */
export async function leftoverSandboxes(fileSystem: FileSystem): Promise<string | null> {
  const leftovers = await fileSystem.leftoverTemporaryDirectories(SANDBOX_PREFIX);
  if (leftovers.length === 0) {
    return null;
  }
  const named = leftovers.map((leftover) => `${leftover.path} (${age(leftover)}${leftover.owner === 'gone' ? ', the run that made it is gone' : ''})`).join(', ');
  return `${String(leftovers.length)} sandbox${leftovers.length === 1 ? '' : 'es'} left by a run that was killed: ${named} — an \`orkeon run\` it started may still be running on ${leftovers.length === 1 ? 'it' : 'them'}: stop it, then remove the folder${leftovers.length === 1 ? '' : 's'}`;
}

function age(leftover: LeftoverDirectory): string {
  const minutes = Math.floor(leftover.ageSeconds / 60);
  return minutes < 1 ? `${String(leftover.ageSeconds)} s old` : `${String(minutes)} min old`;
}
