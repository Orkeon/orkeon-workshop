#!/bin/bash
# PreCompact and SessionStart hook — the state of an open /dev-implement batch, or of a /dev-batches
# run, survives a compaction; the open batches of a /dev-batches run survive a restart.
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
#   The orchestrator of /dev-batches (D70, 2026-10-14): when the last launch the user typed is
#   `/dev-batches …`, the hook writes `<work>/<code>/<CODE>-BATCHES-STATE.md` instead — the launches
#   typed, then one row per batch: its `dev-batch` launches (`description: batch F<n>`, or the
#   `name: batch-F<n>` of an older harness), the background-task
#   notification of its agent (`<task-notification>`, status and verdict), the relay line
#   `### F<n> — VALID | GAPS — … merged | not merged` printed after it, and what follows: `running`,
#   `merged`, `returned, not merged`, `returned, relayed`, `returned, not relayed`, `stopped (<status>)`.
#   `<code>`/`<CODE>` come from the plan `<CODE>-PLAN.md` the launch names, else from the one plan the
#   launches' `sheet:` paths name. The SessionStart line names that file, says to read it first and
#   never to relaunch a batch it lists as running or merged. The `## Log` the orchestrator appends to that
#   file as it goes (/dev-batches § 2, 2026-10-18) is kept as it is, below the table: never rewritten.
#
#   SessionStart with source `startup` or `resume` (D82, 2026-10-18): a restart loses the background agents
#   of the previous process, not their worktrees. Each `<work>/*/*-BATCHES-STATE.md` written in the last
#   seven days whose `## Log` leaves a batch open — its last line `- <date> <time> F<n> launched` or
#   `relaunched`, no `- <date> <time> closed` after — gives one line of `additionalContext`: preflight.sh
#   again, then the resume of the open batches from their checkpoints (closing.md §§ 8-9), done without a
#   question under HARNESS_AUTO_RESUME=1 (the user's standing yes), asked once under 0, the default.
#
#   A launch is the user's message `/dev-<skill> …`, or the form a typed slash command takes in the
#   transcript (`<command-name>/dev-<skill></command-name>` … `<command-args>…</command-args>`, seen
#   2026-10-14; the launch of an inline batch is read in both forms too).
#
# Claude Code documents no way for a PreCompact hook to reach the summary: the file is the channel,
# and the SessionStart hook the reader. `<work>` is the work folder of the space (D69): `todo/`, kept
# out of git by the harness (D51), unless HARNESS_WORK_DIR names a folder of the repository
# (lib/team-common.sh, harness_work_dir; Orkeon: backstage/tasks). Silent in
# any other case: no launch, a closed batch, no open sheet, no plan for /dev-batches, a transcript that cannot be read, or a
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
  SessionStart) case "$source" in compact|startup|resume) ;; *) exit 0 ;; esac ;;
  *) exit 0 ;;
