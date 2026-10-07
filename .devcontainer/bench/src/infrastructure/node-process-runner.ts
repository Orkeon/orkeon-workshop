import { spawn } from 'node:child_process';

import { PROCESS_OUTPUT_LIMIT_BYTES, type ProcessResult, type ProcessRunOptions, type ProcessRunner, type ProcessStop } from '../application/ports/process-runner.js';

const DEFAULT_TIMEOUT_MS = 30_000;
/** After the bench stopped a process: how long it waits for its streams to close before answering anyway. */
const CLOSE_GRACE_MS = 2_000;

/**
 * Runs a command without a shell; a missing executable yields `found: false` instead of throwing.
 * A process that runs out of time, prints more than `PROCESS_OUTPUT_LIMIT_BYTES` or is cancelled is killed —
 * with its whole process group when it leads one — and the result says which (`stopped`).
 */
export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: options.ownGroup === true,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options.env === undefined ? {} : { env: { ...options.env } }),
      });
      const output = { stdout: '', stderr: '' };
      let bytes = 0;
      let stopped: ProcessStop | undefined;
      let settled = false;
      let grace: NodeJS.Timeout | undefined;

      const settle = (result: ProcessResult): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          clearTimeout(grace);
          resolve(result);
        }
      };
      const stop = (reason: ProcessStop): void => {
        if (settled || stopped !== undefined) {
          return;
        }
        stopped = reason;
        try {
          if (options.ownGroup === true && child.pid !== undefined) {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Already gone.
        }
        // A process outside the group may still hold the pipes: do not wait for it.
        grace = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          settle({ found: true, exitCode: null, ...output, stopped: reason });
        }, CLOSE_GRACE_MS);
      };
      const timer = setTimeout(() => {
        stop('timeout');
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      void options.cancel?.then(() => {
        stop('cancelled');
      });

      for (const stream of ['stdout', 'stderr'] as const) {
        child[stream].setEncoding('utf8');
        child[stream].on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > PROCESS_OUTPUT_LIMIT_BYTES) {
            stop('output-limit');
          } else {
            output[stream] += chunk;
          }
        });
      }
      child.on('error', (error: NodeJS.ErrnoException) => {
        settle({ found: error.code !== 'ENOENT', exitCode: null, ...output });
      });
      child.on('close', (code) => {
        settle({ found: true, exitCode: stopped === undefined ? code : null, ...output, ...(stopped === undefined ? {} : { stopped }) });
      });
      // A process that exits without reading closes the pipe first: not an error of the run.
      child.stdin.on('error', () => undefined);
      if (options.input !== undefined) {
        child.stdin.end(options.input);
      }
    });
  }
}
