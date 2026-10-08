---
name: team-design
description: "Step 3 of the method: designs an Orkeon team from its validated need, criteria and test plan, and splits its build into batches. Writes workbooks/<slug>/DESIGN.md — format, orchestration mode, agents, tasks and their DAG, tools, mount points, deliverables and schemas, resume strategy, LLM profile, risks — then PLAN.md — batches B1, B2…, each with a sheet whose anchors name every file to create. Nothing absent from references/orkeon/ enters the design; orkeon-bench check design checks it against the known pitfalls. Ends at gate 3, which the user passes by typing /team-approve design."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-design — design the team and split it into batches

Step 3 of the method (`references/process/workflow.md` § 5). From `NEED.md`, `ACCEPTANCE.md` and
`TEST-PLAN.md` you write `workbooks/<slug>/DESIGN.md`, then `workbooks/<slug>/PLAN.md`. You design on
paper: no file of `teams/<slug>/` or of `tests/<slug>/` is written here. The two files are the memory
of the step, not the conversation.

Arguments: $ARGUMENTS

## 1. Find the team and read where it stands

1. The slug: the argument when it names a workbook; otherwise the only team whose `STATUS.md` names
   this step in `next_action`, or says `phase: design`; otherwise ask which one (AskUserQuestion). No
   workbook at all: stop and name `/team-init <slug>`.
2. Run `orkeon-bench status <slug>` and read `workbooks/<slug>/STATUS.md`. Go on only when
   `gate_passed: test-plan`, with `phase: test-plan` (gate 2 has just been passed) or `phase: design`
   (resuming, or revising what a decision reopened). Anything else, stop and say why: an earlier gate
   is not passed — `/team-status <slug>` names the step and the approval the team waits for —, or
   `gate_passed` is `design` or later: the design is validated, and a change of it goes through
   `/team-decision "<change>"`, which reopens this step.
3. **No plan while a blocking question is open.** Read `## Open questions` of `NEED.md`: when a
   blocking question is still open, stop: add the journal line `- YYYY-MM-DD HH:MM — /team-design —
   stopped: a blocking question of NEED.md is open` to `STATUS.md` (with `updated_at`), put the question
   to the user, and say that its answer is recorded with `/team-decision "<the answer>"` — which, when
   the answer changes the need, sends the team back to step 1 and to its approvals.
4. Starting, Edit the front matter of `STATUS.md`: `phase: design`, `next_action: /team-design <slug>`,
   `updated_at`, and add the journal line `- YYYY-MM-DD HH:MM — /team-design — started from NEED.md,
   ACCEPTANCE.md and TEST-PLAN.md`. Never touch `gate_passed`.
5. Read, in this order, and never ask what they already answer:
   - `workbooks/<slug>/NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`, in full. They are validated and are
     not edited here: when the design shows that one of them must change — a criterion provable at a
     lower level once a tool is deterministic, a mount point missing, a threshold out of reach — that
     is a `/team-decision "<change>"`, never an edit in passing.
   - `workbooks/<slug>/DESIGN.md` and `PLAN.md` when they exist — **resuming**: a section that is
     written is not designed again. A line `> To revise — DEC-nnnn: …` under a title means a decision
     reopened the step: read that decision, revise only what it changes, then remove the line.
   - `workbooks/<slug>/decisions/`; for an adopted prototype (`DEC-0001`, D34), `teams/<slug>/crew/`:
     the crew that exists is the starting point of the design, described as it is, then changed only
     where the need or a criterion asks for it.

## 2. Load the references — before any design

**Nothing in `DESIGN.md` may be absent from `references/orkeon/`**: no invented key, tool, method or
`process` value. Read:

- always: `references/orkeon/orkeon-reference.md` (modes § 2, agents § 3, tasks § 4, the tool
  catalogue § 5, files § 6, the known pitfalls § 9), `references/design/team-patterns.md` and
  `references/design/tools-selection.md`;
- for the format you choose: `references/orkeon/yaml-schema.md`, `references/orkeon/typescript-dsl.md`
  with `references/typescript/clean-architecture-ddd.md`, or `references/orkeon/csharp-tools.md` and
  `csharp-crews.md`; and `references/orkeon/studio-layout.md` for the layout of a team folder;
- when the section reaches their subject: `references/design/io-contracts.md` (mount points,
  deliverables, schemas), `references/design/sizing-and-cost.md` (`maxIter`, tokens, duration),
  `references/design/prompting.md`, `references/orkeon/llm-profiles.md`,
  `references/reliability/resume-patterns.md` and `incremental-patterns.md` (a need with resume or
  incremental processing), `references/reliability/security.md` (untrusted inputs, mail, keys),
  `references/reliability/error-handling.md` (a mode other than `sequential`).

Tool names come from the catalogue, never from memory: `orkeon run --list-tools` is the authority on
the installed Orkeon, § 5 of `orkeon-reference.md` gives each tool's arguments.

## 3. Write `DESIGN.md`

