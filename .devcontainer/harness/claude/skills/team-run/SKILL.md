---
name: team-run
description: "Step 4 of the method: runs the test levels of a built Orkeon team on its open attempt — orkeon-bench run up to the highest level bench.config.json declares (L2 stub, L3 local model with repeat/pass_at, L4 remote — and any remote L3 run or paid decide — behind orkeon-bench estimate and the user's /team-approve remote), grades the judges with the judge agent and hands the judgements to orkeon-bench evaluate, captures the attempt (orkeon-bench capture) and hands over to /team-review."
argument-hint: "[--level L2|L3|L4] [<slug>]"
disable-model-invocation: true
---

# /team-run — run the levels, grade the judges, capture

Step 4 of the method (`references/process/workflow.md`). The bench runs and archives; you drive it,
grade what only a model can grade, and leave the attempt readable by the reviewer.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`phase: run`, `gate_passed: build`), `tests/<slug>/bench.config.json` (`levels`,
  `budget`, `decision`), the open attempt, `TEAM.md § Acceptance` (`### Judges`, `### Budget`).
- Bench: `orkeon-bench run <slug> [--level L<n>] [--no-decision]`, `orkeon-bench profile <slug>
  <name> --level <level>`, `orkeon-bench estimate <slug> --level L<n> [--decide <calls>]`, `orkeon-bench evaluate <slug> --judgements
  <file>`, `orkeon-bench capture <slug>`; `orkeon-bench decide score`, optional (D98).
- Writes: the judgements file under the attempt (`attempts/ATT-nnnn/judgements.json`, through
  `evaluate`); `STATUS.md`. Nothing in `teams/<slug>/` or `tests/<slug>/`.
- Journal: `— /team-run — report ATT-nnnn (first red level: <level>|none)`; `— /team-run — budget
  approved (<usd> USD, cap <usd> USD)` when a remote run was approved; `— /team-run — remote approval
  needed (<usd> USD estimated, cap <usd> USD)`.
- Exit state: `phase: review`, `next_action: /team-review <slug>` — or `next_action: /team-approve
  remote <usd> <slug>` while a remote run waits.

## Steps

### 1. Find the team and the level

1. The slug: the argument; else the only team with `phase: run`; else ask.
2. `orkeon-bench status <slug>`: `phase: run`, an open attempt. Else stop and say why.
3. The level: `--level` given, else the highest of `levels` in `bench.config.json` (`e2e_remote` → L4,
   `e2e_local` → L3, else L2). Levels are cumulative: the bench stops at the first red level.
4. Journal `- … — /team-run — started (ATT-nnnn, level L<n>)`.
5. The decision block (D96), when `bench.config.json` has one: `decision` at the top or under a level
   (`null` turns it off there), `{provider, base_url?, model?, key_env?, price_per_call?}`; `key_env` is
   the **name** of the variable holding the key, exported in the shell. The bench lays it over the
   environment of the L3 and L4 runs only — a stub run never gets it — and writes it nowhere.
   `orkeon-bench profile <slug> <profile> --level e2e_local` (or `e2e_remote`) shows what a run of that
   level receives: `decision_block`, `decision_variables`, and whether the decision model makes the run
   remote (a hosted provider makes an L3 run remote: `run-gate` then asks for the approval, as at L4).

### 2. The budget gate, before any remote run

Before a run at L3 or L4 — and at L2, only when step 4 will ask a remote decision model:

1. An L4 scenario is priced from the completed local runs of the L3 scenario of the same id (the
   latest attempt that has some): run `orkeon-bench run <slug> --level L3` first when the attempt has
   none. `estimate` refuses (exit 2) an L4 scenario without such a run, naming it, and a
   `bench.config.json` that states no `budget.remote_usd_max`.
