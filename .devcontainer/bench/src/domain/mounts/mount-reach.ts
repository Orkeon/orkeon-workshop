import { baseName, isAbsolutePath, isWindowsAbsolutePath, isWithin, joinPath, normalizePath } from '../paths.js';
import { MOUNT_SET_PREFIX, workshopOfTeam } from '../team-ref.js';
import type { MountBinding } from './mount-binding.js';

/**
 * Folder names refused at the root of a team folder, compared in lower case: `crew/` is the
 * definition; Orkeon reads `<team>/appsettings/appsettings.json` or `<team>/_shared/appsettings.json`
 * when it looks for settings above `crew/`. A folder named `agents` or `tasks` is free: Orkeon Studio
 * and `orkeon run` read `crew/` first, whatever the root holds (Orkeon `main` at fb26364, STUDIO-59).
 */
export const RESERVED_TEAM_FOLDERS = ['crew', 'appsettings', '_shared'] as const;
const [CREW, APPSETTINGS, SHARED] = RESERVED_TEAM_FOLDERS;

/** The folders of a workshop a mount point may neither hold nor lie in, and what each would expose. */
const CLOSED_WORKSHOP_FOLDERS: readonly (readonly [name: string, what: string])[] = [
  ['settings', 'the settings of every team'],
  ['workbooks', 'the workbooks of every team, with the approvals of paid runs'],
  ['tests', 'the tests of every team, with their budgets'],
  ['.claude', 'the harness'],
  ['library', "the workshop's library, which other teams are built from"],
  ['references', 'the reference documents Claude builds teams from'],
  ['.devcontainer', "the workshop's container configuration, which runs at its next start"],
  ['.git', "the workshop's git repository, whose hooks run at the next git command"],
];

