---
name: team-build
description: "Step 3 of the method: builds an Orkeon team batch by batch from TEAM.md § Plan — opens the attempt, has team-implementer write each batch into teams/<slug>/ (the first one through /orkeon-crew and orkeon-bench scaffold), checks it (check crew, L0 static, L1 unit), ticks the proofs in the batch sheet and hands over to /team-run once every batch is green. Also applies a FIX-PLAN after an ITERATE verdict."
argument-hint: "[B<n>] [<slug>]"
disable-model-invocation: true
---

# /team-build — build the batches

Step 3 of the method (`references/process/workflow.md`). The plan is the contract: one `### B<n>` sheet,
one implementer call, one proof per step. You orchestrate, check and tick; `team-implementer` writes;
you never write a file of `teams/<slug>/` yourself but `settings/<slug>/appsettings.json` and
`mounts.json`-derived files the bench writes.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`phase: build`, `gate_passed: tests` or, after ITERATE, `review`), `TEAM.md
  § Design` and `§ Plan`, the open attempt's `FIX-PLAN.md` when there is one, `.claude/rules/orkeon-yaml.md`
  or `orkeon-ts.md`, `references/process/checklists/build.md`.
- Writes: `TEAM.md § Plan` ticks and batch Status only; `STATUS.md`; `settings/<slug>/appsettings.json`
  when the plan asks (main thread, never a subagent).
- Bench: `orkeon-bench attempt open <slug> --by team-build` (first batch of an attempt), `orkeon-bench
  check crew <slug>`, `orkeon-bench run <slug> --level L1` (L0 then L1; L1 `skipped` when no unit test).
- Journal: `— /team-build — B<n> batch green` per batch; `— /team-build — correction C<n> green` per
  correction; `— /team-build — paused at B<n> step <k>`.
- Exit state: every batch (and correction) green → `gate_passed: build`, `phase: run`, `next_action:
  /team-run <slug>`.

## Steps

### 1. Find the team and the batch

1. The slug: the argument; else the only team with `phase: build`; else ask.
2. `orkeon-bench status <slug>`: `phase: build` with `gate_passed: tests` (first build) or `review`
   (after ITERATE, D38). Else stop and say why.
3. The batch: `B<n>` given, else the first row of `### Batches` not `done`; after ITERATE, the
   corrections of the attempt's `FIX-PLAN.md` (`#### Correction C<n> — F-<m>` sheets under the batch they
   touch) come first. The attempt: the open one of `attempts/`, else `orkeon-bench attempt open <slug>
   --by team-build` and its id in `attempt:`.
4. `STATUS.md`: `batch: B<n>`, journal `- … — /team-build — B<n> started (ATT-nnnn)`.

### 2. One batch, one implementer call

The sheet `### B<n>` is the contract, passed whole: Intent, Design decisions, Steps, Anchors,
Assumptions, plus the agent ids, tools and tasks of `§ Design` the batch reaches, the format, the rule
file, and the command whose exit code the report carries. `description` and model (`sonnet`) explicit.

- **The first batch** creates the team folder: the implementer writes `teams/<slug>/mounts.json` from
  `§ Design § Mounts`, then the crew through `/orkeon-crew --format <yaml|ts> --into teams/<slug>` (the
  skill reads `TEAM.md` and designs nothing again), then `orkeon-bench scaffold <slug>`. An adopted
  prototype (D34) is changed only where the sheet says.
- **A decision task** (D96) is generated only when `TEAM.md` has a `#### Decision model` (under
  `§ Acceptance § LLM targets`) and a row of the decision table of `§ Design § Tasks and DAG` for a closed
  choice: no agent, a name, its `fallback` (or an `otherwise` task), the gated task's one `when:`; only
  under `sequential`, `parallel` or `graph`, with one agent at least in the crew. Nothing else becomes
  one. Its proof at `L2` checks the fallback (`decision-chose`): a stub run has no decision model.
- **A settings file** (`settings/<slug>/appsettings.json`: a mailbox, a model) is yours, on the main
  thread, from the step marked so; never a key in it.
- **Anchors are the whole write set**: a file the implementer needs and the sheet does not name is a
  gap of the plan — it answers `## BLOCKED`; add the anchor (Edit the sheet, one line) and send the
  same agent one short message. Never relaunch with the same instruction.

### 3. Prove the batch

In this order, each exit code observed before the next:

1. `python3 .claude/skills/orkeon-crew/scripts/check_crew.py teams/<slug>` (YAML) or `check_team.py`
   (TS): `0 error(s)`.
2. `orkeon-bench check crew <slug>`: exit 0 (the crew as Orkeon loads it, the layout, the mount points).
3. `orkeon-bench run <slug> --level L1`: `L0 static` pass; `L1 unit` pass or `skipped` (no unit test;
   a `skipped` for a missing vitest is a gap of the image, say so).
4. `references/process/checklists/build.md` box by box.

A red check goes back to the implementer with the exact output, once; a second red is a `## BLOCKED`
to the user: never fix the crew yourself, never weaken a test, never touch `tests/<slug>/`.

### 4. Tick and go on

Edit the sheet: each step `TESTS ✅ · BUILD ✅ · L0/L1 ✅` on the observed result, the batch row Status
`done (ATT-nnnn)`; journal `- … — /team-build — B<n> batch green`. Next batch from § 1.3; `B<n>` given
as argument: stop after it with `next_action: /team-build B<n+1> <slug>`.

When every batch and correction is green: `STATUS.md` `gate_passed: build`, `phase: run`, `batch:
null`, `next_action: /team-run <slug>`, `updated_at`. Tell the user: the batches built, the files, the
checks and their exit codes, the assumptions. Then stop, unless `/team-loop` is driving.

### 5. Pausing

`next_action: /team-build B<n> <slug>`, `updated_at`, journal `- … — /team-build — paused at B<n> step
<k>`; a half-written batch is finished or reverted by the implementer first.

## Done when

Every batch row is `done`, the proofs are ticked on observed exit codes, `phase: run`. This step runs
no L2 or higher level, closes no attempt, edits `TEAM.md` only in `§ Plan`.
