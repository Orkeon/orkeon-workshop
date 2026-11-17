import { parseBenchConfig, type BenchConfig } from '../../domain/bench-config.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';

/**
 * `tests/<slug>/bench.config.json` with `budget.remote_usd_max` as the file states it: the default
 * the parser would supply is no cap anyone agreed to. What `attempt approve` and `estimate` price
 * a paid run against, refused alike when the file or the cap is missing.
 */
export async function readStatedRemoteCap(fileSystem: FileSystem, team: TeamRef): Promise<{ config: BenchConfig; capUsd: number }> {
  const path = teamPaths(team).benchConfigFile;
  if (!(await fileSystem.exists(path))) {
    throw new ApplicationError('file-not-found', `no cap for a remote run: ${path} does not exist (/team-init writes it, with budget.remote_usd_max)`);
  }
  const raw = await readJsonFile(fileSystem, path);
  const budget = typeof raw === 'object' && raw !== null ? (raw as { budget?: unknown }).budget : undefined;
  const stated = typeof budget === 'object' && budget !== null && 'remote_usd_max' in budget;
  const config = parseBenchConfig(raw);
  if (!stated) {
    throw new ApplicationError('invalid-input', `no cap for a remote run: ${path} states no budget.remote_usd_max`);
  }
  return { config, capUsd: config.budget.remote_usd_max };
}