Copy `.claude/templates/DESIGN.md` — every heading, in order, `{{TEAM_TITLE}}` replaced by the title
of `STATUS.md` — and fill it section by section, each choice with its reason. A section with nothing
to say holds `None.` — never Agents, Tasks and DAG, Mounts or Risks, which every team has; a table
never keeps the blank row of the template.

1. **Format and rationale** — YAML by default; TypeScript when the team needs custom tools or
   build-time logic; C# for heavy tools, I/O or .NET integration. Say why, and what the choice costs:
   a TypeScript crew has no guardrails, `knowledge`, `graphConfig` or `memoryProvider`
   (`typescript-dsl.md`); a C# plugin tool means the team runs through `orkeon-harness-run`, which
   Orkeon Studio on Windows cannot use — and today no generator skill writes C#, and neither the
   launchers nor the bench run such a team (`references/orkeon/csharp-tools.md` § 9): say so to the
   user before choosing it.
2. **Process** — `sequential` unless the need calls for another mode, and why; name the mode chosen
   first, in back-ticks, before any other mode the section mentions. Any other mode needs an
   **active acceptance criterion** on what happens when a task fails — its retry, revision or vote, and
   what a failed run leaves: when `ACCEPTANCE.md` has none, that is a `/team-decision`. `hierarchical`
   names its manager, one of the agents.
3. **Agents** — 2 to 5, one competency each. Tools: catalogue names only, in back-ticks, the bare
   minimum per agent; `maxIter` sized to the work, with its justification; delegation off unless the
   mode needs it. The agent that reads untrusted mail
   (`email_read`, `email_search`, `email_parser`) never holds `email_send`; sending appears only where
   the need authorises it for named recipients — otherwise a reply is a draft.
4. **Tasks and DAG** — one task per step; **every** task whose result a task reads is one of its
   dependencies, not only the previous one; the deliverable sits on the task that produces it, at the
   path the deliverables table gives. Ids in back-ticks, in `Agent`, `Dependencies` and `Reads`; in
   `Reads`, a task id appears only for a task whose result is read. Draw the mermaid `flowchart` from
   the table, never the other way round, with square or round nodes: a `{{…}}` node reads as a
   placeholder left from the template, and the approval is refused.
5. **Tools** — built-in ones by catalogue name; a custom tool only for deterministic work (parsing,
   deduplication, scoring, a registry update), with why it is deterministic and whether it is pure
   TypeScript (no I/O: it runs in Jint) or C#. What is deterministic belongs in a tool, not in a prompt.
   `Used by` lists agent ids, each written out, in back-ticks.
6. **Mounts** — the settled rows of `## Mounts` of `NEED.md`, unchanged: same mount points, same
   access. It is the source of `mounts.json`, written at the first batch; the definition names no
   physical path. A mount point to add or to drop is a change of the need.
7. **Deliverables and schemas** — every path under an `rw` or `rwnd` mount point; the source written
   for each (`final_message` recommended — omitted, Orkeon uses `tool_call`; `structured_output` needs
   a schema); a schema for every structured file.
8. **Resume and incremental strategy** — answers `## Failure and resume` and `## Incremental
   processing and memory` of the need: where the registry lives (under the state mount point, never
   under the deliverables), its key, the idempotent units, what "done" means. Orkeon does not resume a
   run: the team carries it. `None.` only when `ACCEPTANCE.md` declares none of `INV-RESUME`,
   `INV-INCR` and `INV-IDEMP`.
9. **LLM profile** — the target profile and what the design assumes of the model (context size, tool
   calling). No model is pinned in the crew.
10. **Risks** — the pitfalls of `orkeon-reference.md` § 9 that apply, the limits of the mode, what the
    local model may not manage — each with its mitigation.

## 4. What the user decides — one question at a time

The design is yours to propose and the user's to validate at the gate. Ask before the gate only what
changes the cost or the use of the team, with AskUserQuestion — **one question for one decision**, 2
to 4 options, the one you recommend first, marked `(Recommended)`, each with its consequence — and
write the answer in `DESIGN.md` before the next question:

- the format, when the need leaves a real choice (a custom tool in TypeScript, or a prompt and a
  built-in tool in YAML);
- a mode other than `sequential`, and what it costs in calls;
- a C# tool, which takes the team out of Orkeon Studio's launch button;
- a choice that trades a criterion's level, a duration or a cost against simplicity.

Everything the references settle is decided, written with its reason, and not asked. Talk in the
user's language and write the prose in English — or both in the workshop's language when one is set
(`.claude/rules/workbook.md` § "Tone and language"); headings, ids, table headers, tool names and fixed
words stay as the templates have them.

## 5. Write `PLAN.md`

Copy `.claude/templates/PLAN.md` the same way, once `DESIGN.md` is complete.

