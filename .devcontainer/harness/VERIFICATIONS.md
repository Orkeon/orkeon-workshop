# Verifications

Facts the harness relies on, checked against Orkeon. Lot 0 checked them on `1.0.0-rc.4` (2026-10-01);
since D32 the image builds Orkeon from the sources of `main`, and the entries say where `main` at commit
24ab0d0 (`1.0.0-rc.4.src.20260930.g24ab0d0`, 2026-10-02) was checked and what changed. `main` at a2bb6c3
(`1.0.0-rc.4.src.20261003.ga2bb6c3`, 2026-10-03, 52 commits later) was re-read in its **sources** for the
entries on settings, models, keys and the shell (V-01, V-04, V-13, V-14, V-16), the tool catalogue,
plugins and resume (V-06, V-07, V-08); its binary was then run in a container of this image
(2026-10-03) for the points the entries mark **binary, a2bb6c3**; the rest is from the sources. `main` at
fb26364 (`1.0.0-rc.4.src.20261005.gfb26364`, 2026-10-05, 61 commits later) was re-read in its sources on
2026-10-06 for the entries below that say so, and the points they mark **build, fb26364** were run the same
day on a Release build of the CLI made from the fb26364 checkout, outside the image (`orkeon --version`:
`orkeon 1.0.0-rc.4`; `dotnet orkeon.dll`, an empty `HOME`, a stub LLM on 127.0.0.1) — not on the image's
binary, which the image build checks with the evals. `main` at 77ac8a9
(`1.0.0-rc.4.src.20261006.g77ac8a9`, 2026-10-06, 8 commits later) differs from fb26364, under `src/`, in
`src/tools/Orkeon.Tools.Email/` and in the e-mail part of the scripting typings only (`git diff
fb26364..77ac8a9 -- src`, read on 2026-10-07): every entry checked at fb26364 holds there as written, and
V-01 and V-06 were run again on a build of it (**build, 77ac8a9**). Each entry says how it was checked: **binary** = run
in a container of this image; **build** = run on a build of the CLI outside the image; **sources** =
read in the Orkeon repository at that version. Re-run them when the Orkeon commit of the image changes.
V-17 is of another kind — **live session** = replayed in a Claude Code session on a workshop: it checks
that Claude Code applies what the hooks emit, and is re-run when Claude Code or a hook changes.

## V-01 — `orkeon run --list-tools` exists (binary)

Exit 0. Prints tool names only, sorted, one per line; logs go to stderr. It does not list the custom
tools of a crew or script (no crew is loaded). `orkeon-bench doctor` uses it. Without any
configuration: **80 names on `main` at 24ab0d0** — the 13 e-mail tools included, which are always
registered and refuse a call until an account is declared under `Orkeon:Tools:Email`; **68 at
1.0.0-rc.4**, where the e-mail family was `email_parser` alone. `web_search` is listed, `brave_search` is
not (it needs `BRAVE_API_KEY`).

**Re-read (2026-10-03), sources of `main` at a2bb6c3.** Every runner host now registers the RAG subsystem
and its tools (`RunnerHost.ConfigureRunnerServices`: `AddOrkeonRag`, `AddOrkeonRagTools`), so
`rag_search`, `rag_ingest` and `rag_eval` join the list — **binary, a2bb6c3**: 83 names from `orkeon` and `orkeon-harness-run`, and `orkeon-bench tools dump`
finds all 83 (23 with an empty schema). `ITool`
is gone: any registered tool, an MCP or `rag_*` one included, can be attached to an agent, and a name
belongs to one tool (an MCP tool no longer replaces a built-in).

**Re-run (2026-10-06), build, fb26364.** 83 names without configuration, the same list; an agent naming all
83 loads, and 23 of them reach the model with an empty schema. `--list-tools` now judges the settings of
the working directory at its start (V-13): with `"Llm": { "Provider": … }` in `./appsettings.json` it
exits 1 on `ERROR: Llm:Provider is not a setting: …` and lists nothing.

**Re-run (2026-10-07), build, 77ac8a9.** 83 names without configuration, the same list as at fb26364, line
for line.

## V-02 — a promoted team is launched as `orkeon run crew` from the team folder (binary)

`orkeon run . --validate` from the team folder exits 1 (the layout inspector never looks inside
`crew/`). `orkeon run crew --validate` from the team folder exits 0 and prints
`VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K)`. Launchers and the bench use
the second form, with the team folder as working directory.

**Re-run (2026-10-06), build, fb26364 — the first sentence no longer holds for a YAML team.**
`CrewDirectoryLayout.Inspect` probes a `crew/` sub-folder first, one step down (STUDIO-59): from the team
folder, `orkeon run . --validate` exits 0 and prints `VALIDATION OK: <path>/crew (…)`, with or without
`agents/` and `tasks/` folders at the root, which it sets aside without a word. For a script team
(`crew/crew.ork.ts`) it still exits 1: `orkeon run: '<path>' is a directory but holds no recognized crew
layout. Searched for: 'agents/', 'tasks/', 'crew.yaml + agents.yaml + tasks.yaml', at its root or under a
'crew/' sub-folder.` The same step applies to `orkeon run crew`: with a YAML crew in `crew/crew/` it printed
`VALIDATION OK: <path>/crew/crew`, the nested one. The settings chain of `orkeon run .` starts at `crew/`:
an `appsettings.json` at the team root was not read (`No appsettings.json found`), `crew/appsettings.json`
and `<team>/appsettings/appsettings.json` were. The launchers and the bench keep `orkeon run crew`.

## V-03 — Studio reads `studio-team.json` and ignores what it does not know (sources)

`TeamCatalog.FileName = "studio-team.json"`; fields `name`, `description`, `profile`,
`schedule`, `mounts[]` — on `main` at 24ab0d0 also `archived`, `archivedAt`, `lastRunAt` and `addedAt`,
which Studio writes (`StudioTeamMetadata` in `Teams/TeamCatalog.cs`). Unknown keys are lost when Studio
saves the card. Every subfolder of `~/Orkeon/teams` (`%USERPROFILE%\Orkeon\teams`) is listed as a team;
`tests/`, `workbook/` and `mounts.json` are ignored — since D29 a team's tests and workbook live outside
its folder anyway. A folder becomes ambiguous only with an `agents/` or `tasks/` folder at its root, or a
`*.ork.ts` / `*.ork.js` file at the root or next to a YAML layout — corrected by V-15: an `agents/` or
`tasks/` folder at the root alone is not refused, it is taken for the crew. Studio does not read
`run.sh` / `run.cmd`; it builds its own `--mount` arguments from the card and adds
`--allow-external-mounts` when a mount lies outside the team folder. **Re-read at a2bb6c3** (V-15): the
card's keys are unchanged (`StudioTeamMetadata` changed in its comments only), and Studio still launches
from the card without reading the launchers — but it now **writes** them (`TeamLaunchers`, V-15).