/** What `judgeMountReach` found: an error refuses the binding, a warning only informs. */
export interface MountReach {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * The folders of the machine the rule guards besides those of the team's workshop. The caller reads
 * them from the environment; null leaves out the checks that need one.
 */
export interface MachineFolders {
  /** The home folder of the user who runs the team. */
  readonly home: string | null;
  /** `$ORKEON_WORKSHOP`: the workshop the harness is set up for, guarded like the team's own when it is another. */
  readonly workshop: string | null;
  /** `$XDG_CONFIG_HOME/Orkeon`: where Orkeon keeps the machine's settings when `XDG_CONFIG_HOME` is set. */
  readonly orkeonSettings: string | null;
}

/** Nothing known of the machine: only the folders of the team's workshop are guarded. */
export const UNKNOWN_MACHINE: MachineFolders = Object.freeze({ home: null, workshop: null, orkeonSettings: null });

/** A folder no mount point may hold, and what it would expose. */
interface GuardedFolder {
  readonly path: string;
  readonly what: string;
  /** True when a mount point may not lie inside it either. */
  readonly closed: boolean;
}

/** The team and the folders guarded around it, in one spelling: the container's, or a Windows host's. */
interface Frame {
  readonly team: string;
  readonly slug: string;
  readonly home: string | null;
  /** The team's workshop, then the configured one when it is another. */
  readonly workshops: readonly string[];
  /** In the order the rule tries them: the first that matches names the problem. */
  readonly guarded: readonly GuardedFolder[];
}

/**
 * What the agents of a team reach through the bindings of its `default` mount set (the team's own
 * folders), as D40 states it. Orkeon's VFS gives them the folder behind each mount point and all it
 * holds, so that folder must hold neither the definition of the team, nor settings, credentials, the
 * harness or another team: refused. Any other folder outside the team passes with a warning, since
 * Orkeon Studio launches the team only when that folder is declared, spelled exactly, in its
 * Authorized folders.
 *
 * Paths are judged as written: normalised lexically (`.`, `..`, repeated and trailing separators),
 * a symbolic link is not followed. They are compared ignoring case, as a Windows host folder is, and a
 * folder name ending with a dot or a space is refused, since Windows drops them (`./crew.` is `crew/`
 * there). A Windows path, normalised the same way, is judged against the Windows spellings of the same
 * folders (`C:\Users\<you>` for the home folder, `C:\Users\<you>\Orkeon` for the workshop) and is
 * always warned about, since the container cannot bind it. The bindings of a named mount set
 * (`mounts.<name>/<team>/<point>`) lie outside the team by construction: the caller leaves them out.
 */
export function judgeMountReach(bindings: readonly MountBinding[], teamFolder: string, machine: MachineFolders = UNKNOWN_MACHINE): MountReach {
  const errors: string[] = [];
  const warnings: string[] = [];
  const team = normalizePath(teamFolder);
  const frame = containerFrame(team, machine);
  for (const binding of bindings) {
    const trailing = trailingDotOrSpace(binding.declaredPath);
    if (trailing !== null) {
      errors.push(
        `${binding.root} is bound to ${binding.declaredPath}, whose folder name "${trailing}" ends with a dot or a space: Windows drops them, so on the host Orkeon Studio and run.cmd would bind another folder — name the folder without them`,
      );
      continue;
    }
    if (isWindowsAbsolutePath(binding.physicalPath)) {
      const problem = windowsProblem(binding, frame.slug);
      if (problem === null) {
        warnings.push(
          `${binding.root} is bound to the Windows path ${binding.physicalPath}: the container cannot bind it, and Orkeon Studio only when it is declared, spelled exactly, in its Authorized folders`,
        );
      } else {
        errors.push(problem);
      }
      continue;
    }
    const { problem, outside } = judgePath(binding.root, binding.physicalPath, binding.physicalPath, frame);
    if (problem !== null) {
      errors.push(problem);
    } else if (outside) {
      warnings.push(
        `${binding.root} is bound to ${binding.physicalPath}, outside the team folder: Orkeon Studio launches the team only when this folder is declared, spelled exactly, in its Authorized folders (a container path never matches there)`,
      );
    }
  }
  return Object.freeze({ errors, warnings });
}

/** The frame of the container: the team's workshop two levels above it, `$ORKEON_WORKSHOP`, `/proc`. */
function containerFrame(team: string, machine: MachineFolders): Frame {
  const workshop = workshopOfTeam(team);
  const configured = machineFolder(machine.workshop);
  const workshops = configured === null || configured.toLowerCase() === workshop.toLowerCase() ? [workshop] : [workshop, configured];
  return frameOf(team, machineFolder(machine.home), workshops, machineFolder(machine.orkeonSettings), true);
}

/** The first folder name of `path` (either separator) that ends with a dot or a space, or null. */
function trailingDotOrSpace(path: string): string | null {
  return path.split(/[\\/]/).find((segment) => segment !== '.' && segment !== '..' && /[. ]$/.test(segment)) ?? null;
}

/**
 * A Windows path as the host resolves it: `/` for separators, `.`, `..` and repeated separators
 * resolved below the drive, no trailing separator. A UNC path (`\\server\share`) only has its
 * separators turned: the rule knows no folder there.
 */
function windowsLexical(path: string): string {
  const spelled = path.replaceAll('\\', '/');
  if (!/^[A-Za-z]:\//.test(spelled)) {
    return spelled.replace(/\/+$/, '');
  }
  const below = normalizePath(spelled.slice(2));
  return `${spelled.slice(0, 2)}${below === '/' ? '' : below}`;
}

/**
 * A Windows path in a user's profile (`C:\Users\<you>\…`) is judged as on that host: the profile is
 * the home folder, `Orkeon` in it the workshop, `Orkeon\teams\<slug>` the team. Any other Windows
 * path names no folder the rule knows.
 */
function windowsProblem(binding: MountBinding, slug: string): string | null {
  const spelled = windowsLexical(binding.physicalPath);
  const profile = /^([a-z]):\/users\/([^/]+)(\/.*)?$/.exec(spelled.toLowerCase());
  if (profile === null) {
    return null;
  }
  const home = `${profile[1] ?? ''}:/users/${profile[2] ?? ''}`;
  const workshop = `${home}/orkeon`;
  const frame = frameOf(`${workshop}/teams/${slug.toLowerCase()}`, home, [workshop], null, false);
  return judgePath(binding.root, spelled, binding.physicalPath, frame).problem;
}

/** The guarded folders around `team`, in the order the rule tries them. */
function frameOf(team: string, home: string | null, workshops: readonly string[], orkeonSettings: string | null, proc: boolean): Frame {
  const guarded: GuardedFolder[] = [{ path: '/', what: 'the whole file system', closed: false }];
  if (home !== null) {
    guarded.push({ path: home, what: "the home folder, with the settings and credentials of the machine's tools", closed: false });
  }
  guarded.push(
    ...workshops.map((workshop) => ({ path: workshop, what: 'the workshop', closed: false })),
    ...workshops.map((workshop) => ({ path: joinPath(workshop, 'teams'), what: 'every team', closed: false })),
    { path: team, what: 'the team folder', closed: false },
  );
  for (const workshop of workshops) {
    guarded.push(...CLOSED_WORKSHOP_FOLDERS.map(([name, what]) => ({ path: joinPath(workshop, name), what, closed: true })));
  }
  for (const above of ancestors(team)) {
    guarded.push(
      ...[APPSETTINGS, SHARED].map((name) => ({ path: joinPath(above, name), what: 'a folder where Orkeon looks for the settings of every run above the crews', closed: true })),
    );
  }
  if (home !== null) {
    guarded.push({ path: joinPath(home, 'AppData'), what: "the user's application data, with Orkeon Studio's settings and the tokens of its mail accounts", closed: true });
  }
  if (orkeonSettings !== null) {
    guarded.push({ path: orkeonSettings, what: "the machine's Orkeon settings and the OAuth tokens of its mail accounts", closed: true });
  }
  if (proc) {
    guarded.push({ path: '/proc', what: 'the environment of every process, with the key of the model', closed: true });
  }
  return { team, slug: baseName(team), home, workshops, guarded };
}

/** One path: in the team, a reserved folder of its root; outside it, a guarded folder or another team. */
function judgePath(root: string, path: string, shown: string, frame: Frame): { problem: string | null; outside: boolean } {
  if (within(path, frame.team)) {
    return { problem: insideProblem(root, segmentsBelow(path, frame.team).join('/')), outside: false };
  }
  return { problem: outsideProblem(root, path, shown, frame), outside: true };
}

/** A folder of the team (`inside`, relative, `''` for the team folder itself) that no point may use. */
function insideProblem(root: string, inside: string): string | null {
  if (inside.length === 0) {
    return `${root} is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as ./${root.slice(1)}`;
  }
  const first = (inside.split('/')[0] ?? '').toLowerCase();
  switch (first) {
    case CREW:
      return `${root} is bound to ./${inside}, inside crew/: its agents would reach the definition of the team, and on a writable point change it or leave an appsettings.json that the next run reads — bind a folder of its own`;
    case APPSETTINGS:
    case SHARED:
      return `${root} is bound to ./${inside}: Orkeon looks for ${first}/appsettings.json in the team folder when it searches for settings above crew/, so that name is kept for settings — name the folder otherwise`;
    default:
      return null;
  }
}

/**
 * A folder outside the team that no point may use: one that holds a guarded folder, lies in a closed
 * one or in a hidden folder of the home folder, in another team or in another team's mount set.
 */
function outsideProblem(root: string, path: string, shown: string, frame: Frame): string | null {
  const holds = (what: string): string => `${root} is bound to ${shown}, which holds ${what}: its agents would reach it — bind a folder of its own`;
  const inside = (what: string): string => `${root} is bound to ${shown}, inside ${what}: its agents would reach it — bind a folder of its own`;
  const held = frame.guarded.find((folder) => within(folder.path, path));
  if (held !== undefined) {
    return holds(held.what);
  }
  const container = frame.guarded.find((folder) => folder.closed && within(path, folder.path));
  if (container !== undefined) {
    return inside(container.what);
  }
  if (frame.home !== null && within(path, frame.home) && (segmentsBelow(path, frame.home)[0] ?? '').startsWith('.')) {
    return inside('a hidden folder of the home folder, where tools keep their settings and credentials');
  }
  const slug = frame.slug.toLowerCase();
  for (const workshop of frame.workshops) {
    const below = within(path, workshop) ? segmentsBelow(path, workshop).map((segment) => segment.toLowerCase()) : [];
    const [first = '', second] = below;
    if (first === 'teams' && second !== undefined && second !== slug) {
      return `${root} is bound to ${shown}, inside another team: the agents of a team never reach the folders of another — share through a folder of its own`;
    }
    if (first.startsWith(MOUNT_SET_PREFIX)) {
      if (second === undefined) {
        return holds('the mount sets of every team');
      }
      if (second !== slug) {
        return `${root} is bound to ${shown}, inside a mount set of another team: the agents of a team never reach the folders of another — share through a folder of its own`;
      }
    }
  }
  return null;
}

/** A folder of the machine as the rule compares it: normalised; null when unknown, blank or relative. */
function machineFolder(path: string | null): string | null {
  const trimmed = path?.trim() ?? '';
  return isAbsolutePath(trimmed) ? normalizePath(trimmed) : null;
}

/** True when `path` is `folder` or lies below it, ignoring case. */
function within(path: string, folder: string): boolean {
  return isWithin(folder.toLowerCase(), path.toLowerCase());
}

/** The segments of `path` below `folder`, in the spelling of `path` (which lies within `folder`). */
function segmentsBelow(path: string, folder: string): string[] {
  const depth = folder.split('/').filter((segment) => segment.length > 0).length;
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .slice(depth);
}

/** The folders above `folder`, its parent first, up to the root (`/`, or a drive such as `c:`). */
function ancestors(folder: string): string[] {
  const segments = folder.split('/');
  const above: string[] = [];
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    above.push(segments.slice(0, length).join('/') || '/');
  }
  return above;
}
