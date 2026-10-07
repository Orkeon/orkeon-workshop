#!/bin/bash
# PreToolUse Bash hook — single entry point for the Bash guards of the harness.
#
# Adapted from claude-code-toolkit/hooks/bash-dispatch.sh (MIT, see THIRD-PARTY.md).
# One dispatcher instead of one hook per guard: the payload is parsed once, the
# order is explicit, and only one stage ever answers — so a rewrite is never
# rewrapped by the RTK rewrite and two modules never emit competing
# `updatedInput` for the same command.
#
# Order:
#   1. guard-user-gate   deny       -> terminal, no `gate_passed` written into a STATUS.md by the shell (D36)
#   2. guard-git         deny / ask -> terminal (OFF unless HARNESS_GUARD_GIT=1)
#   3. guard-cat-bounds  deny       -> terminal, an unbounded dump never reaches rtk
#   4. guard-diff-bounds deny       -> terminal, a whole patch never reaches rtk
#   5. rewrite-rtk       rewrite    -> the default path
#
# run-gate.sh is NOT a module: it is its own PreToolUse:Bash hook, registered
# before this one in settings.json, because a paid run must be refused whatever
# this chain answers, and the evals replay it on its own.
#
# Module contract: reads HOOK_* from the environment (HOOK_INPUT, HOOK_CMD,
# HOOK_SESSION_ID, HOOK_AGENT_ID, HOOK_TRANSCRIPT_PATH), prints the hook JSON on
# stdout when it decides, prints nothing when it passes. Modules are sourced
# inside a command substitution: their `exit` and `set -u` stay in that subshell.
#
# `set -u` without `pipefail`, here and in the modules: they test pipelines such
# as `printf … | grep -q`, where grep leaves at the first match. Under pipefail a
# writer cut short by SIGPIPE would turn a match into a miss — a guard that
# stops denying. The standalone hooks test no pipeline and do set pipefail.
set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"

HOOK_INPUT=$(cat)
[ -n "$HOOK_INPUT" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# Single parse for the whole chain. The separator is US (\x1f), not a tab: bash
# collapses runs of IFS-whitespace, and an empty agent_id (the main chain always
# has one) would shift transcript_path into HOOK_AGENT_ID. The command is
# appended behind an RS (\x1e) and split off on the FIRST occurrence.
PARSED=$(printf '%s' "$HOOK_INPUT" | jq -j '([(.tool_name // ""), (.session_id // "unknown"), (.agent_id // ""), (.transcript_path // "")] | join("\u001f")) + "\u001e" + (.tool_input.command // "")' 2>/dev/null) || exit 0

IFS=$'\x1f' read -r HOOK_TOOL_NAME HOOK_SESSION_ID HOOK_AGENT_ID HOOK_TRANSCRIPT_PATH <<<"${PARSED%%$'\x1e'*}"
HOOK_CMD="${PARSED#*$'\x1e'}"

[ "$HOOK_TOOL_NAME" = "Bash" ] || exit 0
[ -n "$HOOK_CMD" ] || exit 0

export HOOK_INPUT HOOK_CMD HOOK_SESSION_ID HOOK_AGENT_ID HOOK_TRANSCRIPT_PATH

# Advisory, not a decision: it never denies and never rewrites, so it runs
# outside the terminal chain and is merged into whatever that chain answers.
NUDGE=$(. "$LIB/batching-nudge.sh" 2>/dev/null || true)

emit() {
  # $1 = the module's JSON, or empty when no module decided.
  if [ -z "$NUDGE" ]; then
    [ -n "${1:-}" ] && printf '%s\n' "$1"
    return
  fi
  if [ -z "${1:-}" ]; then
    jq -n --arg c "$NUDGE" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $c}}'
    return
  fi
  # Graft the nudge onto the decision; a module answer that is not an object
  # carrying hookSpecificOutput is passed through untouched.
  merged=$(printf '%s' "$1" | jq --arg c "$NUDGE" \
    'if type == "object" and has("hookSpecificOutput")
     then .hookSpecificOutput.additionalContext =
       (((.hookSpecificOutput.additionalContext // "") | if . == "" then "" else . + "\n" end) + $c)
     else . end' 2>/dev/null) || merged=""
  printf '%s\n' "${merged:-$1}"
}

MODULES=(
  "guard-user-gate.sh"
  "guard-git.sh"
  "guard-cat-bounds.sh"
  "guard-diff-bounds.sh"
  "rewrite-rtk.sh"
)

for module in "${MODULES[@]}"; do
  [ -f "$LIB/$module" ] || continue
  # shellcheck disable=SC2086
  out=$(set -- $module; f=$1; shift; . "$LIB/$f" "$@")
  if [ -n "$out" ]; then
    emit "$out"
    exit 0
  fi
done

emit ""
exit 0