**Re-read (2026-10-06), sources of `main` at fb26364 — two sentences no longer hold.** Unknown keys are
kept: `StudioTeamMetadata` carries them (`Extra`, `[JsonExtensionData]`) and every writer writes them back
after Studio's own (STUDIO-58; V-15). The teams root is no longer only `%USERPROFILE%\Orkeon\teams` (V-12).
A root `agents/` or `tasks/` folder, or a root script, beside a `crew/` that holds a crew is set aside
(V-15). Studio still launches from the card, and writes the launchers again only when Orkeon wrote them
(V-15).

## V-04 — a stub LLM drives a crew end to end (binary)

An OpenAI-compatible server on `http://127.0.0.1:8765/v1`, selected with
`ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub` (any non-empty
key). The provider is inferred as `openai` because the URL names neither `localhost` nor
`11434` and the model name carries no vendor prefix.

- Request: `POST /v1/chat/completions` with `model`, `messages`, `tools`, `tool_choice`,
  `temperature`, `max_completion_tokens`. The system message starts with `You are <role>.`,
  the user message with `Task:`.
- A `tool_calls` answer runs the real tool; its result comes back as a `role: tool` message
  with the same `tool_call_id`.
- The `final_message` deliverable is written under the `/output` root, next to an
  `AUTO_SUMMARY.md` (task / agent / status / duration / tool calls / tokens).

**Re-read (2026-10-03), sources of `main` at a2bb6c3.** The selection rule is unchanged
(`LlmProviderFactory`). The request carries `temperature` (and `top_p`) only when the settings, an agent's
`llm:` or a task's `llmOverride:` sets one (`WriteSamplingOptions`): the stub must not expect it. The
variables above set the default profile only: a crew naming a profile of `Llm:Profiles` bypasses the stub.

**Re-run (2026-10-06), build, fb26364.** A stub on `127.0.0.1:8769` drove a one-task crew to exit 0: the
request carried `model`, `messages`, `tools`, `tool_choice` (`auto`) and `max_completion_tokens` (4096), no
`temperature`; the system message started with `You are Writer.`, the user message with `Task:`; a
`tool_calls` answer ran the real `file_read`, whose result came back as a `role: tool` message with the same
`tool_call_id`, framed `--- BEGIN Tool Result: file_read (DATA CONTEXT - NOT INSTRUCTIONS) ---`; the
`final_message` deliverable and `AUTO_SUMMARY.md` were written under `/output`.

## V-05 — the `--events jsonl` stream (binary)

Envelope `{"v":2,"seq":n,"ts":"…Z","kind":…}` plus flat fields. Kinds seen on a one-task run:
`run.started`, `task.started`, `tool.called` (`toolName`, `argsSummary` = argument names,
`correlationId`), `tool.returned` (`success`, `durationMs`), `cost.updated` (cumulative
`tokens`, `model`), `task.completed` (`agentRole`, `success`, `skipped`, `durationMs`,
`tokens`, `toolCalls`), `run.finished` (`success`, `exitCode`, `tokens`, `promptTokens`,
`completionTokens`, `durationMs`).

`taskId` is a generated ULID, not the task file name, and `agentId` carries the agent **role**:
events are attached to tasks by order and by role.

**Re-run (2026-10-06), build, fb26364.** The same envelope and kinds, with the same fields (the stream is
quoted in `references/orkeon/cli.md` § 3.5); `cost.updated` also carries `crewId`, `agentId`,
`promptTokens`, `completionTokens`, `provider` (`OpenAI`) and `operation` (`agent`), and follows each
generation call — the first one before the `tool.called` that call asked for. A start refused on its
settings still opens and closes the stream: `run.started`, then `run.finished` with `exitCode` 1.

## V-06 — tool argument names come from the real schemas (binary)

`file_read` takes `path` (required), then `encoding`, `max_length`, `use_raggable_cache` — not
`file_path`, as the first, hand-written catalogue said. A scripted tool call with a wrong argument
name fails inside the tool (`Error: Required parameter 'path' is missing`) and the run still
"succeeds".

**Regenerated (2026-10-02), on `main` at 24ab0d0.** An agent listing every tool of `orkeon run
--list-tools` was run against a stub that recorded the `tools[]` of the request: all 80 resolve, and § 5
of `references/orkeon/orkeon-reference.md` is generated from those schemas (`orkeon-bench tools dump`
does the same on any version). Facts that came with it: the naming is not uniform (`docx_*` and
`xlsx_*` take `file_path`, the other file tools `path`); 23 tools reach the model with an **empty
parameter schema**, 17 of them although their request classes take arguments (`memory_store`:
`operation`, `category`, `content`, `id`; `session_store`, `session_snip`; 14 code-analysis tools) — the
model calls them blind, with their defaults; on `main`, `email_parser` takes `path`, `offset`,
`max_chars` (rebuilt on MimeKit, `.msg` no longer read). The eval file `layout` compares the catalogue
of the two check scripts with that section and, when the installed `orkeon` is that version, with
`orkeon run --list-tools`.

**Re-read (2026-10-03), sources of `main` at a2bb6c3 — to regenerate.** § 5 of `orkeon-reference.md` still
holds the 24ab0d0 tables; its prose says so. Known changes: `image_generation` no longer takes `api_key` (it
reads the `OPENAI_API_KEY` secret, `ORKEON_OPENAI_API_KEY`); `index_codebase` no longer reads
`include_statements` nor the three `summarizer_*` fields; `rag_search`, `rag_ingest`, `rag_eval` are listed
(V-01). The 17 empty-schema request classes still carry no `[FieldSchema]`. A result now reaches the model
truncated, then framed as `--- BEGIN Tool Result: <tool> (DATA CONTEXT - NOT INSTRUCTIONS) ---` (the
`email_*` tools excepted), and a call the Guardian refuses returns `Error: Blocked by Guardian (…)`. Run
`orkeon-bench tools dump` on the a2bb6c3 build and replace the tables.

**Re-run (2026-10-06), build, fb26364.** The tables of § 5 of `orkeon-reference.md`, regenerated since on the
a2bb6c3 binary (2026-10-03, its § 5 says so), were compared with the `tools[]` a stub recorded from an
agent naming the 83 tools of `--list-tools`: the same 83 names, descriptions, argument names in the same
order and required arguments — no difference; 23 empty schemas, the same tools. `file_read` called with
`file_path` came back `Error: Required parameter 'path' is missing` (not framed), `tool.returned` said
`success: false`, and the run exited 0. **Regenerated (2026-10-06), binary, fb26364**
(`1.0.0-rc.4.src.20261005.gfb26364`): `orkeon-bench tools dump` gave the tables of § 5 again, cell by cell
— the 83 names, every description and argument list, the same 23 empty schemas. The request classes of the
17 tools that take arguments without sending a schema (`src/analysis`, `src/tools/Orkeon.Tools.Analysis`,
`MemoryStoreTool`, `SessionStoreTool`, `SessionSnipTool`) are unchanged since a2bb6c3 (sources).

