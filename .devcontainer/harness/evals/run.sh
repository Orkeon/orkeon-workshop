#!/bin/bash
# Harness evals — replay recorded hook payloads through the hooks, check the decision.
#
# Adapted from claude-code-toolkit/evals/run.sh (MIT, see THIRD-PARTY.md).
# An eval proves that a script emits the right bytes, not that the model reads
# them (plan § 6.8). Policy: a defect found in production becomes a case; a hook
# change without a case is not finished. Every frozen literal (FROZEN-LITERALS.md)
# has a case on each side — the one that emits it and the one that reads it — or
# names the lot that will write it.
#
# Usage:
#   bash evals/run.sh                          # every cases/*.json
#   bash evals/run.sh -v cases/run-gate.json
#   HARNESS_EVALS_STRICT=1 bash evals/run.sh   # a skipped case fails (the image build)
#
# A case that cannot run here — rtk, orkeon-bench or PyYAML missing — prints
# `ok (skipped: <why>)` and exits 0. It is listed as SKIP and counts as passed, and
# the summary line says how many: `N passed, M failed (K skipped, counted as passed)`.
# With HARNESS_EVALS_STRICT=1 a skip is a failure instead, so that a build where a
# tool went missing cannot pass on skipped cases.
#
# Case file shape:
#   { "fixtures": [ {"path": "big.cs", "lines": 300, "kind": "sparse|flat|md|text|exec", "content": "..."} ],
#     "cases": [ { "name": "...",
#                  "hook": "hooks/x.sh"  |  "cmd": "bash {{CLAUDE}}/hooks/x.sh ...",
#                  "pre": [payload, ...],          # replayed first, output ignored
#                  "input": payload,               # hook payload on stdin
#                  "env": {"VAR": "value"},
#                  "expect": { "decision": "deny|allow|ask|block|none|not_deny",
#                              "reason": "substring", "command": "substring",
#                              "command_absent": "substring", "prompt": "substring",
#                              "context": "substring", "no_context": true,
#                              "exit": N, "stdout": "substring", "stdout_absent": "substring",
#                              "stderr": "substring" } } ] }
#
# `decision` and `reason` are read from `hookSpecificOutput.permissionDecision*`
# (PreToolUse) or from the top-level `decision` / `reason` (Stop, SubagentStop);
# `none` means the output is not one JSON object carrying a decision.
#
# Placeholders, expanded everywhere in a case (payloads, env, cmd, expect):
# {{FIX}} the fixtures folder of the case file, {{ROOT}} the folder the hooks run
# in, {{CLAUDE}} the folder holding hooks/ lib/ agents/, {{SID}} a session id
# unique to the case — so escape hatches keyed on the session never leak between
# cases. Each case file has its own fixtures folder: two files may both describe
# a `teams/alpha` without seeing each other's. Everything the run leaves in /tmp
# carries the run id and is removed.
#
# Two layouts are resolved from the runner's own location, never assumed and
# never from $CLAUDE_PROJECT_DIR: `evals/` beside `claude/` (this repo, and
# /usr/local/share/claude-harness in the image, where the Dockerfile runs this
# file at build), and `.claude/evals/` beside `.claude/hooks/` once deployed in
# a workshop. A hook path that resolves to nothing would print nothing, which
# reads as "not_deny" — so a missing hooks folder or hook file is a failure.
#
# Hermetic: every HARNESS_* variable of the caller is dropped (HARNESS_EVALS_STRICT
# is read first: it sets the runner, not a hook), and every variable
# Orkeon reads an Llm section from (ORKEON_Llm*, Llm*, and the DOTNET_Llm* and
# DOTNET_ENVIRONMENT an older Orkeon read), with ORKEON_WORKSHOP, CLAUDE_PROJECT_DIR and
# XDG_CONFIG_HOME; the run log and
# the machine settings file are pointed inside the fixtures. A case sets what it
# needs in its own `env`. Needs bash, jq, python3, git and the base utilities;
# rtk and orkeon-bench are used when present.
#
# One jq per case file and one per hook output: jq 1.6 takes tens of
# milliseconds to start, and the first version of this runner started twenty of
# them per case. Fields travel between jq and bash separated by US (\x1f),
# records by RS (\x1e), lists by GS (\x1d): none of them occurs in a case.
#
# `set -u` without `pipefail`: a hook that exits before reading its payload
# would make `printf … | bash hook` fail on SIGPIPE and falsify the exit code
# the case asserts.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$HERE/../claude/hooks" ]; then
  CLAUDE_DIR="$(cd "$HERE/../claude" && pwd)"
  ROOT="$(cd "$HERE/.." && pwd)"
