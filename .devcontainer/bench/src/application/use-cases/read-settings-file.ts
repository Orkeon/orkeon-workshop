import { strictJsonOffence, strictJsonRefusal } from '../../domain/strict-json.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';

/**
 * Reads an Orkeon settings file as the bench reads one: strict JSON. A comment, a trailing comma or
 * a key written twice — which Orkeon reads, the last one by merging both — is refused with the file,
 * the line and what was found there: what the bench would generate or judge from such a file would
 * not be what Orkeon reads.
 */
export async function readSettingsFile(fileSystem: FileSystem, path: string): Promise<unknown> {
  const offence = strictJsonOffence(await fileSystem.readText(path));
  if (offence !== null) {
    throw new ApplicationError('invalid-input', strictJsonRefusal(path, offence));
  }
  return readJsonFile(fileSystem, path);
}