**Regenerated (2026-10-07), build, 77ac8a9** (`1.0.0-rc.4.src.20261006.g77ac8a9`). `orkeon-bench tools dump`
gave the 83 names, the same argument lists and the same 23 empty schemas; three descriptions differ from
the fb26364 tables, and § 5 of `orkeon-reference.md` now carries them — `email_folders` names the role
`all`, `email_search` says it returns one page that can be shorter than `limit` and is read on with
`next_cursor`, `email_delete` says it returns each deleted id with its new id in the trash. What stands
behind them (sources, Orkeon's MAIL-07): a search result gains `total` (the matches of the folder, every
page counted; IMAP, not with `has_attachments`), a folder gains `also_roles` (on Gmail, `archive` opens All
Mail), a delete result gains `messages[]` of `{id, new_id}`; the refusals of a foreign cursor, of a failed
connection and of a recipient that is not an address changed their text. No argument was added, removed or
renamed; the descriptions of `folder` (it names `all`) and of `limit` (a ceiling) changed.

## V-07 — the shipped CLI loads no plugins (sources)

No binary shipped by Orkeon calls `AddOrkeonPlugins` (`docs/architecture/plugins.md`). A C# tool
reaches a YAML or TypeScript team only through the harness runner `orkeon-harness-run`
(`Orkeon.Hosting` + `Orkeon.Plugins` built from the sources), or through a C# host. Studio on
the host launches the real `orkeon` and cannot see such tools. A plugin tool must implement
`ITool` (derive from `ToolBase`): an `IBaseTool`-only tool shows in `--list-tools` and then
fails crew resolution under `StrictTools`.

**Re-read (2026-10-03), sources of `main` at a2bb6c3 — the first half holds, the second no longer.** Still no
shipped composition root calls `AddOrkeonPlugins`. `ITool` is deleted (d003b672): `ToolBase` implements
`IBaseTool`, `CrewFactory` attaches any registered `IBaseTool`, and the default `ToolRegistry` of
`AddOrkeonInfrastructure()` is seeded from DI (`ServiceProviderToolRegistry` is gone): a name belongs to the
first tool registered under it, a plugin or MCP homonym is refused, two DI tools with one name stop the host.

**Re-read (2026-10-06), sources of `main` at fb26364 — still holds.** `AddOrkeonPlugins` is named in
`src/plugins/Orkeon.Plugins` alone: no shipped composition root calls it; `src/plugins`, `ToolRegistry` and
`docs/architecture/plugins.md` are unchanged since a2bb6c3. One precision on the paragraph above: a plugin
registers its tools in DI (`IOrkeonPlugin`: `services.AddSingleton<IBaseTool, T>()`), so a plugin tool
named like a built-in is one of the "two DI tools with one name" that stop the host (`Two registered tools
are named '…'`, the `ToolRegistry` constructor); only a tool registered later through
`RegisterToolAsync` — an MCP server's — is refused, the holder keeping the name.

## V-08 — there is no runtime resume (sources)

`ICheckpointManager` and `IResumeEngine` exist, but nothing in `orkeon run` calls them (there
is no `--resume`), and the orchestrator writes its checkpoints only after the whole run; a
run that throws keeps none. Resume and incremental processing are designed into the team: a
state registry under a writable root, idempotent tasks, units of work.

**Re-read (2026-10-03), sources of `main` at a2bb6c3 — still holds.** The checkpointing code is unchanged;
`SequentialCrewOrchestrator` still checkpoints the task outputs after the strategy returns and marks the
session failed when it throws; a crew still gets a fresh id at every load. New, and no resume: a crew with
`memory: true` recalls the outputs earlier runs of a crew of the same `name:` stored, when the settings give
a durable store (`Memory:Provider`, or `memoryProvider` with its `Orkeon:<Type>` section) —
`references/orkeon/resume-and-memory.md` § 2.1. In every mode a failed task now fails the run (exit 2).

**Re-read (2026-10-06), sources of `main` at fb26364 — still holds.** The checkpointing code
(`Services/Checkpointing`, `Interfaces/Checkpointing`, `Infrastructure/Checkpointing`) is unchanged since
a2bb6c3, `orkeon run` has no `--resume` and names neither `ICheckpointManager` nor `IResumeEngine`;
`SequentialCrewOrchestrator` gained the crew's request window only (V-14). A memory provider type that
names no provider no longer runs in memory with a warning: it is refused (V-13, V-14).

## V-09 — packages missing from nuget.org are packed from the sources (sources, binary)

`Orkeon.Plugins` and `Orkeon.Hosting` are `IsPackable=false` and their dependencies do not
exist as standalone packages at rc.4. `csharp/scripts/build-orkeon-packages.sh` packs the whole
dependency closure into `/usr/local/share/orkeon/packages`; the templates take every `Orkeon.*`
package from that feed.

## V-10 — Orkeon's sandbox root must be writable by every user (binary)

Each run creates `/tmp/orkeon-sandbox/<pid>-<stamp>`. When the parent folder belongs to root
with default permissions (left by a check run as root during the image build, or by a
`sudo orkeon` later), every run of `node` aborts with
`UnauthorizedAccessException: Access to the path '/tmp/orkeon-sandbox/…' is denied`, including
`--list-tools`. The image creates the folder with mode 1777 and the entrypoint restores it at
each start; `orkeon-bench doctor` shows the symptom as a failing tool catalogue.

## V-11 — a login shell must keep the image's PATH additions (binary)

`bash -l` rebuilds `PATH` from `/etc/profile` and drops `/usr/local/share/npm-global/bin`
(`claude`, `esbuild`): `.ork.ts` crews then fail for lack of esbuild.
`/etc/profile.d/orkeon-harness-path.sh` puts the image's directories back.

## V-12 — which folders Studio launches a team with (sources)

