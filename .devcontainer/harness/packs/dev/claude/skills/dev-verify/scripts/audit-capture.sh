#!/bin/bash
# Gate and capture of a dev batch — the mechanical half of /dev-verify, in one call.
#
# Adapted from claude-code-toolkit/scripts/pre-audit.sh and audit-capture.sh (MIT, see
# THIRD-PARTY.md): the two are one script here, and every value the toolkit read from
# kit.config.json (roots, build command) is an argument, given by the skill from the plan's
# `Commands` and `Layout` lines or from the repository pack's repo.yaml. What needs a parser of
# one language (comments added) is left to the auditor; two of the toolkit's parsed checks came
# back on 2026-10-11: the access cost (`access-cost.py --diff` of the dev-implement skill, on the
# syntax tree) and the rule traits (a grep, `--trait`).
#
# The gate fails (exit 1, no capture) on what a grep decides: a `TDD:` line still open, a design
# id (DDD-/APP-/PERF-) neither applied by a sheet of the plan nor listed as non-applicable, a
# changed file outside the roots and absent from the sheet, with `--trait <name>` an id of the
# sheet's `## TDD sequence` that no test of the roots carries as `[Trait("<name>", "<id>")]`,
# whitespace errors. Green, it writes the capture the auditors open once: status, changed files,
# the batch diff (bounded), the build exit code, the access cost of the changed production files
# (every port call in a loop, a lambda or a memory filter, added lines flagged), the traits found,
# the last fifteen lines of the last test run (`--test-log`, 2026-10-12, plan B6) and the test
# classes per changed file (the classes of a changed test file; the test files naming the type of
# a changed production file), so that the auditor runs the test it doubts, not every narrowed class.
# A raw log has no place there: the file is read by a model that pays for every line.
#
# Usage:
#   audit-capture.sh <F<n>> <sheet.md> <output> [--build "<command>"] [--build-log <file>] [--test-log <file>]
#                    [--roots "<dir> <dir>"] [--trait <name>] [--plan-dir <dir>] [--build-outputs "<dir> <dir>"]
# `--plan-dir` (2026-10-12, V-34): the folder of the plan — its `*-PLAN.md` (non-applicable rules) and
# the ids every file there knows — when the sheet given is a ticked copy kept elsewhere (a `dev-batch`
# agent cannot tick the sheet of the main checkout); by default the sheet's own folder.
# `--roots`: the production root(s) first, the test root(s) last; a root whose path holds `test`
# (any case) is a test root - the access cost is measured on the others.
# `--build-log` (plan B3, 2026-10-12): the file /dev-implement section 3 wrote with `commands.build`
# (`dev-F<n>-build.txt`). When it is there, ends green (no `error XXnnnn`, no `Build FAILED`, no `exit=`
# other than 0) and no changed file outside the plan folder is newer than it, the build section of
# the capture reads it (`exit: 0 (reused ...)`) and `--build` is not run: one build of the solution
# per batch. Missing, red or older than a changed file: said in the capture, and `--build` runs.
# `--test-log`: the file of the last test run - `dev-F<n>-test-affected.txt` once a correction round
# ran the test projects the batch reaches, else the whole suite's `dev-F<n>-test.txt`; its last
# fifteen lines land in the capture. Both files carry `--no-restore` / `--no-build` builds (plan B7): the gate
# itself never restores.
# The searches through the roots (the traits, the test classes) read the sources, never the build
# (2026-10-14, GAP-43-44): a `grep -r` over a built worktree read every file of `bin/` and `obj/` -
# 25 to 30 GB for Orkeon, on a 9p mount - before a `grep -v` threw the lines away, 3.8 to 10 minutes a
# gate. `git grep --untracked` reads the tracked files and the batch's new untracked ones (a test file
# not yet added carries its trait) and skips what `.gitignore` ignores; `--build-outputs "<dir> <dir>"`
# (`layout.build_outputs` of the repository pack) names the output folders of a repository whose
# `.gitignore` does not, excluded at any depth by pathspec.
# Exit: 0 gate green and capture written, 1 gate red, 2 usage or environment.
set -uo pipefail

