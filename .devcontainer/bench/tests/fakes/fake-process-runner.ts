import type { ProcessResult, ProcessRunOptions, ProcessRunner } from '../../src/application/ports/process-runner.js';

export const NOT_FOUND: ProcessResult = { found: false, exitCode: null, stdout: '', stderr: '' };

export function succeeded(stdout: string): ProcessResult {
  return { found: true, exitCode: 0, stdout, stderr: '' };
}

export function failed(exitCode: number, stderr: string): ProcessResult {
  return { found: true, exitCode, stdout: '', stderr };
}

/**
 * Scripted results keyed by the full command line (`orkeon run --list-tools`), failing that by the
 * longest key the command line starts with (`orkeon run crew` for a run with its mounts), failing
 * that by the command name (`orkeon`); anything else is "not found". Records calls and timeouts.
 * `onRun` plays what a process does besides answering: the files it leaves.
 */
export class FakeProcessRunner implements ProcessRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];
  readonly timeouts: (number | undefined)[] = [];
  readonly options: ProcessRunOptions[] = [];

  constructor(
    private readonly results: Record<string, ProcessResult> = {},
    private readonly onRun: (line: string, options: ProcessRunOptions) => Promise<void> = async () => undefined,
    /** Played once the process has ended and printed everything: what happens after it. */
    private readonly afterRun: (line: string) => Promise<void> | void = () => undefined,
  ) {}

  async run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    this.calls.push({ command, args });
    this.timeouts.push(options.timeoutMs);
    this.options.push(options);
    const line = [command, ...args].join(' ');
    await this.onRun(line, options);
    const prefix = Object.keys(this.results)
      .filter((key) => line.startsWith(`${key} `))
      .sort((a, b) => b.length - a.length)[0];
    const result = this.results[line] ?? (prefix === undefined ? undefined : this.results[prefix]) ?? this.results[command] ?? NOT_FOUND;
    // What the process prints is played line by line; a cancellation it draws stops it there, as the real runner would.
    let cancelled = false;
    void options.cancel?.then(() => {
      cancelled = true;
    });
    const printed: string[] = [];
    for (const printedLine of result.stdout.split(/\r?\n/).filter((candidate) => candidate !== '')) {
      options.onLine?.(printedLine);
      printed.push(printedLine);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled && result.stopped === undefined) {
        return { found: true, exitCode: null, stdout: `${printed.join('\n')}\n`, stderr: result.stderr, stopped: 'cancelled' };
      }
    }
    await this.afterRun(line);
    return result;
  }
}
