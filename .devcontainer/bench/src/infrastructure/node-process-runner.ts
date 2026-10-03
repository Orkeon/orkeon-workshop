import { execFile, type ExecFileException } from 'node:child_process';

import type { ProcessResult, ProcessRunOptions, ProcessRunner } from '../application/ports/process-runner.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/** Runs a command without a shell; a missing executable yields `found: false` instead of throwing. */
export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        [...args],
        {
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          killSignal: 'SIGKILL',
          encoding: 'utf8',
          maxBuffer: MAX_BUFFER,
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options.env === undefined ? {} : { env: { ...options.env } }),
        },
        (error: ExecFileException | null, stdout: string, stderr: string) => {
          if (error === null) {
            resolve({ found: true, exitCode: 0, stdout, stderr });
          } else if (error.code === 'ENOENT') {
            resolve({ found: false, exitCode: null, stdout, stderr });
          } else {
            resolve({ found: true, exitCode: typeof error.code === 'number' ? error.code : null, stdout, stderr });
          }
        },
      );
    });
  }
}
