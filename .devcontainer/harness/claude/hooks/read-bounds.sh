#!/bin/bash
# PreToolUse Read hook — require offset/limit on large files, then count the
# reads that go through towards the delegation nudge.
#
# Adapted from claude-code-toolkit/hooks/read-bounds.sh (MIT, see THIRD-PARTY.md).
# A full file read whole is carried to the end of the session; the cost was
# never one huge read, it was the count. This hook denies an unbounded Read past
# the threshold (HARNESS_READ_BOUNDS_LINES / HARNESS_READ_BOUNDS_BYTES) and
# hands back the file's outline so the bounded read costs the same single turn
# as forcing.
#
# Escape hatch: the denial is recorded per (agent, file). Re-issuing the
# identical unbounded Read passes through — that is how a full read is forced
# when one is genuinely wanted — and the pass applies to the agent that asked,
# never to its siblings or its parent.
#
# Thresholds, skip lists, outline and refusal layout are shared with
# lib/guard-cat-bounds.sh through lib/bounds-common.sh.
set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/bounds-common.sh
. "$LIB/bounds-common.sh"

input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j '[(.tool_name // ""), (.session_id // "unknown"), (.agent_id // ""), (.tool_input.file_path // ""), ((.tool_input.offset // "") | tostring), ((.tool_input.limit // "") | tostring)] | join("\u001f")' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r tool_name session_id agent_id file_path has_offset has_limit <<<"$PARSED"

[ "$tool_name" = "Read" ] || exit 0
[ -n "$file_path" ] || exit 0
[ -f "$file_path" ] || exit 0

export HOOK_SESSION_ID="$session_id" HOOK_AGENT_ID="$agent_id" HOOK_FILE_PATH="$file_path"

# The read goes through: hand it to the delegation module, which answers with
# an additionalContext or with nothing.
pass() {
  out=$(. "$LIB/delegation-nudge.sh")
  [ -n "$out" ] && printf '%s\n' "$out"
  exit 0
}

[ -n "$has_offset" ] && pass
[ -n "$has_limit" ] && pass

bounds_skip "$file_path" && pass

lines=$(wc -l < "$file_path" 2>/dev/null | tr -d ' ')
bytes=$(wc -c < "$file_path" 2>/dev/null | tr -d ' ')
[ -n "$lines" ] || pass
if [ "$lines" -le "$BOUNDS_THRESHOLD" ] 2>/dev/null && [ "${bytes:-0}" -le "$BOUNDS_BYTES" ] 2>/dev/null; then
  pass
fi

# Past the threshold but flat: denying it costs more than it saves.
bounds_is_flat "$file_path" && pass

# Scope the escape hatch to the agent, not the session: subagents run under the
# parent's session_id, and a per-session key would hand one agent's forcing to
# every other agent. agent_id is the only per-agent field; the main chain has
# none and falls back to the session.
seen_file="/tmp/claude-readbounds-seen-${session_id}${agent_id:+-$agent_id}"

if [ -f "$seen_file" ] && grep -Fxq "$file_path" "$seen_file" 2>/dev/null; then
  echo "$file_path" >> "${seen_file}.forced"
  pass
fi
echo "$file_path" >> "$seen_file"

reason=$(bounds_reason \
  "Unbounded Read on $file_path ($lines lines, ${bytes:-0} bytes > $BOUNDS_THRESHOLD lines / $BOUNDS_BYTES bytes). The whole file stays in context until the session ends." \
  "$file_path" \
  "Read the range you need around one of them" \
  "Locate the range first (grep -n), then Read with offset/limit." \
  "Re-issue this exact Read to force the full read.")

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
