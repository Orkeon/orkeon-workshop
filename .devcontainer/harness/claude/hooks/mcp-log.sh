#!/bin/bash
# PreToolUse hook (matcher mcp__orkeon__.*) — one line per call Claude Code makes to a tool of the
# Orkeon MCP server (D112).
#
# The guards of the harness see Claude Code's own tools (Bash, Read, Edit, Write, Agent), not those
# an MCP server serves: this hook does not guard them either, it keeps a trace. Each call appends one
# line to `.claude/local/mcp-calls.tsv` of the workshop (or of the source checkout):
#
#   time (UTC, ISO 8601)  session  agent type, or `main`  tool, without the mcp__orkeon__ prefix
#
# separated by tabs. Nothing of `tool_input` is written: an argument may hold a path or a text the
# user did not mean to keep. The log keeps at most 256 KiB: past that, its oldest half is dropped.
# Read it with `column -t -s $'\t' .claude/local/mcp-calls.tsv`.
#
# It never blocks and never prints: no stdout, no stderr, exit 0 whatever happens. On by default
# (HARNESS_MCP_LOG=1 in settings.json); HARNESS_MCP_LOG=0 turns it off: inert, it reads nothing and
# writes nothing. Silent, and writes nothing, on an empty or non-JSON payload, on a tool of another
# server or of Claude Code, without jq, when the folder cannot be written and when the log is not a
# regular file (a folder, a symbolic link).
set -uo pipefail
exec 2>/dev/null

[ "${HARNESS_MCP_LOG:-1}" = "0" ] && exit 0
input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# tool, session, agent type, separated by US (a tab would collapse an empty field); tabs and
# line breaks folded, so that one call is one line.
fields=$(printf '%s' "$input" | jq -r '
  def s: if type == "string" then gsub("[\t\r\n\u001f]"; " ") else "" end;
  if type == "object" then [ (.tool_name | s), (.session_id | s), (.agent_type | s) ] | join("\u001f")
  else empty end') || exit 0
IFS=$'\x1f' read -r tool session agent <<<"$fields"
case "${tool:-}" in mcp__orkeon__?*) tool=${tool#mcp__orkeon__} ;; *) exit 0 ;; esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh" || exit 0
root=$(harness_normalize_path "$(harness_workshop_root)")

dir="$root/.claude/local"
log="$dir/mcp-calls.tsv"
mkdir -p "$dir" || exit 0
if [ -e "$log" ] || [ -L "$log" ]; then
  [ -f "$log" ] && [ ! -L "$log" ] || exit 0
fi
{ printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${session:-?}" "${agent:-main}" "$tool" >>"$log"; } || exit 0

# Bounded: past 256 KiB, keep the newest 128 KiB, from the first whole line.
size=$(wc -c <"$log" | tr -d ' ')
if [ "${size:-0}" -gt 262144 ]; then
  tmp="$log.$$.tmp"
  tail -c 131072 "$log" | sed 1d >"$tmp" && mv -f "$tmp" "$log"
  rm -f "$tmp"
fi
exit 0
