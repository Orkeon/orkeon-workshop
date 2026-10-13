#!/bin/bash
# bash-dispatch module — the pilot of a batch reads no source or test file (S0, 2026-10-13).
#
# lib/pilot-common.sh says who the pilot is and why. Here: which Bash commands are a reading.
#   - a simple command cat, head, tail, sed, awk, nl, less, more, bat, grep, egrep, fgrep or rg whose
#     arguments name a source file (by extension), the part before a pipe included (`cat X.cs | head`
#     is a reading of X.cs), without a redirect to a file (`> f` never enters the context;
#     `2>/dev/null` is no such redirect);
#   - a grep or rg over the code: `--include=*.cs`; a recursive flag (`-r`, `-R`, `--recursive`; rg
#     always) with a directory holding source files (pilot_dir_has_source) or with no path at all (the
#     working directory, a checkout) - the search through the code the skill forbids ("never a grep").
#     A tree of sheets and notes (`grep -rn F3 todo/x`) is the pilot's own and passes;
#   - `ls`, `wc`, `git`, `dotnet`, `python3 … access-cost.py <file>` are not readings and pass.
# Flagged `HARNESS_FORCE_READ=1`: passes. The deny is terminal; the module sits before
# guard-cat-bounds so that the pilot gets this refusal, not the bounds one. A path is tested for its
# extension before the transcript is looked at: the grep over the transcript is paid only when a
# command names a source file.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
[ "${HARNESS_PILOT_GUARD:-0}" = "1" ] || exit 0
case "$cmd" in *cat*|*head*|*tail*|*sed*|*awk*|*grep*|*rg*|*nl*|*less*|*more*|*bat*) ;; *) exit 0 ;; esac

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bounds-common.sh
. "$LIB/bounds-common.sh"
# shellcheck source=pilot-common.sh
. "$LIB/pilot-common.sh"

bounds_forced "$cmd" && exit 0

# A pattern carries `*` and `[`: no globbing of the words below.
set -f

unquote() {
  local s=$1
  case "$s" in
    \'*\') s=${s#\'}; s=${s%\'} ;;
    \"*\") s=${s#\"}; s=${s%\"} ;;
  esac
  printf '%s' "$s"
}

# $1 a word of the command: an existing directory (as given, or under the hook's cwd) holding code?
code_dir() {
  local d=$1
  if [ ! -d "$d" ]; then
    case "$d" in /*) return 1 ;; esac
    [ -n "${HOOK_CWD:-}" ] || return 1
    d="${HOOK_CWD%/}/$d"
    [ -d "$d" ] || return 1
  fi
  pilot_dir_has_source "$d"
}

hit=""
while IFS= read -r segment; do
  segment="${segment#"${segment%%[![:space:]]*}"}"
  case "$segment" in
    cat\ *|head\ *|tail\ *|sed\ *|awk\ *|nl\ *|less\ *|more\ *|bat\ *|grep\ *|egrep\ *|fgrep\ *|rg\ *) ;;
    *) continue ;;
  esac
  # A redirect to a file (`> out`, `>> log`) never enters the context; `2>/dev/null` and `2>&1` are not one.
  stripped=$(printf '%s' "$segment" | sed -E 's/2>&1//g; s/2>[[:space:]]*[^[:space:]]+//g')
  case "$stripped" in *\>*) continue ;; esac

  # shellcheck disable=SC2086
  set -- $segment
  verb=$1
  shift
  # Glue the words of a quoted script or pattern (`'^### Step 2 '`), stop at the pipe: what follows
  # it consumes the reading, it does not make one.
  words=()
  open=""
  acc=""
  for w in "$@"; do
    if [ -n "$open" ]; then
      acc="$acc $w"
      case "$w" in *"$open") words+=("$acc"); open=""; acc="" ;; esac
      continue
    fi
    case "$w" in
      \|) break ;;
      \'|\")       open=$w; acc=$w ;;
      \'*\'|\"*\") words+=("$w") ;;
      \'*)         open=\'; acc=$w ;;
      \"*)         open=\"; acc=$w ;;
      *)           words+=("$w") ;;
    esac
  done
  [ -n "$open" ] && words+=("$acc")

  recursive=""
  case "$verb" in rg|grep|egrep|fgrep) searcher=1 ;; *) searcher="" ;; esac
  case "$verb" in rg) recursive=1 ;; esac
  positionals=0
  for arg in ${words[@]+"${words[@]}"}; do
    arg=$(unquote "$arg")
    case "$arg" in
      -r|-R|--recursive|--dereference-recursive) recursive=1; continue ;;
      --include=*)
        if pilot_is_source "${arg#--include=}"; then hit="${arg#--include=} (a search through the code)"; break; fi
        continue ;;
      --*) continue ;;
      -[A-Za-z]*)
        if [ -n "$searcher" ]; then case "$arg" in *[rR]*) recursive=1 ;; esac; fi
        continue ;;
      -*) continue ;;
    esac
    positionals=$(( positionals + 1 ))
    if pilot_is_source "$arg"; then hit=$arg; break; fi
    if [ -n "$searcher" ] && [ -n "$recursive" ] && [ "$positionals" -ge 2 ] && code_dir "$arg"; then
      hit="$arg (a search through the code)"
      break
    fi
  done
  # A recursive search with a pattern and no path reads the working directory.
  if [ -z "$hit" ] && [ -n "$searcher" ] && [ -n "$recursive" ] && [ "$positionals" -le 1 ]; then
    hit=". (a search through the code)"
  fi
  [ -n "$hit" ] && break
done <<< "$(printf '%s' "$cmd" | tr ';&' '\n\n')"

[ -n "$hit" ] || exit 0
pilot_active "${HOOK_AGENT_TYPE:-}" "${HOOK_AGENT_ID:-}" "${HOOK_TRANSCRIPT_PATH:-}" || exit 0

jq -n --arg r "$(pilot_reason "$hit")" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
