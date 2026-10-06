import { isAbsolutePath, isWindowsAbsolutePath } from '../paths.js';
import type { MountBinding } from './mount-binding.js';
import { mountPointFolder } from './mount-set.js';

/** The shape of a team's crew, which decides what its launchers start. */
export type CrewKind = 'yaml' | 'typescript';

/** What `orkeon run` is given, relative to the team folder: the launchers run from it (V-02). */
export const RUN_TARGETS: Readonly<Record<CrewKind, string>> = Object.freeze({ yaml: 'crew', typescript: 'crew/crew.ork.ts' });

/** What the launchers of a team are written from. */
export interface LauncherSpec {
  /** The team folder's name: its slug, and its sub-folder in every mount set. */
  readonly slug: string;
  readonly kind: CrewKind;
  /** The bindings of the team's own folders (the `default` mount set), in declaration order. */
  readonly bindings: readonly MountBinding[];
}

/** How one launcher spells a binding's folder, and which folders it can neither check nor create. */
interface Dialect {
  readonly folder: (binding: MountBinding) => string;
  /** A folder this platform cannot reach: it must exist, and the launcher never creates it. */
  readonly foreign: (binding: MountBinding) => boolean;
}

/**
 * `run.sh`: one `--mount` binding per mount point of the team. Without `TEAM_ENV` (or with
 * `TEAM_ENV=default`) the points are bound to the team's own folders; with `TEAM_ENV=<name>`, to
 * `mounts.<name>/<team>/<point>/` two levels above the team folder (D28). Read-only folders must
 * exist, writable ones are created, as `orkeon-harness-run` does.
 */
export function renderRunSh(spec: LauncherSpec): string {
  const target = RUN_TARGETS[spec.kind];
  const own: Dialect = { folder: shOwnFolder, foreign: (binding) => isWindowsAbsolutePath(binding.physicalPath) };
  const set: Dialect = { folder: (binding) => `$SET/${mountPointFolder(binding.root)}`, foreign: () => false };
  const lines = [
    '#!/usr/bin/env sh',
    `# Launcher of the Orkeon team '${spec.slug}', written by \`orkeon-bench scaffold\` from mounts.json:`,
    `# edit mounts.json, then run \`orkeon-bench scaffold ${spec.slug}\` again rather than editing this file.`,
    '# Orkeon Studio launches the team from its card, without this file, and leaves it as it is.',
    '# Extra arguments are passed through:',
    '#   ./run.sh --validate      ./run.sh -v 2',
    `# TEAM_ENV=<name> runs the team on the mount set mounts.<name>/${spec.slug}/ of the workshop (one`,
    '# folder per mount point) instead of its own folders.',
    `# The team's own Orkeon settings, settings/${spec.slug}/appsettings.json of the workshop, are passed`,
    '# with --settings when the file exists and the command names no other: Orkeon then reads them',
    '# instead of ~/.config/Orkeon/appsettings.json.',
    'SELF="$0"',
    'while [ -L "$SELF" ]; do',
    '  LINK="$(readlink "$SELF")"',
    '  case "$LINK" in',
    '    /*) SELF="$LINK" ;;',
    '    *) SELF="$(dirname "$SELF")/$LINK" ;;',
    '  esac',
    'done',
    'DIR="$(cd "$(dirname "$SELF")" && pwd)" || exit 1',
    'cd "$DIR" || exit 1',
    'SETTINGS="$(cd "$DIR/../.." && pwd)/settings/$(basename "$DIR")/appsettings.json"',
    'for ARG in "$@"; do case "$ARG" in -s | --settings | --settings=*) SETTINGS= ;; esac; done',
    'if [ -n "$SETTINGS" ] && [ -f "$SETTINGS" ]; then set -- --settings "$SETTINGS" "$@"; fi',
    'need() { [ -d "$1" ] || { echo "run.sh: $1 does not exist (mount point $2)" >&2; exit 2; }; }',
    'if [ -z "${TEAM_ENV:-}" ] || [ "$TEAM_ENV" = default ]; then',
    ...shBranch(spec.bindings, own, target, spec.bindings.some((binding) => binding.external), '  '),
    'fi',
    'case "$TEAM_ENV" in',
    `  [!a-z]* | *[!a-z0-9-]*) echo "run.sh: TEAM_ENV names a mount set in kebab-case (mounts.<name>/), not '$TEAM_ENV'" >&2; exit 2 ;;`,
    'esac',
    'SET="$(cd "$DIR/../.." && pwd)/mounts.$TEAM_ENV/$(basename "$DIR")"',
    `[ -d "$SET" ] || { echo "run.sh: no mount set '$TEAM_ENV' for this team: $SET does not exist" >&2; exit 2; }`,
    ...shBranch(spec.bindings, set, target, true, ''),
  ];
  return `${lines.join('\n')}\n`;
}

