import { ApplicationError } from '../application/errors.js';
import { DomainError } from '../domain/errors.js';
import { EXIT } from './exit-codes.js';
import type { Output } from './output.js';

/** Carries the exit code decided by the command that ran. */
export class Session {
  exitCode: number = EXIT.ok;

  constructor(readonly output: Output) {}

  /**
   * Runs a command; an expected failure is printed and becomes exit code 2 — exit code 3, in the
   * words of a planned command, when what was asked belongs to a later lot; exit code 130 when the
   * command was asked to stop.
   */
  async run(command: () => Promise<number>): Promise<void> {
    try {
      this.exitCode = await command();
    } catch (error) {
      if (error instanceof ApplicationError && error.code === 'not-implemented') {
        this.output.error(`orkeon-bench ${error.message}`);
        this.exitCode = EXIT.notImplemented;
        return;
      }
      if (error instanceof ApplicationError && error.code === 'interrupted') {
        this.output.error(`error: ${error.message}`);
        this.exitCode = EXIT.interrupted;
        return;
      }
      if (error instanceof ApplicationError || error instanceof DomainError) {
        this.output.error(`error: ${error.message}`);
        this.exitCode = EXIT.error;
        return;
      }
      throw error;
    }
  }
}
