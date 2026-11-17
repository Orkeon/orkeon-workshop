---
name: team-tests
description: "Step 2 of the method: writes the tests of an Orkeon team before the team exists, from the validated TEAM.md — dataset-synthesizer produces the datasets of tests/<slug>/datasets/, team-test-author the scenarios (L2 component, L3/L4 end-to-end with sequence and indicators), the judge rubrics and the unit tests of the planned custom tools, each test citing the id it proves; orkeon-bench check team --tests checks the traceability. Records gate_passed: tests itself and hands over to /team-build."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-tests — write the tests before the team

Step 2 of the method (`references/process/workflow.md`). From `TEAM.md § Acceptance`, `§ Design` and
`§ Plan` you have the tests of the team written under `tests/<slug>/` by two subagents, each on a
contract that names paths and ids. The team does not exist yet, so every test is **red**: that is the
expected state. You orchestrate and judge; the subagents produce; nothing in `teams/<slug>/` is written.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`gate_passed: team`, `phase: tests`), `TEAM.md`, `tests/<slug>/` as it stands,
  `.claude/rules/team-tests.md`, `.claude/templates/scenario.json`, `dataset-manifest.json`,
  `references/process/checklists/tests.md`.
- Writes: nothing itself under `tests/<slug>/` — the subagents do; `STATUS.md`.
- Check: `orkeon-bench check team <slug> --tests` ends with no error.
- Journal: `— /team-tests — tests written (<n> tests, L0 green)` (adopted prototype: `(<n> tests, <k>
  already pass: <ids>)`); paused: `— /team-tests — paused (<n> datasets, <n> scenarios, <n> rubrics, <n>
  unit tests written)`.
- Exit state: `gate_passed: tests`, `phase: build`, `next_action: /team-build <slug>`. Once the last
  batch is built (`gate_passed: build`, then every later phase), `tests/<slug>/` is frozen (`guard-phase`,
  D89) — and `team-implementer` never writes it: a wrong test goes through `/team-decision`, then this
  step.

## Steps

### 1. Find the team and read where it stands

1. The slug: the argument; else the only team with `phase: tests`; else ask (AskUserQuestion).
2. `orkeon-bench status <slug>`: go on only with `gate_passed: team` and `phase: tests` (the gate has
   just been passed, or resuming) — or `gate_passed: tests` with a `> To revise — DEC-nnnn` line in
   `TEAM.md` (a decision reopened this step). Anything else: stop and say why (`/team-status <slug>`).
3. Journal line `- YYYY-MM-DD HH:MM — /team-tests — started` with `updated_at`.
4. Read `TEAM.md`: every active `AC-nn` (level, dataset of its Given), every `IND-nn` (measure), every
   `INV-…`; `### Datasets`, `### LLM targets`, `### Judges`; `§ Design` `### Mounts`, `### Deliverables
   and schemas`, `### Tools`, `### Tasks and DAG`; `§ Plan` anchors (`Tests that observe it` names each
   file as this step writes it; `Files to create or edit` names the modules unit tests import). They
   are validated and **not edited here**: a criterion that cannot be tested as written is a
   `/team-decision "<change>"`, never a softer test. Then `references/testing/`: `test-levels.md`,
   `synthetic-data.md` § "Adversarial" and "The manifest", `llm-judge.md` § "The rubric" (by section,
   with `code-map.py show`).

### 2. The matrix — on paper first

List in the conversation what must exist:

- one dataset per row of `### Datasets`: `tests/<slug>/datasets/<name>/`, one subfolder per mount point
  named after it, `expected/` for the written roots, `manifest.json`, `README.md`; the adversarial set
  whenever `INV-INJECTION`; the successive sets of an incremental team;
- one scenario per active criterion, at its level, named after it: `component/ac-nn-<name>.scenario.json`
  (`L2`: the task isolated, the reply script of the stub) or `e2e/ac-nn-<name>.scenario.json` (`L3`/`L4`:
  dataset, bindings of every mount point, deterministic checks, `judges`, `indicators` naming the
  `IND-nn` it measures);
- the invariants: each cited by a scenario's `covers` at its level or above; `INV-IDEMP`, `INV-RESUME`,
  `INV-INCR` by a scenario with a `sequence` (`inv-resume-<name>.scenario.json`: the steps, the
  `kill_after_task`, the checks after the last step);
