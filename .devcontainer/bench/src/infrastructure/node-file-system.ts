import { createHash, randomBytes } from 'node:crypto';
import { appendFile, chmod, cp, link, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rename, rm, stat, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { ApplicationError } from '../application/errors.js';
import type { CopyOptions, FileSystem, LeftoverDirectory, TreeDigest, WriteOptions } from '../application/ports/file-system.js';

/**
 * How long `lock` waits for a lock another command holds: well under the 20 s a hook gives a command
 * of the bench, so that the caller reads the bench's own message rather than a timeout.
 */
export const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 25;
/** A lock this old was left by a command that died: no command holds one that long. */
const LOCK_STALE_MS = 120_000;
/** Beside a lock, for the time one waiter takes it over: the one step two waiters must not take together. */
const TAKEOVER_SUFFIX = '.takeover';
/** In a temporary directory: `<host>:<pid>` of the command that created it. */
const OWNER_FILE = '.owner';
/** A temporary directory whose creator cannot be told is a leftover only when no command can still be using it. */
const LEFTOVER_MIN_AGE_MS = 15 * 60_000;
/** On a disk where another program holds the target open (a Windows host), a rename may be refused for a moment. */
const RENAME_BUSY_CODES = ['EPERM', 'EBUSY', 'EACCES'];
const RENAME_RETRIES = 4;
const RENAME_RETRY_MS = 60;

export interface NodeFileSystemOptions {
  /** How long `lock` waits; `LOCK_WAIT_MS` when absent. */
  readonly lockWaitMs?: number;
  /** The rename `writeText` ends on; the system's when absent. */
  readonly rename?: (from: string, to: string) => Promise<void>;
}

export class NodeFileSystem implements FileSystem {
  private readonly lockWaitMs: number;
  private readonly rename: (from: string, to: string) => Promise<void>;

  constructor(options: NodeFileSystemOptions = {}) {
    this.lockWaitMs = options.lockWaitMs ?? LOCK_WAIT_MS;
    this.rename = options.rename ?? rename;
  }

  async readText(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      const code = errorCode(error);
      throw new ApplicationError(code === 'ENOENT' ? 'file-not-found' : 'invalid-input', `cannot read ${path}: ${code}`);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  async list(path: string): Promise<string[]> {
    try {
      return (await readdir(path)).sort();
    } catch {
      return [];
    }
  }

  async readBytes(path: string): Promise<Uint8Array> {
    try {
      return await readFile(path);
    } catch (error) {
      const code = errorCode(error);
      throw new ApplicationError(code === 'ENOENT' ? 'file-not-found' : 'invalid-input', `cannot read ${path}: ${code}`);
    }
  }

  /**
   * Written beside the file under a name of its own, then renamed over it: the rename is the one
   * step a reader can see. Where the rename is refused because another program holds the target
   * (a disk of a Windows host), it is tried again a few times, then the file is written in place —
   * less safe for a reader, but written.
   */
  async writeText(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    const temporary = `${path}.${String(process.pid)}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, content, 'utf8');
      if (options.executable === true) {
        await chmod(temporary, 0o755);
      }
      for (let attempt = 0; ; attempt += 1) {
        try {
          await this.rename(temporary, path);
          return;
        } catch (error) {
          if (!RENAME_BUSY_CODES.includes(errorCode(error))) {
            throw error;
          }
          if (attempt >= RENAME_RETRIES) {
            break;
          }
          await delay(RENAME_RETRY_MS);
        }
      }
      await writeFile(path, content, 'utf8');
      if (options.executable === true) {
        await chmod(path, 0o755);
      }
      await rm(temporary, { force: true });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new ApplicationError('write-failed', `cannot write ${path}: ${errorCode(error)}`);
    }
  }

  async appendText(path: string, content: string): Promise<void> {
    try {
      await appendFile(path, content, 'utf8');
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot write ${path}: ${errorCode(error)}`);
    }
  }

  async copy(from: string, to: string, options: CopyOptions = {}): Promise<void> {
    try {
      await cp(from, to, {
        recursive: true,
        errorOnExist: true,
        force: false,
        // A link is copied as written, never resolved against where the copy lands.
        verbatimSymlinks: true,
        ...(options.skipLinks === true ? { filter: async (source: string) => !(await lstat(source)).isSymbolicLink() } : {}),
      });
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot copy ${from} to ${to}: ${errorCode(error)}`);
    }
  }

  async symbolicLinks(path: string): Promise<string[]> {
    const root = await lstat(path).catch(() => null);
    if (root === null) {
      return [];
    }
    if (root.isSymbolicLink()) {
      return ['.'];
    }
    const links: string[] = [];
    const visit = async (folder: string, prefix: string): Promise<void> => {
      for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
        if (entry.isSymbolicLink()) {
          links.push(`${prefix}${entry.name}`);
        } else if (entry.isDirectory()) {
          await visit(join(folder, entry.name), `${prefix}${entry.name}/`);
        }
      }
    };
    if (root.isDirectory()) {
      await visit(path, '');
    }
    return links.sort();
  }

  async makeDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot create ${path}: ${errorCode(error)}`);
    }
  }

  async makeDirectoryExclusive(path: string): Promise<boolean> {
    try {
      await mkdir(path);
      return true;
    } catch (error) {
      if (errorCode(error) === 'EEXIST') {
        return false;
      }
      throw new ApplicationError('write-failed', `cannot create ${path}: ${errorCode(error)}`);
    }
  }

  async makeTemporaryDirectory(prefix: string): Promise<string> {
    try {
      const directory = await mkdtemp(join(tmpdir(), prefix));
      await writeFile(join(directory, OWNER_FILE), `${owner()}\n`);
      return directory;
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot create a temporary folder: ${errorCode(error)}`);
    }
  }

  async leftoverTemporaryDirectories(prefix: string): Promise<LeftoverDirectory[]> {
    const leftovers: LeftoverDirectory[] = [];
    for (const name of (await readdir(tmpdir()).catch(() => [])).filter((entry) => entry.startsWith(prefix)).sort()) {
      const path = join(tmpdir(), name);
      const found = await lstat(path).catch(() => null);
      if (found === null || !found.isDirectory()) {
        continue;
      }
      const age = Date.now() - found.mtimeMs;
      const creator = await holderOf(join(path, OWNER_FILE));
      if (creator === 'gone' || (creator === 'unknown' && age > LEFTOVER_MIN_AGE_MS)) {
        leftovers.push({ path, ageSeconds: Math.max(0, Math.round(age / 1000)), owner: creator });
      }
    }
    return leftovers;
  }

  async remove(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot remove ${path}: ${errorCode(error)}`);
    }
  }

  async digest(path: string): Promise<TreeDigest> {
    try {
      const files: string[] = [];
      const links = new Set<string>();
      const visit = async (folder: string, prefix: string): Promise<void> => {
        for (const entry of await readdir(join(path, folder), { withFileTypes: true })) {
          const relative = `${prefix}${entry.name}`;
          if (entry.isDirectory()) {
            await visit(join(folder, entry.name), `${relative}/`);
          } else {
            files.push(relative);
            if (entry.isSymbolicLink()) {
              links.add(relative);
            }
          }
        }
      };
      await visit('', '');
      // Sorted by byte, as `LC_ALL=C sort` does.
      files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      const lines = createHash('sha256');
      let bytes = 0;
      for (const file of files) {
        // A link is what it says, not what it points to: nothing outside the tree is read.
        const content = links.has(file) ? Buffer.from(`-> ${await readlink(join(path, file))}`) : await readFile(join(path, file));
        bytes += content.length;
        lines.update(`${createHash('sha256').update(content).digest('hex')}  ./${file}\n`);
      }
      return { sha256: lines.digest('hex'), files: files.length, bytes };
    } catch (error) {
      throw new ApplicationError(errorCode(error) === 'ENOENT' ? 'file-not-found' : 'invalid-input', `cannot read ${path}: ${errorCode(error)}`);
    }
  }

  /**
   * The lock is a file created with a call that fails when it exists, holding who took it. A lock
   * whose holder died — the same machine, a process that is no more — or that is older than any
   * command holds one is taken over; otherwise the call waits, then gives up.
   */
  async lock(path: string): Promise<() => Promise<void>> {
    const deadline = Date.now() + this.lockWaitMs;
    for (;;) {
      try {
        await writeFile(path, `${owner()}\n`, { flag: 'wx' });
        return async () => {
          await rm(path, { force: true }).catch(() => undefined);
        };
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          throw new ApplicationError('write-failed', `cannot lock ${path}: ${errorCode(error)}`);
        }
      }
      // What stands in the way: the lock itself, or — the lock being abandoned — a waiter that is taking it over.
      const abandoned = await isAbandoned(path);
      if (abandoned && (await takeOver(path))) {
        continue;
      }
      if (Date.now() > deadline) {
        const blocking = abandoned ? `${path}${TAKEOVER_SUFFIX}` : path;
        const holder = (await readFile(blocking, 'utf8').catch(() => '')).trim();
        const who = `another orkeon-bench command${holder === '' ? '' : ` (${holder})`}`;
        const seconds = String(Math.round(this.lockWaitMs / 1000));
        throw new ApplicationError(
          'write-failed',
          abandoned
            ? `cannot lock ${path}: ${who} has been taking it over, holding ${blocking}, for ${seconds} s — try again, or remove that file if no such command is running`
            : `cannot lock ${path}: ${who} has held it for ${seconds} s — try again, or remove the file if no such command is running`,
        );
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

function owner(): string {
  return `${hostname()}:${String(process.pid)}`;
}

/** Who a file of the bench names as its holder: `alive`, `gone` (this machine, a process that is no more), or `unknown`. */
async function holderOf(file: string): Promise<'alive' | 'gone' | 'unknown'> {
  const [host, pid] = (await readFile(file, 'utf8').catch(() => '')).trim().split(':');
  if (host !== hostname() || !/^\d+$/.test(pid ?? '')) {
    return 'unknown';
  }
  try {
    process.kill(Number(pid), 0);
    return 'alive';
  } catch (error) {
    return errorCode(error) === 'ESRCH' ? 'gone' : 'alive';
  }
}

/** True when the lock file was left behind: its holder, on this machine, is gone, or the file is older than any command keeps one. */
async function isAbandoned(lock: string): Promise<boolean> {
  const age = await stat(lock).then(
    (found) => Date.now() - found.mtimeMs,
    () => 0,
  );
  return age > LOCK_STALE_MS || (await holderOf(lock)) === 'gone';
}

/**
 * Removes an abandoned lock, one waiter at a time, and tells whether this waiter got anywhere. Two
 * waiters that both judged a lock abandoned must not both remove "it": the second would remove the
 * lock the first has just taken. So the removal is done under a file of its own, created with a
 * call that fails when it exists, and the lock is judged again inside it: while an abandoned lock
 * stands nobody can create the lock, and only the holder of the take-over removes it. A waiter that
 * finds the take-over held by a live command returns false and waits its turn — within the time
 * `lock` allows; one that finds it abandoned too — its holder gone, as a lock's is judged — clears
 * it and tries again at once.
 */
async function takeOver(lock: string): Promise<boolean> {
  const takeover = `${lock}${TAKEOVER_SUFFIX}`;
  try {
    await writeFile(takeover, `${owner()}\n`, { flag: 'wx' });
  } catch {
    if (await isAbandoned(takeover)) {
      await clearAbandoned(takeover);
      return true;
    }
    return false;
  }
  try {
    // Judged in place first: a lock a live command took in the meantime is not touched at all.
    if (await isAbandoned(lock)) {
      await clearAbandoned(lock);
    }
  } finally {
    await rm(takeover, { force: true }).catch(() => undefined);
  }
  return true;
}

/**
 * Removes `file` if it is abandoned, in a way a late judgement cannot turn against a live holder:
 * the file is first renamed aside — one step, which one caller wins — and judged again under the
 * name nobody else knows. Abandoned, it is deleted; taken by a live command in the meantime, it is
 * put back where it was.
 */
async function clearAbandoned(file: string): Promise<void> {
  const aside = `${file}.${String(process.pid)}.${randomBytes(4).toString('hex')}.gone`;
  try {
    await rename(file, aside);
  } catch {
    return;
  }
  if (!(await isAbandoned(aside))) {
    await link(aside, file).catch(() => undefined);
  }
  await rm(aside, { force: true }).catch(() => undefined);
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? 'unknown error';
}