`Orkeon.Studio.Core`, `Teams/TeamMountPaths.cs` and `FileSystem/DeclaredMounts.cs` at
`v1.0.0-rc.4`. In the card, a physical segment starting with `./` names a folder **inside the
team** (`./input:/workspace:ro`, never `..`); Studio resolves it under the team folder before the
launch, which runs from that folder. Its wizard names the folder of `/workspace` `input` and the
folder of any other root after the root (`/rapports` → `./rapports`). A launch is **refused** when
a folder of the card is neither inside the team nor declared in Settings › Authorized folders
(`Orkeon:FileSystem:Mounts`, compared by physical folder); otherwise Studio adds
`--allow-external-mounts` when a folder lies outside the team. Hence the harness keeps the default
folders of a team inside it (D28) and puts the other mount sets outside, for the launchers and the
bench only: Studio runs the team's own folders. Studio's catalogue root is fixed
(`TeamCatalog.DefaultRoot()`: `%USERPROFILE%\Orkeon\teams`). **Re-read at a2bb6c3**: `TeamMountPaths.cs`
and `DeclaredMounts.cs` are unchanged since 24ab0d0; `RunArgumentsBuilder.Validate` also refuses a mount
entry starting with `-` (`STUDIO-LAUNCH-MOUNT-DASH`), which a card's `./` or absolute entry never does.

**Re-read (2026-10-06), sources of `main` at fb26364 — the catalogue root is no longer fixed.**
`TeamMountPaths.cs`, `DeclaredMounts.cs` and `RunArgumentsBuilder.cs` are unchanged since a2bb6c3: the
folders Studio accepts, and the refusal on the Authorized folders of Studio's own settings, are as above.
The root is chosen once at startup by `TeamsRootLocator.Resolve` (STUDIO-61): the variable
`ORKEON_STUDIO_TEAMS_ROOT`, then the `--teams-root` option of the Studio application, then the preference
of Settings › Studio (`ui-preferences.json`), then `TeamCatalog.DefaultRoot()`; a fully qualified path
only, a relative or blank value skipped, the folder not required to exist. The run TUI reads the variable
alone. So a workshop anywhere on the Windows host is Studio's catalogue once the root is its `teams\`.
Before a launch Studio now creates a missing writable folder of the team and refuses a missing read-only
one (`TeamFolderPreparation`, STUDIO-60; V-15).

## V-13 — where a run reads its LLM settings, and when it falls back to echo (binary, sources)

