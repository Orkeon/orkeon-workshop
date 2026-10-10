#!/bin/bash
# UserPromptSubmit and PreToolUse(Skill) hook — one /dev-implement batch per session.
#
# Adapted from claude-code-toolkit/hooks/implement-tdd-guard.sh (MIT, see THIRD-PARTY.md).
# A second batch launched without /clear pays the whole context of the first one on every
# turn. The skill says so at its entry, but a rule addressed to the model is read after the
# reads it was meant to prevent: this hook refuses the launch before.
#
# Detection reads the transcript, not a state file: `/dev-implement` prints its closing line
# `→ Batch F<n> complete — manual validation required.` once per closed batch, and nothing else
# prints it. Only assistant text counts, and `F<n>` must hold a digit, so the skill sources —
# which quote `F<n>` — never match. The toolkit's French wording and its effort check (fed by a
# statusline this harness does not have) are not brought.
#
# Lets through: a correction (`— correction:`, which reopens a closed batch by design), any other
# prompt or skill, and the identical launch issued a second time (escape hatch for a false
# positive: the first refusal drops a marker, the second launch consumes it — the convention of
# read-bounds.sh).
#
# Lot 11 (docs/profiles-design.md § 8.2). Switch: HARNESS_DEV_BATCH_GUARD, `0` in the managed
# settings.json env, `1` when the dev pack is active. Inert, empty, `{}` or not JSON: exit 0,
# no output.
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_DEV_BATCH_GUARD:-0}" = "1" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# One jq: event, prompt or skill and its args, session, transcript — fields separated by US.
PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then
    [(.hook_event_name // ""), (.tool_name // ""), (.tool_input.skill // ""),
     ((.prompt // .tool_input.args // "") | tostring | gsub("[\\n\\r\u001f]"; " ")),
     (.session_id // "nosession" | tostring), (.transcript_path // "" | tostring)] | join("\u001f")
  else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r event tool skill launch session transcript <<<"$PARSED"

case "$event" in
  UserPromptSubmit)
    printf '%s' "$launch" | grep -qE '^[[:space:]]*/dev-implement([[:space:]]|$)' || exit 0 ;;
  PreToolUse)
    [ "$tool" = "Skill" ] || exit 0
    case "$skill" in dev-implement|*:dev-implement) ;; *) exit 0 ;; esac ;;
  *) exit 0 ;;
esac

# A correction reopens the closed batch: that is its purpose. Only the skill's own marker
# `— correction:` counts, not the word (a plan under todo/corrections-x/ is a new batch).
printf '%s' "$launch" | grep -qF -- '— correction:' && exit 0

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0
# Cheap prefilter before paying jq on a long transcript.
grep -qE 'Batch F[0-9]+ complete' "$transcript" 2>/dev/null || exit 0

closed=$(jq -rRn '
  [ inputs | (try fromjson catch null) | objects
    | select(.type == "assistant")
    | (.message.content // []) | if type == "array" then .[] else empty end
    | objects | select(.type == "text") | .text // ""
    | scan("Batch (F[0-9]+) complete — manual validation required") | .[0]
  ] | last // ""' "$transcript" 2>/dev/null)
[ -n "$closed" ] || exit 0

next=$(printf '%s' "$launch" | grep -oE '\b[Ff][0-9]+\b' | head -n 1 | tr '[:lower:]' '[:upper:]')
safe_session=$(printf '%s' "$session" | tr -c 'A-Za-z0-9_-' '_' | cut -c1-80)
marker="/tmp/claude-devbatch-${safe_session}-${closed}-${next:-next}"
if [ -f "$marker" ]; then
  rm -f "$marker"
  exit 0
fi
: >"$marker" 2>/dev/null

reason="dev-batch-guard: batch ${closed} is already closed in this session — run /clear before batch ${next:-the next}.
A second batch would pay the context of the first on every turn. Read nothing, delegate nothing, write nothing; after /clear, launch /dev-implement ${next:-F<n>} again.
A false positive: issue the identical launch a second time and it goes through."

if [ "$event" = "PreToolUse" ]; then
  jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
fi
printf '%s\n' "$reason" >&2
exit 2
