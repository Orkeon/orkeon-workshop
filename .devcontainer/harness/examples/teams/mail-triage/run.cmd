@echo off
rem Launcher of the Orkeon team 'mail-triage', written by orkeon-bench scaffold from mounts.json:
rem edit mounts.json, then run "orkeon-bench scaffold mail-triage" again rather than editing this file.
rem Orkeon Studio launches the team from its card, without this file, and leaves it as it is.
rem Extra arguments are passed through:
rem   run.cmd --validate
rem With TEAM_ENV set to NAME, the team runs on the mount set mounts.NAME\mail-triage\ of the
rem workshop (one folder per mount point) instead of its own folders.
rem The team's own Orkeon settings, settings\mail-triage\appsettings.json of the workshop, are
rem passed with --settings when the file exists and the command names no other.
setlocal EnableExtensions DisableDelayedExpansion
for /f "tokens=2 delims=:." %%p in ('chcp') do set "LAUNCHER_CP=%%p"
chcp 65001 >nul
cd /d "%~dp0" || goto failed
for %%I in ("%~dp0..\..") do set "SETTINGS=%%~fI\settings"
for %%I in ("%~dp0.") do set "SETTINGS=%SETTINGS%\%%~nxI\appsettings.json"
set "SETTINGS_ARG="
if exist "%SETTINGS%" set SETTINGS_ARG=--settings "%SETTINGS%"
for %%A in (%*) do (if /i "%%~A"=="--settings" set "SETTINGS_ARG=") & (if /i "%%~A"=="-s" set "SETTINGS_ARG=")
if not defined TEAM_ENV goto default
if "%TEAM_ENV%"=="default" goto default
for /f "eol=a delims=abcdefghijklmnopqrstuvwxyz" %%C in ("%TEAM_ENV:~0,1%") do goto bad_env
for /f "eol=- delims=abcdefghijklmnopqrstuvwxyz0123456789-" %%C in ("%TEAM_ENV%") do goto bad_env
for %%I in ("%~dp0..\..") do set "MOUNT_SET=%%~fI\mounts.%TEAM_ENV%"
for %%I in ("%~dp0.") do set "MOUNT_SET=%MOUNT_SET%\%%~nxI"
if not exist "%MOUNT_SET%\" goto no_set
if not exist "%MOUNT_SET%\mailbox\" (set "MISSING=%MOUNT_SET%\mailbox" & set "POINT=/mailbox" & goto missing)
if not exist "%MOUNT_SET%\registry\" mkdir "%MOUNT_SET%\registry" || goto failed
if not exist "%MOUNT_SET%\output\" mkdir "%MOUNT_SET%\output" || goto failed
(
  chcp %LAUNCHER_CP% >nul 2>&1
  orkeon run "%~dp0crew" %SETTINGS_ARG% %* --mount ^"\"%MOUNT_SET%\mailbox\":/mailbox:ro^" ^"\"%MOUNT_SET%\registry\":/registry:rw^" ^"\"%MOUNT_SET%\output\":/output:rw^" --allow-external-mounts
  exit /b
)
:default
if not exist "%~dp0mailbox\" (set "MISSING=%~dp0mailbox" & set "POINT=/mailbox" & goto missing)
if not exist "%~dp0registry\" mkdir "%~dp0registry" || goto failed
if not exist "%~dp0output\" mkdir "%~dp0output" || goto failed
(
  chcp %LAUNCHER_CP% >nul 2>&1
  orkeon run "%~dp0crew" %SETTINGS_ARG% %* --mount ^"\"%~dp0mailbox\":/mailbox:ro^" ^"\"%~dp0registry\":/registry:rw^" ^"\"%~dp0output\":/output:rw^"
  exit /b
)
:bad_env
echo run.cmd: TEAM_ENV names a mount set in kebab-case (mounts.^<name^>/), not "%TEAM_ENV%" 1>&2
chcp %LAUNCHER_CP% >nul 2>&1
exit /b 2
:no_set
echo run.cmd: no mount set "%TEAM_ENV%" for this team: "%MOUNT_SET%" does not exist 1>&2
chcp %LAUNCHER_CP% >nul 2>&1
exit /b 2
:missing
echo run.cmd: "%MISSING%" does not exist (mount point %POINT%) 1>&2
chcp %LAUNCHER_CP% >nul 2>&1
exit /b 2
:failed
chcp %LAUNCHER_CP% >nul 2>&1
exit /b 1
