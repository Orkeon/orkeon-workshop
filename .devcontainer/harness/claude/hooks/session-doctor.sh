#!/bin/bash
# SessionStart hook — say at the start of a session what is broken in the space.
#
# Plan § 7.3, § 7.5 (lot 2). In a workshop, `orkeon-bench doctor -q` prints the failing checks
# only, one line each on stderr (orkeon and its tool catalogue, esbuild, PyYAML, Ollama, the LLM
# concurrency limit, the typings, the workshop layout, stray settings files, the references
# against the installed Orkeon) and exits non-zero when one fails. A hook that exits non-zero
# shows its error to the user and tells the model nothing, so this wrapper always exits 0 and
# hands the failing lines to the model through `additionalContext`: the session starts knowing
# what is broken, and says so before building on it.
#
# In a source space (D49, a git checkout) there is no team for the bench to judge, and the bench
# is not run; the hook checks the harness itself instead, with the same lines (`FAIL <check>:
# <message>`): the binaries its hooks and scripts need (`jq`, `git`, `python3`, PyYAML; `ast-grep`
# when the dev pack is deployed), the managed `.claude/settings.json` with its hooks registered,
# every repository pack's `repo.yaml` readable, the harness block of `.git/info/exclude`, and the
# memory folder of the auditors writable.
#
# Silent when every check passes, when `orkeon-bench` is not installed (workshop), when the doctor
# does not answer in time, and after a compaction (the session already knows). Runs for
# `startup`, `resume` and `clear`. HARNESS_SESSION_DOCTOR=0 disables it;
# HARNESS_SESSION_DOCTOR_TIMEOUT is the time the bench may take, in seconds (20).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_SESSION_DOCTOR:-1}" = "0" ] && exit 0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"

space=$(harness_space) || space=workshop

if command -v jq >/dev/null 2>&1; then
  PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then [(.hook_event_name // ""), (.source // "")] | join("\u001f") else "" end' 2>/dev/null) || exit 0
  IFS=$'\x1f' read -r event source <<<"$PARSED"
  [ "$event" = "SessionStart" ] || exit 0
  [ "$source" = "compact" ] && exit 0
elif [ "$space" = source ]; then
  # Without jq nothing can be parsed or built: one fixed line, for a SessionStart payload only.
  case "$input" in *SessionStart*) ;; *) exit 0 ;; esac
  case "$input" in *'"compact"'*) exit 0 ;; esac
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"session-doctor: the harness in this checkout is not whole. Tell the user in one or two lines before relying on the hooks:\\nFAIL jq: not on the PATH - every guard of the harness needs it, and this doctor can check nothing else without it"}}\n'
  exit 0
else
  exit 0
fi

emit() {
  jq -n --arg c "$1" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
  exit 0
}

if [ "$space" = source ]; then
  root=$(harness_workshop_root)
  fails=()
  have_py=0
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c 'import yaml' >/dev/null 2>&1; then
      have_py=1
    else
      fails+=("FAIL pyyaml: python3 cannot import yaml - /workshop-profile and the repository pack's repo.yaml cannot be read")
    fi
  else
    fails+=("FAIL python3: not on the PATH - the switcher, the scripts of the packs and several hooks need it")
  fi
  command -v git >/dev/null 2>&1 || fails+=("FAIL git: not on the PATH - the space cannot be told from a workshop, nor its exclude block kept")

  settings="$root/.claude/settings.json"
  if [ ! -f "$settings" ] || ! grep -qE 'hooks/bash-dispatch\.sh|hook-run\.sh[\\"]* bash-dispatch' "$settings" 2>/dev/null; then
    fails+=("FAIL hooks: .claude/settings.json is missing or registers no harness hook - run sync-harness.sh")
  fi

  if [ "$have_py" -eq 1 ]; then
    for y in "$root"/.claude/harness/packs/repo-*/references/repo.yaml; do
      [ -f "$y" ] || continue
      err=$(python3 - "$y" 2>&1 <<'PY' >/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
assert isinstance(d, dict) and d.get("product"), "no product key"
PY
      ) || fails+=("FAIL repo-pack: ${y#"$root"/} cannot be read ($(printf '%s' "$err" | tail -n 1 | cut -c1-120))")
    done
  fi

  if command -v git >/dev/null 2>&1; then
    if exclude=$(git -C "$root" rev-parse --git-path info/exclude 2>&1); then
      case "$exclude" in /*) ;; *) exclude="$root/$exclude" ;; esac
      if [ ! -f "$exclude" ] || ! grep -qxF '/todo/' "$exclude" || ! grep -qxF '/.claude/local/' "$exclude"; then
        fails+=("FAIL exclude: ${exclude#"$root"/} lacks the harness block (/todo/, /.claude/local/) - run sync-harness.sh, or git will see the harness files")
      fi
    else
      fails+=("FAIL git: $(printf '%s' "$exclude" | head -n 1 | cut -c1-160)")
    fi
  fi

  memory="$root/.claude/agent-memory"
  if [ -d "$memory" ]; then
    [ -w "$memory" ] || fails+=("FAIL memory: .claude/agent-memory/ is not writable by $(id -un) - the auditors cannot keep their memory")
  elif [ -d "$root/.claude" ] && [ ! -w "$root/.claude" ]; then
    fails+=("FAIL memory: .claude/ is not writable by $(id -un) - the auditors cannot keep their memory")
  fi

  if [ -d "$root/.claude/skills/dev-implement" ] && ! command -v ast-grep >/dev/null 2>&1; then
    fails+=("FAIL ast-grep: not on the PATH - the access cost of a batch is stated by hand, not measured (dev pack, access-cost.py)")
  fi

  [ "${#fails[@]}" -gt 0 ] || exit 0
  emit "session-doctor: the harness in this checkout is not whole. Tell the user in one or two lines before relying on what these lines cover, and fix what is yours to fix (sync-harness.sh deploys the files; the binaries are the image's):
$(printf '%s\n' "${fails[@]}" | head -n 20)"
fi

command -v orkeon-bench >/dev/null 2>&1 || exit 0

limit="${HARNESS_SESSION_DOCTOR_TIMEOUT:-20}"
# Whole seconds, 1 or more: `timeout 0` would mean no limit at all.
case "$limit" in ''|*[!0-9]*) limit=20 ;; esac
[ "$limit" -ge 1 ] 2>/dev/null || limit=20

if command -v timeout >/dev/null 2>&1; then
  out=$(timeout "$limit" orkeon-bench doctor -q 2>&1); rc=$?
else
  out=$(orkeon-bench doctor -q 2>&1); rc=$?
fi
# 124: the doctor did not answer in time — say nothing rather than half a diagnosis.
[ "$rc" -eq 124 ] && exit 0
[ "$rc" -ne 0 ] || exit 0
# The check lines only: whatever else reached stderr (a locale warning of the shell) is noise.
printf '%s' "$out" | grep -q '^FAIL ' || exit 0

emit "session-doctor: \`orkeon-bench doctor\` reports failing checks in this workshop. Tell the user in one or two lines before relying on what they cover, and fix what is yours to fix (\`orkeon-bench doctor\` prints every check, with the way to fix it):
$(printf '%s' "$out" | grep '^FAIL ' | head -n 20)"