2. `orkeon-bench estimate <slug> --level L<n> [--decide <calls>] --json`: `remote`, `usd`, `cap_usd`,
   `within_cap`. `--decide <calls>` only when step 4 will ask `decide --allow-remote`: `<calls>` is the
   judgements it grades (each scenario's `judges` × the level's `repeat`, over the levels run), priced at
   `price_per_call` of the top-level decision block. `usd` includes the decision calls — the mean per
   run of the L3 runs (at L3 without such a run, of the latest L2 runs) × `price_per_call` of the
   level's decision block. `remote: false` (an L3 run whose LLM and decision model are local, no
   `--decide`): no approval, go to step 3. `estimate` refuses (exit 2) a remote decision model with no
   `price_per_call` — a provider active in the machine's settings that no decision block declares
   among them — and an L3 run on a remote LLM with no `price`: relay it, the fix goes through
   `/team-decision` (declare it, or unset what configures it). Above the cap: stop, say what to change
   (fewer scenarios, `repeat`, the cap through `/team-decision`).
3. When the open attempt's `remote-approval.json` already approves `estimated_usd` ≥ `usd` (a number,
   at most `cap_usd`), go to step 3. Else — none, one `run-gate` called invalid or over the cap, or
   less than this estimate — `STATUS.md`: `next_action: /team-approve remote <usd> <slug>`, journal
   `- … — /team-run — remote approval needed (<usd> USD estimated, cap <cap> USD)`. Tell the user the
   estimate, what it buys (the criteria and indicators of that level) and that they approve by typing
   that line — the hook records it with `orkeon-bench attempt approve` and refuses a line no estimate
   submitted, or an amount under it (D104); you do not write `remote-approval.json`. Then stop;
   `/team-run` again once approved, which journals `- … — /team-run — budget approved (<usd> USD, cap
   <cap> USD)`.

Every remote refusal of `run-gate` (a run, `decide --allow-remote`) sends here: the line this step
submits is the only one the hook accepts. The key of the remote profile lives in the environment
variable `keyEnv` names; `run-gate` refuses a remote run without the approval or with a key on disk.

### 3. Run

```bash
orkeon-bench run <slug> --level L<n>
```

