@echo off
rem Runs the team from its own directory. TEAM_ENV selects a mount set, mounts.NAME\TEAM\
rem next to teams\ (set TEAM_ENV=test); extra arguments are passed to the host.
cd /d "%~dp0"
dotnet run --project src\SampleTeam.Host -c Release -- --team-dir . %*
