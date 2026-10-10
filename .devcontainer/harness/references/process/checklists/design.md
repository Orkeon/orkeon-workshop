# Checklist — gate 3: the design and the plan

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: harness `.claude/templates/DESIGN.md`, `PLAN.md`; `references/process/workflow.md` § 4–5, § 8; `references/process/artefacts.md` § 6–7;
> `references/orkeon/orkeon-reference.md` (§ 2–5, § 9), `typescript-dsl.md`, `yaml-schema.md`; `VERIFICATIONS.md` (V-06, V-07, V-08,
> re-checked at fb26364); Orkeon `docs/guides/email.md`, `src/tools/Orkeon.Tools.Data/DocxReadTool.cs`; plan § 4.3.

Exit of `/team-design`. Validated by **a script, then the user**. The script,
`orkeon-bench check design <slug>`, runs the checks of gate 2 again, then holds the shape of the design
and of the plan — the boxes marked *(script)* below — against the tool catalogue of the installed
Orkeon: exit `0` without an error, `1` with one, each finding with its code (`--json`); a check it
reports as `skipped` (no `orkeon` on the PATH) is done by hand. It never judges a reason, a size or a
prompt: the other boxes are yours. Artefacts:
`workbooks/<slug>/DESIGN.md`, `workbooks/<slug>/PLAN.md`. Boxes common to every gate: [`README.md`](README.md). Design guidance:
`references/design/` (team patterns, tool selection, I/O contracts, sizing).

## Before the gate

- [ ] `STATUS.md` says `gate_passed: test-plan`.
- [ ] No blocking question is open in `NEED.md` `## Open questions` (no plan is written while one is).

## Pass when

**Format, mode, agents** (`DESIGN.md`)

- [ ] `## Format and rationale` says why. TypeScript is not chosen for a team that needs guardrails,
  `knowledge`, `graphConfig`, `memoryProvider`, or a task-level `llmOverride` other than the response
  format and the profile — `temperature`, `maxTokens`, `topP`, `thinking` (YAML only:
  `typescript-dsl.md`; a TypeScript task carries only its response format, `withResponseFormat` /
  `withResponseSchema`, and its profile, `.withProfile`). `circuitBreaker` exists in neither: Orkeon
  refuses it at load. A C# plugin tool means the team runs through `orkeon-harness-run`, which
  Studio on Windows cannot use (V-07): the design says so.
- [ ] `## Process` names the mode — first, before any other mode it mentions — and why; any mode but `sequential` has an active AC on what happens
  when a task fails — its retry, revision or vote, and what a failed run leaves; `hierarchical` names its
  manager *(script: a mode is named, a manager among the agents; a warning recalls the AC)*.
- [ ] `## Agents`: 2 to 5, one competency each; every tool is a catalogue name (§ 5 of
  `orkeon-reference.md`, or `orkeon run --list-tools`), the bare minimum; `maxIter` justified
  (0 or less fails the load) *(script: the count — a warning outside 2 to 5 —, every tool name, an
  integer `maxIter` of 1 or more, a justification written)*; a `maxRpm` only where a provider's quota asks for one
  (`references/design/sizing-and-cost.md` § 1); delegation off unless the mode needs it.

**Tasks and tools**

- [ ] `## Tasks and DAG`: one task per step; every task whose result is read is a dependency (not only
  the previous one) — `Reads` names a task id only for a result that is read —; the diagram matches the
  table and uses no `{{…}}` node, which the approval hook reads as a placeholder; the deliverable sits
  on the task that produces it
  *(script: agents and dependencies that exist, no cycle, a task named in `Reads` that is not a
  dependency; a warning without a diagram or for a deliverable no task carries)*.
- [ ] `## Tools`: each custom tool says why it is deterministic *(script)* and whether it is pure
  TypeScript (no I/O, runs in Jint) or C#; `Used by` lists agent ids *(script)*; deterministic work (parsing, deduplication, scoring, registry updates) is
  in a tool, not in a prompt. TypeScript tools follow `references/typescript/clean-architecture-ddd.md`.
- [ ] Argument names planned for task descriptions come from § 5 of `orkeon-reference.md`, not from
  memory: the naming is not uniform (`docx_*` / `xlsx_*` take `file_path`, the other file tools
  `path` — V-06, the same on a build of fb26364), and a tool whose parameter schema reaches
  the model empty (listed there) is not relied on for arguments.
