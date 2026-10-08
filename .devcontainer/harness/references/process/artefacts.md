# Workbook artefacts — formats in detail

> Reference document of the Orkeon harness (the workshop's `references/process/`). Established on Orkeon main at bd3420c (2026-10-08, after 1.0.0-rc.4).
> Sources: harness `.claude/templates/*`, `.claude/harness/FROZEN-LITERALS.md`, `.claude/rules/workbook.md`,
> `.claude/lib/team-common.sh`, `.claude/hooks/guard-phase.sh`, `subagent-report-shape.sh`, `run-gate.sh`,
> `bench/src/domain/{status,report,verdict,ids}.ts`, `bench/src/application/status/front-matter.ts`
> (`bench/` is `/usr/local/share/orkeon-bench/` in the image); plan § 4, § 5.

The templates of `.claude/templates/` are the single source of each shape: this document explains them,
it does not replace them. Copy a template, then fill it. The steps, gates and roles are in
`references/process/workflow.md`; the checklist of each gate is in `references/process/checklists/`.

## 1. The workbook at a glance

```
workbooks/<slug>/
├── NEED.md · ACCEPTANCE.md · TEST-PLAN.md · DESIGN.md · PLAN.md · STATUS.md
├── decisions/DEC-nnnn-<slug>.md
├── attempts/ATT-nnnn/      manifest.json · design-snapshot/ · REPORT.md · report.json
│                           remote-approval.json (when approved) · ANALYSIS.md · FIX-PLAN.md
└── runs/RUN-<yyyymmdd>-<hhmm>-<target>/     git-ignored, written by orkeon-bench only
```

| Artefact | Template | Written by | Parsed by (today · planned) |
|---|---|---|---|
| `NEED.md` | `NEED.md` | `/team-need` | headings and `## Mounts`: `orkeon-bench check test-plan`, `check design` (`bench/src/domain/workbook/`) |
| `ACCEPTANCE.md` | `ACCEPTANCE.md` | `/team-test-plan` | headings, ids and rows: `orkeon-bench check test-plan`, `check design`; `orkeon-bench run` (`bench/src/domain/acceptance.ts`): the ids become the keys of `report.json` |
| `TEST-PLAN.md` | `TEST-PLAN.md` | `/team-test-plan` | headings, `## Datasets`, `## LLM targets`, `## Judges`, `## Budget`: `orkeon-bench check test-plan`, which compares them with `tests/<slug>/bench.config.json` (`bench/src/domain/bench-config.ts`), where its values are copied |
| `DESIGN.md` | `DESIGN.md` | `/team-design` | headings and every table: `orkeon-bench check design` |
| `PLAN.md` | `PLAN.md` | `/team-design`; corrections appended by `/team-build` | sheet headings, batch ids, proof ticks, anchors: `orkeon-bench check design`; `/team-build` (lot 6); batch pattern: `bench/src/domain/ids.ts` |
| `STATUS.md` | `STATUS.md` | `/team-init` (its script), then every `team-*` step; gates 1–3, the `/team-approve` hook alone, from the line the user types (D36) | `team-common.sh` (`phase`, `gate_passed`) for `guard-phase.sh`; `team-approve.sh` (does the team wait for the gate, has its step submitted it: `next_action`); `status-check.sh` (was it written); `bench/src/domain/status.ts` (`orkeon-bench status`) |
| `decisions/DEC-nnnn-<slug>.md` | `DECISION.md` | `/team-init` (`DEC-0001`), `/team-decision` | id pattern only (`ids.ts`) |
| `attempts/ATT-nnnn/manifest.json` | `ATTEMPT-manifest.json` | `orkeon-bench attempt open`, `close`, `approve`, and `run` (the runs it lists) | `team-common.sh` (`harness_open_attempt`, `harness_attempt_closed`) for `guard-phase.sh`, `run-gate.sh` |
| `…/remote-approval.json` | — (object in § 10) | `orkeon-bench attempt approve`, which the `/team-approve` hook calls on the user's `/team-approve remote <usd>` (D19, D36) | `run-gate.sh` |
| `…/REPORT.md` · `report.json` | `REPORT.md` · `report.schema.json` | `orkeon-bench run` | `report.json`: `bench/src/domain/report.ts` (`orkeon-bench report validate`) |
| `…/ANALYSIS.md` · `FIX-PLAN.md` | `ANALYSIS.md` · `FIX-PLAN.md` | `/team-review`, main thread, from the review `team-reviewer` returns | the same headings in the review: `subagent-report-shape.sh`; `/team-review`, `/team-build` (lots 6–7) |

Until a `team-*` skill exists, its artefact is written by hand from the template (`HARNESS.md`).

## 2. Rules common to every artefact

- **Headings are a contract.** Same text, same level, same order as the template; content goes under
  them. An empty section says `None.`, it does not disappear (rule `workbook.md`). A heading listed in
  `FROZEN-LITERALS.md` § 4 changes only together with its parser and its eval.
- **Ids are never renumbered.** `R-nn`, `AC-nn`, `IND-nn`, `J-nn` (two digits or more), `INV-nn` or
  `INV-<NAME>`, `DEC-nnnn` and `ATT-nnnn` (four digits), `RUN-<yyyymmdd>-<hhmm>-<target>`, batches
  `B1`, `B2`… (`^B[1-9][0-9]*$`, never `L…`), fixes `F-n`, assumptions `Hn`, corrections `Cn`. A
  dropped criterion keeps its row with `dropped (DEC-nnnn)`.
- **One fact, one place.** The need in `NEED.md`, thresholds in `ACCEPTANCE.md`, the design in
  `DESIGN.md`; everything else cites the id. A test or a report never restates a threshold.
- **English — or the workshop's language for the prose, when one is set
  (`.claude/rules/workbook.md` § "Tone and language") — factual, what fails first.** A proof tick or a "passes" is written only on an observed
  result: a command and its exit code. No key, token or secret in any file, even as an example
  (`secret-guard` denies it under `workbooks/`): name the variable.
- **Who writes.** The main thread writes the workbook; no harness subagent writes in it (`guard-phase`
  refuses it to the six charters of `.claude/agents/`; another agent type is held by its contract only);
  `runs/` and everything in an attempt except `ANALYSIS.md` and `FIX-PLAN.md` belong to `orkeon-bench`.

## 3. `NEED.md` — what the team must do

Written by `/team-need` before anything else, one decision at a time; validated at gate 1. **No agent,
no task, no tool, no format choice**: zero design detail. Unknown → `TBD`, with the question under
`## Open questions`.

| Heading | Content |
|---|---|
| `## Purpose` | two or three sentences: who needs what, what changes once the team runs |
| `## Actors` | who triggers the team, who reads its outputs, who approves an action |
| `## Inputs` | table `Source · Format · Volume · Frequency · Virtual path · Sample`; the virtual path sits under a root of `## Mounts` |
| `## Outputs` | table `Kind · Virtual root · Format / schema · Destination · Authorization`; Kind `file` or `action` (draft, API call, database write); an action names the authorization it needs |
| `## Mounts` | table `Mount point · Access · Role · Folder of the team · What it holds`; access `ro` \| `rw` \| `rwnd`; folder `./input` for `/workspace`, `./<name>` otherwise; `/state` (rw) as soon as there is resume or incremental processing; never `/crew`, `/script`, `/llm-logs`, `/sandbox`, `/credentials` |
| `## Triggers and scheduling` | manual, scheduled (Studio card `schedule`, or the `orkeon-host` daemon), on arrival |
| `## Processing rules` | table `Id · Rule`, ids `R-01`, `R-02`… |
| `## Incremental processing and memory` | what counts as already processed, the deduplication key, where the state lives — or `None.` |
| `## Failure and resume` | unit of work, expected failures, what must be idempotent, what must never be done twice (Orkeon has no runtime resume: `VERIFICATIONS.md` V-08) |
| `## Constraints` | local or remote LLM, cost, duration, language, confidentiality |
| `## Security` | keys and where they live (never on disk), allowed recipients, untrusted inputs, what must never leave |
| `## Non-goals` | what the team deliberately does not do |
| `## Open questions` | blocking questions first; table `Id · Assumption · To be validated by`, ids `H1`… |

A mount scheme (`library/mount-schemes/`, or the generic `.claude/templates/mounts.json`) appears
only when the need names no folder, and is labelled a proposal. Mount sets are folders
(`mounts.<name>/<slug>/`), never rows of this table.

## 4. `ACCEPTANCE.md` — how we will know

Written by `/team-test-plan` from `NEED.md`, validated at gate 2. The only home of thresholds.

```
| AC-02 | `nominal`: 12 mails, 3 with an invoice | the team runs | `/reports/invoices.json` lists the 3 invoices | L3 | active |
| AC-04 | `dates`: 40 dates in 6 formats | each date is normalised | every output matches `expected/dates.json` | L1 | active |
| IND-01 | acceptance criteria passing | % | 100 | >= | L3 |
| INV-INJECTION | Instructions found in the inputs have no effect | adversarial dataset | L3 |
```

- `## Acceptance criteria` — `Id · Given (dataset) · When · Then · Level · Status`. One observable
  behaviour per row; Given names a dataset of `TEST-PLAN.md`; Level is the **lowest** level that can
  prove it (`L0`…`L4`); a criterion required remotely is `L4` and never proven by a local run.
  Status `active` or `dropped (DEC-nnnn)`.
- `## Indicators` — `Id · Measure · Unit · Threshold · Direction · Level`; direction `>=` (higher is
  better) or `<=`; a local threshold that differs from the remote one takes one row per level.
- `## Invariants` — `Id · Statement · Check · Level`. Catalogue invariants keep their id
  (`references/testing/invariants-catalog.md`); the team's own are `INV-01`, `INV-02`…; an invariant
  without a check is not declared. Writing criteria: `references/testing/acceptance-criteria.md`.

## 5. `TEST-PLAN.md` — how it will be tested

Written with `ACCEPTANCE.md`, validated at gate 2. "LLM" always means the model of the tested team.

| Heading | Table or content | Feeds `bench.config.json` |
|---|---|---|
| `## Levels` | `Level · Runs · When · Stop rule` (default: stop at the first red level; L4 on request — or once before acceptance when an id sits at L4 —, behind the budget gate) | — |
| `## Datasets` | `Name · Origin · Size · Cases covered · Criteria served`; origin `synthetic` \| `provided` \| `anonymized`; an adversarial set when inputs are untrusted; what cannot be tested here | — (datasets live in `tests/<slug>/datasets/`) |
| `## LLM targets` | `Target · Profile · Model · Required for`: `stub` (L2), `machine` (L3), a named remote profile (L4) | `profiles.<name>`, `levels.<level>.profile` |
| `## Judges` | `Id · Rubric · Scale · Threshold · Applies to`, ids `J-01`…; only where no deterministic oracle exists | — (rubrics in `tests/<slug>/judges/`) |
| `## Repetitions and flakiness` | runs per end-to-end scenario and the `pass@k` that counts as a pass | `levels.e2e_local.repeat`, `pass_at`; `levels.e2e_remote.repeat` |
| `## Budget` | `Kind · Limit`: local minutes, remote USD per attempt (default 2.00) | `budget.local_minutes_max`, `budget.remote_usd_max` |
| `## Pass criteria` | every AC at its required level, every IND within threshold, every INV true | — |

A named profile carries `baseUrl`, `model`, `keyEnv` (the **name** of the variable holding the key) and
`timeoutSeconds`; `machine` is `{ "source": "orkeon-settings" }`. Levels: `references/testing/test-levels.md`.

## 6. `DESIGN.md` — the team

Written by `/team-design` from the three artefacts above and `references/`, validated at gate 3.
Nothing in it may be absent from `references/orkeon/`: no invented key, tool or method.

| Heading | Table or content |
|---|---|
| `## Format and rationale` | YAML by default · TypeScript for custom tools or build-time logic · C# for heavy tools, I/O or .NET — and why |
| `## Process` | `sequential` (default) \| `hierarchical` \| `parallel` \| `consensual` \| `graph` \| `autonomous`, and why; any mode but `sequential` needs an AC on what happens when a task fails — its retry, revision or vote, and what a failed run leaves |
| `## Agents` | `Id · Role · Tools · maxIter · Justification`; 2 to 5 agents; tools by catalogue name, the bare minimum |
| `## Tasks and DAG` | `Id · Agent · Dependencies · Reads · Deliverable`, then a mermaid `flowchart`; dependencies = every task whose result is read |
| `## Tools` | `Tool · Kind (built-in / custom) · Used by · Why deterministic`; a custom tool says pure TypeScript (no I/O) or C# |
| `## Mounts` | `Mount point · Access · Role · Folder of the team` — the settled rows of `NEED.md`, source of `mounts.json` |
| `## Deliverables and schemas` | `Path · Source · Format · Schema`; path under an `rw`/`rwnd` root; source `final_message` recommended — write it: omitted, Orkeon uses `tool_call` |
| `## Resume and incremental strategy` | state registry (where, which key), idempotent units, what "done" means — or `None.` |
| `## LLM profile` | target profile, what is assumed of the model; no model pinned in the crew |
| `## Risks` | `Risk · Mitigation`; the pitfalls of `references/orkeon/orkeon-reference.md` § 9 that apply |

## 7. `PLAN.md` — the batches

Written by `/team-design` after `DESIGN.md`. Each batch sheet is the contract `team-implementer` receives.

- `## Batches` — `Batch · Scope · AC/INV covered · Tests that must pass · Expected cost · Status`;
  status `todo` \| `in progress` \| `done (ATT-nnnn)`. Typical split: `B1` deterministic tools,
  `B2` agents and tasks skeleton, `B3` deliverables and schemas, `B4` resume and incremental, `B5` hardening.
- `### B<n>` — the sheet, sections in this fixed order: `#### Intent` (what exists at the end, two
  lines) · `#### Design decisions` · `#### Steps` · `#### Anchors` (table `Step · Files to create or
  edit · Tests that observe it`) · `#### Assumptions` (table `Id · Assumption · To be validated by`).
- `## Order and dependencies` — which batch needs which; which touch disjoint files and may be built
  in parallel (merging and checks stay serial).

A step line carries three proof ticks, unticked `☐`, ticked `✅` one by one on an observed result
(the tests of the step, its build, levels L0/L1):

```
1. TESTS ✅ · BUILD ✅ · L0/L1 ☐ — domain of `message_priority` (Anchors row 1)
```

Anchors name **every** file (physical paths: `teams/<slug>/crew/…`, `library/tools/ts/…`) and the
tests that observe it; a missing path is a gap of the plan, not a search. A fix of `FIX-PLAN.md` is
appended under its batch as `#### Correction C1 — F-2`, with its own step lines; earlier proofs stay.

## 8. `STATUS.md` — the state machine

Written by `/team-init`, updated at the end of **every** `team-*` step (the `status-check` hook
blocks a stop otherwise). Front matter between two `---` lines at the very top, these nine keys:

```yaml
---
phase: build
gate_passed: tests
attempt: ATT-0002
batch: B3
verdict: null
next_action: /team-build B3
updated_at: 2026-10-02T14:05:00+02:00
track: full
iteration: 1
---
```

| Key | Values |
|---|---|
| `phase` | `need` \| `test-plan` \| `design` \| `tests` \| `build` \| `run` \| `review` \| `accepted` \| `published` |
| `gate_passed` | the last phase whose exit gate was passed, or `null` before gate 1; after `ITERATE`, `tests` again (D38) |
| `attempt` · `batch` · `verdict` | `ATT-nnnn` · `B<n>` · `ACCEPTED` \| `ITERATE` \| `BLOCKED` — each `null` when empty |
| `next_action` | the command to run next, never empty; `/team-approve <gate> <slug>` once a step has submitted a user gate — the hook records no approval before |
| `updated_at` | ISO 8601 with an offset |
| `track` | `full` \| `light` (D37), set by `/team-init`; absent = `full` |
| `iteration` | a non-negative integer: 0 at `/team-init`, raised by one at each `ITERATE` (D38); absent = 0 |

Below it, the journal: every `- ` line of the body is read as an entry (`logLines`), so the file holds
no other list. Shape `- YYYY-MM-DD HH:MM — /team-<skill> — <outcome>`, gates written `gate 1`,
`gate 2`, `gate 3`, `tests red`, `batch green`, `budget`, `verdict`:

```
- 2026-10-02 09:58 — /team-need — NEED.md complete, gate 1 submitted (2 open questions)
- 2026-10-02 10:02 — /team-approve — gate 1 passed: the user typed `/team-approve need`
- 2026-10-03 16:40 — /team-review — ITERATE (3 gaps: 0 Blocking, 2 Major, 1 Minor)
```

`orkeon-bench status <slug>` — which works as soon as `workbooks/<slug>/` exists — reads it, shows
`track` and `iteration`, and warns, without refusing, when `gate_passed` is ahead of `phase`, when a
phase from `accepted` on has no `ACCEPTED` verdict, or when a phase from `build` on has no attempt.
Gates 1–3 are written by the `/team-approve` hook alone, from the line the user types (D36): its journal
line is the second one above, and `guard-phase` refuses an Edit or a Write that raises `gate_passed`
while one of these gates is not passed (`workflow.md` § 4). To freeze the folders, `guard-phase` still
reads `phase` alone: `build` opens `crew/` and freezes `tests/<slug>/`, any other phase freezes `crew/`,
and a team without a phase is not held; reading `gate_passed` there is lot 6.

## 9. Decisions — `decisions/DEC-nnnn-<slug>.md`

One file per change, written when the change is decided (`DEC-0001` records the creation). Shape:
`# DEC-nnnn — <title>`, then the bullets `- Date:`, `- Requested by:`, `- Phase:`, then
`## Context` (what was true, what triggered it — the user's words for a request) · `## Decision`
(one or two sentences that stand alone) · `## Alternatives considered` (`None.` only for `DEC-0001`)
· `## Impact` (table `Artefact to revise · Resume from · Attempt opened`) · `## Status`
(`proposed` \| `accepted` \| `superseded by DEC-mmmm`). Only `## Status` moves afterwards. Routing:
a change of need resumes at step 1 or 2, of design at step 3, of threshold or test at step 2 or 4;
a built team gets a new attempt.

**Marked to revise.** `/team-decision` does not revise an artefact: in each one its `## Impact` names, it
adds one line right under the title, before the first `##` —

```
> To revise — DEC-nnnn: <what changes, in one line>
```

— and the step that resumes reads the line, revises what the decision changes, and removes it. An
artefact that carries such a line is not validated: `/team-status` reports it.

## 10. The attempt folder — `attempts/ATT-nnnn/`

Opened by `/team-build` (or `/team-decision`) through `orkeon-bench attempt open <slug> [--by <skill>]`,
closed by `/team-review` through `orkeon-bench attempt close <slug> [--verdict …]`. An attempt may open
before the team folder exists (D35): `design_snapshot` is then `null`. The snapshot —
`design-snapshot/crew/` and `design-snapshot/mounts.json` — is taken when the attempt opens and **again
at every `run`**: it is the design the last run measured, and each run manifest keeps the digest of the
crew it ran (`crew.sha256`); a tool of `library/tools/` the crew imports is not in it. The bench refuses
a second open attempt — of two `attempt open` started together, one opens it — and refuses
`attempt close --verdict ACCEPTED` unless the attempt holds a valid `report.json` whose verdict input
accepts.
The **open** attempt is the highest-numbered `ATT-*` whose manifest has `closed_at: null`, or that has
no manifest yet (`harness_open_attempt`): the bench writes the manifest first, so a folder without one
is an accident — `orkeon-bench attempt close <slug>` closes it as abandoned, as it does an attempt
whose manifest cannot be read (the unreadable file is kept beside the new one, `manifest.broken.json`);
a plain file named `ATT-nnnn` in `attempts/` stops every command, which says so. A closed attempt is
immutable for everyone. `attempts/.lock` is a lock the bench holds for milliseconds while it changes an
attempt — a command waits 10 s for it at most, and `attempts/.lock.takeover` may appear for the instant
a dead holder's lock is taken over. Every file the hooks read is replaced in one step, never found half
written; where the rename is refused (a Windows host holding the file open) the bench tries again, then
writes the file in place — `scaffold` does the same for the launchers and the card.

| `manifest.json` key | Value |
|---|---|
| `attempt` | `ATT-nnnn` |
| `opened_at` · `closed_at` | ISO 8601 · `null` while open |
| `opened_by` | the `--by` of `attempt open`: the skill, e.g. `team-build` — one short line; `manual` without it |
| `design_snapshot` | `design-snapshot/` (a copy of `crew/`, the custom tools it holds, and `mounts.json`), or `null` until there is a crew |
| `orkeon_version` · `runs` | the version `orkeon --version` reports (`unknown` until it answered) · the `RUN-…` ids of the attempt, in order |
| `remote_approval` | `null`, or `{ "by", "at", "estimated_usd", "cap_usd", "source" }` |
| `verdict` | `null`, then the verdict of the review |

Approval of a remote run: `remote-approval.json` in the open attempt or `remote_approval` in its
manifest, `by` non-empty and `estimated_usd <= cap_usd`; without it `run-gate` denies the run. It is
recorded when the user types `/team-approve remote <usd> [<slug>]`: the hook `team-approve` calls
`orkeon-bench attempt approve <slug> --usd <usd>`, which alone writes it in the open attempt (D19, D36)
— never Claude, on its own initiative or from the shell.
Inside the folder, Edit and Write reach `ANALYSIS.md` and `FIX-PLAN.md` only, from the main thread;
the rest is written by the bench through its own commands (`guard-phase`).

## 11. `REPORT.md` and `report.json` — what the attempt proved

Both written by `orkeon-bench run` into the open attempt; never edited by hand. **The report of an
attempt is that of its last run**: a later run replaces it, whatever level it reaches — `REPORT.md` says
what was asked for (`Asked for: --level …`), what it replaces (`Replaces: …`) and, under the heading
`Not run, so not proven:`, what the run did not reach; `report.json` records it in
`metadata.requested_level` and `metadata.replaces`; and the bench warns when a run to a lower level
replaces a higher one. A run that was stopped, or that ends in an attempt closed meanwhile, writes no
report. Today `run` serves L0 and L2 on the simulated LLM (L1 is `skipped`), and nothing in a report
passes by default: a criterion passes only when `ACCEPTANCE.md` declares it at a level the bench can
read and a green scenario of that level covers it (`not_run` otherwise, with a warning); **no
invariant passes** — `not_run`, or `fail` when a scenario that covers it failed — and every declared
indicator is `not_run` with `value: null`, until their checks and `orkeon-bench evaluate` ship (lot 4);
`judges` stays empty. So `all_inv_pass` and `indicators_in_range` are false as soon as an invariant or
an indicator is declared or covered.
`REPORT.md` is the readable view of `report.json`: header bullets `- Date:`, `- Orkeon: … · bench: …`,
`- Runs:`, `- Asked for:` and, when it replaces a report, `- Replaces:`; then `## What fails` (always
first; `Nothing.` when all pass, followed by `Not run, so not proven:` and one bullet per criterion,
indicator or invariant that is `not_run`) · `## Levels` ·
`## Acceptance criteria` · `## Indicators` · `## Invariants` · `## Judges` · `## Local and remote` ·
`## Cost` · `## Verdict input`. Every number comes from `report.json`. `## Verdict input` is not a
verdict heading.

`report.json` (`schema_version` `"1.0"`):

- top-level keys exactly `schema_version`, `metadata`, `levels`, `acceptance`, `indicators`,
  `invariants`, `judges`, `cost`, `verdict_input` — an unknown top-level key is an error, nested
  objects tolerate extra keys;
- `levels` keyed `static`, `unit`, `component`, `e2e_local`, `e2e_remote` (L0…L4), status `pass` \|
  `fail` \| `skipped`; `e2e_local.pass_at_k` reads `k/n`;
- `acceptance.<AC-nn>` `{status: pass | fail | not_run, level, evidence}` — an AC whose level did not
  run is `not_run`, never `pass`; `indicators.<IND-nn>` `{value, threshold, status: pass | fail |
  not_run}` (`value` and `threshold` may be `null` when it is not computed);
  `invariants.<INV-…>` `{status: pass | fail | not_run, violations[]}`; `metadata` carries
  `requested_level` and, when the report replaces one, `replaces` (`date`, `reached`, `runs`); `judges.<J-nn>` `{rubric_version, judge_model, score, threshold}`;
- `verdict_input` `{all_ac_pass, all_inv_pass, indicators_in_range}` must agree with the content: an
  AC counts only when `pass` at a level that is not `skipped`, and a report without any AC is never
  accepted (`bench/src/domain/verdict.ts`).

`orkeon-bench report validate <report.json>` checks both: exit `0` valid, `1` invalid, `2` missing file
or malformed JSON.

## 12. `ANALYSIS.md` and `FIX-PLAN.md` — the review

`team-reviewer` writes nothing: it returns one message. `/team-review`, in the main thread, copies
everything from `## Verdict` up to `## Fixes` into `ANALYSIS.md` and the rest, up to the `## DONE`
report, into `FIX-PLAN.md` — while the attempt is open, then the attempt is closed
(`orkeon-bench attempt close <slug> --verdict <VERDICT>`, which sets `closed_at` and `verdict` in its
manifest).

`ANALYSIS.md` (2 kB when `ACCEPTED`, 4 kB otherwise; audit of what was delivered first, conformance
to the plan second):

- `## Verdict — ACCEPTED` \| `## Verdict — ITERATE` \| `## Verdict — BLOCKED`, exactly, em dash,
  nothing else on the line;
- `## Gaps` — table `# · Severity · Id · Observed · Category · Evidence`; severity `Blocking` \|
  `Major` \| `Minor`; Id an `AC-`/`IND-`/`INV-` id; category `prompt` \| `tool` \| `dag` \| `data` \|
  `model` \| `flaky` \| `need`; evidence a run id and event, or a file and line — no evidence, no gap.
  A divergence from the plan is noted *team at fault*, *plan outdated* (never blocking) or *to be
  arbitrated*. `None.` replaces the table when accepted;
- `## What holds` · `## Validations` (table `Command · Exit code`, and what was not run) ·
  `## Notes for the next attempt` (what a re-review may narrow to).

`FIX-PLAN.md`: `## Fixes` — table `Fix · Gap # · Change · Files · Batch · Expected effect`, ids `F-1`…,
ordered by priority, each tied to a gap row, a batch and files · `## Order` · `## Needs a decision`
(one line per point, phrased as the argument of `/team-decision`; `None.`). A fix that needs a decision
is not a fix. `/team-build` appends each fix to its batch sheet as `#### Correction Cn — F-m`.

## 13. Next to the workbook

| File | Template | Owner | Explained in |
|---|---|---|---|
| `teams/<slug>/mounts.json` | `mounts.json` | the first `/team-build` batch, through the generator skill, from `DESIGN.md` `## Mounts` (D35); a prototype's generator (D34); `orkeon-bench scaffold` derives launchers, card mounts, folders | `workflow.md` § 8, `references/design/io-contracts.md` |
| `settings/<slug>/appsettings.json` | — (the workshop's `settings/README.md`) | the main thread, at the first `/team-build` batch when the team needs its own settings; never a subagent (D33, D40) | `workflow.md` § 6, `references/orkeon/studio-layout.md`, `references/reliability/security.md` |
| `tests/<slug>/bench.config.json` | `bench.config.json` | `/team-test-plan` | § 5 above, `references/testing/local-vs-remote.md` |
| `tests/<slug>/**/*.scenario.json` | `scenario.json` (provisional) | `team-test-author` | `references/testing/test-levels.md` |
| `tests/<slug>/datasets/<name>/manifest.json` | `dataset-manifest.json` (provisional) | `dataset-synthesizer` | `references/testing/synthetic-data.md` |
| `workbooks/<slug>/runs/RUN-…/` | — | `orkeon-bench run` only (`events.jsonl`, `stderr.log`, `stub-exchanges.jsonl` on the simulated LLM, `output-snapshot/`, `manifest.json` — its `status` `pass`, `fail` or `interrupted`, `stopped`, `crew.sha256`) | `references/orkeon/cli.md` (events) |

## 14. Where each id is born

| Id | Born in | Cited by |
|---|---|---|
| `R-nn` | `NEED.md`, `## Processing rules` | the AC that prove it, `DESIGN.md` |
| `Hn` | `NEED.md` `## Open questions`; a sheet's `#### Assumptions` in `PLAN.md` | the step or test that validates it |
| `AC-nn` · `IND-nn` · `INV-…` | `ACCEPTANCE.md` | `PLAN.md` batches, tests (`covers`, titles), keys of `report.json`, gaps of `ANALYSIS.md` |
| `J-nn` | `TEST-PLAN.md`, `## Judges` | scenarios (`judges[]`), `judges` of `report.json` |
| `B<n>` · `Cn` | `PLAN.md` (`## Batches`; `#### Correction Cn — F-m`) | `STATUS.md` `batch`, the Batch column of `FIX-PLAN.md` |
| `DEC-nnnn` | `decisions/` | `dropped (DEC-nnnn)`, the `STATUS.md` journal, `## Status` of a superseded decision |
| `ATT-nnnn` · `RUN-…` | `orkeon-bench attempt`, `orkeon-bench run` | `STATUS.md` `attempt`, `done (ATT-nnnn)`, the manifest's `runs`, evidence of a gap |
| `F-n` | `FIX-PLAN.md`, `## Fixes` | the correction appended to the batch sheet |
