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
#
# D69: when HARNESS_WORK_DIR is set - by a repository pack (repo.yaml layout.work) or by the user -
# the line also names the work folder of the space (lib/team-common.sh, harness_work_dir): the folder
# asked when it exists in the root (`work folder <folder>/`), the main worktree's folder when the root
# is a linked worktree without it (a worktree checks no submodule out), else `todo/` and why - the
# folder asked is absent from the checkout, or the value is not a relative folder of it. Nothing is said when
# HARNESS_WORK_DIR is not set: the skills write under `todo/` as the rule source-space.md says.
#
# D70: in a linked worktree whose shared folders are links to the main checkout's (made by
# claude/scripts/worktree-create.sh, or by its --link), one more segment names them:
# `— shared: packages, node_modules -> <main>` - a restore run here fills the main checkout's folder.
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
else
  work_seg=""
  if [ -n "${HARNESS_WORK_DIR:-}" ]; then
    work=$(harness_work_dir "$root"); why=$?
    asked="${HARNESS_WORK_DIR//[$'\n\r\t']/ }"; asked="${asked:0:80}"
    case "$why" in
      0) [ "$work" != todo ] && work_seg=" — work folder \`$work/\` (HARNESS_WORK_DIR; the repository's own folder: git sees what is written there)" ;;
      1) work_seg=" — work folder \`todo/\`: HARNESS_WORK_DIR names \`$asked\`, absent from this checkout (a submodule not checked out?)" ;;
      3) work_seg=" — work folder \`$work/\` (HARNESS_WORK_DIR names \`$asked\`, absent from this linked worktree: the main worktree's folder applies; git sees what is written there)" ;;
      *) work_seg=" — work folder \`todo/\`: HARNESS_WORK_DIR (\`$asked\`) is not a relative folder of this checkout" ;;
    esac
  fi
  shared_seg=""
  if [ -f "$root/.git" ]; then
    main=$(git -C "$root" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')
    linked=""
    if [ -n "$main" ] && [ "$main" != "$root" ]; then
      while IFS= read -r l; do
        t=$(readlink -f "$l" 2>/dev/null) || continue
        case "$t/" in "$main"/*) linked="${linked:+$linked, }${l#"$root"/}" ;; esac
      done < <(find "$root" -mindepth 1 -maxdepth 3 -type l -not -path '*/.git/*' 2>/dev/null | sort)
    fi
    [ -z "$linked" ] || shared_seg=" — shared: $linked -> $main"
  fi
  work_seg="$work_seg$shared_seg"
  if [ -n "$packs" ]; then
    context="workshop-profile: $name (${packs// /, })$work_seg — /workshop-profile to change"
  else
    context="workshop-profile: $name$work_seg — /workshop-profile to change"
  fi
fi
jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
exit 0
