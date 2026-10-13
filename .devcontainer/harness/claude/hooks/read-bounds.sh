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
# Escape hatch (S0, 2026-10-13): the explicit span — `offset` 1 and a `limit` covering the file —
# is the full read said on purpose. Re-issuing the identical Read no longer forces anything: that
# hatch was walked through 30 times in four runs, and a refusal that yields to repetition only adds
# a turn.
#
# Before the bounds: the pilot of a batch (a `dev-batch` agent, or the main conversation while a
# `/dev-implement` batch is open) reads no source or test file at all, bounded or not
# (lib/pilot-common.sh, S0) — its Read of one is refused whatever its size.
#
# Thresholds, skip lists, outline and refusal layout are shared with
# lib/guard-cat-bounds.sh through lib/bounds-common.sh.
set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/bounds-common.sh
. "$LIB/bounds-common.sh"
# shellcheck source=../lib/pilot-common.sh
. "$LIB/pilot-common.sh"

input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j '[(.tool_name // ""), (.session_id // "unknown"), (.agent_id // ""), (.agent_type // "" | tostring), (.transcript_path // ""), (.tool_input.file_path // ""), ((.tool_input.offset // "") | tostring), ((.tool_input.limit // "") | tostring)] | join("\u001f")' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r tool_name session_id agent_id agent_type transcript_path file_path has_offset has_limit <<<"$PARSED"

[ "$tool_name" = "Read" ] || exit 0
[ -n "$file_path" ] || exit 0
[ -f "$file_path" ] || exit 0

export HOOK_SESSION_ID="$session_id" HOOK_AGENT_ID="$agent_id" HOOK_FILE_PATH="$file_path"

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

if pilot_is_source "$file_path" && pilot_active "$agent_type" "$agent_id" "$transcript_path"; then
  deny "$(pilot_reason "$file_path")"
fi

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

reason=$(bounds_reason \
  "Unbounded Read on $file_path ($lines lines, ${bytes:-0} bytes > $BOUNDS_THRESHOLD lines / $BOUNDS_BYTES bytes). The whole file stays in context until the session ends." \
  "$file_path" \
  "Read the range you need around one of them" \
  "Locate the range first (grep -n), then Read with offset/limit." \
  "To read it whole on purpose: Read it with offset 1 and limit $lines — the explicit span, never the repetition.")

deny "$reason"
