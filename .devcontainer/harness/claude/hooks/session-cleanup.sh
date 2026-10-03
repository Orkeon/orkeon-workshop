#!/bin/bash
# SessionStart hook — reset the per-session escape hatches, purge the leftovers.
#
# Adapted from claude-code-toolkit/hooks/session-cleanup.sh (MIT, see THIRD-PARTY.md).
# Two jobs, because a fresh session_id cannot collide but a resumed one can:
#   - drop this session's files (glob, so the per-agent suffixes go too)
#   - purge anything older than 2 days, since nothing else ever cleans /tmp
#
# PREFIXES is the list of every family the hooks write under /tmp/claude-<x>-:
# a hook that adds a state file adds its prefix here, or the file is never removed.
set -uo pipefail

sid=$(cat 2>/dev/null | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)
[ -n "$sid" ] || sid=unknown

PREFIXES="readbounds-seen catbounds-seen diffbounds-seen batching-nudge batching-tick delegation statuscheck"

DIRS="/tmp"
[ -n "${TMPDIR:-}" ] && [ "${TMPDIR%/}" != "/tmp" ] && DIRS="$DIRS ${TMPDIR%/}"

for dir in $DIRS; do
  for prefix in $PREFIXES; do
    rm -f "$dir/claude-${prefix}-$sid"* 2>/dev/null
  done
done

find_args=""
for prefix in $PREFIXES; do
  [ -n "$find_args" ] && find_args="$find_args -o"
  find_args="$find_args -name claude-${prefix}-*"
done
# shellcheck disable=SC2086
for dir in $DIRS; do
  find -H "$dir" -maxdepth 1 \( $find_args \) -mtime +2 -delete 2>/dev/null
done

exit 0
