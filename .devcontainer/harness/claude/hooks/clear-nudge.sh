#!/bin/bash
# UserPromptSubmit and PreToolUse(Agent) hook — one line when the replayed context crosses a step.
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
# Inside a subagent (plan E, 2026-10-12): a subagent receives no prompt of the user, and the
# payload's `transcript_path` is the main conversation's (V-31), so a UserPromptSubmit reading
# measures nothing of a `dev-batch` agent (D70). The hook is therefore wired on PreToolUse for the
# `Agent` tool too - the checkpoints of a batch, one before each delegation - and, when `agent_id`
# is set, reads the agent's own transcript `<dir>/<session_id>/subagents/agent-<agent_id>.jsonl`
# (derived as dev-batch-guard does; the path SubagentStop reports as `agent_transcript_path`),
# every assistant turn of it: there the turns carry `isSidechain: true` and are the chain measured.
# The step is remembered under `<session_id>:<agent_id>`, apart from the main conversation's. The
# line is the same figure with the agent's advice: no `/clear` exists there, the agent is asked to
# read nothing more that a role can read for it and to report the figure. A PreToolUse payload
# without `agent_id` (the main conversation delegating) is silent: UserPromptSubmit covers it.
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
  if type == "object" and (.hook_event_name == "UserPromptSubmit"
      or (.hook_event_name == "PreToolUse" and .tool_name == "Agent"))
  then [ .hook_event_name, (.transcript_path // "" | tostring), (.session_id // "" | tostring),
         (.agent_id // "" | tostring) ] | join("\u001f")
  else empty end' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r event transcript session agent <<<"$fields"
case "${session:-}" in ''|*[!A-Za-z0-9_-]*) exit 0 ;; esac
[ -n "${transcript:-}" ] || exit 0

# In a subagent, the agent's own transcript, beside the main one; its turns are all sidechain.
# A PreToolUse of the main conversation (no agent_id) is left to UserPromptSubmit.
sidechain_filter='and (.isSidechain // false) != true'
if [ -n "${agent:-}" ]; then
  case "$agent" in *[!A-Za-z0-9_-]*) exit 0 ;; esac
  transcript="$(dirname "$transcript")/$session/subagents/agent-$agent.jsonl"
  sidechain_filter=''
  key="$session:$agent"
else
  [ "$event" = "UserPromptSubmit" ] || exit 0
  key="$session"
fi
[ -f "$transcript" ] && [ -r "$transcript" ] || exit 0

# The tail is enough: one turn is a handful of lines. A subagent's turns are not the main chain.
ctx=$(tail -n 400 "$transcript" 2>/dev/null | jq -R -r "
  (try fromjson catch null)
  | select(type == \"object\" and .type == \"assistant\" $sidechain_filter)
  | .message.usage // empty | select(type == \"object\")
  | ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))
  | floor" 2>/dev/null | tail -n 1)
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
  last=$(awk -F'\t' -v s="$key" '$1 == s { v = $2 } END { print v + 0 }' "$state" 2>/dev/null)
fi
case "$last" in ''|*[!0-9]*) last=0 ;; esac
[ "$step" -eq "$last" ] && exit 0

# Remember the step, whether it rose or fell: a fall re-arms the steps above it.
if mkdir -p "$dir" 2>/dev/null && { [ ! -e "$state" ] || { [ -f "$state" ] && [ ! -L "$state" ]; }; }; then
  tmp="$state.$$.tmp"
  { [ -f "$state" ] && awk -F'\t' -v s="$key" '$1 != s' "$state" 2>/dev/null | tail -n 31
    printf '%s\t%s\n' "$key" "$step"; } >"$tmp" 2>/dev/null && mv -f "$tmp" "$state" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
fi
[ "$step" -gt "$last" ] || exit 0

if [ -n "${agent:-}" ]; then
  msg="clear-nudge: about $((ctx / 1000))k tokens of context are replayed on every turn of this agent (usage of its last request). There is no \`/clear\` here: read nothing more that a role can read for you, and carry the figure into the Notes of your report (\`context: >=$((ctx / 1000))k\`). Then go on: this is only a number."
else
  msg="clear-nudge: about $((ctx / 1000))k tokens of context are replayed on every turn (usage of the last request). If the current task is finished, tell the user at the end of your answer that \`/clear\` with a short brief of where things stand costs less than carrying on. If it goes on, go on: this is only a number."
fi
jq -cn --arg e "$event" --arg c "$msg" '{hookSpecificOutput: {hookEventName: $e, additionalContext: $c}}'
exit 0
