---
name: team-approve
description: "The user's approval of a gate of the method, typed by the user and recorded by a hook before the model reads it: /team-approve need, /team-approve test-plan, /team-approve design (gates 1 to 3, written in STATUS.md), /team-approve remote <usd> (the budget gate: a paid run, written in the open attempt by orkeon-bench). Only the user invokes it."
argument-hint: "need | test-plan | design | remote <usd>  [<slug>]"
disable-model-invocation: true
---

# /team-approve — the user's approval

Typed: `/team-approve $ARGUMENTS`

An approval is recorded by the hook `team-approve.sh`, from the line the user typed, before you read this
(D36). You record nothing: you report what the hook did.

**Look for the hook's message in this turn.** Claude Code hands it to you as a system reminder that reads
`UserPromptExpansion hook additional context: team-approve: …` or `UserPromptSubmit hook additional
context: team-approve: …` — often both, with the same text.

- **A reminder holds `team-approve:`** — the hook recorded the approval. Tell the user, in their
  language, in two or three lines: what is recorded and for which team, and the next step with its
  command (the message names it). Do not start that step: it is the user's to launch.
- **You find no such reminder** — do not conclude yet: read the end of the team's `STATUS.md` — the
  team the line names (`workbooks/<slug>/STATUS.md`; a pilot's is `library/examples/workbooks/<slug>/STATUS.md`),
  else the one team of `workbooks/` whose journal ends with a `/team-approve` line. Its last journal line
  is `— /team-approve — … the user typed …` with this very line, and `updated_at` in the front matter is
  of this minute: the approval is recorded; say so as above (for `remote`, the open attempt must also
  hold `remote-approval.json`). Otherwise the hook did not run (hooks disabled, `python3` missing, `HARNESS_TEAM_APPROVE=0`)
  and **nothing was recorded**: say exactly that, and that the approval must be typed again once the hook
  runs (`.claude/harness/README.md` lists the switches).

In both cases:

- never write `gate_passed` in a `STATUS.md` yourself, never write or edit a `remote-approval.json`:
  `guard-phase` refuses both, and an approval Claude wrote is not one;
- never run this skill, or type its line, on the user's behalf — "ok", "validated", "go on" said in the
  conversation are not the approval; answer that a gate is passed by typing `/team-approve <gate>`;
- a refusal comes from the hook itself, to the user, with its reason (the team does not wait for that
  gate, the artefact is missing, the step has not submitted the gate yet, no attempt is open, the amount
  is above the cap): when the user asks
  about one, `/team-status <slug>` says where the team stands.
