#!/bin/bash
# bash-dispatch module — a `show` already served to an agent is not served twice (S1 of the reading
# plan, 2026-10-14).
#
# `code-map.py show <file> <address>` (claude/scripts/) prints one node of a file by name; its output
# stays in the asking context until the end. The four runs measured on 2026-10-12/13 counted about sixty
# re-reads of a range already read: the same `show` asked again by the same agent, for an unchanged file,
# is refused with where it already is — `guard-show-memo: <file> "<address>" already shown at <when>
# (call #N of this agent): it is in your context`. A script does not know its agent; the dispatcher
# does, which is why the memo is a module and not a mode of the script.
#
#   - the key is the session and the agent (`agent_id`; the main conversation has none and keeps one
#     memo per session): a sibling agent or another session is served;
#   - the file is resolved against the payload's `cwd` (a `cd <dir>` earlier in the line moves it) and
#     stamped with its mtime and size: a file changed since is served again, and the new stamp kept;
#   - `HARNESS_FORCE_READ=1` in front of the command (the flag of the read guards, lib/bounds-common.sh)
#     serves it again: it is wanted twice on purpose. A compaction or a /clear needs no flag: its
#     SessionStart runs session-cleanup, which drops the session's memos with its other state files;
#   - a line holding several shows is refused when one of them is a repeat, named; the others are
#     recorded only once served.
#
# The parsing and the state live in the script (`code-map.py memo <state file>`, reading HOOK_CMD and
# HOOK_CWD); the module only names the state file and turns the answer into a deny. One line per show
# served, `/tmp/claude-show-seen-<sid>[-<agent>]`, removed by session-cleanup.
#
# Switch: HARNESS_SHOW_MEMO, `1` by default (a guard of `core`: silent on every command but a `show`),
# `0` turns it off. Without python3 or the script: silent.
#
# Contract: reads $HOOK_CMD, $HOOK_CWD, $HOOK_SESSION_ID, $HOOK_AGENT_ID; prints the hook JSON when it
# denies, nothing when it passes.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
[ "${HARNESS_SHOW_MEMO:-1}" = "0" ] && exit 0
case "$cmd" in *code-map.py*show*) ;; *) exit 0 ;; esac
command -v python3 >/dev/null 2>&1 || exit 0

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" 2>/dev/null && pwd)/code-map.py"
[ -f "$script" ] || exit 0

state="/tmp/claude-show-seen-${HOOK_SESSION_ID:-unknown}${HOOK_AGENT_ID:+-$HOOK_AGENT_ID}"
reason=$(python3 "$script" memo "$state" 2>/dev/null) || exit 0
[ -n "$reason" ] || exit 0

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
