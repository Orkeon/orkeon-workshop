---
name: team-status
description: "Says where an Orkeon team stands in the method — phase, last gate passed, track, iteration, attempt, batch, verdict, open decisions and questions, the next action and its command — from workbooks/<slug>/STATUS.md and the files around it; without a slug, one line per team of the workshop. Resumes the workflow after a /clear, a restart or a new session, and realigns STATUS.md when the files say otherwise."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-status — where things stand

Usable at any time (`references/process/workflow.md` § 5, § 10). `STATUS.md` is the state machine of a
team: everything needed to resume is on disk, nothing in the conversation. You read, you summarise, and
you realign `STATUS.md` only when the files contradict it — and only after the user said yes.

Arguments: $ARGUMENTS

## 1. Without a slug — the workshop

For every `workbooks/*/STATUS.md`, run `orkeon-bench status <slug> --json` and print one table:
team · phase · gate passed · track · iteration · attempt · verdict · next action. Then, in one line
each when there are any:

- teams of `teams/` without a workbook: prototypes, outside the method — `/team-init --adopt <slug>`
  brings one in (D34);
- workbooks without a team folder: normal before the first build (D35), worth a word after it.

One team only: go on with it as if it had been named.

## 2. With a slug — one team

1. `orkeon-bench status <slug>` (it works as soon as `workbooks/<slug>/` exists) and its warnings; read
   `workbooks/<slug>/STATUS.md`, journal included.
2. Look at what is on disk, without reading the artefacts in full:
   - which of `NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md` exist; which carry a
     `> To revise — DEC-nnnn` line; how many `TBD` and open questions `NEED.md` holds;
   - `decisions/`: the last one, and every one whose `## Status` is `proposed`;
   - `attempts/`: the open one (`manifest.json` with `closed_at: null`), the last verdict;
   - `teams/<slug>/` (does the team folder exist?), `tests/<slug>/` (is it still empty?).
3. Answer in the user's language, short:
   - **where**: the phase and what it means in one sentence, the last gate passed, the track, the
     iteration, the attempt and the batch when there are any, the verdict;
   - **what is open**: proposed decisions, artefacts to revise, blocking questions, an approval the team
     waits for (`next_action: /team-approve …` — the user types it, nobody else);
   - **what comes next**: the next action and the exact command, slug included. When that command is a
     skill that is not installed yet (`ls .claude/skills/`), say so: the step is done by hand, with the
     template of `.claude/templates/` and the checklist of `references/process/checklists/`.

## 3. Realign, when the files say otherwise

`STATUS.md` can lag behind after an interrupted session. Compare, then name each difference with its
evidence:

| The files say | `STATUS.md` should say |
|---|---|
| the artefact of the current step is complete and the journal's last line is older than it | `next_action`: the approval or the next step, not the step itself |
| an artefact carries `> To revise — DEC-nnnn`, and `phase` is past the step that writes it | the phase and `gate_passed` of that decision's resume point (`/team-decision` § 2) |
| `attempts/` holds an open attempt and `attempt:` is `null` or names another | `attempt:` the open one |
| `gate_passed` is ahead of `phase`, or `phase` is `build` or later with `attempt: null` (the warnings of `orkeon-bench status`) | the earlier of the two, or the attempt to open |
| `next_action` is empty, or names a step the phase has left behind | the command of the current step |

- Show the corrected front matter next to the current one and ask before writing (AskUserQuestion, one
  question: realign, or leave as it is).
- On yes: Edit the front matter (with `updated_at`) and add the journal line
  `- YYYY-MM-DD HH:MM — /team-status — realigned: <what, in a few words>`.
- **Never raise `gate_passed` to pass a user gate** — `need`, `test-plan`, `design`: those are recorded
  by the `/team-approve` hook, from the line the user types, and `guard-phase` refuses the edit. When the
  files show a validated artefact and no recorded gate, say that the gate is not passed and that the user
  passes it by typing `/team-approve <gate>`.
- When nothing differs, write nothing: a status that reads true is left alone.

## 4. What this skill never does

It edits no artefact but `STATUS.md`, runs no team, opens no attempt, and decides nothing: a difference
that is a change of mind rather than a lag is a `/team-decision`.