- [ ] Mail: the agent that reads untrusted mail (`email_read`, `email_search`, `email_parser`) does
  not also hold `email_send` *(script; `email_send` anywhere is a warning)*; sending appears only where the need authorises it, otherwise replies
  are drafts (`email_draft`); the account rights and allowed recipients the design assumes are
  written down for the release README (`docs/guides/email.md`).

**Mounts, deliverables, state, model**

- [ ] `## Mounts` repeats the settled rows of `NEED.md` *(script: the same mount points, the same
  access, none reserved)*; `mounts.json` will be written from it, at the
  first batch, so every folder must pass the reach rule of `workflow.md` § 8 (D40) — a folder outside
  the team with its warning only; the definition will name no physical path.
- [ ] `## Deliverables and schemas`: every path under an `rw` / `rwnd` root; a source written for each
  (`final_message` recommended — omitted, Orkeon uses `tool_call`; `structured_output` with a schema); a
  schema for every structured file *(script)*.
- [ ] `## Resume and incremental strategy` answers `NEED.md`: registry location and key, idempotent
  units, what "done" means — nothing relies on a runtime resume (V-08). Patterns:
  `references/reliability/resume-patterns.md`, `incremental-patterns.md`.
- [ ] `## LLM profile`: the target profile and what is assumed of the model (context, tool calling);
  no model pinned in the crew.
- [ ] `## Risks` lists the pitfalls of `orkeon-reference.md` § 9 that apply, each with a mitigation
  *(script: at least one risk, none without its mitigation)*.
- [ ] Nothing in `DESIGN.md` is absent from `references/orkeon/`: no invented key, tool or method.

**Plan** (`PLAN.md`)

- [ ] `## Batches`: ids `B1`, `B2`… (never `L…`), each with scope, AC/INV covered, tests that must
  pass, expected cost, status `todo` *(script; on the light track, the single batch `B1`)*.
- [ ] One `### B<n>` sheet per batch, sections in the fixed order `#### Intent` · `#### Design
  decisions` · `#### Steps` · `#### Anchors` · `#### Assumptions`; every step line carries
  `TESTS ☐ · BUILD ☐ · L0/L1 ☐` *(script)*.
- [ ] `#### Anchors` names every file each step creates or edits (physical paths) and the tests that
  observe it; nothing is left for the implementer to search *(script: a row for every step, a file in
  every row, none under `tests/` or `workbooks/`; whether it is the right file is yours)*.
- [ ] Every active AC and every declared INV is covered by at least one batch *(script)*.
- [ ] `## Order and dependencies` says which batches need which, and which may run in parallel
  (disjoint files).

**The user**

- [ ] The user validated the design and the plan explicitly (`/team-approve design`).

## Evidence to look at

| Evidence | How |
|---|---|
| shape, tool names, sheets, coverage | `orkeon-bench check design <slug>` ends `PASS`, exit `0`; every warning read, every `skipped` check done by hand (tool names: `orkeon run --list-tools` and § 5 of `orkeon-reference.md`) |
| argument names | each tool the tasks will call against § 5 of `orkeon-reference.md` |
| pitfalls | the table of `orkeon-reference.md` § 9, row by row |

## Usual reasons to refuse

- A tool name that is not in the catalogue; `email_send` (or `http_api` to a mail API) where the need
  authorises no sending, or in the hands of the agent that reads untrusted mail.
- The model asked to do deterministic work (deduplicate, parse dates, compute a score), or a
  TypeScript tool that needs I/O (files and network belong to built-in tools or to C#).
- A task that reads another task's result without depending on it.
- A deliverable under a read-only root, or a structured deliverable without a schema.
- A non-sequential mode with no AC for a failed task (its retry, revision or vote); `hierarchical` without
  a manager.
- More than five agents, delegation on "in case", `maxIter` left at its default with no reason.
- A resume or incremental need with no registry, or a registry under the deliverables root.
- A model pinned in the crew; a TypeScript format chosen for a team that needs guardrails.
- A batch without anchors, a batch named `L1`, an AC covered by no batch.

## Once passed

`STATUS.md`: `phase: design`, `gate_passed: design`, `next_action: /team-tests <slug>`; journal
`- YYYY-MM-DD HH:MM — /team-approve — gate 3 passed: the user typed …`. The user approves by typing
`/team-approve design`, and the hook `team-approve` records the gate from that line (D36), for a team in
phase `design` with `gate_passed: test-plan` whose `DESIGN.md` and `PLAN.md` exist: nobody else writes
the gate, and `guard-phase` refuses an edit that raises `gate_passed`. The hook records it only once
this step has submitted it: the step ends on `next_action: /team-approve design <slug>`.
