#!/bin/bash
# InstructionsLoaded hook — one line per instruction file that enters the context.
#
# Pack `usage` (docs/profiles-design.md § 8.5). Adapted from claude-code-toolkit
# hooks/context-log.sh (MIT, see THIRD-PARTY.md). Claude Code fires InstructionsLoaded at the
# start of a session and on every lazy load: the CLAUDE.md of a sub-folder, a rule whose `paths:`
# matched, an @-import, the reload after a compaction. Each payload names one file, and this hook
# appends one line to `.claude/local/context.log` of the workshop (or of the source checkout):
#
#   time  load_reason  memory_type  bytes  ~tokens (bytes / 4)  path  session (8)  agent (8)
#
# separated by tabs; the agent is empty on the main chain, and a path under the root is written
# relative to it. The log keeps at most 256 KiB: past that, its oldest half is dropped. Read it
# with `column -t -s $'\t' .claude/local/context.log`, or ask /token-usage, which sets it beside
# the `(startup)` tokens of `cc-usage --session`.
#
# It observes only: the exit code of this event is ignored. Off unless HARNESS_CONTEXT_LOG=1 (the
# pack `usage` writes it): inert, it reads nothing and writes nothing. Silent, and writes nothing,
# on an empty, `{}` or non-JSON payload, on one that names no file, without jq, and when the log
# is not a regular file (a folder, a symbolic link).
set -uo pipefail

[ "${HARNESS_CONTEXT_LOG:-0}" = "1" ] || exit 0
input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# reason, type, path, session, agent, separated by US (a tab would collapse an empty field);
# tabs and line breaks folded, so that one load is one line.
fields=$(printf '%s' "$input" | jq -r '
  def s: if type == "string" then gsub("[\t\r\n]"; " ") else "" end;
  if type == "object" then
    [ ((.load_reason // .reason) | s), (.memory_type | s), ((.file_path // .path) | s),
      (.session_id | s | .[0:8]), (.agent_id | s | .[0:8]) ] | join("\u001f")
  else empty end' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r reason kind path session agent <<<"$fields"
[ -n "${path:-}" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")

bytes=0
[ -f "$path" ] && bytes=$(wc -c <"$path" 2>/dev/null | tr -d ' ')
case "$bytes" in ''|*[!0-9]*) bytes=0 ;; esac
case "$path" in "$root"/*) path="${path#"$root"/}" ;; esac

dir="$root/.claude/local"
log="$dir/context.log"
mkdir -p "$dir" 2>/dev/null || exit 0
if [ -e "$log" ] || [ -L "$log" ]; then
  [ -f "$log" ] && [ ! -L "$log" ] || exit 0
fi
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "${reason:-?}" \
  "${kind:-?}" "$bytes" "$((bytes / 4))" "$path" "${session:-?}" "${agent:-}" >>"$log" 2>/dev/null || exit 0

# Bounded: past 256 KiB, keep the newest 128 KiB, from the first whole line.
size=$(wc -c <"$log" 2>/dev/null | tr -d ' ')
if [ "${size:-0}" -gt 262144 ] 2>/dev/null; then
  tmp="$log.$$.tmp"
  tail -c 131072 "$log" 2>/dev/null | sed 1d >"$tmp" 2>/dev/null && mv -f "$tmp" "$log" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
fi
exit 0
