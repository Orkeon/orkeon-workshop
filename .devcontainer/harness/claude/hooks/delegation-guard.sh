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

# S0 of the reading plan (2026-10-13): a batch of the dev chain runs in a `dev-batch` agent, never in
# a generic one. Measured over four runs: three general-purpose agents told to "implement the plan"
# lived 339 turns each, re-read the plan and the code whole and carried 70 % of everything read; the
# one dev-batch agent, 121 turns and two heavy reads. With the dev pack on (HARNESS_DEV_BATCH_GUARD=1),
# a generic agent whose prompt names `/dev-implement`, a batch sheet (`<CODE>-PLAN-F<n>.md`), the
# implementation of the plan file ("Implement … <CODE>-PLAN.md", the measured shape) or of a batch is
# refused and sent to /dev-batches. `Plan` keeps its planning prompts:
# only a prompt that names the implementation of a batch matches.
if [ "${HARNESS_DEV_BATCH_GUARD:-0}" = "1" ]; then
  case "$subagent" in
    general-purpose|Plan|claude|fork)
      if printf '%s' "$prompt" | grep -qiE '/dev-implement|-PLAN-F[0-9]+\.md|implement[^.]{0,80}-PLAN\.md|implement[^.]{0,60}batch F[0-9]+|batch F[0-9]+[^.]{0,60}implement'; then
        deny "delegation-guard: $subagent blocked — a batch of the dev chain runs in a dev-batch agent, never in a generic one (D70, S0). /dev-batches F<n> [F<m>…] launches each batch in its own worktree under its charter; inline: /dev-implement F<n> in this context, after /clear. A generic agent told to implement a batch reads the plan whole and the code with it, and pays every read again on each of its turns."
      fi ;;
  esac
fi

agent_file=""
for dir in "${CLAUDE_PROJECT_DIR:-}/.claude/agents" "$HERE/../agents"; do
  [ -n "$dir" ] && [ -f "$dir/$subagent.md" ] && { agent_file="$dir/$subagent.md"; break; }
done
# Not found: the harness source tree, where a pack's charters sit under packs/<pack>/claude/ before
# deployment (the evals run there); deployed, they are in .claude/agents/ like the others. Looked up
# last and only then: a glob costs on a slow mount.
if [ -z "$agent_file" ]; then
  for dir in "$HERE"/../../packs/*/claude/agents; do
    [ -f "$dir/$subagent.md" ] && { agent_file="$dir/$subagent.md"; break; }
  done
fi

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
# times the base. An inventory of `Explore` — the four `path:line` tables
# `/dev-plan` asks for, 60 lines; the concept table of `/dev-spec`, 30 — three
# times. A plan, a run summary, a set of judgements or the mechanical table of `dev-auditor-conformance`
# (D72, one row per check): twice. The report of a `dev-batch` agent
# (D70) carries a whole batch - the ticks with their evidence, the files, the verdict table, the
# test recap the orchestrator writes on the sheet: six times, like a review.
max_lines=${HARNESS_REPORT_MAX_LINES:-20}
case "$subagent" in
  team-reviewer|dev-batch) max_lines=$(( max_lines * 6 )) ;;
  Explore) max_lines=$(( max_lines * 3 )) ;;
  Plan|run-analyst|judge|dev-auditor-conformance) max_lines=$(( max_lines * 2 )) ;;
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
