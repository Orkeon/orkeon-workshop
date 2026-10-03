#!/bin/bash
# Batching nudge — reminds the main chain to group independent tool calls.
#
# Adapted from claude-code-toolkit/lib/batching-nudge.sh (MIT, see THIRD-PARTY.md).
# A turn is one billed round trip that resends the whole accumulation, so a run
# of mono-call turns pays the same context N times for N calls that could have
# shipped in one message.
#
# Never blocks, never rewrites: appends one line of additionalContext when the
# recent history shows a run of mono-call turns. Wired on Bash only (the
# dispatcher is the single Bash entry point) but it reads the transcript, so it
# counts every tool. Main chain only: a subagent drops its context after ~30
# turns, nudging it would spend tokens to fix what is not a problem.
#
# Contract: reads HOOK_* from the environment, prints the nudge text on stdout
# (not JSON — the dispatcher merges it), prints nothing when it passes.
set -u

WINDOW=${HARNESS_BATCHING_WINDOW:-6}     # consecutive mono-call turns before nudging
COOLDOWN=${HARNESS_BATCHING_COOLDOWN:-6} # tool-carrying turns before nudging again

[ -z "${HOOK_AGENT_ID:-}" ] || exit 0   # subagent: out of scope

transcript="${HOOK_TRANSCRIPT_PATH:-}"
[ -n "$transcript" ] || exit 0
[ -f "$transcript" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

session="${HOOK_SESSION_ID:-unknown}"
# Sampling gate, in pure bash, before the python spawn: what the module looks
# for is a RUN of WINDOW mono-call turns, a state that persists across several
# calls, so evaluating one call in SAMPLE catches it at worst one turn later.
SAMPLE=${HARNESS_BATCHING_SAMPLE:-3}
tick_file="/tmp/claude-batching-tick-${session}"
tick=0
[ -f "$tick_file" ] && read -r tick < "$tick_file" 2>/dev/null
case "$tick" in ''|*[!0-9]*) tick=0 ;; esac
tick=$(( (tick + 1) % SAMPLE ))
printf '%s' "$tick" > "$tick_file"
[ "$tick" -eq 0 ] || exit 0

state="/tmp/claude-batching-nudge-${session}"
last_alert=0
[ -f "$state" ] && last_alert=$(cat "$state" 2>/dev/null || echo 0)

python3 - "$transcript" "$WINDOW" "$COOLDOWN" "$last_alert" "$state" <<'PY'
import sys, json

transcript, window, cooldown, last_alert, state = sys.argv[1:6]
window, cooldown, last_alert = int(window), int(cooldown), int(last_alert)

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
        if d.get("isSidechain") or d.get("type") != "assistant":
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
    f"({total} such turns so far this session). Every turn resends the whole "
    "context, so independent calls belong in one message. Before the next call, "
    "check whether the following ones depend on its result — if not, send them "
    "together."
)
PY
exit 0
