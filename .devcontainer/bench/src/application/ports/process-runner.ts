/** What a process may print, both streams together, before the bench stops it (`stopped: 'output-limit'`). */
export const PROCESS_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

/** Why the bench stopped a process itself, rather than the process ending. */
export type ProcessStop = 'timeout' | 'output-limit' | 'cancelled';

export interface ProcessResult {
  /** False when the executable is not on the PATH. */
  readonly found: boolean;
  /** Null when the process did not exit normally (signal, stopped by the bench, not found). */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Set when the bench stopped the process: its time was up, it printed too much, or the run was cancelled. */
  readonly stopped?: ProcessStop;
}

export interface ProcessRunOptions {
  readonly timeoutMs?: number;
  /** The working directory; the bench's own when absent. */
  readonly cwd?: string;
  /** The complete environment of the process; the bench's own when absent. */
  readonly env?: Readonly<Record<string, string>>;
  /** What the process reads on its standard input, which is then closed; left open when absent. */
  readonly input?: string;
  /**
   * The process leads a process group of its own, and stopping it stops the whole group: what a
   * launcher or a wrapper started goes with it.
   */
  readonly ownGroup?: boolean;
  /** Stops the process when it resolves (`stopped: 'cancelled'`). */
  readonly cancel?: Promise<void>;
}

/** Runs an external command without a shell; never throws for a missing executable. */
export interface ProcessRunner {
  run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}
