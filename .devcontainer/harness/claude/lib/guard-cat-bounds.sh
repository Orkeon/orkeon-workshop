#!/bin/bash
# bash-dispatch module — require a bounded read when `cat` dumps a large file.
#
# Adapted from claude-code-toolkit/lib/guard-cat-bounds.sh (MIT, see THIRD-PARTY.md).
# read-bounds.sh guards the Read tool and has no reach over Bash; a file dumped
# with `cat` is carried to the end of the session exactly like an unbounded Read.
#
# Scope is deliberately narrow, to keep false positives at zero:
#   - only a simple `cat`, `head`, `tail`, `sed` or `awk` command, no pipe
#     (`cat f | grep x` is already bounded by grep) and no redirect (`cat f > out`
#     never enters the context). `head`/`tail` count for the span they ask for:
#     `head -20 f` is a bounded read and passes, `head -n 5000 f` or `tail -n +1 f`
#     is a dump in disguise and is measured like a `cat`;
#   - `sed -n 'A,Bp' f` counts for the range it asks for, like `head -n`;
#     `sed -n 'A,$p' f` from A to the end, like `tail -n +A`; `sed -n '1,$p' f`,
#     or a `sed` without `-n` (every line is printed, `sed 's/a/b/' f`), is
#     measured like a `cat`. A regex range (`sed -n '/^### Step 1 /,/^##/p' f`),
#     a single address, `-i` or a script read from a file is not measured: its
#     span cannot be known here, and the first two are the bounded idioms the
#     refusals recommend (2026-10-12, plan A3);
#   - `awk '{print}' f`, `awk '{print $0}' f` or `awk 1 f` — the identity
#     program — is measured like a `cat`. Any other awk program (a filter, a
#     `NR` range) passes;
#   - only files past the line threshold, or past the byte one (Markdown wraps
#     at the paragraph: a line count alone waves an 18 kB report through);
#   - binary/rendered formats and instruction files are left alone.
#
# Escape hatch, same shape as read-bounds.sh: the denial is recorded per
# (agent, file), so re-issuing the identical command passes through. Scoped to
# the agent that asked — never handed to its siblings.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0

case "$cmd" in *cat*|*head*|*tail*|*sed*|*awk*) ;; *) exit 0 ;; esac

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bounds-common.sh
. "$LIB/bounds-common.sh"

# A sed or awk script carries `*` and `[`: the word splitting below must not
# glob them against the working directory. The module runs in the dispatcher's
# command substitution, so the switch dies with it.
set -f

# Strips the quotes a script was typed with: '1,200p' or "1,200p" -> 1,200p.
unquote() {
  local s=$1
  case "$s" in
    \'*\') s=${s#\'}; s=${s%\'} ;;
    \"*\") s=${s#\"}; s=${s%\"} ;;
  esac
  printf '%s' "$s"
}

