#!/bin/bash
# PreToolUse Edit|Write hook — the role x phase x folder matrix of a team.
#
# Plan § 2.5, § 4.4, § 7.2 (3), § 7.3. Claude Code does not restrict a subagent to
# paths by itself; this hook is the third of the three mechanisms (agent
# frontmatter, permissions.deny, guard-phase) and the only one that knows the
# phase and the state of an attempt. It reads:
#   - the team of the edited path (lib/team-common.sh): the team folder
#     `teams/<slug>/`, its workbook `workbooks/<slug>/`, its tests `tests/<slug>/` (D29),
#     its own Orkeon settings `settings/<slug>/` (D33) — of these, the first the path
#     goes through,
#   - `phase:` from the team's STATUS.md (frozen literal),
#   - `closed_at` from the manifest.json of the attempt the path sits in,
#   - `agent_type` from the payload (present when a subagent writes).
#
# Orkeon settings, checked first (D33, D40): no subagent writes a file Orkeon reads as
# settings (harness_settings_kind) — anything under settings/<x>/, of a team or not; in a
# team folder and in its crew/, appsettings*.json, appsettings/** and _shared/**;
# appsettings*.json at the workshop root; appsettings/appsettings.json and
# _shared/appsettings.json anywhere else in the workshop. The main thread writes them, and
# the check scripts and `orkeon-bench doctor` report a stray one afterwards.
#
# Role matrix (agent_type), checked next:
#   team-test-author, dataset-synthesizer  write the team's tests only (library/datasets/** is outside any team)
#   team-implementer                       never the team's tests nor its workbook
#   team-reviewer, run-analyst, judge      nothing of a team: they return their result
#
# Phase matrix, checked last, for everyone:
#   teams/<slug>/crew/**        only in phase `build` (no STATUS.md or no phase: allowed)
#   tests/<slug>/**             never in phase `build`
#   workbooks/<slug>/STATUS.md  never a write that RAISES `gate_passed` while a user gate is not
#                               passed (to `need`, `test-plan`, `design`, or past them): the three
#                               user gates are recorded by the /team-approve hook alone, from the
#                               line the user types (D36). Lowering it (/team-decision goes back a
#                               step, ITERATE back to `tests`) and, once the design is validated,
#                               the later gates (`tests`, `build`, `review`) stay with the skills.
#   workbooks/<slug>/runs/      never: only the bench archives runs
#   workbooks/<slug>/attempts/  a CLOSED attempt (manifest.json closed_at set) is read-only for
#                               everyone. In an OPEN attempt, Edit/Write may touch ANALYSIS.md and
#                               FIX-PLAN.md only, and only from the main thread (no agent_type):
#                               the /team-review skill writes them from what team-reviewer returns.
#                               REPORT.md, report.json, manifest.json, remote-approval.json and
#                               design-snapshot/** are written by orkeon-bench alone, through Bash:
#                               `attempt open|close` (the folder, manifest.json, the snapshot),
#                               `run` (REPORT.md, report.json, the runs of the manifest), and
#                               `attempt approve` (remote-approval.json), which the /team-approve
#                               hook calls on the line the user types (`/team-approve remote <usd>`,
#                               D19, D36) — never from the shell.
# A C# tool folder (plan § 3.3) keeps its workbook/ and tests/ inside it, and its src/
# follows the rule of crew/.
#
# Paths are normalised (`..`) and folder names compared in lower case. Outside the build
# a write in crew/ is denied whoever asks for it, from a team-* skill or not, and the
# reason names /team-decision: a change of the definition goes through a decision
# (plan § 7.3).
# Every deny reason starts with `guard-phase:` (frozen literal, matched by the evals).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"

