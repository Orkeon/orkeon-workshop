---
name: orkeon-crew-csharp
description: "Creates or rewrites an Orkeon agent team hosted by a C# program: the team folder (mounts.json, the YAML crew under crew/ or a crew built in code), its host project under host/ generated from the image's OrkeonCrewHost template (wiring, mounts, the team's C# tools compiled in, the optional decision model, events.jsonl), the launchers, the README, the host's startup tests, `dotnet build`, `dotnet test` and `./run.sh --validate`. Use it when a team needs what YAML and TypeScript do not expose (StateGraph, checkpoint stores, IResumeEngine, the built-in evaluation, a crew built in code, a C# tool compiled in), when TEAM.md's Format says C#, and when /team-build drives a batch of a C# team."
argument-hint: "[--into teams/<slug>] [--tool <ToolName>]... [team need]"
---

# /orkeon-crew-csharp — an Orkeon team with its own C# host

You design, then generate a **team folder** whose program is a C# host: it wires Orkeon, mounts the
team's points from `mounts.json`, registers the team's tools, loads the crew and runs it like
`orkeon run`. You work autonomously: a missing detail gets a sensible default, flagged in your report.

Arguments: $ARGUMENTS

## Contract

- Inputs: the need, or `workbooks/<slug>/TEAM.md` when `--into` names a team of the method: its
  `## Design` is the design (its `### Format and rationale` says C#, with the `DEC-000n` of the
  choice), its `## Plan` batch sheet is the scope — design nothing again.
- `--tool <ToolName>` (repeatable): a C# tool of `library/tools/csharp/<ToolName>/` the host compiles
  in. A tool that does not exist yet is made first by `/orkeon-tool-csharp`. No `--tool`: the team
  uses built-in tools only.
- `--into teams/<slug>`: write into that folder, the batch's anchors overwritten, nothing else
  touched (D34). Without it: `teams/<slug>/` from the need, `<slug>-2` when it exists and is not
  empty (say so).
- Output: the folder of § 4, `dotnet build` and `dotnet test` green, `./run.sh --validate` green; the
  report of § 6. No real run unless the user asks (paid calls).
- C# only when the need calls for it (`references/orkeon/csharp-crews.md` § 1): a team that only
  needs a C# tool stays YAML with a plugin (`references/orkeon/csharp-tools.md` § 9) — say so and
  hand over to `/orkeon-crew`.

## 1. Load the references — before any design

In the workshop's `references/` (`$ORKEON_WORKSHOP`, `/workspace` in the container):

- `references/orkeon/csharp-crews.md` — when C#, the template, the wiring order, what each C#-only
  feature does on main, the event stream, the checks;
- `references/orkeon/yaml-schema.md` and `references/orkeon/orkeon-reference.md` — the crew under
  `crew/` is ordinary Orkeon YAML (modes, agents, tasks, the tool catalogue of § 5, pitfalls of § 9);
- `references/orkeon/studio-layout.md` `## Mount points` — the one copy of the mount-point rule;
- `references/orkeon/decision-profiles.md` — only when `TEAM.md` names a decision model;
- `references/csharp/orkeon-guidelines.md` and the rule `.claude/rules/orkeon-csharp.md` — the build
  conventions the analysers enforce (`-warnaserror`, VFS only, XML documentation).

Do not invent a key, a builder method or a tool name absent from these files.

## 2. Scope and design

As `/orkeon-crew` § 2 and § 3 (`.claude/skills/orkeon-crew/SKILL.md`), for the same reasons: title
and slug, inputs and deliverable, **mount points** (D27), agents (2 to 5), tasks, the optional
decision task (D96). Then, C#-specific:

- **Where the crew lives.** A YAML crew under `crew/` (default: the host loads it through the VFS as
  `/crew`, strict on tool names), written from `.claude/skills/orkeon-crew/templates/yaml/crew/`. A
  crew **built in code** (`host/src/<Team>.Host/Crews/CrewLoader.cs`, no `crew/` folder) only when the
  design needs the builders: `StateGraph`, flows, a task's deliverable set in code.
- **Tools.** Built-in names from the catalogue; each C# tool by its `[ToolContract]` name.
- **Decision model (optional).** The host already registers it as `orkeon run` does
  (`Composition/DecisionModelRegistration.cs`): with no provider configured nothing changes and every
  decision task answers from its `fallback`. A provider and a preset only when `TEAM.md`'s
  `#### Decision model` names them: `Orkeon:Decision:Provider`, the provider's section and the preset
  go to `settings/<slug>/appsettings.json`, the key by its variable name only.
- **Names.** `<Team>`: PascalCase of the slug (`invoice-desk` → `InvoiceDesk`): the project
  `<Team>.Host`, its tests `<Team>.Host.Tests`.

## 3. Generate the folder

