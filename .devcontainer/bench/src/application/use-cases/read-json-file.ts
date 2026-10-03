import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';

/** Reads and parses a JSON file; a syntax error becomes an ApplicationError naming the file. */
export async function readJsonFile(fileSystem: FileSystem, path: string): Promise<unknown> {
  const text = await fileSystem.readText(path);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApplicationError('invalid-input', `${path} is not valid JSON: ${(error as Error).message}`);
  }
}
