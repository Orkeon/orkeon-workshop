#!/bin/bash
# Batching nudge — reminds a chain to group independent tool calls.
#
# Adapted from claude-code-toolkit/lib/batching-nudge.sh (MIT, see THIRD-PARTY.md).
# A turn is one billed round trip that resends the whole accumulation, so a run
# of mono-call turns pays the same context N times for N calls that could have
# shipped in one message.
#
# Never blocks, never rewrites: appends one line of additionalContext when the
# recent history shows a run of mono-call turns. Wired on Bash only (the
# dispatcher is the single Bash entry point) but it reads the transcript, so it
# counts every tool.
#
# Subagents too (2026-10-18). Until then the module left them out, on the idea
# that a subagent is short-lived; measured on a real run, 75 to 88 % of the role
# subagents' tool-carrying turns held a single call (dev-auditor 88 %,
# dev-implementer 79 %) while the nudge fired 10 times, all in the main thread.
# Inside a subagent the payload's `transcript_path` is the main conversation's
# (V-31): the module reads the agent's own transcript beside it,
# `<dir>/<session_id>/subagents/agent-<agent_id>.jsonl` (as dev-batch-guard and
# clear-nudge do), every assistant turn of it — they all carry `isSidechain` —
# so only that agent's turns are counted. The main thread counts the main
# transcript's turns without `isSidechain`, as before. The state is per chain:
# `/tmp/claude-batching-tick-<session>[-<agent>]` (the sampling gate) and
# `/tmp/claude-batching-nudge-<session>[-<agent>]` (the turn count at the last
# nudge, for the cooldown), no suffix for the main thread. Exempt: the agent
# type `dev-batch`, whose form is one waiting slice per turn (the cycle's agents
# run one after the other).
#
# Contract: reads HOOK_* from the environment, prints the nudge text on stdout
# (not JSON — the dispatcher merges it), prints nothing when it passes.
set -u

WINDOW=${HARNESS_BATCHING_WINDOW:-6}     # consecutive mono-call turns before nudging
COOLDOWN=${HARNESS_BATCHING_COOLDOWN:-6} # tool-carrying turns before nudging again

transcript="${HOOK_TRANSCRIPT_PATH:-}"
[ -n "$transcript" ] || exit 0
session="${HOOK_SESSION_ID:-unknown}"

agent="${HOOK_AGENT_ID:-}"
suffix=""
if [ -n "$agent" ]; then
  [ "${HOOK_AGENT_TYPE:-}" = "dev-batch" ] && exit 0
  case "$agent$session" in *[!A-Za-z0-9_-]*) exit 0 ;; esac
  # The agent's own transcript; the payload names the main one (V-31), unless it already names this.
  case "$transcript" in
    */agent-"$agent".jsonl) ;;
    *) transcript="$(dirname "$transcript")/$session/subagents/agent-$agent.jsonl" ;;
  esac
  suffix="-$agent"
fi
[ -f "$transcript" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
# Sampling gate, in pure bash, before the python spawn: what the module looks
# for is a RUN of WINDOW mono-call turns, a state that persists across several
# calls, so evaluating one call in SAMPLE catches it at worst one turn later.
SAMPLE=${HARNESS_BATCHING_SAMPLE:-3}
tick_file="/tmp/claude-batching-tick-${session}${suffix}"
tick=0
[ -f "$tick_file" ] && read -r tick < "$tick_file" 2>/dev/null
case "$tick" in ''|*[!0-9]*) tick=0 ;; esac
tick=$(( (tick + 1) % SAMPLE ))
printf '%s' "$tick" > "$tick_file"
[ "$tick" -eq 0 ] || exit 0

state="/tmp/claude-batching-nudge-${session}${suffix}"
last_alert=0
[ -f "$state" ] && last_alert=$(cat "$state" 2>/dev/null || echo 0)

python3 - "$transcript" "$WINDOW" "$COOLDOWN" "$last_alert" "$state" "$agent" <<'PY'
import sys, json

transcript, window, cooldown, last_alert, state, agent = sys.argv[1:7]
window, cooldown = int(window), int(cooldown)
try:
    last_alert = int(last_alert)
except ValueError:
    last_alert = 0

# One entry per assistant message that carried at least one tool call. Claude
# Code rewrites each assistant message several times (streaming deltas): dedupe
# on message.id, and dedupe tool_use on its own id.
seen_msg, seen_tu, turns = {}, set(), []
with open(transcript, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        if '"tool_use"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        # The main transcript: the main thread's turns only. An agent's own transcript: all of them.
        if (d.get("isSidechain") and not agent) or d.get("type") != "assistant":
            continue
        mid = d.get("message", {}).get("id")
        new = [
            c["id"]
            for c in d["message"].get("content", [])
            if isinstance(c, dict) and c.get("type") == "tool_use" and c["id"] not in seen_tu
        ]
        seen_tu.update(new)
        if not new:
            continue
        if mid in seen_msg:
            seen_msg[mid] += len(new)
        else:
            seen_msg[mid] = len(new)
            turns.append(mid)

counts = [seen_msg[m] for m in turns]
total = len(counts)

if total < window or total - last_alert < cooldown:
    sys.exit(0)
if any(c != 1 for c in counts[-window:]):
    sys.exit(0)

with open(state, "w") as fh:
    fh.write(str(total))

print(
    f"Batching: the last {window} tool-carrying turns each held a single call "
    f"({total} such turns so far {'in this agent' if agent else 'this session'}). "
    "Every turn resends the whole "
    "context, so independent calls belong in one message. Before the next call, "
    "check whether the following ones depend on its result — if not, send them "
    "together."
)
PY
exit 0
