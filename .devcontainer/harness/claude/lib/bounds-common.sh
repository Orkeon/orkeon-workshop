#!/bin/bash
# Shared body of the two bound guards: hooks/read-bounds.sh (Read tool) and
# lib/guard-cat-bounds.sh (bare `cat` through the Bash dispatcher).
#
# Adapted from claude-code-toolkit/lib/bounds-common.sh (MIT, see THIRD-PARTY.md).
# One file for both guards: when the two carried their own copy of the thresholds,
# the skip lists and the outline block, they diverged (a `cat` of a package passed
# while a `Read` of the same file was denied). Everything a fix would have to be
# applied to twice lives here.
#
# Sourced, not executed. Callers keep only what genuinely differs: the tool named
# in the refusal, the sentence telling how to read a range, the sentence telling
# how to force.
set -u

BOUNDS_THRESHOLD=${HARNESS_READ_BOUNDS_LINES:-120}
BOUNDS_BYTES=${HARNESS_READ_BOUNDS_BYTES:-8000}
BOUNDS_OUTLINE_MAX=${HARNESS_READ_BOUNDS_OUTLINE:-40}
BOUNDS_FLAT_PCT=${HARNESS_BOUNDS_FLAT_PCT:-33}

# Third way out, after the bounded read and the forcing: a question about the
# file (what it does, which ids it covers, which tools it names) goes to a
# subagent whose reads stay in its own context.
BOUNDS_DELEGATE="A question about the file rather than an edit: delegate it to an Agent (model haiku, description set, report bounded) — its reads never enter this context."

bounds_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# Binary or rendered: the tool reads them natively and an outline of one is noise.
bounds_is_binary() {
  case "$(bounds_lower "$1")" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.bmp|*.svg|*.pdf|*.ipynb|*.zip|*.nupkg|*.docx|*.xlsx|*.eml.gz) return 0 ;;
  esac
  return 1
}

# Instruction files: read whole or not at all. A skill, an agent charter, a rule,
# a CLAUDE.md, the harness entry point or a reference document carries conventions that only hold as a
# set — half of one is worse than none, because nothing tells the reader which
# half it missed. The references under references/ are what the skills are
# required to read in full before designing a team.
bounds_is_instruction() {
  case "$1" in
    */skills/*.md|*/agents/*.md|*/rules/*.md|*/CLAUDE.md|CLAUDE.md|*/harness/HARNESS.md|HARNESS.md|*/references/*.md|*/templates/*) return 0 ;;
  esac
  return 1
}

bounds_skip() {
  bounds_is_binary "$1" && return 0
  bounds_is_instruction "$1" && return 0
  return 1
}

# The declarations of a file, line-numbered. Shipped with the refusal: a denial
# that only names the alternative makes re-issuing the shortest path, and
# re-issuing is what happens. With the map, the bounded read costs the same
# single turn as forcing.
bounds_outline() {
  local file=$1 outline_re
  case "$(bounds_lower "$file")" in
    *.cs)   outline_re='^[[:space:]]*(public|internal|protected|private|\[Fact|\[Theory|\[Test|namespace |.*(class|record|interface|enum) )' ;;
    *.ts|*.tsx|*.js|*.jsx) outline_re='^[[:space:]]*(export|function |class |const [A-Za-z_]+ = |describe\(|it\(|test\()' ;;
    *.py)   outline_re='^(def |class |[A-Z_][A-Z0-9_]* = )' ;;
    *.yaml|*.yml) outline_re='^[A-Za-z_][A-Za-z0-9_-]*:' ;;
    *.md)   outline_re='^#{1,4} ' ;;
    *.json) outline_re='^[[:space:]]{0,4}"[^"]+"[[:space:]]*:' ;;
    *.jsonl) outline_re='"(kind|event|type)"[[:space:]]*:[[:space:]]*"[^"]+"' ;;
    *)      outline_re='^[^[:space:]#]' ;;
  esac
  grep -nE "$outline_re" "$file" 2>/dev/null | head -"$BOUNDS_OUTLINE_MAX" | cut -c1-160
}

# A flat file: its declarations alone weigh a third of it. There is nothing to
# skip, so the bounded read takes almost all of it back and the outline is paid
# on top. Density, not size and not the name. Called after the size test: this
# runs a grep, and the hot path is the small file the size test already lets
# through.
bounds_is_flat() {
  local bytes outline_bytes
  bytes=$(wc -c < "$1" 2>/dev/null | tr -d ' ')
  [ "${bytes:-0}" -gt 0 ] || return 1
  outline_bytes=$(bounds_outline "$1" | wc -c | tr -d ' ')
  [ $(( ${outline_bytes:-0} * 100 )) -ge $(( bytes * BOUNDS_FLAT_PCT )) ]
}

# Builds the whole refusal.
#   $1 header       "Unbounded Read on <path> (N lines > T). ..."
#   $2 path         the file the outline is computed from
#   $3 with_map     what to do given the outline ("Read the range you need ...")
#   $4 without_map  what to do when no outline could be produced
#   $5 force        how to force the full read
bounds_reason() {
  local header=$1 file=$2 with_map=$3 without_map=$4 force=$5 outline
  outline=$(bounds_outline "$file")
  if [ -n "$outline" ]; then
    printf '%s Its declarations, line-numbered — %s:\n\n%s\n\n%s\n%s\n' \
      "$header" "$with_map" "$outline" "$force" "$BOUNDS_DELEGATE"
  else
    printf '%s %s\n\n%s\n%s\n' "$header" "$without_map" "$force" "$BOUNDS_DELEGATE"
  fi
}
