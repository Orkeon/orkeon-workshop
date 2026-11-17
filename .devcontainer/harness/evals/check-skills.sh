#!/bin/bash
# check-skills.sh — the shape of every skill of the harness (D89: a skill is short, cites files that
# exist, and names bench commands the bench serves).
#
#   bash evals/check-skills.sh [<skills folder>]     # default: claude/skills beside this runner, and
#                                                    # the skills of every pack (packs/*/claude/skills)
#
# For every <skills>/<name>/SKILL.md (a pack's skill is named `<pack>/<name>` in the output):
#   - the front matter opens the file (`---`, `name: <folder name>`, a non-empty `description:`, `---`);
#   - the file holds at most 220 lines (HARNESS_SKILL_MAX_LINES);
#   - every harness path it cites exists, as it lands in a workshop: `references/…` (the skill's own
#     references/ first, then the workshop's, then a sibling skill's), `.claude/…` (read as `claude/…` of the harness, or
#     `claude/…` of any pack — a pack's claude/ lands in .claude/; `.claude/harness/<file>` as the
#     top-level file, `.claude/harness/packs/<pack>/…` as the pack's own file; `.claude/local/…`,
#     `.claude/settings.local.json` and `.claude/agent-memory*` are a workshop's own and are not checked);
#   - it says "never" at most 8 times (HARNESS_SKILL_MAX_NEVER): a rule is said once, in one place;
#   - every `orkeon-bench <command> [<subcommand>]` it names is a command `orkeon-bench --help` lists,
#     and, for a command that has subcommands (`check`, `attempt`, …), a word after it is one that
#     `orkeon-bench <command> --help` lists: `check team` passes, `check crew` fails. The bench is the
#     one on the PATH, else the bench of this repository (../bench/bin, with its dist/ built); without
#     either, that check is skipped and said so; a bench found whose --help lists nothing prints a WARN
#     line and `ok (skipped: …)`, which the runner counts as a skip (a failure under HARNESS_EVALS_STRICT=1).
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
# The workshop's references/: beside claude/ in the harness, at the workshop's root once deployed.
if [ -d "$HARNESS/references" ]; then REFS="$HARNESS/references"; else REFS="$(cd "$CLAUDE/.." && pwd)/references"; fi

# The skills folders: the one given, or the harness's own and those of its packs (deployed, a pack's
# skills are in .claude/skills already, and packs/ holds no claude/).
dirs=("$SKILLS")
if [ -z "${1:-}" ]; then
  for p in "$HARNESS"/packs/*/claude/skills; do [ -d "$p" ] && dirs+=("$p"); done
fi

# The command tree of the bench: `cmd` for a command, `cmd:sub` for each subcommand of a group.
# Commander prints a command at two spaces of indent; a wrapped description is indented further.
bench=()
if command -v orkeon-bench >/dev/null 2>&1; then bench=(orkeon-bench)
elif [ -f "$HARNESS/../bench/bin/orkeon-bench" ] && [ -d "$HARNESS/../bench/dist" ] && command -v node >/dev/null 2>&1; then
  bench=(node "$HARNESS/../bench/bin/orkeon-bench")
fi
help_cmds() { awk '/^Commands:/{c=1; next} c && /^  [a-z]/{print $1 (index($0, "<") ? " args" : "")} c && /^$/{c=0}' | sed 's/|[^ ]*//'; }
bench_cmds=""; bench_groups=""
if [ "${#bench[@]}" -gt 0 ]; then
  while read -r c args; do
    [ -n "$c" ] && [ "$c" != help ] || continue
    bench_cmds="$bench_cmds $c"
    [ -z "$args" ] || continue
    subs=$("${bench[@]}" "$c" --help 2>/dev/null | help_cmds | awk '$1 != "help" {print $1}' | tr '\n' ' ')
    [ -n "$subs" ] || continue
    subs="${subs% }"
    bench_groups="$bench_groups $c:${subs// /,}"
    for u in $subs; do bench_cmds="$bench_cmds $c:$u"; done
  done < <("${bench[@]}" --help 2>/dev/null | help_cmds)
fi
# Words that follow `orkeon-bench` in prose, not commands.
PROSE='^(and|or|is|was|the|of|to|in|on|with|for|as|at|by|from|writes|reads|says|lists|verifies|answers|does|runs|refuses|alone|itself|then|when|has|can|will|would|prints|computes|checks|records)$'

