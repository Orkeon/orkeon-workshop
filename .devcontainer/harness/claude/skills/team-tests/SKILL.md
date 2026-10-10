---
name: team-tests
description: "Step 4 of the method: writes the tests of an Orkeon team before the team exists. From the validated ACCEPTANCE.md, TEST-PLAN.md, DESIGN.md and PLAN.md, has dataset-synthesizer produce the datasets of tests/<slug>/datasets/ and team-test-author the scenarios, the judge rubrics and the unit tests of the planned custom tools, each test citing the id it proves; orkeon-bench check design --tests checks the traceability. Ends at the tests-red gate, which the skill records itself (gate_passed: tests): every test exists, cites an id, and is red."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-tests — write the tests before the team

Step 4 of the method (`references/process/workflow.md` § 5). From `ACCEPTANCE.md`, `TEST-PLAN.md`,
`DESIGN.md` and `PLAN.md` you have the tests of the team written under `tests/<slug>/` — datasets,
component and end-to-end scenarios, judge rubrics, unit tests of the planned custom tools — by two
subagents, each on a compact contract that names paths and ids. The team does not exist yet, so every
test is **red**: that is the expected state, and the gate of this step. You orchestrate and judge; the
subagents produce; nothing in `teams/<slug>/` is written here.

Arguments: $ARGUMENTS

## 1. Find the team and read where it stands

1. The slug: the argument when it names a workbook; otherwise the only team whose `STATUS.md` names
   this step in `next_action`, or says `phase: tests`; otherwise ask which one (AskUserQuestion). No
   workbook at all: stop and name `/team-init <slug>`.
2. Run `orkeon-bench status <slug>` and read `workbooks/<slug>/STATUS.md`. Go on only when
   `gate_passed: design`, with `phase: design` (gate 3 has just been passed) or `phase: tests` (resuming,
   or revising what a decision reopened). Anything else, stop and say why: an earlier gate is not passed
   — `/team-status <slug>` names the step and the approval the team waits for —, or `gate_passed` is
   `tests` or later: the tests are written and frozen from the first build (D36), and a wrong test goes
   through `/team-decision "<change>"`, which reopens this step.
3. Starting, Edit the front matter of `STATUS.md`: `phase: tests`, `next_action: /team-tests <slug>`,
   `updated_at`, and add the journal line `- YYYY-MM-DD HH:MM — /team-tests — started from
   ACCEPTANCE.md, TEST-PLAN.md, DESIGN.md and PLAN.md`. Never touch `gate_passed` here.
4. Read, in this order, and never ask what they already answer:
   - `workbooks/<slug>/ACCEPTANCE.md`: every active `AC-nn` with its level and the dataset its Given
     names, every `IND-nn` with its measure, every `INV-…` with its check and lowest level. They are
     validated and are **not edited here**: a criterion that cannot be tested as written is a
     `/team-decision "<change>"`, never a softer test.
   - `workbooks/<slug>/TEST-PLAN.md`: `## Datasets` (name, origin, size, cases, ids served), `## LLM
     targets`, `## Judges` (`J-nn`, rubric file, scale, the indicator that holds the threshold),
     `## Repetitions and flakiness`.
   - `workbooks/<slug>/DESIGN.md`: `## Mounts` (the virtual roots a dataset binds, their access),
     `## Deliverables and schemas` (the paths and schemas the checks read), `## Tools` (the custom tools
     the unit tests import), `## Tasks and DAG` (the task a component scenario isolates).
   - `workbooks/<slug>/PLAN.md`: the `#### Anchors` of every batch — the column `Tests that observe it`
     names each test file as this step writes it; the column `Files to create or edit` names the
     modules the unit tests import (`teams/<slug>/crew/tools/<name>/domain.ts`).
   - `tests/<slug>/` as it stands — **resuming**: a scenario, a dataset or a rubric that exists and
     passes the traceability check is not written again. A line `> To revise — DEC-nnnn: …` under the
     title of one of the four artefacts means a decision reopened this step: read that decision, revise
     only the tests it touches (§ 6), then remove the line.
   - `.claude/rules/team-tests.md`, `.claude/templates/scenario.json`,
     `.claude/templates/dataset-manifest.json`, `references/testing/test-levels.md`,
     `references/testing/synthetic-data.md`, `references/testing/llm-judge.md` and
     `references/process/checklists/tests.md` — the gate you are driving towards.

