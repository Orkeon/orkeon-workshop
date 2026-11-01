# Checklist — the team gate: `TEAM.md`

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at c727c06 (2026-11-01, 1.0.0-rc.6).
> Sources: Orkeon `docs/guides/email.md`, `src/tools/Orkeon.Tools.Email/Configuration/EmailToolsOptions.cs`, `EmailEnums.cs`,
> `src/tools/Orkeon.Tools.Data/DocxReadTool.cs`; harness `.claude/templates/TEAM.md`, `bench.config.json`; `references/process/workflow.md` § 4–5, § 8;
> `references/process/artefacts.md` § 3; `references/orkeon/orkeon-reference.md` (§ 2–5, § 9), `typescript-dsl.md`, `yaml-schema.md`;
> `references/testing/invariants-catalog.md`; `.claude/rules/workbook.md`; `FROZEN-LITERALS.md` § 3–4; `VERIFICATIONS.md` (V-06, V-07, V-08, V-12); plan § 4.3, D89.

Exit of `/team-spec`. Validated by **a script, then the user**. The script,
`orkeon-bench check team <slug>`, holds the shape of the four sections of `TEAM.md` and of
`tests/<slug>/bench.config.json` — the boxes marked *(script)* below — against the tool catalogue of
the installed Orkeon: exit `0` without an error, `1` with one, each finding with its code (`--json`);
a check it reports as `skipped` (no `orkeon` on the PATH) is done by hand. It never judges a reason, a
size or a prompt: the other boxes are yours. Artefacts: `workbooks/<slug>/TEAM.md` (`## Need`,
`## Acceptance`, `## Design`, `## Plan`) and `tests/<slug>/bench.config.json`, which carries the
values of `## Acceptance`. Boxes common to every gate: [`README.md`](README.md). How to write
criteria: `references/testing/acceptance-criteria.md`; levels: `references/testing/test-levels.md`;
design guidance: `references/design/`.

## Before the gate

- [ ] `STATUS.md` says `phase: spec`, `gate_passed: null`, `iteration: 0` (or the `iteration` a
  `/team-decision` left); `decisions/DEC-0001-*.md` records the creation.
- [ ] No `> To revise — DEC-nnnn` line is left under a heading: the step that resumed removed it.

## Pass when

### Shape

- [ ] The four `##` sections in order, each with the `###` headings of the template, same text and
  level *(script)*; every section filled, `None.`, or `TBD` with its question under
  `### Open questions`. No blocking question open when the gate is submitted: the hook refuses a
  `TBD` elsewhere.

### `## Need`

**No design detail**

