#!/bin/bash
# bash-dispatch module — no user gate written through the shell.
#
# Plan § 4.4, § 7.3, D36. Gates 1 to 3 of a team are recorded by the /team-approve hook
# alone, from the line the user types; guard-phase refuses an Edit or a Write of
# `STATUS.md` that raises `gate_passed` past one of them. A model that meets that
# refusal sometimes reaches for the shell instead — `sed -i 's/^gate_passed: .*/…/'` —
# which no Edit hook sees. This module closes that reflex: a Bash command that names
# `gate_passed` and a `STATUS.md` and writes (sed -i, perl -i, a redirect or a tee into
# a STATUS.md, sponge, awk -i inplace, yq -i, ed/ex, a python/node/ruby one-liner) is denied, whatever
# the value. Reading stays free: `grep gate_passed workbooks/x/STATUS.md`,
# `orkeon-bench status x`, `sed -n`.
#
# A tripwire against a mistake, not a wall: a script that writes the file without
# naming the key in the command, or a `mv` of a prepared file, passes (plan D36: "a
# trace Claude cannot fill in by mistake, not a proof against a determined agent").
# Every other change of STATUS.md goes through the Edit tool, where guard-phase judges it.
#
# Contract: reads $HOOK_CMD, prints the hook JSON when it decides, nothing when it
# passes. Runs first in the chain — a deny is terminal. Every reason starts with
# `guard-user-gate:` (frozen literal, matched by the evals).
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0

# Fast bail-out, before any subprocess.
case "$cmd" in *gate_passed*) ;; *) exit 0 ;; esac
case "$cmd" in *[Ss][Tt][Aa][Tt][Uu][Ss].[Mm][Dd]*) ;; *) exit 0 ;; esac

# An interpreter counts only where a command starts and when it is handed a program to run
# (`python3 -c`, `node -e`, `python3 - <<EOF`): `python3 check_crew.py … && grep gate_passed …`
# and a path such as /home/node/… are not writes, nor is an interpreter that only reads a pipe
# (`orkeon-bench status x --json | python3 -c …`).
WRITES='(\bsed\b[^|;&]*[[:space:]](-[A-Za-z]*i[^[:space:]]*|--in-place[^[:space:]]*))|(\bperl\b[^|;&]*[[:space:]]-[A-Za-z]*i)|(>{1,2}[[:space:]]*[^[:space:]|;&]*STATUS\.md)|(\btee\b[^|;&]*STATUS\.md)|(\bsponge\b[^|;&]*STATUS\.md)|(\bawk\b[^|;&]*-i[[:space:]]*inplace)|(\byq\b[^|;&]*[[:space:]](-[A-Za-z]*i[A-Za-z]*|--inplace)([[:space:]=]|$))|((^|[;&(][[:space:]]*)(env[[:space:]]+)?([^[:space:]|;&]*/)?(python[0-9.]*|node|ruby)([[:space:]]+-[A-Za-z]+)*[[:space:]]+(-[A-Za-z]*[ce]([[:space:]]|$)|-([[:space:]]|$)|<<))|((^|[;&|[:space:]])(ed|ex)[[:space:]])'
printf '%s' "$cmd" | grep -qiE "$WRITES" || exit 0

jq -n --arg r "guard-user-gate: this command writes \`gate_passed\` into a STATUS.md through the shell. Gates 1 to 3 are recorded by the /team-approve hook alone, from the line the user types — /team-approve need, test-plan or design — never by Claude (D36), and a refusal of the Edit tool is not to be worked around. Any other change of STATUS.md goes through the Edit tool, where guard-phase judges it. Show the user the artefact and what stays open, and ask them to type the approval." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
