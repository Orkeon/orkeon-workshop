#!/bin/bash
# check-skills.sh — the shape of every skill of the harness (D89: a skill is short, cites files that
# exist, and names bench commands the bench serves).
#
#   bash evals/check-skills.sh [<skills folder>]     # default: claude/skills beside this runner
#
# For every <skills>/<name>/SKILL.md:
#   - the front matter opens the file (`---`, `name: <folder name>`, a non-empty `description:`, `---`);
#   - the file holds at most 220 lines (HARNESS_SKILL_MAX_LINES);
#   - every harness path it cites exists: `references/…`, `.claude/…` (read as `claude/…` of the
#     harness; `.claude/harness/<file>` as the top-level file; `.claude/local/…`,
#     `.claude/settings.local.json` and `.claude/agent-memory*` are a workshop's own and are not checked);
#   - it says "never" at most 8 times (HARNESS_SKILL_MAX_NEVER): a rule is said once, in one place;
#   - every `orkeon-bench <command>` it names is a command `orkeon-bench --help` lists — when the bench
#     is on the PATH; otherwise that check is skipped and said so.
# Output: one `FAIL <skill> — <why>` line per problem, then `check-skills: <n> skills, <m> problems`;
# exit 0 when none, 1 otherwise, 2 when the folder is missing. Called by the eval case `check-skills`.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$HERE/../claude" ]; then HARNESS="$(cd "$HERE/.." && pwd)"; CLAUDE="$HARNESS/claude"
else CLAUDE="$(cd "$HERE/.." && pwd)"; HARNESS="$CLAUDE/harness"; fi
SKILLS="${1:-$CLAUDE/skills}"
[ -d "$SKILLS" ] || { echo "check-skills: no skills folder at $SKILLS" >&2; exit 2; }
MAX_LINES="${HARNESS_SKILL_MAX_LINES:-220}"
MAX_NEVER="${HARNESS_SKILL_MAX_NEVER:-8}"

bench_cmds=""
if command -v orkeon-bench >/dev/null 2>&1; then
  bench_cmds=$(orkeon-bench --help 2>/dev/null | awk '/^Commands:/{c=1; next} c && /^[[:space:]]+[a-z]/{print $1} c && /^$/{c=0}' | sed 's/|.*//' | sort -u | tr '\n' ' ')
fi

skills=0; problems=0
fail() { problems=$((problems + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }

# A cited path, as the skills write it, to a path on disk; prints nothing for a path not checked.
resolve() {
  case "$1" in
    .claude/local/*|.claude/settings.local.json|.claude/agent-memory*|.claude/run-log.tsv|.claude/evals/.fixtures*) ;;
    .claude/evals/*) printf '%s/evals/%s' "$HARNESS" "${1#.claude/evals/}" ;;
    .claude/harness/*) printf '%s/%s' "$HARNESS" "${1#.claude/harness/}" ;;
    .claude/*) printf '%s/%s' "$CLAUDE" "${1#.claude/}" ;;
    references/*) printf '%s/%s' "$HARNESS" "$1" ;;
  esac
}

for dir in "$SKILLS"/*/; do
  name=$(basename "$dir")
  f="$dir/SKILL.md"
  [ -f "$f" ] || { fail "$name" "no SKILL.md"; continue; }
  skills=$((skills + 1))

  # Front matter.
  if [ "$(sed -n '1p' "$f")" != "---" ]; then
    fail "$name" "the file does not open on a front matter (\`---\`)"
  else
    close=$(awk 'NR>1 && /^---[ \t]*$/{print NR; exit}' "$f")
    if [ -z "$close" ]; then
      fail "$name" "the front matter never closes"
    else
      fm=$(sed -n "2,$((close - 1))p" "$f")
      printf '%s\n' "$fm" | grep -qE "^name:[ \t]*\"?$name\"?[ \t]*$" || fail "$name" "the front matter's \`name:\` is not \`$name\`"
      printf '%s\n' "$fm" | grep -qE '^description:[ \t]*"?[^" \t]' || fail "$name" "the front matter has no \`description:\`"
    fi
  fi

  # Length.
  lines=$(wc -l < "$f" | tr -d ' ')
  [ "$lines" -le "$MAX_LINES" ] || fail "$name" "$lines lines, more than $MAX_LINES (HARNESS_SKILL_MAX_LINES)"

  # Cited paths. A placeholder (`<slug>`, `*`, `{{…}}`) is not a path; a trailing punctuation is dropped.
  while IFS= read -r cited; do
    [ -n "$cited" ] || continue
    case "$cited" in *'<'*|*'*'*|*'{{'*|*'$'*) continue ;; esac
    target=$(resolve "$cited")
    [ -n "$target" ] || continue
    [ -e "$target" ] || fail "$name" "cites \`$cited\`, which does not exist in the harness"
  done < <(grep -oE '(^|[^A-Za-z0-9_./-])(references|\.claude)/[A-Za-z0-9_.<>{}*$/-]*' "$f" | sed -E 's/^[^A-Za-z.]//; s/[.,;:)]+$//' | sort -u)

  # "never": one rule, one place.
  nevers=$(grep -oiw 'never' "$f" | wc -l | tr -d ' ')
  [ "$nevers" -le "$MAX_NEVER" ] || fail "$name" "says \"never\" $nevers times, more than $MAX_NEVER (HARNESS_SKILL_MAX_NEVER): a rule lives in one place"

  # Bench commands, against the installed bench.
  if [ -n "$bench_cmds" ]; then
    while IFS= read -r c; do
      [ -n "$c" ] || continue
      case " $bench_cmds " in *" $c "*) ;; *) fail "$name" "names \`orkeon-bench $c\`, which the installed bench does not list" ;; esac
    done < <(grep -oE 'orkeon-bench [a-z][a-z-]*' "$f" | awk '{print $2}' | grep -vE '^(and|or|is|was|the|of|to|in|on|with|for|as|at|by|from|writes|reads|says|lists|verifies|answers|does|runs|refuses)$' | sort -u)
  fi
done

[ -n "$bench_cmds" ] || echo "check-skills: orkeon-bench not on the PATH — the bench commands were not checked"
printf 'check-skills: %s skills, %s problems\n' "$skills" "$problems"
[ "$problems" -eq 0 ]