esac
if [ "$event" = SessionStart ] && [ "$source" != compact ]; then
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=../lib/team-common.sh
  . "$HERE/../lib/team-common.sh"
  root=$(harness_normalize_path "$(harness_workshop_root)")
  work=$(harness_work_dir "$root") || true
  case "$work" in /*) workabs="$work" ;; *) workabs="$root/$work" ;; esac
  [ -d "$workabs" ] || exit 0
  found=""
  while IFS= read -r st; do
    [ -f "$st" ] || continue
    open=$(awk '
      /^- [0-9-]+ [0-9:]+ closed[[:space:]]*$/ { delete last; n = 0; next }
      match($0, /^- [0-9-]+ [0-9:]+ F[0-9]+ (launched|relaunched|returned|merged|stopped)/) {
        split($0, w, " "); f = w[4]; e = w[5]
        if (!(f in last)) ord[++n] = f
        last[f] = e
      }
      END { for (i = 1; i <= n; i++) { f = ord[i]; if ((f in last) && (last[f] == "launched" || last[f] == "relaunched")) printf "%s ", f } }' "$st" 2>/dev/null)
    [ -n "$open" ] || continue
    found="$found\`${st#"$root"/}\`: ${open% }; "
  done < <(find "$workabs" -mindepth 2 -maxdepth 2 -name '*-BATCHES-STATE.md' -mtime -7 2>/dev/null | sort)
  [ -n "$found" ] || exit 0
  context="dev-compact: /dev-batches left batches open (launched, never returned) — ${found%; }. This session started again: the background agents of the previous process are lost, their worktrees and checkpoints are not (closing.md section 9). Run preflight.sh first (an identity exported by workshop --git-identity dies with its process); then, for each open batch, one SendMessage to its agent if this conversation holds its id (refused or none: gone)"
  if [ "${HARNESS_AUTO_RESUME:-0}" = 1 ]; then
    context="$context, and resume it from its checkpoints as closing.md section 8 points 2-3 say, without asking: HARNESS_AUTO_RESUME=1 is the user's standing yes (D82). Append a relaunched line to the state for each, then go on with /dev-batches sections 2 to 4."
  else
    context="$context. Then ask the user once whether to resume them from their checkpoints (closing.md section 8): nothing is relaunched without that yes (HARNESS_AUTO_RESUME=0)."
  fi
  jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
  exit 0
fi
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")
work=$(harness_work_dir "$root") || true
case "$work" in /*) workabs="$work" ;; *) workabs="$root/$work" ;; esac
[ -d "$workabs" ] || exit 0
grep -qF -e 'dev-implement' -e 'dev-batches' "$transcript" 2>/dev/null || exit 0

# One pass over the transcript: `L<TAB>F<n><TAB>rest` for a launch typed by the user, `C<TAB>F<n>`
# for a closing line printed by the assistant, `P<TAB>line` for a progress line, `D<TAB>agent — description`
# for a delegation. For /dev-batches: `B<TAB>args` for its launch, `A<TAB>F<n><TAB>sheet` for a `dev-batch`
# launch, `N<TAB>F<n><TAB>status<TAB>verdict` for its agent's notification, `R<TAB>F<n><TAB>verdict<TAB>merged<TAB>commit`
# for a relay line. Only the text of the messages is read, in order.
lines=$(jq -rRn '
  def text: (.message.content // "") | if type == "array" then (map(select(type == "object" and .type == "text") | (.text // "")) | join("\n")) else tostring end;
  def args($s): if test("^[[:space:]]*<command-(message|name)>") then
      (select(test("<command-name>/" + $s + "</command-name>")) | (capture("<command-args>(?<a>[^<]*)</command-args>") // {a: ""}) | .a)
    else (capture("^[[:space:]]*/" + $s + "(?<a>[[:space:]][^\n]*|$)") // empty | .a) end;
  def clean: tostring | gsub("[\t\n\r]"; " ");
  [ inputs | (try fromjson catch null) | objects | select(.type == "user" or .type == "assistant")
    | if .type == "user" then
        (text | args("dev-implement") | capture("^[[:space:]]*(?<n>[Ff][0-9]+)(?<rest>.*)$") // empty | "L\t" + (.n | ascii_upcase) + "\t" + (.rest | clean)),
        (text | args("dev-batches") | "B\t" + (clean | sub("^ +"; "") | sub(" +$"; ""))),
        (text | select(startswith("<task-notification>")) | (capture("<summary>Agent \"batch[- ](?<n>F[0-9]+)\"") // empty) as $m
          | "N\t" + $m.n + "\t" + ((capture("<status>(?<s>[a-z_]+)</status>") // {s: "?"}).s) + "\t"
            + ((capture("<result>[[:space:]]*## (Batch F[0-9]+ — )?(?<v>VALID|GAPS|BLOCKED)") // {v: ""}).v))
      else
        (text | scan("Batch (F[0-9]+) complete — manual validation required") | "C\t" + .[0]),
        (text | split("\n")[] | select(test("^(→ Cycle|### RED —|### GREEN —|→ Batch F)")) | "P\t" + .),
        (text | split("\n")[] | capture("^### (?<n>F[0-9]+) — (?<v>VALID|GAPS) — (?<r>.*)$") // empty
          | "R\t" + .n + "\t" + .v + "\t" + (if (.r | test("not merged")) then "not merged" elif (.r | test("merged")) then "merged" else "" end)
            + "\t" + ((.r | capture("commit `?(?<c>[0-9a-f]{7,40})") // {c: ""}).c)),
        ((.message.content // []) | if type == "array" then .[] else empty end | objects | select(.type == "tool_use" and .name == "Agent")
          | "D\t" + ((.input.subagent_type // "general-purpose") | tostring) + " — " + ((.input.description // "") | clean),
            (select(.input.subagent_type == "dev-batch")
              | ((.input.name // "" | tostring | capture("batch-(?<n>F[0-9]+)")) // (.input.description // "" | tostring | capture("batch (?<n>F[0-9]+)")) // empty) as $m
              | "A\t" + $m.n + "\t" + ((.input.prompt // "" | tostring | capture("sheet: (?<p>[^ \t\n]+-PLAN-F[0-9]+\\.md)") // {p: ""}).p)))
      end
  ] | .[]' "$transcript" 2>/dev/null) || exit 0
[ -n "$lines" ] || exit 0

batch="" rest="" closed=false progress="" delegations="" k=0 mode=""
while IFS=$'\t' read -r kind a b; do
  case "$kind" in
    B) mode=batches ;;
    L) mode=inline; batch="$a"; rest="${b:-}"; closed=false; progress=""; delegations=""; k=0 ;;
    C) [ "$a" = "$batch" ] && closed=true ;;
    P) [ -n "$batch" ] && progress="${progress}${a}"$'\n' ;;
    D) [ -n "$batch" ] && { k=$((k + 1)); delegations="${delegations}${k}. ${a}"$'\n'; } ;;
  esac
done <<<"$lines"

# /dev-batches, the last launch typed: the orchestrator's state, from its first launch on. One row per
# batch, in launch order; a new launch of a batch clears what its earlier agent returned.
if [ "$mode" = batches ]; then
  plan="" sheets="" launched="" rows=""
  while IFS=$'\t' read -r kind a; do
    case "$kind" in
      P) plan="$a" ;; S) sheets="${sheets}${a}"$'\n' ;; W) launched="${launched}- \`/dev-batches${a:+ $a}\`"$'\n' ;;
      T) rows="${rows}${a}"$'\n' ;;
    esac
  done < <(printf '%s\n' "$lines" | awk -F'\t' '
    $1 == "B" { on = 1; print "W\t" $2; n = split($2, t, /[ ]+/); for (i = 1; i <= n; i++) if (t[i] ~ /-PLAN\.md$/) plan = t[i]; next }
    !on { next }
    $1 == "A" { f = $2; if (!(f in L)) ord[++no] = f; L[f]++; st[f] = vd[f] = rv[f] = mg[f] = cm[f] = ""
                if ($3 != "" && !($3 in seen)) { seen[$3] = 1; print "S\t" $3 }; next }
    $1 == "N" { if ($2 in L) { st[$2] = $3; vd[$2] = $4 }; next }
    $1 == "R" { if ($2 in L) { rv[$2] = $3; mg[$2] = $4; cm[$2] = $5 }; next }
    END {
      print "P\t" plan
      for (i = 1; i <= no; i++) {
        f = ord[i]
        state = mg[f] == "merged" ? "merged" : mg[f] == "not merged" ? "returned, not merged" : rv[f] != "" ? "returned, relayed" : st[f] == "completed" ? "returned, not relayed" : st[f] != "" ? "stopped (" st[f] ")" : "running"
        ret = st[f] == "" ? "—" : st[f] (vd[f] != "" ? ", " vd[f] : "")
        rel = rv[f] == "" ? "—" : rv[f] (mg[f] != "" ? ", " mg[f] : "") (cm[f] != "" ? ", commit " cm[f] : "")
        printf "T\t| %s | %d | %s | %s | %s |\n", f, L[f], ret, rel, state
      }
    }')
  # The plan: the one the launch names, else the one plan of the sheets launched.
  if [ -z "$plan" ]; then
    plans=$(printf '%s' "$sheets" | sed -n 's/-PLAN-F[0-9]*\.md$/-PLAN.md/p' | sort -u)
    [ -n "$plans" ] && [ "$(printf '%s\n' "$plans" | wc -l)" -eq 1 ] && plan="$plans"
  fi
  [ -n "$plan" ] || exit 0
  case "$plan" in /*) ;; *) plan="$root/$plan" ;; esac
  dir="$(dirname "$plan")"; code="$(basename "$plan")"; code="${code%-PLAN.md}"
  [ -d "$dir" ] && [ -n "$code" ] || exit 0
  state="$dir/$code-BATCHES-STATE.md"
  rel_plan="${plan#"$root"/}"; rel_state="${state#"$root"/}"
  if [ "$event" = "SessionStart" ]; then
    context="dev-compact: the context was compacted while /dev-batches ran the batches of \`$rel_plan\`."
    if [ -f "$state" ]; then
      context="$context Read \`$rel_state\` first: the batches launched, what each agent returned and the relay lines are there. Never relaunch a batch it lists as running or merged: a running agent comes back by its own notification; write the backlog from the reports as /dev-batches § 3 says."
    else
      context="$context Read the plan's sheets first (a title ending — done is a merged batch) and \`git worktree list\`; never relaunch a batch whose agent may still run: its notification comes back by itself."
    fi
    jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
    exit 0
  fi
  log=""
  [ -f "$state" ] && log=$(sed -n '/^## Log[[:space:]]*$/,$p' "$state" 2>/dev/null)
  stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tmp="$state.$$.tmp"
  {
    printf '# %s-BATCHES-STATE — written by dev-compact at %s (%s compaction, session %s)\n\n' "$code" "$stamp" "${trigger:-unknown}" "$session"
    printf '> Read first after a compaction. The plan is `%s`: never relaunch a batch below that is running or\n> merged; a running agent comes back by its own notification. Rewritten at every compaction, never committed by Claude Code.\n\n' "$rel_plan"
    printf '## Launches typed by the user\n\n%s\n' "$launched"
    printf '## Batches (in launch order)\n\n| Batch | Launches | Returned (notification) | Relay | State |\n|---|---|---|---|---|\n%s' "${rows:-$'| (none launched yet) | | | | |\n'}"
    [ -z "$log" ] || printf '\n%s\n' "$log"
  } > "$tmp" 2>/dev/null && mv -f "$tmp" "$state" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
  exit 0
fi
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
