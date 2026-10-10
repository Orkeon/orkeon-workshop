export interface WriteOptions {
  /** Mode 0755: a launcher. */
  readonly executable?: boolean;
}

/** The identity of a file tree: what a dataset manifest and a run manifest record of one. */
export interface TreeDigest {
  /**
   * The SHA-256 of the lines `<sha256 of the file>  ./<path>`, one per file, sorted by path — the
   * digest of `find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`.
   */
  readonly sha256: string;
  readonly files: number;
  readonly bytes: number;
}

export interface CopyOptions {
  /** Symbolic links are left out of the copy instead of being copied as links. */
  readonly skipLinks?: boolean;
}

/** A temporary directory nobody removed. */
export interface LeftoverDirectory {
  readonly path: string;
  readonly ageSeconds: number;
  /** `gone`: the process that created it, on this machine, is no more. `unknown`: its creator cannot be told, and it is old. */
  readonly owner: 'gone' | 'unknown';
}

/**
 * The file system as the use cases see it. `scaffold` writes in the team folder, `attempt` and `run`
 * in the workbook (attempts and runs), `tools dump` and `run` in a temporary folder.
 */
export interface FileSystem {
  /** Rejects with an ApplicationError (`file-not-found`, or `invalid-input` when unreadable). */
  readText(path: string): Promise<string>;
  /** The content of a file as it is on disk; rejects like `readText`. */
  readBytes(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  /** The names of the entries of a directory, sorted; empty when it does not exist. */
  list(path: string): Promise<string[]>;
  /**
   * Writes or replaces a file in one step: a reader sees the old content or the new one, never an
   * empty or half-written file (the hooks read what the bench writes). Rejects with an
   * ApplicationError (`write-failed`).
   */
  writeText(path: string, content: string, options?: WriteOptions): Promise<void>;
  /** Adds to the end of a file, created when missing; rejects with an ApplicationError (`write-failed`). */
  appendText(path: string, content: string): Promise<void>;
  /** Writes or replaces a file that is not text, in one step like `writeText`; rejects with an ApplicationError (`write-failed`). */
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  /**
   * Copies a file, or a directory with everything in it, to a path that does not exist yet. A
   * symbolic link is never followed: it is copied as the link it is, or left out (`skipLinks`).
   * Rejects with an ApplicationError (`write-failed`).
   */
  copy(from: string, to: string, options?: CopyOptions): Promise<void>;
  /**
   * The symbolic links at or below a path, as paths relative to it (`.` for the path itself),
   * sorted; found without following any. Empty when the path does not exist.
   */
  symbolicLinks(path: string): Promise<string[]>;
  /** Creates a directory and its missing parents; rejects with an ApplicationError (`write-failed`). */
  makeDirectory(path: string): Promise<void>;
  /**
   * Creates one directory, whose parent exists, and tells whether this call created it: false when
   * it was already there — another process took the name. Rejects with an ApplicationError
   * (`write-failed`) for any other failure.
   */
  makeDirectoryExclusive(path: string): Promise<boolean>;
  /** Creates a new empty directory under the system's temporary folder and returns its path; who created it is recorded with it. */
  makeTemporaryDirectory(prefix: string): Promise<string>;
  /**
   * The directories `makeTemporaryDirectory(prefix)` created and nobody removed: those whose creator
   * is gone, and those old enough that no command can still own them when their creator cannot be
   * told. A directory whose creator is alive is not one of them.
   */
  leftoverTemporaryDirectories(prefix: string): Promise<LeftoverDirectory[]>;
  /** Removes a file or a directory and everything in it; nothing when it does not exist. */
  remove(path: string): Promise<void>;
  /** The digest of a directory and everything in it — a symbolic link counts as the link it is, not as what it points to; rejects with an ApplicationError when it cannot be read. */
  digest(path: string): Promise<TreeDigest>;
  /**
   * Takes the lock `path` names — a file created for the time of the lock, in a folder that exists —
   * waiting while another command holds it, and returns what releases it. One reader-modifier at
   * a time of what the lock guards. Rejects with an ApplicationError (`write-failed`) when the lock
   * cannot be had.
   */
  lock(path: string): Promise<() => Promise<void>>;
}
