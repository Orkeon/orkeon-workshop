#!/bin/bash
# /team-init — open the record of a team: its workbook and its tests, never its folder.
#
# Plan § 4.3, D29, D34, D35, D37. Creates, next to `teams/`:
#   workbooks/<slug>/STATUS.md                      phase need, gate_passed null, the track, iteration 0
#   workbooks/<slug>/decisions/DEC-0001-creation.md the creation, accepted
#   tests/<slug>/                                   empty, kept by a .gitkeep
# `teams/<slug>/` comes with the first build batch (D35): the format and the mount
# points are decided at need and design, and `orkeon-bench scaffold` needs a crew.
# With --adopt the team folder already exists (a prototype, D34) and is left as it is.
#
# Usage: team-init.sh [--adopt] [--light] <slug>
# Exit 0 created · 1 refused (already there, nothing to adopt) · 2 usage or not a workshop.
# Writes nothing on a refusal, removes what it created — and only that — when a later step
# fails, and never overwrites or removes a file that was there. STATUS.md is the template (.claude/templates/STATUS.md) with its
# placeholders filled; DEC-0001 is written here in the shape of templates/DECISION.md (an
# eval compares the headings); the journal line of STATUS.md is a frozen literal
# (FROZEN-LITERALS.md). The workshop is $ORKEON_WORKSHOP, else the project Claude Code
# opened, else the working directory when it holds teams/, else ~/Orkeon.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$HERE/../../.." && pwd)"
# shellcheck source=../../../lib/team-common.sh
. "$CLAUDE_DIR/lib/team-common.sh"

usage() { echo "Usage: team-init.sh [--adopt] [--light] <slug>" >&2; exit 2; }
refuse() { echo "team-init: $1" >&2; exit 1; }

adopt=0
track=full
slug=""
for a in "$@"; do
  case "$a" in
    --adopt) adopt=1 ;;
    --light) track=light ;;
    -h|--help) usage ;;
    -*) echo "team-init: unknown option $a" >&2; usage ;;
    *) [ -z "$slug" ] || { echo "team-init: one slug at a time (got \`$slug\` and \`$a\`)" >&2; usage; }
       slug="$a" ;;
  esac
