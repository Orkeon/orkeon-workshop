export type ApplicationErrorCode = 'team-not-found' | 'file-not-found' | 'invalid-input' | 'write-failed' | 'process-failed';

/**
 * An expected failure of a use case: a missing team or file, input that does not parse, a write that
 * fails, an external command that is missing or fails.
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}