- the indicators: each `IND-nn` measured by a scenario's `indicators` or by a judge;
- with a `#### Decision model` in `TEAM.md` (D96), two scenarios per decision task of the decision
  table, each covering the criterion that states it: **the fallback at L2**,
  `component/ac-nn-<name>-fallback.scenario.json` — on the stub every decision answers its fallback,
  so `decision-chose` (`task`, `question`, the fallback's `option`) and `task-skipped` for a task its
  `when:` leaves out on that answer; **the decided route at L3**, `e2e/ac-nn-<name>-decided.scenario.json`
  — `decision-answered` (the model answered, not the fallback; refused in a component scenario),
  `decision-chose` on a case whose answer the dataset fixes, `task-skipped` for the branch not taken,
  and under `indicators` the `IND-nn` that measure `decision_defaulted_rate` or
  `decision_confidence_min`. The events carry no task key: `task` names a decision by its role, agent
  or task id, or by the decision key the gated task's `skipReason` quotes;
- one rubric per `J-nn`: `tests/<slug>/judges/<name>.md`, version, scale, criteria, an example of 1 and of 5;
- one vitest file per planned custom TypeScript tool: `tests/<slug>/unit/<tool>.test.ts`, importing
  the domain module the anchors name (never `tool.ts`); a C# tool keeps its tests in its project.

A C# team (`/orkeon-crew-csharp`): the same datasets, scenarios and rubrics — the bench runs them
through the team's host, which takes the options of `orkeon run` and writes the same events; no
`tests/<slug>/unit/` for its C# code, whose tests L1 runs with `dotnet test` of `host/`.

A row the artefacts cannot fill is a gap of the plan: ask the user, record the answer with
`/team-decision` when it changes `TEAM.md`. Nothing is invented to fill a hole.

### 3. Delegate — contracts that name paths and ids

Each call: a `description`, an explicit model (`sonnet`), a contract that names every path, id and case
(`delegation-guard` refuses less). A subagent produces; it answers `## BLOCKED` on what the contract lacks.

1. **`dataset-synthesizer`** first — per dataset: the folder, the mount points and their subfolders, the
   cases (ids and kinds), the ids served, the manifest template, the adversarial cases, what must never
   appear (real personal data, a key).
2. **`team-test-author`** then — per file: path, ids covered, level, dataset and bindings, the checks that
   prove each id, the task and reply script of a component scenario, the judge and its rubric, the
   `sequence` and `indicators` fields, the decision checks and the name each `task` takes, the modules a
   unit test imports; the templates and the rule; the
   command whose exit code the report carries (`orkeon-bench check team <slug> --tests`).

Read every report. `## DONE`: check the files exist and the ids match the matrix. `## BLOCKED`: settle
it — a forgotten path goes back to the same agent in one short message; a hole in the plan goes to the
user. Do not relaunch an agent with the same instruction; do not write the test yourself.

### 4. Check

1. `orkeon-bench check team <slug> --tests`: no error (exit 0) — every test cites a declared id, every
   active criterion and every invariant has a test at its level, the scenarios parse. Fix through the
   agent that wrote the file; a warning is fixed or kept with its reason.
2. `references/process/checklists/tests.md` box by box, on evidence: a check that would be green
   before the team exists proves nothing; no threshold restated in a scenario; no model or key in a test;
   a judge only where no deterministic check does; `decision-answered` only in an `e2e/` scenario
   (the scenario does not parse at L2).
3. Before the first build there is nothing to run: `orkeon-bench run <slug> --level L0` stops with
   exit 2 (`nothing to run: … does not exist yet`, D35; and no attempt is open before `/team-build`) —
   expected, said once; the red proof of this step is `check team --tests` above. An adopted prototype
   with a crew: run `--level L2` when an attempt is open, else note the scenarios that would already
   pass.

### 5. Record the gate and hand over

`STATUS.md`: `gate_passed: tests`, `phase: build`, `next_action: /team-build <slug>`, `updated_at`, the
journal line of the Contract. Show the user: the datasets, the scenarios per level and the ids they
cover, the rubrics, the unit tests, the `check team --tests` summary, the warnings that stand. Then
stop, unless `/team-loop` is driving: then return to it.

### 6. Revising after a decision

Change the tests the decision changes and nothing else: a dropped criterion loses its scenario, a new
one gains its own, a changed threshold changes no test (tests cite ids, never numbers). Same contracts,
same agents, § 4 again, the `> To revise` line removed, the gate recorded again.

Talk in the user's language, write the prose in English or the workshop's language; file names, ids,
`covers`, scenario and manifest keys stay as the templates have them.

## Done when

`check team --tests` is green, `gate_passed: tests`, `phase: build`. This step writes nothing in
`teams/<slug>/`, edits no section of `TEAM.md`, writes no test itself, and does not start the build.
