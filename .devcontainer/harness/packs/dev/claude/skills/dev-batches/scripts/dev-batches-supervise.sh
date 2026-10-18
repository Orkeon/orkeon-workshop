#!/bin/bash
# The supervisor of a long /dev-batches run (D83, 2026-10-18) - handed to the user, run by the user.
#
# GAP-50-55 (2026-10-16 to 18) waited about 9 hours for a "go on": a night after the container stopped,
# two hours after the rate-limit window reset, a stall of 4 h 28 that ended at "where do you stand?". This
# script keeps the run's session alive in tmux and wakes it, while the state of the run has an open batch.
# /dev-batches copies it to .claude/local/scripts/ and hands it over (closing.md section 9); the user runs
# it once, in a terminal of the container (never inside Claude Code), then `tmux attach -t <session>`.
#
#   - The session is INTERACTIVE, `claude --continue` in a tmux window - never `claude -p`: a -p run does
#     not wait for a rate limit, and nothing documents that it waits for its background agents.
#   - Every --interval seconds, while <CODE>-BATCHES-STATE.md has an open batch (its last log line
#     `launched` or `relaunched`, no `closed` after - the lines /dev-batches section 2 appends):
#       the session exited      -> `claude --continue` typed again, then the message below;
#       no transcript of the project written for --idle minutes -> the message, once per idle period.
#     A message reaches an idle conversation only: a conversation that writes is never typed into.
#   - The `closed` line of the state ends it. HARNESS_AUTO_RESUME=1 lets the resumed session relaunch
#     the open batches from their checkpoints without a question (D82).
#
# It cannot wake a host that sleeps nor start a stopped container: the host's power plan is the user's;
# after a container restart the user runs it again. It writes nothing but its log and its lock.
#
# Usage: dev-batches-supervise.sh [--state <file>] [--session <name>] [--idle <minutes>]
#                                 [--interval <seconds>] [--check]
#   --state     the run's <CODE>-BATCHES-STATE.md (default: the newest under the work folder)
#   --session   the tmux session (default dev-batches)
#   --idle      minutes without a transcript write before the message (default 30)
#   --interval  seconds between two looks (default 60)
#   --check     print what it sees (state, open batches, session, last write) and exit: 0 open, 3 none
# Exit: 0 the run closed (or --check with an open batch), 1 a missing tool, 2 usage, 3 nothing open.
set -euo pipefail

session=dev-batches idle=30 interval=60 state="" check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --state) state="${2:?--state needs a file}"; shift 2 ;;
    --session) session="${2:?--session needs a name}"; shift 2 ;;
    --idle) idle="${2:?--idle needs minutes}"; shift 2 ;;
    --interval) interval="${2:?--interval needs seconds}"; shift 2 ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "dev-batches-supervise: unknown argument $1" >&2; exit 2 ;;
  esac
done
case "$idle$interval" in *[!0-9]*) echo "dev-batches-supervise: --idle and --interval take whole numbers" >&2; exit 2 ;; esac

