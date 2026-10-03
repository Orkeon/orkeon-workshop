#!/bin/bash
# bash-dispatch module — require a bounded diff.
#
# Adapted from claude-code-toolkit/lib/guard-diff-bounds.sh (MIT, see THIRD-PARTY.md).
# rtk compresses build and test output well, but not a patch: a bare `git diff`
# on a working tree of the day was measured at 109 kB, ~27k tokens carried by
# every later turn of the session.
#
# What it denies: `git diff`, `git show`, `git log -p` when nothing bounds the
# output — no summary flag, no pipe, no redirect — AND the patch is actually
# large. The size is measured, not guessed: the same command is re-run with
# `--numstat` (one `added<TAB>removed<TAB>path` line per file, no patch body).
#
# What passes: `--stat`, `--numstat`, `--shortstat`, `--name-only`,
# `--name-status`, `--quiet`, anything piped or redirected, a patch under the
# threshold, and a second identical command from the same agent (the forcing).
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0

case "$cmd" in *git*) ;; *) exit 0 ;; esac
case "$cmd" in *"|"*|*">"*) exit 0 ;; esac

THRESHOLD=${HARNESS_DIFF_BOUNDS_LINES:-400}

hit=""
hit_lines=""
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"
  case "$seg" in
    git\ *) ;;
    *) continue ;;
  esac

  sub=$(printf '%s' "$seg" | awk '{for (i=2; i<=NF; i++) if ($i !~ /^-/) {print $i; exit}}')
  case "$sub" in
    diff|show|log) ;;
    *) continue ;;
  esac
  if [ "$sub" = "log" ]; then
    case " $seg " in *" -p "*|*" --patch "*|*" -u "*) ;; *) continue ;; esac
  fi

  case " $seg " in
    *" --stat"*|*" --numstat"*|*" --shortstat"*|*" --name-only"*|*" --name-status"*|*" --quiet"*) continue ;;
  esac

  # LC_ALL=C: a patch is bytes, not text, and some awks abort on the first
  # invalid multibyte sequence of a binary file, reading an empty sum as small.
  changed=$(bash -c "$seg --numstat --no-color" 2>/dev/null \
    | LC_ALL=C awk -F'\t' '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {n += $1 + $2} END {print n + 0}')
  [ "${changed:-0}" -gt "$THRESHOLD" ] || continue

  hit="$seg"
  hit_lines="$changed"
  break
done <<< "$(printf '%s' "$cmd" | tr ';&' '\n\n')"

[ -n "$hit" ] || exit 0

seen_file="/tmp/claude-diffbounds-seen-${HOOK_SESSION_ID:-unknown}${HOOK_AGENT_ID:+-$HOOK_AGENT_ID}"
if [ -f "$seen_file" ] && grep -Fxq "$hit" "$seen_file" 2>/dev/null; then
  echo "$hit" >> "${seen_file}.forced"
  exit 0
fi
echo "$hit" >> "$seen_file"

reason="Unbounded patch: \`$hit\` prints ${hit_lines} changed lines (> $THRESHOLD). The whole patch stays in context until the session ends, and rtk does not compress it. Start with \`--stat\` or \`--name-only\`, then read the patch of the files that matter — \`$hit -- <path>\` — or pipe it. Re-issue this exact command to force the full patch."

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
