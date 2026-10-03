/**
 * Minimal POSIX path arithmetic, so the domain can reason about paths without `node:path`.
 * Physical paths in the container are always POSIX.
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * A path of the Windows host (`C:\Shares\inbox`, `\\server\share`): Studio runs there and reads
 * the same bindings. It is absolute, but never normalized or resolved by the bench.
 */
export function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

/** Resolves `.` and `..` segments and collapses repeated slashes; keeps a leading slash. */
export function normalizePath(path: string): string {
  const absolute = isAbsolutePath(path);
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else if (!absolute) {
        segments.push('..');
      }
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join('/');
  if (absolute) {
    return `/${joined}`;
  }
  return joined.length === 0 ? '.' : joined;
}

export function joinPath(base: string, ...parts: string[]): string {
  return normalizePath([base, ...parts].join('/'));
}

/** `path` resolved against `base` when relative; both normalized. */
export function resolvePath(base: string, path: string): string {
  return isAbsolutePath(path) ? normalizePath(path) : joinPath(base, path);
}

/** True when `path` is `folder` itself or lies below it (both already normalized). */
export function isWithin(folder: string, path: string): boolean {
  const root = folder.endsWith('/') ? folder : `${folder}/`;
  return path === folder || path.startsWith(root);
}

/** `./sub/path` when `path` lies within `folder` (`./` for the folder itself), else null. */
export function relativeWithin(folder: string, path: string): string | null {
  if (!isWithin(folder, path)) {
    return null;
  }
  const root = folder.endsWith('/') ? folder : `${folder}/`;
  return `./${path === folder ? '' : path.slice(root.length)}`;
}

export function baseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}