`main` at 24ab0d0, `orkeon run crew --validate -v 1` (the `LLM resolved:` line, or the echo warning) on a
one-task crew; `RunnerHost.Build`, `RunnerSettings.ResolveSettingsPath`, `LlmProviderFactory`. A run
reads, lowest to highest: the `DOTNET_*` variables (the host configuration, chained under the app
configuration — `DOTNET_Llm__Model` is applied), `appsettings.json` then `appsettings.<environment>.json`
of the working directory, the unprefixed variables (`Llm__Model`), **one** settings file (`--settings`,
else `appsettings.json` next to the crew, else `appsettings/appsettings.json` walking up, or the legacy
`_shared/appsettings.json` of a folder that has none, else the user's file), the `ORKEON_*` variables.
Keys are case-insensitive, and a JSON property `"Llm:Model"` is read as a path; comments and trailing
commas are accepted. The echo provider runs only when no `Llm` section exists: `"Llm": {}` and
`"Llm": null` give echo, while `"Llm": []`, `"Llm": "x"`, `{"Llm":{"Model":null}}` and `ORKEON_Llm=x`
create the section and resolve the default model (`gpt-5.6-sol`, OpenAI's).
`ORKEON_Llm__Model=` (empty) crashes the run. **No `Provider` key is read**: the provider follows the
base URL, then the model name, then the key. The remote rule of the bench and of `run-gate.sh` stands on
this (`FROZEN-LITERALS.md` § 3); at 1.0.0-rc.4 the harness let a `Provider` key decide and read the user's
file alone.

**Re-read (2026-10-03), sources of `main` at a2bb6c3** (`RunnerSettings.ComposeSources`,
`LlmSettings`, `RunnerHost.ElectLlmProfile`; **binary, a2bb6c3**, for profiles: an agent naming `llm: { profile:
writer }` called only that profile's model, with no `temperature`; a run whose default `Llm` endpoint does not
answer stops at start, `No reachable LLM endpoint`, even when every agent names a profile). The resolution chain is unchanged (`--settings`,
`crew/appsettings.json`, `appsettings/` or `_shared/` walking up, the user's file, also under `%APPDATA%`
on Windows). The layers are now three, lowest first: the unprefixed variables, the one settings file, the
`ORKEON_*` variables — the working directory's `appsettings[.<environment>].json`, `<binary>.settings.json`,
the user secrets and the `DOTNET_*` host configuration are cleared and read by nothing. A default provider
exists only when `Llm` holds a non-blank value outside `Profiles` (`LlmSettings.HasDefault`): `[]`, `"x"`,
`{"Model": null}`, `{"Thinking": {}}`, `ORKEON_Llm=x`, `Profiles` alone or all-blank values now give echo; a
blank value reads as absent, so `ORKEON_Llm__Model=` no longer crashes; a section without `Model` runs on
the inferred provider's own default model, no longer `gpt-5.6-sol` everywhere; an unset `Temperature` is
not sent (it was 0.7). New: `Llm:Profiles:<id>` — named providers of the same shape, from every layer
(`ORKEON_Llm__Profiles__<id>__*` alone creates one) —, which a crew names (`llm: { profile }`,
`llmOverride: { profile }`, `llm.profile(…)`, `.withProfile(…)`), as do `Orkeon:Rag:LlmProfile` and
`orkeon run --llm-profile <id>`, which makes one the run's default whole. `ApiKeyEnvVar` in any section
names the variable holding its key (process environment; on Windows then the user scope). **Impact**,
fixed in the same migration: the remote rule of the bench and of `run-gate.sh` now judges the default and
every named profile — the run is remote when one of them is — and reads the three layers only; the stub
and a named bench profile are injected over every named profile, `ApiKeyEnvVar` blank
(`references/orkeon/llm-profiles.md` § 8; `bench-contract` and `run-gate` cases).

**Re-read (2026-10-06), sources of `main` at fb26364** (`RunnerHost.Build` and `ValidateSettings`,
`SettingsValidation`, `LlmSettings`, `DoctorCommand.CheckRunnerSettings`; `RunnerSettings.cs` is unchanged:
the same chain, the same three layers) — **and build, fb26364, for what follows.** Every setting a host
reads is judged at its start (GAP-40), on `--validate` and `--list-tools` too, one `ERROR:` line and exit 1:
`Llm:Provider is not a setting: Llm carries Profiles, AvailableModels, BaseUrl, ApiKey, ApiKeyEnvVar, Model,
Temperature, MaxTokens, TimeoutSeconds, MaxRetries, Thinking, Grammar.` — from the file, from
`ORKEON_Llm__Provider` and from the unprefixed `Llm__Provider` alike, and `Llm:Profiles:<id>:Provider` the
same way; `RateLimiting:MaxConcurentRequests` and `Orkeon:Guardian:Enabeld` (`Did you mean …?`);
`Orkeon:Guardain` and `Orkeon:Studio` (`is not a section Orkeon reads`); `Llm:TimeoutSeconds` `"600s"`,
`Llm:Thinking:Enabled` `"yes"`, `Llm:Temperature` `"NaN"`, a `${NAME}` `ApiKey`, `Orkeon:Guardian:Enabled`
`"oui"`; `Memory:Provider` `sqlight`, and `lancedb` without `Orkeon:LanceDb:Endpoint`; an unknown
`Orkeon:Rag:Profile`, `Orkeon:Embeddings:Provider` or `Logging` level. Passed: keys in lower case, an
unknown section at the root, `Orkeon:Host`, an e-mail account holding an unknown key, and the harness's
`ORKEON_WORKSHOP`, `ORKEON_HARNESS_OFFLINE` and Studio's `ORKEON_STUDIO_TEAMS_ROOT` in the environment.
Every settings key the references cite passed the start validation. `orkeon doctor` has eleven checks;
`runner-settings`, after `llm-profiles`, said `the settings pass the start validation of orkeon run` on a
valid file and `fail` with the same sentence as the run on the others (exit 1). Under `--events jsonl` a refused setting
gives `run.started`, then `run.finished` with `exitCode` 1. **Impact**: Orkeon still reads no `Provider`
key, but one now stops every run, as does any invented `ORKEON_<Section>__…` or `<Section>__…` variable of
a section Orkeon reads; a team settings file is judged whole at each run of its team.

## V-14 — keys the loader reads and the engine drops (binary, sources)

`main` at 24ab0d0, a stub LLM recording the requests (lot 1, design probes); `CrewFactory.CreateAgentsAsync`
never calls `WithLlmConfig` nor `WithGuardrails`, `ChatOptionsComposer` takes the agent's tools only. An
agent with `temperature: 0.22`, `maxTokens: 777` under a crew `llm` of `0.11` sent `0.7` / `4096`; the
agent's guardrail rule was absent from the system prompt, while the task's rule and its `llmOverride`
(`0.33` / `555`) were sent. A task's `tools: [count_pattern]` left the request with the agent's tools
only. `maxRpm: 1` let the second call go 0.17 s after the first. A TypeScript agent's `.llm(…)` is dropped
the same way. `--validate` accepts all of them; `check_crew.py` refuses an agent's or the crew's `llm`, an
agent's `guardrails` and a task's `tools`, and warns about `maxRpm`; `check_team.py` refuses `.llm(…)`
(`orkeon-reference.md` § 1).

**Re-read (2026-10-03), sources of `main` at a2bb6c3 — most of it no longer holds** (**binary, a2bb6c3**, for an agent's `llm.profile` and for
`circuitBreaker:`, refused by `--validate` with `Crew YAML uses removed key(s)`; the rest from the sources).
`CrewFactory.CreateAgentsAsync` now calls `WithLlmConfig` and `WithGuardrails`: an agent's `llm:` block (the
crew's merged in) reaches every call — `profile`, `model`, `temperature`, `maxTokens`, `topP`, `thinking`,
`responseFormat`, `responseSchema`, `cache` —, a task's `llmOverride` (now with `profile`) winning for its
task; an agent's guardrails render before its task's, and an unknown `preset` fails the load. A task's
`tools:` reach its agent for that task (`TaskToolbelt`). `.ork.ts` lost `llm.openai()` and its siblings:
`.llm(llm.profile(…))`, `.llm(llm.model(…))`, `llm.default_` and `.withProfile(…)` remain. `maxRpm` is still
read by no limiter; crew and task `circuitBreaker:` are refused at load. The refusals of `check_crew.py` and
`check_team.py` listed above are now stricter than Orkeon; they also keep crews off named profiles, which
the run gate does not judge.

**Re-read (2026-10-06), sources of `main` at fb26364** (`RequestRates`, `LlmCallGate`,
`RateLimitedLlmProvider`, `LlmRateLimiter`, `CrewDefinitionValidator`, `YamlCrewMapper`, `JsAgentBuilder`,
`JsCrewBuilder`) — **and build, fb26364, with a recording stub, for what follows.** `maxRpm` is applied
(GAP-38): an agent with `maxRpm: 1` and two tasks sent its second request 60.2 s after the first, the run
logging `Agent Writer waited 59.8 s for its model request: agent 'Writer' maxRpm 1` and exiting 0. The crew
key `maxRpm:` (and `max_rpm:`) loads; `maxRpm: 0` on an agent or the crew, `maxRpm: -1` and `maxIter: 0`
on an agent fail `--validate` (`Invalid crew configuration: Agent 'writer' maxRpm: 0 — the model requests
the agent may make per minute must be 1 or more. Leave maxRpm: out for no limit of its own.`; `… maxIter: 0
— the turns the agent may take on a task must be 1 or more. Leave maxIter: out for the default (20).`); in
`.ork.ts`,
`.maxRpm(n)` exists on the agent and the crew builders, and `.maxRpm(0)` fails the load. The validator
names an agent or a task by its key (`Agent 'writer' must have a goal.`, `Task 'write' must have an
expected output.`), and a dangling `agent:` or `dependencies:` entry fails `--validate` (`A task reference
names nothing: …`). An unknown `memoryProvider` fails the load (`memoryProvider: is 'Sqlight', which is not
a memory provider: …`); `circuit_breaker:` and an unknown key still pass; `rag.provider` still warns. The
points of the 24ab0d0 probe, run again: an agent with `temperature: 0.22`, `maxTokens: 777` under a crew
`llm` of `0.11` sent `0.22` / `777` (`max_completion_tokens`), its task's `llmOverride` `0.33` / `555` for
that task; the agent's guardrail rule was in the system prompt of both its tasks, the task's rule in its
own; a task's `tools: [count_pattern]` joined the agent's `file_read` for that task only. From the sources,
not run: `RateLimiting:AgentRequestsPerMinute` bounds each agent instance's window with its `maxRpm`, the
stricter winning, and waits; the global, per-provider and concurrency caps take one lease per model call at
the provider's entrance, a refusal being retried five times before the call fails; the C# default of
`MaxIterations` is 20. `check_crew.py` follows in the same migration: its `maxRpm` warning is gone, and a
`maxRpm` (agent or crew) or a `maxIter` below 1 is an error (`… must be a whole number, 1 or more: Orkeon
refuses the crew at load …`).

## V-15 — what Orkeon Studio does with a workshop team (sources, `orkeon-studio-check`)

`main` at 24ab0d0, `src/apps/Orkeon.Studio.*`, read for the review of 2026-10-02; re-checked at a2bb6c3
(below). **Catalogue**:
`TeamCatalog.DefaultRoot()` is `%USERPROFILE%\Orkeon\teams`, which nothing configures; every folder one
level below is listed, with or without a card, except a dot folder and (Windows) a Hidden or System one;
no file watcher. **Detection** (`RunTargetDetector.DetectDirectory`): the root of the team is read first —
an `agents/` or `tasks/` folder there makes the team folder itself the crew and `crew/` is ignored (the
run then fails on the missing `config.yaml`), a root `*.ork.ts` runs or asks — and `crew/` only when the
root holds no crew; the run path is then `crew` or `crew/crew.ork.ts` and the working directory the team
folder, as for the launchers (V-02). **Card**: `StudioTeamMetadata`, read with default JSON options
(case-sensitive, no comment, no trailing comma; a wrong type drops the whole card silently, the team then
launches without mounts) and rewritten after every real run (`lastRunAt`, nulls, escaped accents, unknown
keys dropped); `schedule` is displayed only. **Mounts** (`DeclaredMounts.BlockingFolders`): `./` alone is
refused like an undeclared outside folder; a declaration matches on the physical folder spelled exactly;
a missing folder is not created by a launch (only when Studio writes the card) and `orkeon run` refuses
it. **Settings**: no `--settings` unless an Expert pins one in Run › Advanced options (for the whole form, until
Studio closes); the model comes from Studio's settings, or from the profile the card names (variables
`ORKEON_Llm__*`), which Studio writes only when its wizard adopts a team. **Actions**: Rename moves the
team folder alone, Duplicate makes `<slug>-copy`, Delete removes the team folder, Modify (YAML) writes
`forge.json` and re-adoption regenerates `crew/` and the launchers. The terminal launcher
`orkeon-studio-run` reads no card at all. **Checked with Studio's own code**: `Orkeon.Studio.Core` is a
`net10.0` library without WPF, packed into the local feed; `orkeon-studio-check` (csharp/OrkeonStudioCheck)
runs it against the teams of the workshop — its tests and the `bench-contract` evals pass a scaffolded team
and catch a root `tasks/` folder, the team folder as a mount point, an outside folder until it is
authorized, an unreadable card, a missing folder and a card out of step with `mounts.json`.

**Re-checked at a2bb6c3** (`1.0.0-rc.4.src.20261003.ga2bb6c3`, 2026-10-03, sources:
`git log 24ab0d0..a2bb6c3 -- src/apps` and the files above). **Unchanged**: `RunTargetDetector`,
`CrewDirectoryLayout`, `TeamMountPaths`, `DeclaredMounts`, `LaunchTabViewModel` and `ForgeRename` are
byte-identical; `TeamCatalog` changed in comments only (same root, listing, card keys, strict reading,
rewrite after a run, Duplicate and Delete); a schedule is still installed by `forge schedule` from
`forge.json` only; the wizard still names the folder of `/workspace` `input`, inputs `ro`, outputs `rw`
(its folders now come from the need, STUDIO-46/47). **Changed**: (1) `RunArgumentsBuilder` writes every
single-value option attached (`--settings=<file>`; sequences such as `--mount a b` unchanged) and refuses a
mount or a variable starting with `-` (a2bb6c37). (2) The model (fe2c0fcd, 21775956): every Studio
model setting is mirrored into `Llm:Profiles:<FolderSlug of its name>` of Studio's settings (no key,
`ApiKeyEnvVar` naming its variable) and every launch carries all of them as
`ORKEON_Llm__Profiles__<id>__*`, keys resolved through the key store; the card's `profile` still names a
setting by its exact display name (`ModelProfileSet.Find`, ordinal) and, when found, lays every modelled
`ORKEON_Llm__*` field, value or blank (`ModelProfile.EnvironmentOverrides`,
`MainWindowViewModel.TeamEnvironment`); no `--llm-profile` on a Studio launch. Studio still writes
`profile` only at adoption. (3) **Studio writes the launchers** (3741ded8, a2bb6c37:
`TeamLaunchers.Regenerate`, `TeamLauncherScript`), besides an adoption or re-adoption: for any folder with
`crew/`, a `run.sh` or `run.cmd` and a readable card — every scaffolded workshop team — at each save of
« Change the folders » and when the setting the card's `profile` names is created, renamed, removed or
offered to no crew (`HostProfilesChanged`, `HostLlmProfiles.MovedNames`); not on Rename, Duplicate or a
run. Both files are written whole: `orkeon run crew` (or `crew/crew.ork.ts`), `--settings=<Studio's
settings file>` if it exists, `--llm-profile=<id>` when the card's setting is offered, the card's folders
(`--mount` anchored to `%~dp0`/`$DIR` for the team's own, as written for one outside it, `--mount-id`
for a settings declaration) — no
`TEAM_ENV`, no `settings/<slug>/`; an identical file is left alone. `orkeon-studio-check` does not read the
launchers, so it does not see this; the Studio.Core APIs it calls are unchanged.

