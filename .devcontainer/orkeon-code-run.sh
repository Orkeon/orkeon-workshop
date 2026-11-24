#!/usr/bin/env bash
# orkeon-code-run — one crew of Orkeon Code, without its REPL (D113, D115).
#
#   orkeon-code-run <crew> --inputs '<json>' [--workspace <dir>] [--settings <file>] [-- orkeon run options]
#   (from 1.0.0-rc.3 a relative path in those options is read from the caller's folder when the file is there)
#   orkeon-code-run --list
#
# Orkeon Code's commands are crews: main-loop (what /assistant runs), code-review, analyze, the dev
# steps (dev-plan, dev-verify, dev-learn…)… Each runs in one shot, reads its input from --inputs (the
# header of its crew.ork.ts names the fields) and prints its result as JSON on stdout. A crew that asks
# questions (dev-spec, dev-batches) gets no answer here: those are for the REPL, `orkeon-code`.
#
# Since f2cb39b Orkeon Code runs a crew itself: `orkeon-code run <crew>` (Orkeon Code#115) goes through
# the REPL's project, trust, settings and mounts (/workspace, /output, /tmp, /user-config), turns the
# permission gate on, sends the log lines to stderr and keeps the exit code of `orkeon run`. This
# command is that one, with what the workshop adds:
#
#   - the workspace: --workspace, else $ORKEON_CODE_WORKSPACE, else $CLAUDE_PROJECT_DIR, else the
#     current directory. It must be a folder Orkeon Code trusts (`orkeon-code trust add <dir>`, the
#     user's own act): an untrusted one is refused, exit 3, and --trust is not passed on;
#   - the settings: --settings, else $ORKEON_CODE_SETTINGS, else ~/.orkeon-code/appsettings.json (what
#     `orkeon-code setup` writes), else Orkeon Code's example settings with the `Llm` section of the
#     workshop's Orkeon settings (~/.config/Orkeon/appsettings.json) laid over them, written to
#     ~/.orkeon-code/workshop/appsettings.json at each run. Orkeon Code alone would hand the machine's
#     file over as it is, without the example's tool, RAG and security sections;
#   - --list: the crews and the input each one reads.
#
# The model is the one of those settings: the local one, or a provider whose key is in the
# environment (`workshop setup keys`). Orkeon Code cannot run on a Claude plan.
#
# Exit code: the one of `orkeon run` — 0 the script completed (read the JSON to know what was done:
# a call the gate refused is no error), 1 a script error, 2 a runtime error, 75 the run stopped on
# a question (checkpointing on), 130 cancelled. 3: the workspace is not trusted. 64: usage.
set -euo pipefail

die() { echo "orkeon-code-run: $*" >&2; exit "${2:-64}"; }

INSTALL="${ORKEON_CODE_INSTALL:-/usr/local/lib/orkeon-code/current}"
[ -d "$INSTALL/src/crews" ] || die "Orkeon Code is not installed ($INSTALL/src/crews)" 127
[ -x "$INSTALL/orkeon-code" ] || die "no orkeon-code launcher in $INSTALL" 127
command -v orkeon >/dev/null 2>&1 || die "orkeon is not on the PATH" 127

if [ "${1-}" = --list ]; then
  for f in "$INSTALL"/src/crews/*/crew.ork.ts; do
    c="$(basename "$(dirname "$f")")"; case "$c" in _*) continue ;; esac
    printf '%s\t%s\n' "$c" "$(sed -n 's|^// Input (globalThis.inputs): *||p' "$f" | head -n 1)"
  done
  exit 0
fi

crew="${1-}"
case "$crew" in ''|-*) die "usage: orkeon-code-run <crew> --inputs '<json>' [--workspace <dir>] [--settings <file>] | --list" ;; esac
case "$crew" in *[!a-z0-9_-]*) die "'$crew' is not a crew name" ;; esac
[ -f "$INSTALL/src/crews/$crew/crew.ork.ts" ] || die "no crew '$crew' in Orkeon Code (orkeon-code-run --list names them)"
shift

workspace=""
settings="${ORKEON_CODE_SETTINGS:-}"
pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) workspace="${2:?--workspace needs a folder}"; shift 2 ;;
    --workspace=*) workspace="${1#*=}"; shift ;;
    --settings) settings="${2:?--settings needs a file}"; shift 2 ;;
    --settings=*) settings="${1#*=}"; shift ;;
    --trust|--demo) die "$1 is not passed on: the user trusts a folder with 'orkeon-code trust add <dir>'" ;;
    --) pass+=("$@"); break ;;
    *) pass+=("$1"); shift ;;
  esac
done
workspace="${workspace:-${ORKEON_CODE_WORKSPACE:-${CLAUDE_PROJECT_DIR:-$PWD}}}"
[ -d "$workspace" ] || die "$workspace is not a folder"

home="${ORKEON_CODE_HOME:-$HOME/.orkeon-code}"
if [ -z "$settings" ] && [ ! -f "$home/appsettings.json" ]; then
  machine="${XDG_CONFIG_HOME:-$HOME/.config}/Orkeon/appsettings.json"
  [ -f "$machine" ] || die "no settings: neither $home/appsettings.json (orkeon-code setup) nor $machine (orkeon init) exists" 2
  command -v jq >/dev/null 2>&1 || die "jq is needed to derive the settings from $machine" 127
  settings="$home/workshop/appsettings.json"
  mkdir -p "$home/workshop"
  # The example's own Llm section names a provider of its authors: the machine's replaces it whole.
  # So does its rate limiting, when the machine sets one (a local model takes one request at a time).
  jq -s '(.[0] | del(._comment, .Llm)) + {Llm: (.[1].Llm // {})} + (if .[1].RateLimiting then {RateLimiting: .[1].RateLimiting} else {} end)' \
    "$INSTALL/config/appsettings.example.json" "$machine" > "$settings.tmp" \
    && mv "$settings.tmp" "$settings" || die "cannot derive the settings from $machine" 2
fi

# No terminal on stdin: an untrusted folder is refused (exit 3) rather than asked about.
exec "$INSTALL/orkeon-code" run "$crew" --workspace "$workspace" ${settings:+--settings "$settings"} --mode tool \
  ${pass[@]+"${pass[@]}"} </dev/null
