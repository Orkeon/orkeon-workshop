/** Raised when a domain rule is violated (invalid id, reserved mount root, unknown environment...). */
export class DomainError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length === 0 ? message : `${message}: ${issues.join('; ')}`);
    this.name = 'DomainError';
    this.issues = issues;
  }
}