usage() { echo "usage: audit-capture.sh <F<n>> <sheet.md> <output> [--build \"<command>\"] [--build-log <file>] [--test-log <file>] [--roots \"<dir> <dir>\"] [--trait <name>] [--plan-dir <dir>] [--build-outputs \"<dir> <dir>\"]" >&2; exit 2; }
[ $# -ge 3 ] || usage
BATCH="$1"; SHEET="$2"; OUT="$3"; shift 3
BUILD=""; BUILD_LOG=""; TEST_LOG=""; ROOTS=""; TRAIT=""; PLAN_DIR=""; OUTPUTS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --build) [ $# -ge 2 ] || usage; BUILD="$2"; shift 2 ;;
    --build-outputs) [ $# -ge 2 ] || usage; OUTPUTS="$2"; shift 2 ;;
    --build-log) [ $# -ge 2 ] || usage; BUILD_LOG="$2"; shift 2 ;;
    --test-log) [ $# -ge 2 ] || usage; TEST_LOG="$2"; shift 2 ;;
    --roots) [ $# -ge 2 ] || usage; ROOTS="$2"; shift 2 ;;
    --trait) [ $# -ge 2 ] || usage; TRAIT="$2"; shift 2 ;;
    --plan-dir) [ $# -ge 2 ] || usage; PLAN_DIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done
case "$TRAIT" in *[!A-Za-z0-9_-]*) echo "audit-capture: --trait takes a trait name ([A-Za-z0-9_-])" >&2; exit 2 ;; esac

top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "audit-capture: not inside a git work tree" >&2; exit 2; }
case "$SHEET" in /*) ;; *) SHEET="$PWD/$SHEET" ;; esac
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
case "$BUILD_LOG" in ''|/*) ;; *) BUILD_LOG="$PWD/$BUILD_LOG" ;; esac
case "$TEST_LOG" in ''|/*) ;; *) TEST_LOG="$PWD/$TEST_LOG" ;; esac
case "$PLAN_DIR" in ''|/*) ;; *) PLAN_DIR="$PWD/$PLAN_DIR" ;; esac
[ -z "$PLAN_DIR" ] || [ -d "$PLAN_DIR" ] || { echo "audit-capture: --plan-dir is not a folder: $PLAN_DIR" >&2; exit 2; }
[ -f "$SHEET" ] || { echo "audit-capture: sheet not found: $SHEET" >&2; exit 2; }
cd "$top" || exit 2

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$HERE/../../dev-plan/references/design-rules.md"
COST="$HERE/../../dev-implement/scripts/access-cost.py"
[ -n "$PLAN_DIR" ] || PLAN_DIR="$(dirname "$SHEET")"
read -ra ROOT_DIRS <<<"$ROOTS"
PROD_DIRS=()
for r in ${ROOT_DIRS[@]+"${ROOT_DIRS[@]}"}; do
  case "$(printf '%s' "$r" | tr '[:upper:]' '[:lower:]')" in *test*) ;; *) PROD_DIRS+=("$r") ;; esac
done

RED=0
ok() { printf '  ok   %s\n' "$1"; }
ko() { printf '  FAIL %s\n' "$1"; RED=1; }
note() { printf '       %s\n' "$1"; }

# The build output folders, as pathspecs that exclude them at any depth (see the header).
EXCLUDES=()
read -ra OUTPUT_DIRS <<<"$OUTPUTS"
for o in ${OUTPUT_DIRS[@]+"${OUTPUT_DIRS[@]}"}; do
  case "$o" in ""|*/*|.|..) echo "audit-capture: --build-outputs takes folder names, not paths: $o" >&2; exit 2 ;; esac
  EXCLUDES+=(":(exclude,glob)**/$o/**")
done

untracked() { git ls-files --others --exclude-standard -- . ${EXCLUDES[@]+"${EXCLUDES[@]}"} 2>/dev/null; }
changed_files() {
  git diff --name-only HEAD 2>/dev/null
  untracked
}
# git grep over the sources: its options and pattern, then `--` and the paths; never a build output.
src_grep() { git grep --untracked -I "$@" ${EXCLUDES[@]+"${EXCLUDES[@]}"} 2>/dev/null; }

printf 'GATE — batch %s — sheet %s\n' "$BATCH" "${SHEET#"$top"/}"

# 1. Every behaviour step closed.
if grep -qE 'TDD: RED \[x\] GREEN \[x\] COST \[x\]' "$SHEET" && ! grep -qE '(RED|GREEN|COST) \[ \]' "$SHEET"; then
  ok "sheet: every step reads \`TDD: RED [x] GREEN [x] COST [x]\`"
