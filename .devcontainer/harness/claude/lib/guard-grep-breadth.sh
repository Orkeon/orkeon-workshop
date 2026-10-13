#!/bin/bash
# bash-dispatch module — a recursive grep with many alternatives is refused, its `-l` form handed
# back (S0 of the reading plan, 2026-10-13).
#
# SWE-agent measured it (Yang et al., NeurIPS 2024): a search that returns every match of every
# pattern loses six points to one that caps its results and asks for a sharper query. Measured here
# (2026-10-12/13): `grep -rn -E 'A|B|…'` with twelve or fourteen alternatives over src and tests cost
# 4 300 to 5 300 tokens a call, and the agent that ran them ended on `grep -rln …` (56 tokens) - the
# file list it wanted first.
#
# Scope: a simple grep, egrep or fgrep over a tree (a directory argument, no path at all, or `-r`, `-R`,
# `--recursive` on anything but plain files) or an rg (recursive by default, the same tree test), whose
# patterns count more than
# HARNESS_GREP_PATTERNS_MAX alternatives: one per `-e`/`--regexp`, plus the `|` of an extended
# pattern (-E, -P, egrep, rg) or the `\|` of a basic one; `-F` and fgrep take `|` as a letter. A grep
# that lists files or counts (`-l`, `-L`, `-c`, `-q`, `--files-with-matches`, `--files-without-match`,
# `--count`, `--quiet`, rg `--files`) passes: it answers with names or a number. A pattern read from
# a file (`-f`) is not counted. A pipe after the grep (`| head`, `| wc -l`) bounds it: passes; a
# redirect to a file passes (`2>/dev/null` is not one). Flagged `HARNESS_FORCE_READ=1`: passes. HARNESS_GREP_PATTERNS_MAX `0` turns the module off.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
max=${HARNESS_GREP_PATTERNS_MAX:-4}
case "$max" in ''|*[!0-9]*) max=4 ;; esac
[ "$max" -gt 0 ] || exit 0
case "$cmd" in *grep*|*rg*) ;; *) exit 0 ;; esac

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bounds-common.sh
. "$LIB/bounds-common.sh"

bounds_forced "$cmd" && exit 0

set -f

unquote() {
  local s=$1
  case "$s" in
    \'*\') s=${s#\'}; s=${s%\'} ;;
    \"*\") s=${s#\"}; s=${s%\"} ;;
  esac
  printf '%s' "$s"
}

