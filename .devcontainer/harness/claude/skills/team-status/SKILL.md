---
name: team-status
description: "Says where an Orkeon team stands in the method — phase, last gate passed, iteration, attempt, batch, verdict, open decisions and questions, the next action and its command — from workbooks/<slug>/STATUS.md and the files around it; without a slug, one line per team of the workshop. Resumes the workflow after a /clear, a restart or a new session, and realigns STATUS.md when the files say otherwise."
argument-hint: "[<slug>]"
---

# /team-status — where things stand

Usable at any time (`references/process/workflow.md`). `STATUS.md` is the state machine of a team:
everything needed to resume is on disk, nothing in the conversation. You read, you summarise, and you
realign `STATUS.md` only when the files contradict it — and only after the user said yes.

Arguments: $ARGUMENTS

## Contract

- Reads: `workbooks/*/STATUS.md`, `orkeon-bench status <slug> [--json]`, `TEAM.md` (headings and
  `> To revise` lines only), `decisions/`, `attempts/`, the presence of `teams/<slug>/` and `tests/<slug>/`.
- Writes: `STATUS.md` front matter and one journal line, on a confirmed realignment only.
- Phases: `spec → tests → build → run → review → accepted → published`; `gate_passed`: `null`, `team`,
  `tests`, `build`, `review`. The user gates are `team` and `remote` (`/team-approve`).

## Steps

### 1. Without a slug — the workshop

For the slugs of `workbooks/*/STATUS.md`, one Bash call: `for s in <slugs>; do orkeon-bench status "$s"
--json; done`; then print one table: team · phase · gate passed · iteration · attempt · verdict · next
action. Then, in one line each when there are any:

- teams of `teams/` without a workbook: prototypes, outside the method — `/team-init --adopt <slug>`
  brings one in (D34);
- workbooks without a team folder: normal before the first build (D35), worth a word after it.

One team only: go on with it as if it had been named.

### 2. With a slug — one team

1. `orkeon-bench status <slug>` (it works as soon as `workbooks/<slug>/` exists) and its warnings; read
   `workbooks/<slug>/STATUS.md`, journal included.
2. Look at what is on disk, without reading the artefacts in full:
   - `TEAM.md`: which of `## Need`, `## Acceptance`, `## Design`, `## Plan` are filled (no `TODO`), which
     carry a `> To revise — DEC-nnnn` line, how many open questions `### Open questions` holds, how many
     batches are `done`;
   - `decisions/`: the last one, and every one whose `## Status` is `proposed`;
   - `attempts/`: the open one (`manifest.json` with `closed_at: null`), its `report.json`,
     `capture.md`, `remote-approval.json`; the last verdict;
   - `teams/<slug>/` (does the team folder exist?), `tests/<slug>/` (is it still empty?).
3. Answer in the user's language, short:
   - **where**: the phase and what it means in one sentence, the last gate passed, the iteration, the
     attempt and the batch when there are any, the verdict;
   - **what is open**: proposed decisions, sections to revise, blocking questions, an approval the team
     waits for (`next_action: /team-approve …` — the user types it, nobody else);
   - **what comes next**: the next action and the exact command, slug included (`/team-loop <slug>`
     drives tests → build → run → review in one go).
4. **A failed run** — the last `report.json` holds a scenario with `status: fail`: say why, in one line.
   Its `failure_class` (`decision_blocked`, `decision_provider`), when set, is the bench's and decides.
   Otherwise call `run-analyst` (`description` explicit) on that scenario's latest run folder; then, as
   a second signal, optional (D98):

   ```bash
   orkeon-bench decide choice --question "Why did this Orkeon team run fail?" --context-file <a file holding the analyst's Notes> \
     --option "prompt=the agents' prompts" --option "tool=a tool or its use" --option "dag=the tasks' order or context" \
     --option "data=the input data" --option "model=the model's limits" --option "flaky=an intermittent failure" \
     --option "need=the need itself" --option "decision_blocked=a decision stage blocked a call" \
     --option "decision_provider=the decision provider failed"
   ```

   Without `--allow-remote`: a paid `decide` is priced and submitted by `/team-run` alone (D104); a
   remote provider then answers exit 4, and the analyst's category stands alone.
   The context file is `$CLAUDE_JOB_DIR/tmp/<slug>-failure.txt` (or `/tmp` outside a job): the analyst's
   `Notes` and the run's `error` events — those alone, not the events file: the bench keeps the first 4 KB
   on a line boundary (`--max-context-bytes`; the local Kev answers 500 past about 5 KB). Exit 0: give its `answer` and `confidence` beside the analyst's
   category, and say when they differ.
   Exit 4 (no decision model) or any other code: the analyst's category alone, exactly as without it.
   Neither decides anything: the reviewer confirms (`/team-review`).

### 3. Realign, when the files say otherwise

`STATUS.md` can lag behind after an interrupted session. Compare, then name each difference with its
evidence:

| The files say | `STATUS.md` should say |
|---|---|
| `TEAM.md` is complete, `check team` green, and the journal's last line is older than it | `next_action: /team-approve team <slug>` — the gate itself, which `/team-status` never passes |
| `TEAM.md` carries `> To revise — DEC-nnnn`, and `phase` is past `spec` | the phase and `gate_passed` of that decision's resume point (`/team-decision` § 2) |
| `attempts/` holds an open attempt and `attempt:` is `null` or names another | `attempt:` the open one |
| `gate_passed` is ahead of `phase`, or `phase` is `build` or later with `attempt: null` (the warnings of `orkeon-bench status`) | the earlier of the two, or the attempt to open |
| every batch of `### Batches` is `done` and `phase: build` | `phase: run`, `next_action: /team-run <slug>` |
| the open attempt holds `report.json` and `capture.md` and `phase: run` | `phase: review`, `next_action: /team-review <slug>` |
| `next_action` is empty, or names a step the phase has left behind | the command of the current step |

- Show the corrected front matter next to the current one and ask before writing (AskUserQuestion, one
  question: realign, or leave as it is).
- On yes: Edit the front matter (with `updated_at`) and add the journal line
  `- YYYY-MM-DD HH:MM — /team-status — realigned: <what, in a few words>`.
- **Never raise `gate_passed` to `team`**: it is recorded by the `/team-approve` hook, from the line the
  user types, and `guard-phase` refuses the edit. When `TEAM.md` is complete and no gate is recorded, say
  that the gate is not passed and that the user passes it by typing `/team-approve team <slug>`.
- When nothing differs, write nothing: a status that reads true is left alone.

## Done when

The user knows where the team stands and the command next. This skill edits no artefact but
`STATUS.md`, runs no team, opens no attempt, and decides nothing: a difference that is a change of mind
rather than a lag is a `/team-decision`.