elif [ -d "$HERE/../hooks" ]; then
  CLAUDE_DIR="$(cd "$HERE/.." && pwd)"
  ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"
else
  echo "evals: no hooks folder next to $HERE (expected ../claude/hooks or ../hooks)" >&2
  exit 2
fi
for bin in jq python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "evals: $bin is required" >&2; exit 2; }
done

RUN="eval-$$-$(date +%s)"
US=$'\x1f'
RS=$'\x1e'
GS=$'\x1d'

# One fixtures tree per run, so two concurrent runs never share state: beside
# the runner when that is writable, under /tmp otherwise (the image copy belongs
# to root).
FIXBASE="$HERE/.fixtures"
FIXROOT="$FIXBASE/$RUN"
if ! mkdir -p "$FIXROOT" 2>/dev/null; then
  FIXBASE=""
  FIXROOT="$(mktemp -d "${TMPDIR:-/tmp}/claude-evalfix-$RUN-XXXXXX")" || { echo "evals: cannot create a fixtures folder" >&2; exit 2; }
fi
FIX="$FIXROOT"

# Read before the environment is cleaned below.
STRICT="${HARNESS_EVALS_STRICT:-0}"

# Whatever the case of the name: Orkeon reads its variables case-insensitively,
# and so does run-gate.sh.
for v in $(env | grep -iE '^(HARNESS_[A-Za-z0-9_]*|(ORKEON_|DOTNET_)?LLM(__[A-Za-z0-9_]*)?|DOTNET_ENVIRONMENT)=' | cut -d= -f1); do
  unset "$v"
done
unset ORKEON_WORKSHOP CLAUDE_PROJECT_DIR XDG_CONFIG_HOME

ERRF="/tmp/claude-evalerr-$RUN"
VERBOSE=0
files=()
for a in "$@"; do
  case "$a" in
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) sed -n '2,21p' "$0" | sed -e 's/^# \{0,1\}//'; exit 0 ;;
    *) files+=("$a") ;;
  esac