input=$(cat)
[ -n "$input" ] || exit 0
# A source space (D49) holds no team: nothing to judge there.
[ "$(harness_space)" = source ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j '[(.tool_name // ""), (.tool_input.file_path // .tool_input.notebook_path // ""), (.agent_type // ""), (.session_id // "unknown"), (.cwd // "")] | join("\u001f")' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r tool_name file_path agent_type session_id payload_cwd <<<"$PARSED"

case "$tool_name" in Edit|Write|MultiEdit|NotebookEdit) ;; *) exit 0 ;; esac
[ -n "$file_path" ] || exit 0
# A relative path is judged from the folder the tool runs in: left as typed, `workbooks/x/STATUS.md`
# would name no team and escape every rule below.
case "$file_path" in /*) ;; *) file_path="${payload_cwd:-$PWD}/$file_path" ;; esac
file_path=$(harness_normalize_path "$file_path")

# The team of the path — for settings/<x>/ of no team, the team it would be. Outside
# any team, only the settings check of a subagent's write remains.
team=$(harness_team_root "$file_path" settings 2>/dev/null) || team=""
[ -n "$team" ] || [ -n "$agent_type" ] || exit 0

# How a reason names a path: from the workshop for a team (`tests/alpha/...`), from
# the tool folder for a C# tool (`EmlExtractor/src/...`), from the workshop root else.
if [ -z "$team" ]; then
  base=$(harness_normalize_path "$(harness_workshop_root)")
elif workshop=$(harness_team_workshop "$team"); then
  base="$workshop"
else
  base="${team%/*}"
fi
case "${file_path,,}" in
  "${base,,}"/*) short="${file_path:$(( ${#base} + 1 ))}" ;;
  *)             short="$file_path" ;;
esac

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

# --- Orkeon settings -----------------------------------------------------------
if [ -n "$agent_type" ] && kind=$(harness_settings_kind "$file_path"); then
  owner="A team's settings live in settings/<slug>/appsettings.json, which the main thread writes, never a subagent ($agent_type). Return the change it needs in your final message."
  case "$kind" in
    team)
      deny "guard-phase: \`$short\` holds the Orkeon settings of the team (its model, its mail accounts and their rights, its limits), which its launchers, the bench and orkeon-harness-run pass with --settings: the main thread writes it, never a subagent ($agent_type). Return the change it needs in your final message." ;;
    settings)
      deny "guard-phase: \`$short\` lies in settings/, which holds the Orkeon settings of the teams: the launchers, the bench and orkeon-harness-run of a team \`${team##*/}\` pass settings/${team##*/}/appsettings.json with --settings. $owner" ;;
    crew)
      deny "guard-phase: \`$short\` is a file Orkeon reads as settings: crew/appsettings.json is the settings file of every run that names none — Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one — and the agents of the team read crew/ as /crew. $owner" ;;
    cwd)
      deny "guard-phase: \`$short\` is a settings file at the root of a team folder or of the workshop: \`orkeon run\` on a crew no longer reads it (main at a2bb6c3), but it is the settings file of \`orkeon run --list-tools\`, \`orkeon doctor\`, \`orkeon email\` and \`orkeon mcp serve\` started from that folder, a C# crew host reads its team folder's appsettings.json, and a team's settings belong in settings/<slug>/appsettings.json. $owner" ;;
    walk)
      deny "guard-phase: \`$short\` lies in a folder where Orkeon looks for its settings: the first appsettings/appsettings.json or _shared/appsettings.json found walking up from a crew folder is the settings file of every run that names none — Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one — in place of the machine's settings. $owner" ;;
    *)
      deny "guard-phase: \`$short\` is a file Orkeon reads as settings. $owner" ;;
  esac
fi

[ -n "$team" ] || exit 0
workbook=$(harness_team_workbook "$team")
tests=$(harness_team_tests "$team")
# A C# tool folder has no settings folder: a value no path can start with.
settings=$(harness_team_settings "$team" 2>/dev/null) || settings=$'\x1f'

# Folder names are compared in lower case: the workshop is usually a Windows
# bind mount, where `Crew/` and `crew/` are the same folder.
path_l="${file_path,,}"
case "$path_l" in
  "${settings,,}"/*)                      area="settings" ;;
  "${tests,,}"/*)                         area="tests" ;;
  "${workbook,,}"/attempts/*)             area="attempts" ;;
  "${workbook,,}"/runs/*)                 area="runs" ;;
  "${workbook,,}"/*)                      area="workbook" ;;
  "${team,,}"/crew/*|"${team,,}"/src/*)   area="crew" ;;   # src/ is the implementation of a C# tool folder (plan § 3.3)
  "${team,,}"/*)                          area="other" ;;
  *)                                      exit 0 ;;
esac

tests_short="${tests:$(( ${#base} + 1 ))}"
workbook_short="${workbook:$(( ${#base} + 1 ))}"

# --- role matrix -------------------------------------------------------------
case "$agent_type" in
  team-test-author|dataset-synthesizer)
    [ "$area" = "tests" ] || deny "guard-phase: $agent_type may only write under $tests_short/** (the tests of the team) and library/datasets/**; \`$short\` is out of scope. Report BLOCKED with the path you needed instead of working around it." ;;
  team-implementer)
    case "$area" in
      tests) deny "guard-phase: team-implementer never modifies tests (\`$short\`). A test that cannot pass without being changed comes back as BLOCKED — the orchestrator decides whether the plan or the test is wrong." ;;
      attempts|runs|workbook) deny "guard-phase: team-implementer never writes in the workbook of the team (\`$short\`); STATUS.md and the attempt files belong to the orchestrator and the bench." ;;
    esac ;;
  team-reviewer|run-analyst|judge)
    deny "guard-phase: $agent_type is read-only; it never writes the files of a team (\`$short\`). Return the result in your final message: the skill that called you writes the files in the main thread." ;;
esac

# --- phase matrix ------------------------------------------------------------
phase=$(harness_status_phase "$team" 2>/dev/null || true)

case "$area" in
  crew)
    if [ -n "$phase" ] && [ "$phase" != "build" ]; then
      deny "guard-phase: \`$short\` is frozen — the team is in phase \`$phase\` ($workbook_short/STATUS.md) and the definition changes only during a build. Record the change with /team-decision, which sends the team back to the step the change reopens (and opens an attempt once the team is built); the definition itself is rewritten by /team-build, on the current batch. /team-build ships in lot 6: until then, once the decision is recorded, the user moves the phase by hand: \`phase: build\` in STATUS.md, with the reason in its journal."
    fi ;;
  tests)
    if [ "$phase" = "build" ]; then
      deny "guard-phase: \`$short\` is frozen during the build (phase \`build\` in $workbook_short/STATUS.md): tests are written by /team-tests before the team, never adjusted to make it pass. If the test is wrong, stop the batch and record it with /team-decision (threshold or test change), which sets the phase back to \`tests\`; the test is then rewritten by /team-tests, which ships in lot 5: until then the test is edited in that phase, by hand, the decision being its record."
    fi ;;
  attempts)
    inside_wb="${path_l:$(( ${#workbook} + 1 ))}"
    att_name=$(printf '%s' "$inside_wb" | sed -nE 's#^attempts/(att-[0-9]+)/.*#\1#p')
    att_name="${att_name^^}"
    if [ -z "$att_name" ]; then
      deny "guard-phase: \`$short\` is not inside an attempt folder. Attempts are opened and closed by orkeon-bench (\`$workbook_short/attempts/ATT-nnnn/\`); nothing else is written under attempts/. \`orkeon-bench attempt open ${team##*/}\` creates the next ATT-nnnn folder with its manifest.json and its design snapshot; never create them by hand."
    fi
    if harness_attempt_closed "$workbook/attempts/$att_name" 2>/dev/null; then
      deny "guard-phase: attempt $att_name is closed (manifest.json closed_at set) and immutable; \`$short\` cannot change. Open a new attempt and write there: \`orkeon-bench attempt open ${team##*/}\`, which /team-decision runs for a team that is already built, and /team-build at the start of a build (lot 6)."
    fi
    inside="${inside_wb#attempts/*/}"
    case "$inside" in
      analysis.md|fix-plan.md)
        if [ -n "$agent_type" ]; then
          deny "guard-phase: \`$short\` is written by the main thread only (the /team-review skill, from the review team-reviewer returns); a subagent ($agent_type) returns its result in its final message."
        fi ;;
      *)
        deny "guard-phase: in an open attempt Edit and Write may touch ANALYSIS.md and FIX-PLAN.md only; \`$short\` belongs to orkeon-bench (REPORT.md, report.json, manifest.json, remote-approval.json, design-snapshot/), which writes it through its own commands: \`orkeon-bench attempt open|close\` for manifest.json and design-snapshot/, \`orkeon-bench run\` for REPORT.md and report.json. remote-approval.json records the user's \`/team-approve remote <usd>\`: the /team-approve hook has orkeon-bench write it (\`orkeon-bench attempt approve\`, D19, D36) from the line the user types — never Claude, never the shell." ;;
    esac ;;
  workbook)
    # A team of a workshop only: the /team-approve hook records in workbooks/<slug>/STATUS.md,
    # and the reduced process of a C# tool folder (plan § 3.3) has no hook to pass its gates.
    if [ "${path_l:$(( ${#workbook} + 1 ))}" = "status.md" ] && harness_team_workshop "$team" >/dev/null; then
      # `gate_passed` of the front matter the file WOULD have: the content of a Write, the file
      # with the edit of an Edit or the edits of a MultiEdit applied — so that an edit of half a
      # line (`: null` -> `: need`) is seen, and a `gate_passed:` line of the body is not. When
      # the result cannot be computed (no python3, an old_string the file does not hold), the
      # last `gate_passed:` line the tool writes is taken instead.
      gate_new=$(HOOK_INPUT="$input" STATUS_FILE="$file_path" python3 -c '
import json, os, re, sys
try:
    tool = json.loads(os.environ["HOOK_INPUT"]).get("tool_input") or {}
except Exception:
    sys.exit(3)
try:
    with open(os.environ["STATUS_FILE"], encoding="utf-8", errors="replace", newline="") as fh:
        text = fh.read()
except OSError:
    text = ""
if isinstance(tool.get("content"), str):
    text = tool["content"]
else:
    edits = tool.get("edits") if isinstance(tool.get("edits"), list) else [tool]
    for e in edits:
        old, new = (e or {}).get("old_string"), (e or {}).get("new_string")
        if not isinstance(old, str) or not isinstance(new, str) or old == "":
            sys.exit(3)
        if old not in text and "\r\n" in text:
            # The tool shows and matches lines without their CR: judge the file the same way.
            text = text.replace("\r\n", "\n")
        if old not in text:
            sys.exit(3)
        text = text.replace(old, new) if e.get("replace_all") else text.replace(old, new, 1)
lines = text.lstrip("\ufeff").splitlines()
if not lines or not re.match(r"^---[ \t]*$", lines[0]):
    sys.exit(0)
for raw in lines[1:]:
    if re.match(r"^---[ \t]*$", raw):
        break
    m = re.match(r"^gate_passed[ \t]*:[ \t]*(.*)$", raw)
    if m:
        print(re.sub(r"[\"\x27 \t]", "", re.sub(r"[ \t]+#.*$", "", m.group(1))))
        break
' 2>/dev/null) || gate_new=$(printf '%s' "$input" | jq -r '[.tool_input.content?, .tool_input.new_string?, (.tool_input.edits? // [] | .[]? | .new_string?)] | map(select(type == "string")) | join("\n")' 2>/dev/null \
        | sed -nE 's/\r$//; s/^gate_passed[ \t]*:[ \t]*//p' | tail -n 1 | sed -E 's/[ \t]+#.*$//' | tr -d "\"' \t")
      gate_now=$(harness_status_key "$team" gate_passed 2>/dev/null || true)
      now_rank=$(harness_gate_rank "$gate_now")
      if [ "$(harness_gate_rank "$gate_new")" -gt "$now_rank" ] && [ "$now_rank" -lt 3 ]; then
        case "$now_rank" in
          0) gate="gate 1 (the need)"; typed="/team-approve need" ;;
          1) gate="gate 2 (the test plan)"; typed="/team-approve test-plan" ;;
          *) gate="gate 3 (the design)"; typed="/team-approve design" ;;
        esac
        deny "guard-phase: \`gate_passed: $gate_new\` in \`$short\` would pass a user gate: $gate of this team is recorded by the /team-approve hook alone, from the line the user types — $typed — never by Claude (D36). Leave gate_passed as it is (\`${gate_now:-null}\`), show the user the artefact and what stays open, and ask them to type the approval."
      fi
    fi ;;
  runs)
    deny "guard-phase: \`$short\` is under $workbook_short/runs/, which only the bench writes (events.jsonl, manifests, snapshots). Archive by running the team through orkeon-bench, never by hand: \`orkeon-bench run ${team##*/} --level <L0|L2>\` archives each run it makes there (the levels up to L2, on the simulated LLM, today); a run started by hand is not archived, and runs/ stays as it is." ;;
esac

exit 0
