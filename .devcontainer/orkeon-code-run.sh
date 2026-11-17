#!/usr/bin/env bash
# orkeon-code-run — one crew of Orkeon Code, without its REPL (D113).
#
#   orkeon-code-run <crew> --inputs '<json>' [--workspace <dir>] [--settings <file>] [--list] [orkeon run options]
#
# Orkeon Code's commands are crews: main-loop (what /assistant runs), code-review, analyze, the dev
# steps (dev-plan, dev-verify, dev-learn…)… Each runs in one shot under `orkeon run`, reads its input
# from --inputs (the header of its crew.ork.ts names the fields) and prints its result as JSON on
# stdout. A crew that asks questions (dev-spec, dev-batches) gets no answer here: those are for the
# REPL, `orkeon-code`. This command is the line Orkeon Code's own
# scripts/run-crew.sh builds — that script is in its repository, not in what its release installs:
#
#   orkeon run <install>/src/crews/<crew>/crew.ork.ts -s <settings>
#     -m <workspace>:/workspace:rw <output>:/output:rw --allow-external-mounts --inputs <json>
#
#   - the workspace is the project the crew works on: --workspace, else $ORKEON_CODE_WORKSPACE, else
#     $CLAUDE_PROJECT_DIR, else the current directory. It must be a folder Orkeon Code trusts
#     (`orkeon-code trust add <dir>`, the user's own act): an untrusted one is refused, exit 3;
#   - the settings: --settings, else $ORKEON_CODE_SETTINGS, else ~/.orkeon-code/appsettings.json (what
#     `orkeon-code setup` writes), else Orkeon Code's example settings with the `Llm` section of the
#     workshop's Orkeon settings (~/.config/Orkeon/appsettings.json) laid over them, written under the
#     state folder. The example turns the permission gate on (`Orkeon:Security:PermissionGate:Enabled`),
#     without which the permission mode of the input decides nothing;
#   - the scratch mount /output is <state>/output, <state> being $ORKEON_CODE_STATE, else
#     ~/.orkeon-code/headless/<name of the workspace>-<hash of its path>.
#
# The model is the one of those settings: the local one, or a provider whose key is in the
# environment (`workshop setup keys`). Orkeon Code cannot run on a Claude plan.
#
# stdout is the result alone, one JSON object; the log lines of the run go to stderr.
#
# Exit code: the one of `orkeon run` — 0 the script completed (read the JSON to know what was done:
# a call the gate refused is no error), 1 a script error, 2 a runtime error, 75 the run stopped on
# a question (checkpointing on), 130 cancelled. 3: the workspace is not trusted. 64: usage.
set -euo pipefail

die() { echo "orkeon-code-run: $*" >&2; exit "${2:-64}"; }

INSTALL="${ORKEON_CODE_INSTALL:-/usr/local/lib/orkeon-code/current}"
[ -d "$INSTALL/src/crews" ] || die "Orkeon Code is not installed ($INSTALL/src/crews)" 127
command -v orkeon >/dev/null 2>&1 || die "orkeon is not on the PATH" 127

if [ "${1-}" = --list ]; then
  for f in "$INSTALL"/src/crews/*/crew.ork.ts; do
    c="$(basename "$(dirname "$f")")"; case "$c" in _*) continue ;; esac
    printf '%s\t%s\n' "$c" "$(sed -n 's|^// Input (globalThis.inputs): *||p' "$f" | head -n 1)"
  done
  exit 0
fi

crew="${1-}"; [ -n "$crew" ] || die "usage: orkeon-code-run <crew> --inputs '<json>' [--workspace <dir>] [--settings <file>] | --list"
shift
script="$INSTALL/src/crews/$crew/crew.ork.ts"
case "$crew" in */*|.*) die "'$crew' is not a crew name" ;; esac
[ -f "$script" ] || die "no crew '$crew' in Orkeon Code (orkeon-code-run --list names them)"

workspace="${ORKEON_CODE_WORKSPACE:-${CLAUDE_PROJECT_DIR:-$PWD}}"
settings="${ORKEON_CODE_SETTINGS:-}"
pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) workspace="${2:?--workspace needs a folder}"; shift 2 ;;
    --settings) settings="${2:?--settings needs a file}"; shift 2 ;;
    *) pass+=("$1"); shift ;;
  esac
done
[ -d "$workspace" ] || die "$workspace is not a folder"
workspace="$(cd "$workspace" && pwd -P)"

rc=0
"$INSTALL/orkeon-code" trust check "$workspace" </dev/null >&2 || rc=$?
case "$rc" in
  0) ;;
  *) echo "orkeon-code-run: $workspace is not a folder Orkeon Code trusts — the user trusts it with: orkeon-code trust add $workspace" >&2; exit 3 ;;
esac

home="${ORKEON_CODE_HOME:-$HOME/.orkeon-code}"
state="${ORKEON_CODE_STATE:-$home/headless/$(basename "$workspace")-$(printf '%s' "$workspace" | sha256sum | cut -c1-8)}"
mkdir -p "$state/output"

if [ -z "$settings" ]; then
  if [ -f "$home/appsettings.json" ]; then
    settings="$home/appsettings.json"
  else
    machine="${XDG_CONFIG_HOME:-$HOME/.config}/Orkeon/appsettings.json"
    [ -f "$machine" ] || die "no settings: neither $home/appsettings.json (orkeon-code setup) nor $machine (orkeon init) exists" 2
    command -v jq >/dev/null 2>&1 || die "jq is needed to derive the settings from $machine" 127
    settings="$state/appsettings.json"
    # The example's own Llm section names a provider of its authors: the machine's replaces it whole.
    # So does its rate limiting, when the machine sets one (a local model takes one request at a time).
    jq -s '(.[0] | del(._comment, .Llm)) + {Llm: (.[1].Llm // {})} + (if .[1].RateLimiting then {RateLimiting: .[1].RateLimiting} else {} end)' "$INSTALL/config/appsettings.example.json" "$machine" > "$settings.tmp" \
      && mv "$settings.tmp" "$settings" || die "cannot derive the settings from $machine" 2
  fi
fi
[ -f "$settings" ] || die "settings not found: $settings" 2

export Orkeon__Embeddings__FingerprintPath="${Orkeon__Embeddings__FingerprintPath:-/output/rag/embedding-fingerprint.json}"
echo "orkeon-code-run: $crew on $workspace (settings $settings)" >&2
cd "$INSTALL"
# `orkeon run` writes its log lines (`hh:mm:ss.fff warn: …`) on stdout, before the result: they go to
# stderr here, so that stdout is the JSON of the crew and nothing else.
set +e
orkeon run "$script" -s "$settings" -m "$workspace:/workspace:rw" "$state/output:/output:rw" --allow-external-mounts "${pass[@]}" \
  | awk '/^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9]+ [a-z]+: / { print > "/dev/stderr"; next } { print }'
exit "${PIPESTATUS[0]}"
