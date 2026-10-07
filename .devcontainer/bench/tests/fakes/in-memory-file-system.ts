import { createHash } from 'node:crypto';

import { ApplicationError } from '../../src/application/errors.js';
import type { CopyOptions, FileSystem, LeftoverDirectory, TreeDigest, WriteOptions } from '../../src/application/ports/file-system.js';

/** Files keyed by absolute path; directories are implied by file paths or added explicitly. */
export class InMemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();
  private readonly executables = new Set<string>();
  /** Files that are not text, by path; `files` holds a lossy reading of them, as `readText` would give. */
  private readonly binaries = new Map<string, Uint8Array>();
  /** The locks held, each with the release the next taker waits for. */
  private readonly locks = new Map<string, Promise<void>>();
  /** Symbolic links: where each points, by path. Reads follow them, as the system's do; `symbolicLinks` and `digest` do not. */
  private readonly links = new Map<string, string>();
  /** What `leftoverTemporaryDirectories` answers: set by a test. */
  leftovers: LeftoverDirectory[] = [];
  private temporaryCount = 0;
  /** The paths `lock` was called with, in order. */
  readonly locked: string[] = [];
  /** The paths `remove` was called with, in order. */
  readonly removed: string[] = [];

  addFile(path: string, content: string): this {
    this.files.set(path, content);
    this.addParents(path);
    return this;
  }

  /** A file that is not text. */
  addBytes(path: string, content: Uint8Array): this {
    this.binaries.set(path, content);
    return this.addFile(path, new TextDecoder().decode(content));
  }

  /** A symbolic link at `path` to the absolute path `target`. */
  addLink(path: string, target: string): this {
    this.links.set(path, target);
    this.addParents(path);
    return this;
  }

  /** `path` with the links on its way replaced by what they point to. */
  private resolve(path: string): string {
    let resolved = path;
    for (let hops = 0; hops < 8; hops += 1) {
      const link = [...this.links.keys()].find((candidate) => resolved === candidate || resolved.startsWith(`${candidate}/`));
      if (link === undefined) {
        break;
      }
      resolved = (this.links.get(link) as string) + resolved.slice(link.length);
    }
    return resolved;
  }

  addDirectory(path: string): this {
    this.directories.add(path);
    this.addParents(path);
    return this;
  }

  /** Whether `writeText` marked the file executable. */
  isExecutable(path: string): boolean {
    return this.executables.has(path);
  }

  async readText(given: string): Promise<string> {
    const path = this.resolve(given);
    const content = this.files.get(path);
    if (content === undefined) {
      throw new ApplicationError(this.directories.has(path) ? 'invalid-input' : 'file-not-found', `cannot read ${path}`);
    }
    return content;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return this.binaries.get(this.resolve(path)) ?? new TextEncoder().encode(await this.readText(path));
  }

  async exists(given: string): Promise<boolean> {
    const path = this.resolve(given);
    return this.files.has(path) || this.directories.has(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.directories.has(this.resolve(path));
  }

  async symbolicLinks(path: string): Promise<string[]> {
    if (this.links.has(path)) {
      return ['.'];
    }
    return [...this.links.keys()]
      .filter((link) => link.startsWith(`${path}/`))
      .map((link) => link.slice(path.length + 1))
      .sort();
  }

  async leftoverTemporaryDirectories(prefix: string): Promise<LeftoverDirectory[]> {
    return this.leftovers.filter((leftover) => leftover.path.slice(leftover.path.lastIndexOf('/') + 1).startsWith(prefix));
  }

  async list(path: string): Promise<string[]> {
    if (!this.directories.has(path)) {
      return [];
    }
    const prefix = path === '/' ? '/' : `${path}/`;
    const names = new Set<string>();
    for (const entry of [...this.files.keys(), ...this.directories, ...this.links.keys()]) {
      if (entry.startsWith(prefix) && entry.length > prefix.length) {
        names.add(entry.slice(prefix.length).split('/')[0] as string);
      }
    }
    return [...names].sort();
  }

  async writeText(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    if (this.directories.has(path)) {
      throw new ApplicationError('write-failed', `cannot write ${path}: EISDIR`);
    }
    this.binaries.delete(path);
    this.addFile(path, content);
    if (options.executable === true) {
      this.executables.add(path);
    } else {
      this.executables.delete(path);
    }
  }

  async appendText(path: string, content: string): Promise<void> {
    await this.writeText(path, (this.files.get(path) ?? '') + content);
  }

  async copy(from: string, to: string, options: CopyOptions = {}): Promise<void> {
    for (const [link, target] of [...this.links].filter(([entry]) => entry === from || entry.startsWith(`${from}/`))) {
      if (options.skipLinks !== true) {
        this.links.set(to + link.slice(from.length), target);
      }
    }
    if (this.links.has(from)) {
      return;
    }
    if (this.files.has(to) || this.directories.has(to)) {
      throw new ApplicationError('write-failed', `cannot copy ${from} to ${to}: EEXIST`);
    }
    const content = this.files.get(from);
    if (content !== undefined) {
      this.copyFile(from, to, content);
      return;
    }
    if (!this.directories.has(from)) {
      throw new ApplicationError('write-failed', `cannot copy ${from} to ${to}: ENOENT`);
    }
    this.addDirectory(to);
    for (const directory of [...this.directories].filter((entry) => entry.startsWith(`${from}/`))) {
      this.addDirectory(to + directory.slice(from.length));
    }
    for (const [file, text] of [...this.files].filter(([entry]) => entry.startsWith(`${from}/`))) {
      this.copyFile(file, to + file.slice(from.length), text);
    }
  }

  private copyFile(from: string, to: string, text: string): void {
    const bytes = this.binaries.get(from);
    if (bytes === undefined) {
      this.addFile(to, text);
    } else {
      this.addBytes(to, bytes);
    }
  }

  async makeDirectoryExclusive(path: string): Promise<boolean> {
    if (this.files.has(path) || this.directories.has(path)) {
      return false;
    }
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    if (!this.directories.has(parent)) {
      throw new ApplicationError('write-failed', `cannot create ${path}: ENOENT`);
    }
    this.directories.add(path);
    return true;
  }

  async digest(path: string): Promise<TreeDigest> {
    if (!this.directories.has(path)) {
      throw new ApplicationError('file-not-found', `cannot read ${path}: ENOENT`);
    }
    const files = [...this.files.keys(), ...this.links.keys()].filter((file) => file.startsWith(`${path}/`)).sort();
    const lines = createHash('sha256');
    let bytes = 0;
    for (const file of files) {
      const link = this.links.get(file);
      const content = link === undefined ? await this.readBytes(file) : new TextEncoder().encode(`-> ${link}`);
      bytes += content.length;
      lines.update(`${createHash('sha256').update(content).digest('hex')}  ./${file.slice(path.length + 1)}\n`);
    }
    return { sha256: lines.digest('hex'), files: files.length, bytes };
  }

  /** A real lock between the commands of one test: the second taker waits for the first to release. */
  async lock(path: string): Promise<() => Promise<void>> {
    this.locked.push(path);
    while (this.locks.has(path)) {
      await this.locks.get(path);
    }
    let release: () => void = () => undefined;
    this.locks.set(
      path,
      new Promise<void>((done) => {
        release = done;
      }),
    );
    return async () => {
      this.locks.delete(path);
      release();
    };
  }

  async makeDirectory(path: string): Promise<void> {
    if (this.files.has(path)) {
      throw new ApplicationError('write-failed', `cannot create ${path}: EEXIST`);
    }
    this.addDirectory(path);
  }

  async makeTemporaryDirectory(prefix: string): Promise<string> {
    this.temporaryCount += 1;
    const path = `/tmp/${prefix}${String(this.temporaryCount)}`;
    this.addDirectory(path);
    return path;
  }

  async remove(path: string): Promise<void> {
    this.removed.push(path);
    const below = (entry: string): boolean => entry === path || entry.startsWith(`${path}/`);
    for (const link of [...this.links.keys()].filter(below)) {
      this.links.delete(link);
    }
    for (const file of [...this.files.keys()].filter(below)) {
      this.files.delete(file);
      this.binaries.delete(file);
      this.executables.delete(file);
    }
    for (const directory of [...this.directories].filter(below)) {
      this.directories.delete(directory);
    }
  }

  private addParents(path: string): void {
    let parent = path;
    while (parent.includes('/') && parent !== '/') {
      parent = parent.slice(0, parent.lastIndexOf('/')) || '/';
      this.directories.add(parent);
    }
  }
}
