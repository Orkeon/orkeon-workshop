#!/bin/bash
# Walks one remote path of the budget gate end to end (D104), with the real hooks and
# the real orkeon-bench, in a scratch workshop:
#   run-gate denies → the deny sends to /team-run → the line /team-run writes
#   (`orkeon-bench estimate`, then `next_action: /team-approve remote <usd> <slug>`) →
#   the line typed is recorded by the /team-approve hook → run-gate allows.
#
# Usage: bash evals/check-remote-paths.sh l4-none|l4-invalid|l3-decision|undeclared|decide
# Prints `ok <path>: <steps>` and exits 0, or `MISMATCH <path>: <step>: <what>` and exits 1.
# Without orkeon-bench on the PATH: `ok (skipped: …)` (strict evals count it as a failure).
set -uo pipefail

path="${1:-}"
here=$(cd "$(dirname "$0")" && pwd)
claude="$here/../claude"
[ -d "$claude/hooks" ] || claude="$here/.."          # deployed: .claude/evals beside .claude/hooks
command -v orkeon-bench >/dev/null 2>&1 || { printf 'ok (skipped: orkeon-bench is not on the PATH)'; exit 0; }
command -v jq >/dev/null 2>&1 || { printf 'ok (skipped: jq is not on the PATH)'; exit 0; }

W=$(mktemp -d "${TMPDIR:-/tmp}/remote-paths-XXXXXX")
trap 'rm -rf "$W"' EXIT
export ORKEON_WORKSHOP="$W" HARNESS_RUN_LOG="$W/run-log.tsv" HOME="$W/home"
mkdir -p "$HOME" "$W/teams" "$W/tests"
steps=()
fail() { printf 'MISMATCH %s: %s: %s' "$path" "$1" "$2"; exit 1; }
step() { steps+=("$1"); }

# A built team in phase run with an open attempt, one L3 scenario and its L4 twin, an
# archived L3 run and an L2 run, a remote profile with a price.
bash "$claude/skills/team-init/scripts/team-init.sh" alpha >/dev/null 2>&1 || fail setup "team-init"
mkdir -p "$W/teams/alpha/crew" "$W/tests/alpha/e2e"
printf 'name: alpha\nprocess: sequential\n' > "$W/teams/alpha/crew/config.yaml"
jq '.profiles.claude += {model: "claude-x", price: {input_per_million: 3, output_per_million: 15}}' \
  "$claude/templates/bench.config.json" > "$W/tests/alpha/bench.config.json"
printf '{"id":"ac-01","level":"e2e_local","dataset":"nominal","checks":[]}\n' > "$W/tests/alpha/e2e/ac-01.scenario.json"
printf '{"id":"ac-01","level":"e2e_remote","dataset":"nominal","profile":"claude","checks":[]}\n' > "$W/tests/alpha/e2e/ac-01.remote.scenario.json"
status="$W/workbooks/alpha/STATUS.md"
sed -i 's/^phase:.*/phase: run/; s/^gate_passed:.*/gate_passed: build/; s|^next_action:.*|next_action: /team-run alpha|' "$status"
(cd "$W" && orkeon-bench attempt open alpha --by team-build >/dev/null 2>&1) || fail setup "attempt open"
attempt="$W/workbooks/alpha/attempts/ATT-0001"
manifest() { # run level target decision_calls
  mkdir -p "$W/workbooks/alpha/runs/$1"
  printf '{"run":"%s","scenario":"%s","level":"%s","target":"%s","attempt":"ATT-0001","status":"pass","tokens_in":%s,"tokens_out":%s,"decision_calls":%s}\n' \
    "$1" "$([ "$2" = component ] && echo c-01 || echo ac-01)" "$2" "$3" "$([ "$2" = component ] && echo 0 || echo 100000)" "$([ "$2" = component ] && echo 0 || echo 10000)" "$4" \
    > "$W/workbooks/alpha/runs/$1/manifest.json"
}
manifest RUN-20261101-0800-stub component stub 2
[ "$path" = l3-decision ] || [ "$path" = undeclared ] || [ "$path" = decide ] || manifest RUN-20261101-0900-machine e2e_local machine 0

