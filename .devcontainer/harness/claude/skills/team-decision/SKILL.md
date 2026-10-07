---
name: team-decision
description: "Records a change of an Orkeon team as a dated decision, at any moment of the method: writes workbooks/<slug>/decisions/DEC-nnnn-<title>.md (context in the user's words, decision, alternatives, impact), marks the artefacts to revise, and repositions STATUS.md on the step to resume from — the need, the test plan, the design or the tests."
argument-hint: "\"<the change>\" [<slug>]"
disable-model-invocation: true
---

# /team-decision — record a change

Usable at any time (`references/process/workflow.md` § 5, § 9). A change of mind is never applied
silently: it becomes a `DEC-nnnn`, the artefacts it touches are marked, and the workflow goes back to the
earliest step it reopens. You record and reposition; the step you send the user back to does the revising.

Arguments: $ARGUMENTS

## 1. Read where the team stands

1. The slug: the argument that names a workbook; otherwise the only team of `workbooks/`; otherwise ask
   (AskUserQuestion, one question).
2. `orkeon-bench status <slug>`, `workbooks/<slug>/STATUS.md`, the list of `workbooks/<slug>/decisions/`,
   and of the artefacts the change may touch only the sections it touches.
3. The change itself: the quoted argument, or the user's last message when the skill follows a free
   message ("stop, change X"). If a step was in the middle of an action, that action is finished cleanly
   first — never a half-written batch, a half-filled section.

## 2. Classify — the earliest step the change reopens

| The change touches | Resume from | `STATUS.md` becomes |
|---|---|---|
| the need: purpose, inputs, outputs, mount points, rules, triggers, constraints, security | step 1, `/team-need` | `phase: need`, `gate_passed: null` |
| how we will know: a criterion, an indicator, an invariant, a threshold, the budget, the levels | step 2, `/team-test-plan` | `phase: test-plan`, `gate_passed: need` |
| the design: format, orchestration, agents, tasks, tools, deliverables, the batches | step 3, `/team-design` | `phase: design`, `gate_passed: test-plan` |
| a test or a dataset alone — a wrong expectation, a missing case — with no threshold changed | step 4, `/team-tests` | `phase: tests`, `gate_passed: design` |
| nothing upstream: a choice inside the current step, a fact worth dating | the current step | unchanged |

- A change that touches several rows resumes from the **earliest** one.
- The workflow never moves forward by a decision: when the team has not reached the step yet, `phase`
  and `gate_passed` stay as they are.
- On the light track (`track: light`, D37) a change of the need or of the test plan resumes from step 1
  — `phase: need`, `gate_passed: null`: one approval covers both.
- One question for one decision: when the classification, or what exactly is decided, is not clear from
  the user's words, ask — AskUserQuestion, a single question, the reading you recommend first. Do not
  ask what the request already says.

## 3. Write the decision

- Number: the highest `DEC-nnnn` of `decisions/` plus one, four digits, never reused.
- File: `workbooks/<slug>/decisions/DEC-nnnn-<kebab-title>.md`, from `.claude/templates/DECISION.md`,
  every heading kept:
  - `- Date:` today · `- Requested by:` the user (or the step that raised it, for a `BLOCKED` review)
    · `- Phase:` the phase the team was in;
  - `## Context` — what was true before and what triggered the change; the user's words, quoted;
  - `## Decision` — one or two sentences that stand on their own;
  - `## Alternatives considered` — each one and why it was set aside (`None.` is for `DEC-0001` only:
    "keep things as they are" is always an alternative);
  - `## Impact` — one row per artefact to revise, the step to resume from, the attempt opened;
  - `## Status` — `accepted` when the user asked for the change or confirmed it; `proposed` when you
    raise it yourself: then mark nothing and reposition nothing — add only the journal line
    `- YYYY-MM-DD HH:MM — /team-decision — DEC-nnnn proposed: <title> (awaiting the user)` to `STATUS.md`,
    with `updated_at` — and ask the user to confirm. Once confirmed, set `accepted` and go on from § 4.
- A decision that replaces an earlier one: set that one's `## Status` to `superseded by DEC-nnnn`. Nothing
  else of a past decision is ever rewritten.

## 4. Mark what must be revised

In each artefact of `## Impact` that exists (`NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`, `DESIGN.md`,
`PLAN.md`), add one line right under its title, before the first `##`:

```
> To revise — DEC-nnnn: <what changes, in one line>
```

Do not revise the artefact here: the step that resumes reads the line, revises what the decision
changes, and removes it. A criterion that is dropped keeps its row with `dropped (DEC-nnnn)`
(`.claude/rules/workbook.md`).

## 5. Reposition `STATUS.md`

- Front matter, from the table of § 2: `phase`, `gate_passed`, `next_action` (the command of the step to
  resume from, with the slug), `updated_at`; `verdict: null`; `batch: null` when the resume point is
  before the build. `track` and `iteration` do not change.
- **A team that is already built** (`teams/<slug>/crew/` exists and the team has been through a build):
  the change needs an attempt to be proven in. One is open — an `attempts/ATT-nnnn/` whose `manifest.json`
  says `"closed_at": null` —: the decision is carried by it, change nothing. None is open: run
  `orkeon-bench attempt open <slug> --by team-decision` and write the id it prints in `attempt:` and in
  `## Impact`.
- Journal: `- YYYY-MM-DD HH:MM — /team-decision — DEC-nnnn: <title>; resume from /team-<step>`.
- Going back before a user gate reopens it: `gate_passed` is lowered here, and only the user raises it
  again, by typing `/team-approve …` once the artefact is revised. You never raise it (`guard-phase`
  refuses it).

## 6. Hand over

Tell the user, in their language: the decision in one sentence and its number, what is marked to revise,
where the team stands now, and the command to run next. Then stop.

What a decision does **not** do: edit `crew/` or `tests/<slug>/` (the build and `/team-tests` do, in
their phase), weaken a test to make a team pass, or approve anything.
