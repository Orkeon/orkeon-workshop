#!/bin/bash
# read-bounds module — nudge towards delegation once direct reading piles up.
#
# Adapted from claude-code-toolkit/lib/delegation-nudge.sh (MIT, see THIRD-PARTY.md).
# A subagent reads twenty files and hands back a conclusion. The same twenty
# files read directly stay in context until the session ends.
#
# It does not deny. Any single read is legitimate; only the accumulation is not,
# and a hook cannot tell which read is the wasteful one. So it states the count
# and gets out of the way. Fires at the threshold, then at each doubling
# (6, 12, 24 files). The count restarts at every spawn — delegation-guard.sh
# calls this module with `reset` — so a session that delegates once and then
# reads everything itself is nudged like any other.
#
# Contract: HOOK_SESSION_ID, HOOK_AGENT_ID and HOOK_FILE_PATH from the
# environment; additionalContext JSON on stdout when it decides, nothing when it
# passes. `reset` as $1 clears the window for the caller's (session, agent).
set -u

THRESHOLD=${HARNESS_DELEGATION_NUDGE_THRESHOLD:-6}
sid=${HOOK_SESSION_ID:-unknown}
agent=${HOOK_AGENT_ID:-}
base="/tmp/claude-delegation-${sid}${agent:+-$agent}"

if [ "${1:-}" = "reset" ]; then
  rm -f "${base}.files" "${base}.nudged"
  exit 0
fi

# Subagents are the delegation; their reads are what the nudge asks for.
[ -n "$agent" ] && exit 0

# Only source and definition files count as exploration. A workbook artefact,
# a CLAUDE.md or a reference is read because it is the target, not because it
# is being searched.
file_path=${HOOK_FILE_PATH:-}
case "$file_path" in *.cs|*.ts|*.tsx|*.js|*.py|*.yaml|*.yml|*.json|*.jsonl) ;; *) exit 0 ;; esac

last=0
[ -f "${base}.nudged" ] && read -r last < "${base}.nudged" 2>/dev/null
case "$last" in ''|*[!0-9]*) last=0 ;; esac

# Distinct files, not calls: re-reading the same file is a bounded read in
# progress, not a survey.
seen="${base}.files"
grep -Fxq "$file_path" "$seen" 2>/dev/null || echo "$file_path" >> "$seen"
count=$(wc -l < "$seen" 2>/dev/null | tr -d ' ')
[ -n "$count" ] || exit 0

[ "$count" -lt "$THRESHOLD" ] 2>/dev/null && exit 0
[ "$count" -ge $(( last * 2 )) ] 2>/dev/null || exit 0
printf '%s' "$count" > "${base}.nudged"

ctx="Delegation: $count distinct source files read directly since the last subagent. A Read stays in context until the session ends; an Agent reads, then hands back a conclusion.
If what is left to cover is exploration — locating, mapping, checking a convention across N files — send an Agent (model haiku, description set, report bounded in the prompt). If it is targeted reading on a path already known, stay with Read: it is the right tool."

jq -cn --arg c "$ctx" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $c}}'
exit 0
