import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';

/**
 * Reads and parses a JSON file; a syntax error becomes an ApplicationError naming the file. A byte
 * order mark is skipped, as `jq` — through which the hooks read the same files — skips it.
 */
export async function readJsonFile(fileSystem: FileSystem, path: string): Promise<unknown> {
  const text = await fileSystem.readText(path);
  try {
    return JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text) as unknown;
  } catch (error) {
    throw new ApplicationError('invalid-input', `${path} is not valid JSON: ${(error as Error).message}`);
  }
}
