# Checklist — gate 3: the design and the plan

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 77ac8a9 (2026-10-07, after 1.0.0-rc.4).
> Sources: harness `.claude/templates/DESIGN.md`, `PLAN.md`; `references/process/workflow.md` § 4–5, § 8; `references/process/artefacts.md` § 6–7;
> `references/orkeon/orkeon-reference.md` (§ 2–5, § 9), `typescript-dsl.md`, `yaml-schema.md`; `VERIFICATIONS.md` (V-06, V-07, V-08,
> re-checked at fb26364); Orkeon `docs/guides/email.md`, `src/tools/Orkeon.Tools.Data/DocxReadTool.cs`; plan § 4.3.

Exit of `/team-design`. Validated by **a script, then the user**. The script, `orkeon-bench check design`,
is planned (lot 3; it exits `3` today): until it exists every box is checked by hand. Artefacts:
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
- [ ] `## Process` names the mode and why; any mode but `sequential` has an active AC on what happens
  when a task fails — its retry, revision or vote, and what a failed run leaves; `hierarchical` names its
  manager.
- [ ] `## Agents`: 2 to 5, one competency each; every tool is a catalogue name (§ 5 of
  `orkeon-reference.md`, or `orkeon run --list-tools`), the bare minimum; `maxIter` justified
  (0 or less fails the load); a `maxRpm` only where a provider's quota asks for one
  (`references/design/sizing-and-cost.md` § 1); delegation off unless the mode needs it.

**Tasks and tools**

- [ ] `## Tasks and DAG`: one task per step; every task whose result is read is a dependency (not only
  the previous one); the diagram matches the table; the deliverable sits on the task that produces it.
- [ ] `## Tools`: each custom tool says why it is deterministic and whether it is pure TypeScript (no
  I/O, runs in Jint) or C#; deterministic work (parsing, deduplication, scoring, registry updates) is
  in a tool, not in a prompt. TypeScript tools follow `references/typescript/clean-architecture-ddd.md`.
- [ ] Argument names planned for task descriptions come from § 5 of `orkeon-reference.md`, not from
  memory: the naming is not uniform (`docx_*` / `xlsx_*` take `file_path`, the other file tools
  `path` — V-06, the same on a build of fb26364), and a tool whose parameter schema reaches
  the model empty (listed there) is not relied on for arguments.
- [ ] Mail: the agent that reads untrusted mail (`email_read`, `email_search`, `email_parser`) does
  not also hold `email_send`; sending appears only where the need authorises it, otherwise replies
  are drafts (`email_draft`); the account rights and allowed recipients the design assumes are
  written down for the release README (`docs/guides/email.md`).

**Mounts, deliverables, state, model**

- [ ] `## Mounts` repeats the settled rows of `NEED.md`; `mounts.json` will be written from it, at the
  first batch, so every folder must pass the reach rule of `workflow.md` § 8 (D40) — a folder outside
  the team with its warning only; the definition will name no physical path.
- [ ] `## Deliverables and schemas`: every path under an `rw` / `rwnd` root; a source written for each
  (`final_message` recommended — omitted, Orkeon uses `tool_call`; `structured_output` with a schema); a
  schema for every structured file.
- [ ] `## Resume and incremental strategy` answers `NEED.md`: registry location and key, idempotent
  units, what "done" means — nothing relies on a runtime resume (V-08). Patterns:
  `references/reliability/resume-patterns.md`, `incremental-patterns.md`.
- [ ] `## LLM profile`: the target profile and what is assumed of the model (context, tool calling);
  no model pinned in the crew.
- [ ] `## Risks` lists the pitfalls of `orkeon-reference.md` § 9 that apply, each with a mitigation.
- [ ] Nothing in `DESIGN.md` is absent from `references/orkeon/`: no invented key, tool or method.

**Plan** (`PLAN.md`)

- [ ] `## Batches`: ids `B1`, `B2`… (never `L…`), each with scope, AC/INV covered, tests that must
  pass, expected cost, status `todo`.
- [ ] One `### B<n>` sheet per batch, sections in the fixed order `#### Intent` · `#### Design
  decisions` · `#### Steps` · `#### Anchors` · `#### Assumptions`; every step line carries
  `TESTS ☐ · BUILD ☐ · L0/L1 ☐`.
- [ ] `#### Anchors` names every file each step creates or edits (physical paths) and the tests that
  observe it; nothing is left for the implementer to search.
- [ ] Every active AC and every declared INV is covered by at least one batch.
- [ ] `## Order and dependencies` says which batches need which, and which may run in parallel
  (disjoint files).

**The user**

- [ ] The user validated the design and the plan explicitly (`/team-approve design`).

## Evidence to look at

| Evidence | How |
|---|---|
| headings | `diff <(grep '^## ' .claude/templates/DESIGN.md) <(grep '^## ' workbooks/<slug>/DESIGN.md)` |
| tool names | each tool of `## Agents` and `## Tools` against `orkeon run --list-tools` and § 5 of `orkeon-reference.md` |
| sheets | the command below shows the five sections under every `### B<n>`, in order |
| coverage | every `AC-`/`INV-` id of `ACCEPTANCE.md` found in the `## Batches` table |
| pitfalls | the table of `orkeon-reference.md` § 9, row by row |

```bash
grep -nE '^(### B[0-9]+|#### )' workbooks/<slug>/PLAN.md
```

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
it, and `guard-phase` refuses an edit that raises `gate_passed`.
