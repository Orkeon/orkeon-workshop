import { z } from 'zod';

import { DomainError } from '../errors.js';
import { baseName, joinPath } from '../paths.js';
import { parseWith } from '../schema.js';
import { MOUNT_SET_PREFIX, workshopOfTeam } from '../team-ref.js';
import { bindMount, mountArguments, studioMountSpec, type MountBinding } from './mount-binding.js';
import { mountDeclarationSchema, type MountDeclaration } from './mount-declaration.js';
import { UNKNOWN_MACHINE, judgeMountReach, type MachineFolders } from './mount-reach.js';
import type { VirtualRoot } from './virtual-root.js';

/** Name of the implicit mount set: the team's own folders, the `default` of each mount point. */
export const DEFAULT_ENVIRONMENT = 'default';
/** The name of a named mount set, and of its folder `mounts.<name>/`: one kebab-case word. */
export const MOUNT_SET_NAME = /^[a-z][a-z0-9-]*$/;

const ENVIRONMENTS_REPLACED =
  'replaced by mount sets: a named set is the folder mounts.<name>/<team>/ next to teams/, one sub-folder per mount point — remove this key';

/**
 * `mounts.json`: the mount points a team declares — free in name and number — each with the
 * folder that backs it by default (plan § 3.5, D27). Named mount sets are folders, not entries of
 * this file (D28).
 */
export const mountSetSchema = z
  .object({
    version: z.literal(1).default(1),
    mounts: z.array(mountDeclarationSchema).min(1, 'a team declares at least one mount'),
    /** The per-environment paths of the first format: refused, with what replaced them. */
    environments: z.unknown().optional(),
  })
  .superRefine((set, context) => {
    if (set.environments !== undefined) {
      context.addIssue({ code: 'custom', path: ['environments'], message: ENVIRONMENTS_REPLACED });
    }
    const roots = new Set<string>();
    set.mounts.forEach((mount, index) => {
      if (roots.has(mount.root)) {
        context.addIssue({ code: 'custom', path: ['mounts', index, 'root'], message: `duplicate root ${mount.root}` });
      }
      roots.add(mount.root);
    });
  });

export interface MountSet {
  readonly version: 1;
  readonly mounts: readonly MountDeclaration[];
}

export function parseMountSet(input: unknown): MountSet {
  const { version, mounts } = parseWith(mountSetSchema, input, 'mounts.json');
  return Object.freeze({ version, mounts });
}

export function isMountSetName(name: string): boolean {
  return MOUNT_SET_NAME.test(name);
}

/**
 * `<workshop>/mounts.<name>/<team>`: the folder of a named mount set of a team (D28). It is
 * relative to the team folder, so the rule needs no variable and holds wherever the workshop is:
 * in the container, on the host, under Windows.
 */
export function mountSetFolder(teamFolder: string, name: string): string {
  return joinPath(workshopOfTeam(teamFolder), `${MOUNT_SET_PREFIX}${name}`, baseName(teamFolder));
}

/** The folder of a mount point in a named set: the point's name without its slash, as in a dataset. */
export function mountPointFolder(root: VirtualRoot): string {
  return root.slice(1);
}

/** The ordered bindings of one mount set and the `orkeon run` arguments they produce. */
export interface MountResolution {
  readonly environment: string;
  /** The folder of the named set; null for the team's own folders. */
  readonly setFolder: string | null;
  readonly bindings: readonly MountBinding[];
  readonly allowExternal: boolean;
  /** `--mount <spec>... [--allow-external-mounts]`, to append to `orkeon run crew`. */
  readonly arguments: readonly string[];
  /** The `mounts[]` of the Studio card (`studio-team.json`) for the same bindings. */
  readonly studioMounts: readonly string[];
  /** What a binding of the team's own folders lets through and Studio would refuse (`judgeMountReach`). */
  readonly warnings: readonly string[];
}

/**
 * Binds every mount point: to its `default` folder for the `default` set, to
 * `mounts.<name>/<team>/<point>` for a named set. Whether a named set exists is a question for
 * the caller, which has the file system. The team's own folders are judged by `judgeMountReach`
 * (`machine`: the home folder, `$ORKEON_WORKSHOP` and `$XDG_CONFIG_HOME/Orkeon`, as the caller
 * read them): a folder its agents must never reach is refused.
 */
export function resolveMountSet(
  set: MountSet,
  teamFolder: string,
  environment: string = DEFAULT_ENVIRONMENT,
  machine: MachineFolders = UNKNOWN_MACHINE,
): MountResolution {
  let setFolder: string | null = null;
  if (environment !== DEFAULT_ENVIRONMENT) {
    if (!isMountSetName(environment)) {
      throw new DomainError(`unknown environment "${environment}": a mount set is named in kebab-case, like its folder mounts.<name>/`);
    }
    setFolder = mountSetFolder(teamFolder, environment);
  }
  const bindings = set.mounts.map((declaration) =>
    bindMount(
      declaration,
      setFolder === null ? declaration.default : joinPath(setFolder, mountPointFolder(declaration.root)),
      environment,
      teamFolder,
    ),
  );
  const reach = setFolder === null ? judgeMountReach(bindings, teamFolder, machine) : { errors: [], warnings: [] };
  if (reach.errors.length > 0) {
    throw new DomainError(`mounts.json: ${reach.errors.join('; ')}`);
  }
  return Object.freeze({
    environment,
    setFolder,
    bindings,
    allowExternal: bindings.some((binding) => binding.external),
    arguments: mountArguments(bindings),
    studioMounts: bindings.map(studioMountSpec),
    warnings: reach.warnings,
  });
}