**Re-read (2026-10-06), sources of `main` at fb26364** (`git diff a2bb6c3 fb26364 -- src/apps`:
`Teams/TeamsRootLocator.cs`, `WorkshopLayout.cs`, `WorkshopSiblings.cs`, `TeamSettingsFile.cs`,
`TeamLaunchers.cs`, `TeamCatalog.cs`, `Targets/RunTargetDetector.cs`, `Launch/TeamFolderPreparation.cs`,
`LaunchTabViewModel.cs`, `TeamsViewModel.cs`, `MainWindowViewModel.cs`, `Orkeon.Studio.Run`;
`src/core/Orkeon.Domain/FileSystem/TeamLauncherScript.cs`, `Forge/ForgeRename.cs`; nothing of Studio was
run) — **most of the above no longer holds**; `TeamMountPaths`, `DeclaredMounts` and `RunArgumentsBuilder`
are unchanged. **Catalogue** (STUDIO-61): the root is chosen at startup — `ORKEON_STUDIO_TEAMS_ROOT`, then
`--teams-root`, then the preference of Settings › Studio, then the default (V-12); a root with `settings/`
and `workbooks/` beside it is a workshop (`WorkshopLayout.IsWorkshop`). **Detection** (STUDIO-59):
`DetectDirectory` probes `crew/` first, one step down; when it resolves to a crew it is the target,
whatever the root holds, and a root `agents/` or `tasks/` folder or a root script is named in a notice
(`STUDIO-TARGET-ROOT-SHADOWED`), not taken for the crew; a `crew/` that resolves to none leaves the root
under its former rules. `orkeon run <folder>` does the same for multi-file YAML layouts (V-02). **Card**
(STUDIO-58): read as before (default options, strict); written with `WriteIndented`, LF, no key for a
null, `UnsafeRelaxedJsonEscaping` (accents as letters), a final newline, UTF-8 without BOM, the keys
Studio does not model kept (`Extra`) and written after its own: a run adds `lastRunAt` and changes nothing
else. `forge rename` writes it the same way. **Mounts** (STUDIO-60): before Run, Run with `--validate` and
Replay, `TeamFolderPreparation.Prepare` creates a missing writable folder of a well-formed `./x` entry and
refuses the launch on a missing read-only one, naming the folder and its mount point; nothing outside the
team, no `.gitkeep`. **Settings** (STUDIO-62): `TeamSettingsFile.Find` gives
`<root>/../settings/<folder name>/appsettings.json` when the team folder sits right under the root and the
file exists, and the launch passes it as `--settings=<path>` — under an Expert pin, above the CLI's chain;
the Test screen's trial and the run TUI (from the variable) do the same. The `ORKEON_Llm__*` overlay is
unchanged: without `profile` in the card only `ORKEON_Llm__Profiles__<id>__*`; with one, that setting over
`Llm`. A renamed setting rewrites the `profile` of the cards naming it (`TeamCatalog.RenameSetting`,
STUDIO-52). **Actions** (STUDIO-64), in a workshop only: Rename moves `workbooks/`, `tests/`, `settings/`
and each `mounts.<name>/` of the slug after the team folder (a taken destination refuses it first);
Delete moves the team folder then its trees under `archive/<slug>/<kind>/` (`-2` when taken); Duplicate
copies `settings/<slug>` to `settings/<slug>-copy` and nothing else. Outside a workshop, as above.
**Launchers** (STUDIO-63): `TeamLaunchers.Regenerate` and `WritePortable` write nothing when a launcher
present lacks Orkeon's header (`TeamLauncherScript.CarriesHeader`: `Generated by Orkeon Forge for the team
'`, or the rc.4 `Generated by Orkeon Forge (session '`, in one of the first three lines after `# `, `rem `
or `REM `) and answer `ForeignKept`: the launchers of `orkeon-bench scaffold` are left as they are, at
« Change the folders » (which still rewrites the card's `mounts`), at a change of the card's setting, at an
import and before a schedule is installed. The run TUI `orkeon-studio-run` still reads no card for its
launch; it now stamps `lastRunAt` and passes the team settings file. `orkeon-studio-check`, its tests and
the `bench-contract` cases move in the same migration (a root `tasks/` folder beside `crew/` passes; a
missing writable folder is no longer a problem, a missing read-only one is): they are run by the image
build, not by this re-read.

## V-16 — what a hijacked agent reaches (binary)

`main` at 24ab0d0, in the image, 2026-10-02: a stub LLM played an agent taken over by its input, one
scripted tool call per step, on a team with `/notes` (ro) and `/reports` (rw), the key in the run's
environment only (`ORKEON_Llm__ApiKey=<canary> ./run.sh`). **The VFS holds**: `file_read` of
`~/.config/Orkeon/appsettings.json` or of `/workspace/settings/<slug>/appsettings.json` came back `No mount
found for virtual path …`; `file_write` to `/notes/…` and to `/crew/…` came back `Access denied … required
Write, effective ReadOnly`; `/reports/…` was written. **`shell_command` does not**: `cat
~/.config/Orkeon/appsettings.json` returned the machine's settings, and `cat /proc/self/stat` then `cat
/proc/<its parent>/environ` returned every variable of the `orkeon` process, the canary key included — the
reduced environment Orkeon gives the child is no protection. The check scripts warn on `shell_command`
(refuse it next to a mail account); `reliability/security.md` § 7 says so.

**Re-read (2026-10-03), sources of `main` at a2bb6c3 — still holds** (not yet run). `ShellCommandTool` is
unchanged (same allowlist, same reduced child environment, no confinement). Every tool call now crosses the
Guardian's tool phase (`ToolGuard`), which stops none of the reads above: `shell_command`'s `command` is
screened for SQL-injection patterns only; a `path` argument holding `~` or `..` is refused, which the VFS
already did. A key named by `ApiKeyEnvVar` is read from the process environment on Linux — never copied, but
present in `/proc/<pid>/environ` as before; only Windows' user scope keeps it out. Settings files written by
Orkeon or Studio now name key variables rather than hold keys, but a profile's `ApiKeyEnvVar` can name any
variable, and `cat` still reads the file.

**Re-read (2026-10-06), sources of `main` at fb26364 — still holds** (not run). `ShellCommandTool.cs` and
`ToolGuard.cs` are unchanged since a2bb6c3; `Orkeon:Tools:Shell` is now bound once (`ShellToolOptions`) and
judged at the host's start, with the same three keys and the same effect.

## V-17 — Claude Code applies the approval hook, the user-gate guard and the start-up doctor (live session)

Claude Code 2.1.292, 2026-10-06: headless sessions (`claude -p`, model haiku) opened on a scratch workshop
with this harness deployed as `.claude/` (the sources of that day, `orkeon-bench` 0.1.0 on the `PATH`), a
tap added to its `settings.json` to keep the payloads of the three events. Not in the image, and not in
an interactive session.

- **`/team-init demo`** ran `skills/team-init/scripts/team-init.sh` and handed over: `STATUS.md` in phase
  `need`, `DEC-0001`, `tests/demo/`, no `teams/demo/`.
- **`/team-approve need` without a `NEED.md`** was stopped before the model: `UserPromptExpansion operation
  blocked by hook: team-approve: nothing recorded — gate 1 of \`demo\` validates \`NEED.md\` (missing) …`,
  and `STATUS.md` was left as it was.
- **`/team-approve need` with a `NEED.md`**: both prompt events fired for the one typed line —
  `UserPromptExpansion` first (`expansion_type: slash_command`, `command_name: team-approve`,
  `command_args: need`, `command_source: projectSettings`, `prompt: /team-approve need`), then
  `UserPromptSubmit` with the raw line in `prompt`, not the body of the skill. The gate was recorded
  once (`gate_passed: need`, `next_action: /team-test-plan demo`, one `/team-approve` journal line), and
  the model reported it from the `additionalContext` of the hook. A command that no skill declares was
  not tried: the skill `team-approve` exists so that the line is one.
- **The resume**: `/team-status demo` in a new session read the state back from the files.
- **The interview of `/team-need`**, over three turns (model sonnet, team `notes-digest`, a brief in the
  arguments). First turn: `NEED.md` written from the template, the brief under `## Purpose`, `TBD`
  elsewhere, then **one** question with its recommended option first — as text: a headless session has no
  AskUserQuestion to answer — and, nobody answering, a journal line `/team-need — interview paused at …`
  with `next_action: /team-need notes-digest`. Second turn (`claude -c -p`, an answer): the answer written
  under `## Actors` and `## Triggers and scheduling` before the second question, again a single one.
  Third turn, a **new session** (`/team-need notes-digest`, no conversation behind it): the interview
  resumed at `## Inputs`, the first section still open, without asking again what the file held — the
  resume a `/clear` leaves. `gate_passed` stayed `null` throughout. One slip seen: the second turn
  rewrote the "paused at" journal line instead of adding one; the skill now says the journal only grows.
- **The user gate**: asked to edit `gate_passed: need` into `gate_passed: test-plan`, the model was
  denied by `guard-phase` and quoted the refusal; the file did not change.
- **`session-doctor`**: with two checks failing (`esbuild`, `typings`), the model quoted the
  `session-doctor:` message and both `FAIL` lines — `additionalContext` of a `SessionStart` hook reaches
  the model in a headless session. The first run reported nothing: `orkeon-bench doctor -q` writes its
  lines on stderr, which the hook dropped; fixed that day, with an eval whose stand-in writes on stderr.
- **After the review fixes** (the same day, the final hooks, the pilot deployed under
  `library/examples/`): `/team-init --light demo`, then `/team-approve need` — blocked while the three
  artefacts of the light track were missing, recorded once they existed (`phase: test-plan`,
  `gate_passed: test-plan`, one journal line), the pilot, which waited for gate 1 too, left alone; both
  events carried the same `prompt_id`. In that session the model answered that nothing had been recorded:
  it looked for a message *starting* with `team-approve:`, where Claude Code presents the hook's context
  as `UserPromptExpansion hook additional context: team-approve: …`. The skill `team-approve` now quotes
  that form and reads the journal before concluding; three approvals on three teams were then reported
  as recorded. A `sed -i` of `gate_passed` asked through the Bash tool was denied by `guard-user-gate`,
  the refusal quoted, the file unchanged.

Not checked: an interactive session (what the user sees of `systemMessage`, the interview of `/team-need`
through the AskUserQuestion tool, a literal `/clear` — a new session stands for it), `/team-decision` and
`/team-init --adopt` in a live session, the refusal shown for a `UserPromptSubmit` block, `/team-approve remote` in a
live session (the evals run the hook against the real `orkeon-bench attempt approve`), the image's own
copy of the harness, and the other probes of `README.md`.

## V-18 — `orkeon-bench` opens attempts, simulates the model and runs the first levels on the real binary

Orkeon built from `main` at fb26364 (a local build, started through a wrapper script; it prints
`1.0.0-rc.4`), `orkeon-bench` 0.1.0 of 2026-10-06, a throw-away workshop: a YAML team `notes-digest` with
`/notes` read-only and `/reports` written, two agents, scaffolded by the bench, one component scenario with
its reply script and its dataset. Not in the image. Run by the author of the commands, then replayed twice
by a reviewer who had not written them, with scripts of their own.

- **The sequence**: `attempt open --by team-build` → `run --level L2 --profile stub` (L0 pass, L1 skipped,
  L2 pass) → `report validate` (valid; not accepted, a criterion needing L3) → `attempt close --verdict
  ITERATE`. The scripted `file_read` really ran (`tool.called`, `tool.returned` with `success: true` in
  `events.jsonl`), the deliverable landed in `output-snapshot/reports/` and matched `expected/`.
- **What the hooks read**: `harness_open_attempt` finds the attempt while it is open and no longer after
  `close`; `approval_state` of `run-gate.sh` reads the marker `attempt approve` wrote as `ok`; over
  2.5 million reads during rewrites, `manifest.json` and `remote-approval.json` were never seen empty or
  broken.
- **Both dialects**: `llm-stub serve` drove the team's own `./run.sh` with `http://127.0.0.1:<port>/v1`
  (OpenAI chat completions) and with `http://localhost:<port>` (Ollama `/api/chat` and `/api/generate`).
- **A run on the stub does not call out**: with a listener standing for a remote provider, zero requests
  reached it for seven spellings of the caller's variables (`ORKEON_LLM__BASEURL`, lower case, mixed case,
  unprefixed, the `:` form), for a team settings file with a remote base URL, for a profile declared by
  variables, in the team's file or in the user's file — and, `orkeon` being started through `/bin/sh`
  (which drops a variable whose name is not a shell identifier), for profiles named `fast-remote`, `gpt.4`
  and `my profile`. Before the fixes the listener received the crew's prompts with a real bearer in both
  situations.
