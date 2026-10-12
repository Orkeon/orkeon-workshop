#!/bin/bash
# PreCompact and SessionStart(compact) hook — the state of an open /dev-implement batch survives a
# compaction.
#
# D59. A batch of the dev chain runs for hours in one session: RED, GREEN, REFACTOR, COST per
# behaviour, each through a delegation. When the context is compacted half-way, the summary may
# keep the sheet or lose it, keep the cycles closed or not, and nothing says which delegations were
# made. The facts are deterministic, so a hook writes them:
#
#   PreCompact (trigger `auto` or `manual`): when the transcript holds a launch `/dev-implement F<n>`
#   typed by the user, with no closing line `→ Batch F<n> complete — manual validation required`
#   after it, and the sheet `<work>/<code>/<CODE>-PLAN-F<n>.md` is open, the state goes to
#   `<work>/<code>/<CODE>-STATE-F<n>.md` (an absolute path when the work folder is the main worktree's): the steps of the sheet with their `TDD:` line and the first
#   open one, the progress lines the skill printed (`→ Cycle …`, `### RED — …`), the delegations made
#   (agent and description, in order), `git status --short`. Rewritten at every compaction.
#
#   SessionStart with source `compact`: one line of `additionalContext`, `dev-compact: …`, that names
#   the batch, the sheet and the state file, and says to read it first and resume at the first open
#   step (/dev-implement § 1.4), never relaunching a delegation it lists.
#
# Claude Code documents no way for a PreCompact hook to reach the summary: the file is the channel,
# and the SessionStart hook the reader. `<work>` is the work folder of the space (D69): `todo/`, kept
# out of git by the harness (D51), unless HARNESS_WORK_DIR names a folder of the repository
# (lib/team-common.sh, harness_work_dir; Orkeon: backstage/tasks). Silent in
# any other case: no launch, a closed batch, no open sheet, a transcript that cannot be read, or a
# compaction inside a subagent (`agent_id` set: a dev-batch agent, D70, whose context ends with its
# batch and whose sheet the orchestrator writes). Switch
# HARNESS_DEV_COMPACT, `0` in the managed settings.json env, `1` when the dev pack is active (D52).
# Inert, empty, `{}` or not JSON: exit 0, no output. The literals — the file name, the context prefix
# — are in FROZEN-LITERALS.md.
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_DEV_COMPACT:-0}" = "1" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then
    [(.hook_event_name // ""), (.source // "" | tostring), (.trigger // "" | tostring),
     (.session_id // "nosession" | tostring), (.transcript_path // "" | tostring), (.agent_id // "" | tostring)] | join("\u001f")
  else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r event source trigger session transcript agent <<<"$PARSED"
[ -z "$agent" ] || exit 0
case "$event" in
  PreCompact) ;;
  SessionStart) [ "$source" = compact ] || exit 0 ;;
  *) exit 0 ;;
esac
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")
work=$(harness_work_dir "$root") || true
case "$work" in /*) workabs="$work" ;; *) workabs="$root/$work" ;; esac
[ -d "$workabs" ] || exit 0
grep -qF 'dev-implement' "$transcript" 2>/dev/null || exit 0

# One pass over the transcript: `L<TAB>F<n><TAB>rest` for a launch typed by the user, `C<TAB>F<n>`
# for a closing line printed by the assistant, `P<TAB>line` for a progress line, `D<TAB>agent — description`
# for a delegation. Only the text of the messages is read, in order.
lines=$(jq -rRn '
  def text: (.message.content // "") | if type == "array" then (map(select(type == "object" and .type == "text") | (.text // "")) | join("\n")) else tostring end;
  [ inputs | (try fromjson catch null) | objects | select(.type == "user" or .type == "assistant")
    | if .type == "user" then
        (text | capture("^[[:space:]]*/dev-implement[[:space:]]+(?<n>[Ff][0-9]+)(?<rest>[^\n]*)") // empty | "L\t" + (.n | ascii_upcase) + "\t" + .rest)
      else
        (text | scan("Batch (F[0-9]+) complete — manual validation required") | "C\t" + .[0]),
        (text | split("\n")[] | select(test("^(→ Cycle|### RED —|### GREEN —|→ Batch F)")) | "P\t" + .),
        ((.message.content // []) | if type == "array" then .[] else empty end | objects | select(.type == "tool_use" and .name == "Agent")
          | "D\t" + ((.input.subagent_type // "general-purpose") | tostring) + " — " + ((.input.description // "") | tostring | gsub("[\\n\\r]"; " ")))
      end
  ] | .[]' "$transcript" 2>/dev/null) || exit 0
[ -n "$lines" ] || exit 0

batch="" rest="" closed=false progress="" delegations="" k=0
while IFS=$'\t' read -r kind a b; do
  case "$kind" in
    L) batch="$a"; rest="${b:-}"; closed=false; progress=""; delegations=""; k=0 ;;
    C) [ "$a" = "$batch" ] && closed=true ;;
    P) [ -n "$batch" ] && progress="${progress}${a}"$'\n' ;;
    D) [ -n "$batch" ] && { k=$((k + 1)); delegations="${delegations}${k}. ${a}"$'\n'; } ;;
  esac