gate() { # command [cwd] -> "allow" | "deny<US>reason"
  jq -nc --arg c "$1" --arg d "${2:-$W}" '{tool_name: "Bash", session_id: "rp", cwd: $d, tool_input: {command: $c}}' \
    | bash "$claude/hooks/run-gate.sh" > "$W/gate.out"
  jq -r 'if .hookSpecificOutput.permissionDecision == "deny" then "deny\u001f" + .hookSpecificOutput.permissionDecisionReason else "allow" end' "$W/gate.out" 2>/dev/null | grep . || printf 'allow'
}
approve() { # line -> "recorded" | "refused<US>reason"
  jq -nc --arg p "$1" --arg id "p$RANDOM" '{hook_event_name: "UserPromptSubmit", session_id: "rp", prompt_id: $id, prompt: $p}' \
    | bash "$claude/hooks/team-approve.sh" | jq -r 'if .decision == "block" then "refused\u001f" + .reason else "recorded" end'
}
# What /team-run step 2 does: price, then submit the line (D104). Prints the amount.
submit() { # estimate arguments…
  local out usd
  out=$(cd "$W" && orkeon-bench estimate alpha "$@" --json 2>"$W/estimate.err") || fail estimate "exit $? — $(tr '\n' ' ' < "$W/estimate.err")"
  [ "$(jq -r .remote <<<"$out")" = true ] || fail estimate "remote is not true: $out"
  usd=$(jq -r '.usd' <<<"$out")
  sed -i "s|^next_action:.*|next_action: /team-approve remote $usd alpha|" "$status"
  printf '%s' "$usd"
}
denied() { # what command [cwd] want…
  local got; got=$(gate "$2" "${3:-$W}")
  [ "${got%%$'\x1f'*}" = deny ] || fail "$1" "run-gate did not deny \`$2\`"
  shift 3
  for want in "$@"; do case "$got" in *"$want"*) ;; *) fail deny "the reason lacks \`$want\`: ${got#*$'\x1f'}" ;; esac; done
  step "deny"
}
approved() { # usd command [cwd]
  local got; got=$(approve "/team-approve remote $1 alpha")
  [ "$got" = recorded ] || fail approve "${got#*$'\x1f'}"
  grep -q '^next_action: /team-run alpha$' "$status" || fail approve "next_action is not /team-run alpha"
  step "approve $1"
  got=$(gate "$2" "${3:-$W}")
  [ "$got" = allow ] || fail allow "run-gate still denies \`$2\`: ${got#*$'\x1f'}"
  step "allow"
}
unpriced_refused() {
  local got; got=$(approve "/team-approve remote 1 alpha")
  case "$got" in "refused"*"is not priced yet"*"/team-run alpha"*) step "unpriced refused" ;; *) fail unpriced "the hook did not refuse an unpriced line: $got" ;; esac
}

case "$path" in
  l4-none)
    cmd="orkeon-bench run alpha --level L4"
    denied l4 "$cmd" "$W" "run \`/team-run alpha\`" "orkeon-bench estimate alpha --level L4" "next_action: /team-approve remote <usd> alpha"
    unpriced_refused
    usd=$(submit --level L4); step "estimate $usd"
    approved "$usd" "$cmd" ;;
  l4-invalid)
    printf '{"by":"user","at":"2026-11-01T10:00:00Z","estimated_usd":"lots","cap_usd":2}\n' > "$attempt/remote-approval.json"
    cmd="orkeon-bench run alpha --level L4"
    denied l4 "$cmd" "$W" "no valid estimated_usd" "Price the run again: run \`/team-run alpha\`"
    usd=$(submit --level L4); step "estimate $usd"
    approved "$usd" "$cmd" ;;
  l3-decision)
    jq '.levels.e2e_local.decision = {provider: "typesafe", model: "ts-small", key_env: "TYPESAFE_API_KEY", price_per_call: 0.01}' \
      "$W/tests/alpha/bench.config.json" > "$W/c.json" && mv "$W/c.json" "$W/tests/alpha/bench.config.json"
    cmd="orkeon-bench run alpha --level L3"
    denied l3 "$cmd" "$W" "decision model" "orkeon-bench estimate alpha --level L3"
    usd=$(submit --level L3); step "estimate $usd"
    approved "$usd" "$cmd" ;;
  undeclared)
    export TYPESAFE_API_KEY=placeholder-not-a-key
    cmd="orkeon-bench run alpha --level L3"
    denied l3 "$cmd" "$W" "orkeon-bench estimate alpha --level L3"
    if (cd "$W" && orkeon-bench estimate alpha --level L3 --json >/dev/null 2>"$W/estimate.err"); then fail estimate "an undeclared provider was priced"; fi
    grep -q '/team-decision' "$W/estimate.err" || fail estimate "the refusal does not name /team-decision: $(cat "$W/estimate.err")"
    step "estimate refused (/team-decision)"
    unpriced_refused
    # What /team-decision writes: the provider declared, with its price per call.
    jq '.decision = {provider: "typesafe", key_env: "TYPESAFE_API_KEY", price_per_call: 0.01}' \
      "$W/tests/alpha/bench.config.json" > "$W/c.json" && mv "$W/c.json" "$W/tests/alpha/bench.config.json"
    usd=$(submit --level L3); step "estimate $usd"
    approved "$usd" "$cmd" ;;
  decide)
    export TYPESAFE_API_KEY=placeholder-not-a-key
    jq '.decision = {provider: "typesafe", key_env: "TYPESAFE_API_KEY", price_per_call: 0.02}' \
      "$W/tests/alpha/bench.config.json" > "$W/c.json" && mv "$W/c.json" "$W/tests/alpha/bench.config.json"
    cmd='orkeon-bench decide noul --question "Q?" --allow-remote'
    denied decide "$cmd" "$W/teams/alpha" "/team-run alpha" "--decide <calls>" "next_action: /team-approve remote <usd> alpha"
    usd=$(submit --level L3 --decide 3); step "estimate $usd"
    approved "$usd" "$cmd" "$W/teams/alpha" ;;
  *) printf 'usage: check-remote-paths.sh l4-none|l4-invalid|l3-decision|undeclared|decide'; exit 2 ;;
esac
printf 'ok %s: %s' "$path" "$(IFS=,; printf '%s' "${steps[*]}" | sed 's/,/ → /g')"
