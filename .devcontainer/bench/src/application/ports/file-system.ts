export interface WriteOptions {
  /** Mode 0755: a launcher. */
  readonly executable?: boolean;
}

/** The file system as the use cases see it. Only `scaffold` writes in the workshop; `tools dump` in a temporary folder. */
export interface FileSystem {
  /** Rejects with an ApplicationError (`file-not-found`, or `invalid-input` when unreadable). */
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  /** The names of the entries of a directory, sorted; empty when it does not exist. */
  list(path: string): Promise<string[]>;
  /** Writes or replaces a file; rejects with an ApplicationError (`write-failed`). */
  writeText(path: string, content: string, options?: WriteOptions): Promise<void>;
  /** Creates a directory and its missing parents; rejects with an ApplicationError (`write-failed`). */
  makeDirectory(path: string): Promise<void>;
  /** Creates a new empty directory under the system's temporary folder and returns its path. */
  makeTemporaryDirectory(prefix: string): Promise<string>;
  /** Removes a file or a directory and everything in it; nothing when it does not exist. */
  remove(path: string): Promise<void>;
}
