---
name: team-decision
description: "Records a change of an Orkeon team as a dated decision, at any moment of the method: writes workbooks/<slug>/decisions/DEC-nnnn-<title>.md (context in the user's words, decision, alternatives, impact), marks the sections of TEAM.md to revise, and repositions STATUS.md on the step to resume from — the spec, the tests or the build."
argument-hint: "\"<the change>\" [<slug>]"
disable-model-invocation: true
---

# /team-decision — record a change

Usable at any time (`references/process/workflow.md`). A change of mind is never applied silently: it
becomes a `DEC-nnnn`, the sections it touches are marked, and the workflow goes back to the earliest
step it reopens. You record and reposition; the step you send the user back to does the revising.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md`, `decisions/`, the sections of `TEAM.md` the change touches,
  `.claude/templates/DECISION.md`, `.claude/rules/workbook.md`.
- Writes: `decisions/DEC-nnnn-<kebab-title>.md`; one `> To revise — DEC-nnnn: …` line under each
  touched H2 of `TEAM.md`; `STATUS.md` front matter and journal; `orkeon-bench attempt open <slug> --by
  team-decision` when a built team has no open attempt.
- Journal: `— /team-decision — DEC-nnnn: <title>; resume from /team-<step>`; proposed: `— /team-decision
  — DEC-nnnn proposed: <title> (awaiting the user)`.

## Steps

### 1. Read where the team stands

1. The slug: the argument that names a workbook; otherwise the only team of `workbooks/`; otherwise ask
   (AskUserQuestion, one question).
2. `orkeon-bench status <slug>`, `workbooks/<slug>/STATUS.md`, the list of `decisions/`, and of
   `TEAM.md` only the sections the change touches.
3. The change itself: the quoted argument, or the user's last message when the skill follows a free
   message ("stop, change X"). If a step was in the middle of an action, that action is finished cleanly
   first — never a half-written batch, a half-filled section.

### 2. Classify — the earliest step the change reopens

| The change touches | Resume from | `STATUS.md` becomes |
|---|---|---|
| `## Need`, `## Acceptance` or `## Design`: purpose, inputs, outputs, mount points, rules, a criterion, an indicator, an invariant, a threshold, the budget, the levels, the format, the agents, the tasks, the tools, the batches | `/team-spec <slug>` (revises the marked sections, submits the gate again) | `phase: spec`, `gate_passed: null` |
| a test or a dataset alone — a wrong expectation, a missing case — with no threshold changed | `/team-tests <slug>` | `phase: tests`, `gate_passed: team` |
| the implementation alone — a bug of the crew with `TEAM.md` and the tests unchanged | `/team-build <slug>` (a correction sheet) | `phase: build`, `gate_passed: tests` |
| nothing upstream: a choice inside the current step, a fact worth dating | the current step | unchanged |

- A change that touches several rows resumes from the **earliest** one.
- The workflow never moves forward by a decision: when the team has not reached the step yet, `phase`
  and `gate_passed` stay as they are.
- One question for one decision: when the classification, or what exactly is decided, is not clear from
  the user's words, ask — AskUserQuestion, a single question, the reading you recommend first. Do not
  ask what the request already says.

### 3. Write the decision

- Number: the highest `DEC-nnnn` of `decisions/` plus one, four digits, never reused.
- File: `workbooks/<slug>/decisions/DEC-nnnn-<kebab-title>.md`, from `.claude/templates/DECISION.md`,
  every heading kept:
  - `- Date:` today · `- Requested by:` the user (or the step that raised it, for a `BLOCKED` review)
    · `- Phase:` the phase the team was in;
  - `## Context` — what was true before and what triggered the change; the user's words, quoted;
  - `## Decision` — one or two sentences that stand on their own;
  - `## Alternatives considered` — each one and why it was set aside (`None.` is for `DEC-0001` only:
    "keep things as they are" is always an alternative);
  - `## Impact` — one row per section of `TEAM.md` to revise, the step to resume from, the attempt opened;
  - `## Status` — `accepted` when the user asked for the change or confirmed it; `proposed` when you
    raise it yourself: then mark nothing and reposition nothing — add only the proposed journal line to
    `STATUS.md`, with `updated_at` — and ask the user to confirm. Once confirmed, set `accepted` and go
    on from § 4.
- A decision that replaces an earlier one: set that one's `## Status` to `superseded by DEC-nnnn`. Nothing
  else of a past decision is ever rewritten.

### 4. Mark what must be revised

Under each H2 of `TEAM.md` named in `## Impact`, right under the heading, before its first H3:

```
> To revise — DEC-nnnn: <what changes, in one line>
```

Do not revise the section here: the step that resumes reads the line, revises what the decision
changes, and removes it. A criterion that is dropped keeps its row with `dropped (DEC-nnnn)`
(`.claude/rules/workbook.md`).

### 5. Reposition `STATUS.md`

- Front matter, from the table of § 2: `phase`, `gate_passed`, `next_action` (the command of the step to
  resume from, with the slug), `updated_at`; `verdict: null`; `batch: null` when the resume point is
  before the build. `iteration` does not change.
- **A team that is already built** (`teams/<slug>/crew/` exists): the change needs an attempt to be
  proven in. One is open — an `attempts/ATT-nnnn/` whose `manifest.json` says `"closed_at": null` —: the
  decision is carried by it, change nothing. None is open: run `orkeon-bench attempt open <slug> --by
  team-decision` and write the id it prints in `attempt:` and in `## Impact`.
- Journal: the line of the Contract.
- Going back to `spec` reopens the user gate: `gate_passed` is lowered here, and only the user raises it
  again, by typing `/team-approve team <slug>` once `TEAM.md` is revised. You never raise it
  (`guard-phase` refuses it).

### 6. Hand over

Tell the user, in their language: the decision in one sentence and its number, what is marked to revise,
where the team stands now, and the command to run next. Then stop.

## Done when

The decision file exists with `## Status: accepted`, the touched sections carry their line, `STATUS.md`
points at the resume step. A decision never edits `crew/` or `tests/<slug>/` (the build and
`/team-tests` do, in their phase), never weakens a test to make a team pass, and approves nothing.