top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "dev-batches-supervise: run it from the checkout" >&2; exit 2; }
work="${HARNESS_WORK_DIR:-}"; work="${work%/}"; [ -n "$work" ] && [ -d "$top/$work" ] || work=todo
if [ -z "$state" ]; then
  state=$(ls -t "$top/$work"/*/*-BATCHES-STATE.md 2>/dev/null | head -n 1 || true)
fi
message='Resume the batches (/dev-batches section 3): read the state file, then go on.'
logdir="$top/.claude/local/logs"; log="$logdir/dev-batches-supervise.log"
projects="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(printf '%s' "$top" | sed 's#[^A-Za-z0-9]#-#g')"

# The open batches of the state's log, in launch order (the format of /dev-batches section 2).
open_batches() {
  [ -n "$state" ] && [ -f "$state" ] || return 0
  awk '
    /^- [0-9-]+ [0-9:]+ closed[[:space:]]*$/ { delete last; n = 0; next }
    match($0, /^- [0-9-]+ [0-9:]+ F[0-9]+ (launched|relaunched|returned|merged|stopped)/) {
      split($0, w, " "); f = w[4]; if (!(f in last)) ord[++n] = f; last[f] = w[5]
    }
    END { for (i = 1; i <= n; i++) if (last[ord[i]] == "launched" || last[ord[i]] == "relaunched") printf "%s ", ord[i] }' "$state"
}
closed() { [ -n "$state" ] && [ -f "$state" ] && tail -n 1 "$state" | grep -qE '^- [0-9-]+ [0-9:]+ closed[[:space:]]*$'; }
# Minutes since the newest transcript of the project (main and subagents) was written; 99999 when none.
idle_minutes() {
  local newest
  newest=$(find "$projects" -name '*.jsonl' -printf '%T@\n' 2>/dev/null | sort -n | tail -n 1)
  [ -n "$newest" ] || { echo 99999; return; }
  echo $(( ( $(date +%s) - ${newest%.*} ) / 60 ))
}
pane_command() { tmux display-message -p -t "$session" '#{pane_current_command}' 2>/dev/null || true; }
say() { mkdir -p "$logdir"; printf '%s %s\n' "$(date '+%F %H:%M:%S')" "$*" | tee -a "$log"; }

if [ "$check" = 1 ]; then
  open=$(open_batches)
  printf 'state: %s\nopen: %s\nclosed: %s\nsession: %s (%s)\nidle: %s min\n' "${state:-none}" "${open:-none}" \
    "$(closed && echo yes || echo no)" "$session" "$(command -v tmux >/dev/null 2>&1 && pane_command || echo 'no tmux')" "$(idle_minutes)"
  [ -n "$open" ] && exit 0 || exit 3
fi

command -v tmux >/dev/null 2>&1 || { echo "dev-batches-supervise: tmux is missing (apt-get install tmux)" >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "dev-batches-supervise: claude is not on the PATH" >&2; exit 1; }
[ -n "$state" ] && [ -f "$state" ] || { echo "dev-batches-supervise: no <CODE>-BATCHES-STATE.md under $work/ - launch /dev-batches first, or pass --state" >&2; exit 3; }

# One supervisor per checkout.
mkdir -p "$top/.claude/local"
exec 9>"$top/.claude/local/dev-batches-supervise.lock"
flock -n 9 || { echo "dev-batches-supervise: already running for this checkout ($log)"; exit 0; }

if ! tmux has-session -t "$session" 2>/dev/null; then
  tmux new-session -d -s "$session" -c "$top"
  tmux send-keys -t "$session" 'claude --continue' Enter
  say "started tmux session $session with claude --continue - attach with: tmux attach -t $session"
else
  say "supervising the existing tmux session $session"
fi
say "state $state - idle $idle min - every $interval s"

nudged=0
while :; do
  sleep "$interval"
  if closed; then say "the run is closed: supervisor stops"; exit 0; fi
  open=$(open_batches)
  [ -n "$open" ] || { nudged=0; continue; }
  if ! tmux has-session -t "$session" 2>/dev/null; then
    tmux new-session -d -s "$session" -c "$top"
  fi
  case "$(pane_command)" in
    bash|zsh|sh|dash|fish|"")
      say "session exited with batches open (${open% }): claude --continue"
      tmux send-keys -t "$session" 'claude --continue' Enter
      sleep 30
      tmux send-keys -t "$session" "$message" Enter
      nudged=1; continue ;;
  esac
  m=$(idle_minutes)
  if [ "$m" -ge "$idle" ]; then
    if [ "$nudged" = 0 ]; then
      say "no transcript written for $m min with batches open (${open% }): message sent"
      tmux send-keys -t "$session" "$message" Enter
      nudged=1
    fi
  else
    nudged=0
  fi
done
