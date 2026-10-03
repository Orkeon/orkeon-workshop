#!/bin/bash
# bash-dispatch module — RTK rewrite, with absolute paths normalised first.
#
# Adapted from claude-code-toolkit/lib/rewrite-rtk.sh (MIT, see THIRD-PARTY.md),
# without the `dotnet test|restore|format` prefixing: the harness builds its C#
# through the generators and the bench, and the dotnet-specific gap it closed
# is not worth a version dependency here.
#
# Strips the /usr/bin/, /bin/, /usr/local/bin/ prefix on grep/rg/find/egrep/fgrep
# so the RTK regex catches them: fed `/usr/bin/grep ...`, `rtk hook claude`
# answers nothing at all, where the bare `grep` gets rewritten. In command
# position only — start of a line, or after `; & | (`, optionally behind
# `VAR=value` assignments: in `ls -l /usr/bin/grep` the path is an argument, and
# stripping it would change what the command does.
#
# The answer of rtk is passed through untouched, and the module never emits a
# rewrite or a decision of its own. rtk is permission-aware (checked on rtk 0.43,
# and locked by evals/cases/rewrite-rtk.json): it attaches
# `permissionDecision: "allow"` only when an allow rule of the user's own Claude
# settings — user level or project level — covers the command; under an `ask`
# rule it rewrites without a decision; under a `deny` rule it answers nothing.
# So a rewrite never approves what the user did not, and when rtk declines, the
# command runs exactly as it was written — absolute path included.
#
# A heredoc body is text on its way to a file, not a command: sed works line by
# line and would rewrite a `/usr/bin/grep` sitting in it. Such a command is not
# normalised.
#
# This is the only place `rtk hook claude` is invoked. Do not register a second,
# global `rtk hook claude` on PreToolUse:Bash: two hooks answering the same
# `tool_input` with competing `updatedInput` have no defined winner.
#
# Contract: reads $HOOK_INPUT (full payload, `rtk hook claude` wants the JSON) and
# $HOOK_CMD. Last stage of the chain: whatever it prints is the answer. Exits
# silently when rtk is not on the PATH. HARNESS_RTK_BIN names another binary
# (the evals point it at a stub).
set -u

input="${HOOK_INPUT:-}"
cmd="${HOOK_CMD:-}"
[ -n "$input" ] || exit 0

rtk_bin="${HARNESS_RTK_BIN:-rtk}"
command -v "$rtk_bin" >/dev/null 2>&1 || exit 0

case "$cmd" in
  *'<<'*) ;;
  */bin/*)
    normalized=$(printf '%s' "$cmd" | sed -E \
      -e 's#(^|[;&|(])([[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)/(usr/local/bin|usr/bin|bin)/(grep|rg|find|egrep|fgrep)([[:space:]]|$)#\1\2\5\6#g')
    if [ "$normalized" != "$cmd" ]; then
      input=$(printf '%s' "$input" | jq --arg c "$normalized" '.tool_input.command = $c')
    fi ;;
esac

printf '%s' "$input" | "$rtk_bin" hook claude 2>/dev/null
exit 0
