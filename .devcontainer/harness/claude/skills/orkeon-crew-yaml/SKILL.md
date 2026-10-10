---
name: orkeon-crew-yaml
description: "Creates an Orkeon agent team described in YAML (crew/config.yaml + one file per agent and per task) in a folder that Orkeon Studio can run directly: the team's own mount points (mounts.json) and, generated from them, the run.sh/run.cmd launchers, the studio-team.json card and the folders; README; validation with `orkeon run --validate`. Use this skill when the user asks to create, generate, scaffold or design an agent team, a crew, a team or Orkeon agents in YAML, or a team to launch in Orkeon Studio without specifying TypeScript — even if they simply say 'make me an agent team that …'."
argument-hint: "[team need] [target folder, default teams/<slug> of the workshop]"
---

# Create an Orkeon agent team in YAML, ready for Orkeon Studio

You design, then generate a **team folder** that Orkeon Studio opens and launches without any edit,
and that `orkeon run` also runs in a terminal. You work autonomously: if something is missing, you
pick a sensible default, you flag it in your report, and you ask a question only if the need
itself is incomprehensible.

Need: $ARGUMENTS

## 1. Load the references (mandatory, before any design)

Read these three files, in the workshop's `references/orkeon/` folder (paths relative to the
workshop root — `$ORKEON_WORKSHOP`, `/workspace` in the container — where Claude Code runs):
- `references/orkeon/orkeon-reference.md` — orchestration modes, agents, tasks, **tool catalogue**, VFS, LLM, pitfalls;
- `references/orkeon/yaml-schema.md` — the exact YAML keys accepted by the loader;
- `references/orkeon/studio-layout.md` — the layout Studio recognizes and its hard rules.

Do not invent any key, tool name or `process` value that is absent from these files.

## 2. Scope

Determine, from the need:
- A readable **title** and an ASCII kebab-case **slug** (`tech-watch`).
- **Target folder**: the one given by the user, otherwise `teams/<slug>/` of the workshop. If it already
  exists and is not empty, overwrite nothing: create `<slug>-2`, and say so (once `/team-build` drives
  this skill, lot 6, it writes the batch into the existing team folder instead, D34). The team folder holds only
  what Studio runs; the workbook and the tests of the team, when the process makes them, live in
  `workbooks/<slug>/` and `tests/<slug>/` next to `teams/` (D29).
