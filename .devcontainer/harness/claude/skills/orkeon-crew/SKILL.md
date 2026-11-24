---
name: orkeon-crew
description: "Creates or rewrites an Orkeon agent team in a folder that Orkeon Studio runs directly, in YAML (crew/config.yaml, one file per agent and per task) or in TypeScript (declarative crew/crew.ork.ts plus custom tools): the team's mount points (mounts.json), the launchers, the Studio card and the folders generated from them, the README, the static check and `orkeon run --validate`. Use it when the user asks to create, generate, scaffold or design an agent team, a crew or Orkeon agents — even if they simply say 'make me an agent team that …' — and when /team-build drives a batch into an existing team folder."
argument-hint: "[--format yaml|ts] [--into teams/<slug>] [team need]"
---

# /orkeon-crew — an Orkeon agent team, ready for Orkeon Studio

You design, then generate a **team folder** that Orkeon Studio opens and launches without any edit,
and that `orkeon run` also runs in a terminal. You work autonomously: a missing detail gets a sensible
default, flagged in your report; a question only when the need itself is incomprehensible.

Arguments: $ARGUMENTS

## Contract

- Inputs: the need (the arguments, or `workbooks/<slug>/TEAM.md` when `--into` names a team of the
  method: its `## Design` is the design, its `## Plan` batch sheet is the scope — design nothing again).
- `--format yaml` (default) or `--format ts`: TypeScript only when the team needs custom tools or
  build-time logic; a team of the method takes the format its `## Design § Format and rationale` states.
- `--into teams/<slug>`: write into that folder, existing files of the batch's anchors overwritten,
  nothing else touched (D34). Without it: `teams/<slug>/` from the need; when it exists and is not
  empty, create `<slug>-2` and say so.
- Output: the folder of § 4, `check_crew.py`/`check_team.py` green, `./run.sh --validate` green when
  `orkeon` is available; the report of § 6. No real run unless the user asks (paid calls).

## 1. Load the references — before any design

In the workshop's `references/orkeon/` (`$ORKEON_WORKSHOP`, `/workspace` in the container):

- `orkeon-reference.md` — orchestration modes, agents, tasks, the **tool catalogue** (§ 5: the one
  copy; `check_crew.py` and `check_team.py` read their catalogue from it), VFS, LLM, pitfalls (§ 9);
- `yaml-schema.md` (YAML) or `typescript-dsl.md` (TS: builders, the declarative shape, `toolBuilder`,
  what the DSL does not expose);
- `studio-layout.md` — the layout Studio recognizes, and **`## Mount points`**, the one copy of the
  mount-point rule (names, access, the folder of the team, what a point may never reach);
- `decision-profiles.md` — only when `TEAM.md` names a decision model and a preset.

Do not invent any key, builder method, tool name or `process` value absent from these files. A TS
team that needs guardrails, a task's own temperature, a `graph:` block or a `memoryProvider` (YAML only)
is written in YAML: say so.

## 2. Scope

From the need, or from `TEAM.md`:

- a readable **title** and an ASCII kebab-case **slug**; the target folder (Contract above). The team
  folder holds only what Studio runs; the workbook and the tests live in `workbooks/<slug>/` and
  `tests/<slug>/` (D29);
- **inputs** (files, web, e-mail, database…) and the **deliverable**: the file the team produces, under
  a writable mount point, its format and structure;
