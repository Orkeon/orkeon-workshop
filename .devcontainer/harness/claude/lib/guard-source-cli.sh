#!/bin/bash
# bash-dispatch module — in a source checkout, the product runs from its sources, never from the
# image's install (D67).
#
# The image carries an `orkeon` built at its own commit (/usr/local/bin/orkeon, orkeon-update.sh).
# On a source profile the folder is a checkout of the product itself: a command that runs the
# image's binary tests the wrong code and nobody sees it, the two answer the same `--help`. Nothing
# is fixed here: the names and the replacement come from the repository pack, through two switches
# the profile writes into settings.local.json.
#
#   HARNESS_SOURCE_CLI_NAMES   space-separated names of the commands the image installs for the
#                              product (`orkeon`). Empty, the default: the module is off.
#   HARNESS_SOURCE_CLI         the command that runs the checkout's own build, typed from the top of
#                              the checkout (`dotnet run --project <csproj dir> --`); the refusal
#                              quotes it with the arguments of the refused command behind it. Empty:
#                              the refusal says to read the repository's own guide.
#
# A name is matched as the first word of a simple command: after `;`, `&&`, `||`, `|`, a newline,
# `$(` or a backtick; behind environment assignments and the usual prefixes (`rtk`, `rtk proxy`,
# `sudo`, `command`, `exec`, `time`, `nohup`, `env`); with or without a directory in front
# (`/usr/local/bin/orkeon`). `echo orkeon`, `which orkeon`, `orkeon-bench` and the checkout's own
# `dotnet run` pass: only the word is compared, no subprocess.
#
# Contract: reads $HOOK_CMD, prints the hook JSON when it decides, nothing when it passes. A deny
# is terminal in the chain.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
names="${HARNESS_SOURCE_CLI_NAMES:-}"
[ -n "$names" ] || exit 0

# Cheap gate before any parsing: no listed name anywhere in the command, nothing to do.
hit=0
# shellcheck disable=SC2086
for n in $names; do case "$cmd" in *"$n"*) hit=1; break ;; esac; done
[ "$hit" -eq 1 ] || exit 0

found="" rest=""
while IFS= read -r segment; do
  [ -n "$segment" ] || continue
  # shellcheck disable=SC2086
  set -- $segment
  while [ $# -gt 0 ]; do
    case "$1" in
      [A-Za-z_]*=*) shift; continue ;;                     # VAR=value in front of the command
      rtk) shift; [ "${1:-}" = proxy ] && shift; continue ;;
      sudo|command|exec|time|nohup|env) shift; continue ;;
      \(*|\{*) set -- "${1#[({]}" "${@:2}"; [ -n "$1" ] || shift; continue ;;
    esac
    break
  done
  [ $# -gt 0 ] || continue
  word="${1##*/}"
  # shellcheck disable=SC2086
  for n in $names; do
    if [ "$word" = "$n" ]; then found="$n"; shift; rest="$*"; break 2; fi
  done
done < <(printf '%s\n' "$cmd" | sed 's/\$(/\n/g; s/`/\n/g' | tr ';&|' '\n\n\n')

[ -n "$found" ] || exit 0

replacement="${HARNESS_SOURCE_CLI:-}"
if [ -n "$replacement" ]; then
  how="From the top of the checkout: \`$replacement${rest:+ $rest}\`."
else
  how="The repository pack names no command for it: read the repository's own CLAUDE.md or contribution guide for the way its CLI is run from the sources."
fi
reason="guard-source-cli: the image's \`$found\` refused in a source checkout — this folder is the sources of the product, and \`$found\` on the PATH is the build the image carries at its own commit, not this code. $how Set by the repository pack: HARNESS_SOURCE_CLI_NAMES, HARNESS_SOURCE_CLI."

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