- **Inputs**: what the team reads — files, web, e-mail, database…
- **Mount points** — the folders the agents see, free in name and number (D27). In this order:
  1. the points the user names ("read the mails of…", "write the digests to…");
  2. otherwise the `## Mounts` table of the team's `workbooks/<slug>/NEED.md` or `DESIGN.md`, when the
     process has produced one;
  3. otherwise derive them from what the team reads and writes — one point per kind of content, named
     after it: `/mailbox` (ro) for the mails to triage, `/invoices` (ro), `/reports` (rw)…; add a
     `/state` (rw) only if the team resumes or processes incrementally;
  4. only when the need says nothing about its files, propose a scheme: one of the user's in
     `library/mount-schemes/`, otherwise the generic scheme `.claude/templates/mounts.json`
     (`/workspace` read, `/output` written) — and say in the report that it is a proposal.

  Access: `ro` for what the team only reads, `rw` for what it writes, `rwnd` for writes that must never
  delete. Never `/crew`, `/script`, `/llm-logs`, `/sandbox`, `/credentials` (the runner's). The folder of
  a point in the team: `./input` for `/workspace`, `./<name>` otherwise (Orkeon Studio's convention).
  The folder behind a point is all its agents reach: never the team folder itself (`.`), `crew/`, or a
  folder named `appsettings` or `_shared` (Orkeon
  looks for settings there) at the root of the team; outside the team, never a folder that holds the team
  folder, the workshop or the home folder, or that is or lies inside the workshop's `settings/`,
  `workbooks/`, `tests/`, `.claude/`, `library/`, `references/`, `.devcontainer/` or `.git/`, an
  `appsettings/` or `_shared/` folder above the team, a hidden folder of the home folder (`~/.config`,
  `~/.claude`, `~/.ssh`…), the user's `AppData`, `/proc`, or another team's folder or mount set — nor
  their Windows spellings (`C:\Users\<you>\Orkeon\settings`…). `orkeon-bench scaffold` and the static
  check of § 5 refuse them, judging paths as written (a symbolic link is not followed), and refuse a
  folder name ending with a dot or a space, which Windows drops (`./crew.` is `crew/` there). A `/plugins`
  point is read-only. Any other folder outside the team works for the launchers, but Studio launches the
  team only once that folder is declared, spelled exactly, in its Authorized folders: prefer the team's
  own folders, or a mount set (D28).
- **Deliverable**: the file the team produces (often a `.md`), under one of its writable mount points,
  its format and its structure.
- **External prerequisites**: keys (`ORKEON_TAVILY_API_KEY` for `web_search`, `BRAVE_API_KEY` for
  `brave_search`), e-mail account, connection string… To be listed in the README, never written to disk.

## 3. Design the team

1. **Mode**: `sequential` by default; another one only if the need calls for it (table in § 2 of the reference).
2. **Agents** (2 to 5): a short id (`researcher`, `writer`), a concrete, domain-specific `role`, `goal`
   and `backstory` — they are the prompts. Tools: **only** names from the § 5 catalogue,
   the bare minimum per agent, never `ask_question_to_coworker`/`delegate_work_to_coworker`
   (automatic). `allowDelegation: false` except in `hierarchical`/`autonomous` mode or an explicit need.
   An agent's `llm:` (temperature, thinking, response format) and `guardrails:` are applied, the agent's
   rules before each task's; never a `model` or a `profile` without a decision (`DEC-…`). The model comes
   from the team's settings file `settings/<slug>/appsettings.json` under the launchers, else the machine
   settings or `ORKEON_Llm__*`; in Studio, from the same team settings file for a team right under its
   teams root, else from Studio's settings — under the card's model setting when it names one (D33). A
   `maxRpm` (agent or crew) is applied — the request of too many waits —: none unless the design asks.
3. **Tasks**: one per step; a precise `description` that names the virtual paths and the tools to
   use; an `expectedOutput` that sets shape and length; `agent`; `dependencies` for the ordering (every
   earlier output reaches the task anyway, 8,000 characters in all: keep outputs short). Per-task model
   settings go in its `llmOverride`, input-handling rules in its `guardrails` (or the agent's); a tool only
   one task needs may go on that task, which adds it to the agent for that task alone.
   The final task carries the `deliverable` (`source: final_message`, `path: <writable mount point>/<file>`).
   In `consensual`, three agents or more (two always tie); every agent runs every task. In `hierarchical`,
   add the coordinator agent and `managerAgent` (mandatory). A `structured_output` deliverable requires `schemaInline` or `schemaPath`.
4. Review the design against the **pitfalls** table (§ 9 of the reference).

## 4. Generate the folder

Start from the templates in `templates/` (replace every `{{…}}`, remove unneeded comments):

```
<team>/
├── mounts.json                   ← the mount points of § 2 (the shape of .claude/templates/mounts.json)
├── crew/config.yaml              ← templates/crew/config.yaml
├── crew/agents/<id>.yaml         ← templates/crew/agents/AGENT_ID.yaml   (one per agent)
├── crew/tasks/<id>.yaml          ← templates/crew/tasks/TASK_ID.yaml     (one per task)
├── studio-team.json              ← templates/studio-team.json            (its mounts: written by scaffold)
├── README.md                     ← templates/README.md
├── run.sh, run.cmd               ← written by orkeon-bench scaffold
└── <a folder per mount point>    ← created by orkeon-bench scaffold; example inputs, when the user supplies
                                    none, go into a read-only one as *.example.md
```

Then, from the workshop root, let the bench write what derives from the mount points:

```bash
orkeon-bench scaffold <slug>      # run.sh, run.cmd, the mounts of studio-team.json, the folders
```

Run it again after any change of `mounts.json`, and never write the launchers by hand: they bind
every mount point, and `TEAM_ENV=<name> ./run.sh` runs the team on the mount set
`mounts.<name>/<slug>/` of the workshop instead of its own folders.

Common template variables:

| Variable | Value |
|---|---|
| `{{TEAM_TITLE}}` / `{{TEAM_SLUG}}` | readable title / kebab-case slug |
| `{{TEAM_DESCRIPTION}}` | the need in one or two sentences, in the user's words (escape `"` in the JSON) |
| `{{TEAM_DIR}}` | name of the team folder (not the absolute path) |
| `{{AGENT_ROWS}}` / `{{TASK_ROWS}}` | one Markdown table row per agent (`id` · role · tools) / per task (`id` · agent · dependencies · deliverable or "—") |
| `{{MOUNT_ROWS}}` | one Markdown table row per mount point (`/mailbox` · read-only · `mailbox/` · what goes there, or what comes out) |
| `{{INPUT_HINT}}` | the files expected in the read-only folders and their format (and, if there are `*.example.md` files, that they must be deleted before a real run), or "No input: the team starts from the web." |
| `{{DELIVERABLE_PATH}}` | the virtual path of the deliverable, under a writable mount point (`/reports/digest.md`) |
| `{{DELIVERABLE_HINT}}` | ` (<file>)` (starts with a space), or empty |
| `{{PREREQUISITES}}` | the required keys and accounts (§ 2), or empty |
| `{{TREE}}` | the tree actually generated |

The other variables are named after the field they fill. `{{TOOLS}}` and `{{DEPENDENCIES}}`: comma-separated
ids (`web_search, file_read`). `{{BACKSTORY}}` and `{{DESCRIPTION}}` sit under a `|` block:
every line indented by two spaces.

- Remove `dependencies: []` and the `deliverable` block from the tasks that have none.
- Fixed data shipped with the team goes in `crew/` and is read as `/crew/<file>`.
- **No** `*.ork.ts`/`*.ork.js` file in the folder, no `agents.yaml`/`tasks.yaml`, no `appsettings*.json`:
  settings of the team's own (a mailbox, another model) go to `settings/<slug>/appsettings.json` of the
  workshop, with their `Llm` section (D33, the studio layout reference); never a key in plain text, nor
  mount points, allowed folders or a mail `CredentialsDirectory` (`Orkeon:FileSystem:Mounts`,
  `PathSecurity:AdditionalAllowedDirectories`): what the agents reach is declared in `mounts.json`.
- YAML strings containing `:`, `#` or `"`: in a `|` block (description, backstory) or in single quotes.

## 5. Verify (never skip this step)

Two checks, **both** must pass; fix and rerun until green.

**a. Static check** — what `--validate` silently lets through (unknown keys, out-of-list values,
Studio layout, a deliverable outside the
writable mount points, folders, card and launchers that disagree with `mounts.json`, a mount point whose
folder its agents must not reach, a team settings file holding a key or mount points, `shell_command`
beside a mail account, and the team as Orkeon Studio reads it when `orkeon-studio-check` is installed):

```bash
python3 <skill folder>/scripts/check_crew.py <team> [--orkeon <orkeon binary>]
```

Expected: `OK: N agent(s), M task(s), 0 error(s), …`. With `--orkeon`, the tool catalogue is read from
the binary; without it, the script uses its embedded catalogue. Handle the `WARNING`s too.

**b. Real load** — find the binary, in this order: `command -v orkeon`; `$ORKEON_CLI_DIR/orkeon`;
in a checkout of the Orkeon repository, the most recent of `src/scripting/Orkeon.Scripting.Cli/bin/{Debug,Release}/net10.0/orkeon`
(otherwise `dotnet build src/scripting/Orkeon.Scripting.Cli/Orkeon.Scripting.Cli.csproj --no-restore`). Then:

```bash
cd <team> && PATH="<binary folder>:$PATH" ./run.sh --validate
```

Expected (after a `Using settings: …` line): `VALIDATION OK: … (agents=N, tasks=M, tools resolved=K)`.
Neither check verifies the external keys: a tool that depends on one will fail at run time if
the key is missing — hence the list of prerequisites in the README.

If no binary is available, check **a** remains mandatory; say clearly that **b** could not
be done.

Do **not** run the team for real (paid LLM calls) unless the user asks for it.

## 6. Report back

Reply in the user's language, briefly:
- the folder path and its tree;
- the agents / tasks / tools table and the chosen mode (with the reason if it is not `sequential`);
- the mount points and where they come from (the user, the need, or a proposed scheme);
- the defaults you chose on the user's behalf;
- the prerequisites (keys, e-mail account…) — a key or a password is named, never asked for: the user
  gives it as `references/process/hand-over.md` § 5 says (`/exit`, then `workshop --secret <NAME>`) — and
  the result of the two checks (`check_crew.py`, `--validate`);
- how to launch, said with where it is typed (HARNESS.md rule 10): Studio (select the team in "My teams");
  or you run it for them on the local model when they ask (free, rule 1); or, typed by themselves after
  `/exit` in the terminal of the container, `sh /workspace/teams/<slug>/run.sh`, and
  `TEAM_ENV=<name> sh /workspace/teams/<slug>/run.sh` for a mount set, then `workshop` to come back;
- that Studio lists the team once its teams folder is the workshop's `teams/` (`ORKEON_STUDIO_TEAMS_ROOT`,
  `--teams-root` or Settings › Studio when the workshop is not `%USERPROFILE%\Orkeon`), and then passes
  `settings/<slug>/appsettings.json` on its own; a team launched from another folder runs on Studio's
  settings, without the mailbox or the model set there;
- that the team is a prototype unless the method produced it: no need, test or record proves it yet —
  the method brings it under tests (`/team-init --adopt <slug>`, D34).
