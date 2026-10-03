import { ApplicationError } from '../../src/application/errors.js';
import type { FileSystem, WriteOptions } from '../../src/application/ports/file-system.js';

/** Files keyed by absolute path; directories are implied by file paths or added explicitly. */
export class InMemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();
  private readonly executables = new Set<string>();
  private temporaryCount = 0;
  /** The paths `remove` was called with, in order. */
  readonly removed: string[] = [];

  addFile(path: string, content: string): this {
    this.files.set(path, content);
    this.addParents(path);
    return this;
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

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new ApplicationError(this.directories.has(path) ? 'invalid-input' : 'file-not-found', `cannot read ${path}`);
    }
    return content;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.directories.has(path);
  }

  async list(path: string): Promise<string[]> {
    if (!this.directories.has(path)) {
      return [];
    }
    const prefix = path === '/' ? '/' : `${path}/`;
    const names = new Set<string>();
    for (const entry of [...this.files.keys(), ...this.directories]) {
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
    this.addFile(path, content);
    if (options.executable === true) {
      this.executables.add(path);
    } else {
      this.executables.delete(path);
    }
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
    for (const file of [...this.files.keys()].filter(below)) {
      this.files.delete(file);
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