else
  ko "sheet not closed: a \`TDD:\` line is still open, or none is ticked"
fi

# 2. Every design id classified, across the plan folder.
if [ -f "$RULES" ]; then
  missing=""
  classified=$(cat "$PLAN_DIR"/*-PLAN-F*.md 2>/dev/null | grep -E 'Applied rules' ; cat "$PLAN_DIR"/*-PLAN.md 2>/dev/null | grep -E 'Non-applicable rules')
  while IFS= read -r id; do
    printf '%s\n' "$classified" | grep -qE "(^|[^A-Z])$id([^0-9]|$)" || missing="$missing $id"
  done < <(grep -oE '^\| (DDD|APP|PERF)-[0-9]+' "$RULES" | tr -d '| ')
  if [ -z "$missing" ]; then
    ok "design ids: all applied or non-applicable"
  else
    ko "design ids neither on an \`Applied rules\` row nor on \`Non-applicable rules\`:$missing"
  fi
else
  ko "design rules not found: $RULES"
fi

# 3. Every changed file inside the roots, or named by the sheet.
if [ ${#ROOT_DIRS[@]} -eq 0 ]; then
  note "scope: no --roots given, not checked"
else
  outside=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    inside=0
    for r in "${ROOT_DIRS[@]}"; do
      case "$f" in "${r%/}"/*) inside=1; break ;; esac
    done
    [ $inside -eq 1 ] && continue
    case "$top/$f" in "$PLAN_DIR"/*) continue ;; esac
    grep -qF -- "$(basename "$f")" "$SHEET" && continue
    outside="$outside$f"$'\n'
  done < <(changed_files | sort -u)
  if [ -z "$outside" ]; then
    ok "scope: every changed file is under $ROOTS or named by the sheet"
  else
    ko "files changed outside $ROOTS and absent from the sheet — name them under \`## Decisions\`, or restore them"
    while IFS= read -r l; do [ -n "$l" ] && note "$l"; done <<<"$outside"
  fi
fi

# 4. Every id of the sheet's TDD sequence carried by a test, as a trait (--trait).
SHEET_IDS=$(awk '/^## TDD sequence/{p=1; next} /^## /{p=0} p' "$SHEET" | grep -oE '\b(BR|UC|CH)-[0-9]+\b' | sort -u)
TRAIT_HITS=""
if [ -z "$TRAIT" ]; then
  note "rule traits: no --trait given, not checked"
elif [ -z "$SHEET_IDS" ]; then
  note "rule traits: the sheet's \`## TDD sequence\` names no BR-/UC-/CH- id, nothing to check"
else
  scope=("${ROOT_DIRS[@]}")
  [ ${#scope[@]} -gt 0 ] || scope=(.)
  TRAIT_HITS=$(src_grep -noE "\[Trait\(\"$TRAIT\", *\"(BR|UC|CH)-[0-9]+\"\)\]" -- "${scope[@]}" || true)
  untested=""
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    printf '%s\n' "$TRAIT_HITS" | grep -qF "\"$id\"" || untested="$untested $id"
  done <<<"$SHEET_IDS"
  if [ -z "$untested" ]; then
    ok "rule traits: every id of the sheet is carried by a test, [Trait(\"$TRAIT\", \"<id>\")]"
  else
    ko "ids of the sheet's TDD sequence that no test carries as [Trait(\"$TRAIT\", \"<id>\")]:$untested"
  fi
  # A trait citing an id no file of the plan folder knows: said, never a failure (another batch's id
  # is in its own sheet; a typo is the auditor's to judge).
  known=$(cat "$PLAN_DIR"/*.md 2>/dev/null | grep -oE '\b(BR|UC|CH)-[0-9]+\b' | sort -u)
  stray=""
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    printf '%s\n' "$known" | grep -qxF "$id" || stray="$stray $id"
  done < <(printf '%s\n' "$TRAIT_HITS" | grep -oE '(BR|UC|CH)-[0-9]+' | sort -u)
  [ -z "$stray" ] || note "traits citing an id absent from $PLAN_DIR/*.md:$stray"
fi

# 5. Whitespace.
if git diff --check HEAD >/dev/null 2>&1; then
  ok "git diff --check: clean"
else
  ko "git diff --check reports trailing whitespace or conflict markers"
fi

if [ $RED -ne 0 ]; then
  printf 'GATE — batch %s: RED — fix and run again, no audit before\n' "$BATCH"
  exit 1
fi
printf 'GATE — batch %s: GREEN\n' "$BATCH"

DIFF_MAX=1200
LOG_MAX=6
mkdir -p "$(dirname "$OUT")" || exit 2
: >"$OUT" || exit 2
section() { printf '\n=== %s ===\n' "$1" >>"$OUT"; }

diff_file=$(mktemp) || exit 2
trap 'rm -f "$diff_file"' EXIT
{
  git diff HEAD 2>/dev/null
  untracked | while IFS= read -r f; do
    git diff --no-index -- /dev/null "$f" 2>/dev/null
  done
} >"$diff_file"
lines=$(wc -l <"$diff_file" | tr -d ' ')

printf '# Audit capture — batch %s\nsheet: %s\ngenerated: %s\ngate: green\n' \
  "$BATCH" "${SHEET#"$top"/}" "$(date '+%F %H:%M')" >>"$OUT"
section "git status --short"
git status --short -- . ${EXCLUDES[@]+"${EXCLUDES[@]}"} >>"$OUT" 2>&1
section "changed files"
changed_files | sort -u >>"$OUT"
section "batch diff ($lines lines)"
if [ "$lines" -gt "$DIFF_MAX" ]; then
  head -n "$DIFF_MAX" "$diff_file" >>"$OUT"
  printf '\n[diff cut at %s lines of %s: read the rest bounded, hunk by hunk]\n' "$DIFF_MAX" "$lines" >>"$OUT"
else
  cat "$diff_file" >>"$OUT"
fi

# The build of /dev-implement section 3 is reused when its log can stand for a build made now:
# present, green, and older than no file the batch changed (the plan folder aside: the sheet is
# ticked after the build). Anything else is said, and the build runs.
reuse_build_log() {   # prints why the log is not reused; prints nothing when it is
  [ -n "$BUILD_LOG" ] || { printf 'no --build-log given'; return; }
  [ -s "$BUILD_LOG" ] || { printf 'log missing or empty: %s' "$BUILD_LOG"; return; }
  if grep -qE 'Build FAILED|(^|[^A-Za-z])error [A-Z]+[0-9]+|^exit=[1-9]' "$BUILD_LOG"; then
    printf 'the log holds an error'; return
  fi
  local f newer=""
  while IFS= read -r f; do
    [ -n "$f" ] && [ -e "$f" ] || continue
    case "$top/$f" in "$PLAN_DIR"/*) continue ;; esac
    [ "$f" -nt "$BUILD_LOG" ] && newer="$newer $f"
  done < <(changed_files | sort -u)
  [ -z "$newer" ] || printf 'changed after it:%s' "$newer"
}

section "build"
if [ -z "$BUILD" ]; then
  printf 'not run — no --build given\n' >>"$OUT"
elif why=$(reuse_build_log) && [ -z "$why" ]; then
  printf 'command: %s\nexit: 0 (reused %s, written %s: ends green, no changed file newer — one build of the solution per batch, B3)\n' \
    "$BUILD" "$BUILD_LOG" "$(date -r "$BUILD_LOG" '+%F %H:%M')" >>"$OUT"
else
  [ -z "$BUILD_LOG" ] || printf 'log not reused (%s): built again\n' "$why" >>"$OUT"
  log=$(mktemp) || exit 2
  bash -c "$BUILD" >"$log" 2>&1
  rc=$?
  printf 'command: %s\nexit: %s\n' "$BUILD" "$rc" >>"$OUT"
  if [ $rc -ne 0 ]; then
    grep -E 'error|Error|failed|Failed|FAIL' "$log" | head -n "$LOG_MAX" >>"$OUT" || tail -n "$LOG_MAX" "$log" >>"$OUT"
  fi
  rm -f "$log"
fi

section "access cost (access-cost.py --diff, added lines flagged)"
if ! command -v python3 >/dev/null 2>&1; then
  printf 'not run - python3 missing\n' >>"$OUT"
elif [ ! -f "$COST" ]; then
  printf 'not run - %s missing\n' "$COST" >>"$OUT"
else
  python3 "$COST" --diff ${PROD_DIRS[@]+"${PROD_DIRS[@]}"} >"$OUT.cost" 2>&1
  printf 'exit: %s (0 none flagged, 2 a port call in a loop or a lambda or a memory filter on an added line, 3 ast-grep missing: stated by hand)\n' "$?" >>"$OUT"
  head -n 60 "$OUT.cost" >>"$OUT"
  [ "$(wc -l <"$OUT.cost")" -le 60 ] || printf '[cut at 60 lines]\n' >>"$OUT"
  rm -f "$OUT.cost"
fi

section "rule traits"
if [ -z "$TRAIT" ]; then
  printf 'not checked - no --trait given\n' >>"$OUT"
else
  printf 'ids of the sheet: %s\n' "$(printf '%s' "$SHEET_IDS" | tr '\n' ' ')" >>"$OUT"
  printf '%s\n' "$TRAIT_HITS" | grep . | sed 's/:\([0-9]*\):/:\1 /' | head -n 40 >>"$OUT" || true
fi

section "last test run (tail -15 of --test-log)"
if [ -z "$TEST_LOG" ]; then
  printf 'not given\n' >>"$OUT"
elif [ ! -s "$TEST_LOG" ]; then
  printf 'missing or empty: %s\n' "$TEST_LOG" >>"$OUT"
else
  printf 'file: %s (written %s)\n' "$TEST_LOG" "$(date -r "$TEST_LOG" '+%F %H:%M')" >>"$OUT"
  tail -n 15 "$TEST_LOG" >>"$OUT"
fi

# The test classes a changed file concerns (plan B6): for a changed test file, the classes it
# declares; for a changed production file, the test files of the test roots that name its type
# (five at most). The auditor runs what it doubts from this list, never every narrowed class.
section "test classes per changed file"
TEST_DIRS=()
for r in ${ROOT_DIRS[@]+"${ROOT_DIRS[@]}"}; do
  case "$(printf '%s' "$r" | tr '[:upper:]' '[:lower:]')" in *test*) TEST_DIRS+=("$r") ;; esac
done
is_test_file() {   # under a test root, or a path that says test
  local f="$1" r
  for r in ${TEST_DIRS[@]+"${TEST_DIRS[@]}"}; do case "$f" in "${r%/}"/*) return 0 ;; esac; done
  case "$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')" in *test*) return 0 ;; esac
  return 1
}
n=0
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  case "$f" in *.cs|*.ts|*.py|*.fs|*.vb) ;; *) continue ;; esac
  case "$top/$f" in "$PLAN_DIR"/*) continue ;; esac
  if is_test_file "$f"; then
    classes=$(grep -oE '\b(class|record)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' "$f" 2>/dev/null | awk '{print $2}' | sort -u | paste -sd, - | sed 's/,/, /g')
    printf '%s: %s\n' "$f" "${classes:-no class found}" >>"$OUT"
  else
    type=$(basename "$f"); type="${type%%.*}"
    if [ ${#TEST_DIRS[@]} -eq 0 ]; then
      printf '%s -> tests naming %s: no test root given\n' "$f" "$type" >>"$OUT"
    else
      globs=()
      for r in "${TEST_DIRS[@]}"; do
        case "${r%/}" in .|"") globs+=(":(glob)**/*.${f##*.}") ;; *) globs+=(":(glob)${r%/}/**/*.${f##*.}") ;; esac
      done
      hits=$(src_grep -lw -e "$type" -- "${globs[@]}" | head -n 5 | paste -sd, - | sed 's/,/, /g')
      printf '%s -> tests naming %s: %s\n' "$f" "$type" "${hits:-none}" >>"$OUT"
    fi
  fi
  n=$((n + 1))
  [ "$n" -lt 40 ] || { printf '[cut at 40 files]\n' >>"$OUT"; break; }
done < <(changed_files | sort -u)
[ "$n" -gt 0 ] || printf 'no changed source file\n' >>"$OUT"

section "left to the audit"
printf 'The narrowed test runs: their scope is the audit'"'"'s decision (audit-axes.md, section 3) - start from the classes above.\n' >>"$OUT"

printf 'Capture written: %s (%s bytes)\n' "$OUT" "$(wc -c <"$OUT" | tr -d ' ')"
exit 0