/** `run.cmd`: the same launcher for Windows, with CRLF line endings. */
export function renderRunCmd(spec: LauncherSpec): string {
  const target = RUN_TARGETS[spec.kind].replaceAll('/', '\\');
  const own: Dialect = { folder: cmdOwnFolder, foreign: (binding) => binding.relativePath === null && isAbsolutePath(binding.physicalPath) };
  const set: Dialect = { folder: (binding) => `%MOUNT_SET%\\${mountPointFolder(binding.root)}`, foreign: () => false };
  const lines = [
    '@echo off',
    `rem Launcher of the Orkeon team '${spec.slug}', written by orkeon-bench scaffold from mounts.json:`,
    `rem edit mounts.json, then run "orkeon-bench scaffold ${spec.slug}" again rather than editing this file.`,
    'rem Orkeon Studio launches the team from its card, without this file, and leaves it as it is.',
    'rem Extra arguments are passed through:',
    'rem   run.cmd --validate',
    `rem With TEAM_ENV set to NAME, the team runs on the mount set mounts.NAME\\${spec.slug}\\ of the`,
    'rem workshop (one folder per mount point) instead of its own folders.',
    `rem The team's own Orkeon settings, settings\\${spec.slug}\\appsettings.json of the workshop, are`,
    'rem passed with --settings when the file exists and the command names no other.',
    // Whatever the registry says: %~dp0 and cd /d exist, and a '!' is a character. Then the
    // caller's code page, given back before orkeon starts and on every exit, and UTF-8 for the
    // rest of the file: a folder outside the team may hold any character (Orkeon's run.cmd, fb26364).
    'setlocal EnableExtensions DisableDelayedExpansion',
    'for /f "tokens=2 delims=:." %%p in (\'chcp\') do set "LAUNCHER_CP=%%p"',
    'chcp 65001 >nul',
    'cd /d "%~dp0" || goto failed',
    'for %%I in ("%~dp0..\\..") do set "SETTINGS=%%~fI\\settings"',
    'for %%I in ("%~dp0.") do set "SETTINGS=%SETTINGS%\\%%~nxI\\appsettings.json"',
    'set "SETTINGS_ARG="',
    'if exist "%SETTINGS%" set SETTINGS_ARG=--settings "%SETTINGS%"',
    'for %%A in (%*) do (if /i "%%~A"=="--settings" set "SETTINGS_ARG=") & (if /i "%%~A"=="-s" set "SETTINGS_ARG=")',
    'if not defined TEAM_ENV goto default',
    'if "%TEAM_ENV%"=="default" goto default',
    ...cmdKebabCaseCheck('TEAM_ENV', 'bad_env'),
    'for %%I in ("%~dp0..\\..") do set "MOUNT_SET=%%~fI\\mounts.%TEAM_ENV%"',
    'for %%I in ("%~dp0.") do set "MOUNT_SET=%MOUNT_SET%\\%%~nxI"',
    'if not exist "%MOUNT_SET%\\" goto no_set',
    ...cmdBranch(spec.bindings, set, target, true),
    ':default',
    ...cmdBranch(spec.bindings, own, target, spec.bindings.some((binding) => binding.external)),
    ':bad_env',
    'echo run.cmd: TEAM_ENV names a mount set in kebab-case (mounts.^<name^>/), not "%TEAM_ENV%" 1>&2',
    'chcp %LAUNCHER_CP% >nul 2>&1',
    'exit /b 2',
    ':no_set',
    'echo run.cmd: no mount set "%TEAM_ENV%" for this team: "%MOUNT_SET%" does not exist 1>&2',
    'chcp %LAUNCHER_CP% >nul 2>&1',
    'exit /b 2',
    ':missing',
    'echo run.cmd: "%MISSING%" does not exist (mount point %POINT%) 1>&2',
    'chcp %LAUNCHER_CP% >nul 2>&1',
    'exit /b 2',
    ':failed',
    'chcp %LAUNCHER_CP% >nul 2>&1',
    'exit /b 1',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function shBranch(bindings: readonly MountBinding[], dialect: Dialect, target: string, external: boolean, indent: string): string[] {
  const lines = bindings
    .filter((binding) => binding.access === 'ro' || dialect.foreign(binding))
    .map((binding) => `${indent}need "${dialect.folder(binding)}" ${binding.root}`);
  const created = bindings.filter((binding) => binding.access !== 'ro' && !dialect.foreign(binding));
  if (created.length > 0) {
    lines.push(`${indent}mkdir -p ${created.map((binding) => `"${dialect.folder(binding)}"`).join(' ')} || exit 1`);
  }
  lines.push(`${indent}exec orkeon run "$DIR/${target}" "$@" --mount \\`);
  bindings.forEach((binding, index) => {
    const more = index < bindings.length - 1 || external ? ' \\' : '';
    lines.push(`${indent}  "\\"${dialect.folder(binding)}\\":${binding.root}:${binding.access}"${more}`);
  });
  if (external) {
    lines.push(`${indent}  --allow-external-mounts`);
  }
  return lines;
}

function cmdBranch(bindings: readonly MountBinding[], dialect: Dialect, target: string, external: boolean): string[] {
  const lines = bindings
    .filter((binding) => binding.access === 'ro' || dialect.foreign(binding))
    .map((binding) => `if not exist "${dialect.folder(binding)}\\" (set "MISSING=${dialect.folder(binding)}" & set "POINT=${binding.root}" & goto missing)`);
  for (const binding of bindings.filter((candidate) => candidate.access !== 'ro' && !dialect.foreign(candidate))) {
    lines.push(`if not exist "${dialect.folder(binding)}\\" mkdir "${dialect.folder(binding)}" || goto failed`);
  }
  // cmd reads the line, then orkeon's C runtime splits it, where \" is a quote inside the value: for
  // cmd that \" leaves its quotes. So the outer quotes are ^" (literal for cmd), and cmd's own quotes
  // hold the folder alone, from the quote of the first \" to that of the second.
  const specs = bindings.map((binding) => `^"\\"${dialect.folder(binding)}\\":${binding.root}:${binding.access}^"`).join(' ');
  // A block: cmd decodes it whole before running it, gives the caller's code page back first, and
  // ends with a bare exit /b, which keeps orkeon's exit code and never reads the file again.
  lines.push(
    '(',
    '  chcp %LAUNCHER_CP% >nul 2>&1',
    `  orkeon run "%~dp0${target}" %SETTINGS_ARG% %* --mount ${specs}${external ? ' --allow-external-mounts' : ''}`,
    '  exit /b',
    ')',
  );
  return lines;
}

/**
 * Jumps to `label` unless `%name%` is kebab-case (`MOUNT_SET_NAME`), as `run.sh` checks it. `for /f`
 * yields a token, and runs its body, only for a character outside its delimiters, compared
 * case-sensitively: the first line reads the first character alone against the lower-case letters,
 * the second the whole name against letters, digits and dashes. Their `eol` (a line starting with it
 * is skipped) is one of their delimiters, `a` then `-`: valid as a first character, or refused by
 * the first line.
 */
function cmdKebabCaseCheck(name: string, label: string): string[] {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return [
    `for /f "eol=a delims=${letters}" %%C in ("%${name}:~0,1%") do goto ${label}`,
    `for /f "eol=- delims=${letters}0123456789-" %%C in ("%${name}%") do goto ${label}`,
  ];
}

/** A folder of the team as `run.sh` writes it: under `$DIR` when inside the team, else verbatim. */
function shOwnFolder(binding: MountBinding): string {
  if (binding.relativePath === null) {
    return shEscaped(binding.physicalPath);
  }
  const inside = binding.relativePath.slice(2);
  return inside.length === 0 ? '$DIR' : `$DIR/${shEscaped(inside)}`;
}

/**
 * A folder of the team as `run.cmd` writes it: under `%~dp0` when inside the team (never with a
 * trailing backslash, which would escape the closing quote of the mount grammar), else verbatim.
 */
function cmdOwnFolder(binding: MountBinding): string {
  if (binding.relativePath === null) {
    return cmdEscaped(binding.physicalPath);
  }
  const inside = binding.relativePath.slice(2).replaceAll('/', '\\');
  return inside.length === 0 ? '%~dp0.' : `%~dp0${cmdEscaped(inside)}`;
}

/** Escapes what a POSIX shell would expand inside double quotes. */
function shEscaped(text: string): string {
  return text.replace(/[\\"$`]/g, (character) => `\\${character}`);
}

/** Escapes what cmd.exe would expand inside a batch file. */
function cmdEscaped(text: string): string {
  return text.replaceAll('%', '%%');
}
