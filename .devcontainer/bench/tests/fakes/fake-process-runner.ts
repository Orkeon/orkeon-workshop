import type { ProcessResult, ProcessRunOptions, ProcessRunner } from '../../src/application/ports/process-runner.js';

export const NOT_FOUND: ProcessResult = { found: false, exitCode: null, stdout: '', stderr: '' };

export function succeeded(stdout: string): ProcessResult {
  return { found: true, exitCode: 0, stdout, stderr: '' };
}

export function failed(exitCode: number, stderr: string): ProcessResult {
  return { found: true, exitCode, stdout: '', stderr };
}

/**
 * Scripted results keyed by the full command line (`orkeon run --list-tools`) or, failing that,
 * by the command name (`orkeon`); anything else is "not found". Records calls and timeouts.
 */
export class FakeProcessRunner implements ProcessRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];
  readonly timeouts: (number | undefined)[] = [];
  readonly options: ProcessRunOptions[] = [];

  constructor(private readonly results: Record<string, ProcessResult> = {}) {}

  async run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    this.calls.push({ command, args });
    this.timeouts.push(options.timeoutMs);
    this.options.push(options);
    return this.results[[command, ...args].join(' ')] ?? this.results[command] ?? NOT_FOUND;
  }
}
