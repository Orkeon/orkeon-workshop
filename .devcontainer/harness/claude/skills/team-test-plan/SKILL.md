---
name: team-test-plan
description: "Step 2 of the method: decides how an Orkeon team will be known to be right, before any design. From the validated NEED.md, writes workbooks/<slug>/ACCEPTANCE.md — acceptance criteria AC-nn on named datasets, indicators IND-nn with their thresholds, invariants INV-… — and TEST-PLAN.md — levels, datasets, LLM targets, judges, repetitions, budget — then tests/<slug>/bench.config.json from their values. The user settles the thresholds and the budget one question at a time. Ends at gate 2, which the user passes by typing /team-approve test-plan."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-test-plan — decide how we will know the team is right

Step 2 of the method (`references/process/workflow.md` § 5). From `NEED.md` you write
`workbooks/<slug>/ACCEPTANCE.md` and `workbooks/<slug>/TEST-PLAN.md`, then
`tests/<slug>/bench.config.json`, which carries their values to the bench. Everything later — the
design, the tests, the reports, the verdict — cites the ids born here. The files are the memory of
the step, not the conversation: what is decided is written at once.

Arguments: $ARGUMENTS

## 1. Find the team and read where it stands

1. The slug: the argument when it names a workbook; otherwise the only team whose `STATUS.md` names
   this step in `next_action`, or says `phase: test-plan`; otherwise ask which one (AskUserQuestion).
   No workbook at all: stop and name `/team-init <slug>`.
2. Run `orkeon-bench status <slug>` and read `workbooks/<slug>/STATUS.md`. Go on only in one of these
   states:

   | Track | `STATUS.md` says | Then |
   |---|---|---|
   | full | `gate_passed: need`, `phase: need` — gate 1 has just been passed | set `phase: test-plan` (below) and start |
   | full | `gate_passed: need`, `phase: test-plan` | resume, or revise what a decision reopened |
   | light (`track: light`, D37) | `gate_passed: null`, `phase: need` (or `test-plan`), and `next_action` no longer names `/team-need`: the need is complete | start or resume; leave the phase as it is until the one approval |

   Anything else, stop and say why: on the full track with `gate_passed: null`, gate 1 comes first
   (`/team-need <slug>`, then the user types `/team-approve need <slug>`); on the light track while
   `next_action` still names `/team-need`, the need is not finished; with `gate_passed: test-plan` or
   later, the criteria are validated, and a change of them goes through `/team-decision "<change>"`,
   which reopens this step — on the light track, step 1.
3. On the full track, the first time (`phase: need`), Edit the front matter of `STATUS.md`: `phase:
   test-plan`, `next_action: /team-test-plan <slug>`, `updated_at`, and add the journal line
   `- YYYY-MM-DD HH:MM — /team-test-plan — started from NEED.md`. A resume changes nothing here. Never
   touch `gate_passed`.
4. Read, in this order, and never ask what they already answer:
   - `workbooks/<slug>/NEED.md`, in full: it is the only source of what the team must do. **`NEED.md`
     is not edited here.** A gap or a contradiction you find in it is a question for the user, and its answer a
     change of the need: `/team-decision "<change>"` on the full track (the need is validated),
     `/team-need <slug>` on the light track (it is not yet).
   - `workbooks/<slug>/ACCEPTANCE.md` and `TEST-PLAN.md` when they exist — **resuming**: a row that is
     written is not proposed again. On the light track, when the journal of `STATUS.md` shows a
     `/team-need` line after the last `/team-test-plan` one, the need changed since: walk the coverage
     of § 2 again before anything else. A line `> To revise — DEC-nnnn: …` under a title means a decision
     reopened the step: read that decision, revise only what it changes (§ 6), then remove the line.
   - `workbooks/<slug>/decisions/`.
   - `references/testing/acceptance-criteria.md` and `references/testing/invariants-catalog.md`,
     before you write a single row; `references/testing/test-levels.md`,
     `references/testing/local-vs-remote.md`, `references/testing/synthetic-data.md` and
     `references/testing/llm-judge.md` when the plan reaches their subject.

## 2. Draft `ACCEPTANCE.md` from the need

Copy `.claude/templates/ACCEPTANCE.md` — every heading, in order, `{{TEAM_TITLE}}` replaced by the
title of `STATUS.md` — and fill its three tables. Draft first, from `NEED.md` alone; the questions
come after (§ 4).

**Acceptance criteria** — `AC-01`, `AC-02`…, one observable behaviour per row.

- Go through `## Outputs` and `## Processing rules` of the need: every output and every rule `R-nn`
  is covered by at least one acceptance criterion — or, for what must hold on **every** run or is a
  measure, by an invariant or an indicator — which cites it (`(R-04)`), or is a non-goal. Then
  `## Failure and resume`, `## Incremental processing and memory`, `## Security`: what must hold on
  every run is an invariant, not a criterion written twice.