`$CS` is `/usr/local/share/orkeon-harness/csharp` in the image (`.devcontainer/csharp` in a checkout
of the workshop's repository). From the workshop root:

1. Write `teams/<slug>/mounts.json` (shape of `.claude/templates/mounts.json`) and the crew under
   `teams/<slug>/crew/` (YAML templates of `/orkeon-crew`, every `{{…}}` replaced).
2. Generate the host — once; it refuses a folder whose `host/` exists:

   ```bash
   $CS/OrkeonCrewHost/new-team.sh <Team> teams/<slug> \
       --tool library/tools/csharp/<ToolName>/src/<ToolName>/<ToolName>.csproj   # per tool; else --no-tool
   ```

   It copies the template into `host/` (renamed, the sample tool dropped), references each tool and
   registers it (`AddSingleton<IBaseTool, <ToolName>Tool>()` in `Composition/TeamTools.cs`), writes the
   test copy of the team (mounts.json, `crew/`, the read-only folders), the mount folders with a
   `.gitkeep`, `run.sh` / `run.cmd` and a `.gitignore`. Without `--tool` or `--no-tool` it keeps the
   template's sample tool and crew: a demonstration, not a team.
3. Adapt what the template ties to its sample — the host's own tests are then the team's:
   - `host/tests/<Team>.Host.Tests/StartupTests.cs`: the agent and task counts, the sorted tool names,
     the mounted roots and their folders, the `VALIDATION OK` line, the agent file the unknown-tool
     test overwrites, the event counts of the echo run;
   - `host/src/<Team>.Host/Crews/CrewLoader.cs`: the crew built in code (or the team's code crew), and
     its tool name; the startup test of a crew without `crew/` follows it;
   - `Composition/TeamTools.cs`: the built-in suites the crew names (`AddOrkeonDataTools()`,
     `AddOrkeonWebTools()`…, with their packages), a tool not made by `new-tool.sh`.
   Leave the wiring order of `Composition/TeamHost.cs` as it is (`csharp-crews.md` § 3). Checked
   before § 4: `grep -rn sample_extractor teams/<slug>/host/src teams/<slug>/host/tests
   teams/<slug>/crew` prints nothing — a line it prints is a test or a loader still bound to the
   sample. `HostCommandLineTests.cs` is independent of the crew: keep it as it is.
4. `settings/<slug>/appsettings.json` of the workshop: the `Llm` section (the template's default is
   Ollama, `qwen3:8b`, no key) and the decision settings of § 2 — under `/team-build`, the main
   thread writes it. No `appsettings*.json` in the team folder (D33).
5. `teams/<slug>/README.md`: the need, the agents / tasks / tools table, the mount points, the
   prerequisites (keys by variable name), how to launch, the checks.

```
teams/<slug>/
├── mounts.json, README.md, .gitignore
├── crew/                    the YAML crew (absent when built in code)
├── host/                    <Team>.sln, build files, src/<Team>.Host/, tests/<Team>.Host.Tests/
├── run.sh, run.cmd          written by new-team.sh: dotnet run of the host on this folder
└── <a folder per mount point inside the team>
```

The launchers are the host's: `orkeon-bench scaffold` writes `orkeon run` launchers, so it is not run
on a C# team, and `mounts.json` changes are followed by hand (folders, the test csproj's `Content`).
The team's acceptance tests stay in `tests/<slug>/` (D29).

## 4. Verify — none skipped

Every check that can run must pass; fix and rerun until green.

```bash
cd teams/<slug>/host && dotnet build -c Release && dotnet test   # zero warning (analysers, VFS); startup tests green
cd teams/<slug> && ./run.sh --validate                            # VALIDATION OK: /crew (agents=N, tasks=M, tools resolved=K, decision=<mode>)
```

No `Llm` section reachable (a test, a machine without settings): the host takes its echo provider,
which replays the prompt and calls no model — `./run.sh --input "…"` then proves the event stream
(`run/events.jsonl`) end to end for free. In the container nuget.org is blocked: the restore comes
from the local Orkeon feed and the pre-warmed cache (`verify-templates.sh --offline` proves it).
`check_crew.py` judges `orkeon run` teams: it does not apply to a host. The bench knows a C# team by
its `host/`: `orkeon-bench run <slug>` builds it (`dotnet-build`), validates it (`host-validate`),
runs its `dotnet test` at L1 and each scenario through it at L2–L4 — the host takes the options of
`orkeon run` the bench passes (`--mount <spec>...`, `--settings <file>`, `--no-decision`,
`--events -`, `--list-tools`).

## 5. Studio

Orkeon Studio lists every folder of `teams/` and would launch `crew/` with the stock `orkeon`,
without the host's tools and wiring (`csharp-crews.md` § 2): no Studio card is written, and the
README says the team is launched by `./run.sh` only.

## 6. Report

In the user's language, briefly: the folder and its tree; the agents / tasks / tools table and the
mode; the mount points and where they come from; the C#-only features used and why (the `DEC`);
the decision model (none, or the provider and preset); the defaults chosen; the prerequisites (a key
is named, never asked for); each check and its result; how to launch (`sh teams/<slug>/run.sh`,
`TEAM_ENV=<name>` for a mount set) — not from Studio. Under `/team-build`, answer that skill's
contract instead: the files written, the checks and their exit codes.