- [ ] No agent, task, tool name, orchestration mode, format (YAML / TypeScript / C#) or model in the
  section. "The team reads the mailbox" is a need; "an agent calls `email_parser`" is design.

**Inputs, outputs, mounts**

- [ ] `### Inputs`: one row per source, with format, volume, frequency, a sample, and a virtual path
  under a root declared in `### Mounts`. Volume and frequency are numbers or ranges, not "some".
- [ ] `### Outputs`: every row says `file` or `action`; every action names its authorization
  (who approves, which recipients). For mail: which account, which rights the team needs (`Read`,
  `Organize`, `Draft`, `Send`, `Delete`, `Purge`) and which recipients are allowed. A reply is a
  draft left in the mailbox, nothing sent, unless the need authorises sending to named recipients.
  The account is declared in `settings/<slug>/appsettings.json` (D33: `Orkeon:Tools:Email:Accounts`;
  an empty `Send:AllowedRecipients` allows nobody), never in the team folder nor in the machine's
  settings.
- [ ] `### Mounts`: the rule of `references/orkeon/studio-layout.md#mount-points` — one point per
  kind of content, named after it; access `ro` / `rw` / `rwnd`; a role; the folder of the team;
  `/state` (rw) as soon as the need asks for resume or incremental processing; no reserved root; a
  proposed scheme labelled as a proposal *(script: no reserved root)*.
- [ ] Every virtual path of `### Inputs` and `### Outputs` falls under one of these points, with an
  access that allows what is done there (nothing written under `ro`).

**Rules, state, failure**

- [ ] `### Processing rules`: numbered `R-01`, `R-02`…, one rule per row, testable as written.
- [ ] `### Incremental processing and memory`: what counts as already processed, the deduplication
  key, where the state lives — or `None.` when every run starts from scratch.
- [ ] `### Failure and resume`: the unit of work, what must be idempotent, what must never happen
  twice. Nothing relies on Orkeon resuming a run: it cannot (V-08).

**Constraints, security, scope**

- [ ] `### Constraints`: local or remote LLM, cost, duration, language, confidentiality.
- [ ] `### Security`: where each key lives (an environment variable, never a file), allowed
  recipients, which inputs are untrusted, what must never leave.
- [ ] `### Non-goals` names at least what a reader would otherwise assume.
- [ ] `### Open questions`: blocking ones first; each assumption has an `Hn` and a "to be validated by".

### `## Acceptance`

**Criteria** (`### Acceptance criteria`)

- [ ] Every row has an `AC-nn` id, a dataset in Given, an observable Then (a file, a field, a count,
  an event — not "the summary is good"), a Level and a Status `active` or `dropped (DEC-nnnn)`
  *(script: the id, the cells, the level, the status — not whether Then is observable)*.
- [ ] Every output and every rule `R-nn` of `## Need` is covered by at least one AC — or, for what
  must hold on every run or is a measure, by an invariant or an indicator — or is a non-goal.
- [ ] Each Level is the **lowest** that can prove the criterion: a parsing rule in a custom tool is
  `L1`, wiring and deliverable shape `L2`, what depends on the model's judgement `L3`, a behaviour
  required of a remote model `L4` — never proven by a local run.
- [ ] Every dataset named in Given — first, in back-ticks — appears in `### Datasets` *(script)*.

**Indicators** (`### Indicators`)

- [ ] Every row has an `IND-nn` id, a measure, a unit, a numeric threshold, a direction `>=` or `<=`,
  a level *(script)*; a local threshold that differs from the remote one has its own row.
- [ ] The standard indicators the team needs are there (`invariants-catalog.md`, "Standard indicators").

**Invariants** (`### Invariants`)

- [ ] `INV-FS`, `INV-SECRETS`, `INV-TOOLS`, `INV-BUDGET` (they apply always), with their catalogue
  id; no catalogue invariant below its lowest level, no `INV-<NAME>` the catalogue does not hold
  *(script)*.
- [ ] `INV-INJECTION` when an input is untrusted (lowest level L3); `INV-RESUME` and `INV-INCR` when
  the need asks for resume or incremental processing; `INV-IDEMP` when the team acts outside or
  keeps state; `INV-SCHEMA` when a deliverable has a schema; `INV-EMAIL` when the team can send mail.
- [ ] Every invariant names its check *(script)*; none is declared "to be safe". The team's own are
  `INV-01`, `INV-02`…, true or false on any run.

**Datasets, targets, judges, budget**

- [ ] `### Levels`: which run, when, the stop rule; L4 on request — or once before acceptance when a
  criterion or an indicator sits at L4 —, behind the budget gate.
- [ ] `### Datasets`: a name in lower case with hyphens; origin `synthetic` / `provided` /
  `anonymized`, size, cases, criteria served, each id written out *(script)*; an adversarial set
  when an input is untrusted; edge cases (empty, oversized, encoding, duplicates); what cannot be
  tested in the container is said.
- [ ] `### LLM targets`: `stub` for L2, `machine` for L3, a named profile for L4 when L4 is required
  — and no `remote` row when no remote target is planned *(script: every profile named exists)*.
- [ ] `### Judges`: only where no deterministic oracle exists; each `J-nn` has a rubric, a scale and
  a threshold.
- [ ] `### Repetitions and flakiness`: runs per end-to-end scenario and the `pass@k` that counts.
- [ ] `### Budget`: local minutes and a remote cap in USD per attempt (default 2.00).
- [ ] `### Pass criteria` states the whole rule (every AC at its level, every IND, every INV).

**`tests/<slug>/bench.config.json`**

- [ ] It matches the section: `levels.e2e_local` `{profile, repeat, pass_at}`,
  `levels.e2e_remote.profile`, `budget.local_minutes_max`, `budget.remote_usd_max`,
  `retention.runs_keep` *(script: the two budget numbers, a level configured for every id at L3 or
  L4, the profiles of `### LLM targets`)*.
- [ ] Every named profile has `baseUrl`, `model`, `keyEnv` (a variable **name**), `timeoutSeconds`;
  no key, and no `<to decide>` left in a profile a level names *(script)*.
- [ ] `orkeon-bench profile <slug> <name>` says `remote` exactly for the targets the section calls
  remote — including `machine`, which is remote as soon as what Orkeon will read points at a remote
  host, or holds an `Llm` section without a base URL (`FROZEN-LITERALS.md` § 3).

### `## Design`

**Format, mode, agents**

- [ ] `### Format and rationale` says why. TypeScript is not chosen for a team that needs guardrails,
  `knowledge`, `graphConfig`, `memoryProvider`, or a task-level `llmOverride` other than the response
  format and the profile (YAML only: `typescript-dsl.md`). `circuitBreaker` exists in neither. A C#
  plugin tool means the team runs through `orkeon-harness-run`, which Studio on Windows cannot use
  (V-07): the design says so.
- [ ] `### Process` names the mode — first — and why; any mode but `sequential` has an active AC on
  what happens when a task fails; `hierarchical` names its manager *(script: a mode is named, a
  manager among the agents; a warning recalls the AC)*.
- [ ] `### Agents`: 2 to 5, one competency each; every tool is a catalogue name (§ 5 of
  `orkeon-reference.md`, or `orkeon run --list-tools`), the bare minimum; `maxIter` justified
  *(script: the count — a warning outside 2 to 5 —, every tool name, an integer `maxIter` of 1 or
  more, a justification written)*; a `maxRpm` only where a provider's quota asks for one; delegation
  off unless the mode needs it.

**Tasks and tools**

- [ ] `### Tasks and DAG`: one task per step; every task whose result is read is a dependency —
  `Reads` names a task id only for a result that is read —; the diagram matches the table and uses
  no `{{…}}` node; the deliverable sits on the task that produces it *(script: agents and
  dependencies that exist, no cycle, a task named in `Reads` that is not a dependency; a warning
  without a diagram or for a deliverable no task carries)*.
- [ ] `### Tools`: each custom tool says why it is deterministic *(script)* and whether it is pure
  TypeScript (no I/O, runs in Jint) or C#; `Used by` lists agent ids *(script)*; deterministic work
  is in a tool, not in a prompt. TypeScript tools follow `references/typescript/clean-architecture-ddd.md`.
- [ ] Argument names planned for task descriptions come from § 5 of `orkeon-reference.md`, not from
  memory (`docx_*` / `xlsx_*` take `file_path`, the other file tools `path` — V-06).
- [ ] Mail: the agent that reads untrusted mail does not also hold `email_send` *(script;
  `email_send` anywhere is a warning)*; sending appears only where the need authorises it, otherwise
  replies are drafts (`email_draft`).

**Mounts, deliverables, state, model**

- [ ] `### Mounts` repeats the settled rows of `## Need › Mounts` *(script: the same mount points,
  the same access, none reserved)*; `mounts.json` will be written from it at the first batch, so
  every folder passes the reach rule (D40, `studio-layout.md#mount-points`); the definition will
  name no physical path.
- [ ] `### Deliverables and schemas`: every path under an `rw` / `rwnd` root; a source written for
  each; a schema for every structured file *(script)*.
- [ ] `### Resume and incremental strategy` answers `## Need`: registry location and key, idempotent
  units, what "done" means — nothing relies on a runtime resume (V-08). Patterns:
  `references/reliability/resume-patterns.md`, `incremental-patterns.md`.
- [ ] `### LLM profile`: the target profile and what is assumed of the model; no model pinned in the crew.
- [ ] `### Risks` lists the pitfalls of `orkeon-reference.md` § 9 that apply, each with a mitigation
  *(script: at least one risk, none without its mitigation)*.
- [ ] Nothing in `## Design` is absent from `references/orkeon/`: no invented key, tool or method.

### `## Plan`

- [ ] `### Batches`: ids `B1`, `B2`… (never `L…`), each with scope, AC/INV covered, tests that must
  pass, expected cost, status `todo` *(script)*.
- [ ] One `### B<n>` sheet per batch, sections in the fixed order `#### Intent` · `#### Design
  decisions` · `#### Steps` · `#### Anchors` · `#### Assumptions`; every step line carries
  `TESTS ☐ · BUILD ☐ · L0/L1 ☐` *(script)*.
- [ ] `#### Anchors` names every file each step creates or edits (physical paths) and the tests that
  observe it *(script: a row for every step, a file in every row, none under `tests/` or
  `workbooks/`; whether it is the right file is yours)*.
- [ ] Every active AC and every declared INV is covered by at least one batch *(script)*.
- [ ] `### Order and dependencies` says which batches need which, and which may run in parallel.

### The user

- [ ] The user answered the questions and validated the file explicitly (`/team-approve team <slug>`).

## Evidence to look at

| Evidence | How |
|---|---|
| shape, ids, tool names, sheets, coverage | `orkeon-bench check team <slug>` ends `PASS`, exit `0`; every warning read, every `skipped` check done by hand |
| headings | `diff <(grep -E '^##+ ' .claude/templates/TEAM.md) <(grep -E '^##+ ' workbooks/<slug>/TEAM.md)` prints only the `### B<n>` sheets |
| open points | `grep -n 'TBD' workbooks/<slug>/TEAM.md`, each matched by a row of `### Open questions` |
| design leaks in `## Need` | a read of the section; a word search (`agent`, `task`, `tool`, `.yaml`, `.ork.ts`) as a first pass only |
| profiles | `orkeon-bench profile <slug> <name> --json` (`remote`, `remote_reason`, `base_url_host`) |
| config | `jq . tests/<slug>/bench.config.json` |
| state | `orkeon-bench status <slug>` (it reads the workbook: `teams/<slug>/` does not exist yet) |

## Usual reasons to refuse

- A design decision in `## Need` (an agent, a tool, "use TypeScript").
- An action without an authorization, or a recipient list left open for a team that writes to people.
- A virtual path under an undeclared root, a reserved root declared, a mount point of `## Design`
  that differs from `## Need`.
- Resume or incremental processing asked for, with no `/state` point, no deduplication key, no registry.
- Untrusted inputs not called untrusted: no adversarial dataset, no `INV-INJECTION`.
- A criterion that cannot fail, restates the need, or is attached too high or too low.
- A threshold written in several places; an invariant without a check; an indicator without unit or direction.
- One run for a local end-to-end scenario; a judge where a schema or a count would do.
- No budget, a key in `bench.config.json`, or a remote target the section calls local.
- A tool name that is not in the catalogue; `email_send` where no sending is authorised.
- The model asked to do deterministic work; a task that reads a result without depending on it.
- A deliverable under a read-only root; a structured deliverable without a schema.
- More than five agents; a model pinned in the crew; a batch without anchors; an AC covered by no batch.
- A blocking question disguised as an assumption.

## Once passed

`STATUS.md`: `phase: tests`, `gate_passed: team`, `next_action: /team-tests <slug>`; journal
`- YYYY-MM-DD HH:MM — /team-approve — gate team passed: the user typed …`. The user approves by
typing `/team-approve team <slug>`, and the hook `team-approve` records the gate from that line
(D36, D89): nobody else writes it — `/team-spec` stops at `next_action: /team-approve team <slug>` and
the journal line `— /team-spec — TEAM.md complete, gate team submitted (<n> open questions)`, and
`guard-phase` refuses an edit that raises `gate_passed`. The hook refuses the approval while
`TEAM.md` is missing, lacks one of its four sections, still holds a `{{…}}` placeholder, a `> To
revise` line or a `TBD` outside `### Open questions`, and while the gate is not submitted —
`next_action` still names `/team-spec`.
