# Orkeon harness — workshop entry point

This folder is an **Orkeon workshop** (`ORKEON_WORKSHOP`: `/workspace` in the container, the host's
Orkeon folder bind-mounted there): the place where Orkeon agent teams (YAML, TypeScript, C#) and
Orkeon tools in C# are designed, built, tested, evaluated, fixed and released, through a test-first
process whose every attempt and decision is archived. The image deploys the harness here (`.claude/`,
`references/`, `library/examples/`); what you make lives in `teams/`, `workbooks/`, `tests/`,
`settings/` (a team's own Orkeon settings, D33) and `library/`. Orkeon targeted: `main` — the image
builds Orkeon from its sources (D32); the references are established at commit fb26364
(`1.0.0-rc.4.src.20261005.gfb26364`; first written on 24ab0d0). The installed binary settles any doubt (`orkeon --version`,
`orkeon run --list-tools`, `orkeon-bench tools dump`).

**Newcomers.** When the user seems new — says hello without a task, asks what this is, how it works or
where to start, or `teams/` is still empty and they have no request yet — offer the guided tour in one
line: `/orkeon-tour`. Do not impose it.

## Layout

```
<workshop>/
├── CLAUDE.md              imports .claude/harness/HARNESS.md (this file), then the workshop's own notes
├── .gitignore             yours: runs, the mount sets, build output, local settings and keys stay out of git
├── .devcontainer/         yours: devcontainer.json, to open the workshop in VS Code (Reopen in Container)
├── .claude/               the harness: skills, agents, rules, hooks, lib, templates, evals, and harness/ (this file,
│                          its README, the frozen literals, the verification record) — managed by the image;
│                          your own files in .claude/local/ (kept, not loaded), switches in .claude/settings.local.json
├── references/            reference documents (managed; yours in references/local/) — references/README.md is the index
├── library/               reusable bricks, each validated by at least one accepted team (yours)
│   ├── agents/ tools/ts/ tools/csharp/ schemas/ datasets/ mount-schemes/
│   └── examples/          the READMEs of the three planned pilot teams (managed; built in lots 2–8)
├── teams/<slug>/          ONE team as Orkeon Studio runs it — also Studio's catalogue: only team folders live here
│   ├── crew/              the definition, and nothing else (YAML: config.yaml + agents/ + tasks/ | TS: crew.ork.ts + tools/)
│   ├── mounts.json        its mount points: virtual root, access, role, the folder of the team behind each
│   ├── studio-team.json · run.sh · run.cmd · .gitignore   card, launchers and git rules, written from mounts.json
│   │                      by `orkeon-bench scaffold` (Studio launches from the card and leaves these launchers as they
│   │                      are; after « Change the folders » in Studio, put the change in mounts.json and scaffold again)
│   ├── README.md
│   └── <one folder per mount point>   the team's own folders (input/, output/, mailbox/…): git keeps each one
│                                      through its .gitkeep, never its content
├── workbooks/<slug>/      how the team is made: NEED.md ACCEPTANCE.md TEST-PLAN.md DESIGN.md PLAN.md STATUS.md
│                          decisions/ attempts/ runs/
├── tests/<slug>/          how it is proven: bench.config.json static/ unit/ component/ e2e/ datasets/ judges/
├── settings/<slug>/       appsettings.json: the team's own Orkeon settings (D33; settings/README.md says what it holds),
│                          passed with --settings by its launchers, and by Studio for a team right under its teams root;
│                          written by the main thread only (D40)
├── mounts.<name>/<slug>/  a mount set: one folder per mount point of the team, used with TEAM_ENV=<name>
└── archive/               retired teams (Studio's Delete moves a team and its trees here), compacted attempts and runs
```

A team folder holds only what Studio and the definition of the crew need; its workbook and its tests
sit next to `teams/`, under the same slug (D29). The mount points of a team are its own, free in
name and number (D27): `mounts.json` is their single source, and the launchers, the Studio card and
the checks are derived from it. The generic scheme `.claude/templates/mounts.json` (`/workspace`
read, `/output` written) is only a proposal for a need that names no folder; the user's schemes, if
any, are in `library/mount-schemes/`. A mount set `mounts.<name>/<slug>/` (D28) holds other folders
for the same points — for a trial, a demonstration, another environment: `TEAM_ENV=<name> ./run.sh`,
`orkeon-bench mounts <slug> --env <name>`. Studio always runs the team's own folders.

The launchers run `orkeon run crew` **from the team folder**, and so does Studio; both read a `crew/`
sub-folder first, whatever the root holds, so a root `agents/` or `tasks/` folder is only the folder of a
mount point. Never put at the root of a team a `*.ork.ts` or the flat triplet `crew.yaml` + `agents.yaml` +
`tasks.yaml` (set aside, they never run), nor a crew in `crew/crew/` (`orkeon run crew` would load it in
place of the team's); and never a `*.ork.ts` next to a YAML crew (`orkeon run` refuses the folder as
ambiguous).

**What a mount point may reach (D40).** A mount point may not use: the team folder itself; `crew/`, or a
folder named `appsettings` or `_shared` at the root of the team; outside the team, a
folder that holds the team folder, the workshop or the home folder, or that is or lies inside the
workshop's `settings/`, `workbooks/`, `tests/`, `.claude/`, `library/`, `references/`, `.devcontainer/`
or `.git/`, an `appsettings/` or `_shared/` folder above the team, a hidden folder of the home folder
(`~/.config`, `~/.claude`, `~/.ssh`…), the user's `AppData`, `/proc`, or another team's folder or mount
set. A `/plugins` mount point is read-only. Any other folder outside the team passes with a warning:
Orkeon Studio launches the team only when that folder is declared, spelled exactly, in its Authorized
folders. The Windows spellings of these folders (`C:\Users\<you>\Orkeon\settings`, `C:\Users\<you>\.claude`,
`C:\Users\<you>\AppData\…`) are refused the same way. Paths are judged as written: a symbolic link is not
followed, and a folder name ending with a dot or a space is refused, since Windows drops them (`./crew.` is
`crew/` there). Case is ignored; the workshop `$ORKEON_WORKSHOP` names, when it is another one, and
`$XDG_CONFIG_HOME/Orkeon` are guarded too. `orkeon-bench scaffold` and `mounts`, `check_crew.py` /
`check_team.py`, `orkeon-harness-run` and the C# host apply the same rule.

`orkeon-studio-check [<slug>…]` (no argument: every team of the workshop) reads a team with Orkeon
Studio's own code and says whether Studio lists, reads and launches it as its launchers do; the check
scripts call it. Its limits: in the container paths compare with their case, where Studio on Windows
ignores it; it sees no Hidden or System attribute; a Windows path of the card counts as refused unless
`--authorized <appsettings.json>` declares it.

## The process, in one screen

Each step reads a file and writes one; nothing important travels through the conversation; no step
starts without the artefact of the previous one. `workbooks/<slug>/STATUS.md` says where the team is.

| # | Step | Reads | Writes | Exit gate |
|---|---|---|---|---|
| 0 | `/team-init <slug>` | — | `STATUS.md`, `DEC-0001`, `tests/<slug>/` (the team folder comes with the first build, D35) | — |
| 1 | `/team-need` | `STATUS.md`, a brief | `NEED.md` | **gate 1** — the user validates the need |
| 2 | `/team-test-plan` | `NEED.md` | `ACCEPTANCE.md`, `TEST-PLAN.md`, `tests/<slug>/bench.config.json` | **gate 2** — criteria, thresholds, budget validated |
| 3 | `/team-design` | the three above, `references/` | `DESIGN.md`, `PLAN.md` | **gate 3** — pitfalls checked by script, design validated |
| 4 | `/team-tests` | `ACCEPTANCE`, `TEST-PLAN`, `DESIGN` | `tests/<slug>/**` | every test exists, cites an id, and is **red** |
| 5 | `/team-build [B<n>]` | the batch sheet, its tests | `crew/**`, `library/tools/**` — the first batch creates `teams/<slug>/` (`mounts.json` from `DESIGN.md`, then `orkeon-bench scaffold`, D35) | L0 + L1 green on the batch, no test modified |
| 6 | `/team-run` | `tests/<slug>/`, `mounts.json` | `attempts/ATT-n/REPORT.md` + `report.json`, `runs/` | **budget gate** before any remote profile |
| 7 | `/team-review` | the capture of the attempt | `ANALYSIS.md`, `FIX-PLAN.md`, verdict | `ACCEPTED` · `ITERATE` · `BLOCKED` |
| 8 | `/team-release` | the whole folder | README, card and launchers realigned, tag command proposed | — |

Gates 1–3 pass on the user's word only: `/team-approve need|test-plan|design`, recorded by a hook
once D36 lands (lot 2); until then the main thread records the gate in `STATUS.md` on the user's
explicit approval, quoted in the journal line. `ITERATE` goes back to step 5 (`gate_passed: tests`,
`iteration` +1, D38), `BLOCKED` to `/team-decision`; `/team-decision "<change>"` and `/team-status`
work at any time. Test levels run from free to paid and stop at the first red one:
L0 static · L1 unit · L2 component (simulated LLM) · L3 end-to-end local · L4 end-to-end remote.
The batches of a plan are `B1`, `B2`…: `L` is reserved for the test levels.
The full description is `references/process/workflow.md`.

## Skills

- **Available now**: `orkeon-tour` (the guided tour, read-only), `orkeon-crew-yaml`,
  `orkeon-crew-typescript` (generators — they read `references/orkeon/`), `orkeon-update`,
  `clean-restore`.
- **Planned** (invoked by the user, one per step): `team-init`, `team-need`, `team-decision`,
  `team-status` (lot 2) · `team-test-plan`, `team-design` (lot 3) · `team-tests` (lot 5) ·
  `team-build` (lot 6) · `team-run`, `team-review` (lot 7) · `orkeon-tool-csharp`,
  `orkeon-crew-csharp` (lot 8) · `team-release` (lot 9).

**A request for a new team** (D34): offer the two tracks in one line and let the user choose — a
prototype now (a generator writes the team; nothing proves it yet), or the method (the need, the tests
and the record first; a light track for a small team comes with `/team-init` in lot 2, D37). Until the
`team-*` skills exist, the method is followed by hand with `references/process/workflow.md` and the
templates of `.claude/templates/`, keeping `STATUS.md` current; a prototype enters the method later
through `/team-init --adopt <slug>` (lot 2).

`orkeon-bench`, the harness CLI, already answers `status <slug>` and `profile <slug> <name>` (as soon as
`workbooks/<slug>/` or `tests/<slug>/` exists), `mounts <slug> [--env <name>]`, `scaffold <slug>`
(launchers, Studio card mounts and folders, from `mounts.json`), `report validate <file>`, `tools dump`
(the real schema of every tool of the installed Orkeon) and `doctor`, each with `--json`. Its other
commands arrive in lots 3, 4 and 9 — `check design`; `run`, `attempt`, `capture`, `team rename|remove`…;
`estimate`, `release` — and exit `3` until then.

## Rules of engagement

1. **Never run a paid remote run without approval.** Estimate (by hand until `orkeon-bench estimate`,
   lot 9), state the estimate and the cap, wait for the user's explicit yes, record it in the open
   attempt — `/team-approve remote <usd>` once its hook ships (D36, lot 2), until then from the shell,
   quoting the user's yes — then run. Never write an approval on your own initiative. `--validate`, the
   `stub` profile and a profile on a local host are free and need none; the `machine` profile is a
   remote run as soon as what Orkeon will read for the run — the `ORKEON_Llm__*` variables, and the
   team's settings file `settings/<slug>/appsettings.json` (which the launchers pass) or, without one,
   the machine's settings — points off the machine, or holds an `Llm` section without a base URL
   (`orkeon-bench profile <slug> <name>` says which). In Studio, a team right under its teams root runs
   on the same team settings file — any other on Studio's settings —, with the setting the card's
   `profile` names laid over it (D33).
2. **Never commit on your own.** Propose the exact `git` command (and tag `team/<slug>/v<n>`); the user runs it.
3. **English artefacts.** Everything written to disk is in English; talk with the user in their language.
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
8. **No key on disk**, inputs are untrusted (prompt injection), nothing sent on the user's behalf without
   their authorisation: `email_draft` rather than `email_send`, which only reaches `Send:AllowedRecipients`.
   No `shell_command` for an agent that reads untrusted input, never in a team with a mail account: it
   reads the machine's settings, the mail tokens, Claude Code's credentials and, through `/proc`, the
   model's key (V-16, `references/reliability/security.md` § 7).
9. **Spend context carefully.** Bounded reads, independent calls in one message, logs stay with whoever
   produced them (`references/process/context-discipline.md`).

## Where things live

| You need | Look in |
|---|---|
| modes, agents, tasks, tool catalogue, pitfalls | `references/orkeon/orkeon-reference.md` |
| exact YAML keys · TypeScript DSL · Studio layout | `references/orkeon/yaml-schema.md` · `typescript-dsl.md` · `studio-layout.md` |
| the process, its gates and artefacts | `references/process/workflow.md` |
| the standard invariants (`INV-FS`, `INV-RESUME`…) | `references/testing/invariants-catalog.md` |
| designing a team: its shape, its tools, what it reads and writes, its prompts, its cost | `references/design/` |
| holding it up: errors, resume, incremental processing, keys and untrusted inputs | `references/reliability/` |
| the shape of every workbook artefact, and the generic mount scheme | `.claude/templates/` |
| conventions per file type | `.claude/rules/` (loaded when a matching file is read or edited) |
| subagent charters and report shape | `.claude/agents/` |
| what each hook blocks and how to tune it | `.claude/harness/README.md` |
| what was checked on the installed Orkeon, and how | `.claude/harness/VERIFICATIONS.md` |
| what `plan § x.y` cites in hooks, charters and comments | the design document of the harness repository (`docs/orkeon-workshop-plan.md`, not in the workshop) — never a team's `workbooks/<slug>/PLAN.md` |
| a brick to start from | `library/` (and the pilots of `library/examples/`, once built) |

## Guards

Hooks enforce part of the above whatever the permission mode: `run-gate` (remote runs),
`guard-phase` (who writes where, in which phase), `secret-guard` (keys), `delegation-guard` and
`subagent-report-shape` (delegation contract), `status-check` (`STATUS.md` after a `team-*` skill),
`read-bounds` and `bash-dispatch` (context). A refusal states its reason and the way forward: follow it
rather than working around it. Switches are `HARNESS_*` variables in `.claude/settings.local.json`.
