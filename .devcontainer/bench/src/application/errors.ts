export type ApplicationErrorCode = 'team-not-found' | 'file-not-found' | 'invalid-input' | 'write-failed' | 'process-failed' | 'not-implemented' | 'interrupted';

/**
 * An expected failure of a use case: a missing team or file, input that does not parse, a write that
 * fails, an external command that is missing or fails, a request this version of the bench does
 * not serve yet (`not-implemented`: the command exists, part of it belongs to a later lot), a
 * command stopped by a signal once it has put things back in order (`interrupted`).
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

/**
 * A command stopped on request (SIGINT, SIGTERM) once it has put things back in order: what it
 * started is stopped, what it borrowed is removed, what it leaves says it was interrupted.
 */
export class InterruptedError extends ApplicationError {
  constructor(
    message: string,
    /** The run that was in flight, when there was one: its folder holds a manifest that says so. */
    readonly run: string | null = null,
  ) {
    super('interrupted', message);
    this.name = 'InterruptedError';
  }
}
