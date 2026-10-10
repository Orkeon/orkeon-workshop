#!/bin/bash
# PostToolUse Edit|Write|MultiEdit hook — a script Claude writes is executable.
#
# Plan § 7.3, D47. A script handed to the user that cannot be run is a hand-over that fails
# (the user's report of 2026-10-10: `./setup_glm.sh` refused, no executable bit, no way for
# a newcomer to know why). Right after Claude writes or edits a file of the workshop that is
# a shell script (`*.sh`) or a Python script with a shebang (`*.py` whose first bytes are
# `#!`), this hook gives it the executable bit when it lacks it — the mode test of
# `sync-harness.sh` (`normalise_scripts`), not `test -x`, which a mount that runs nothing
# never grants (D44). Nothing else is touched: a `run.cmd`, a `.md`, a `.json` stay as
# written, and so does anything under `workbooks/*/runs/` (the bench's), `node_modules/`,
# `.git/` or `.claude/harness-backup/`. A path outside the workshop is left alone.
#
# It never rewrites a byte of the file: Claude Code holds the time of its last Read, and a
# file changed behind its back refuses the next Edit. A script written with Windows line
# endings (CRLF) — which bash refuses: `set: pipefail: invalid option name` — is therefore
# said to the model through `additionalContext`, prefixed `make-executable:` (frozen
# literal, FROZEN-LITERALS.md § 7), and the model writes it again in LF. On a mount that
# keeps no mode a chmod fails silently: the handed line is `bash <path>` for that reason
# (HARNESS.md rule 10), and the bit set here serves whoever runs the script by its name.
#
# Silent otherwise. Exit 0 on empty or invalid input and without `jq`.
# HARNESS_MAKE_EXECUTABLE=0 turns it off.
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_MAKE_EXECUTABLE:-1}" = "0" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then [(.tool_name // ""), (.tool_input.file_path // ""), (.cwd // "")] | join("\u001f") else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r tool_name file_path payload_cwd <<<"$PARSED"

case "$tool_name" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
[ -n "$file_path" ] || exit 0
# A relative path is judged from the folder the tool runs in, like guard-phase does.
case "$file_path" in /*) ;; *) file_path="${payload_cwd:-$PWD}/$file_path" ;; esac
file_path=$(harness_normalize_path "$file_path")
root=$(harness_normalize_path "$(harness_workshop_root)")
# The workshop only. Folder names compared in lower case: a Windows bind mount ignores case.
lower="${file_path,,}"
case "$lower" in "${root,,}"/*) ;; *) exit 0 ;; esac
case "$lower" in
  */workbooks/*/runs/*|*/node_modules/*|*/.git/*|*/.claude/harness-backup/*) exit 0 ;;
esac

[ -f "$file_path" ] && [ ! -L "$file_path" ] || exit 0
case "$lower" in
  *.sh) ;;
  *.py) [ "$(head -c 2 "$file_path" 2>/dev/null)" = "#!" ] || exit 0 ;;
  *) exit 0 ;;
esac

mode=$(stat -c %a "$file_path" 2>/dev/null) || exit 0
if (( (8#$mode & 8#111) == 0 )); then
  chmod a+x "$file_path" 2>/dev/null || true
fi

if head -c 4096 "$file_path" 2>/dev/null | grep -q $'\r'; then
  context="make-executable: \`$file_path\` has Windows line endings (CRLF): a script whose lines end with a CR does not run (bash: \`set: pipefail: invalid option name\`). Write it again with LF line endings before handing it over; the file was not changed."
  jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $c}}'
fi
exit 0
