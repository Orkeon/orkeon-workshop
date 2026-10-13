#!/bin/bash
# Shared body of the pilot guard (S0 of the reading plan, 2026-10-13): lib/guard-pilot-reads.sh
# (a Bash command, through the dispatcher) and hooks/read-bounds.sh (the Read tool).
#
# The pilot is the context that orchestrates a batch of the dev chain: a `dev-batch` agent (D70), or
# the main conversation while a `/dev-implement` batch is open in it. The skill says "You open no
# source or test file": the contracts carry `path:line` copied from the sheet, a doubted path gets
# one `ls`. Measured over four runs (130 subagents, 2026-10-12/13): the three contexts that broke
# this rule - generic agents told to "implement the plan" - carried 70 % of everything read, and a
# `cat` of eight `.cs` files made at their fourth turn was paid again on each of the 335 turns that
# followed. A rule addressed to the model is read after the reads it was meant to prevent; this
# guard refuses them before.
#
# Who is a pilot:
#   - agent_type `dev-batch`: always (its charter: no source or test file, ever);
#   - the main conversation (no agent_id): when its transcript carries a `/dev-implement` launch
#     (`<command-name>/dev-implement</command-name>`, the line Claude Code writes for the command
#     the user typed) after the last closing line `Batch F<n> complete — manual validation required`
#     (printed by `/dev-implement` alone, for a VALID verdict) and after the last `/clear`. A batch
#     closed GAPS leaves the pilot on until /clear - the skill asks for it anyway;
#   - any other subagent: never (the roles read the code; it is their job).
#   A grep over the transcript, never a jq: the three markers carry literals nothing else in a
#   transcript carries with a digit (the skill sources quote `F<n>`), and the guard pays it only once
#   a command names a source file.
#
# What is a source or test file: the extension, wherever the file sits. Markdown, YAML, JSON and
# text are not: the plan, the sheet, `repo.yaml` and a build log are the pilot's own reading. A tree
# handed to a recursive search is code when one such file sits within three levels of it
# (`pilot_dir_has_source`): a folder of sheets and notes (`todo/x`) is the pilot's own, `src` is not.
#
# Switch: HARNESS_PILOT_GUARD, `0` in the managed settings.json, `1` with the dev pack. Forcing:
# the explicit flag `HARNESS_FORCE_READ=1` in front of a Bash command (bounds-common.sh). The Read
# tool has no flag: a Read of a source file by the pilot is refused, and the flagged
# `sed -n 'A,Bp'` is the way through when a reading is really wanted.
set -u

# The extensions of a source or test file: one list for the file test and the tree test.
PILOT_SOURCE_EXTS="cs csx fs fsx vb ts tsx js jsx mjs cjs py go rs java kt kts rb php c h cc cpp hpp swift scala sql ps1 sh"

pilot_is_source() {
  local lower ext
  lower=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$lower" in *.*) ;; *) return 1 ;; esac
  ext=${lower##*.}
  case " $PILOT_SOURCE_EXTS " in *" $ext "*) return 0 ;; esac
  return 1
}

# $1 a directory: does it hold a source or test file within three levels? One find that stops at the
# first hit, `.git`, `node_modules`, `bin` and `obj` pruned.
pilot_dir_has_source() {
  [ -d "$1" ] || return 1
  local ext names=() first
  for ext in $PILOT_SOURCE_EXTS; do names+=(-o -iname "*.$ext"); done
  first=$(find "$1" -maxdepth 3 \( -name .git -o -name node_modules -o -name bin -o -name obj \) -prune \
    -o -type f \( -false "${names[@]}" \) -print -quit 2>/dev/null)
  [ -n "$first" ]
}

# $1 agent_type  $2 agent_id  $3 transcript_path (the main conversation's)
pilot_active() {
  [ "${HARNESS_PILOT_GUARD:-0}" = "1" ] || return 1
  local agent_type=$1 agent_id=$2 transcript=$3 last dash
  [ "$agent_type" = "dev-batch" ] && return 0
  [ -z "$agent_id" ] || return 1
  [ -n "$transcript" ] && [ -f "$transcript" ] || return 1
  # The dash of the closing line is written raw (UTF-8: Claude Code escapes nothing) or as the JSON
  # escape \u2014. GNU grep 3.8 has no \xHH escape in an ERE: the raw bytes go in through printf.
  dash=$(printf '\xe2\x80\x94')
  last=$(LC_ALL=C grep -oE "<command-name>/(dev-implement|clear)</command-name>|Batch F[0-9]+ complete ($dash|\\\\u2014) manual validation required" "$transcript" 2>/dev/null | tail -n 1)
  case "$last" in *dev-implement*) return 0 ;; esac
  return 1
}

# $1 what was asked for: a path, or `<folder> (a search through the code)`.
pilot_reason() {
  local subject
  case "$1" in
    *"(a search through the code)") subject="${1% (a search through the code)} is a search through the code" ;;
    *) subject="$1 is a source or test file" ;;
  esac
  printf '%s' "guard-pilot-reads: $subject, and this context orchestrates a batch (/dev-implement: you open no source or test file; a dev-batch agent: never). Its content is the role's: the RED and GREEN contracts carry path:line copied from the sheet's ## Anchors and the step's table; a path you doubt gets one ls; a question about the code goes back to the agent of the cycle (SendMessage) or to an Explore agent (model haiku, description set, report bounded). To read it anyway, on purpose: HARNESS_FORCE_READ=1 in front of a sed -n 'A,Bp' in Bash — or HARNESS_PILOT_GUARD=0 in .claude/settings.local.json when this context carries no batch."
}
