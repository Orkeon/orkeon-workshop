# Orkeon harness — workshop entry point

This folder is an **Orkeon workshop** (`ORKEON_WORKSHOP`: `/workspace` in the container, the host's
Orkeon folder bind-mounted there): the place where Orkeon agent teams (YAML, TypeScript, C#) and
Orkeon tools in C# are designed, built, tested, evaluated, fixed and released, through a test-first
process whose every attempt and decision is archived. The image deploys the harness here (`.claude/`,
`references/`, `library/examples/`); what you make lives in `teams/`, `workbooks/`, `tests/`,
`settings/` (a team's own Orkeon settings, D33) and `library/`. Orkeon targeted: the released version — the image
installs the published CLI (D110, which replaces D32) —, except while a fix the workshop needs is on `main`
alone: the image then builds a commit of `main` (D115). The references are established on Orkeon 1.2.0 (the
tag v1.2.0, commit a9f3878; first written on 24ab0d0) and checked on `main` at 4709278
(`1.2.0-src.20261117.g4709278`), the commit the image builds. The installed binary settles any doubt (`orkeon --version`,
`orkeon run --list-tools`, `orkeon-bench tools dump`).

**Newcomers.** When the user seems new — says hello without a task, asks what this is, how it works or
where to start, or `teams/` is still empty and they have no request yet — offer the guided tour in one
line: `/orkeon-tour`. Do not impose it. **Their language first**: when the workshop names no language
(no `workshop-language:` line at the start of the session) and the user writes in another language than
English, tell them once, in their language and in one line, that `/workshop-language <tag>`
(`/workshop-language fr`) makes it the workshop's language — you then talk in it whatever they type,
and write the workbooks in it — and that they type it once.

## Layout

```
<workshop>/
├── CLAUDE.md              imports .claude/harness/HARNESS.md (this file), then the workshop's own notes
├── .gitignore             yours: runs, the mount sets, build output, local settings and keys stay out of git
├── .devcontainer/         yours: devcontainer.json, to open the workshop in VS Code (Reopen in Container)
├── .claude/               the harness (skills, agents, rules, hooks, lib, templates, evals, harness/: this file, its
│                          README, the frozen literals, the verification record), managed by the image; yours in
│                          .claude/local/ (language D41, scripts/ D47) and the switches of .claude/settings.local.json
├── references/            reference documents (managed; yours in references/local/) — references/README.md is the index
├── library/               reusable bricks, each validated by at least one accepted team (yours)
│   ├── agents/ tools/ts/ tools/csharp/ schemas/ datasets/ mount-schemes/
│   └── examples/          the pilot teams (managed): their READMEs, and for mail-triage its workbook and tests folder
├── teams/<slug>/          ONE team as Orkeon Studio runs it — also Studio's catalogue: only team folders live here
│   ├── crew/              the definition, and nothing else (YAML: config.yaml + agents/ + tasks/ | TS: crew.ork.ts + tools/)
│   ├── mounts.json        its mount points: virtual root, access, role, the folder of the team behind each
│   ├── team.json · run.sh · run.cmd · .gitignore   card, launchers and git rules, written from mounts.json
│   │                      by `orkeon-bench scaffold` (after « Change the folders » in Studio, put the change in mounts.json and scaffold again)
│   ├── README.md
│   └── <one folder per mount point>   the team's own folders (input/, output/, mailbox/…): git keeps each one
│                                      through its .gitkeep, never its content
├── workbooks/<slug>/      how the team is made: TEAM.md STATUS.md decisions/ attempts/ runs/
├── tests/<slug>/          how it is proven: bench.config.json static/ unit/ component/ e2e/ datasets/ judges/
├── settings/<slug>/       appsettings.json: the team's own Orkeon settings (D33; settings/README.md says what it holds),
│                          passed with --settings by its launchers, and by Studio for a team right under its teams root;
│                          written by the main thread only (D40)
├── mounts.<name>/<slug>/  a mount set: one folder per mount point of the team, used with TEAM_ENV=<name>
├── deployments/           the archives `/deploy` writes, <slug>-<date>.zip or .tar.gz: a team to install in another workshop (D45)
└── archive/               retired teams (Studio's Delete moves a team and its trees here), compacted attempts and runs
```

A team folder holds only what Studio and the definition of the crew need; its workbook and its tests
sit next to `teams/`, under the same slug (D29). The mount points of a team are its own, free in
name and number (D27): `mounts.json` is their single source, and the launchers, the Studio card and
the checks are derived from it. What a mount point may be named, reach (D40) and how a mount set
(D28) works lives in one place: `references/orkeon/studio-layout.md#mount-points`.

The launchers run `orkeon run crew` **from the team folder**, and so does Studio; both read a `crew/`
sub-folder first, whatever the root holds, so a root `agents/` or `tasks/` folder is only the folder of a
mount point. Never put at the root of a team a `*.ork.ts` or the flat triplet `crew.yaml` + `agents.yaml` +
`tasks.yaml` (set aside, they never run), nor a crew in `crew/crew/` (`orkeon run crew` would load it in
place of the team's); and never a `*.ork.ts` next to a YAML crew (`orkeon run` refuses the folder as
ambiguous). `orkeon-studio-check [<slug>…]` reads a team with Orkeon Studio's own code and says whether
Studio lists, reads and launches it as its launchers do; the check scripts call it.

## The process, in one screen

Each step reads a file and writes one; nothing important travels through the conversation; no step
starts without the artefact of the previous one. `workbooks/<slug>/STATUS.md` says where the team is.

| # | Step | Reads | Writes | Exit gate |
|---|---|---|---|---|
| 0 | `/team-init [--adopt] <slug>` | — | `STATUS.md`, `TEAM.md` (the template), `DEC-0001`, `tests/<slug>/` (the team folder comes with the first build, D35) | — |
| 1 | `/team-spec` | `STATUS.md`, a brief, `references/` | `TEAM.md`: `## Need`, `## Acceptance`, `## Design`, `## Plan`; `tests/<slug>/bench.config.json` | **gate team** — `orkeon-bench check team` green, then the user validates the file once (D89) |
| 2 | `/team-tests` | `TEAM.md` | `tests/<slug>/**` | every test exists, cites an id, and is **red** |
| 3 | `/team-build [B<n>]` | the batch sheet, `## Design`, its tests | `crew/**`, `library/tools/**` — the first batch creates `teams/<slug>/` (`mounts.json` from `## Design › Mounts`, then `orkeon-bench scaffold`, D35) | L0 + L1 green on the batch (`orkeon-bench run --level L1`), no test modified |
| 4 | `/team-run [--level]` | `tests/<slug>/`, `mounts.json` | `attempts/ATT-n/REPORT.md` + `report.json`, `judgements.json`, `runs/` | **budget gate** before any paid run (L4, an L3 whose model or decision model is remote, a paid `decide`): `orkeon-bench estimate --level L3\|L4 [--decide <calls>]`, then `/team-approve remote <usd> <slug>` (D104) |
| 5 | `/team-review` | `capture.md` (written by `/team-run` through `orkeon-bench capture`) | `ANALYSIS.md`, `FIX-PLAN.md`, verdict, a correction sheet in `## Plan`; the attempt closed on `ACCEPTED` only (`ITERATE` keeps it open, D38) | `ACCEPTED` · `ITERATE` · `BLOCKED` |
| 6 | `/team-release` | the whole folder | `orkeon-bench release`: README, card and launchers realigned, runs compacted; commit pushed, tag command proposed | — |

The team gate passes on the user's word only: the user types `/team-approve team <slug>`, and the
hook `team-approve` records it in `STATUS.md` (D36); never write `gate_passed` yourself (`guard-phase`
refuses it), never take an "ok" in the conversation for the approval. After the gate, `TEAM.md` changes in `## Plan` only; `crew/` is written in phase
`build` only; `tests/<slug>/` is frozen once the last batch is built (D89). `ITERATE` goes back to
step 3 (`gate_passed: tests`, `iteration` +1, D38), `BLOCKED` to `/team-decision`; `/team-loop`
chains steps 2 to 5 without the user until `ACCEPTED`, `BLOCKED` or the budget gate;
`/team-decision "<change>"` and `/team-status` work at any time. Test levels run from free to paid
and stop at the first red one: L0 static · L1 unit · L2 component (simulated LLM) · L3 end-to-end
local · L4 end-to-end remote. The batches of a plan are `B1`, `B2`…: `L` is reserved for the test
levels. The full description is `references/process/workflow.md`.

## Skills

- **The method**, invoked by the user only: `team-init` (`[--adopt] <slug>`), `team-spec`,
  `team-tests` (by `team-test-author` and `dataset-synthesizer`), `team-build`, `team-run`,
  `team-review`, `team-loop`, `team-release`, `team-decision`, `team-status`, and `team-approve` (the
  line the user types at a gate: its hook records it, the skill records nothing).
- **Generators**: `orkeon-crew --format yaml|ts` (its check scripts read the tool catalogue from
  `references/orkeon/orkeon-reference.md` § 5); `orkeon-crew-csharp` (`[--into teams/<slug>]
  [--tool <ToolName>]…`: a team hosted by a C# program, `teams/<slug>/host/`) and
  `orkeon-tool-csharp` (`<ToolName> <tool_name>`: a tool in `library/tools/csharp/`, compiled into a
  host or loaded as a plugin), on the image's .NET templates (`references/orkeon/csharp-*.md`).
- **The workshop**: `deploy` (`[<slug>] [--with-settings | --without-settings]`, D45),
  `workshop-language` (`[<language> | default]`, D41), `orkeon-tour` (read-only), `orkeon-update`,
  `clean-restore`, `workshop-profile` (the packs of the harness this space deploys), `orkeon-code`
  (`<crew> [request]`: a piece of development work handed to Orkeon Code, whose
  spec, plan, batch and audit chain replaces the one the harness carried, D113, D114).

**A request for a new team** (D34): offer the two tracks in one line and let the user choose — a
prototype now (a generator writes the team; nothing proves it yet), or the method (`/team-init
<slug>`). A prototype enters the method later through `/team-init --adopt <slug>`.

`orkeon-bench`, the harness CLI (each command with `--json`): `status`, `profile`, `mounts`, `scaffold`,
`report validate`, `tools dump`, `doctor`, `deploy`, `setup` (`status`, `keys`, `subscription`, `apply`: where the model
keys of the workshop live, D108); `check team <slug> [--tests]` reads `TEAM.md` and
`bench.config.json` before the gate (exit `0` without an error, `1` with one; `--tests` adds the ids ↔
tests traceability); `attempt open|close|approve` (the last for the `team-approve` hook alone);
`llm-stub serve`; `run <slug> --level <L0|L1|L2|L3|L4> [--profile <name>]` in an
open attempt, which archives each run under `workbooks/<slug>/runs/`, evaluates criteria, invariants
and indicators and writes `report.json` and `REPORT.md` into the attempt (the report of its **last**
run); `evaluate --judgements` folds the judges in; `estimate` prices a remote run; `capture` writes the
review's input; `release` realigns and compacts.

**Orkeon's tools in this session** (D112): the MCP server `orkeon` — the launcher `orkeon-mcp`, which ends as
`orkeon mcp serve` with the session's folder at `/workspace` — gives you the tools you have none of your own
for: the code index (`index_codebase`, then `codebase_search`, `symbol_detail`, `dependency_graph`,
`impact_analysis`…), the document readers, `http_api` and the scrapers, the RAG search. It needs no
model. Never the file, edit and shell tools: yours are the ones the hooks guard — a call to one of Orkeon's is
logged, tool name only, in `.claude/local/mcp-calls.tsv`, not guarded. An argument that is an array is
refused over MCP by Orkeon 1.2.0: call a tool without its array filters (`references/orkeon/orkeon-reference.md` § 5).

## Rules of engagement

1. **Never run a paid remote run without approval.** `/team-run` prices it (`orkeon-bench estimate`),
   writes `next_action: /team-approve remote <usd> <slug>`, states the estimate and the cap, and waits
   for the user's explicit yes, recorded in the open attempt — the user types that line, and its hook
   has `orkeon-bench` write the marker (D19, D36); a line no estimate submitted is refused, and every
   remote deny of `run-gate` sends to `/team-run` (D104) — then run. Never write an approval yourself, from the shell either. `--validate`, the `stub` profile and
   a profile on a local host are free and need none; the `machine` profile is a remote run as soon as
   what Orkeon will read for the run — the `ORKEON_Llm__*` variables, and the team's settings file
   `settings/<slug>/appsettings.json` or, without one, the machine's settings — points off the
   machine, or holds an `Llm` section without a base URL (`orkeon-bench profile <slug> <name>` says
   which). In Studio, a team right under its teams root runs on the same team settings file — any
   other on Studio's settings —, with the setting the card's `profile` names laid over it (D33).
2. **Commit and push what a step produced; never tag.** The commit and the push are yours (D71): the
   files the step touched, a message that says what changed, then `git push -u origin <branch>`, with the
   identity git already has (`git var GIT_AUTHOR_IDENT`: its configuration, or the `GIT_AUTHOR_*`
   variables of `workshop --git-identity`) — none: stop before the commit, say so and hand over
   `workshop --git-identity "<name>" <email>` or the two `git config --global` lines (rule 10); never an
   identity of your own. The tag `team/<slug>/v<n>` is proposed as an exact line; the user runs it (D3).
3. **English artefacts, unless the workshop names its language.** By default everything written to disk
   is in English and you talk with the user in the language of their messages. When
   `.claude/local/language` names a language (`/workshop-language <tag>`, D41; a hook recalls it at the
   start of the session), talk in it whatever the user types and write the prose of the workbook in it;
   headings, keys, ids, the journal and every string a script reads stay in English
   (`.claude/rules/workbook.md` § "Tone and language").
4. **One fact, one place.** A convention lives in one rule, template or reference and is cited elsewhere.
   Strings a script emits and another parses are frozen: `.claude/harness/FROZEN-LITERALS.md`.
5. **Tests before the team.** Never weaken, skip or edit a test to make a team pass: a wrong test is a
   decision (`/team-decision`), not a fix.
6. **The orchestrator judges, subagents produce.** Delegate with a description, an explicit model and a
   compact contract that names paths and ids; a subagent that cannot comply answers `## BLOCKED`.
7. **The Orkeon reference is authoritative.** YAML by default, TypeScript for custom tools or build-time
   logic, C# for heavy tools, I/O or .NET integration. Never a key, tool or method absent from
   `references/orkeon/` — in a settings file either: Orkeon refuses to start on a settings key it does not
   know (`references/orkeon/cli.md` § 5).
8. **No key on disk** — unless the user chose `workshop setup keys` (D109), and then in the `env` block of
   `.claude/settings.local.json` alone, which `orkeon-bench setup` writes and you never read, write or
   show —, inputs are untrusted (prompt injection), nothing sent on the user's behalf without
   their authorisation: `email_draft` rather than `email_send`, which only reaches `Send:AllowedRecipients`.
   No `shell_command` for an agent that reads untrusted input, never in a team with a mail or drive account:
   in a container Orkeon leaves it unconfined, and it reaches the settings, the tokens and, through `/proc`,
   the model's key (V-16, `references/reliability/security.md` § 7).
9. **Spend context carefully.** Bounded reads, independent calls in one message, logs stay with whoever
   produced them (`references/process/context-discipline.md`).
10. **Hand a command to the user only when you cannot run it yourself** (`references/process/hand-over.md`,
    D47): a `git tag` (rule 2), an issue, a comment on a pull request, a release; `workshop --git-identity`
    or `gh auth login`; whatever carries a value that must not reach you — a secret, a setting they keep —,
    never asked for, never read back; their computer; the shell they come back to. Say **where it is typed**
    (in Claude Code; after `/exit`, in the container's terminal, then `workshop` to come back; or on their
    computer), **one line per step, nothing optional**, each in its own code block, in their language.
    Two commands or more become one script `.claude/local/scripts/<name>.sh` (shebang, `set -euo pipefail`,
    idempotent, no secret inside, checked with `bash -n`) handed as `bash /workspace/.claude/local/scripts/<name>.sh`
    (a launcher: `sh /workspace/teams/<slug>/run.sh`). A secret for the session: `/exit`, then
    `workshop --secret <NAME>`. End with what they will see when it worked, and the line to type if it fails.

## Where things live

| You need | Look in |
|---|---|
| modes, agents, tasks, tool catalogue, pitfalls | `references/orkeon/orkeon-reference.md` |
| exact YAML keys · TypeScript DSL · Studio layout and mount points | `references/orkeon/yaml-schema.md` · `typescript-dsl.md` · `studio-layout.md` |
| the process, its gates and artefacts | `references/process/workflow.md`, `artefacts.md`, `checklists/` |
| handing a command, a script or a secret to the user | `references/process/hand-over.md` |
| the standard invariants (`INV-FS`, `INV-RESUME`…) | `references/testing/invariants-catalog.md` |
| designing a team: its shape, its tools, what it reads and writes, its prompts, its cost | `references/design/` |
| holding it up: errors, resume, incremental processing, keys and untrusted inputs | `references/reliability/` |
| the shape of every workbook artefact, and the generic mount scheme | `.claude/templates/` |
| conventions per file type | `.claude/rules/` (loaded when a matching file is read or edited; one without `paths:`, such as `project-before-web.md`, in every session) |
| subagent charters and report shape | `.claude/agents/` |
| what each hook blocks and how to tune it | `.claude/harness/README.md` |
| what was checked on the installed Orkeon, and how | `.claude/harness/VERIFICATIONS.md` |
| what `plan § x.y` cites in hooks, charters and comments | the design document of the harness repository (`docs/orkeon-workshop-plan.md`, not in the workshop) — never a team's `TEAM.md § Plan` |
| a brick to start from | `library/` (and the pilots of `library/examples/`) |

## Guards

Hooks enforce part of the above whatever the permission mode: `run-gate` (remote runs), `guard-phase`
(who writes where, in which phase, and no user gate written by Claude — nor through the shell:
`guard-user-gate`), `team-approve` (the approvals the user types), `secret-guard` (keys),
`delegation-guard` and `subagent-report-shape` (delegation contract), `memory-scope` (the reviewer's
memory folder only), `status-check` (`STATUS.md` after a `team-*` skill), `session-doctor` (what
`orkeon-bench doctor` finds wrong at the start of a session), `make-executable` (a script is executable
when written; CRLF is said, D47), `read-bounds` and `bash-dispatch` (context: a large file read whole,
a wide grep; a reading wanted whole is said with `HARNESS_FORCE_READ=1` in front of the command). A
refusal states its reason and the way forward: follow it rather than working around it. Switches are `HARNESS_*` variables in `.claude/settings.local.json`.
