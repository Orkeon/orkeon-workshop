#!/bin/bash
# PreToolUse Edit|Write|MultiEdit|NotebookEdit hook — an agent that is read-only by its charter
# writes its memory, and nothing else.
#
# D58. An agent whose charter gives it `memory:` is handed Read, Write and Edit by Claude Code so that
# it can keep its memory folder, `.claude/agent-memory/<agent>/` (project scope) — whatever the
# charter's `tools:` says. The charters of the auditors (`team-reviewer`, `dev-auditor`,
# `adversarial-reviewer`) list neither Write nor Edit: the memory is the one place they write, and
# this hook makes that deterministic. The rule is read in the charter, not kept here: an agent of
# `.claude/agents/<agent_type>.md` whose `tools:` line names neither Write, Edit, MultiEdit nor
# NotebookEdit may write under its memory folders only — `<root>/.claude/agent-memory/<agent>/`,
# `<root>/.claude/agent-memory-local/<agent>/`, `~/.claude/agent-memory/<agent>/` (the three scopes
# Claude Code documents). Anything else is refused, with the reason. The main thread (no
# `agent_type`), a built-in agent type (no charter) and a charter that has Write or Edit are not
# judged: guard-phase and secret-guard already stand there. A shell redirect is the charter's word,
# as for the other guards.
#
# Deterministic on the facts of 2026-10-10 (VERIFICATIONS.md V-24): an agent denied Write by
# `disallowedTools` wrote its memory through `cat >` in Bash, so the tools are not withheld any
# more; they are confined here instead. Switch HARNESS_MEMORY_SCOPE, `1` by default (a guard of
# `core`, on in every profile, silent for the main thread). The refusal starts with `memory-scope:`
# (FROZEN-LITERALS.md).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_MEMORY_SCOPE:-1}" = "0" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then
    [(.hook_event_name // ""), (.tool_name // ""), (.agent_type // "" | tostring),
     (.tool_input.file_path // .tool_input.notebook_path // "" | tostring | gsub("[\\n\\r\u001f]"; " ")),
     (.cwd // "" | tostring)] | join("\u001f")
  else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r event tool agent path cwd <<<"$PARSED"

[ "$event" = "PreToolUse" ] || exit 0
case "$tool" in Edit|Write|MultiEdit|NotebookEdit) ;; *) exit 0 ;; esac
[ -n "$agent" ] || exit 0                                # the main thread
case "$agent" in *[!A-Za-z0-9_-]*) exit 0 ;; esac       # not the name of a charter
[ -n "$path" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
charter=""
for dir in "${CLAUDE_PROJECT_DIR:-}/.claude/agents" "$HERE/../agents"; do
  [ -n "$dir" ] && [ -f "$dir/$agent.md" ] && { charter="$dir/$agent.md"; break; }
done
[ -n "$charter" ] || exit 0                              # a built-in type: no charter to read

# The front matter's `tools:` line. No line: every tool, the agent is not read-only.
tools=$(sed -n '2,/^---$/{s/^tools:[[:space:]]*//p}' "$charter" | head -n 1)
[ -n "$tools" ] || exit 0
case ",${tools// /}," in *,Write,*|*,Edit,*|*,MultiEdit,*|*,NotebookEdit,*) exit 0 ;; esac

# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
case "$path" in /*) abs="$path" ;; *) abs="${cwd:-$PWD}/$path" ;; esac
abs=$(harness_normalize_path "$abs")
root=$(harness_normalize_path "$(harness_workshop_root)")
home=$(harness_normalize_path "${HOME:-/home/node}")
for base in "$root/.claude/agent-memory/$agent" "$root/.claude/agent-memory-local/$agent" "$home/.claude/agent-memory/$agent"; do
  case "${abs,,}" in "${base,,}"/*) exit 0 ;; esac
done

reason="memory-scope: $agent is read-only by its charter (\`tools:\` without Write or Edit): the one place it writes is its memory, \`.claude/agent-memory/$agent/\`. Blocked: \`$path\`. A finding goes in your final message; the skill that called you writes the files."
jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
