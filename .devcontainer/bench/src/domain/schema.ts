import type { ZodError, ZodType } from 'zod';

import { DomainError } from './errors.js';

/** Renders zod issues as `path: message` lines, stable enough to be asserted in tests. */
export function describeIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
  });
}

/** Parses `input` with `schema`; a failure becomes a DomainError naming `what`. */
export function parseWith<T>(schema: ZodType<T>, input: unknown, what: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError(`invalid ${what}`, describeIssues(result.error));
  }
  return result.data;
}
