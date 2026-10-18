#!/bin/bash
# hook-run.sh <name> - the launcher every hook command of settings.json goes through (B5).
#
#   bash "${HARNESS_HOOKS_DIR:-$CLAUDE_PROJECT_DIR/.claude/hooks}/hook-run.sh" <name>
#
# Why: a workshop on a 9p mount (a WSL2 Windows disk) fails reads at random, and a hook script
# bash cannot read exits 126 ("Input/output error"). Claude Code treats every exit code but 2 as
# non-blocking, so an unreadable guard let the call through - 19 guards skipped on one real run.
#
# Where the hook is read from: HARNESS_HOOKS_DIR (the image sets it to the staging copy on the
# container's own disk, /usr/local/share/claude-harness/claude/hooks, whose scripts source
# ../lib/*.sh there) when it is set and <name>.sh exists there, else the launcher's own folder
# (the workshop copy sync-harness.sh deploys, outside the image).
#
# Fail-closed: for a guard event (PreToolUse, UserPromptSubmit, UserPromptExpansion, read from
# hook_event_name of the payload) a script that cannot be run - missing, unreadable, or
# bash exiting 126 or 127 - becomes exit 2 with one stderr line naming the hook, so Claude Code
# blocks the call. Every other exit code, and every non-guard event, keeps its code. The entries of
# settings.json for PreToolUse, UserPromptSubmit and UserPromptExpansion also carry
# `"onFailure": "block"` (Claude Code 2.1.295 and later), which covers this launcher itself being
# unreadable; this mapping stays for an older Claude Code. Never for SubagentStop: there exit 2 sends
# the subagent back to work, and a check that stays unreadable would keep it running to its maxTurns.
#
# Stdin reaches the hook byte for byte, its stdout and stderr are not touched, its exit code is
# returned. HARNESS_HOOK_RUN=0: a plain runner of the workshop copy
# ($CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh), no lookup in HARNESS_HOOKS_DIR, no mapping.

name=${1:-}
here=${BASH_SOURCE[0]%/*}
[ "$here" = "${BASH_SOURCE[0]}" ] && here=.

if [ "${HARNESS_HOOK_RUN:-1}" = 0 ]; then
  dir=$here
  [ -n "${CLAUDE_PROJECT_DIR:-}" ] && dir=$CLAUDE_PROJECT_DIR/.claude/hooks
  exec bash "$dir/$name.sh"
fi

script=$here/$name.sh
if [ -n "${HARNESS_HOOKS_DIR:-}" ] && [ -f "$HARNESS_HOOKS_DIR/$name.sh" ]; then
  script=$HARNESS_HOOKS_DIR/$name.sh
fi

# The payload, buffered once to read its event: the trailing x keeps trailing newlines.
input=$(cat; printf x)
input=${input%x}

guard=0
if [[ $input =~ \"hook_event_name\"[[:space:]]*:[[:space:]]*\"(PreToolUse|UserPromptSubmit|UserPromptExpansion)\" ]]; then
  guard=1
fi

refuse() {
  printf 'hook-run: the guard hook %s could not be read (%s, %s) - the call is blocked; run sync-harness.sh or check the disk, then retry\n' \
    "$name" "$script" "$1" >&2
  exit 2
}

case $name in
  ''|*/*) [ "$guard" = 1 ] && refuse "no valid hook name"; exit 0 ;;
esac
if [ "$guard" = 1 ] && [ ! -r "$script" ]; then
  refuse "missing or unreadable"
fi

printf '%s' "$input" | bash "$script"
rc=$?
if [ "$guard" = 1 ] && { [ "$rc" = 126 ] || [ "$rc" = 127 ]; }; then
  refuse "exit $rc"
fi
exit "$rc"
