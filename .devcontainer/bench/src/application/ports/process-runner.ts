export interface ProcessResult {
  /** False when the executable is not on the PATH. */
  readonly found: boolean;
  /** Null when the process did not exit normally (signal, timeout, not found). */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  readonly timeoutMs?: number;
  /** The working directory; the bench's own when absent. */
  readonly cwd?: string;
  /** The complete environment of the process; the bench's own when absent. */
  readonly env?: Readonly<Record<string, string>>;
}

/** Runs an external command without a shell; never throws for a missing executable. */
export interface ProcessRunner {
  run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}
