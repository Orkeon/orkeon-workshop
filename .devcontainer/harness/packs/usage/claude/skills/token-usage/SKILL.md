---
name: token-usage
description: "Measures Claude Code token usage and cost with cc-usage: what one session cost and what filled its context (startup, tools, replayed output, subagents), which project or week cost most. For: why was this session so expensive?"
argument-hint: "[<session id or path> | <days>]"
---

# /token-usage — what a session cost, and what filled its context

`cc-usage` rebuilds usage from Claude Code's transcripts (`$CLAUDE_CONFIG_DIR/projects`, else
`~/.claude/projects`). Nothing leaves the machine except a daily price list fetched from LiteLLM,
which `--no-fetch` skips. Costs are at the public API list price: a comparison, not a bill.

Arguments: $ARGUMENTS

## 1. Run the command the question needs

`cc-usage` is on the `PATH` in the image; elsewhere run `python3 /usr/local/share/cc-usage/cc-usage.py`
with the same arguments. Neither found: say so in one line and stop.

| Question | Command |
|---|---|
| this session, or one session: what filled its context | `cc-usage --session <id prefix or path> --top 15` |
| the same, for a script (the `(startup)` tokens) | `cc-usage --session <id> --json`, then `.sources[] \| select(.tool == "(startup)") \| .added` |
| what a project, a week, a month cost | `cc-usage --days 30 --top 12` (`--since YYYY-MM-DD`, `--project <text>`, `--models`, `--daily`) |
| a habit: is `Read` expensive, what do subagents cost | `cc-usage --days 30 --tools` (parses every transcript: the slow one) |
| which sessions to open first | `cc-usage --days 7 --triage` |
| a grade A to F per session | `cc-usage --days 30 --audit` |
| what the sessions left in git | `cc-usage --days 30 --yield` |

The current session is the newest transcript of this project:
`ls -t "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/*.jsonl | head -1`. Offline, add `--no-fetch`.
`--dashboard` and `--serve` are not installed: `claude-usage-dashboard` serves the aggregated view.

## 2. Instruction files, when the log is on

With the pack `usage` active, `.claude/local/context.log` holds one line per instruction file
loaded (time, reason, type, bytes, ~tokens, path, session, agent). For a question about startup
cost, sum the lines of the session (its first 8 characters) and set them beside the `(startup)`
tokens: the rest is the system prompt and the tool and skill definitions.

## 3. Report

A summary of the figures and of what they point to, in a few lines or one short table:

- the cost and how much of it is exact: "N of M sessions measured by Claude Code's counter";
  rebuilt from the transcript alone, a cost is a floor;
- the two or three lines that weigh most — `(startup)`, `(replayed output)`, `(compaction)`,
  `(subagents)`, a cache rebuilt after an idle gap — read as the guide below says;
- one action at most per finding, and none when nothing is avoidable: a long session that wasted
  nothing grades A, and a session that left no commit is not waste.

Before explaining a line you have not met, read `.claude/skills/token-usage/references/reading.md`;
it also holds the limits to state (list price, the 200k premium tier, the time zone, prices offline).