## 2. The test matrix — yours, on paper first

Before any delegation, list in the conversation (not in a file) what must exist, from the artefacts:

- **one dataset per row of `## Datasets`**: `tests/<slug>/datasets/<name>/`, one subfolder per mount
  point of `## Mounts` named after it (`notes/` for `/notes`), `expected/` for the written roots, a
  `manifest.json` and a `README.md`; the cases the plan names (nominal, edge, language variants) and
  the **adversarial** set whenever `INV-INJECTION` is declared;
- **one scenario per active criterion**, at its level, named after it: `component/ac-nn-<name>.scenario.json`
  for `L2` (the task it isolates, the reply script of the simulated LLM), `e2e/ac-nn-<name>.scenario.json`
  for `L3` and `L4` (dataset, bindings of every mount point, deterministic checks, judges); a scenario may
  cover several ids, and every id it covers has a check that proves it;
- **the invariants**: each declared `INV-…` cited by a scenario at its lowest level or above
  (`inv-resume-<name>.scenario.json` when it needs a run of its own);
- **the indicators**: each `IND-nn` measured by a scenario or a judge that names it (today the bench
  reports them `not_run`: the test exists and is traceable all the same);
- **one rubric per judge** of `## Judges`: `tests/<slug>/judges/<name>.md`, version, scale, criteria,
  an example of 1 and of 5;
- **one vitest file per planned custom TypeScript tool**: `tests/<slug>/unit/<tool>.test.ts`, importing
  the domain module the Anchors name — never `tool.ts`, which needs `toolBuilder`
  (`references/typescript/clean-architecture-ddd.md`). A C# tool keeps its tests in its project: none here.

A row of the matrix the artefacts cannot fill — a dataset without its cases, a criterion whose Then no
check can decide, a tool without an anchor — is a gap of the plan: ask the user, and record the answer
with `/team-decision "<change>"` when it changes an artefact. Nothing is invented to fill a hole.

## 3. Delegate — contracts that name paths and ids

Two subagents write under `tests/<slug>/` (and `library/datasets/` for a shared dataset); you write
nothing there yourself. Each call carries a `description`, an explicit model, and a contract that
**names** every path, id and case (`delegation-guard` refuses less): a subagent does not search, it
produces, and answers `## BLOCKED` on what the contract lacks.

1. **`dataset-synthesizer`**, first — one call per dataset, or one call for the small ones: the
   dataset folder, the mount points and their subfolders, the cases to write (ids and kinds), the ids
   served, the template `dataset-manifest.json`, the adversarial cases when `INV-INJECTION` applies,
   and what must never appear (real personal data, a key, a real credential).
2. **`team-test-author`**, then — the scenarios, the rubrics and the unit tests: for each file its path,
   the ids it covers, the level, the dataset and the bindings, the checks that prove each id, the task
   it isolates and the reply script for a component scenario, the judge and its rubric for an
   end-to-end one, the modules a unit test imports; the templates `scenario.json` and the rule
   `team-tests.md`; the command whose exit code the report must carry (`orkeon-bench check design
   <slug> --tests`, and `npx vitest run tests/<slug>/unit` when unit tests were written).

Read every report. A `## DONE` lists the files, the ids covered and `- Command: … — exit N`: check the
files exist and the ids match the matrix. A `## BLOCKED` names what the contract lacked: settle it — a
path or an id you forgot goes back to the **same** agent in one short message (fewer than three turns);
a hole in the plan goes to the user, then to `/team-decision`. Never relaunch an agent with the same
instruction, and never fill the gap by writing the test yourself.