skills=0; problems=0
fail() { problems=$((problems + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }

# A cited path, as the skills write it, to a path on disk; prints nothing for a path not checked.
# $2 is the folder of the skill citing it.
resolve() {
  local p
  case "$1" in
    .claude/local/*|.claude/settings.local.json|.claude/agent-memory*|.claude/run-log.tsv|.claude/evals/.fixtures*) ;;
    .claude/evals/*) printf '%s/evals/%s' "$HARNESS" "${1#.claude/evals/}" ;;
    .claude/harness/*) printf '%s/%s' "$HARNESS" "${1#.claude/harness/}" ;;
    .claude/*)
      p="$CLAUDE/${1#.claude/}"
      if [ ! -e "$p" ]; then
        for q in "$HARNESS"/packs/*/claude/"${1#.claude/}"; do [ -e "$q" ] && { p="$q"; break; }; done
      fi
      printf '%s' "$p" ;;
    references/*)
      # The skill's own, the workshop's, then a sibling skill's.
      p="$REFS/${1#references/}"
      if [ -e "$2/$1" ]; then p="$2/$1"
      elif [ ! -e "$p" ]; then
        for q in "$(dirname "$2")"/*/"$1"; do [ -e "$q" ] && { p="$q"; break; }; done
      fi
      printf '%s' "$p" ;;
  esac
}

for skills_dir in "${dirs[@]}"; do
prefix=""
case "$skills_dir" in "$HARNESS"/packs/*) prefix="${skills_dir#"$HARNESS"/packs/}"; prefix="${prefix%%/*}/" ;; esac
for dir in "$skills_dir"/*/; do
  name=$(basename "$dir")
  label="$prefix$name"
  dir="${dir%/}"
  f="$dir/SKILL.md"
  [ -f "$f" ] || { fail "$label" "no SKILL.md"; continue; }
  skills=$((skills + 1))

  # Front matter.
  if [ "$(sed -n '1p' "$f")" != "---" ]; then
    fail "$label" "the file does not open on a front matter (\`---\`)"
  else
    close=$(awk 'NR>1 && /^---[ \t]*$/{print NR; exit}' "$f")
    if [ -z "$close" ]; then
      fail "$label" "the front matter never closes"
    else
      fm=$(sed -n "2,$((close - 1))p" "$f")
      printf '%s\n' "$fm" | grep -qE "^name:[[:space:]]*\"?$name\"?[[:space:]]*$" || fail "$label" "the front matter's \`name:\` is not \`$name\`"
      printf '%s\n' "$fm" | grep -qE '^description:[[:space:]]*"?[^"[:space:]]' || fail "$label" "the front matter has no \`description:\`"
    fi
  fi

  # Length.
  lines=$(wc -l < "$f" | tr -d ' ')
  [ "$lines" -le "$MAX_LINES" ] || fail "$label" "$lines lines, more than $MAX_LINES (HARNESS_SKILL_MAX_LINES)"

  # Cited paths. A placeholder (`<slug>`, `*`, `{{…}}`) is not a path; a trailing punctuation is dropped.
  while IFS= read -r cited; do
    [ -n "$cited" ] || continue
    case "$cited" in *'<'*|*'*'*|*'{{'*|*'$'*) continue ;; esac
    target=$(resolve "$cited" "$dir")
    [ -n "$target" ] || continue
    [ -e "$target" ] || fail "$label" "cites \`$cited\`, which does not exist in the harness"
  done < <(grep -oE '(^|[^A-Za-z0-9_./-])(references|\.claude)/[A-Za-z0-9_.<>{}*$/-]*' "$f" | sed -E 's/^[^A-Za-z.]//; s/[.,;:)]+$//' | sort -u)

  # "never": one rule, one place.
  nevers=$(grep -oiw 'never' "$f" | wc -l | tr -d ' ')
  [ "$nevers" -le "$MAX_NEVER" ] || fail "$label" "says \"never\" $nevers times, more than $MAX_NEVER (HARNESS_SKILL_MAX_NEVER): a rule lives in one place"

  # Bench commands, against the bench's command tree: the command, and the subcommand of a group.
  if [ -n "$bench_cmds" ]; then
    while read -r c sub; do
      [ -n "$c" ] || continue
      printf '%s\n' "$c" | grep -qE "$PROSE" && continue
      case " $bench_cmds " in *" $c "*) ;; *) fail "$label" "names \`orkeon-bench $c\`, which the bench does not list"; continue ;; esac
      case " $bench_groups " in *" $c:"*) ;; *) continue ;; esac
      [ -n "$sub" ] || continue
      printf '%s\n' "$sub" | grep -qE "$PROSE" && continue
      case " $bench_cmds " in *" $c:$sub "*) ;; *)
        subs=" $bench_groups "; subs="${subs#* "$c":}"; subs="${subs%% *}"
        fail "$label" "names \`orkeon-bench $c $sub\`, but \`orkeon-bench $c\` has the subcommands ${subs//,/, } only" ;; esac
    done < <(grep -oE 'orkeon-bench[[:space:]]+[a-z][a-z-]*([[:space:]]+[a-z][a-z-]*)?' "$f" | awk '{print $2, $3}' | sort -u)
  fi
done
done

if [ -z "$bench_cmds" ]; then
  if [ "${#bench[@]}" -gt 0 ]; then
    # A bench was found but lists nothing (no node_modules, a dist/ half built): said, and a skip,
    # which HARNESS_EVALS_STRICT=1 turns into a failure of the calling case.
    echo "WARN check-skills: \`${bench[*]} --help\` listed no command — the bench commands were not checked"
    echo "ok (skipped: the bench was found but its --help failed)"
  else
    echo "check-skills: no orkeon-bench (PATH, ../bench) — the bench commands were not checked"
  fi
fi
printf 'check-skills: %s skills, %s problems\n' "$skills" "$problems"
[ "$problems" -eq 0 ]
