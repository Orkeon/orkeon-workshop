#!/usr/bin/env bash
# Runs the team from its own directory. TEAM_ENV selects a mount set, mounts.<name>/<team>/
# next to teams/ (e.g. TEAM_ENV=test ./run.sh); extra arguments are passed to the host
# (--input "...", --var KEY=VALUE, --events <file>|-|none, --validate).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec dotnet run --project src/SampleTeam.Host -c Release -- --team-dir . "$@"
