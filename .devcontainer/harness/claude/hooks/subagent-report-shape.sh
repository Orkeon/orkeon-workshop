#!/usr/bin/env bash
# SubagentStop hook — checks the SHAPE of what a harness subagent hands back, and
# makes the agent re-emit it when a required piece is missing.
#
# Adapted from claude-code-toolkit/hooks/subagent-report-shape.sh (MIT, see
# THIRD-PARTY.md): labels `RED`/`GREEN` became `DONE`/`BLOCKED` and their fields
# are the ones of FROZEN-LITERALS.md — the same ones hooks/delegation-guard.sh
# grafts into every delegation prompt and the agent charters describe.
#
# Two shapes:
#   - the closing report, `## DONE` or `## BLOCKED`, with its fields;
#   - the review of `team-reviewer`. A subagent writes no file under a team: the
#     reviewer RETURNS its verdict, its gap table and its fix plan, and the
#     /team-review skill writes ANALYSIS.md and FIX-PLAN.md from that message in
#     the main thread. So the message must open with `## Verdict — ACCEPTED`,
#     `## Verdict — ITERATE` or `## Verdict — BLOCKED`, carry `## Gaps` with the
#     gap table, `## Fixes` with the fix table when the verdict is ITERATE, and
#     end with the `## DONE` report. Headings and columns are those of
#     templates/ANALYSIS.md and templates/FIX-PLAN.md.
#
# Why here and not in the orchestrator: a report missing its `Command` line
# costs the orchestrator a turn to notice plus a message to repair. The agent
# still holds its context, so it re-emits for free.
#
# Form only, never content. A failing command, an unexpected exit code, a gap
# without evidence are the ORCHESTRATOR's call: the hook only demands a complete
# message. A message carrying none of these headings passes untouched.
#
# Channel: `decision: block` + `reason`. `stop_hook_active` closes the loop — a
# second pass never blocks again, whatever the report still lacks. When the
# payload carries no `last_assistant_message`, the agent transcript is read for
# the last assistant text.
set -uo pipefail

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

HOOK_INPUT="$INPUT" python3 <<'PYEOF'
import json, os, re, sys, unicodedata

try:
    d = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)
if not isinstance(d, dict):
    sys.exit(0)

if d.get("stop_hook_active"):
    sys.exit(0)

msg = d.get("last_assistant_message")


def last_assistant_text(path):
    text = ""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if '"assistant"' not in line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get("type") != "assistant":
                    continue
                parts = [c.get("text", "") for c in e.get("message", {}).get("content", [])
                         if isinstance(c, dict) and c.get("type") == "text"]
                if parts:
                    text = "\n".join(parts)
    except OSError:
        return ""
    return text


if not isinstance(msg, str) or not msg.strip():
    for key in ("agent_transcript_path", "transcript_path"):
        p = d.get(key)
        if isinstance(p, str) and p and os.path.isfile(p):
            msg = last_assistant_text(p)
            if msg.strip():
                break
if not isinstance(msg, str) or not msg.strip():
    sys.exit(0)

# FROZEN-LITERALS.md — report fields, verdicts, table columns. Compared on the
# fold so casing never decides whether a message is complete; the labels
# themselves do not move.
REQUIRED = {
    "DONE": ["Files", "Ids covered", "Command", "Notes"],
    "BLOCKED": ["Reason", "Missing", "Next"],
}
VERDICTS = ("ACCEPTED", "ITERATE", "BLOCKED")
GAP_COLUMNS = ["#", "Severity", "Id", "Observed", "Category", "Evidence"]
FIX_COLUMNS = ["Fix", "Gap #", "Change", "Files", "Batch", "Expected effect"]
REVIEWER = "team-reviewer"


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower())
                   if unicodedata.category(c) != "Mn")


def section(text, title):
    """The text of `## <title>` up to the next `## ` heading, or None."""
    m = re.search(r"^##\s+" + re.escape(title) + r"\s*$", text, re.M)
    if not m:
        return None
    rest = text[m.end():]
    nxt = re.search(r"^##\s", rest, re.M)
    return rest[:nxt.start()] if nxt else rest


