import { z } from 'zod';

import { PLUGINS_ROOT, PLUGINS_ROOT_READ_ONLY, virtualRootSchema } from './virtual-root.js';

/** Access modes accepted by `orkeon run --mount physical:virtual:<access>`. */
export const MOUNT_ACCESSES = ['ro', 'rw', 'rwnd'] as const;
export type MountAccess = (typeof MOUNT_ACCESSES)[number];

/**
 * A physical path as written in mounts.json: relative to the team folder, or absolute. Nothing
 * expands `~`, `$VAR` or `%VAR%`, so such a path would silently bind a folder of that name.
 */
export const physicalPathSchema = z
  .string()
  .min(1, 'a physical path is required')
  .refine((path) => !/^[~$%]/.test(path), {
    message: 'not expanded by the bench: write a path relative to the team folder, or an absolute path',
  });

/**
 * One mount point of the team: the virtual root its agents see, its access, its role and the
 * folder that backs it by default (relative to the team folder, or absolute). A team declares as
 * many as its need calls for, under the names it chooses (D27); `/plugins` only read-only.
 */
export const mountDeclarationSchema = z
  .object({
    root: virtualRootSchema,
    access: z.enum(MOUNT_ACCESSES),
    role: z.string().regex(/^[a-z][a-z0-9-]*$/, 'expected a kebab-case role such as inputs'),
    default: physicalPathSchema,
    description: z.string().optional(),
  })
  .superRefine((mount, context) => {
    if (mount.root === PLUGINS_ROOT && mount.access !== 'ro') {
      context.addIssue({ code: 'custom', path: ['access'], message: PLUGINS_ROOT_READ_ONLY });
    }
  });
export type MountDeclaration = z.infer<typeof mountDeclarationSchema>;

export function isWritable(declaration: Pick<MountDeclaration, 'access'>): boolean {
  return declaration.access !== 'ro';
}
