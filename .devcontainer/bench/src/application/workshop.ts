import type { MachineFolders } from '../domain/mounts/mount-reach.js';
import { joinPath, normalizePath } from '../domain/paths.js';
import type { Environment } from './ports/environment.js';

/** Overrides the workshop root; the default is `~/Orkeon` (D8). The image sets `/workspace` (D26). */
export const WORKSHOP_ENV = 'ORKEON_WORKSHOP';

/**
 * Folders the image creates in the workshop (plan § 3.2, § 10): the teams, their workbooks, tests
 * and settings (D33), the library, the references, the harness.
 */
export const WORKSHOP_LAYOUT = ['teams', 'workbooks', 'tests', 'settings', 'library', 'references', '.claude'] as const;

export function workshopRoot(environment: Environment): string {
  const override = environment.get(WORKSHOP_ENV);
  if (override !== undefined && override.trim().length > 0) {
    return normalizePath(override.trim());
  }
  return joinPath(environment.homeDirectory(), 'Orkeon');
}

/**
 * What the mount reach rule guards besides the team's own workshop (D40): the home folder,
 * `$ORKEON_WORKSHOP`, and `$XDG_CONFIG_HOME/Orkeon` when `XDG_CONFIG_HOME` is set and not blank.
 */
export function machineFolders(environment: Environment): MachineFolders {
  const configHome = environment.get('XDG_CONFIG_HOME')?.trim() ?? '';
  return Object.freeze({
    home: environment.homeDirectory(),
    workshop: environment.get(WORKSHOP_ENV) ?? null,
    orkeonSettings: configHome.length > 0 ? joinPath(configHome, 'Orkeon') : null,
  });
}