done
[ "${#files[@]}" -gt 0 ] || files=("$HERE"/cases/*.json)

PASSED=0
FAILED=0
SKIPPED=0

cleanup() {
  rm -rf "$FIXROOT"
  [ -n "$FIXBASE" ] && rmdir "$FIXBASE" 2>/dev/null
  rm -f /tmp/claude-*"$RUN"* 2>/dev/null
}
trap cleanup EXIT

make_fixture() {
  local path="$FIX/$1" lines="$2" kind="$3" content="${4:-}"
  mkdir -p "$(dirname "$path")"
  case "$kind" in
    flat)
      # First 40 lines long, the rest short: the outline (capped at 40 lines)
      # weighs most of the file, which is what bounds_is_flat measures.
      { seq 1 40 | awk '{printf "public sealed record Declaration%03d(string Name, int Value, bool Enabled, string Description);\n", $1}'
        seq 41 "$lines" | awk '{print "class C"$1" {}"}'; } > "$path" ;;
    text)
      # Verbatim bytes: a STATUS.md, a manifest, a transcript, an approval marker.
      printf '%s' "$content" > "$path" ;;
    exec)
      # Verbatim bytes, executable: a stub standing for a binary a hook calls.
      printf '%s' "$content" > "$path"
      chmod +x "$path" ;;
    md)
      seq 1 "$lines" | awk '{print "Paragraph "$1": markdown wraps at the paragraph rather than at eighty columns, so a line count alone waves a heavy file through and only the byte bound catches it."}' > "$path" ;;
    *)
      # Sparse: one declaration every 40 lines, the rest statements.
      seq 1 "$lines" | awk 'NR%40==1{print "public class C"$1" { }"; next}{print "    var v"$1" = "$1";"}' > "$path" ;;
  esac
}

ENVARGS=()

run_payload() {
  (cd "$ROOT" && printf '%s' "$2" | env ${ENVARGS[@]+"${ENVARGS[@]}"} bash "$CLAUDE_DIR/$1" 2>"$ERRF")
}

# Decision, reason, rewritten command, rewritten prompt, injected context of a
# hook output. Anything that is not exactly one JSON object reads as "none".
NONE="none$US$US$US$US"
parse_output() {
  local out="$1" parsed="$NONE"
  if [ -n "$out" ]; then
    parsed=$(printf '%s' "$out" | jq -js '
      if length == 1 and (.[0] | type) == "object"
      then .[0] | [ (.hookSpecificOutput.permissionDecision // .decision // "none"),
                    (.hookSpecificOutput.permissionDecisionReason // .reason // ""),
                    (.hookSpecificOutput.updatedInput.command // ""),
                    (.hookSpecificOutput.updatedInput.prompt // ""),
                    (.hookSpecificOutput.additionalContext // "") ] | map(tostring) | join("\u001f")
      else "none\u001f\u001f\u001f\u001f" end' 2>/dev/null) || parsed="$NONE"
    [ -n "$parsed" ] || parsed="$NONE"
  fi
  IFS=$US read -r -d '' decision reason command prompt context < <(printf '%s' "$parsed") || true
}

contains() { case "$1" in *"$2"*) return 0 ;; esac; return 1; }

check() {
  local out="$1" err="$2" rc="$3" fails=""
  parse_output "$out"
  if [ -n "$e_decision" ]; then
    if [ "$e_decision" = "not_deny" ]; then
      [ "$decision" != "deny" ] || fails="$fails decision=deny"
    else
      [ "$decision" = "$e_decision" ] || fails="$fails decision=$decision(want:$e_decision)"
    fi
  fi
  if [ -n "$e_reason" ]; then contains "$reason" "$e_reason" || fails="$fails reason!~[$e_reason]"; fi
  if [ -n "$e_command" ]; then contains "$command" "$e_command" || fails="$fails command!~[$e_command]"; fi
  if [ -n "$e_command_absent" ]; then contains "$command" "$e_command_absent" && fails="$fails command~[$e_command_absent]"; fi
  if [ -n "$e_prompt" ]; then contains "$prompt" "$e_prompt" || fails="$fails prompt!~[$e_prompt]"; fi
  if [ -n "$e_context" ]; then contains "$context" "$e_context" || fails="$fails context!~[$e_context]"; fi
  if [ "$e_no_context" = "true" ]; then [ -z "$context" ] || fails="$fails context-present"; fi
  if [ -n "$e_exit" ]; then [ "$rc" = "$e_exit" ] || fails="$fails exit=$rc(want:$e_exit)"; fi
  if [ -n "$e_stdout" ]; then contains "$out" "$e_stdout" || fails="$fails stdout!~[$e_stdout]"; fi
  if [ -n "$e_stdout_absent" ]; then contains "$out" "$e_stdout_absent" && fails="$fails stdout~[$e_stdout_absent]"; fi
  if [ -n "$e_stderr" ]; then contains "$err" "$e_stderr" || fails="$fails stderr!~[$e_stderr]"; fi
  FAILS="$fails"
}

for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "no such case file: $f"
    FAILED=$((FAILED + 1))
    continue
  fi
  if ! jq -e '(.cases | type) == "array"' "$f" >/dev/null 2>&1; then
    echo "invalid case file (not JSON, or no \"cases\" array): $f"
    FAILED=$((FAILED + 1))
    continue
  fi
  label=$(basename "$f" .json)
  printf '\n%s\n' "$label"

  FIX="$FIXROOT/$label"
  mkdir -p "$FIX"
  export HARNESS_RUN_LOG="$FIX/run-log.tsv"
  export HARNESS_ORKEON_SETTINGS="$FIX/.no-orkeon-settings.json"

  # One record per fixture, then one per case. File descriptors 8 and 9 carry
  # them, so that a hook or a command reading stdin cannot swallow the stream.
  while IFS=$US read -r -u 8 -d "$RS" fx_path fx_lines fx_kind fx_content; do
    make_fixture "$fx_path" "$fx_lines" "$fx_kind" "$fx_content"
  done 8< <(jq -j '(.fixtures // [])[] | ([.path, (.lines // 0 | tostring), (.kind // "sparse"), (.content // "")] | join("\u001f")) + "\u001e"' "$f")

  i=0
  while IFS= read -r -u 9 -d "$RS" rec; do
    sid="$RUN-$label-$i"
    i=$((i + 1))
    rec=${rec//'{{FIX}}'/"$FIX"}
    rec=${rec//'{{ROOT}}'/"$ROOT"}
    rec=${rec//'{{CLAUDE}}'/"$CLAUDE_DIR"}
    rec=${rec//'{{SID}}'/"$sid"}
    IFS=$US read -r -d '' name hook cmd envs pres input \
      e_decision e_reason e_command e_command_absent e_prompt e_context e_no_context \
      e_exit e_stdout e_stdout_absent e_stderr < <(printf '%s' "$rec") || true

    ENVARGS=()
    if [ -n "$envs" ]; then
      IFS=$GS read -r -d '' -a ENVARGS < <(printf '%s' "$envs") || true
    fi
    PRES=()
    if [ -n "$pres" ]; then
      IFS=$GS read -r -d '' -a PRES < <(printf '%s' "$pres") || true
    fi

    : > "$ERRF"
    if [ -n "$hook" ]; then
      if [ ! -f "$CLAUDE_DIR/$hook" ]; then
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s — hook not found: %s\n' "$name" "$CLAUDE_DIR/$hook"
        continue
      fi
      for p in ${PRES[@]+"${PRES[@]}"}; do
        run_payload "$hook" "$p" >/dev/null 2>&1
      done
      out=$(run_payload "$hook" "$input"); rc=$?
    elif [ -n "$cmd" ]; then
      out=$(cd "$ROOT" && env ${ENVARGS[@]+"${ENVARGS[@]}"} bash -c "$cmd" 2>"$ERRF" </dev/null); rc=$?
    else
      FAILED=$((FAILED + 1))
      printf '  FAIL  %s — neither "hook" nor "cmd"\n' "$name"
      continue
    fi
    err=$(cat "$ERRF" 2>/dev/null)

    check "$out" "$err" "$rc"
    skipped=0
    case "$out" in
      *"ok (skipped"*)
        skipped=1
        why="${out#*ok (skipped}"; why="${why#:}"; why="${why# }"; why="${why%%)*}" ;;
    esac
    if [ -n "$FAILS" ]; then
      FAILED=$((FAILED + 1))
      printf '  FAIL  %s —%s\n' "$name" "$FAILS"
      printf '        out: %s\n' "$(printf '%s' "$out" | head -c 400)"
      [ -n "$err" ] && printf '        err: %s\n' "$(printf '%s' "$err" | head -c 300)"
    elif [ "$skipped" -eq 1 ]; then
      SKIPPED=$((SKIPPED + 1))
      if [ "$STRICT" = "1" ]; then
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s — skipped (%s), and HARNESS_EVALS_STRICT=1 counts a skip as a failure\n' "$name" "$why"
      else
        PASSED=$((PASSED + 1))
        printf '  SKIP  %s — %s\n' "$name" "$why"
      fi
    else
      PASSED=$((PASSED + 1))
      printf '  PASS  %s\n' "$name"
      if [ "$VERBOSE" -eq 1 ]; then
        printf '        %s\n' "$(printf '%s' "$out" | head -c 300)"
      fi
    fi
  done 9< <(jq -j '.cases[] | ([
      (.name // ""), (.hook // ""), (.cmd // ""),
      ((.env // {}) | to_entries | map("\(.key)=\(.value)") | join("\u001d")),
      ((.pre // []) | map(tojson) | join("\u001d")),
      ((.input // null) | tojson),
      (.expect.decision // ""), (.expect.reason // ""), (.expect.command // ""),
      (.expect.command_absent // ""), (.expect.prompt // ""), (.expect.context // ""),
      ((.expect.no_context // false) | tostring),
      (if ((.expect // {}) | has("exit")) then (.expect.exit | tostring) else "" end),
      (.expect.stdout // ""), (.expect.stdout_absent // ""), (.expect.stderr // "")
    ] | join("\u001f")) + "\u001e"' "$f")

  # A case file whose cases were not all read is a failure, not a silence.
  ncase=$(jq '.cases | length' "$f")
  if [ "$i" -ne "$ncase" ]; then
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s — %s case(s) declared, %s run\n' "$label" "$ncase" "$i"
  fi
done

# `N passed, M failed` stays first on the line, for whatever parses it.
summary="$PASSED passed, $FAILED failed"
if [ "$SKIPPED" -gt 0 ]; then
  if [ "$STRICT" = "1" ]; then
    summary="$summary ($SKIPPED skipped, counted as failed: HARNESS_EVALS_STRICT=1)"
  else
    summary="$summary ($SKIPPED skipped, counted as passed)"
  fi
fi
printf '\n%s\n' "$summary"
[ "$FAILED" -eq 0 ]
