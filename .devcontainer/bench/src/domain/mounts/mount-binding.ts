import { isWindowsAbsolutePath, isWithin, normalizePath, relativeWithin, resolvePath } from '../paths.js';
import type { MountAccess, MountDeclaration } from './mount-declaration.js';
import type { VirtualRoot } from './virtual-root.js';

/** Flag `orkeon run` needs when a physical path lies outside the working (team) folder. */
export const ALLOW_EXTERNAL_MOUNTS_FLAG = '--allow-external-mounts';
/** One flag carries every binding: `--mount a:/x:ro b:/y:rw`. */
export const MOUNT_FLAG = '--mount';

/** A declared mount point bound to a physical path for one mount set. */
export interface MountBinding {
  readonly root: VirtualRoot;
  readonly access: MountAccess;
  readonly role: string;
  readonly environment: string;
  /** The path as written in mounts.json (`default`), or the folder of the point in a named set. */
  readonly declaredPath: string;
  /** Absolute, normalized lexically: a symbolic link is not followed. A Windows path stays as written. */
  readonly physicalPath: string;
  /** `./input`-style path relative to the team folder; null when the binding is external. */
  readonly relativePath: string | null;
  /** True when the physical path is not under the team folder. */
  readonly external: boolean;
}

export function bindMount(
  declaration: MountDeclaration,
  declaredPath: string,
  environment: string,
  teamFolder: string,
): MountBinding {
  const folder = normalizePath(teamFolder);
  const physicalPath = isWindowsAbsolutePath(declaredPath) ? declaredPath : resolvePath(folder, declaredPath);
  return Object.freeze({
    root: declaration.root,
    access: declaration.access,
    role: declaration.role,
    environment,
    declaredPath,
    physicalPath,
    relativePath: relativeWithin(folder, physicalPath),
    external: !isWithin(folder, physicalPath),
  });
}

/**
 * `physical:virtual:access` with an absolute physical path. `orkeon run` decides what is external
 * against its working directory, as the bench does against the team folder: the line is run from
 * the team folder, as the launchers run.
 */
export function mountArgument(binding: MountBinding): string {
  return `${mountPathSegment(binding.physicalPath)}:${binding.root}:${binding.access}`;
}

/**
 * The `mounts[]` entry of `studio-team.json`: a physical path starting with `./` is relative to
 * the team folder; an external binding stays absolute. Studio reads the entry with Orkeon's own
 * parser (`TeamMountPaths`, `MountDefinition` → `FileSystemMount`), quotes included.
 */
export function studioMountSpec(binding: MountBinding): string {
  return `${mountPathSegment(binding.relativePath ?? binding.physicalPath)}:${binding.root}:${binding.access}`;
}

/**
 * A physical path as Orkeon's mount grammar needs it (`FileSystemMount.Quote`, Orkeon `main` at
 * a2bb6c3): between double quotes, a quote inside doubled, when it holds a `;`, a `"`, a `:` other
 * than a drive letter's or a `|` after a bare word, or ends with a backslash; as it is otherwise.
 */
export function mountPathSegment(path: string): string {
  const pipe = path.indexOf('|');
  const quoted =
    path.endsWith('\\') ||
    path.includes('"') ||
    path.includes(';') ||
    (pipe > 0 && /^[A-Za-z0-9]+$/.test(path.slice(0, pipe))) ||
    path.indexOf(':', /^\p{L}:[\\/]/u.test(path) ? 2 : 0) >= 0;
  return quoted ? `"${path.replaceAll('"', '""')}"` : path;
}

/** All bindings under one `--mount` flag, then `--allow-external-mounts` when any is external. */
export function mountArguments(bindings: readonly MountBinding[]): string[] {
  if (bindings.length === 0) {
    return [];
  }
  const args = [MOUNT_FLAG, ...bindings.map(mountArgument)];
  if (bindings.some((binding) => binding.external)) {
    args.push(ALLOW_EXTERNAL_MOUNTS_FLAG);
  }
  return args;
}
