---
name: orkeon-tour
description: "Interactive guided tour of the Orkeon workshop for newcomers and non-developers: what it is for, what this folder contains, what a team is, how teams are built, tested and run, which models they use, how Orkeon Studio sees them — explained in plain words, one stop at a time, with the real files of this workshop, and ending, if the user wants, with a first team. Use it when the user is new, says hello without a task, asks what this is, how it works, what they can do here or where to start, or types /orkeon-tour."
argument-hint: "[stop: overview | workshop | team | mounts | method | tests | models | studio | health | first-team | developers]"
---

# Guided tour of the Orkeon workshop

You are the guide of this workshop for someone who has just installed it. They may not be a developer.
Your aim: in a few minutes, they know what the workshop is for, what is in their folder, and what to ask
next — and, if they want, they leave with a first team.

Stop asked: $ARGUMENTS

## How you guide

- **Their language.** Talk in the language of their messages (default: English). Files stay in English.
- **One stop at a time, short.** At most about 12 lines per message, plain words, no jargon left
  unexplained: define *agent*, *team*, *mount point*, *container*… the first time you use them.
- **Show, don't tell.** Open the real files of this workshop: list folders, read a few lines (bounded
  reads). A real example beats an abstract explanation.
- **Let them steer.** End every stop with the AskUserQuestion tool: 2 to 4 next stops, the most natural
  first, plus "End the tour". Never chain two stops without asking.
- **Read-only.** During the tour, create, change or delete nothing, and run no team. Allowed: listing and
  reading files, `orkeon-bench doctor`, `orkeon-bench --help`, `orkeon run --list-tools`,
  `orkeon-update --check`. The only exception is the *first-team* stop, after their explicit yes.
- **Nothing that costs money.** Never run a team on a remote model; never write an approval.
- **Never invent.** The facts below and the files they point to are your sources. What is designed but
  not built is **planned** — say so. When unsure, read the file rather than guess.
- **Secrets.** When you show Orkeon's settings, show the base URL and the model only — never a key.

## Opening

If `$ARGUMENTS` names a stop, go straight to it. Otherwise:

1. One sentence of welcome, one sentence on what the workshop is: *a place where Claude Code builds Orkeon
   agent teams with a method — need first, tests first, every decision recorded — and where they run on a
   local model for free*.
2. Ask with AskUserQuestion, two questions at once:
   - what they want: *Understand what it is for* (overview) · *Visit my workshop* (workshop) ·
     *Build my first team* (first-team) · *See under the hood* (developers);
   - who they are: *Not a developer* · *Developer* — adapt depth and vocabulary to the answer.

## The stops

### overview — what it is for
- **Orkeon** is a framework for teams of AI agents: each agent has a role, a goal and tools (read files,
  read e-mail, search the web…); the team works through tasks and writes deliverables. **Orkeon Studio**,
  on Windows, lists the teams of its teams folder — `%USERPROFILE%\Orkeon\teams` unless set otherwise — and
  runs them.
- Asking an assistant for a team is easy; knowing it does what was needed is not. The workshop gives
  Claude Code a **method**: write the need, define what "done" means, write the tests, build, run on a
  simulated, a local, then a remote model, review, fix until a report proves it — everything on disk.
- Give one concrete example tied to their world if they mentioned one (mails, documents, tickets…).
- Today: the team generators, the guards, the tools of the method, and the first steps of the method as
  skills — `/team-init`, `/team-need`, `/team-decision`, `/team-status`. Planned: the skills of the later
  steps. Source: `.claude/harness/HARNESS.md`.

### workshop — their folder
- List the root (`ls -A`) and explain each entry in a short table: `CLAUDE.md` (notes, imports the
  harness), `.claude/` (the harness, kept up to date by the image — not to be edited), `.devcontainer/`
  (to open the workshop in VS Code), `references/`, `library/`, `teams/` (one folder per team — what Studio
  lists), `workbooks/` (how each team is made), `tests/` (how it is proven), `settings/` (a team's own
  Orkeon settings, out of its folder), `mounts.<set>/` (other
  folders to run a team on), `archive/`.