- **Nothing green without its proof**: with an `ACCEPTANCE.md` laid out as the template, a row at `L2`
  passes on an L2 run and rows at `L3`, `L4`, an unreadable level or an undeclared id stay `not_run`;
  declared invariants and indicators are `not_run` and their booleans false; a scenario covering ids
  without a check, a stray scenario file and an L2 with no scenario are red; `attempt close --verdict
  ACCEPTED` without a report that accepts exits 2.
- **Interruptions and races**: SIGTERM, SIGINT and SIGHUP mid-run give exit 130, the children gone, the
  temporary folder removed, a run manifest `interrupted`, no report; a run that ends after `attempt
  close` writes nothing into the attempt (exit 2); of several `attempt open` started together exactly one
  opens; a request dropped mid-body leaves the stub serving.

Not checked: the image (Node 24, the tests as root); a TypeScript crew on the binary; levels L1, L3 and
L4, which the bench does not serve yet; a Windows-mounted workshop with another program holding a file
the bench rewrites; `Orkeon:Embeddings`, judged from the sources as unable to reach a remote endpoint at
fb26364; the run gate's answer to `orkeon-bench run` in a live session. Known and left: a SIGKILL of the
bench leaves the `orkeon` child and the temporary folder, which the next `run` and `doctor` name.

