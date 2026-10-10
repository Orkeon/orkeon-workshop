#!/bin/bash
# Gate and capture of a dev batch — the mechanical half of /dev-verify, in one call.
#
# Adapted from claude-code-toolkit/scripts/pre-audit.sh and audit-capture.sh (MIT, see
# THIRD-PARTY.md): the two are one script here, and every value the toolkit read from
# kit.config.json (roots, build command) is an argument, given by the skill from the plan's
# `Commands` and `Layout` lines or from the repository pack's repo.yaml. What needs a parser of
# one language (comments added, access cost, test traits) is left to the auditor.
#
# The gate fails (exit 1, no capture) on what a grep decides: a `TDD:` line still open, a design
# id (DDD-/APP-/PERF-) neither applied by a sheet of the plan nor listed as non-applicable, a
# changed file outside the roots and absent from the sheet, whitespace errors. Green, it writes
# the capture the auditor opens once: status, changed files, the batch diff (bounded), the build
# exit code. A raw log has no place there: the file is read by a model that pays for every line.
#
# Usage:
#   audit-capture.sh <F<n>> <sheet.md> <output> [--build "<command>"] [--roots "<dir> <dir>"]
# Exit: 0 gate green and capture written, 1 gate red, 2 usage or environment.
set -uo pipefail

usage() { echo "usage: audit-capture.sh <F<n>> <sheet.md> <output> [--build \"<command>\"] [--roots \"<dir> <dir>\"]" >&2; exit 2; }
[ $# -ge 3 ] || usage
BATCH="$1"; SHEET="$2"; OUT="$3"; shift 3
BUILD=""; ROOTS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --build) [ $# -ge 2 ] || usage; BUILD="$2"; shift 2 ;;
    --roots) [ $# -ge 2 ] || usage; ROOTS="$2"; shift 2 ;;
    *) usage ;;
  esac
done

top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "audit-capture: not inside a git work tree" >&2; exit 2; }
case "$SHEET" in /*) ;; *) SHEET="$PWD/$SHEET" ;; esac
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
[ -f "$SHEET" ] || { echo "audit-capture: sheet not found: $SHEET" >&2; exit 2; }
cd "$top" || exit 2

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$HERE/../../dev-plan/references/design-rules.md"
PLAN_DIR="$(dirname "$SHEET")"
read -ra ROOT_DIRS <<<"$ROOTS"

RED=0
ok() { printf '  ok   %s\n' "$1"; }
ko() { printf '  FAIL %s\n' "$1"; RED=1; }
note() { printf '       %s\n' "$1"; }

changed_files() {
  git diff --name-only HEAD 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
}

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

# 4. Whitespace.
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
  git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
    git diff --no-index -- /dev/null "$f" 2>/dev/null
  done
} >"$diff_file"
lines=$(wc -l <"$diff_file" | tr -d ' ')

printf '# Audit capture — batch %s\nsheet: %s\ngenerated: %s\ngate: green\n' \
  "$BATCH" "${SHEET#"$top"/}" "$(date '+%F %H:%M')" >>"$OUT"
section "git status --short"
git status --short >>"$OUT" 2>&1
section "changed files"
changed_files | sort -u >>"$OUT"
section "batch diff ($lines lines)"
if [ "$lines" -gt "$DIFF_MAX" ]; then
  head -n "$DIFF_MAX" "$diff_file" >>"$OUT"
  printf '\n[diff cut at %s lines of %s: read the rest bounded, hunk by hunk]\n' "$DIFF_MAX" "$lines" >>"$OUT"
else
  cat "$diff_file" >>"$OUT"
fi

section "build"
if [ -z "$BUILD" ]; then
  printf 'not run — no --build given\n' >>"$OUT"
else
  log=$(mktemp) || exit 2
  bash -c "$BUILD" >"$log" 2>&1
  rc=$?
  printf 'command: %s\nexit: %s\n' "$BUILD" "$rc" >>"$OUT"
  if [ $rc -ne 0 ]; then
    grep -E 'error|Error|failed|Failed|FAIL' "$log" | head -n "$LOG_MAX" >>"$OUT" || tail -n "$LOG_MAX" "$log" >>"$OUT"
  fi
  rm -f "$log"
fi

section "left to the audit"
printf 'The narrowed test runs: their scope is the audit'"'"'s decision (audit-axes.md, section 3).\n' >>"$OUT"

printf 'Capture written: %s (%s bytes)\n' "$OUT" "$(wc -c <"$OUT" | tr -d ' ')"
exit 0
