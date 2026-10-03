import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApplicationError } from '../application/errors.js';
import type { FileSystem, WriteOptions } from '../application/ports/file-system.js';

export class NodeFileSystem implements FileSystem {
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

  async writeText(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    try {
      await writeFile(path, content, 'utf8');
      if (options.executable === true) {
        await chmod(path, 0o755);
      }
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot write ${path}: ${errorCode(error)}`);
    }
  }

  async makeDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot create ${path}: ${errorCode(error)}`);
    }
  }

  async makeTemporaryDirectory(prefix: string): Promise<string> {
    try {
      return await mkdtemp(join(tmpdir(), prefix));
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot create a temporary folder: ${errorCode(error)}`);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      throw new ApplicationError('write-failed', `cannot remove ${path}: ${errorCode(error)}`);
    }
  }
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? 'unknown error';
}