## 4. Check — the script, then the checklist

1. `orkeon-bench check design <slug> --tests` must end with **no error** (exit `0`): every test cites an
   id `ACCEPTANCE.md` declares, every active criterion and every declared invariant has a test at its
   level, the scenarios parse. Fix what it reports through the agent that wrote the file, and run it
   again. A warning is fixed, or kept with its reason for the user.
2. Walk `references/process/checklists/tests.md` box by box, on evidence: the script holds the
   traceability; you hold the content — a check that would be green before the team exists proves
   nothing (a file the dataset already holds, an assertion on the test's own copy of the logic), a
   threshold restated in a scenario, a model or a key named in a test, a judge where a deterministic
   check would do, a dataset without its adversarial cases.
3. **Red, observed.** Before the first build batch, `teams/<slug>/` does not exist (D35): the scenarios
   are red by construction, and `orkeon-bench run <slug> --level L2` refuses to start — say so, do not
   run it. For a unit test, `npx vitest run tests/<slug>/unit` exits non-zero because the modules do not
   exist yet: the author's report carries that exit code. For an adopted prototype (D34) the crew
   exists: when an attempt is open, run `orkeon-bench run <slug> --level L2` and list in the journal
   line the scenarios that already pass; otherwise the first build batch, which opens the attempt,
   measures them. A test that is green before the build and has no reason to be is a wrong test.

## 5. The tests-red gate — recorded by this step

This gate is not the user's (gates 1–3 are, D36): once § 4 holds, Edit the front matter of `STATUS.md`
— `gate_passed: tests`, `phase: tests`, `next_action: /team-build B1 <slug>`, `updated_at` — and add the
journal line `- YYYY-MM-DD HH:MM — /team-tests — tests red (<n> tests, all red)` (for an adopted
prototype: `tests red (<n> tests, <k> already pass: <ids>)`). `guard-phase` lets `gate_passed` rise to
`tests` once gate 3 is passed; it refuses it otherwise, and so do you.

Then show the user, in a few lines: the datasets (name, size, cases), the scenarios per level and the
ids they cover, the rubrics, the unit tests; the `check design --tests` summary (files, uncovered,
orphans — both empty); the warnings that stand and why; the assumptions. The next step is theirs to
launch: `/team-build B1 <slug>` (planned, lot 6: until it ships, the batch is built by hand with
`references/process/workflow.md` § 5 and the checklist `build.md`). From the first build on,
`tests/<slug>/` is frozen: a wrong test goes through `/team-decision`, then this step.

## 6. Revising after a decision

When an artefact carries `> To revise — DEC-nnnn: …`, or `/team-decision` sent the team back here:
change the tests the decision changes and nothing else — a dropped criterion (`Status: dropped
(DEC-nnnn)`) loses its scenario, a new one gains its own, a changed threshold changes no test (tests
cite ids, never numbers). The same contracts, the same agents, § 4 again, then the line is removed and
the gate recorded again (§ 5).

## 7. Pausing

When the user stops, or the session must end before the gate: update `STATUS.md` — `next_action:
/team-tests <slug>`, `updated_at`, and one journal line `- YYYY-MM-DD HH:MM — /team-tests — paused
(<n> datasets, <n> scenarios, <n> rubrics, <n> unit tests written)` — and say how to resume. The
journal only grows.

Talk in the user's language and write the prose in English — or both in the workshop's language when
one is set (`.claude/rules/workbook.md` § "Tone and language"); file names, ids, `covers`, the keys of
a scenario and of a manifest stay as the templates have them.

## 8. What this step never does

It writes nothing in `teams/<slug>/`; it edits neither `ACCEPTANCE.md`, `TEST-PLAN.md`, `DESIGN.md` nor
`PLAN.md`; it writes no test itself — the two subagents do, on a contract —; it never weakens a test to
make a future run pass, never names a model or a key in a test, and never calls a remote model. It
does not start the build.