- **Given** names a dataset in back-ticks, first (`` `nominal` (12 mails) ``; `` `edge`, case
  `edge-empty-body` ``) — a dataset you then list in `TEST-PLAN.md` — or "the crew definition" for a
  static criterion. **When** is the trigger ("the team runs" by default). **Then** is one outcome a
  deterministic check can decide: a file at a virtual path under a mount point of the need, a field
  equal to `expected/`, a count, a schema, a text absent, a tool never called.
- **Level**: the **lowest** level that can prove it — `L0` the definition alone, `L1` a deterministic
  tool's computation, `L2` the wiring whatever the model answers, `L3` a model's judgement on the data,
  `L4` what is required of a remote model — the production one, or a comparison the need asks for —,
  never proven by a local run. Attach each criterion to
  the level that proves it, whatever levels the bench serves today. **Status**: `active`.
- No threshold in a criterion ("at least 90 %" is an indicator), no "should", "correctly" or
  "gracefully", and **no agent, task, format or model name**: the design does not exist yet. A
  catalogue tool name appears only to forbid it.

**Indicators** — `IND-01`…: a measure, its unit, a numeric threshold, a direction (`>=` or `<=`), a
level. The Measure says what is counted, on which dataset, and how repetitions are aggregated. Take the
thresholds the need states (a duration, a cost); **never invent one silently**: a threshold the need
does not give is proposed to the user (§ 4). A local and a remote threshold are two rows, two ids. A
judge's score is an indicator that names the judge and its rubric. A threshold is a bare number — `100`,
`99.5`, a point for the decimals, never a comma — without its unit, which has its own column.

**Invariants** — copied from the catalogue **with the same id**, statement, check and lowest level:

- always: `INV-FS`, `INV-SECRETS`, `INV-TOOLS`, `INV-BUDGET`;
- `INV-INJECTION` when an input is untrusted (lowest level `L3`: a scripted model cannot prove it);
  `INV-RESUME` and `INV-INCR` when the need asks for resume or incremental processing; `INV-IDEMP` when
  the team acts outside or keeps state; `INV-SCHEMA` when a deliverable has a schema; `INV-EMAIL` when
  the team can send mail;
- the team's own as `INV-01`, `INV-02`…: a sentence true or false on any run, with the check that
  observes it. An invariant that does not apply is not declared — one without a check is a failing one.

Ids have two digits or more and are **never renumbered**. Delete the example rows of the template you
do not keep; a table never keeps a blank row.

## 3. Draft `TEST-PLAN.md`

Copy `.claude/templates/TEST-PLAN.md` the same way. A section with nothing to say holds `None.` — it
does not disappear, and never keeps the blank row of the template.

- `## Levels` — which levels run, when, the stop rule (the first red level). `L4` runs on request —
  or once before acceptance, when a criterion or an indicator sits at `L4` —, behind the budget gate.
- `## Datasets` — one row per dataset a criterion names, under the same name, in lower case with
  hyphens (`incr-v1`): origin `synthetic`, `provided` or `anonymized`, size, the cases it covers, the
  ids it serves, each written out. Plan the edge cases the need implies
  (empty, oversized, encoding, duplicates), an **adversarial** set serving `INV-INJECTION` whenever an
  input is untrusted, two successive sets when the team is incremental. Say what cannot be tested in
  the container. The datasets themselves are produced later, by `/team-tests`.
- `## LLM targets` — "LLM" is the model the **tested team** calls: `stub` for `L2`, `machine` for
  `L3`, a named profile for `L4` when a criterion or an indicator sits there. The need's
  `## Constraints` say whether a remote model is allowed at all; with no remote target, delete the
  `remote` row.
- `## Judges` — only where no deterministic oracle exists: `J-01`…, the rubric file
  (`tests/<slug>/judges/<name>.md`) and its version, the scale, and in the Threshold column the **id of
  the indicator** that holds the number. No judge: `None.`.
- `## Repetitions and flakiness` — runs per end-to-end scenario and the `pass@k` that counts: a local
  model is noisy, one run proves little. Invariants are not subject to `pass@k`.
- `## Budget` — local minutes and the remote cap in USD per attempt (2.00 by default); with no remote
  run planned, the remote row stays, at `0`.
- `## Pass criteria` — the whole rule: every active AC at its level, every IND within its threshold,
  every INV true.

## 4. What only the user decides — one question at a time

The draft is yours; the thresholds, the budget and the price of a proof are the user's. Put each to
them with AskUserQuestion — **one question for one decision**, 2 to 4 options, the one you recommend
first, marked `(Recommended)`, each with what it costs or risks — and **write the answer in the file
before the next question**. Ask, in this order, only what the need has not already settled:

