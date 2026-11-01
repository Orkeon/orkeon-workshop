---
name: team-approve
description: "The user's approval of a gate of the method, typed by the user and recorded by a hook before the model reads it: /team-approve team <slug> (the one gate on TEAM.md, written in STATUS.md), /team-approve remote <slug> <usd> (the budget gate: a paid run, written in the open attempt by orkeon-bench). Only the user invokes it."
argument-hint: "team <slug> | remote <slug> <usd>"
disable-model-invocation: true
---

# /team-approve — the user's approval

Typed: `/team-approve $ARGUMENTS`

An approval is recorded by the hook `team-approve.sh`, from the line the user typed, before you read this
(D36). You record nothing: you report what the hook did.

## Contract

- `team <slug>`: `TEAM.md` complete (`orkeon-bench check team <slug>` green, submitted by `/team-spec`
  with `next_action: /team-approve team <slug>`). The hook writes `gate_passed: team`, `phase: tests`,
  `next_action: /team-tests <slug>` and the journal line `— /team-approve — gate team passed`.
- `remote <slug> <usd>`: an open attempt, `next_action: /team-approve remote <slug> <usd>` set by
  `/team-run` from `orkeon-bench estimate`, the amount at or under the cap. The hook runs `orkeon-bench
  attempt approve <slug>`, which writes `remote-approval.json` in the attempt; `/team-run` journals the
  budget line.
- Any other gate name (`need`, `test-plan`, `design`): refused by the hook, which points to `team`.

## Steps

**Look for the hook's message in this turn.** Claude Code hands it to you as a system reminder that reads
`UserPromptExpansion hook additional context: team-approve: …` or `UserPromptSubmit hook additional
context: team-approve: …` — often both, with the same text.

- **A reminder holds `team-approve:`** — the hook recorded the approval. Tell the user, in their
  language, in two or three lines: what is recorded and for which team, and the next step with its
  command (`/team-loop <slug>` after `team`, `/team-run <slug>` after `remote`). Do not start that step:
  it is the user's to launch.
- **You find no such reminder** — do not conclude yet: read the end of the team's `STATUS.md`
  (`workbooks/<slug>/STATUS.md`). Its last journal line is `— /team-approve — …` with this very line,
  and `updated_at` is of this minute: the approval is recorded; say so as above (for `remote`, the open
  attempt must also hold `remote-approval.json`). Otherwise the hook did not run (hooks disabled,
  `python3` missing, `HARNESS_TEAM_APPROVE=0`) and **nothing was recorded**: say exactly that, and that
  the approval must be typed again once the hook runs (`.claude/harness/README.md` lists the switches).

In both cases:

- never write `gate_passed: team` in a `STATUS.md` yourself, never write or edit a
  `remote-approval.json`: `guard-phase` refuses both, and an approval Claude wrote is not one;
- never run this skill, or type its line, on the user's behalf — "ok", "validated", "go on" said in the
  conversation are not the approval; answer that a gate is passed by typing `/team-approve <gate> <slug>`;
- a refusal comes from the hook itself, to the user, with its reason (the team does not wait for that
  gate, `TEAM.md` is incomplete, no attempt is open, the amount is above the cap): when the user asks
  about one, `/team-status <slug>` says where the team stands.

## Done when

The user knows whether the approval was recorded and what command comes next.
