#!/bin/bash
# PreToolUse Agent hook — delegation guard for every subagent spawn.
#
# Adapted from claude-code-toolkit/hooks/explore-guard.sh (MIT, see THIRD-PARTY.md).
# Two checks, in cost order, then a graft:
#
#   1. every Agent call carries a `description` — a delegation with no name is a
#      delegation that was never scoped;
#   2. the model is chosen, never inherited — an omitted parameter silently
#      inherits the parent model. A custom agent whose charter pins `model:`
#      needs no parameter (the frontmatter wins); `fork` inherits by design.
#      Any explicit model passes; set HARNESS_EXPLORE_MODEL (for instance
#      `haiku`) to pin the model of the read-only `Explore` agent.
#
# When both pass, the report contract (`## DONE` / `## BLOCKED`, fields per
# FROZEN-LITERALS.md, line cap) is appended to `tool_input.prompt` through
# `updatedInput`: `additionalContext` would land in the caller's context, only
# the prompt reaches the agent being spawned. The agent's final report is
# re-injected whole into the main conversation, so the contract is what stands
# between a 20-line report and a pasted run log. hooks/subagent-report-shape.sh
# checks the other side of the same contract.
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# One jq for the whole payload: fields separated by US (\x1f), the prompt behind
# an RS (\x1e) because it may hold anything, newlines included.
PARSED=$(printf '%s' "$input" | jq -j '([(.tool_name // ""), (.session_id // "unknown"), (.agent_id // ""), ((.tool_input.description // "") | gsub("[\\n\\r]"; " ")), (.tool_input.subagent_type // ""), (.tool_input.model // "")] | join("\u001f")) + "\u001e" + (.tool_input.prompt // "")' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r tool_name session_id agent_id description subagent model <<<"${PARSED%%$'\x1e'*}"
prompt="${PARSED#*$'\x1e'}"

[ "$tool_name" = "Agent" ] || exit 0

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../lib"

[ -n "$description" ] || deny "delegation-guard: Agent spawn blocked — every Agent call carries a description (HARNESS.md, rules of engagement). A delegation with no name is a delegation that was never scoped."

# A scoped spawn is a delegation: restart the window lib/delegation-nudge.sh
# counts direct reads in.
[ -f "$LIB/delegation-nudge.sh" ] && HOOK_SESSION_ID="$session_id" HOOK_AGENT_ID="$agent_id" bash "$LIB/delegation-nudge.sh" reset

# An Agent call that omits subagent_type starts general-purpose.
[ -n "$subagent" ] || subagent="general-purpose"

agent_file=""
for dir in "${CLAUDE_PROJECT_DIR:-}/.claude/agents" "$HERE/../agents"; do
  [ -n "$dir" ] && [ -f "$dir/$subagent.md" ] && { agent_file="$dir/$subagent.md"; break; }
done

explore_model="${HARNESS_EXPLORE_MODEL:-}"
case "$subagent" in
  fork) ;;  # inherits the caller's model by design; a model override is ignored
  Explore)
    if [ -n "$explore_model" ]; then
      [ "$model" = "$explore_model" ] || deny "delegation-guard: Explore blocked — pass model: \"$explore_model\" (HARNESS_EXPLORE_MODEL pins the model of read-only searches). Without the parameter the agent inherits the parent model."
    else
      [ -n "$model" ] || deny "delegation-guard: Explore blocked — pass an explicit model (\"haiku\" is the right one for a read-only search). Without the parameter the agent inherits the parent model."
    fi ;;
  general-purpose|Plan|claude)
    [ -n "$model" ] || deny "delegation-guard: $subagent blocked — pass an explicit model: \"haiku\" for a read-only search, \"sonnet\" or the default model for writing. Without the parameter the agent inherits the parent model." ;;
  *)
    if [ -z "$model" ]; then
      if [ -n "$agent_file" ] && grep -qE '^model:[[:space:]]*[^[:space:]]' "$agent_file" 2>/dev/null; then
        :  # the charter pins the model
      else
        deny "delegation-guard: $subagent blocked — pass an explicit model, or pin \`model:\` in .claude/agents/$subagent.md. Without either the agent inherits the parent model."
      fi
    fi ;;
esac

# Idempotent: a retried spawn must not stack the contract twice.
case "$prompt" in
  *"Report contract (delegation-guard)"*) exit 0 ;;
esac

# The cap is on the whole final message. A review carries its verdict, its gap
# table and its fix plan in that message (the skill writes the files): six
# times the base. A plan, a run summary or a set of judgements: twice.
max_lines=${HARNESS_REPORT_MAX_LINES:-20}
case "$subagent" in
  team-reviewer) max_lines=$(( max_lines * 6 )) ;;
  Plan|run-analyst|judge) max_lines=$(( max_lines * 2 )) ;;
esac

contract=$(printf '%s\n' \
  '--- Report contract (delegation-guard) ---' \
  "End your final message with exactly one of the two reports below and nothing after it. Hard cap: $max_lines lines for the whole message — no raw log, no pasted build or run output, no code excerpt that was not asked for, no restating of the prompt. Paths, ids, commands and error messages verbatim, in backticks. English." \
  '## DONE' \
  '- Files: <paths created or modified, or `none`>' \
  '- Ids covered: <AC-/IND-/INV-/J- ids this work serves, or `none`>' \
  '- Command: `<last verification command>` — exit N  (or `none`)' \
  '- Notes: <deviations, defaults chosen, what was left out; `none` if nothing>' \
  '## BLOCKED' \
  '- Reason: <what cannot be done without breaking your charter>' \
  '- Missing: <the path, id, decision or contract element that is missing>' \
  '- Next: <what the orchestrator must decide or provide>' \
  'Never work around a block: no test weakened, no file outside your scope, no invented path. Your final report is re-injected whole into the main conversation; everything it carries is paid for there.')

printf '%s' "$input" | jq -c --arg c "$contract" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "delegation-guard: report contract appended", updatedInput: (.tool_input | .prompt = ((.prompt // "") + "\n\n" + $c))}}'
exit 0