## How to re-run

The stub and the one-task team used for V-01, V-02, V-04, V-05, V-06 and V-13 (`--validate -v 1` on
each variant of the settings), and the scripted stub probes of V-14 and V-16 (a stub that records the
requests, or plays one tool call per step), were hand-made. `orkeon-bench llm-stub serve --scenario
<reply script> --log <file>` now does both — a rule per step, every exchange logged — and the scripts
are kept as examples under `library/examples/` once the pilots have tests (lot 5). In the image:
`docker create` + `docker cp` + `docker start` + `docker logs` — `docker run -i` does not return output through the socket proxy of the
devcontainer. The **build, fb26364** points were run without the image (and the **build, 77ac8a9** ones the
same way, the CLI built with `-p:Version=1.0.0-rc.4.src.20261006.g77ac8a9`, the version the image gives it): a Release build of
`src/scripting/Orkeon.Scripting.Cli` in a checkout of fb26364, `dotnet …/bin/Release/net10.0/orkeon.dll`
with `HOME`, `XDG_CONFIG_HOME` and `TMPDIR` on a scratch folder, hand-made team folders, and a Python
HTTP stub on `127.0.0.1` (ports other than 11434) that records each request and answers a scripted
`tool_calls` or a final text with `usage`. V-15 is re-run at every image build — the tests of
`orkeon-studio-check` (`verify-templates.sh`) and the `bench-contract` evals, which run it on scaffolded teams — and
`orkeon-studio-check` checks the teams of a workshop at any time.