done
[ -n "$slug" ] || usage
# The pattern of the bench (bench/src/domain/team-ref.ts): kebab-case, ASCII, 63 characters at most.
if ! [[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "team-init: \`$slug\` is not a team slug: lower-case letters, digits and hyphens, starting with a letter or a digit, 63 characters at most (mail-triage)." >&2
  exit 2
fi

if [ -z "${ORKEON_WORKSHOP:-}" ] && [ -z "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$PWD/teams" ]; then
  root=$(harness_normalize_path "$PWD")
else
  root=$(harness_normalize_path "$(harness_workshop_root)")
fi
if [ ! -d "$root" ] || { [ ! -d "$root/teams" ] && [ ! -d "$root/.claude" ]; }; then
  echo "team-init: \`$root\` is not a workshop (no teams/ and no .claude/ there). Run it from the workshop, or set ORKEON_WORKSHOP." >&2
  exit 2
fi

team="$root/teams/$slug"
workbook="$root/workbooks/$slug"
tests="$root/tests/$slug"
status_tpl="$CLAUDE_DIR/templates/STATUS.md"
decision_tpl="$CLAUDE_DIR/templates/DECISION.md"
for f in "$status_tpl" "$decision_tpl"; do
  [ -f "$f" ] || { echo "team-init: template missing: $f" >&2; exit 2; }
done

# A file or a link that bears the slug where a folder is expected is the user's: refused, never removed.
for kind in workbooks tests; do
  f="$root/$kind/$slug"
  if { [ -e "$f" ] || [ -L "$f" ]; } && { [ ! -d "$f" ] || [ -L "$f" ]; }; then
    refuse "\`$kind/$slug\` exists and is not a folder: nothing is overwritten. Move it aside, or choose another slug."
  fi
done
if [ -e "$workbook/STATUS.md" ]; then
  refuse "\`workbooks/$slug/STATUS.md\` exists: the team \`$slug\` is already in the method. /team-status $slug says where it stands."
fi
if [ -d "$workbook" ] && [ -n "$(ls -A "$workbook" 2>/dev/null)" ]; then
  refuse "\`workbooks/$slug/\` exists and is not empty, without a STATUS.md: nothing is overwritten. Move its files aside, or choose another slug."
fi
if [ "$adopt" -eq 1 ]; then
  [ -d "$team/crew" ] || refuse "--adopt brings an existing prototype into the method, and \`teams/$slug/crew/\` does not exist. Without --adopt, /team-init $slug opens a new team; its folder comes with the first build (D35)."
elif [ -e "$team" ]; then
  refuse "\`teams/$slug/\` already exists: a prototype enters the method with \`/team-init --adopt $slug\` (its crew is kept as the starting point of the build, D34). For a new team, choose another slug."
fi

now_iso=$(date +%Y-%m-%dT%H:%M:%S%:z)
now_date=$(date +%Y-%m-%d)
now_time=$(date +%H:%M)
# "mail-triage" -> "Mail triage"
title="${slug//-/ }"
title="${title^}"

# Everything this run creates — and only that — is removed when a later step fails: the files
# it wrote, then the folders it made, a folder that was there before staying where it was.
made_files=(); made_dirs=()
make_dir() {
  [ -d "$1" ] && return 0
  [ -d "$(dirname "$1")" ] || make_dir "$(dirname "$1")" || return 1
  mkdir "$1" 2>/dev/null || return 1
  made_dirs+=("$1")
}
undo() {
  local i
  for f in ${made_files[@]+"${made_files[@]}"}; do rm -f "$f"; done
  for (( i=${#made_dirs[@]}-1; i>=0; i-- )); do rmdir "${made_dirs[$i]}" 2>/dev/null; done
  echo "team-init: $1 — what this run had created was removed." >&2
  exit 2
}
make_dir "$workbook/decisions" || undo "cannot create workbooks/$slug/ under $root"
make_dir "$tests" || undo "cannot create tests/$slug/ under $root"

# The values hold no `&`, `\` or `|`: a slug, a date, a time.
sed -e "s|{{UPDATED_AT}}|$now_iso|" -e "s|{{TEAM_TITLE}}|$title|" \
    -e "s|{{DATE}}|$now_date|" -e "s|{{TIME}}|$now_time|" \
    -e "s|^track: full\$|track: $track|" \
    -e "s|^next_action: /team-need\$|next_action: /team-need $slug|" "$status_tpl" > "$workbook/STATUS.md" \
  && grep -q '^phase: need$' "$workbook/STATUS.md" || { made_files+=("$workbook/STATUS.md"); undo "cannot write workbooks/$slug/STATUS.md"; }
made_files+=("$workbook/STATUS.md")
if [ "$adopt" -eq 1 ]; then
  printf -- '- %s %s — /team-init — prototype teams/%s/ adopted: its crew is the starting point of the build (D34)\n' "$now_date" "$now_time" "$slug" >> "$workbook/STATUS.md"
fi

if [ "$adopt" -eq 1 ]; then
  context="The folder \`teams/$slug/\` holds a prototype: a generator wrote the team at once, and nothing proves it yet (D34)."
  decision="Bring the team \`$slug\` into the method on the $track track, adopting the prototype: its crew is kept as the starting point of the build, and its README is the first draft of \`NEED.md\`."
  alternatives="Keeping the prototype outside the method: nothing would prove it, and no change of it would be recorded."
else
  context="No team \`$slug\` exists yet. The request that led to it is recorded by \`/team-need\`, in \`NEED.md\`."
  decision="Create the team \`$slug\` with the method, on the $track track: the need, the acceptance criteria and the tests come before the team folder, which the first build batch creates (D35)."
  alternatives="None."
fi

dec="$workbook/decisions/DEC-0001-creation.md"
{
  printf '# DEC-0001 — Creation of the team %s\n\n' "$slug"
  printf -- '- Date: %s\n- Requested by: the user\n- Phase: need\n\n' "$now_date"
  printf '## Context\n\n%s\n\n' "$context"
  printf '## Decision\n\n%s\n\n' "$decision"
  printf '## Alternatives considered\n\n%s\n\n' "$alternatives"
  printf '## Impact\n\n'
  printf '| Artefact to revise | Resume from | Attempt opened |\n|---|---|---|\n'
  printf '| `NEED.md` (to write) | step 1, `/team-need` | none |\n\n'
  printf '## Status\n\naccepted\n'
} > "$dec" || { made_files+=("$dec"); undo "cannot write workbooks/$slug/decisions/DEC-0001-creation.md"; }

tests_note=""
if [ -n "$(ls -A "$tests" 2>/dev/null)" ]; then
  tests_note=" — already there with files, kept as they are: /team-tests will sort them"
else
  : > "$tests/.gitkeep"
fi

echo "team-init: workbooks/$slug/STATUS.md — phase need, gate_passed null, track $track, iteration 0"
echo "team-init: workbooks/$slug/decisions/DEC-0001-creation.md — accepted"
echo "team-init: tests/$slug/$tests_note"
if [ "$adopt" -eq 1 ]; then
  echo "team-init: teams/$slug/ adopted as it is; its crew stays frozen until the build (guard-phase), a change goes through /team-decision"
else
  echo "team-init: teams/$slug/ is not created: it comes with the first build batch (D35)"
fi
echo "team-init: next — /team-need $slug"