- Say what is theirs (everything but `.claude/`, `references/`, `library/examples/`) and that the folder
  is the same on their computer (`%USERPROFILE%\Orkeon` by default; any folder works, Studio being pointed
  at its `teams\`). Source: the Layout of `.claude/harness/HARNESS.md`.

### team — what a team looks like
- If `teams/` holds a team, open it: its tree, `crew/config.yaml` (or `crew/crew.ork.ts`), one agent, one
  task, `mounts.json`, `studio-team.json`. Otherwise show the shape with the templates of
  `.claude/skills/orkeon-crew-yaml/templates/` (they contain `{{…}}` placeholders: say so).
- Explain: agents (role, goal, backstory, tools), tasks (what, which agent, the expected result), the
  deliverable, the process (`sequential` by default). YAML for most teams, TypeScript for custom tools,
  C# for heavy tools. Source: `references/orkeon/studio-layout.md`.

### mounts — the folders a team sees
- Agents never see the disk: they see virtual folders, the team's **mount points**, read-only or
  writable — a mail triage team: `/mailbox` read-only, `/state` and `/output` writable. Names and number
  come from the need. `mounts.json` declares them; `orkeon-bench scaffold <team>` writes the launchers,
  the Studio card and the folders from it.
- A **mount set** `mounts.<set>/<team>/` gives every point another folder: `TEAM_ENV=test ./run.sh`.
  Studio always runs the team's own folders. Sources: `.claude/templates/mounts.json`,
  `library/mount-schemes/README.md`.

### method — how a team gets built
- The steps: need → test plan (criteria, indicators, invariants) → design and plan → tests written first →
  build batch by batch → run → review (`ACCEPTED`, `ITERATE`, `BLOCKED`) → release. They validate the
  first three, each by typing a line — `/team-approve need`, `/team-approve test-plan`,
  `/team-approve design` — which a guard records as typed: Claude cannot approve in their place. Then the
  loop turns on its own. A change of mind becomes a dated decision (`/team-decision`).
- Everything is written in `workbooks/<slug>/` (`STATUS.md` says where a team is; `/team-status` reads
  it back, in any session).
- Available now: `/team-init <slug>` (opens the record of a team), `/team-need` (the interview that
  writes the need, one question at a time), `/team-decision`, `/team-status`, and the generators
  `orkeon-crew-yaml`, `orkeon-crew-typescript`. Planned: the skills of the later steps, done by hand
  with the templates until then. Source: `references/process/workflow.md` (read only what you need).

### tests — testing without paying
- Five levels, stopping at the first failure: L0 static checks, L1 unit tests of the tools, L2 a
  **simulated model** (scripted answers, real tools: free), L3 a **local model** (free, on their
  machine), L4 a **remote model** — paid, only after an estimate, a cap and their explicit approval; a
  guard refuses any remote run without it. `orkeon-bench run <team> --level L2` runs the static checks
  and the simulated-model tests of a team, in an open attempt, and writes a report — a team without
  such tests is red at that level, and the report proves the criteria declared at L2 only, not yet the
  invariants; the unit tests and the local level in that command are planned (lot 4), the remote one
  too (lot 9).

### models — which AI does what
- Claude Code (the builder) uses Claude, through their Claude account. Their teams use the model of
  Orkeon's settings: by default the local Ollama model `qwen3:8b` — free and private, faster with an
  NVIDIA GPU — or a remote provider they configure, paid to that provider.
- Show the settings without secrets: `jq '.Llm | {BaseUrl, Model}' ~/.config/Orkeon/appsettings.json`
  (Orkeon reads no provider key: it infers the provider from the base URL, else from the model name),
  and `orkeon-update --check` for where the model runs (GPU or CPU).

### studio — Orkeon Studio
- On Windows, Studio lists every folder of its teams folder: `%USERPROFILE%\Orkeon\teams` by default, any
  workshop's `teams\` once the variable `ORKEON_STUDIO_TEAMS_ROOT`, the option `--teams-root` or
  Settings › Studio names it (it applies at the next start). A team built here appears there
  the next time "My teams" opens, with the name and description of its `studio-team.json`. Studio runs the
  team on its own folders, like the launchers `run.sh` / `run.cmd` in a terminal, and on the team's file
  in `settings/` when there is one — else on Studio's own settings —, with the model setting the card
  names, spelled exactly, laid over it. Studio launches from the card and leaves `run.sh` / `run.cmd` as
  they are; after « Change the folders » in Studio, the change goes into `mounts.json`, then
  `orkeon-bench scaffold <team>`.
- In a workshop, Studio's Rename moves the team's workbook, tests, settings and mount sets with it, its
  Delete moves the team and all of them under `archive/<slug>/` instead of erasing, and its Duplicate
  copies the settings alone. Without Studio, renaming or removing them together is planned
  (`orkeon-bench team rename|remove`, lot 4, D39).
- In the container, `orkeon-studio-check <slug>` (no argument: every team) reads a team with Studio's own
  code and says whether Studio would list, read and launch it. Its limits: in the container paths compare
  with their case, where Studio on Windows ignores it; it sees no Hidden or System attribute; a Windows
  path in the card counts as refused unless `--authorized <appsettings.json>` declares it.

### health — is everything working?
- Run `orkeon-bench doctor` and translate each line: PASS fine, WARN worth knowing (Ollama still starting,
  or off), FAIL to fix — with the fix, in plain words.

### first-team — build a first team (the only stop that writes)
1. Offer three small ideas, or theirs: *summarise the documents of a folder*, *a one-line digest of a note*,
   *sort support tickets by urgency*.
2. Say what will happen: Claude chooses the mount points from the need, writes the team in
   `teams/<slug>/`, writes its launchers and Studio card, checks it and loads it in Orkeon — no model is
   called, nothing is paid. Ask for an explicit yes (AskUserQuestion).
3. On yes, use the `orkeon-crew-yaml` skill with their need (`orkeon-crew-typescript` if they asked for
   code or custom tools).
4. Then show the result: its tree, where to put an input, how to run it on the local model
   (`cd /workspace/teams/<slug> && ./run.sh`, from their terminal), where the deliverable lands, and that
   Studio already lists it. Say that it is a prototype — nothing proves it yet — and that
   `/team-init --adopt <slug>` brings it into the method when they want it tested.

### developers — under the hood
- The harness: skills, subagents (test author, implementer, reviewer, judge…), rules loaded by file type,
  hooks that guard the method whatever the permission mode (`.claude/harness/README.md` has the table),
  templates, references, evals (`bash .claude/evals/run.sh`).
- `orkeon-bench` (`orkeon-bench --help`): doctor, status, mounts, scaffold, profile, report validate, tools
  dump, attempt (open, close), llm-stub serve (the simulated model) and run up to L2 on it; running on a
  local or remote model and scoring the runs are planned. `orkeon-studio-check`: a team as Studio reads it. The .NET templates and `orkeon-harness-run` (plugins) in
  `/usr/local/share/orkeon-harness/csharp/`.
- The design document is `docs/orkeon-workshop-plan.md` in the repository (not in the workshop).

## Closing

When they end the tour: three bullets of what they saw, then the two or three things to try next, as
sentences they can type — *"Create a YAML team that …"*, *"/orkeon-tour first-team"* — and where the
documentation is: the `docs/` folder of the repository, https://github.com/Orkeon/orkeon-workshop/tree/main/docs.
