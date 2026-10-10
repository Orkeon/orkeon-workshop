#!/bin/bash
# UserPromptSubmit hook — one line when the replayed context crosses a step.
#
# Pack `usage` (docs/profiles-design.md § 8.5). Adapted from claude-code-toolkit
# hooks/clear-nudge.sh (MIT, see THIRD-PARTY.md). Every turn resends the whole conversation, and
# nothing but `/clear` drops what it has piled up; the model cannot run `/clear`, the user can.
#
# The hook reads the `usage` of the last assistant message of the main chain in the transcript:
# input + cache creation + cache read is the size of the previous request, which the next turn
# replays. It speaks once each time that size crosses a step of 150 000 tokens (150k, 300k,
# 450k...), never twice for the same step of a session; after a compaction or a rewind brings it
# back under a step, crossing that step again speaks again. The step is fixed: one number the
# reader recognises, under the 200k tokens of prompt past which the API may bill a request at a
# premium rate (cc-usage, LONG_CONTEXT_THRESHOLD).
# The steps already said are kept per session in `.claude/local/clear-nudge.tsv` (its 32 newest
# sessions). The line, as additionalContext, starts with `clear-nudge:`.
#
# Advisory. Off unless HARNESS_CLEAR_NUDGE=1 (the pack `usage` writes it): inert, it reads
# nothing. Silent on an empty, `{}` or non-JSON payload, on another event, without a readable
# transcript, without jq, and below the first step.
set -uo pipefail

STEP=150000

[ "${HARNESS_CLEAR_NUDGE:-0}" = "1" ] || exit 0
input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

fields=$(printf '%s' "$input" | jq -r '
  if type == "object" and .hook_event_name == "UserPromptSubmit"
  then [ (.transcript_path // "" | tostring), (.session_id // "" | tostring) ] | join("\u001f")
  else empty end' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r transcript session <<<"$fields"
[ -n "${transcript:-}" ] && [ -f "$transcript" ] && [ -r "$transcript" ] || exit 0
case "${session:-}" in ''|*[!A-Za-z0-9_-]*) exit 0 ;; esac

# The tail is enough: one turn is a handful of lines. A subagent's turns are not the main chain.
ctx=$(tail -n 400 "$transcript" 2>/dev/null | jq -R -r '
  (try fromjson catch null)
  | select(type == "object" and .type == "assistant" and (.isSidechain // false) != true)
  | .message.usage // empty | select(type == "object")
  | ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))
  | floor' 2>/dev/null | tail -n 1)
case "$ctx" in ''|*[!0-9]*) exit 0 ;; esac
step=$((ctx / STEP))

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")
dir="$root/.claude/local"
state="$dir/clear-nudge.tsv"

last=0
if [ -f "$state" ] && [ ! -L "$state" ]; then
  last=$(awk -F'\t' -v s="$session" '$1 == s { v = $2 } END { print v + 0 }' "$state" 2>/dev/null)
fi
case "$last" in ''|*[!0-9]*) last=0 ;; esac
[ "$step" -eq "$last" ] && exit 0

# Remember the step, whether it rose or fell: a fall re-arms the steps above it.
if mkdir -p "$dir" 2>/dev/null && { [ ! -e "$state" ] || { [ -f "$state" ] && [ ! -L "$state" ]; }; }; then
  tmp="$state.$$.tmp"
  { [ -f "$state" ] && awk -F'\t' -v s="$session" '$1 != s' "$state" 2>/dev/null | tail -n 31
    printf '%s\t%s\n' "$session" "$step"; } >"$tmp" 2>/dev/null && mv -f "$tmp" "$state" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
fi
[ "$step" -gt "$last" ] || exit 0

msg="clear-nudge: about $((ctx / 1000))k tokens of context are replayed on every turn (usage of the last request). If the current task is finished, tell the user at the end of your answer that \`/clear\` with a short brief of where things stand costs less than carrying on. If it goes on, go on: this is only a number."
jq -cn --arg c "$msg" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
exit 0
