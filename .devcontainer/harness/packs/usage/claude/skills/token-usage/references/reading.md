# Reading cc-usage

Adapted from the guide of claude-code-token-usage (Pierre Belin, MIT; `.devcontainer/cc-usage/`
holds the licence and the upstream commit).

## Two sources of truth

Claude Code writes a `cost-state` counter into recent transcripts: it is authoritative, and
cc-usage takes it first. For other sessions the cost is rebuilt from the `usage` blocks of the
transcript, and that is a **floor**: the transcript keeps only the final branch of the conversation
(what a rewind abandoned was billed and is gone) and never holds the titling calls. Always state the
coverage ("N of M sessions are exact") rather than presenting a total as a measurement.

## Cost is in what a call leaves in the context

Every turn resends the whole accumulation: 40k tokens read at turn 5 of a 100-turn session are
resent 95 times. `--session` measures the real growth between two turns,
`ctx(i) - ctx(i-1) - output(i-1)` from the API `usage` (no tokenizer estimate), and weights it by
the number of turns that carried it. Parallel calls share their delta in proportion to result size.

## The lines without a tool name

- `(startup)`: the system prompt, the `CLAUDE.md` chain, the rules loaded at start, the tool and
  skill definitions — the first request, carried by every turn. With `--json`, its `added` is the
  figure to compare across profiles or configurations.
- `(compaction)`: what a `/compact` rebuilt, read off the transcript's own flag.
- `(context reset)`: a rewind; the context shrank, the line re-bases it.
- `(replayed output)`: Claude's own replies, resent as input on every later turn. It grows with
  the length of the session, not with the size of a reply; on a long session it is often the
  largest line, and the cure is a shorter session (`/clear` with a brief).

## Subagents run their own context

Their transcripts live in `<project>/<session>/subagents/agent-*.jsonl`. The main session pays
only the report handed back (the `Agent` line); the run itself is the `(subagents)` line and the
per-agent table. On a fan-out session they can outweigh the main chain: never answer "why was this
session expensive" without them.

## An idle gap costs money

A prompt cache entry lives five minutes (one hour when written with the 1 h TTL). After a longer
pause the next turn rewrites the whole prefix at the write rate instead of reading it at a tenth of
it. cc-usage reports those turns, the tokens rewritten and the avoidable cost.

## Grades and yield

- `--audit` grades each session A to F on what it could have avoided — duplicate or junk reads, a
  cache rebuilt after a gap, a compaction carried to the end, replies replayed past a fifth of the
  bill, instructions past 8 kB priced against that session's `(startup)` — as a **share of what the
  session cost**, never its size. Subagents and a heavy tool result are leads, not faults.
- `--yield` matches each session with the commits its repository received while it ran: landed,
  reverted, never merged, or no commit. A reading, debugging or planning session ends without a
  commit; what means something is the share of the bill in that category, week after week.
- A re-read after a compaction is legitimate, and a `Read` with `offset`/`limit` is a partial read,
  not a duplicate.

## Limits to state

- Cost is at the public API list price, not what a subscription bills.
- Past 200k tokens of prompt the API may bill a premium rate; it is applied where LiteLLM publishes
  one, and otherwise the run says how many requests were affected and their cost is a floor.
- A model LiteLLM does not price yet has its tokens counted and a cost of 0, and the run says so.
- Days follow the machine's time zone. Prices are cached 24 h in `~/.cache/cc-usage/`; offline, the
  last cache is used, and with none the cost is 0, which is reported.