Read its output and the attempt's `report.json`: per level pass/fail/skipped, `e2e_local.pass_at_k` (the rule) and `pass_counts` (each scenario's passing runs),
`e2e_remote.usd`, the invariants (`pass`/`fail`/`not_run`), the indicators, the uncovered ids. With
decision tasks, `REPORT.md` adds a table under `## Cost` (decision tasks, answered from the fallback,
lowest confidence: `cost.decision_tasks`, `decision_defaulted`, `decision_confidence_min`), and the
indicators measured `decision_defaulted_rate` (a share from 0 to 1:
`0.25` is one decision in four answered from its fallback) and `decision_confidence_min`; both are
`not_run` when no run completed a decision task. When a decision model was active in some run, those
runs alone are judged. With none active (none configured, a stub run, `--no-decision`), the defaulted
rate is still measured from the events — the fallback's, which the note says, naming a declared model
no run measured —; only what has nothing to measure (no decision task, or no confidence in the
fallback's answers) is `not_applicable` if `TEAM.md` declares no decision model, `not_run` if it does.

`--no-decision` passes `--no-decision` to every `orkeon run`, which then asks the decision model
nothing (Orkeon 1.4.0): the decision tasks answer from their fallback (an `optional` crew's from its
`without:` relay), `system_one_decide` is withheld — a crew that lists it fails to load (exit 2) —, a fail-closed LLM judge refuses to start, and a crew on
`decision.mode: required` is refused before its first task (exit 69). The gate still counts a
configured decision model (`references/testing/local-vs-remote.md` § 1). Use it to compare,
e.g. L3 with and without the decision model: `run --level L3 --no-decision`, note its results, then
`run --level L3` — the attempt keeps the report of its **last** run, so end on the run the review must
judge. A level
refused by `run-gate` (a `machine` profile that is remote, no approval) is relayed as it is. A run that
fails for a reason outside the team (Ollama down, model not pulled: `ollama pull $OLLAMA_DEFAULT_MODEL`)
is fixed and run again, once; the attempt keeps both runs.

A C# team (`teams/<slug>/host/`): the same command. The bench builds the host at L0, runs its
`dotnet test` at L1, and runs each scenario through it (`dotnet run` of `host/` with the scenario's
mounts, `--settings`, `--events -`, `--no-decision`): the same events, the same report. A red
`dotnet-build` or `host-validate` is a build defect: back to `/team-build`.

### 4. Grade the judges

For every `judges[]` entry of a scenario that ran at L3/L4, for every archived run of it
(`runs/RUN-…/manifest.json` names the scenario and iteration): call the `judge` agent (model `sonnet`,
`description` explicit) with the rubric file, the output file of the run's output snapshot, the scale,
and ask for the JSON judgement the charter defines.

A second signal, optional (D98): before calling the judge on an output, ask the decision model for a
quick score on the rubric's scale, and do not show it to the judge:

```bash
orkeon-bench decide score --question "<the rubric's criteria, in one paragraph>" \
  --level <lowest> … --level <highest> --context-file <a scratch file: the rubric's criterion and the excerpt of the output it judges> [--allow-remote]
```

`--allow-remote` only when step 2 submitted these calls (`--decide`) and the approval stands; without
it a remote provider answers exit 4.

Pass the excerpt, never a whole output or `TEAM.md`: the bench keeps the first 4 KB on a line boundary
(`--max-context-bytes`; the local Kev answers 500 past about 5 KB), and its JSON says `"truncated": true`
when it cut — then the score is of the start alone: treat it as low confidence.

Exit 0: once the judge has answered, when its `answer` is more than one step of the scale from the
judge's score, append to that judgement's `justification`
` [decision model: <answer> at confidence <c> — disagrees; the judge's score stands]`; else, when
its `confidence` is below 0.5, append
` [decision model: <answer> at confidence <c> — low confidence; the judge's score stands]`; both
are for the reviewer. Exit 4 (no decision model) or any other code: no flag, no retry — exactly what this
step did before. The judge's score is always the grade. Assemble
`{"judgements":[{judge, rubric_version, output, score, justification, quotes}]}` in
`$CLAUDE_JOB_DIR/tmp/<slug>-judgements.json` (or `/tmp` outside a job), then:

```bash
orkeon-bench evaluate <slug> --judgements <file>
```

It merges the file into the attempt's `judgements.json` judge by judge (a judge graded again replaces
its grades; the others the report holds stay), fills `report.judges` and the indicators that name a
judge, and rewrites `report.json` and `REPORT.md`; exit 1 when a judge of the merged set is out of
range. A judge whose threshold is an indicator's id takes its direction too (`<=`: lower is better).
A judge out of range blocks the verdict like a red indicator (D97): `indicators_in_range` turns false.
No judge declared: skip this step.

### 5. Capture and hand over

`orkeon-bench capture <slug>` writes `attempts/ATT-nnnn/capture.md` (status, the crew's diff against the
previous attempt's design snapshot, the report, the errors and failed tasks, the edges of stderr) — what
the reviewer reads instead of the archive.

`STATUS.md`: `phase: review`, `next_action: /team-review <slug>`, `updated_at`, journal `- … — /team-run
— report ATT-nnnn (first red level: <level>|none)`. Tell the user, in a few lines: the levels and their
result, the L3 line (the rule and each scenario's passing runs), the cost when remote, the invariants not passed, the judges' scores, the path of
`REPORT.md` and `capture.md`. Then stop, unless `/team-loop` is driving.

## Done when

`report.json` of the open attempt is written at the requested level, the judges declared are in
`judgements.json`, `capture.md` exists, `phase: review`. This step edits no test, no crew, no
threshold; it never approves a budget, never names a key, never reruns a failed scenario to make it pass.
