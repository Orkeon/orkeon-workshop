import { describe, expect, it } from 'vitest';

import { RUN_TARGETS, renderRunCmd, renderRunSh, type CrewKind, type LauncherSpec } from '../../src/domain/mounts/launchers.js';
import { parseMountSet, resolveMountSet } from '../../src/domain/mounts/mount-set.js';

const TEAM = '/workspace/teams/mail-triage';

/** The launchers of a team with the given mount points, bound to its own folders. */
function spec(mounts: unknown[], kind: CrewKind = 'yaml'): LauncherSpec {
  const resolution = resolveMountSet(parseMountSet({ mounts }), TEAM);
  return { slug: 'mail-triage', kind, bindings: resolution.bindings };
}

const MAIL = [
  { root: '/mailbox', access: 'ro', role: 'mailbox', default: './mailbox' },
  { root: '/state', access: 'rw', role: 'state', default: './state' },
  { root: '/output', access: 'rwnd', role: 'deliverables', default: './output' },
];

describe('run.sh', () => {
  const script = renderRunSh(spec(MAIL));

  it('is a POSIX script with LF line endings, written from mounts.json', () => {
    expect(script.startsWith('#!/usr/bin/env sh\n')).toBe(true);
    expect(script).not.toContain('\r');
    expect(script).toContain("# Launcher of the Orkeon team 'mail-triage', written by `orkeon-bench scaffold` from mounts.json:");
    expect(script.endsWith('\n')).toBe(true);
  });

  it("binds every mount point to the team's own folder without TEAM_ENV", () => {
    expect(script).toContain(
      [
        'if [ -z "${TEAM_ENV:-}" ] || [ "$TEAM_ENV" = default ]; then',
        '  need "$DIR/mailbox" /mailbox',
        '  mkdir -p "$DIR/state" "$DIR/output" || exit 1',
        '  exec orkeon run "$DIR/crew" "$@" --mount \\',
        '    "\\"$DIR/mailbox\\":/mailbox:ro" \\',
        '    "\\"$DIR/state\\":/state:rw" \\',
        '    "\\"$DIR/output\\":/output:rwnd"',
        'fi',
      ].join('\n'),
    );
  });

  it("passes the team's settings file of the workshop, unless the command names one (D33)", () => {
    expect(script).toContain(
      [
        'SETTINGS="$(cd "$DIR/../.." && pwd)/settings/$(basename "$DIR")/appsettings.json"',
        'for ARG in "$@"; do case "$ARG" in -s | --settings | --settings=*) SETTINGS= ;; esac; done',
        'if [ -n "$SETTINGS" ] && [ -f "$SETTINGS" ]; then set -- --settings "$SETTINGS" "$@"; fi',
      ].join('\n'),
    );
    expect(script.indexOf('SETTINGS=')).toBeLessThan(script.indexOf('exec orkeon run'));
  });

  it('binds every mount point to its folder of the set with TEAM_ENV, and allows the external mounts', () => {
    expect(script).toContain('SET="$(cd "$DIR/../.." && pwd)/mounts.$TEAM_ENV/$(basename "$DIR")"');
    expect(script).toContain(
      [
        'need "$SET/mailbox" /mailbox',
        'mkdir -p "$SET/state" "$SET/output" || exit 1',
        'exec orkeon run "$DIR/crew" "$@" --mount \\',
        '  "\\"$SET/mailbox\\":/mailbox:ro" \\',
        '  "\\"$SET/state\\":/state:rw" \\',
        '  "\\"$SET/output\\":/output:rwnd" \\',
        '  --allow-external-mounts',
      ].join('\n'),
    );
    expect(script).toContain('[!a-z]* | *[!a-z0-9-]*)');
  });

  it('starts the script of a TypeScript crew', () => {
    expect(renderRunSh(spec(MAIL, 'typescript'))).toContain(`exec orkeon run "$DIR/${RUN_TARGETS.typescript}" "$@" --mount`);
  });

  it('keeps an absolute default as it is and allows it as an external mount', () => {
    const external = renderRunSh(spec([{ root: '/archive', access: 'ro', role: 'archive', default: '/srv/archive' }]));
    expect(external).toContain('  need "/srv/archive" /archive');
    expect(external).toContain('    "\\"/srv/archive\\":/archive:ro" \\\n    --allow-external-mounts\nfi');
  });

  it('never creates a Windows folder: it must exist, which it cannot here', () => {
    const windows = renderRunSh(spec([{ root: '/outbox', access: 'rw', role: 'deliverables', default: 'C:\\Shares\\outbox' }]));
    expect(windows).toContain('  need "C:\\\\Shares\\\\outbox" /outbox');
    expect(windows).not.toContain('mkdir -p "C:');
  });

  it('escapes what the shell would expand in a folder name', () => {
    const odd = renderRunSh(spec([{ root: '/notes', access: 'ro', role: 'inputs', default: './my "$notes"' }]));
    expect(odd).toContain('need "$DIR/my \\"\\$notes\\"" /notes');
  });
});