- **mount points** (D27), in this order: the points the user names; the `### Mounts` table of
  `TEAM.md § Need` or `§ Design`; else one point per kind of content the team reads or writes, named
  after it (`/mailbox` ro, `/reports` rw, `/registry` rw only when the team resumes or is incremental —
  not `/state` nor `/runs`, the runner's own roots, which `orkeon run` refuses as a mount);
  only when the need names no folder, a scheme — one of `library/mount-schemes/`, else
  `.claude/templates/mounts.json` — said to be a proposal. Access `ro` | `rw` | `rwnd`. Everything
  else — reserved points, the folder of the team, the folders a point may never reach, mount sets —
  is `studio-layout.md#mount-points`: apply it, do not restate it;
- **custom tools** (TS only): deterministic work the model would do badly or expensively (scoring,
  normalization, extraction, aggregates), no I/O inside; none needed, none written;
- **external prerequisites**: keys (`ORKEON_TAVILY_API_KEY` for `web_search`, `BRAVE_API_KEY` for
  `brave_search`), e-mail account, connection string — listed in the README, never written to disk.

## 3. Design the team

1. **Mode**: `sequential` by default; another only when the need calls for it (`orkeon-reference.md` § 2).
2. **Agents** (2 to 5): a short id, a concrete, domain-specific `role`, `goal`, `backstory` — they are
   the prompts. Tools: **only** catalogue names, the bare minimum per agent; the coworker tools are
   automatic, never listed. Delegation off except in `hierarchical`/`autonomous` or an explicit need.
   No `model` or `profile` without a decision (`DEC-…`): the model comes from
   `settings/<slug>/appsettings.json` under the launchers, else the machine settings or `ORKEON_Llm__*`;
   in Studio, from the same team settings file for a team right under its teams root, else Studio's
   settings (D33). `maxRpm`, `maxExecutionTime`, an agent's `llm`/`guardrails` (YAML) or `.llm(…)`
   (TS, an `LlmConfig` only): only when the design asks.
3. **Tasks**: one per step; a `description` that names the virtual paths and the tools; an
   `expectedOutput` that sets shape and length; the agent; the dependencies (YAML `dependencies`, TS
   `.withContext(…)`) — every earlier output reaches the task anyway, 8,000 characters in all: keep
   outputs short. The final task carries the `deliverable` (`source: final_message`, path under a
   writable mount point); `structured_output` needs a schema. `consensual`: three agents or more.
   `hierarchical`: the coordinator agent and `managerAgent` (YAML) / `.manager(…)` (TS), mandatory.
   **A decision task** (D96) only when `TEAM.md` has a `#### Decision model` and the decision table of
   `§ Design § Tasks and DAG` a row for a closed choice (a classification, a route, a yes/no gate),
   not an open answer: `tasks/<id>.decision.yaml` renamed to `tasks/<id>.yaml`, or the commented block
   of `crew.ork.ts`. No agent, a name (the file name in YAML, `.name()` in TS), a `fallback` answering
   every question (else an `otherwise` task), options and answers as strings (`"yes"`, quoted); the gated
   task carries one `when:` (`.when("<id>", {…})`). Only under `sequential`, `parallel` or `graph`; the
   crew keeps one agent at least; no `expectedOutput` needed (Orkeon 1.4.0). With no decision model (no provider,
   every stub run) the fallback answers: the team must work so. The crew's decision mode (1.4.0, `decision: { mode }`)
   stays unset, or `optional` when an agent should answer instead of a fixed fallback: then every decision task carries
   `without: { agent: <id> }` and no `fallback`. Not `required` (every run without a provider is refused), nor
   `system_one_decide` (withheld, the run refused) — `check_crew.py` refuses both (D96).
   **A decision profile** in front of an agent only when `TEAM.md`'s `#### Decision model` names a provider
   and a preset (`references/orkeon/decision-profiles.md`): the agent names it (YAML `llm: { profile: guarded }`,
   TS `.llm(llm.profile("guarded"))`), and the preset's block, the provider's section and
   `Orkeon:Decision:Provider` go into `settings/<slug>/appsettings.json` — the key by its variable name only, not its
   value. With no provider the profile takes no decision: its calls go to its target, unguarded (Orkeon 1.4.0). The
   same holds for `profile: auto`, `effort: auto`, `skills: { auto: true }` (`yaml-schema.md` § agent): circuit off,
   they pick nothing — give `skills` a fallback list. A guard judges
   the task's whole prompt: keep a guarded task's description short, its inputs in files.
4. Review against the **pitfalls** (`orkeon-reference.md` § 9) and, in TS, the DSL's common errors.

## 4. Generate the folder

Templates: `templates/yaml/` or `templates/typescript/` of this skill (replace every `{{…}}`,
duplicate the agent/task/tool blocks as needed, remove unneeded comments, empty lists, `dependencies:
[]`, a `deliverable` on a task that has none, `.withContext(…)` on a root task, the decision template
and block when the design has no decision task).

```
<team>/
├── mounts.json                 ← the mount points of § 2 (shape of .claude/templates/mounts.json)
├── crew/                       ← YAML: config.yaml, agents/<id>.yaml, tasks/<id>.yaml
│                                  TS:   crew.ork.ts (EXACT name), tools/index.ts and *.ts when custom tools
├── team.json                   ← its mounts: written by scaffold
├── README.md
├── tsconfig.json, typings/orkeon.d.ts     ← TS only (typings copied when found, § 5)
├── run.sh, run.cmd             ← written by orkeon-bench scaffold
└── <a folder per mount point>  ← created by scaffold; example inputs as *.example.md in a read-only one
```

Then, from the workshop root — and again after any change of `mounts.json`, never by hand:

```bash
orkeon-bench scaffold <slug>      # run.sh, run.cmd, the mounts of team.json, the folders
```

Template variables: `{{TEAM_TITLE}}`, `{{TEAM_SLUG}}`, `{{TEAM_DESCRIPTION}}` (the need in one or two
sentences, `"` escaped in JSON), `{{TEAM_DIR}}`, `{{AGENT_ROWS}}`/`{{TASK_ROWS}}`/`{{MOUNT_ROWS}}` (one
Markdown row each), `{{INPUT_HINT}}`, `{{DELIVERABLE_PATH}}`, `{{DELIVERABLE_HINT}}`, `{{PREREQUISITES}}`,
`{{TREE}}`; the others are named after the field they fill. YAML: `{{TOOLS}}`, `{{DEPENDENCIES}}`
comma-separated ids; `{{BACKSTORY}}`, `{{DESCRIPTION}}` under a `|` block, two-space indented; strings
with `:`, `#`, `"` in a block or single quotes. TS: `{{TOOLS}}`, `{{CUSTOM_TOOLS}}` quoted names;
`{{AGENT_VAR}}`/`{{TASK_VAR}}`/`{{TOOL_VAR}}` camelCase identifiers; escape `` ` `` and `${` in
template literals; last line `globalThis.crew = crew;`.

Rules of the folder: no crew YAML in a TS team and no `*.ork.ts` in a YAML team; no
`agents.yaml`/`tasks.yaml`; no `appsettings*.json` — the team's own settings go to
`settings/<slug>/appsettings.json` of the workshop with their `Llm` section (D33), never a key, mount
points, allowed folders or a mail `CredentialsDirectory`; fixed data shipped with the team goes in
`crew/` and is read as `/crew/<file>` (YAML) or `/script/<file>` (TS).

## 5. Verify — never skipped

Every check that can run must pass; fix and rerun until green.

**a. Static check** — what `--validate` lets through (Studio layout, a deliverable outside the writable
mount points, folders, card and launchers that disagree with `mounts.json`, a mount point whose folder
its agents must not reach, a settings file holding a key or mount points, `shell_command` beside a mail
account, unknown or unavailable tools; TS: Node API, a `.llm()` given a string, an undefined profile;
and the team as Orkeon Studio reads it when `orkeon-studio-check` is installed):

```bash
python3 .claude/skills/orkeon-crew/scripts/check_crew.py <team> [--orkeon <binary>]   # YAML
python3 .claude/skills/orkeon-crew/scripts/check_team.py <team> [--orkeon <binary>]   # TS
```

Expected: `OK: … 0 error(s), …`. Without `--orkeon` the catalogue is the reference's § 5. Handle the
`WARNING`s too.

**b. Types (TS)** — copy `orkeon.d.ts` into `<team>/typings/`: in the image
`/usr/local/share/orkeon/typings/orkeon.d.ts`; in a checkout of Orkeon, the most recent
`src/scripting/Orkeon.Scripting/bin/{Debug,Release}/net10.0/dist/orkeon.d.ts`. Then `tsc -p <team>`
(`tools/scripting-typecheck/node_modules/.bin/tsc` of the checkout, else `npx --no-install tsc`): zero
errors. Typings or `tsc` not found: no `typings/`, and say so.

**c. Real load** — the binary: `command -v orkeon`; `$ORKEON_CLI_DIR/orkeon`; in a checkout, the most
recent `src/scripting/Orkeon.Scripting.Cli/bin/{Debug,Release}/net10.0/orkeon` (else `dotnet build` it,
detached, as `/orkeon-update` says). Then:

```bash
cd <team> && PATH="<binary folder>:$PATH" ./run.sh --validate
```

Expected, after `Using settings: …`: `VALIDATION OK: … (agents=N, tasks=M, tools resolved=K, decision=<mode>)`. No check
verifies the external keys. No binary: **a** stays mandatory; say that **c** could not be done.

## 6. Report

In the user's language, briefly: the folder and its tree; the agents / tasks / tools table and the mode
(with the reason when not `sequential`); the mount points and where they come from; the defaults chosen
for the user; the prerequisites (a key is named, never asked for: `references/process/hand-over.md`
§ 5) and the result of each check; how to launch (HARNESS.md rule 10: Studio "My teams"; or you, on the
local model, when asked; or after `/exit`, `sh /workspace/teams/<slug>/run.sh`, `TEAM_ENV=<name>` for a
mount set, then `workshop` to come back); that Studio lists the team once its teams folder is the
workshop's `teams/`; and, outside the method, that the team is a prototype nothing proves yet —
`/team-init --adopt <slug>` brings it under tests (D34). Under `/team-build`, answer that skill's
contract instead: the files written, the checks and their exit codes.