def table_rows(text, columns):
    """Number of data rows under the header made of `columns`, or None when the header is absent."""
    want = [fold(c) for c in columns]
    lines = text.splitlines()
    for i, line in enumerate(lines):
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [" ".join(fold(c).split()) for c in s.strip("|").split("|")]
        if cells != want:
            continue
        rows = 0
        for nxt in lines[i + 1:]:
            t = nxt.strip()
            if not t.startswith("|"):
                break
            if re.match(r"^\|[\s|:-]+\|?$", t):
                continue
            rows += 1
        return rows
    return None


issues = []
agent_type = d.get("agent_type") or ""
report = re.search(r"^##\s+(DONE|BLOCKED)\s*$", msg, re.M)
# The verdict heading of a review: `## Verdict`, alone or followed by a dash or a
# colon. `## Verdict input` — a section of REPORT.md an agent may quote — is not one.
verdict = re.search(r"^##\s+Verdict[ \t]*(?:[—–:-][^\n]*)?$", msg, re.M)
is_review = verdict is not None or (agent_type == REVIEWER and not (report and report.group(1) == "BLOCKED"))

if not report and not is_review:
    sys.exit(0)

# --- the review of team-reviewer ---------------------------------------------
if is_review:
    word = ""
    if verdict is None:
        issues.append("a review opens with `## Verdict — ACCEPTED`, `## Verdict — ITERATE` or `## Verdict — BLOCKED`")
    else:
        m = re.match(r"^##\s+Verdict\s+—\s+(\S+)\s*$", verdict.group(0))
        word = m.group(1) if m else ""
        if word not in VERDICTS:
            issues.append("the verdict heading reads `## Verdict — ACCEPTED`, `## Verdict — ITERATE` or "
                          "`## Verdict — BLOCKED`, nothing else on the line")
            word = ""
    gaps = section(msg, "Gaps")
    if gaps is None:
        issues.append("`## Gaps` section missing")
    else:
        rows = table_rows(gaps, GAP_COLUMNS)
        if word and word != "ACCEPTED" and not rows:
            issues.append("`## Gaps` needs the table `| " + " | ".join(GAP_COLUMNS) + " |` with one row per gap")
        elif rows is None and not re.search(r"\bnone\b", gaps, re.I):
            issues.append("`## Gaps` holds neither the table `| " + " | ".join(GAP_COLUMNS) + " |` nor `None.`")
    if word == "ITERATE":
        fixes = section(msg, "Fixes")
        if fixes is None or not table_rows(fixes, FIX_COLUMNS):
            issues.append("an ITERATE verdict carries `## Fixes` with the table `| " + " | ".join(FIX_COLUMNS)
                          + " |` and one row per fix")
    if not report:
        issues.append("the closing `## DONE` report is missing")

# --- the closing report --------------------------------------------------------
kind = report.group(1) if report else ""
if report:
    body = msg[report.end():]
    labels = {fold(m.group(1).strip()) for m in re.finditer(r"^\s*[-*]\s*([^:\n]+?)\s*:", body, re.M)}
    missing = [lb for lb in REQUIRED[kind] if fold(lb) not in labels]
    if missing:
        issues.append("missing lines: " + ", ".join(f"`- {lb}:`" for lb in missing))

    # `— exit N` sits on the `Command` line: without it the orchestrator cannot tick
    # a step on observed evidence and asks for it every time. `none` is accepted for
    # an agent that ran nothing (judge, analyst).
    cmd_line = next((l for l in body.splitlines()
                     if re.match(r"^\s*[-*]\s*", l) and fold(l).lstrip(" -*").startswith("command")), "")
    if cmd_line and not re.search(r"exit\s+\d+", cmd_line, re.I) \
            and not re.search(r":\s*`?none`?(\s|$|[.,;(])", cmd_line, re.I):
        issues.append("`- Command:` line without an observed exit code (`— exit N`) or `none`")

if not issues:
    sys.exit(0)

what = "review" if is_review else "`## " + kind + "` report"
reason = ("Incomplete " + what + " — " + "; ".join(issues) + ". "
          "Re-emit the whole message in the shape of your charter, without re-running a command "
          "or touching a file: the values are already in your context.")
# ASCII-escaped JSON: valid whatever the locale of the session.
sys.stdout.write(json.dumps({"decision": "block", "reason": reason}) + "\n")
PYEOF

exit 0