- **`## Batches`** — `B1`, `B2`… (never `L…`: `L0`–`L4` are the test levels), in build order.
  Typically `B1` the team folder and the deterministic tools, `B2` agents and tasks skeleton, `B3`
  deliverables and schemas, `B4` resume and incremental, `B5` hardening — fewer for a small team. Each
  row: its scope, the `AC-`/`INV-` ids it makes pass — each id written out, never a range —, the tests
  that must pass at its end, its expected cost (tokens or minutes, from `sizing-and-cost.md`), Status
  `todo`. **Every active AC and every declared INV is covered by at least one batch.**
- **The first batch creates the team folder** (D35), whatever else it holds: `teams/<slug>/mounts.json`
  from `## Mounts`, the crew through the generator skill of the format — into that folder, never a
  `<slug>-2` —, then `orkeon-bench scaffold <slug>`. Its anchors name those files. When the team needs
  its own Orkeon settings, `settings/<slug>/appsettings.json` is a step of that batch marked
  "(main thread)": no subagent may write a settings file.
- **One `### B<n>` sheet per batch**, sections in this fixed order — it is the contract the
  implementer receives: `#### Intent` (what exists at the end, two lines) · `#### Design decisions` ·
  `#### Steps` (one numbered line per step, each with `TESTS ☐ · BUILD ☐ · L0/L1 ☐` — never ticked
  here: a tick is set on an observed result) · `#### Anchors` · `#### Assumptions`.
- **Anchors name every file** a step creates or edits — the column `Files to create or edit` —, by its
  physical path from the workshop root (`teams/<slug>/crew/config.yaml`,
  `teams/<slug>/crew/agents/<id>.yaml`, `teams/<slug>/crew/tools/<name>/domain.ts`, `library/tools/…`),
  each in back-ticks; and, in the column `Tests that observe it`, the tests as `/team-tests` will write
  them (`.claude/rules/team-tests.md`: `component/ac-04-<name>.scenario.json`, `unit/<tool>.test.ts`).
  A missing path is a gap of the plan, not a search for the implementer. No file to create or edit lies
  under `tests/<slug>/` or `workbooks/<slug>/`: the implementer never writes there.
- **Assumptions** — `H1`, `H2`…: what the batch takes for granted and who or what will validate it;
  `None.` when there is none.
- **`## Order and dependencies`** — which batch needs which; which touch disjoint files and may be
  built in parallel.
- **Light track** (`track: light`, D37): `DESIGN.md` and `PLAN.md` are written together, with a single
  batch `B1`.

## 6. Pausing

When the user stops, or the session must end before the gate: update `STATUS.md` — `next_action:
/team-design <slug>`, `updated_at`, and one journal line `- YYYY-MM-DD HH:MM — /team-design — paused at
<section of DESIGN.md or batch of PLAN.md>` — and say how to resume. The journal only grows.

## 7. Gate 3

When both files are complete:

1. **The script first.** Run `orkeon-bench check design <slug>`: it reads the five artefacts,
   `tests/<slug>/bench.config.json`, the track of `STATUS.md` and the tool catalogue of the installed
   Orkeon, and must end with **no error** (exit `0`). Fix what it
   reports and run it again. Read every warning: fix it, or keep it to tell the user why it stands. A
   check it reports as `skipped` (no `orkeon` on the PATH) is one you do by hand.
2. Walk `references/process/checklists/design.md` box by box, on evidence: the script holds the shape
   — headings, ids, tool names, dependencies, mount points, coverage, sheets, anchors —, you hold the
   content: the table of pitfalls of `orkeon-reference.md` § 9 row by row, the reason of each choice,
   the size of each agent, whether each anchor is the right file.
3. Update `STATUS.md`: `next_action: /team-approve design <slug>`, `updated_at`, and the journal line
   `- YYYY-MM-DD HH:MM — /team-design — DESIGN.md and PLAN.md complete, gate 3 submitted (<n> agents,
   <n> tasks, <n> batches; check design: 0 errors, <n> warnings)`.
4. Show the user, in a few lines: the paths of the two files; the format and the mode with their
   reason; the agents and their tools; the batches and what each makes pass; the warnings that stand
   and why; the risks; the boxes left open. Then say that they validate by typing
   `/team-approve design <slug>`, amend by answering, or refuse. `next_action: /team-approve design
   <slug>` is what submits the gate: the hook records no approval without it.
5. When the user amends, or this step is run again on files already submitted, put `next_action:
   /team-design <slug>` back first — the gate is not submitted while the files change — and submit
   again once the change is written and the check passes.

**You never pass gate 3 yourself.** `gate_passed` is written by the `/team-approve` hook, from the line
the user types — not by you, whatever the user says in the conversation ("ok", "validated", "go on" are
not the approval: answer that the gate is passed by typing `/team-approve design`). `guard-phase`
refuses the edit. Silence is not a yes.

## 8. What this step never does

It writes nothing in `teams/<slug>/` — no crew, no `mounts.json`: the first build batch does — and
nothing in `tests/<slug>/`; it edits neither `NEED.md`, `ACCEPTANCE.md` nor `TEST-PLAN.md`; it ticks
no proof; and it does not start the tests or the build: after the gate, the next step is the user's to
launch.