describe('run.cmd', () => {
  const script = renderRunCmd(spec(MAIL));

  it('has CRLF line endings, and its comments hold nothing cmd.exe would interpret', () => {
    expect(script.split('\n').slice(0, -1).every((line) => line.endsWith('\r'))).toBe(true);
    expect(script.startsWith('@echo off\r\n')).toBe(true);
    const comments = script.split('\r\n').filter((line) => line.startsWith('rem '));
    expect(comments.length).toBeGreaterThan(0);
    expect(comments.filter((line) => /[<>|&]/.test(line))).toEqual([]);
  });

  it("binds every mount point to the team's own folder without TEAM_ENV", () => {
    expect(script).toContain(
      [
        ':default',
        'if not exist "%~dp0mailbox\\" (set "MISSING=%~dp0mailbox" & set "POINT=/mailbox" & goto missing)',
        'if not exist "%~dp0state\\" mkdir "%~dp0state" || goto failed',
        'if not exist "%~dp0output\\" mkdir "%~dp0output" || goto failed',
        '(',
        '  chcp %LAUNCHER_CP% >nul 2>&1',
        '  orkeon run "%~dp0crew" %SETTINGS_ARG% %* --mount ^"\\"%~dp0mailbox\\":/mailbox:ro^" ^"\\"%~dp0state\\":/state:rw^" ^"\\"%~dp0output\\":/output:rwnd^"',
        '  exit /b',
        ')',
      ].join('\r\n'),
    );
  });

  it('binds every mount point to its folder of the set with TEAM_ENV, and allows the external mounts', () => {
    expect(script).toContain('for %%I in ("%~dp0..\\..") do set "MOUNT_SET=%%~fI\\mounts.%TEAM_ENV%"');
    expect(script).toContain('for %%I in ("%~dp0.") do set "MOUNT_SET=%MOUNT_SET%\\%%~nxI"');
    expect(script).toContain(
      'orkeon run "%~dp0crew" %SETTINGS_ARG% %* --mount ^"\\"%MOUNT_SET%\\mailbox\\":/mailbox:ro^" ^"\\"%MOUNT_SET%\\state\\":/state:rw^" ^"\\"%MOUNT_SET%\\output\\":/output:rwnd^" --allow-external-mounts',
    );
  });

  it('starts the script of a TypeScript crew', () => {
    expect(renderRunCmd(spec(MAIL, 'typescript'))).toContain('orkeon run "%~dp0crew\\crew.ork.ts" %SETTINGS_ARG% %* --mount');
  });

  it('refuses a TEAM_ENV that is not kebab-case before building a path from it, as run.sh does (exit 2)', () => {
    expect(script).toContain(
      [
        'if not defined TEAM_ENV goto default',
        'if "%TEAM_ENV%"=="default" goto default',
        'for /f "eol=a delims=abcdefghijklmnopqrstuvwxyz" %%C in ("%TEAM_ENV:~0,1%") do goto bad_env',
        'for /f "eol=- delims=abcdefghijklmnopqrstuvwxyz0123456789-" %%C in ("%TEAM_ENV%") do goto bad_env',
        'for %%I in ("%~dp0..\\..") do set "MOUNT_SET=%%~fI\\mounts.%TEAM_ENV%"',
      ].join('\r\n'),
    );
    expect(script).toContain(
      [':bad_env', 'echo run.cmd: TEAM_ENV names a mount set in kebab-case (mounts.^<name^>/), not "%TEAM_ENV%" 1>&2', 'chcp %LAUNCHER_CP% >nul 2>&1', 'exit /b 2', ':no_set'].join('\r\n'),
    );
    // Every jump lands on a label of the script.
    const labels = new Set(script.split('\r\n').filter((line) => line.startsWith(':')).map((line) => line.slice(1)));
    const targets = [...script.matchAll(/goto (\w+)/g)].map((match) => match[1] ?? '');
    expect(targets.filter((target) => !labels.has(target))).toEqual([]);
  });

  it("passes the team's settings file of the workshop, unless the command names one (D33)", () => {
    expect(script).toContain(
      [
        'for %%I in ("%~dp0..\\..") do set "SETTINGS=%%~fI\\settings"',
        'for %%I in ("%~dp0.") do set "SETTINGS=%SETTINGS%\\%%~nxI\\appsettings.json"',
        'set "SETTINGS_ARG="',
        'if exist "%SETTINGS%" set SETTINGS_ARG=--settings "%SETTINGS%"',
        'for %%A in (%*) do (if /i "%%~A"=="--settings" set "SETTINGS_ARG=") & (if /i "%%~A"=="-s" set "SETTINGS_ARG=")',
      ].join('\r\n'),
    );
  });

  it('spells a nested team folder with backslashes and escapes %', () => {
    const nested = renderRunCmd(spec([{ root: '/notes', access: 'ro', role: 'inputs', default: './data/100%' }]));
    expect(nested).toContain('^"\\"%~dp0data\\100%%\\":/notes:ro^"');
  });

  it("keeps cmd's special characters of a folder outside the team between cmd's quotes (Orkeon's run.cmd, bd3420c)", () => {
    const odd = renderRunCmd(spec([{ root: '/archive', access: 'ro', role: 'inputs', default: 'D:\\R&D (été)\\a^b' }]));
    expect(odd).toContain('--mount ^"\\"D:\\R&D (été)\\a^b\\":/archive:ro^" --allow-external-mounts');
    expect(odd).toContain('if not exist "D:\\R&D (été)\\a^b\\" (set "MISSING=D:\\R&D (été)\\a^b" & set "POINT=/archive" & goto missing)');
  });

  it('works in UTF-8 and gives the caller\'s code page back before orkeon starts and on every exit', () => {
    const lines = script.split('\r\n');
    const utf8 = lines.indexOf('chcp 65001 >nul');
    expect(lines.slice(utf8 - 2, utf8 + 1)).toEqual([
      'setlocal EnableExtensions DisableDelayedExpansion',
      'for /f "tokens=2 delims=:." %%p in (\'chcp\') do set "LAUNCHER_CP=%%p"',
      'chcp 65001 >nul',
    ]);
    // Before chcp 65001, cmd decodes in the console's code page: ASCII only.
    expect(lines.slice(0, utf8).every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(true);
    // Every exit after it gives the code page back first.
    const exits = lines.flatMap((line, index) => (index > utf8 && /^exit \/b \d/.test(line) ? [lines[index - 1]] : []));
    expect(exits.length).toBeGreaterThan(0);
    expect(new Set(exits)).toEqual(new Set(['chcp %LAUNCHER_CP% >nul 2>&1']));
    expect(lines.filter((line) => line.includes('|| exit'))).toEqual([]);
  });

  it('never creates a folder spelled for another platform', () => {
    const posix = renderRunCmd(spec([{ root: '/outbox', access: 'rw', role: 'deliverables', default: '/srv/outbox' }]));
    expect(posix).toContain('if not exist "/srv/outbox\\" (set "MISSING=/srv/outbox" & set "POINT=/outbox" & goto missing)');
    expect(posix).not.toContain('mkdir "/srv/outbox"');
  });
});
