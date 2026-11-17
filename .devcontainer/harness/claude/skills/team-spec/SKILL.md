---
name: team-spec
description: "Step 1 of the method: writes the one upstream artefact of an Orkeon team, workbooks/<slug>/TEAM.md — the need, the acceptance (criteria, indicators, invariants, datasets, targets, judges, budget), the design (format, process, agents, tasks, tools, mounts, deliverables, resume, risks) and the plan in batches — from a brief, an adopted prototype or an interview of at most six questions, the rest as written assumptions. Checks it with orkeon-bench check team and submits the one gate, which the user passes by typing /team-approve team <slug>."
argument-hint: "[<slug>] [a brief, or the path of one]"
disable-model-invocation: true
---

# /team-spec — the team on paper, in one file

Step 1 of the method (`references/process/workflow.md`). You write `workbooks/<slug>/TEAM.md`, section
by section, and nothing else of the team: no file of `teams/<slug>/` or `tests/<slug>/` but
`tests/<slug>/bench.config.json`. The file is the memory of the step, not the conversation: every answer
is written at once, so that a `/clear` or another session resumes where this one stopped.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`phase: spec`, `gate_passed: null`), `TEAM.md` as it stands, the brief, `decisions/`,
  for an adopted prototype `teams/<slug>/README.md`, `mounts.json`, `crew/`.
- Writes: `TEAM.md` (every H2 and H3 of `.claude/templates/TEAM.md`, in order, `{{TEAM_TITLE}}`
  replaced), `tests/<slug>/bench.config.json`, `STATUS.md` (journal, `next_action`, `updated_at`).
- Check: `orkeon-bench check team <slug>` ends with no error.
- Journal: `— /team-spec — TEAM.md complete (<n> AC, <n> IND, <n> INV, <n> batches)`; paused:
  `— /team-spec — paused at <section> (<n> sections filled)`.
- Gate: `next_action: /team-approve team <slug>` submits it; the user types it. You never write
  `gate_passed` (`guard-phase` refuses it; "ok" in the conversation is not the approval).

## Steps

### 1. Find the team and read where it stands

1. The slug: the first argument naming a workbook; else the only team with `phase: spec`; else ask
   (AskUserQuestion). No workbook: stop and name `/team-init <slug>`.
2. `orkeon-bench status <slug>`; go on only with `phase: spec`. `gate_passed: team` or later: the file
   is validated — a change goes through `/team-decision "<change>"`, which reopens this step.
3. Read what exists: `TEAM.md` (**resuming**: a filled section is not asked again; `> To revise —
   DEC-nnnn` under a heading means a decision reopened it — revise only what it changes, remove the
   line), the brief, `decisions/`, the adopted prototype (what it is *for*, reads and writes; its crew
   becomes the first draft of `## Design`, described as it is).
4. Add the journal line `- YYYY-MM-DD HH:MM — /team-spec — started` with `updated_at`.

### 2. Six questions at most — everything else is written as an assumption

One AskUserQuestion carries **one** question, 2 to 4 options, the recommended one first, marked
`(Recommended)`, each with its consequence; the answer is written in `TEAM.md` before the next
question. Ask only what the brief, the prototype and the references do not settle, in this order,
and stop at six:

1. the purpose and the smallest useful version (the one challenge you may put);
2. the inputs and outputs — and, for an action (a mail, an API call, a write), its authorization;
3. the mount points, shown as a table to confirm, derived from the inputs and outputs
   (`references/orkeon/studio-layout.md#mount-points`: one point per kind of content, `/registry` when the
   team resumes or is incremental, not a reserved point — `/state` and `/runs` are the runner's);
4. the model: local only, or a remote profile for `L4` — which one, the key's **environment variable
   name**, the cap in USD; and, only when the need holds a closed choice (a classification, a route, a
   yes/no gate), the decision model (D96): **none** (Recommended: every choice answers its fallback),
   Kev (local, or Liquid's d1 weights served as Kev), Liquid or TypeSafe (hosted, remote) — for any but none, the base URL and model when not
   the default, the key's environment variable name, not its value, and for a hosted one its USD price
   per call; with a provider only, optionally a ready-made decision profile in front of an agent
   (`references/orkeon/decision-profiles.md`: `guarded`, `guarded-small`, `triage`, `strict`; none by default);
   "closed choice?" is your test; a second signal, optional (D98): `orkeon-bench decide noul --question
   "The need holds a closed choice: a classification, a route or a yes/no gate settled by a fixed list of
   answers." --context-file <a scratch file holding the need's excerpt: the brief's paragraph, or the part of TEAM.md §
   Need that states it, not the whole file>`, without `--allow-remote` (a paid `decide` is priced and submitted by `/team-run` alone, D104); the bench keeps the first 4 KB on a line boundary
   (`--max-context-bytes`; the local Kev answers 500 past about 5 KB) and says `truncated` in its JSON. Exit 0: when its `answer` (with
   `confidence` ≥ 0.7) contradicts your reading, say so in the question's text — the user still decides.
   Exit 4 (no decision model) or any other code: the test is yours alone, exactly as before;
5. the thresholds the need does not state (a judge's score, a duration, a cost);
6. the non-goals a reader would otherwise assume.

What is not asked is **decided and written**, with its reason, and listed in `### Open questions` as
`Hn — <assumption> — to be validated by the user at the gate`. The gate is where the user settles
them: an answer that changes the file is written, the check run again, the gate submitted again.

### 3. Write `## Need`

The template's comments say what each H3 holds; `references/process/artefacts.md` § 3 details it. Zero
design detail: no agent, task, tool, format or model — a design idea the user volunteers goes under
`### Open questions` as a wish. Rules `R-nn`, one per row, testable as written. Security: where each
key lives (an environment variable, never a file), untrusted inputs, what must never leave.

### 4. Write `## Acceptance`

- **Criteria** `AC-nn`: every output and every rule `R-nn` covered by a criterion that cites it, an
  invariant or an indicator, or a non-goal. Given names a dataset in back-ticks; Then is one outcome a
  deterministic check decides (a file, a field equal to `expected/`, a count, a schema, a text absent, a
  tool never called). Level: the **lowest** that proves it — `L0` the definition, `L1` a tool's
  computation, `L2` the wiring, `L3` a local model's judgement, `L4` the remote model. No threshold in a
  criterion, no "correctly", no agent or model name.
- **Indicators** `IND-nn`: Measure is a bench measure (`duration_seconds`, `tokens_total`, `usd`,
  `tool_calls`, `human_inputs`, `pass_rate`; with a decision model `decision_defaulted_rate`, a share
  from 0 to 1 — `0.2`, not `20` —, and `decision_confidence_min`) or a judge (`judge:J-nn`), a bare
  numeric threshold, a direction, a level. A threshold the need does not state is one of the six
  questions, or an assumption. The decision measures belong here, not in a criterion.
- **Invariants**: from `references/testing/invariants-catalog.md` with the same id — always `INV-FS`,
  `INV-SECRETS`, `INV-TOOLS`, `INV-BUDGET`; `INV-INJECTION` for untrusted inputs; `INV-RESUME`,
  `INV-INCR`, `INV-IDEMP` for resume, incremental, state; `INV-SCHEMA` for a schema; `INV-EMAIL` when
  mail can be sent; the team's own as `INV-01`…. The bench evaluates them from the run archive.
- **Datasets**: one row per dataset a criterion names, lower-case with hyphens, origin, size, cases,
  ids served; an `adversarial` set whenever `INV-INJECTION`; two successive sets when incremental.
- **LLM targets**: `stub` for `L2`, `machine` for `L3`, a named profile for `L4` or no `remote` row.
  `#### Decision model`, optional: the provider of question 4 (`none` keeps the row of the template), its
  base URL, model and key variable; deleted when the need holds no closed choice. With a provider, a
  criterion at `L2` proves the team works on the fallback (a stub run has no decision model), one at
  `L3` that the decision model answers, and an indicator may bound `decision_defaulted_rate` (`<=`, the
  share answered from the fallback) or `decision_confidence_min` (`>=`). A preset of question 4 is named in the
  table's `Used for` (`agent reader: profile guarded`); never without a provider — an agent naming a decision
  profile then fails at its first call (`decision-profiles.md` § 1).
- **Judges** `J-nn`: only where no deterministic oracle exists; rubric `tests/<slug>/judges/<name>.md`;
  the threshold is the indicator that names the judge. A judge on the wrong side of it blocks the
  verdict like a red indicator (D97): a threshold the team cannot reach is a blocked team, so set it
  from the need, not as a wish. **Budget**: local minutes, remote USD per
  attempt (2.00 by default; `0` with no remote run).
- Write `tests/<slug>/bench.config.json` from `.claude/templates/bench.config.json`: `profiles`
  (`machine` as is; a named profile with `baseUrl`, `model`, `keyEnv`, `timeoutSeconds`, `price`
  `{input_per_million, output_per_million}` for the estimate — never a key); `levels.e2e_local`
  (`profile`, `repeat`, `pass_at`), `levels.e2e_remote` only when `L4` is planned; `budget`; `retention`;
  with a decision model, `decision` `{provider, base_url?, model?, key_env?, price_per_call?}` at the top
  or per level (`null` turns it off there), only L3 and L4 runs receive it; `price_per_call` for a hosted
  provider at L4, or `estimate` refuses (exit 2). A preset goes, with the same provider, into
  `settings/<slug>/appsettings.json` (`Orkeon:Decision:Provider`, its section, `Orkeon:Decision:Profiles`; the key by
  its variable name only, `decision-profiles.md` § 3): the bench block carries no profile.

### 5. Write `## Design`

Load first, by section (`python3 .claude/scripts/code-map.py show <file> "<heading>"`):
`references/orkeon/orkeon-reference.md` "2. Orchestration" "3. Agents" "4. Tasks" "5. Tool catalogue"
"9. Known pitfalls"; `references/design/team-patterns.md`, `tools-selection.md`; the format's schema
(`yaml-schema.md`, `typescript-dsl.md` with `references/typescript/clean-architecture-ddd.md`, or
`csharp-tools.md`); `references/design/sizing-and-cost.md`; the `reliability/` pages the need reaches
(resume, incremental, security, error handling). **Nothing absent from `references/orkeon/` enters the
design**: tool names from the catalogue, never from memory.

Then, each H3 with its reason: Format (YAML by default; TypeScript for custom tools; C# takes the team
out of Studio's launch button — say so); Process (`sequential` unless the need calls for another, which
then needs a criterion on a failed task); Agents (2 to 5, catalogue tools in back-ticks, the bare
minimum, `maxIter` justified; the agent that reads untrusted mail never holds `email_send`); Tasks and
DAG (every task whose result is read is a dependency; the mermaid drawn from the table, no `{{…}}`
node; a decision task, only with a `#### Decision model` and only for a closed choice, goes in the
decision table — no agent, a name, a fallback, the gated task's `when:`; under `sequential`, `parallel`
or `graph` only); Tools (a custom tool only for deterministic work, pure TypeScript or C#); Mounts (the settled
rows of `§ Need`, unchanged); Deliverables (under an `rw`/`rwnd` point, a schema for every structured
file); Resume (where the registry lives, its key, the idempotent units; `None.` only without
`INV-RESUME`/`INV-INCR`/`INV-IDEMP`); LLM profile (no model pinned in the crew); Risks (§ 9 of the
reference, each with its mitigation).

### 6. Write `## Plan`

`B1`, `B2`… in build order (not `L…`): typically `B1` the team folder and the deterministic tools,
`B2` agents and tasks, `B3` deliverables and schemas, `B4` resume and incremental, `B5` hardening —
fewer for a small team, one for a tiny one. Every active AC and every INV is covered by a batch. The
first batch creates the team folder (D35): `mounts.json` from `§ Mounts`, the crew through
`/orkeon-crew --format <format> --into teams/<slug>`, then `orkeon-bench scaffold <slug>`; a team
settings file is a step "(main thread)". One `### B<n>` sheet per batch — Intent · Design decisions ·
Steps (`TESTS ☐ · BUILD ☐ · L0/L1 ☐`, left unticked here) · Anchors (every file by its path from the
workshop root, and the tests that observe it, as `.claude/rules/team-tests.md` names them) · Assumptions.
Then `### Order and dependencies`.

### 7. Check and submit the gate

1. `orkeon-bench check team <slug>` must end with no error (exit 0): headings, ids, coverage, tool
   names, dependencies, mount points, sheets, anchors, `bench.config.json`. Fix and rerun; a warning is
   fixed or explained. `orkeon-bench profile <slug> <name> --json` for each target: `remote` is true
   exactly for the targets the plan calls remote.
2. Walk `references/process/checklists/spec.md` box by box, on evidence.
3. `STATUS.md`: `next_action: /team-approve team <slug>`, `updated_at`, journal `- YYYY-MM-DD HH:MM —
   /team-spec — TEAM.md complete (<n> AC, <n> IND, <n> INV, <n> batches)`.
4. Show the user: the path; the criteria with their level, the thresholds, the budget, the format, the
   mode, the agents and their tools, the batches; the assumptions `Hn` they settle now; the warnings
   that stand. They validate by typing `/team-approve team <slug>`, amend by answering, or refuse. When
   they amend, put `next_action: /team-spec <slug>` back first, then submit again.

### 8. Pausing

`STATUS.md`: `next_action: /team-spec <slug>`, `updated_at`, journal `- … — /team-spec — paused at
<section> (<n> sections filled)`; say how to resume.

Talk in the user's language; write the prose of `TEAM.md` in English, or in the workshop's language when
one is set (`.claude/rules/workbook.md` § "Tone and language"); headings, ids, table headers, fixed words
stay as the template has them.

## Done when

`check team` is green, the journal holds the `TEAM.md complete` line and `next_action` reads
`/team-approve team <slug>`. The gate is the user's.