# Split on the separators that start a new simple command. A `cd x; cat big.md`
# must be seen as a bare `cat`, not as a `cd`.
oversized=""
verb_of_hit=""
lines_of_hit=""
bytes_of_hit=""
while IFS= read -r segment; do
  segment="${segment#"${segment%%[![:space:]]*}"}"
  case "$segment" in
    cat\ *|head\ *|tail\ *|sed\ *|awk\ *) ;;
    *) continue ;;
  esac
  case "$segment" in
    *\|*|*\>*) continue ;;
  esac

  # shellcheck disable=SC2086
  set -- $segment
  verb=$1
  shift
  # A quoted script with spaces (`awk '{ print $0 }'`, `sed -n '/^### Step 1 /,/^##/p'`)
  # was split into words: glue the words between an opening and a closing quote.
  if [ "$verb" = sed ] || [ "$verb" = awk ]; then
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
        \'|\")                  open=$w; acc=$w ;;
        \'*\'|\"*\")             words+=("$w") ;;
        \'*)                     open=\'; acc=$w ;;
        \"*)                     open=\"; acc=$w ;;
        *)                       words+=("$w") ;;
      esac
    done
    [ -n "$open" ] && words+=("$acc")
    set -- ${words[@]+"${words[@]}"}
  fi

  # The span head/tail ask for: -n N, -nN, -N, --lines=N, -c N, -cN, --bytes=N,
  # and `-n +K` (tail: from line K to the end). `cat` has no span: the whole file.
  # For sed: `quiet` says -n was given, `script` is the one script seen, `skip`
  # marks a segment that prints nothing (-i) or whose span cannot be known.
  # For awk: `script` is the program; `skip` marks -f or a program that filters.
  span=""
  from=""
  span_bytes=""
  quiet=""
  script=""
  skip=""
  files=()
  while [ $# -gt 0 ]; do
    arg=$1
    shift
    v=""
    case "$verb" in
      sed)
        case "$arg" in
          -i*|--in-place*) skip=1; break ;;
          -n|--quiet|--silent) quiet=1; continue ;;
          -e|--expression) [ -n "$script" ] && skip=1; script=$(unquote "${1:-}"); [ $# -gt 0 ] && shift; continue ;;
          --expression=*) [ -n "$script" ] && skip=1; script=$(unquote "${arg#--expression=}"); continue ;;
          -f|--file) skip=1; break ;;
          -[A-Za-z]*)
            # Combined short flags: -ne '…', -nE, -rn. `n` means quiet, a
            # trailing `e` takes the next word as the script, `i` or `f` skips.
            case "$arg" in *i*|*f*) skip=1; break ;; esac
            case "$arg" in *n*) quiet=1 ;; esac
            case "$arg" in *e) [ -n "$script" ] && skip=1; script=$(unquote "${1:-}"); [ $# -gt 0 ] && shift ;; esac
            continue ;;
          --*) continue ;;
          *) if [ -z "$script" ]; then script=$(unquote "$arg"); else files+=("$arg"); fi; continue ;;
        esac ;;
      awk)
        case "$arg" in
          -f|--file) skip=1; break ;;
          -F|-v) [ $# -gt 0 ] && shift; continue ;;
          -*) continue ;;
          *) if [ -z "$script" ]; then script=$(unquote "$arg"); else files+=("$arg"); fi; continue ;;
        esac ;;
    esac
    case "$arg" in
      -n|--lines) v=${1:-}; [ $# -gt 0 ] && shift ;;
      -c|--bytes) span_bytes=${1:-}; [ $# -gt 0 ] && shift; continue ;;
      --lines=*) v=${arg#--lines=} ;;
      --bytes=*) span_bytes=${arg#--bytes=}; continue ;;
      -n*) v=${arg#-n} ;;
      -c*) span_bytes=${arg#-c}; continue ;;
      -[0-9]*) v=${arg#-} ;;
      -*) continue ;;
      *) files+=("$arg"); continue ;;
    esac
    case "$v" in
      +*) from=${v#+} ;;
      *) span=$v ;;
    esac
  done
  [ -n "$skip" ] && continue
  case "$span" in ''|*[!0-9]*) span="" ;; esac
  case "$from" in ''|*[!0-9]*) from="" ;; esac
  case "$span_bytes" in ''|*[!0-9]*) span_bytes="" ;; esac

  # What a sed or awk script prints, before the file is looked at:
  #   whole  - every line (sed without -n, sed -n '1,$p', the awk identity)
  #   A B    - the line range of sed -n 'A,Bp' (B empty: to the end)
  #   skip   - not measured
  shape=""
  case "$verb" in
    sed)
      [ -n "$script" ] || continue
      if [ -z "$quiet" ]; then
        shape=whole
      else
        case "$script" in
          *[!0-9,\$+p]*) continue ;;   # a regex, a command list, a single `p` of something else
        esac
        case "$script" in
          1,\$p) shape=whole ;;
          *,\$p) from=${script%,\$p}; shape=range ;;
          *,+*p) a=${script%%,*}; k=${script#*,+}; k=${k%p}
                 case "$a$k" in ''|*[!0-9]*) continue ;; esac
                 from=$a; span=$(( k + 1 )); shape=range ;;
          *,*p)  a=${script%%,*}; b=${script#*,}; b=${b%p}
                 case "$a$b" in ''|*[!0-9]*) continue ;; esac
                 [ "$b" -ge "$a" ] || continue
                 from=$a; span=$(( b - a + 1 )); shape=range ;;
          *) continue ;;               # one address: one line
        esac
        if [ "$shape" = range ]; then
          case "$from" in ''|*[!0-9]*) continue ;; esac
        fi
      fi ;;
    awk)
      [ -n "$script" ] || continue
      case "$(printf '%s' "$script" | tr -d '[:space:];')" in
        '{print}'|'{print$0}'|1) shape=whole ;;
        *) continue ;;
      esac ;;
  esac

  for arg in ${files[@]+"${files[@]}"}; do
    [ -f "$arg" ] || continue
    bounds_skip "$arg" && continue
    n=$(wc -l < "$arg" 2>/dev/null | tr -d ' ')
    bytes=$(wc -c < "$arg" 2>/dev/null | tr -d ' ')
    [ -n "$n" ] || continue
    bytes=${bytes:-0}

    # What actually reaches the context: the whole file for cat, the span for
    # head/tail, clipped to the file. Bytes of a line span are prorated.
    eff_lines=$n
    eff_bytes=$bytes
    case "$verb" in
      head|tail)
        if [ "$verb" = tail ] && [ -n "$from" ]; then
          eff_lines=$(( n - from + 1 ))
          [ "$eff_lines" -lt 0 ] && eff_lines=0
        elif [ -n "$span" ]; then
          eff_lines=$span
          [ "$eff_lines" -gt "$n" ] && eff_lines=$n
        elif [ -n "$span_bytes" ]; then
          eff_lines=0
        else
          eff_lines=10
        fi
        if [ -n "$span_bytes" ] && [ -z "$span" ] && [ -z "$from" ]; then
          eff_bytes=$span_bytes
          [ "$eff_bytes" -gt "$bytes" ] && eff_bytes=$bytes
        elif [ "$n" -gt 0 ]; then
          eff_bytes=$(( bytes * eff_lines / n ))
        else
          eff_bytes=0
        fi ;;
      sed|awk)
        if [ "$shape" = range ]; then
          # Lines from `from`, `span` of them (empty span: to the end), clipped.
          if [ "$from" -gt "$n" ]; then
            eff_lines=0
          elif [ -n "$span" ]; then
            eff_lines=$span
            [ $(( from + eff_lines - 1 )) -gt "$n" ] && eff_lines=$(( n - from + 1 ))
          else
            eff_lines=$(( n - from + 1 ))
          fi
          if [ "$n" -gt 0 ]; then
            eff_bytes=$(( bytes * eff_lines / n ))
          else
            eff_bytes=0
          fi
        fi ;;
    esac

    if [ "$eff_lines" -le "$BOUNDS_THRESHOLD" ] 2>/dev/null && [ "$eff_bytes" -le "$BOUNDS_BYTES" ] 2>/dev/null; then
      continue
    fi
    if [ "$eff_lines" -ge "$n" ]; then
      bounds_is_flat "$arg" && continue
    fi
    oversized="$arg"
    verb_of_hit="$verb"
    lines_of_hit="$eff_lines"
    bytes_of_hit="$eff_bytes"
    break
  done
  [ -n "$oversized" ] && break
done <<< "$(printf '%s' "$cmd" | tr ';&' '\n\n')"

[ -n "$oversized" ] || exit 0

# Same per-agent scoping as read-bounds.sh: agent_id is the only per-agent
# field, the main chain has none and falls back to the session.
seen_file="/tmp/claude-catbounds-seen-${HOOK_SESSION_ID:-unknown}${HOOK_AGENT_ID:+-$HOOK_AGENT_ID}"
if [ -f "$seen_file" ] && grep -Fxq "$oversized" "$seen_file" 2>/dev/null; then
  echo "$oversized" >> "${seen_file}.forced"
  exit 0
fi
echo "$oversized" >> "$seen_file"

reason=$(bounds_reason \
  "Unbounded $verb_of_hit on $oversized ($lines_of_hit lines, $bytes_of_hit bytes > $BOUNDS_THRESHOLD lines / $BOUNDS_BYTES bytes). Everything dumped stays in context until the session ends." \
  "$oversized" \
  "read the range you need with sed -n 'A,Bp' around one of them" \
  "Locate the range first (grep -n), then read it with sed -n 'A,Bp' or Read with offset/limit." \
  "Re-issue this exact command to force the full dump.")

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
