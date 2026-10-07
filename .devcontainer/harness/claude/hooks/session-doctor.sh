#!/bin/bash
# SessionStart hook — say at the start of a session what `orkeon-bench doctor` finds wrong.
#
# Plan § 7.3, § 7.5 (lot 2). `orkeon-bench doctor -q` prints the failing checks only,
# one line each on stderr (orkeon and its tool catalogue, esbuild, PyYAML, Ollama, the LLM concurrency limit,
# the typings, the workshop layout, stray settings files, the references against the
# installed Orkeon) and exits non-zero when one fails. A hook that exits non-zero shows
# its error to the user and tells the model nothing, so this wrapper always exits 0 and
# hands the failing lines to the model through `additionalContext`: the session starts
# knowing what is broken, and says so before building on it.
#
# Silent when every check passes, when `orkeon-bench` is not installed, when the doctor
# does not answer in time, and after a compaction (the session already knows). Runs for
# `startup`, `resume` and `clear`. HARNESS_SESSION_DOCTOR=0 disables it;
# HARNESS_SESSION_DOCTOR_TIMEOUT is the time it may take, in seconds (20).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_SESSION_DOCTOR:-1}" = "0" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v orkeon-bench >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then [(.hook_event_name // ""), (.source // "")] | join("\u001f") else "" end' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r event source <<<"$PARSED"
[ "$event" = "SessionStart" ] || exit 0
[ "$source" = "compact" ] && exit 0

limit="${HARNESS_SESSION_DOCTOR_TIMEOUT:-20}"
# Whole seconds, 1 or more: `timeout 0` would mean no limit at all.
case "$limit" in ''|*[!0-9]*) limit=20 ;; esac
[ "$limit" -ge 1 ] 2>/dev/null || limit=20

if command -v timeout >/dev/null 2>&1; then
  out=$(timeout "$limit" orkeon-bench doctor -q 2>&1); rc=$?
else
  out=$(orkeon-bench doctor -q 2>&1); rc=$?
fi
# 124: the doctor did not answer in time — say nothing rather than half a diagnosis.
[ "$rc" -eq 124 ] && exit 0
[ "$rc" -ne 0 ] || exit 0
# The check lines only: whatever else reached stderr (a locale warning of the shell) is noise.
printf '%s' "$out" | grep -q '^FAIL ' || exit 0

context="session-doctor: \`orkeon-bench doctor\` reports failing checks in this workshop. Tell the user in one or two lines before relying on what they cover, and fix what is yours to fix (\`orkeon-bench doctor\` prints every check, with the way to fix it):
$(printf '%s' "$out" | grep '^FAIL ' | head -n 20)"
jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
exit 0