1. each threshold the need does not state (accuracy, a judge's score, a duration, a cost);
2. whether a remote model must prove anything (`L4`), and with which profile and model — the user names
   them; the key lives in an environment variable, whose **name** goes in `keyEnv`, never the key;
3. the repetitions of a local end-to-end scenario and its `pass@k`;
4. the budget: local minutes per attempt, remote cap per attempt;
5. a dataset the user provides rather than a synthetic one, and whether real data may be used at all
   (anonymised real data enters `library/datasets/` only with a decision);
6. a judge, when a quality cannot be checked deterministically.

Do not ask what you can decide from the references — the level of a criterion, the catalogue
invariants, the shape of a dataset. An answer "I do not know" keeps your recommendation, written as
what it is: one sentence under `## Pass criteria` that says what is assumed and what will confirm it
(the first local run, the user at the gate).

Talk in the user's language and write the prose in English — or both in the workshop's language when
one is set (`.claude/rules/workbook.md` § "Tone and language"); headings, ids, table headers and fixed
words (`active`, `synthetic`, `None.`) stay as the templates have them.

## 5. `tests/<slug>/bench.config.json`

Write it from `.claude/templates/bench.config.json` with the values of the plan — the plan says, the
file carries (`references/process/artefacts.md` § 5):

- `profiles`: `machine` stays `{ "source": "orkeon-settings" }`; one entry per named profile of
  `## LLM targets` with `baseUrl`, `model`, `keyEnv`, `timeoutSeconds`. No remote target: remove the
  named profile of the template. Never a `<to decide>` left in a profile a level names, never a key.
- `levels.e2e_local`: `profile`, `repeat`, `pass_at`; `levels.e2e_remote`: `profile`, `repeat` — only
  when `L4` is planned.
- `budget.local_minutes_max` and `budget.remote_usd_max`: the numbers of `## Budget`;
  `retention.runs_keep`: 10 unless the user asked otherwise.

## 6. Revising after a decision

When an artefact carries `> To revise — DEC-nnnn: …`: change what the decision changes and nothing
else. A criterion that is given up **keeps its row**, with Status `dropped (DEC-nnnn)`; a new one takes
the next free number; a changed threshold is changed in its one row. Bring `TEST-PLAN.md` and
`bench.config.json` in step, then remove the line.

## 7. Pausing

When the user stops, or the session must end before the gate: update `STATUS.md` — `next_action:
/team-test-plan <slug>`, `updated_at`, and one journal line `- YYYY-MM-DD HH:MM — /team-test-plan —
paused at <section> (<n> AC, <n> IND, <n> INV written)` — and say how to resume. The journal only
grows. Nothing else is needed: the two files hold the rest.

## 8. Gate 2

When the three files are complete:

1. Run `orkeon-bench check test-plan <slug>`: it reads the three files, and the headings of
   `NEED.md`, and must end with **no error** (exit `0`). Fix what it reports and run it again; a warning
   is fixed, or explained to the user; an error it finds in `NEED.md` is not yours to fix here (§ 1). Then
   `orkeon-bench profile <slug> <name> --json` for each target of the plan: `remote` is true exactly
   for the targets the plan calls remote — `machine` included, which is remote as soon as what Orkeon
   will read points off the machine.
2. Walk `references/process/checklists/test-plan.md` box by box, on evidence: the script holds the
   shape, you hold the content — every output and every rule covered, each level the lowest, each Then
   decidable, no threshold written twice. Fix what is yours to fix; what needs the user becomes a
   question.
3. **Full track.** Update `STATUS.md`: `next_action: /team-approve test-plan <slug>`, `updated_at`, and
   the journal line `- YYYY-MM-DD HH:MM — /team-test-plan — ACCEPTANCE.md and TEST-PLAN.md complete,
   gate 2 submitted (<n> AC, <n> IND, <n> INV)`.
   **Light track** (D37): `next_action: /team-approve need <slug>` and the journal line `- … —
   /team-test-plan — ACCEPTANCE.md and TEST-PLAN.md complete (light track), gate 1 and gate 2
   submitted (<n> AC, <n> IND, <n> INV)`; `phase` and `gate_passed` stay as they are.
4. Show the user, in a few lines: the paths of the three files; the criteria with their level, the
   thresholds and the budget — what they are asked to validate; the datasets to produce; the boxes
   left open and why; the assumptions. Then say that they validate by typing
   `/team-approve test-plan <slug>` (on the light track `/team-approve need <slug>`, which covers the
   need too), amend by answering, or refuse. `next_action: /team-approve …` is what submits the gate:
   the hook records no approval without it.
5. When the user amends, or this step is run again on files already submitted, put `next_action:
   /team-test-plan <slug>` back first — the gate is not submitted while the files change — and submit
   again once the change is written and the check passes.

**You never pass gate 2 yourself.** `gate_passed` is written by the `/team-approve` hook, from the line
the user types — not by you, whatever the user says in the conversation ("ok", "validated", "go on" are
not the approval: answer that the gate is passed by typing `/team-approve test-plan`, or on the light
track `/team-approve need`). `guard-phase` refuses the edit. Silence is not a yes.

## 9. What this step never does

It writes no agent, task, tool choice, format or model of the team — that is `/team-design`, after the
gate; it writes no test, scenario or dataset — that is `/team-tests`; it does not edit `NEED.md`; and
it never weakens a criterion to make a later run pass.
