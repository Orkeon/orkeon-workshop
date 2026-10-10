#!/bin/bash
# SessionStart hook — tell the session which profile of the harness this space runs.
#
# Lot 11, docs/profiles-design.md § 7, D50. A space names its profile in `.claude/local/profile`
# (one line: `dev`, `custom:<pack>,<pack>`), which `/workshop-profile` writes; without that file
# the container variable HARNESS_PROFILE applies, else `user`. On `user` nothing is said: a
# workshop that never chose a profile starts exactly as before (Δ = 0). Any other profile is one
# line of context, `workshop-profile: <profile> (<packs>) — /workshop-profile to change`, the
# effective packs read from `workshop-profile.py --resolve`. A file that does not hold a profile
# name — something else written by hand, a folder, a symbolic link — is said in one line and
# `user` applies; what it holds is never repeated (lib/team-common.sh, harness_workshop_profile).
#
# Runs for `startup` and `clear` only: after `resume` the line is in the transcript already, and
# after `compact` the profile still decides which files are there, whatever the summary kept.
# HARNESS_WORKSHOP_PROFILE=0 disables it. The context starts with `workshop-profile:` (a frozen
# literal, FROZEN-LITERALS.md).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_WORKSHOP_PROFILE:-1}" = "0" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then [(.hook_event_name // ""), (.source // "")] | join("\u001f") else "" end' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r event source <<<"$PARSED"
[ "$event" = "SessionStart" ] || exit 0
case "$source" in startup|clear) ;; *) exit 0 ;; esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")

name=$(harness_workshop_profile "$root"); state=$?
if [ "$state" -eq 1 ]; then
  name="${HARNESS_PROFILE:-}"
  name="${name//[$' \t\r']/}"
  [ -n "$name" ] || exit 0
  harness_profile_name_ok "$name" || state=2
fi
if [ "$state" -eq 2 ]; then
  context="workshop-profile: \`.claude/local/profile\` does not hold a profile name: it is ignored and the profile user applies. Tell the user in one line; \`/workshop-profile --list\` shows the profiles."
  jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
  exit 0
fi
[ "$name" = "user" ] && exit 0

packs="" note="" refused=""
tool="$HERE/../skills/workshop-profile/scripts/workshop-profile.py"
if [ -f "$tool" ] && command -v python3 >/dev/null 2>&1; then
  while IFS= read -r line; do
    case "$line" in
      "packs "*)   packs="${line#packs }" ;;
      "note "*)    note="${line#note }" ;;
      "refused "*) refused="${line#refused }" ;;
    esac
  done < <(ORKEON_WORKSHOP="$root" timeout 10 python3 "$tool" --resolve 2>/dev/null)
fi
if [ -n "$refused" ] || [ -n "$note" ]; then
  context="workshop-profile: the profile $name does not apply in this space, and $( [ -n "$note" ] && printf 'user applies' || printf 'nothing of the harness was deployed for it' ). Tell the user in one line; \`/workshop-profile --list\` shows what fits here."
elif [ -n "$packs" ]; then
  context="workshop-profile: $name (${packs// /, }) — /workshop-profile to change"
else
  context="workshop-profile: $name — /workshop-profile to change"
fi
jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
exit 0
