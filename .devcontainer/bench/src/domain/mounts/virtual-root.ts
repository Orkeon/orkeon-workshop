import { z } from 'zod';

import { DomainError } from '../errors.js';

/**
 * Roots the runner mounts itself; forbidden as team mounts (plan § 3.5). Orkeon 1.2.0, `orkeon run`
 * (`RunnerExecution`, `RunCommand`, checked on the CLI): a crew run reserves `/crew`, a script run
 * `/script`, and both `/llm-logs`, `/llm-mock`, `/llm-cassette`, `/sandbox`, `/state` (the checkpoint
 * store), `/runs` (the run history) and `/credentials`. A team is refused the union: it may become a
 * script, and its mounts must not change name then.
 */
export const RESERVED_VIRTUAL_ROOTS = ['/crew', '/script', '/llm-logs', '/llm-mock', '/llm-cassette', '/sandbox', '/state', '/runs', '/credentials'] as const;

/**
 * The root `orkeon-harness-run` loads plugins from when no `--plugins` names a folder: a team may
 * declare it read-only only (D40), or its agents could write the code of the next run.
 */
export const PLUGINS_ROOT = '/plugins';
export const PLUGINS_ROOT_READ_ONLY = `${PLUGINS_ROOT} is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it "access": "ro", or its agents could drop code that the next run executes`;

/** A virtual root is one lowercase top-level segment: `/workspace`, `/output`, `/registry`, `/mailbox`. */
export const VIRTUAL_ROOT_PATTERN = /^\/[a-z0-9][a-z0-9_-]*$/;

export type VirtualRoot = string & { readonly __virtualRoot: true };

export function isReservedRoot(root: string): boolean {
  return (RESERVED_VIRTUAL_ROOTS as readonly string[]).includes(root);
}

export const virtualRootSchema: z.ZodType<VirtualRoot> = z
  .string()
  .regex(VIRTUAL_ROOT_PATTERN, 'expected a virtual root such as /workspace')
  .refine((root) => !isReservedRoot(root), {
    message: `reserved for the runner (${RESERVED_VIRTUAL_ROOTS.join(', ')})`,
  })
  .transform((root) => root as VirtualRoot);

export function parseVirtualRoot(value: string): VirtualRoot {
  const result = virtualRootSchema.safeParse(value);
  if (!result.success) {
    throw new DomainError(`invalid virtual root "${value}"`, result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}
