import { UNKNOWN_ORKEON_VERSION } from '../../domain/attempt.js';
import { extractVersion } from '../../domain/orkeon-version.js';
import type { ProcessRunner } from '../ports/process-runner.js';

const VERSION_TIMEOUT_MS = 20_000;

/** The version of the installed `orkeon`, as `orkeon --version` prints it; `unknown` when it gives none. */
export async function installedOrkeonVersion(processes: ProcessRunner): Promise<string> {
  const result = await processes.run('orkeon', ['--version'], { timeoutMs: VERSION_TIMEOUT_MS });
  return (result.exitCode === 0 ? extractVersion(result.stdout) : null) ?? UNKNOWN_ORKEON_VERSION;
}