is_dir() {
  [ -d "$1" ] && return 0
  case "$1" in /*) return 1 ;; esac
  [ -n "${HOOK_CWD:-}" ] && [ -d "${HOOK_CWD%/}/$1" ]
}

is_file() {
  [ -f "$1" ] && return 0
  case "$1" in /*) return 1 ;; esac
  [ -n "${HOOK_CWD:-}" ] && [ -f "${HOOK_CWD%/}/$1" ]
}

# The alternatives of one pattern: the `|` of an extended pattern, the `\|` of a basic one, one for
# a fixed string.
alternatives() {
  local pattern=$1 mode=$2 n
  case "$mode" in
    fixed) n=1 ;;
    extended) n=$(printf '%s' "$pattern" | awk '{ s = $0; gsub(/\\\|/, "", s); print gsub(/\|/, "", s) + 1 }') ;;
    *)        n=$(printf '%s' "$pattern" | awk '{ s = $0; print gsub(/\\\|/, "", s) + 1 }') ;;
  esac
  printf '%s' "${n:-1}"
}

hit_verb=""
hit_rest=""
hit_count=0
hit_paths=""
while IFS= read -r segment; do
  segment="${segment#"${segment%%[![:space:]]*}"}"
  case "$segment" in
    grep\ *|egrep\ *|fgrep\ *|rg\ *) ;;
    *) continue ;;
  esac
  stripped=$(printf '%s' "$segment" | sed -E 's/2>&1//g; s/2>[[:space:]]*[^[:space:]]+//g')
  case "$stripped" in *\>*) continue ;; esac

  # shellcheck disable=SC2086
  set -- $segment
  verb=$1
  shift
  rest="${segment#"$verb"}"
  rest="${rest#"${rest%%[![:space:]]*}"}"

  # Glue the words of a quoted pattern (`'class A|class B'` with spaces); a pipe after the grep
  # consumes its output and bounds it.
  words=()
  open=""
  acc=""
  piped=""
  for w in "$@"; do
    if [ -n "$open" ]; then
      acc="$acc $w"
      case "$w" in *"$open") words+=("$acc"); open=""; acc="" ;; esac
      continue
    fi
    case "$w" in
      \|) piped=1; break ;;
      \'|\")       open=$w; acc=$w ;;
      \'*\'|\"*\") words+=("$w") ;;
      \'*)         open=\'; acc=$w ;;
      \"*)         open=\"; acc=$w ;;
      *)           words+=("$w") ;;
    esac
  done
  [ -n "$open" ] && words+=("$acc")
  [ -n "$piped" ] && continue

  mode=basic
  recursive=""
  listing=""
  skip=""
  count=0
  patterns_given=""
  paths=()
  take_pattern=""
  skip_next=""
  case "$verb" in egrep|rg) mode=extended ;; fgrep) mode=fixed ;; esac
  [ "$verb" = rg ] && recursive=1
  for arg in ${words[@]+"${words[@]}"}; do
    if [ -n "$skip_next" ]; then skip_next=""; continue; fi
    if [ -n "$take_pattern" ]; then
      take_pattern=""
      count=$(( count + $(alternatives "$(unquote "$arg")" "$mode") ))
      patterns_given=1
      continue
    fi
    case "$arg" in
      -r|-R|--recursive|--dereference-recursive) recursive=1 ;;
      -E|--extended-regexp|-P|--perl-regexp) mode=extended ;;
      -F|--fixed-strings) mode=fixed ;;
      -l|-L|-c|-q|--files-with-matches|--files-without-match|--count|--count-matches|--quiet|--silent|--files) listing=1 ;;
      -f|--file|--file=*) skip=1; break ;;
      -e|--regexp) take_pattern=1 ;;
      --regexp=*) count=$(( count + $(alternatives "$(unquote "${arg#--regexp=}")" "$mode") )); patterns_given=1 ;;
      # An option whose value is the next word (-A 25, --include '*.cs'): that word is no pattern and no path.
      -A|-B|-C|-m|-g|-t|-T|-j|--include|--exclude|--exclude-dir|--glob|--type|--type-not|--threads|--max-count|--max-depth|--context|--after-context|--before-context) skip_next=1 ;;
      --*) ;;
      -[A-Za-z0-9]*)
        # Combined short flags: -rnE, -rl, -nA 25. `f` reads the patterns from a file.
        case "$arg" in *f*) skip=1 ;; esac
        [ -n "$skip" ] && break
        case "$arg" in *[rR]*) recursive=1 ;; esac
        case "$arg" in *[EP]*) mode=extended ;; esac
        case "$arg" in *F*) mode=fixed ;; esac
        case "$arg" in *[lLcq]*) listing=1 ;; esac
        case "$arg" in *e) take_pattern=1 ;; -[A-Za-z]*[ABCmgtTj]) skip_next=1 ;; esac ;;
      -*) ;;
      *)
        if [ -z "$patterns_given" ]; then
          count=$(alternatives "$(unquote "$arg")" "$mode")
          patterns_given=1
        else
          paths+=("$(unquote "$arg")")
        fi ;;
    esac
  done
  [ -n "$skip" ] && continue
  [ -n "$listing" ] && continue
  [ -n "$patterns_given" ] || continue
  [ "$count" -gt "$max" ] || continue

  # Over a tree: no path at all, a directory among the paths, or a recursive flag on anything but
  # plain files (`grep -rnE 'A|B|C|D|E' One.cs` searches one file, whatever its flags).
  tree=""
  if [ "${#paths[@]}" -eq 0 ]; then
    tree=1
  else
    plain=1
    for p in "${paths[@]}"; do
      is_dir "$p" && { tree=1; break; }
      is_file "$p" || plain=""
    done
    [ -z "$tree" ] && [ -n "$recursive" ] && [ -z "$plain" ] && tree=1
  fi
  [ -n "$tree" ] || continue

  hit_verb=$verb
  hit_rest=$rest
  hit_count=$count
  hit_paths="${paths[*]:-.}"
  break
done <<< "$(printf '%s' "$cmd" | tr ';&' '\n\n')"

[ -n "$hit_verb" ] || exit 0

reason="guard-grep-breadth: $hit_count patterns in one recursive $hit_verb over $hit_paths (HARNESS_GREP_PATTERNS_MAX $max). Every match of every pattern lands in context and stays there; what such a search wants first is the files. List them: $hit_verb -l $hit_rest — then one grep -n of one pattern on one file, or hand the map to an Explore agent (model haiku, description set, report bounded). To run it as written: HARNESS_FORCE_READ=1 in front of the command."

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
