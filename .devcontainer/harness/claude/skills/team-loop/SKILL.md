---
name: team-loop
description: "Drives the central loop of the method for an approved Orkeon team without a prompt between steps: /team-tests when the tests are not written, then /team-build, /team-run and /team-review, again on ITERATE, until ACCEPTED, BLOCKED, a remote approval the user must type, or two rounds. Each step keeps its own contract and journal; the loop adds one journal line per round."
argument-hint: "[<slug>] [--rounds 2]"
disable-model-invocation: true
---

# /team-loop — tests → build → run → review, until a verdict

The loop exists so that an approved `TEAM.md` becomes an accepted team in one command. It drives the
step skills in order; it decides nothing they do not, and it stops where a human is needed.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md`; starts only with `gate_passed` ∈ {`team`, `tests`, `build`, `review`} and a
  phase ∈ {`tests`, `build`, `run`, `review`}.
- Drives, by phase: `tests` → `/team-tests`; `build` → `/team-build`; `run` → `/team-run`; `review` →
  `/team-review` — each as its own skill file says (read it, apply it whole, including its journal
  lines and checks), then read `STATUS.md` again and continue from the new phase.
- Stops on: `verdict: ACCEPTED` (`phase: accepted` — says `/team-release <slug>` is next);
  `verdict: BLOCKED`; `next_action: /team-approve remote …` (the user types it, then `/team-loop` again);
  `--rounds` (default 2) ITERATE verdicts in this invocation; a step that stops itself (a `## BLOCKED`
  it could not settle, a refusal of a hook, a gap of the plan that needs the user).
- Journal: `— /team-loop — round <n> ended: <verdict>` after each `/team-review`; `— /team-loop —
  stopped: <reason>` when it stops before a verdict.
- Writes nothing the steps do not write.

## Steps

1. The slug: the argument, else the only team whose phase is in the loop, else ask. `orkeon-bench
   status <slug>`. Outside the loop's phases: stop and say why (`spec`: the gate is the user's —
   `/team-approve team <slug>`; `accepted`: `/team-release <slug>`; `published`: nothing to do).
2. Journal `- … — /team-loop — started (round 1, phase <phase>)`.
3. Round: run the step of the current phase, read `STATUS.md`, next step; after `/team-review`, the
   round's journal line. ITERATE and rounds left: next round from `build`. Otherwise stop.
4. Report, in the user's language: the rounds, each verdict with its gap count, the levels reached,
   the cost when remote, where the team stands and the command next.

Between steps, keep the context short: `/clear` is not yours to type, but you read `STATUS.md` and the
step's inputs rather than the conversation, and you never carry a step's reports into the next one.

## Done when

The loop stopped on one of the conditions of the Contract and said which. It never passes a gate,
never approves a budget, never edits a test or a threshold, and never runs a third round on its own.
