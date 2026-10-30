---
name: dev-status
description: Read-only state of a dev chain - per batch of a code's plan, the plan's state and boxes, the sheet's TDD ticks, the last verdict and the last event of a /dev-batches run, from the work folder alone, with what disagrees; without a code, the codes of the work folder.
argument-hint: "[<code>]"
disable-model-invocation: true
---

# /dev-status — where the batches stand

D88, after Orkeon Code's `/dev-status` (ADR 0011). One script reads the work folder (`<work>/`, D69) and
prints; you relay. Nothing is written, launched, built or fixed here: it answers "where are we?" without
a batch's context, before a `/dev-batches` resume, after a restart or a compaction.

Arguments: $ARGUMENTS

## 1. Run

```bash
python3 .claude/skills/dev-status/scripts/dev-status.py <code>     # or no argument: the codes
```

Print its output as it is, in a code block. Exit `2` is a refusal (a usage error, a code that is not
kebab-case, no folder `<work>/<code>/`, or one holding no `SPEC-`, `CHANGE-` or `-PLAN.md` file): say its
line, and with no code, run it again without an argument to show the codes there are.

What it reads, and nothing else:

| Line | From |
|------|------|
| `code:` | the source (`SPEC-<code>.md`, `CHANGE-<code>.md`) and the global plan's title and `### Batch` lines |
| `F<n> <name> — <state> — boxes d/n` | the global plan's `### Batch F<n> — <Name> — open \| done (<date>)` and its step boxes |
| `sheet RED r/n GREEN g/n COST c/n` | the `TDD:` lines of `<CODE>-PLAN-F<n>.md`, or `no sheet` |
| `VALID <when> <mode> (k Minor)` / `GAPS …: b Blocking, m Major` | the last dated section of `<CODE>-VERIFY-F<n>.md`, or `no verdict` |
| `running (<event> <date> <time>)` / `<event> <date> <time>` | the batch's last line in the log of `<CODE>-BATCHES-STATE.md` (`closing.md` § 9) |
| `warning:` | a batch done in the plan with open ticks, a `VALID` the plan still says open, a sheet with no batch line |
| `/dev-learn due: …` | `learn-candidates.py`: untreated `Blocking` and `Major` gaps across two batches or more |

At most twenty batch lines and five warnings, the rest counted.

## 2. Then

One line, the next step the state names — never launched from here:

- a batch `running` while no agent of this conversation runs it: the resume of `/dev-batches`
  (`closing.md` § 8, from its checkpoints);
- a `GAPS` verdict: its correction (`/dev-batches` relaunches it; inline, `/dev-implement F<n> — correction: <gap>`);
- a warning: the file to fix, by hand or by the skill that writes it (the sheet and the plan: `/dev-implement` § 4);
- every batch `done`: the pull request of `closing.md` § 7, or nothing;
- `/dev-learn due`: `/clear`, then `/dev-learn`.

Talk in the user's language; the lines stay as printed.