done <<<"$lines"
[ -n "$batch" ] && [ "$closed" != true ] || exit 0

# The sheet: the folder of the plan named in the launch first, else every <work>/*/; open, the newest.
folder=""
case "$rest" in *"$work"/*) folder="${rest#*"$work"/}"; folder="$work/${folder%%/*}" ;; esac
sheet=""
case "$folder" in ""|/*) ;; *) folder="$root/$folder" ;; esac
for candidate in $( { [ -n "$folder" ] && ls -t "$folder"/*-PLAN-"$batch".md 2>/dev/null; ls -t "$workabs"/*/*-PLAN-"$batch".md 2>/dev/null; } ); do
  [ -f "$candidate" ] || continue
  head -n 1 "$candidate" | grep -qF -- '— done' && continue
  sheet="$candidate"; break
done
[ -n "$sheet" ] || exit 0
dir="$(dirname "$sheet")"; code="$(basename "$sheet")"; code="${code%-PLAN-"$batch".md}"
state="$dir/$code-STATE-$batch.md"
rel_sheet="${sheet#"$root"/}"; rel_state="${state#"$root"/}"

if [ "$event" = "SessionStart" ]; then
  context="dev-compact: the context was compacted while batch $batch of \`$rel_sheet\` was in progress."
  if [ -f "$state" ]; then
    context="$context Read \`$rel_state\` first: the sheet's open steps, the cycles closed, the delegations made and the working tree at compaction are there. Never relaunch a delegation it lists; a report the summary lost is in the sheet's ticks or in the files, not to be redone."
  else
    context="$context Read the sheet first: resume at its first open step (/dev-implement § 1.4), and tick nothing that was not observed."
  fi
  jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
  exit 0
fi

# PreCompact: the state file.
steps=$(awk '
  /^### Step [0-9]+/ { label = $0; sub(/^### /, "", label) }
  /^Correction C[0-9]+ / { label = $0 }
  /^TDD: / { if (label != "") { printf "- %s: %s\n", label, $0; if ($0 ~ /\[ \]/ && first == "") first = label } }
  END { if (first != "") printf "\nFirst open: %s\n", first; else printf "\nNo open step: every TDD line is ticked.\n" }' "$sheet")
if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tree=$(git -C "$root" status --short 2>/dev/null | head -n 40)
  [ -n "$tree" ] || tree="(clean)"
else
  tree="(not a git repository)"
fi
stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp="$state.$$.tmp"
{
  printf '# %s-STATE-%s — written by dev-compact at %s (%s compaction, session %s)\n\n' "$code" "$batch" "$stamp" "${trigger:-unknown}" "$session"
  printf '> Read first after a compaction. The sheet is `%s`: resume at its first open step (/dev-implement § 1.4);\n> tick nothing that was not observed. Rewritten at every compaction, never committed by Claude Code.\n\n' "$rel_sheet"
  printf '## Steps of the sheet\n\n%s\n\n' "$steps"
  printf '## Progress printed by the batch (in order)\n\n%s\n' "${progress:-(none yet)}"
  printf '## Delegations made (in order — never relaunch one)\n\n%s\n' "${delegations:-(none yet)}"
  printf '## Working tree at compaction (`git status --short`, first 40 lines)\n\n```text\n%s\n```\n' "$tree"
} > "$tmp" 2>/dev/null && mv -f "$tmp" "$state" 2>/dev/null
rm -f "$tmp" 2>/dev/null
exit 0
