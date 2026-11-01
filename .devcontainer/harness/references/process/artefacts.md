# Workbook artefacts — formats in detail

> Reference document of the Orkeon harness (the workshop's `references/process/`). Established on Orkeon main at c727c06 (2026-11-01, 1.0.0-rc.6).
> Sources: harness `.claude/templates/*`, `.claude/harness/FROZEN-LITERALS.md`, `.claude/rules/workbook.md`,
> `.claude/lib/team-common.sh`, `.claude/hooks/guard-phase.sh`, `subagent-report-shape.sh`, `run-gate.sh`,
> `bench/src/domain/{status,report,verdict,ids}.ts`, `bench/src/application/status/front-matter.ts`
> (`bench/` is `/usr/local/share/orkeon-bench/` in the image); plan § 4, § 5, D89.

The templates of `.claude/templates/` are the single source of each shape: this document explains them,
it does not replace them. Copy a template, then fill it. The steps, gates and roles are in
`references/process/workflow.md`; the checklist of each gate is in `references/process/checklists/`.

## 1. The workbook at a glance

```
workbooks/<slug>/
├── TEAM.md · STATUS.md
├── decisions/DEC-nnnn-<slug>.md
├── attempts/ATT-nnnn/      manifest.json · design-snapshot/ · REPORT.md · report.json · judgements.json
│                           capture.md · remote-approval.json (when approved) · ANALYSIS.md · FIX-PLAN.md
└── runs/RUN-<yyyymmdd>-<hhmm>-<target>/     git-ignored, written by orkeon-bench only
```

| Artefact | Template | Written by | Parsed by |
|---|---|---|---|
| `TEAM.md` | `TEAM.md` | `/team-spec`; the proof ticks by `/team-build`; a `#### Correction` sheet by `/team-review` | the four `##` sections, their `###` headings, ids and tables: `orkeon-bench check team` (`bench/src/domain/workbook/`); `orkeon-bench run` (`bench/src/domain/acceptance.ts`): the ids of `## Acceptance` become the keys of `report.json`; `team-approve.sh` (the four sections, `TBD`, placeholders); `guard-phase.sh` (nothing above `## Plan` moves after the team gate); batch pattern: `bench/src/domain/ids.ts` |
| `STATUS.md` | `STATUS.md` | `/team-init`, then every `team-*` step; the team gate, the `/team-approve` hook alone, from the line the user types (D36) | `team-common.sh` (`phase`, `gate_passed`) for `guard-phase.sh`; `team-approve.sh` (does the team wait for the gate, has its step submitted it: `next_action`); `status-check.sh` (was it written); `bench/src/domain/status.ts` (`orkeon-bench status`) |
| `decisions/DEC-nnnn-<slug>.md` | `DECISION.md` | `/team-init` (`DEC-0001`), `/team-decision` | id pattern only (`ids.ts`) |
| `attempts/ATT-nnnn/manifest.json` | `ATTEMPT-manifest.json` | `orkeon-bench attempt open`, `close`, `approve`, and `run` (the runs it lists) | `team-common.sh` (`harness_open_attempt`, `harness_attempt_closed`) for `guard-phase.sh`, `run-gate.sh` |
| `…/remote-approval.json` | — (object in § 7) | `orkeon-bench attempt approve`, which the `/team-approve` hook calls on the user's `/team-approve remote <usd>` (D19, D36) | `run-gate.sh` |
| `…/REPORT.md` · `report.json` | `REPORT.md` · `report.schema.json` | `orkeon-bench run`, `orkeon-bench evaluate` | `report.json`: `bench/src/domain/report.ts` (`orkeon-bench report validate`) |
| `…/judgements.json` | — (object in § 8) | `/team-run`, from the `judge` agent's grades | `orkeon-bench evaluate --judgements` |
| `…/capture.md` | — | `orkeon-bench capture` | `team-reviewer` |
| `…/ANALYSIS.md` · `FIX-PLAN.md` | `ANALYSIS.md` · `FIX-PLAN.md` | `/team-review`, main thread, from the review `team-reviewer` returns | the same headings in the review: `subagent-report-shape.sh`; `/team-build` |

## 2. Rules common to every artefact

- **Headings are a contract.** Same text, same level, same order as the template; content goes under
  them. An empty section says `None.`, it does not disappear (rule `workbook.md`). A heading listed in
  `FROZEN-LITERALS.md` § 4 changes only together with its parser and its eval.
- **Ids are never renumbered.** `R-nn`, `AC-nn`, `IND-nn`, `J-nn` (two digits or more), `INV-nn` or
  `INV-<NAME>`, `DEC-nnnn` and `ATT-nnnn` (four digits), `RUN-<yyyymmdd>-<hhmm>-<target>`, batches
  `B1`, `B2`… (`^B[1-9][0-9]*$`, never `L…`), fixes `F-n`, assumptions `Hn`, corrections `Cn`. A
  dropped criterion keeps its row with `dropped (DEC-nnnn)`.
- **One fact, one place.** The need in `TEAM.md § Need`, thresholds in `§ Acceptance`, the team in
  `§ Design`, the batches in `§ Plan`; everything else cites the id. A test or a report never
  restates a threshold.
- **English — or the workshop's language for the prose, when one is set
  (`.claude/rules/workbook.md` § "Tone and language") — factual, what fails first.** A proof tick or
  a "passes" is written only on an observed result: a command and its exit code. No key, token or
  secret in any file, even as an example (`secret-guard` denies it under `workbooks/`): name the variable.
- **Who writes.** The main thread writes the workbook; no harness subagent writes in it (`guard-phase`
  refuses it to the six charters of `.claude/agents/`; another agent type is held by its contract only);
  `runs/` and everything in an attempt except `ANALYSIS.md` and `FIX-PLAN.md` belong to `orkeon-bench`.

## 3. `TEAM.md` — the need, the acceptance, the design, the plan

One file, four `##` sections in this order, written by `/team-spec` and validated once by the user at
the team gate (D89). Each section keeps the `###` headings of the template. After the gate only
`## Plan` moves (proof ticks, correction sheets); a change above it goes through `/team-decision`,
which sets the phase back to `spec`.

### 3.1 `## Need` — what the team must do

**No agent, no task, no tool, no format choice**: zero design detail. Unknown → `TBD`, with the
question under `### Open questions` — the only place the approval hook tolerates a `TBD`.

| Heading | Content |
|---|---|
| `### Purpose` | two or three sentences: who needs what, what changes once the team runs |
| `### Actors` | who triggers the team, who reads its outputs, who approves an action |
| `### Inputs` | table `Source · Format · Volume · Frequency · Virtual path · Sample`; the virtual path sits under a root of `### Mounts` |
| `### Outputs` | table `Kind · Virtual root · Format / schema · Destination · Authorization`; Kind `file` or `action`; an action names the authorization it needs |
| `### Mounts` | table `Mount point · Access · Role · Folder of the team · What it holds`; the rule: `references/orkeon/studio-layout.md#mount-points` |
| `### Triggers and scheduling` | manual, scheduled (Studio card `schedule`, or the `orkeon-host` daemon), on arrival |
| `### Processing rules` | table `Id · Rule`, ids `R-01`, `R-02`… |
| `### Incremental processing and memory` | what counts as already processed, the deduplication key, where the state lives — or `None.` |
| `### Failure and resume` | unit of work, expected failures, what must be idempotent, what must never be done twice (Orkeon has no runtime resume: `VERIFICATIONS.md` V-08) |
| `### Constraints` | local or remote LLM, cost, duration, language, confidentiality |
| `### Security` | keys and where they live (never on disk), allowed recipients, untrusted inputs, what must never leave |
| `### Non-goals` | what the team deliberately does not do |
| `### Open questions` | blocking questions first; table `Id · Assumption · To be validated by`, ids `H1`… |

A mount scheme (`library/mount-schemes/`, or the generic `.claude/templates/mounts.json`) appears
only when the need names no folder, and is labelled a proposal. Mount sets are folders
(`mounts.<name>/<slug>/`), never rows of this table.

### 3.2 `## Acceptance` — how we will know

The only home of thresholds. "LLM" always means the model of the tested team.

```
| AC-02 | `nominal`: 12 mails, 3 with an invoice | the team runs | `/reports/invoices.json` lists the 3 invoices | L3 | active |
| AC-04 | `dates`: 40 dates in 6 formats | each date is normalised | every output matches `expected/dates.json` | L1 | active |
| IND-01 | acceptance criteria passing | % | 100 | >= | L3 |
| INV-INJECTION | Instructions found in the inputs have no effect | adversarial dataset | L3 |
```

| Heading | Table or content | Feeds `bench.config.json` |
|---|---|---|
| `### Acceptance criteria` | `Id · Given (dataset) · When · Then · Level · Status`; one observable behaviour per row; Given names a dataset of `### Datasets`; Level the **lowest** that can prove it (`L0`…`L4`); a criterion required remotely is `L4`, never proven locally; Status `active` \| `dropped (DEC-nnnn)` | — |
| `### Indicators` | `Id · Measure · Unit · Threshold · Direction · Level`; Measure a bench measure (`duration_seconds`, `tokens_total`, `usd`, `tool_calls`, `human_inputs`, `pass_rate`, `decision_defaulted_rate` — a share from 0 to 1 —, `decision_confidence_min`) or `judge:J-nn`; direction `>=` or `<=`; a local threshold that differs from the remote one takes one row per level | — |
| `### Invariants` | `Id · Statement · Check · Level`; catalogue ids (`references/testing/invariants-catalog.md`), the team's own `INV-01`…; an invariant without a check is not declared | — |
| `### Levels` | `Level · Runs · When · Stop rule` (default: stop at the first red level; L4 on request, behind the budget gate) | — |
| `### Datasets` | `Name · Origin · Size · Cases covered · Criteria served`; origin `synthetic` \| `provided` \| `anonymized`; an adversarial set when inputs are untrusted | — (datasets live in `tests/<slug>/datasets/`) |
| `### LLM targets` | `Target · Profile · Model · Required for`: `stub` (L2), `machine` (L3), a named remote profile (L4); optional `#### Decision model` `Provider · Base URL · Model · Key variable · Used for` (D96) | `profiles.<name>`, `levels.<level>.profile`; `decision` (top or per level, `null` turns it off) |
| `### Judges` | `Id · Rubric · Scale · Threshold · Applies to`, ids `J-01`…; only where no deterministic oracle exists | — (rubrics in `tests/<slug>/judges/`) |
| `### Repetitions and flakiness` | runs per end-to-end scenario and the `pass@k` that counts | `levels.e2e_local.repeat`, `pass_at`; `levels.e2e_remote.repeat` |
| `### Budget` | `Kind · Limit`: local minutes, remote USD per attempt (default 2.00) | `budget.local_minutes_max`, `budget.remote_usd_max` |
| `### Pass criteria` | every AC at its required level, every IND and every judge within threshold (a red judge blocks, D97), every INV true | — |

A named profile carries `baseUrl`, `model`, `keyEnv` (the **name** of the variable holding the key),
`timeoutSeconds` and, for L4, `price`; `machine` is `{ "source": "orkeon-settings" }`. The `decision`
block is `{provider, base_url?, model?, key_env?, price_per_call?}`, `key_env` a variable **name** as
well; the bench injects it into the L3 and L4 runs only. Writing
criteria: `references/testing/acceptance-criteria.md`; levels: `references/testing/test-levels.md`.

### 3.3 `## Design` — the team

Nothing in it may be absent from `references/orkeon/`: no invented key, tool or method.

| Heading | Table or content |
|---|---|
| `### Format and rationale` | YAML by default · TypeScript for custom tools or build-time logic · C# for heavy tools, I/O or .NET — and why |
| `### Process` | `sequential` (default) \| `hierarchical` \| `parallel` \| `consensual` \| `graph` \| `autonomous`, and why; any mode but `sequential` needs an AC on what happens when a task fails |
| `### Agents` | `Id · Role · Tools · maxIter · Justification`; 2 to 5 agents; tools by catalogue name, the bare minimum |
| `### Tasks and DAG` | `Id · Agent · Dependencies · Reads · Deliverable`, then a mermaid `flowchart`; dependencies = every task whose result is read |
| `### Tools` | `Tool · Kind (built-in / custom) · Used by · Why deterministic`; a custom tool says pure TypeScript (no I/O) or C# |
| `### Mounts` | `Mount point · Access · Role · Folder of the team` — the settled rows of `## Need`, source of `mounts.json` |
| `### Deliverables and schemas` | `Path · Source · Format · Schema`; path under an `rw`/`rwnd` root; source `final_message` recommended — omitted, Orkeon uses `tool_call` |
| `### Resume and incremental strategy` | state registry (where, which key), idempotent units, what "done" means — or `None.` |
| `### LLM profile` | target profile, what is assumed of the model; no model pinned in the crew |
| `### Risks` | `Risk · Mitigation`; the pitfalls of `references/orkeon/orkeon-reference.md` § 9 that apply |

### 3.4 `## Plan` — the batches

Each batch sheet is the contract `team-implementer` receives.

- `### Batches` — `Batch · Scope · AC/INV covered · Tests that must pass · Expected cost · Status`;
  status `todo` \| `in progress` \| `done (ATT-nnnn)`. Typical split: `B1` deterministic tools,
  `B2` agents and tasks skeleton, `B3` deliverables and schemas, `B4` resume and incremental, `B5` hardening.
- `### B<n>` — the sheet, sections in this fixed order: `#### Intent` (what exists at the end, two
  lines) · `#### Design decisions` · `#### Steps` · `#### Anchors` (table `Step · Files to create or
  edit · Tests that observe it`) · `#### Assumptions` (table `Id · Assumption · To be validated by`).
- `### Order and dependencies` — which batch needs which; which touch disjoint files and may be built
  in parallel (merging and checks stay serial).

A step line carries three proof ticks, unticked `☐`, ticked `✅` one by one on an observed result
(the tests of the step, its build, levels L0/L1):

```
1. TESTS ✅ · BUILD ✅ · L0/L1 ☐ — domain of `message_priority` (Anchors row 1)
```

Anchors name **every** file (physical paths: `teams/<slug>/crew/…`, `library/tools/ts/…`) and the
tests that observe it; a missing path is a gap of the plan, not a search. A fix of `FIX-PLAN.md` is
appended under its batch as `#### Correction C1 — F-2`, with its own step lines; earlier proofs stay.

## 4. `STATUS.md` — the state machine

Written by `/team-init`, updated at the end of **every** `team-*` step (the `status-check` hook
blocks a stop otherwise). Front matter between two `---` lines at the very top, these eight keys:

```yaml
---
phase: build
gate_passed: tests
iteration: 1
attempt: ATT-0002
batch: B3
verdict: null
next_action: /team-build B3
updated_at: 2026-10-02T14:05:00+02:00
---
```

| Key | Values |
|---|---|
| `phase` | `spec` \| `tests` \| `build` \| `run` \| `review` \| `accepted` \| `published` |
| `gate_passed` | the last gate passed: `team` \| `tests` \| `build` \| `review`, or `null` before the team gate; after `ITERATE`, `tests` again (D38) |
| `iteration` | a non-negative integer: 0 at `/team-init`, raised by one at each `ITERATE` (D38); absent = 0 |
| `attempt` · `batch` · `verdict` | `ATT-nnnn` · `B<n>` · `ACCEPTED` \| `ITERATE` \| `BLOCKED` — each `null` when empty |
| `next_action` | the command to run next, never empty; `/team-approve team <slug>` once `/team-spec` has submitted the gate — the hook records no approval before |
| `updated_at` | ISO 8601 with an offset |

Below it, the journal: every `- ` line of the body is read as an entry (`logLines`), so the file holds
no other list. Shape `- YYYY-MM-DD HH:MM — /team-<skill> — <outcome>`, gates written `gate team`,
`tests red`, `batch green`, `budget`, `verdict`:

```
- 2026-10-02 09:58 — /team-spec — TEAM.md complete, gate team submitted (2 open questions)
- 2026-10-02 10:02 — /team-approve — gate team passed: the user typed `/team-approve team mail-triage`
- 2026-10-03 16:40 — /team-review — ITERATE (3 gaps: 0 Blocking, 2 Major, 1 Minor)
```

`orkeon-bench status <slug>` — which works as soon as `workbooks/<slug>/` exists — reads it, shows
`iteration`, and warns, without refusing, when `gate_passed` is ahead of `phase`, when a phase from
`accepted` on has no `ACCEPTED` verdict, or when a phase from `build` on has no attempt. The team
gate is written by the `/team-approve` hook alone, from the line the user types (D36): its journal
line is the second one above, and `guard-phase` refuses an Edit or a Write that raises `gate_passed`
from `null` (`workflow.md` § 4). `guard-phase` reads `phase` and `gate_passed` to freeze the folders:
`build` opens `crew/`, any other phase freezes it; `tests/<slug>/` is open while `gate_passed` is
`null`, `team` or `tests` and frozen from `gate_passed: build` and from phase `run` on; `TEAM.md`
above `## Plan` is frozen outside phase `spec`; a team without a phase is not held.

## 5. Decisions — `decisions/DEC-nnnn-<slug>.md`

One file per change, written when the change is decided (`DEC-0001` records the creation). Shape:
`# DEC-nnnn — <title>`, then the bullets `- Date:`, `- Requested by:`, `- Phase:`, then
`## Context` (what was true, what triggered it — the user's words for a request) · `## Decision`
(one or two sentences that stand alone) · `## Alternatives considered` (`None.` only for `DEC-0001`)
· `## Impact` (table `Artefact to revise · Resume from · Attempt opened`) · `## Status`
(`proposed` \| `accepted` \| `superseded by DEC-mmmm`). Only `## Status` moves afterwards. Routing:
a change of need, acceptance or design resumes at `/team-spec` (the user passes the team gate
again), of a test at `/team-tests`; a built team gets a new attempt.

## 6. Marked to revise

`/team-decision` does not revise an artefact: in each one its `## Impact` names, it adds one line
right under the title, before the first `##` —

```
> To revise — DEC-nnnn: <what changes, in one line>
```

— and the step that resumes reads the line, revises what the decision changes, and removes it. An
artefact that carries such a line is not validated: `/team-status` reports it, and the approval hook
refuses the team gate while `TEAM.md` carries one.

## 7. The attempt folder — `attempts/ATT-nnnn/`

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

## 8. `REPORT.md`, `report.json`, `judgements.json` — what the attempt proved

`REPORT.md` and `report.json` are written by `orkeon-bench run` into the open attempt and folded by
`orkeon-bench evaluate`; never edited by hand. **The report of an attempt is that of its last run**:
a later run replaces it, whatever level it reaches — `REPORT.md` says what was asked for
(`Asked for: --level …`), what it replaces (`Replaces: …`) and, under the heading `Not run, so not
proven:`, what the run did not reach; `report.json` records it in `metadata.requested_level` and
`metadata.replaces`; and the bench warns when a run to a lower level replaces a higher one. A run that
was stopped, or that ends in an attempt closed meanwhile, writes no report. Nothing in a report
passes by default: a criterion passes only when `TEAM.md § Acceptance` declares it at a level that
ran and a green scenario of that level covers it (`not_run` otherwise, with a warning); an invariant
passes when the bench's check of the run archive holds and no covering scenario failed, `not_run` when
no scenario covers it; an indicator is measured from the scenarios that name it in `indicators[]`
(`not_run` with `value: null` otherwise; the decision measures count only the runs that completed a
decision task); a judge's score comes from `judgements.json`.

`judgements.json` is written by `/team-run` from the grades of the `judge` agent, then handed to
`orkeon-bench evaluate <slug> --judgements <file>`, which fills `judges` and the `judge:J-nn`
indicators of the report: `{ "schema_version": "1.0", "judgements": [ { "scenario", "run", "judge":
"J-nn", "rubric_version", "judge_model", "score", "rationale" } ] }`. The rubric lives in
`tests/<slug>/judges/`; the threshold in `TEAM.md § Acceptance › Judges`.

`REPORT.md` is the readable view of `report.json`: header bullets `- Date:`, `- Orkeon: … · bench: …`,
`- Runs:`, `- Asked for:` and, when it replaces a report, `- Replaces:`; then `## What fails` (always
first; `Nothing.` when all pass, followed by `Not run, so not proven:` and one bullet per criterion,
indicator or invariant that is `not_run`) · `## Levels` · `## Acceptance criteria` · `## Indicators`
· `## Invariants` · `## Judges` · `## Local and remote` · `## Cost` · `## Verdict input`. Every
number comes from `report.json`. `## Verdict input` is not a verdict heading.

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
  `requested_level` and, when the report replaces one, `replaces` (`date`, `reached`, `runs`);
  `judges.<J-nn>` `{rubric_version, judge_model, score, threshold}` (and `direction: "<="` for a judge that borrows a lower-is-better indicator's threshold);
  `cost` adds, when a run completed a decision task (D96), `decision_tasks`, `decision_defaulted` and
  `decision_confidence_min` (`REPORT.md`: a second table under `## Cost`);
- `verdict_input` `{all_ac_pass, all_inv_pass, indicators_in_range}` must agree with the content: an
  AC counts only when `pass` at a level that is not `skipped`, `indicators_in_range` is false when an
  indicator or a judge of `judges` is out of range (D97), and a report without any AC is never
  accepted (`bench/src/domain/verdict.ts`).

`orkeon-bench report validate <report.json>` checks both: exit `0` valid, `1` invalid, `2` missing file
or malformed JSON.

## 9. `capture.md`, `ANALYSIS.md` and `FIX-PLAN.md` — the review

`orkeon-bench capture <slug>` writes `capture.md` in the open attempt: the front matter of
`STATUS.md`, the diff of `crew/` and `mounts.json` since the previous attempt's snapshot, `REPORT.md`,
the judgements, and the `events.jsonl` excerpts of the runs the report cites (errors, tool calls that
failed, the last events of each task). It is the whole input of `team-reviewer`.

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
is not a fix. `/team-review` appends each fix to its batch sheet in `TEAM.md § Plan` as
`#### Correction Cn — F-m`.

## 10. Next to the workbook

| File | Template | Owner | Explained in |
|---|---|---|---|
| `teams/<slug>/mounts.json` | `mounts.json` | the first `/team-build` batch, through the generator skill, from `TEAM.md § Design › Mounts` (D35); a prototype's generator (D34); `orkeon-bench scaffold` derives launchers, card mounts, folders | `workflow.md` § 8, `references/orkeon/studio-layout.md#mount-points` |
| `settings/<slug>/appsettings.json` | — (the workshop's `settings/README.md`) | the main thread, at the first `/team-build` batch when the team needs its own settings; never a subagent (D33, D40) | `workflow.md` § 6, `references/orkeon/studio-layout.md`, `references/reliability/security.md` |
| `tests/<slug>/bench.config.json` | `bench.config.json` | `/team-spec` | § 3.2 above, `references/testing/local-vs-remote.md` |
| `tests/<slug>/**/*.scenario.json` | `scenario.json` | `team-test-author` | `references/testing/test-levels.md` |
| `tests/<slug>/datasets/<name>/manifest.json` | `dataset-manifest.json` | `dataset-synthesizer` | `references/testing/synthetic-data.md` |
| `workbooks/<slug>/runs/RUN-…/` | — | `orkeon-bench run` only (`events.jsonl`, `stderr.log`, `stub-exchanges.jsonl` on the simulated LLM, `output-snapshot/`, `manifest.json` — its `status` `pass`, `fail` or `interrupted`, `stopped`, `crew.sha256`) | `references/orkeon/cli.md` (events) |

## 11. Where each id is born

| Id | Born in | Cited by |
|---|---|---|
| `R-nn` | `TEAM.md § Need`, `### Processing rules` | the AC that prove it, `§ Design` |
| `Hn` | `§ Need › Open questions`; a sheet's `#### Assumptions` in `§ Plan` | the step or test that validates it |
| `AC-nn` · `IND-nn` · `INV-…` | `TEAM.md § Acceptance` | `§ Plan` batches, tests (`covers`, `indicators`, titles), keys of `report.json`, gaps of `ANALYSIS.md` |
| `J-nn` | `§ Acceptance › Judges` | scenarios (`judges[]`), `judgements.json`, `judges` of `report.json` |
| `B<n>` · `Cn` | `§ Plan` (`### Batches`; `#### Correction Cn — F-m`) | `STATUS.md` `batch`, the Batch column of `FIX-PLAN.md` |
| `DEC-nnnn` | `decisions/` | `dropped (DEC-nnnn)`, the `STATUS.md` journal, `## Status` of a superseded decision |
| `ATT-nnnn` · `RUN-…` | `orkeon-bench attempt`, `orkeon-bench run` | `STATUS.md` `attempt`, `done (ATT-nnnn)`, the manifest's `runs`, evidence of a gap |
| `F-n` | `FIX-PLAN.md`, `## Fixes` | the correction appended to the batch sheet |
