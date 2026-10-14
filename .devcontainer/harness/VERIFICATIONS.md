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
V-01 and V-06 were run again on a build of it (**build, 77ac8a9**). `main` at 80fdefe
(`1.0.0-rc.4.src.20261007.g80fdefe`, 2026-10-07, 4 commits later — the last of them moves a submodule
pointer and nothing under `src/`) differs from 77ac8a9, under `src/`, in
`src/apps/Orkeon.Studio.Core` and `Orkeon.Studio.Wpf` (an E-mail settings tab, STUDIO-65 to 70),
`src/constants/Orkeon.Constants.Protocol/EmailEventKinds.cs`, `Commands/EmailCommand.cs` and
`EmailEventWriter.cs` (`orkeon email login --events jsonl`), `src/tools/Orkeon.Tools.Email` (a secret
variable is read in the Windows user scope too; `IEmailLoginInteraction`) and
`LLMs/Base/OpenAICompatibleProviderBase.cs` (streamed content arrays, LLM-08; `LlmEndpoints.cs` and two
provider files beside it change in their comments only) (`git diff 77ac8a9..80fdefe
-- src`, read on 2026-10-07): every entry checked at 77ac8a9 holds there as written, V-12, V-13, V-15 and
V-16 say what was re-read, and V-01 and V-06 were run again on a build of it (**build, 80fdefe**). `main`
at 812cd10 (`1.0.0-rc.4.src.20261008.g812cd10`, 2026-10-08, 2 commits later) differs from 80fdefe in five
files, none under `src/`: the pointer of the `backstage` submodule, and four files of
`tests/scripting/Orkeon.Scripting.Tests/`, where a bound of 5 seconds on a run becomes a hang guard of
20, and Jint's default promise timeout of 10 seconds one of 60 (`git diff 80fdefe..812cd10`, read on
2026-10-08). Every entry checked at 80fdefe therefore holds
there as written, none needed a re-read, and V-01 and V-06 were run again in a container of the image
built on it (**binary, 812cd10**). `main` at bd3420c
(`1.0.0-rc.4.src.20261008.gbd3420c`, 2026-10-08, 1 commit later — the settings catalogue, `orkeon settings`, the
notices of a section no shipped binary reads, the `install-channel` check of `orkeon doctor`, `orkeon --version
--verbose` and five installer lots: 162 files, `git diff 812cd10..bd3420c`, the `src/` part read in full on
2026-10-08) changes no fact an entry states — no tool, crew mode, loader key, mount rule, provider inference or
model reader is in it; the settings shapes now name their defaults on the shape, and the readers apply the same
values —; V-01, V-06 and V-13 were run again in a container of the image built on it (**binary, bd3420c**), and
V-21 records what is new. `main` at ce9ec1f (`1.0.0-rc.4.src.20261009.gce9ec1f`, 2026-10-09, 3 commits later — a
streamed call bounded whole and `Llm:StreamIdleSeconds` (LLM-12), Studio's E-mail tab, a SonarQube pass of 196 issues:
210 files, `git diff bd3420c..ce9ec1f`, the `src/` part read on 2026-10-10 for every file an entry cites) changes no fact
an entry states — the refactors keep each behaviour, the one removal is a warnings list nothing read —; V-01, V-06 and
V-13 were run again in a container of the image built on it (**binary, ce9ec1f**), and V-22 records the new key. `main`
at c39c5fa (`1.0.0-rc.4.src.20261011.gc39c5fa`, 2026-10-11, one commit later: Orkeon's `CLAUDE.md` rewritten and the
`backstage` submodule pointer, nothing else — `src/`, `tests/`, `docs/`, scripts and workflows byte-identical, GitHub
compare `ce9ec1f...c39c5fa`) changes no fact an entry states; what the entries cite from Orkeon's `CLAUDE.md` was re-read
in the new file (V-29). `main` at ad6dc63 (`1.0.0-rc.4.src.20261011.gad6dc63`, 2026-10-11, one commit later: a tool
schema carries only JSON Schema types and a dictionary is an object, LLM-13 — 31 files, under `src/` the schema
generation, the two schema formatters, `McpServer`, the tool base classes, `ToolParameterValidator` and the four
EventHub DTOs with a free `payload`, plus their tests, `CHANGELOG.md`, `docs/tools/new-tool-pattern.md` and the
`backstage` pointer) changes no fact an entry states outside the tool-schema facts, which V-32 re-reads. `main` at
23f4eae (`1.0.0-rc.4.src.20261012.g23f4eae`, 2026-10-12, four commits later: the forge offers the mailbox tools under a
mail trial and `EmailRightsCheck` refuses at crew load a run whose mail tools lack a right, FORGE-10; the setting
`Llm:CallMode` and the `llm.call.*` events, STUDIO-71; a tool call replayed whole; the tool-free final-answer turn always
given — 198 files) changes no tool contract and no loader key; the facts it moves — the exit codes, the event kinds, the
LLM settings, the end of `maxIter`, the forge's catalogue — are re-read in V-33, the rest holds as written. Each
entry says how it was checked: **binary** = run
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

**Re-run (2026-10-07), build, 80fdefe.** 83 names without configuration, the same list as at 77ac8a9, line
for line.

**Re-run (2026-10-08), binary, 812cd10.** 83 names without configuration, in a container of the image built
on it: the same list as in a container of the image built on 80fdefe, line for line (`diff` of the two
outputs).

**Re-run (2026-10-08), binary, bd3420c.** 83 names without configuration, in a container of the image built
on it: the same list as in a container of the image built on 812cd10, line for line (`diff` of the two
outputs).

**Re-run (2026-10-10), binary, ce9ec1f.** 83 names without configuration, in a container of the image built on `main`
at ce9ec1f (`orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`): the output of the image built on 812cd10 byte for byte, and of the
published image (80fdefe).

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

**Re-run (2026-10-07), build, 80fdefe** (`1.0.0-rc.4.src.20261007.g80fdefe`). `orkeon-bench tools dump` gave
the tables of § 5 again, cell by cell: the 83 names, every description and argument list, the same 23
empty schemas. No tool, request class or description is in the upstream change.

**Re-run (2026-10-08), binary, 812cd10** (`1.0.0-rc.4.src.20261008.g812cd10`). `orkeon-bench tools dump`,
run in a container of the image built on 812cd10 and in one of the image built on 80fdefe, gave the same
output, byte for byte: the tables of § 5 stand. Nothing under `src/` is in the upstream change.

**Re-run (2026-10-08), binary, bd3420c** (`1.0.0-rc.4.src.20261008.gbd3420c`). `orkeon-bench tools dump`, run
in a container of the image built on bd3420c and in one of the image built on 812cd10, gave the same output,
byte for byte: the tables of § 5 stand. The upstream change touches no tool, request class or description
(Studio's `ToolCatalog.cs` reads the name of the Brave key from a constant, the same value).

**Re-run (2026-10-10), binary, ce9ec1f** (`1.0.0-rc.4.src.20261009.gce9ec1f`). `orkeon-bench tools dump`, run in a
container of the image built on ce9ec1f: 83 rows, byte for byte the output of the images built on 812cd10 and on 80fdefe
(the published one) — the catalogue of `orkeon-reference.md` § 5 holds.

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

**Re-read (2026-10-07), sources of `main` at 80fdefe — unchanged.** None of the files this entry cites is
in the upstream change (`TeamMountPaths.cs`, `DeclaredMounts.cs`, `RunArgumentsBuilder.cs`,
`TeamsRootLocator.cs`, `TeamFolderPreparation.cs`, `TeamCatalog.cs`).

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

**Re-read (2026-10-07), sources of `main` at 80fdefe.** `RunnerHost`, `RunnerSettings`,
`SettingsValidation`, `LlmSettings`, `LlmProviderFactory` and `DoctorCommand` are not in the upstream
change: where a run reads its settings, the provider it infers and what it refuses at start are as
above. New: the variables an e-mail account names for its password and its OAuth client secret
(`Auth:PasswordEnvVar`, `Auth:ClientSecretEnvVar`) are read like `ApiKeyEnvVar` — the process environment,
then on Windows the user's scope, never copied (`EmailCredentialProvider`). The e-mail section is still
not judged at start (sources; the run of that point dates from fb26364).

**Re-run (2026-10-08), binary, bd3420c.** The chain and the refusals are as above; a refusal in a section the
settings catalogue knows now ends on the verb that lists its keys: ``ERROR: Llm:Provider is not a setting: Llm
carries Profiles, AvailableModels, BaseUrl, ApiKey, ApiKeyEnvVar, Model, Temperature, MaxTokens,
TimeoutSeconds, MaxRetries, Thinking, Grammar. `orkeon settings Llm` lists its keys.``, and
`RateLimiting:MaxConcurentRequests` gives ``Did you mean RateLimiting:MaxConcurrentRequests? `orkeon settings
RateLimiting` lists its keys.`` `orkeon doctor` has twelve checks (V-21).

**Re-run (2026-10-10), binary, ce9ec1f.** The refusal of `Llm:Provider` now lists thirteen keys: ``ERROR: Llm:Provider is not a
setting: Llm carries Profiles, AvailableModels, BaseUrl, ApiKey, ApiKeyEnvVar, Model, Temperature, MaxTokens, TimeoutSeconds,
StreamIdleSeconds, MaxRetries, Thinking, Grammar. `orkeon settings Llm` lists its keys.`` (V-22); the rest as above.

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

**Re-read (2026-10-07), sources of `main` at 80fdefe** (`git diff 77ac8a9 80fdefe -- src/apps`; nothing of
Studio was run): catalogue, detection, card, mounts, the team settings file, actions and launchers are
unchanged — the Launch and Teams view models differ in how a string is formatted only — and the
`Orkeon.Studio.Core` APIs `orkeon-studio-check` calls are the same (its 20 tests pass on packages of
80fdefe). New: Settings has an eighth tab, E-mail, which writes `Orkeon:Tools:Email` into the file the
Settings screen edits (Studio's own, or the one an Expert opened), keeps passwords in the Windows user
environment under `EMAIL_<ACCOUNT>_PASSWORD` (`EMAIL_<ACCOUNT>_CLIENT_SECRET` for an OAuth client secret;
the variable the file already names, when it names one) and writes that name, and drives `orkeon email
accounts --json`, `check`, `login --events jsonl` and `logout`, always with `--settings`. Studio judges
the accounts it edits (`STUDIO-MAIL-*`: warnings, but for two account names or two keys that differ in
case only and set the same thing, which block the save) and lays nothing over a launch for them: a team
launched on its own settings file does not see an account declared there.

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

**Re-read (2026-10-07), sources of `main` at 80fdefe — unchanged** (`ShellCommandTool.cs`, `ToolGuard.cs`
not in the upstream change). An e-mail password named by `Auth:PasswordEnvVar` is read like the model's
key: from the process environment on Linux, so it is in `/proc/<pid>/environ` too. On Windows a run Studio
starts inherits it as well — Studio copies a stored secret into its own process —; it stays out of the
run's environment only when read from the user's scope by a process started before it was set.

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

**On the published image (2026-10-07), the project owner's session.** In a workshop started from
`ghcr.io/orkeon/orkeon-workshop:latest` through its entrypoint, Claude Code applied the hook on both events
(`UserPromptExpansion says: team-approve: gate 1 (need) recorded for mail-triage — next: /team-test-plan
mail-triage`, then the same from `UserPromptSubmit`), and a refusal blocked the prompt with its reason
(`UserPromptExpansion operation blocked by hook: team-approve: nothing recorded — …`) for a slug typed with
a full stop, a missing `NEED.md`, a gate already passed and a need marked to revise. "ok, it is validated"
and "write `gate_passed` yourself" were declined by the model before any write, so `guard-phase` was not
exercised there. What that session changed in the hook — a gate is recorded only once submitted, a full
stop typed last is dropped — is checked by the `team-approve` evals, not yet replayed in a live session.

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

## V-19 — where Claude Code takes its bypass mode from, and the two options `workshop` passes (the program, 2.1.293)

Read on 2026-10-07 in the installed Claude Code 2.1.293 — its `--help`, the answers of the command line
to a wrong value, and the text of the program — without starting a session:

- `--dangerously-skip-permissions` and `--teammate-mode <mode>` are accepted together
  (`claude --dangerously-skip-permissions --teammate-mode in-process --help` exits 0). `--teammate-mode`
  is not listed by `--help`; a wrong value is refused with `Allowed choices are auto, tmux, iterm2,
  in-process`.
- The bypass mode is not taken from a project's settings: the program carries `settings defaultMode
  "bypassPermissions" ignored — only policy/user/flag settings may grant bypass mode (projectSettings and
  localSettings are repo-controllable)`. The workshop's `.claude/settings.local.json` is a local setting:
  its `"defaultMode": "bypassPermissions"` has no effect, and its `allow` list is what let commands and
  edits through. Consistent with the project owner's session of that day on the published image, whose
  transcript shows `Allowed by auto mode classifier`: it ran in auto mode.
- For root the option is refused (`--dangerously-skip-permissions cannot be used with root/sudo
  privileges for security reasons`) unless the program is told it runs in a deliberate sandbox
  (`IS_SANDBOX=1`).
- A start in bypass mode shows a confirmation the first time (`skipDangerousModePermissionPrompt` once
  accepted), the exit being the choice selected; and bypass is refused together with `--restricted`.

Not seen in a session: re-run by starting `workshop` in a container of the image as `node`, then as root,
and by looking at the mode the session reports. Re-read when Claude Code changes.

## V-20 — the checks of gates 2 and 3 read a workbook against the installed Orkeon (the image, 80fdefe)

The image built locally on 2026-10-08 from Orkeon `main` at 80fdefe (`docker build` on the pin;
`orkeon --version`: `orkeon 1.0.0-rc.4.src.20261007.g80fdefe`), `orkeon-bench` 0.1.0 with
`check test-plan` and `check design`; a container of it, as `node`, on a blank workshop
(`sync-harness.sh` deployed the harness: the skills `team-test-plan` and `team-design` are in
`.claude/skills/`).

- **The catalogue the check judges tool names against is the binary's**: `orkeon run --list-tools`
  lists 83 names there, and `check design` on the bench's complete workbook
  (`bench/tests/fixtures/workbooks/clean`: `email_parser`, `file_read`, `file_write`, `json_tool`, one
  custom tool) ends `PASS` with `--tests`, no check skipped. The fixture first named `json_query`, a
  tool Orkeon does not have: the unit tests, which pass a catalogue of their own, did not see it — the
  eval on the real binary would have.
- **A deliberately faulty design is refused**: the same workbook with the fixture's faulty `DESIGN.md`
  and `PLAN.md` ends `FAIL (5 errors, 2 warnings)`, exit `1` — `email_parse` unknown to
  `orkeon run --list-tools`, a task that reads a result without depending on it, a deliverable under the
  read-only `/mailbox`, a batch named `L1`, a criterion no batch covers.
- **The pilot's criteria and test plan pass**: `ORKEON_WORKSHOP=/workspace/library/examples orkeon-bench
  check test-plan mail-triage` ends `PASS`, exit `0`, on the files as the image deploys them.
- **Without `orkeon`** (the `checks` job, a bare `node:24-bookworm` container): the same faulty design
  gives four errors and the line `skipped tool-catalogue — orkeon not found on PATH: tool names were not
  checked`; the exit code is still `1`.

The `bench-contract` evals replay the first three at every image build, and the fourth in `checks`.

Not checked: the two skills in a live Claude Code session — no `/team-test-plan` or `/team-design` has
been typed on this image yet, and a skill is prose until a session follows it; `check design` on a design
written by `/team-design` rather than by hand; the Windows side.

## V-21 — the settings catalogue, the notices and the install channel (binary, bd3420c)

A container of the image built on `main` at bd3420c (`orkeon 1.0.0-rc.4.src.20261008.gbd3420c`), 2026-10-08,
`HOME` on a scratch folder, no network.

- **`orkeon doctor --json` has twelve checks**, in this order: `dotnet-runtime`, `install-channel`, `appsettings`,
  `llm-config`, `llm-profiles`, `runner-settings`, `llm-reachability`, `esbuild`, `local-embeddings`,
  `onnx-reranker`, `tree-sitter`, `workspace-write`. `install-channel` is `ok`: `dotnet-tool — orkeon
  1.0.0-rc.4.src.20261008.gbd3420c; to update: dotnet tool update -g Orkeon.Scripting.Cli (--prerelease for a
  pre-release)` — the CLI of the image is installed with `dotnet tool install --tool-path` under
  `/usr/local/share/orkeon/cli/<version>/`, which the reader knows by its path (`…/orkeon.scripting.cli/<version>/tools/…`,
  no `INSTALL-CHANNEL` marker); the update command it names is the dotnet tool's, not the image's
  (`orkeon-update.sh`). `orkeon --version --verbose` prints the version line, then `channel: dotnet-tool`;
  `orkeon --help` lists the eleven verbs and ends on `Documentation: https://orkeon.github.io/orkeon/` and
  `Settings:      https://orkeon.github.io/orkeon/docs/reference/configuration.html`.
- **A section no shipped binary reads is reported, not refused.** With `"ToolRateLimiting": {…}` and
  `"TokenBudget": {…}` beside a valid `Llm` in `./appsettings.json`, `orkeon run --list-tools` prints its 83
  names, exit 0, and two lines on stderr: `WARNING: TokenBudget is read by no component of this host: a C# host
  reads it through AddOrkeonToolRateLimiting().` and `WARNING: ToolRateLimiting is read by no component of this
  host: a C# host reads it through AddOrkeonToolRateLimiting(). The calls to the model are limited by
  RateLimiting, which this host reads.`; `orkeon doctor --json` on the same file gives two `runner-settings` rows
  at `warn` with those sentences and no `ok` row.
- **`orkeon settings` answers offline**, in a folder that is read-only and whose `appsettings.json` a run refuses
  (`Llm:Provider`): `Settings Orkeon reads: 351 keys in 67 sections, under 11 categories.`, then the categories
  with their counts and sections, a `*` on the sections no shipped binary reads (`Evaluation*`); `orkeon settings
  Llm` gives the section's sentence, `Read by: orkeon, orkeon-host, orkeon-repl` and each key with its type, its
  default (`secret` for `ApiKey`, `no default` for `ApiKeyEnvVar`) and its meaning; `--json` gives 67 sections and
  351 keys, 11 sections with an empty `hosts`; `env --json` gives `settingsPrefix` `ORKEON_`, 17 variables
  (`ORKEON_ALLOW_EXTERNAL_MOUNTS`, `ORKEON_DEBUG`, `ORKEON_MCP_SERVE`, `ORKEON_ESBUILD_PATH`, `ORKEON_LLM_API_KEY`,
  `BRAVE_API_KEY`, `ORKEON_DISCORD_TOKEN`, `OLLAMA_BASE_URL`, `ORKEON_CLI_DIR`, `ORKEON_STUDIO_TEAMS_ROOT`,
  `ORKEON_CUSTOM_LLM_API_KEY`, `TUI_DRIVER`, `TUI_DIAG`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `XDG_CONFIG_HOME`, `CI`,
  `TERM`) and six keys that name a variable (`Llm:ApiKeyEnvVar`, `Llm:Profiles:<name>:ApiKeyEnvVar`,
  `Orkeon:Rag:WebFallback:ApiKeyEnvVar`, the two of an e-mail account, `Orkeon:Host:Discord:TokenEnvironmentVariable`).
  A name that designates nothing: ``orkeon settings: nothing is named or described with 'Nonexistent'. The
  closest name is Orkeon:FileSystem; `orkeon settings` lists the categories.``
- **Impact**: nothing the harness reads changes — `orkeon-bench doctor` reads `orkeon --version` (one line
  still) and `--list-tools`; the run gate and the bench read a settings file themselves. A team settings file
  that writes one of the eleven sections now gets a warning from the run instead of silence (`cli.md` § 5).

## V-22 — `Llm:StreamIdleSeconds`, the catalogue at ce9ec1f and the image's build (binary, ce9ec1f)

A container of the image built on `main` at ce9ec1f (`orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`), 2026-10-10,
`HOME` on a scratch folder, no network. The image: 28 Orkeon packages built from the commit; the five .NET templates
with their self-check (0 warning; 117, 8, 118, 20 — one skipped — and 11 tests) and the plugin smoke (9 checks); the
1547 tests of the bench; the 843 harness evals in strict mode, none skipped.

- **`orkeon --version`** prints `orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`; `--verbose` adds `channel: dotnet-tool`.
  `orkeon doctor --json` has the same twelve checks as at bd3420c (V-21), in the same order.
- **`Llm:StreamIdleSeconds` is a key of the `Llm` section** (LLM-12). `orkeon settings Llm` lists `Llm:StreamIdleSeconds`
  and `Llm:Profiles:<name>:StreamIdleSeconds`, type `integer`, `no default`; `orkeon settings` counts `353 keys in 67
  sections, under 11 categories` (351 at bd3420c: the two new entries), `--json` gives 67 sections and 353 keys, `env
  --json` 17 variables as before. The refusal of an unknown key names it in the shape's order: ``Llm:Provider is not a
  setting: Llm carries Profiles, AvailableModels, BaseUrl, ApiKey, ApiKeyEnvVar, Model, Temperature, MaxTokens,
  TimeoutSeconds, StreamIdleSeconds, MaxRetries, Thinking, Grammar. `orkeon settings Llm` lists its keys.`` (`cli.md` § 5).
- **A settings file with `"StreamIdleSeconds": 120`** beside `TimeoutSeconds` 600 and a local `RateLimiting` starts:
  `orkeon run --list-tools` prints its 83 names, exit 0, no `ERROR:` line; `orkeon doctor --json` on it gives one
  `runner-settings` row at `ok` (`the settings pass the start validation of orkeon run`). A profile carrying
  `"StreamIdleSeconds": 30` passes the same way. Written `"120s"`, the start is refused — `ERROR: Llm:StreamIdleSeconds is
  not a number: '120s'.` — and `doctor` reports it under `llm-config`, `runner-settings` saying `skipped (the Llm section is
  refused — see llm-config)`. Written `0`, `--list-tools` starts without an `ERROR:` line: the sources refuse a
  non-positive pin when the provider's `LlmConfig` is built (`LlmConfig.cs`, `StreamIdleSeconds must be positive when
  pinned`), which `--list-tools` does not do — not observed on a run.
- **The tool catalogue and the schemas are unchanged**: `orkeon run --list-tools` (83 names) and `orkeon-bench tools dump`
  (83 rows) give, byte for byte, the output of the image built on 812cd10 and of the published image built on 80fdefe
  (V-01, V-06).
- **Impact**: the image's `init-orkeon.sh` writes `Llm.StreamIdleSeconds = 120` in the machine file it creates and completes
  a local-model file that lacks it at each start (D46; the jq filter checked on five sample files, outside the image);
  `llm-profiles.md`, `sizing-and-cost.md`, `cli.md` § 5 and `error-handling.md` state the key. The streamed failure itself
  (`error_type` `StreamIdleTimeout` after a silence of 120 s) was not provoked: it needs a model that stops answering.

## V-23 — profiles and packs: the image, the checks, and the start-up cost of each profile (image, ce9ec1f)

The image built locally on `main` at ce9ec1f, 2026-10-10 (`orkeon-workshop:lot11`, Claude Code 2.1.296): the layers up to
the harness came from the cache of the image of V-22 — the same Orkeon commit, the same `bench/` and `csharp/`, so the
same packages, template self-check and bench tests —, and everything from the harness on ran: the **989 harness evals in
strict mode, none skipped, none failed**, then the manifest (266 files). `checks.yml` replayed in a bare
`node:24-bookworm` container on the branch's files: `npm ci`, the **1547 tests of the bench** (59 files), and the 989
evals, 0 failed (11 skipped there for want of `orkeon` and `rtk`, as in the workflow). The documentation site builds with
docfx 2.81.0, 0 warning, 0 error; the 483 relative links of the 235 Markdown files resolve.

- **Switching** (`workshop-profile`, in containers of the image, as `node`): in an empty folder the synchronisation
  deploys the workshop as before — 16 skills (the 15 of the image before lot 11 and `/workshop-profile`), 6 subagents;
  `contrib` adds its 3 skills and `token-usage`; back to `user` the files of the packs are removed. In a git checkout whose
  `origin` is `Orkeon/orkeon`: `dev` deploys 10 skills and 4 subagents with `repo-orkeon`, `release` 6 skills, `docs` 2,
  `contrib` 5, `all` 17; `user` is refused there and names the profiles that fit. After every switch `git status` of the
  checkout is empty: nothing tracked is written, the rest is listed in `.git/info/exclude`.
- **Start-up cost** — the `(startup)` row of `cc-usage --session <transcript> --json` (`.devcontainer/cc-usage`): one
  `claude -p 'Reply with the single word OK.' --model sonnet` per profile and space, each in a throwaway
  `CLAUDE_CONFIG_DIR` holding only the credentials, `ENABLE_CLAUDEAI_MCP_SERVERS=false`.

  | Space | Profile | `(startup)` tokens | Against |
  |---|---|---:|---|
  | workshop | `user` | 30 468 | 30 468 with the image before lot 11, same conditions: **Δ 0** |
  | workshop | `contrib` | 30 588 | +120 (`token-usage`, the profile line) |
  | workshop | `all` | ≈ `contrib` | the same packs fit a workshop |
  | Orkeon checkout | none (no harness) | 40 370 | the repository's `CLAUDE.md`, 54.7 kB |
  | Orkeon checkout | `docs` | 41 301 | +931 |
  | Orkeon checkout | `release` | 41 304 | +934 |
  | Orkeon checkout | `contrib` | 41 377 | +1 007 |
  | Orkeon checkout | `dev` | 41 797 | +1 427 (4 subagents, `token-usage`) |
  | Orkeon checkout | `all` | 41 810 | +1 440 |
  | orkeon-workshop checkout | `dev` | 21 903 | with `repo-orkeon-workshop`; no bare run |

  Every pack of lot 11 adds less than 1 500 tokens (≈ 6 kB), within the target of 8 kB; most of it is the always-on rule
  `source-space.md` (≈ 950 tokens, measured by removing it). The workshop keeps the 22 kB of `HARNESS.md` (lot 11 does not
  cut it).
- **What moves the figure and is not the harness**: the claude.ai account's connector (`mcp_instructions_delta`, 4.6 kB)
  and its skills (`anthropic-skills:*` in the listing, 7 to 19 kB) reach the first turn on some runs and not on others,
  with the same files — 40 288 and 44 072 tokens for two identical runs. `ENABLE_CLAUDEAI_MCP_SERVERS=false` removes the
  connector; the account's skills still come and go, so each figure above is compared with a run that had the same
  listing (the workshop runs had the account's skills, the checkout runs did not). A first series without the variable
  gave the same differences between profiles.
- **Not verified**: whether a change of `skillOverrides`, or of the skills and subagents on disk, is seen without a restart
  (the switcher says to restart); no skill of the packs was run end to end on a real Orkeon checkout.

## V-24 — what Claude Code does with a forked skill, a custom agent's memory and the hooks inside a subagent (the program, 2.1.296)

Two sessions of `claude -p` on 2026-10-10 (Claude Code 2.1.296, the container's own `claude`, a throwaway
`CLAUDE_CONFIG_DIR` holding the credentials alone, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `--model sonnet`,
`--dangerously-skip-permissions`), in a scratch project made of: `.claude/settings.json` with four hooks that
append their payload to a log (`PreToolUse`, `SubagentStart`, `SubagentStop`, `PreCompact`), two charters
`probe-runner` (`model: haiku`, `tools: Read, Grep, Glob, Bash`, `disallowedTools: Write, Edit, Agent, …`) and
`probe-memo` (the same, plus `memory: project`), and a skill `/probe` with `context: fork`, `agent: probe-runner`,
whose text asks for one `echo` and one Write. Cost: 0.05 USD. The two runs, read in `--output-format json`
and in the hook log:

- **A skill with `context: fork` and `agent: <charter>` runs in a new subagent of that charter**: `modelUsage`
  names `claude-haiku-5-5` alone — the charter's `model:`, not the session's `sonnet`; the fork's `Write`
  came back `unavailable` — `disallowedTools` holds; `SubagentStart`, every `PreToolUse` and `SubagentStop`
  fired inside it with `agent_type: probe-runner` and an `agent_id`; the fork's one-line final message was the
  session's whole result (`num_turns: 0` for the main model). So a charter pins the model and the tools of the
  skills that fork into it (D57), the project's hooks guard them there, and `subagent-report-shape` sees their
  final message like any subagent's.
- **An agent with `memory: project` writes `.claude/agent-memory/<name>/`** (`MEMORY.md` plus a note, the shape
  Claude Code's own instructions give it) — and the one that disallowed Write and Edit did it through
  `cat > … <<'EOF'` in Bash: the tools were withheld, the memory was written all the same, outside any file
  guard. Hence D58: the three auditors no longer disallow Write and Edit, and `memory-scope.sh` confines what
  Claude Code hands them to the memory folders.
- **Not run**: a compaction (the `PreCompact` payload was wired but no compaction happened in two short
  prompts); `dev-compact.sh` is checked by its evals on recorded payloads and transcripts, as the other hooks
  are. Whether a PreCompact hook can add context to the summary is not documented and was not tried: D59 uses
  the file and the SessionStart hook.

The facts of the documentation this relied on (read the same day, <https://code.claude.com/docs/en/skills>,
`/sub-agents`, `/hooks`): `context: fork` "starts a new subagent of the type set in the `agent` field and gives
it the skill content as its prompt"; subagents lose `AskUserQuestion`; an agent with `memory:` gets "Read,
Write, and Edit tools … automatically"; "Hooks from settings files … also run inside subagents", with
`agent_id` and `agent_type`; PreCompact hooks receive `trigger` and `custom_instructions`, and only
SessionStart (`source: compact`), UserPromptSubmit, UserPromptExpansion and PostModelSwitch add stdout as context.

## V-25 — the image rebuilt after lot 12 and the getting-started pass (image, ce9ec1f)

The image built locally on `main` at ce9ec1f, 2026-10-10, 20:46–20:55 UTC (`orkeon-workshop:latest`, id
`4804db29869f`, Claude Code 2.1.296, `orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`): Orkeon's `main` had not moved
since V-23 (`git ls-remote` gives the pinned commit), so the layers up to the harness came from the cache of
V-23 — the same packages, the template self-check (`verify-templates` PASS for the five templates and the plugin
smoke, 9 checks) and the **1547 tests of the bench** (59 files) —, and everything from the harness on ran:
the **1025 harness evals in strict mode, none skipped, none failed** (36 more than V-23: the three files of lot 12,
`memory-scope` 18, `dev-compact` 12, `forked-skills` 4, and the two cases of D56), then the manifest
(274 files). In a container of the image: `/usr/local/share/cc-usage/cc-usage.py`, `workshop-profile` and
`orkeon-bench` on the PATH. Not replayed here: `checks.yml` in a bare `node:24-bookworm` container (the branch
is not pushed), the start-up cost per profile (V-23 holds the last measure; lot 12 adds a charter description
only where its pack is deployed, see plan § 11.1).

## V-26 — a checkout mounted from Windows, and the image without Claude Code (image, ce9ec1f, two builds)

**The symptom, 2026-10-11.** The user started the image of V-25 on `C:\Users\cyril\Claude\test`, a git
checkout, with `-e HARNESS_PROFILE=user`: the start-up printed `[harness] profile: not a workshop nor the top
of a git work tree`, deployed nothing, and `workshop` offered `sync-harness.sh --adopt`. In the container, as
`node`: `git -C /workspace rev-parse --show-toplevel` → `fatal: detected dubious ownership in repository at
'/workspace'` (the bind mount belongs to root, `stat` gives `0:0`), `workshop-profile --list` → `space: unknown
- git refuses /workspace (dubious ownership …)`. By hand, `git config --global --add safe.directory /workspace`
then `workshop-profile dev`: space `source`, packs `core, source, dev, quality, usage`, 114 files deployed,
`.git/info/exclude` written (130 lines), `git status --short` showing the user's own five modified files only.
The same image had Claude Code 2.1.296 built in: the Dockerfile's default `CLAUDE_CODE_VERSION=latest`, where
`image.yml` builds with `none` (D60).

**The fix (D60, D61), checked before the build** in a container of the V-25 image on a writable copy of the
modified tree: the four touched eval files (`sync-profiles`, `workshop-command`, `workshop-profile`, `layout`)
in strict mode — 174 cases, 173 passed, 1 failed: the new case of `sync-profiles` (a stand-in `git` that
answers "dubious ownership" for the checkout until `safe.directory` names it), because the test
`git … 2>&1 | grep -q` ran under `pipefail` and git's exit 128 made the pipeline false; rewritten on a captured
`$(…)`, the file passes (14 cases). On a read-only mount of the tree the same run fails 11 cases that
need to write beside the fixtures: not a finding.

**The image built locally, twice,** on `main` at ce9ec1f — resolved again before each build, unchanged since
V-23. First build 2026-10-11, 04:57–05:08 UTC (id `c98e2d0e76c7`): **1027 strict harness evals, 0 failed** (the
1025 of V-25 plus the two new cases). The user then started it on his checkout: the log read, in order,
`[harness] git: /workspace is owned by another user (a bind mount): added to safe.directory for node.`, the
synchronisation `profile dev in a source space (core source dev quality usage)`, `[claude-code] … installing
@anthropic-ai/claude-code@latest from npm… installed: 2.1.296` — and then the workshop's newcomer hint (`new
here? … /workshop-language fr … /orkeon-tour`) from the entrypoint and from `workshop`, which do not apply to a
checkout: fixed in both (a `.claude/.harness-space` that says `source` skips them; the entrypoint's last line
becomes `[entrypoint] Checkout: <folder> — profile <name> — open it with: workshop`), one more eval case
(`workshop-command`, 29 cases), `docs/getting-started/install.md` (+ FR). Second build 05:17–05:27 UTC
(`orkeon-workshop:latest`, id `0a93e20e51bc`, 18.06 GB, `orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`): the
template self-check (`verify-templates` PASS, plugin smoke 9 checks), the **1547 tests of the bench** (59 files),
the **1028 harness evals in strict mode, none skipped, none failed**, the manifest (274 files). In a container of
it: `command -v claude` → none, no copy under `@anthropic-ai/claude-code` anywhere (the build's own check for
`none`); the container installs it at its first start.

**The scenario replayed in containers of both images**, a checkout at `/workspace` made root-owned
(`chown -R root:root`, then `chmod -R 777`: a Windows bind mount is root's and world-writable) and the harness
run as `node`. Without the 777, `node` cannot write `.git/info/exclude.tmp` and the synchronisation stops there
(`Permission denied`): a property of a Linux file system, not of the mount — the user's container wrote the
file. Before, git refuses the folder. `sync-harness.sh` on the `user` profile prints `[harness] git: /workspace
is owned by another user (a bind mount): added to safe.directory for node.`, then `[harness] /workspace is a
git checkout, not a workshop: it takes a source profile - HARNESS_PROFILE=dev … ('workshop-profile --list'
shows the profiles that fit). Nothing deployed.` and `[harness] profile: user in a source space: workshop is
workshop only - fits here: contrib, dev, release, docs, all, custom.`; `workshop` there prints `workshop: no
harness in /workspace: a git checkout takes a source profile - workshop-profile dev (or release, docs,
contrib; --list shows them)` and still starts `claude`. The entrypoint itself with `HARNESS_PROFILE=dev`
(final image): the `[harness] git:` line, `synchronised into /workspace: 114 added … profile dev in a source
space (core source dev quality usage)`, `[entrypoint] Checkout: /workspace — profile dev — open it with:
workshop`; `workshop` then starts `claude --dangerously-skip-permissions --teammate-mode in-process` with no
hint; `git status --short` shows nothing of the harness (only the README the simulation left uncommitted);
`safe.directory` holds `/workspace` and nothing else. A plain folder gets the three lines of before plus the
reason (`is neither a workshop … nor the top of a git work tree`). Written after the second build's context
was sent: this entry and the plan. Not replayed: `checks.yml`, the start-up cost per profile (V-23).

## V-27 — the instruments of the dev pack: evals, access-cost.py, the latency medians (source tree, ce9ec1f)

**Not an image build.** Lot 13 (D62–D66, plan § 11.1) was checked from the source tree on 2026-10-11, with the
tools the image carries put on the PATH of this dev container: `@ast-grep/cli` 0.50.0 installed with npm into a
scratch folder (the version the Dockerfile pins, released 2026-10-09; `/usr/bin/sg` here is Debian's setgid
tool, which is why `access-cost.py` looks for `ast-grep` alone) and PyYAML 6.0.3 through `PYTHONPATH`. Orkeon's
`main` was resolved twice (`git ls-remote`): still ce9ec1f, the pinned commit. The image was rebuilt the same
day, once D67 and D68 were in: see the end of this entry.

**access-cost.py on the toolkit's rules, with ast-grep 0.50.0.** The four C# rules (`await-member`, in a loop,
in a lambda, `memory-filter`) match on a hand-made handler: `await signatureRepository.GetSignature(id, ct)`
inside a `foreach` → `await-member` + `await-member-in-loop`; `(await configurationRepository.GetAll(ct)).Where`
→ `memory-filter`; `ids.Select(async id => await repo.LoadAsync(id, ct))` → `await-member-in-lambda`. The script
on the eval fixtures: a flat handler `Cost: 2 reads + 1 write through ports outside loops; in a loop, a lambda
or a memory filter: none`, exit 0, `quotaChecker.HasAvailableQuota` listed to classify; the loop, lambda and
filter handlers exit 2 with the flagged line; `--diff` in a scratch checkout marks a committed loop
`(pre-existing)` (exit 0) and fails on an added one (exit 2); without `ast-grep` exit 3 and `cost not measured,
state it by hand and say so`. Orkeon's receivers (`repo.yaml` `tools.access_cost.receivers`, read in the
Application layer of ce9ec1f: `_fs`, `_toolInvocation`, `_checkpointManager`, `_memoryCoordinator`,
`_shortTerm`…) make `_fs.ReadAllTextAsync` and `_toolInvocation.InvokeAsync` ports.

**The evals from the source tree**, `bash evals/run.sh -v` with ast-grep and PyYAML on the PATH: **1 073
cases, 1 061 passed, 12 failed, 60 skipped** (59 need `orkeon-bench`, 1 `orkeon-studio-check`: on the PATH in
the image only). The twelve: the eight `bench-contract` cases that need the installed bench, the three
`workshop-language` cases whose stderr this container's bash prefixes with a `setlocale` warning — the baseline
of this container since lot 11 — and one case of `sync-profiles` (of V-26, uncommitted) that passed in the image
and fails here because its fixture folder lies inside `/workspace`, a git work tree: the resolver answers
"inside a git work tree but not at its top" instead of "neither a workshop nor the top of a git work tree".
Not touched by the lot; a fixture outside the tree would make it hold everywhere. New: `guard-integration-filter`
18/18, `access-cost` 13/13, `session-doctor` 28/28 (12 new, a scratch checkout built per case), `delegation-guard`
26/26, `pack-dev` 11/11, `layout` and `source-space` adjusted. `workshop-profile.py --check`: 283 files, every
file in one pack, the switches of every union resolve (`repo-orkeon` now carries two); `--show` for `dev` on a
scratch checkout whose origin is `Orkeon/orkeon`: packs `core, source, dev, quality, usage, repo-orkeon`,
switches `HARNESS_INTEGRATION_CATEGORIES=Integration Slow`, `HARNESS_INTEGRATION_PROJECTS=Orkeon.sln`.

**The latency medians** (D66), the whole suite, this machine (WSL2, bash 5, jq 1.6), two runs: under load,
with another run beside it, from 69 ms (`secret-guard`) to 390 ms (`run-gate`, 141 cases), `team-approve` 200,
`session-doctor` 193, `bash-dispatch` 154, `guard-phase` 145; on its own, from 33 ms (`secret-guard`,
`subagent-report-shape`) to 174 ms (`run-gate`), `clear-nudge` 171, `guard-phase` 149, `delegation-guard` 117,
`bash-dispatch` 105. The default budget is 1 000 ms: a hook that waits is caught, a hook a third slower is
not — the figure to re-read at the image build, where `latency: slowest hook …` is printed before the summary.

**Documentation**: 312 Markdown files, the relative links and anchors checked by a script (the twenty
findings are a slug the checker does not compute for headings holding ` — `, in `orkeon-bench.md`, unchanged
since V-25); docfx 2.81.0: 0 warning, 0 error. The Mermaid diagrams were not touched.

**The same day, D67 and D68** (the product run from its checkout; `/dev-change`), same machine, same way:
`guard-source-cli` 18 cases — refused: `orkeon run`, `orkeon --version`, `/usr/local/bin/orkeon doctor`,
behind `cd … &&`, an environment assignment and `rtk`, `sudo rtk proxy`, in `$( )`, after a pipe, a second
name of the switch; passing: the checkout's `dotnet run --project … --`, `orkeon-bench`, `orkeon-update`,
`orkeon-studio-check`, `which orkeon`, `echo orkeon`, a file named `orkeon.sh`, a `dotnet test`; the refusal
quotes `dotnet run --project src/scripting/Orkeon.Scripting.Cli -- run teams/demo/crew --dry-run` for
`orkeon run teams/demo/crew --dry-run`, and points at the repository's guide when `HARNESS_SOURCE_CLI` is
empty. `pack-dev` 12 cases: eight skills, the gate failing on an uncarried `CH-02` and passing once
`[Trait("BR", "CH-02")]` is written; `layout`: seven modules. The whole suite: 1 092 cases, 1 080 passed,
12 failed (the same twelve as above), 60 skipped; slowest hook `run-gate`, median 364 ms over 141 cases,
budget 1 000 ms. `workshop-profile.py --check`: 287 files, every file in one pack, every union's switches
resolved. docfx: 0 warning, 0 error; links: the same twenty slug findings. Orkeon `main` re-resolved:
ce9ec1f.

**The image, the same day.** Built locally on `main` at ce9ec1f (re-resolved just before: unchanged), on commit
`e0f5f1b` of this repository, finished green at 08:04 UTC (`orkeon-workshop:latest`, id `21368935faf1`, 18.3 GB,
no Claude Code, `orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`): the packages built from the sources, the template
self-check (`verify-templates` PASS for the five templates, each offline too, and the plugin smoke, 9 checks),
the **1547 tests of the bench** (59 files), then the **1092 harness evals in strict mode, none skipped, none
failed** (64 more than V-26: `guard-integration-filter` 18, `guard-source-cli` 18, `access-cost` 13,
`session-doctor` +12, `pack-dev` +2, `delegation-guard` +1), every hook under the 1 000 ms budget of D66, then
the manifest. Not replayed: `checks.yml` in a bare `node:24-bookworm` container (the branch is not pushed).

## V-28 — the work folder of a checkout (D69): evals from the source tree, then the image (ce9ec1f, 2026-10-11)

**What was checked.** The resolution of the work folder, `harness_work_dir` in `claude/lib/team-common.sh`
(and its twin `work_dir` in `learn-candidates.py`): the folder `HARNESS_WORK_DIR` names when it is a
relative folder of the root that exists there, trimmed of spaces, `./` and trailing slashes; `todo` with
status 1 when the folder is absent; `todo` with status 2 for an absolute path, a `..` or `.` segment, a
double slash, `.claude/…` or `.git/…`; `todo` with status 0 when unset or `todo` (19 values, one `cmd` case
of `workshop-profile`). The start line of `workshop-profile.sh` with each of the three outcomes (3 hook
cases). `dev-compact.sh` writing the state file under `backstage/tasks/<code>/` when that folder exists and
the launch names it, under `todo/` when the folder named is absent or the value invalid, and looking for no
sheet under `todo/` when another folder applies (3 cases). The packs naming `<work>/` and never `todo/<code>/`
as a path, the rule `source-space.md` defining the work folder, and the Orkeon pack's `repo.yaml`
`layout.work` equal to its switch `HARNESS_WORK_DIR` (`backstage/tasks`; 1 case of `pack-dev`). The fact
behind the Orkeon value is read in Orkeon's own `CLAUDE.md` ("Project Structure": `backstage/` is the
private submodule of project management; the task files under `backstage/tasks/`), not in the submodule
itself, which is private: whether the root of `backstage/` is wanted instead is the user's to say.

**From the source tree** (this container, PyYAML installed for the run, `orkeon` and `orkeon-bench` not on
the PATH): `bash evals/run.sh` 1090 passed, 10 failed, 70 skipped — the 8 D69 cases pass; the 10 failures
are 9 `orkeon-bench` cases that need the bench on the PATH and one `sync-profiles` case whose fixture lies
under the repository (`/workspace/.devcontainer/harness/evals/.fixtures/…`), all 10 green in the image
below; the first run of the day had 3 more failures from the shell's locale warning on stderr
(`setlocale: LC_ALL`), gone with `LC_ALL` unset. The documentation site built with docfx 2.81.0 at the end:
0 warnings, 0 errors.

**The image.** Built locally on `main` at ce9ec1f (re-resolved just before: unchanged), on the working
tree of `feature/lot-11-profiles` after `02a7c26` plus D69, uncommitted; finished green at 09:17 UTC
(`orkeon-workshop:latest`, id `65458d007424`, 18.3 GB, `orkeon 1.0.0-rc.4.src.20261009.gce9ec1f`, no
Claude Code): `verify-templates` PASS, offline too, and the plugin smoke, 9 checks; the **1547 tests of the
bench** (59 files); then the **1100 harness evals in strict mode, none skipped, none failed** (8 more than
V-27: `dev-compact` 3, `workshop-profile` 4, `pack-dev` 1), every hook under the budget of D66 (slowest
`run-gate`, median 145 ms over 141 cases), then the manifest. Not replayed: `checks.yml` (the branch is
not pushed).

**The image, again, on the rule's last point.** After the rule `source-space.md` gained the point "read the
work folder's `CLAUDE.md` before the first write there" (the user's question on a `CLAUDE.md` for
`backstage`; the loading of a nested `CLAUDE.md` at the first read or write in its folder is read in
<https://code.claude.com/docs/en/memory>, "How CLAUDE.md files load"), the image was rebuilt on the same
commit, `main` re-resolved unchanged: finished green at 10:08 UTC, `orkeon-workshop:latest` = `39eb04f5fcda`,
18.3 GB, the same `orkeon` version, templates PASS, 1547 bench tests, **1100 strict evals, 0 failed**,
slowest hook `run-gate` at a median of 121 ms. The first image of the day, `65458d007424`, is superseded.

## V-29 — the migration to Orkeon `main` at c39c5fa: what moved upstream, the image (binary, c39c5fa, 2026-10-11)

**What changed upstream.** GitHub compare `ce9ec1f...c39c5fa`: one commit, "chore(docs): CLAUDE.md keeps only
the rules the code cannot tell (DOC-03) (#65)", 2026-10-11 10:05 UTC, two files — `CLAUDE.md` (691 lines to 89)
and the `backstage` submodule pointer. `src/`, `tests/`, `docs/`, `scripts/` and `.github/` are byte-identical
between the two commits, so every entry of this file that states what the code does holds at c39c5fa as it did
at ce9ec1f, and only its label moved. What the harness cites from Orkeon's `CLAUDE.md` was re-read in the new
file: the test categories and the MTP caveats (§ Commands), the branch names `feature|fix|chore/<slug>`
(§ Branching: never start work on `main`), the two scripting projects and `Orkeon.Scripting.Cli` as the
`orkeon` tool (§ Other rules; `CONTRIBUTING.md` § Project Structure says the same), the DTO conventions, the
test doubles, the VFS rule, the executable bit, the namespace collision, and the architecture map's line
"`backstage/` (private submodule): project management. Tasks are `backstage/tasks/<PREFIX>-<NN>-<slug>.md`,
never a root `todo/`" — the source of `layout.work` (D69). Conventions the old file stated and the new one
no longer restates (the Application layer's "no database, HTTP or framework code"; the typed-tool example
without `[FieldSchema]`, now gone) are kept in `orkeon-guidelines.md` and the repo-orkeon rules, marked as
stated at ce9ec1f: the code did not change. `CONTRIBUTING.md` is identical upstream.

**The image (binary, c39c5fa).** Built locally on c39c5fa, the pin moved in the same change: finished green at
10:48 UTC, `orkeon-workshop:latest` = `5f9e851931a4`, 18.3 GB, `orkeon 1.0.0-rc.4.src.20261011.gc39c5fa`;
`verify-templates` all checks OK (the five templates against a feed of the 28 packages packed from c39c5fa,
offline too, the plugin smoke); the 1547 tests of the bench (59 files); the **1100 harness evals in strict
mode, none skipped, none failed** — the comparison of the tool catalogue of `orkeon-reference.md` § 5 with
`orkeon run --list-tools` of this build included, the binary's `--version` being the reference version —,
slowest hook `run-gate` at a median of 168 ms (budget 1000 ms). From the source tree before the build
(PyYAML installed, `orkeon` and `orkeon-bench` not on the PATH): 1092 passed, 8 failed, all eight
`orkeon-bench` cases that need the bench, green in the image. Also fixed in this change, after `checks.yml`
was replayed on `83520e6` by a manual run (1098 passed, 2 failed): the `sync-profiles` case whose plain
folder lay inside this repository's work tree, and the `access-cost` case that met `ast-grep missing`
before "not found" (the script now checks its arguments first).

## V-30 — D69 in a linked worktree: evals from the source tree, then the image (binary, c39c5fa, 2026-10-11)

**What was checked.** The amendment of D69 for a linked worktree (plan § 11.1, "D69 in a linked worktree"):
`harness_work_dir` returns the main worktree's folder as an absolute path (status 3) when the folder named by
`HARNESS_WORK_DIR` is absent from a linked worktree and present in its main worktree; the start line of
`workshop-profile.sh` says so; `dev-compact.sh` reads the plans and writes its state there without prefixing
the root; `work_dir` of `learn-candidates.py` follows the same rules. Three new evals, each on a scratch git
repository made with `mktemp` and `git worktree add`: `workshop-profile` +2 (the library's statuses from the
main worktree, the linked worktree and an absent folder — `[D/main/backstage/tasks:3][backstage/tasks:0][todo:1]`
once the scratch path is masked —, and the start-line segment), `dev-compact` +1 (a `/dev-implement F2`
launched from the worktree: the compaction state lands under the main worktree's `backstage/tasks/feat/`).
From the source tree (PyYAML installed, `orkeon` and `orkeon-bench` not on the PATH): the four touched case
files, 166 passed, 0 failed; the full run, the eight `orkeon-bench` cases excepted as in V-29.

**The image (binary, c39c5fa).** Built locally on c39c5fa with this change: finished green at 11:53 UTC,
`orkeon-workshop:latest` = `04c0da70dbba`, 18.3 GB, `orkeon 1.0.0-rc.4.src.20261011.gc39c5fa`;
`verify-templates` all checks OK (the five templates, offline too, the plugin smoke); the 1547 tests of the
bench (59 files); the **1103 harness evals in strict mode, none skipped, none failed** — the three new
cases included, the comparison of the tool catalogue with `orkeon run --list-tools` included —, slowest hook
`run-gate` at a median of 161 ms over 141 cases (budget 1000 ms).

## V-31 — lot 14 (D70, D71): what a subagent's hooks receive, the worktree script, the evals (source tree, c39c5fa, 2026-10-11)

**Measured in a live session** (`claude -p`, Claude Code 2.1.296, a scratch repository under the session's
scratchpad with a `probe` agent `isolation: worktree`, `model: haiku`, hooks dumping every payload to a file,
the harness's `WorktreeCreate` and `WorktreeRemove` hooks wired, `repo.yaml` `layout.shared: [packages]`,
`contrib.branch: "feature|fix|chore/<slug>"`):

- **`transcript_path` inside a subagent's `PreToolUse` is the main conversation's transcript**, byte for
  byte the same path as in the main context's payloads (`…/projects/<dir>/<session_id>.jsonl`), with
  `agent_id` (`a8ea2bd69166881cb`) and `agent_type` (`probe`) set; `SubagentStart` carries the same;
  `SubagentStop` adds `agent_transcript_path` = `…/projects/<dir>/<session_id>/subagents/agent-<agent_id>.jsonl`.
  So a hook that reads `transcript_path` inside a subagent reads the main context: `dev-batch-guard` derives
  the agent's own transcript from `transcript_path`, `session_id` and `agent_id` (the path `SubagentStop`
  reports), and `dev-compact` exits in a subagent.
- **`WorktreeCreate` fired once for the isolated subagent**, with `name: agent-<agent_id>`
  (`agent-a8ea2bd69166881cb`), `cwd` the main checkout, no `agent_id` in that payload; the harness's hook
  created `.claude/worktrees/agent-<id>` on `feature/agent-<id>` with `packages` linked, and the subagent's
  `cwd` in every later payload was that worktree. A nested subagent (`general-purpose`, spawned by the
  isolated one) ran with the same worktree as `cwd` (`pwd` printed it, `NESTED-OK`).
- **A commit from inside the worktree works** (`105e2df`, `COMMIT-OK`): the isolation checks let git run in
  the worktree. The push to the scratch bare remote failed on a relative remote URL (`../probe-remote.git`,
  resolved from the worktree's folder, not an isolation refusal); the same push from the worktree with an
  absolute URL succeeded by hand.
- **`rtk git …` is refused by the isolation checks**: the first probe's Bash command, rewritten by the
  machine's own `rtk hook claude` into `rtk git branch --show-current`, was refused — "the guard said the
  command runs `git` through `rtk` and it cannot verify that the git call targets this worktree" — where the
  plain `/usr/bin/git …` of the second probe ran. The dispatcher's `rewrite-rtk` module now leaves a command
  that runs git alone when the payload's `cwd` is inside a linked worktree (a top level whose `.git` is a
  file); the eval `rewrite-rtk` locks it.
- **`WorktreeRemove` did not fire** when the subagent ended (a `-p` run; the worktree held a commit the second
  time, nothing the first), and the worktree stayed on disk both times: consistent with the worktrees
  documentation (the sweep keeps a worktree without Claude Code's marker, a hook-created one included). The
  worktrees were removed with `worktree-create.sh --remove`: refused while the branch held a commit no other
  branch had, accepted once the branch was pushed or merged, the branch deleted with it.

**The worktree script, demonstrated on a scratch repository** (`wtdemo.sh` of the scratchpad; an
Orkeon-like ignore `**/[Pp]ackages/*`): create `alpha` → `.claude/worktrees/alpha` on `feature/alpha` from
`HEAD`, `packages` linked to the main checkout's, `node_modules` (named by the pack, absent) created empty in
the main checkout then linked, the block `# >>> orkeon-workshop worktree shared` written in
`.git/info/exclude` (`/packages`, `/node_modules`) so that `git status` in the worktree is empty — without it
a `.gitignore` rule written for the folder does not match the link, and a `git add -A` committed the link
during the first run of the demo, which this block fixed; the path alone on stdout, three lines on stderr;
the same name again reused the worktree. `HARNESS_WORKTREE_SHARED=src` (tracked) refused, nothing created.
`--link` on a hand-made worktree replaced its empty `packages/` by the link; `--shared` listed
`packages`, `node_modules`. `--remove` refused an untracked file, then an unmerged commit (`holds 1 commit(s)
no other branch has`), the folder kept each time; after the merge it removed the worktree and the branch, the
main checkout's `packages/cache/p.nupkg` intact; the hand-made worktree, clean, removed with its branch. The
two hooks fed JSON did the same (`gamma` created and removed); empty, `{}` and not-JSON payloads: exit 0,
nothing printed. Without a pack and without the switch: a plain worktree on `worktree-delta`. A `.claude`
that is a symbolic link: refused, as Claude Code refuses it.

**Evals from the source tree** (PyYAML installed, `orkeon` and `orkeon-bench` not on the PATH): the new case
file `worktree-hooks` (6 cases, scratch repositories made with `mktemp`), `pack-dev` +3 (the charter, the
orchestrator and the plan template, D71 in the pack), `dev-batch-guard` +2 (the agent's transcript, the new
refusal) and its two expectations reworded, `rewrite-rtk` +1, `delegation-guard` +1 (the `dev-batch` cap),
`dev-compact` +1 (silent in a subagent), `workshop-profile` +1 (the shared segment of the start line). The
full run: **1110 passed, 8 failed, 70 skipped and counted as passed** — the eight failures are the `orkeon-bench` cases, the binary not being on this machine's PATH, as in V-29 and V-30; slowest hook `run-gate` at a median of 362 ms over 141 cases (budget 1000 ms); a first full run under a load average above 30 (other sessions on the machine) had put `delegation-guard` over the budget at 1355 ms, where alone it measures 100 to 190 ms. The image was **not** rebuilt in this verification: D71 arrived during the lot and its
own changes come first; Orkeon `main` had moved to ad6dc63 (one commit, `fix(tools): a tool schema carries
only JSON Schema types, and a dictionary is an object (LLM-13)`, 2026-10-11 15:47 UTC) when it was
re-resolved at the end of the lot, which the migration before the rebuild takes up.

## V-32 — the migration to Orkeon `main` at ad6dc63: what moved upstream, the image (sources, ad6dc63, 2026-10-11)

**What changed upstream.** `git diff c39c5fa ad6dc63` on a clone fetched on 2026-10-11: one commit, "fix(tools): a tool
schema carries only JSON Schema types, and a dictionary is an object (LLM-13) (#66)", 2026-10-11 15:47 UTC, 31 files,
+1163/-49. Under `src/`: `Orkeon.Domain` — `Attributes/FieldSchemaAttribute.cs` (the doc of `Type`: the seven JSON
Schema names or `"any"`, any other refused), `Tools/Protocol/ToolSchema.cs` (`ParameterSchema.Type` becomes `string?`,
one more positional member `Values`, and `IsMap`, `ReadAsMap`, `IsKeyValueArray`, `ToValueDocument`),
`Tools/ToolSchemaGenerator.cs` (`InferSchemaType` returns `null` for `object`, `JsonNode`, `JsonElement`; a dictionary —
`IDictionary<,>`, `IReadOnlyDictionary<,>` and their implementations, `ImmutableDictionary` included — is an object whose
`additionalProperties` is typed from its values; `ResolveFieldType` throws at generation on a `FieldSchema` `Type`
outside `string`, `number`, `integer`, `boolean`, `object`, `array`, `null` and `"any"`, naming the DTO and the property),
`PublicAPI.Unshipped.txt`; `Orkeon.Infrastructure` — `AnthropicToolSchemaFormatter.cs` and `OpenAIToolSchemaFormatter.cs`
(no `type` when it is null, `additionalProperties` when `Values` is set), `MCP/McpServer.cs`; `Orkeon.Tools.Abstractions`
— `ToolBase.cs` (`ReadMapParameters` turns a `[{"key":…,"value":…}]` array into the dictionary before `ExecuteCoreAsync`),
`ToolBaseGeneric.cs`, `FileToolBaseGeneric.cs`, `HttpToolBaseGeneric.cs`, `ToolParameterValidator.cs` (`ValidateMap`: a
JSON object or that array, a repeated key or a wrongly typed value fails the call, "Expected: object" otherwise;
`IsValidType` is true for a null type); `Orkeon.Tools.EventHub/Dtos/` — `PostMessageDtos.cs`, `PublishEventDtos.cs`,
`ReplyToDtos.cs`, `SendRequestDtos.cs`: the `Payload` (`JsonNode?`) loses `Type = "any"`, nothing else. Eleven test
files, `CHANGELOG.md` (the `[Unreleased]` entry and its migration table), `docs/tools/new-tool-pattern.md` and its French
page (a section "Parameter types a tool's schema carries"), the `backstage` pointer. Nothing else: `CLAUDE.md`,
`CONTRIBUTING.md`, the root project files, the loaders, the crew modes, the LLM providers and settings shapes, the CLI,
Studio, the launchers and the 17 request records without `[FieldSchema]` are byte-identical, so every entry of this file
outside the tool-schema facts holds at ad6dc63 as it did at c39c5fa.

**What it changes for the workshop (sources).** The tool catalogue of `orkeon-reference.md` § 5 — names, descriptions,
argument names, required flags — is unchanged: the five event-bus tools keep their arguments, and only the schema the
model receives differs (`payload` without a `type` instead of `"type":"any"`; `metadata` of `publish_event`,
`post_message`, `send_request` and `metadata_match` of `wait_for_event`, `ImmutableDictionary<string, string>`, as
`{"type":"object","additionalProperties":{"type":"string"}}` instead of an array). The 17 built-ins with an empty
schema (V-06, `csharp-tools.md`) stay as they are: none of their request records is in the diff, and the generator's
path for a property without `[FieldSchema]` is not changed. The five .NET templates' `SampleExtractorContracts.cs`
annotate a string and a list, no dictionary, no explicit `Type`: nothing the new registration check refuses.
`check_crew.py` and `check_team.py` embed the same 83 names. Re-read and rewritten where the fact moved:
`csharp-tools.md` (schema generation, validator, `new-tool-pattern.md`), `orkeon-reference.md` § 5 and the two
`orkeon-bench.md` pages; everything else moved by label only (the headers of the references and their table, the
pin, the reference version of the bench and of the five templates, the labels "at c39c5fa" of the statements about what
Orkeon does — identical code, each holds as written). History stays as written (V-29 to V-31, the plan's journal, the
lists of the commits a fact was seen on, "since c39c5fa").

**Checked from the source tree (2026-10-11).** The bench on the new reference version: `npm run lint` (tsc, no
dependency violation over 132 modules) and `npm test`, 1547 tests in 59 files, all passed. The harness evals, non strict
(`orkeon` and `orkeon-bench` not on the PATH): 1111 passed, 8 failed, the eight `orkeon-bench` cases that need the bench,
as in V-29 to V-31; slowest hook `run-gate` at a median of 188 ms over 141 cases. Run under `LC_ALL=C.UTF-8`: with an
`LC_ALL` the container has no locale for, bash prints a `setlocale` warning on every stderr and four cases that count
stderr lines (`workshop-language`, `worktree-hooks`) go red for that reason alone. The site: docfx, 0 warnings, 0 errors.

**The image (binary, ad6dc63).** Rebuilt locally on 2026-10-11 from 17:36 to 17:45 UTC (`docker build --build-arg
ORKEON_SOURCE_REF=ad6dc63f4571c74772ffbf22a04355457a7dcaf6 --build-arg ORKEON_REFRESH=<the same>`, the unchanged layers
cached, Orkeon rebuilt from the commit), with every change of the day in it: D70 and lot 14, D71, this migration.
`orkeon-workshop:latest` = `0069c22de808`, 18.3 GB. In the build: `orkeon --version` = `orkeon 1.0.0-rc.4.src.20261011.gad6dc63`
and its packages packed at that version; the templates' self-check PASS for the four templates (OrkeonCrewHost 117 tests,
OrkeonPlugin 8, OrkeonRunner 118, OrkeonTool 11, 0 warning); the bench, 1547 tests in 59 files, all passed; the harness
evals in strict mode, **1119 passed, 0 failed**, the catalogue case included ("the two check scripts embed the same tool
catalogue as section 5 of orkeon-reference.md, and as the installed orkeon when it is the reference version": PASS);
slowest hook `run-gate`, median 126 ms over 141 cases (budget 1000 ms). Log: the session's scratchpad,
`image-build-ad6dc63.log`.

## V-33 — the migration to Orkeon `main` at 23f4eae: what moved upstream, the tests of plans A–E, the image (sources, 23f4eae, 2026-10-12)

**What changed upstream.** `git diff ad6dc63 23f4eae` on a clone fetched on 2026-10-12 (`--filter=blob:none`): four
commits, 198 files, +8139/−320, 122 of them outside the tests. 16110e8 "feat(forge): forged crews send mail, tried on a
trial mailbox and recorded as simulated actions (FORGE-10)": `src/tools/Orkeon.Tools.Email/Trial/` (`EmailTrial`,
`TrialMailbox`, `ScopedMailboxProvider`, `SimulatedMailAction`, a shipped `sample-mailbox.json`),
`Accounts/EmailRightsCheck.cs` (a run whose mail tools need a right no ready account grants is refused at crew load, before
any model call: `RunnerExecution.Diagnostics.cs` prints one `ERROR:` line per tool, `orkeon run` exits 2, `--validate`
exits 1 with the same lines, `orkeon-host` fails the run), `Commands/Forge/ForgeSandbox.cs` (`DeniedTools` reduced to
`shell_command` and `code_interpreter`: the twelve mailbox tools are offered), `ForgeTrialMailAuthor.cs`,
`ForgeMailAction.cs`, `ForgeJudge.cs` (`JudgeAsync(brief, output, mailActions, ct)`), `runs/<n>/run.json` gains
`mailActions`, carried by `run.finished`. 87eb3bb "feat(studio): console links, model names, live token counter and a call
mode (STUDIO-71)": `Orkeon.Constants.Protocol/RunEventKinds.cs` (`llm.call.started`, `llm.call.progress` at most every
250 ms, `llm.call.finished`), `Interfaces/Ports/ILlmCallObserver.cs`, `Crew/Execution/LlmCallModeScope.cs`,
`ValueObjects/LlmCallMode.cs` (`Auto`, `Buffer`, `Stream`), `LlmConfig.cs` (+`CallMode`), `LLMs/CallMode/CallModeLlmProvider.cs`
and `LlmWireMode.cs`, `LlmProviderFactory.cs` (the vendor provider wrapped in `CallModeLlmProvider` under the limiter and
the meter; `MeteredLlmProvider.Unwrap`), `LlmSettings.cs` (`ReadCallMode`; `HasDefault` and the inference of the provider
from the base URL untouched), `LlmSettingsShape.cs`, `Settings/Catalog/library.json` (+14 lines), the Ollama, Anthropic and
OpenAI-dialect providers (`StreamsNatively = true`), `Logging/LlmLoggingDelegatingHandler.cs` and `LoggedStreamContent.cs`
(a stream reaches the caller as it arrives and is logged as its rebuilt answer), Studio's status bar and settings screen.
9eb855b "fix(llm): a provider's tool call is replayed with every property it carried" (`LlmProviderToChatClientAdapter.cs`).
23f4eae "fix(crew): an agent that spends its iterations on tool calls still gets its final answer, and the Atelier plans
mail tasks that run": `ChatClientAgentLoop.cs` (the tool-free turn always follows an exhausted `maxIter`, logged `spent its
N iterations on tool calls; asking once more, without tools, for the final answer`; the text beside the last tool call is
never the answer; an empty answer fails the task with `MaxIterationsReached`), `ExecutionLog.cs`, `Forge/ForgeBlueprint.cs`
(`ForgeBlueprintAgent.MinIterations` = 6; a `client://` address in a mail task refused by the plan check). Outside `src/`
and the tests: `CHANGELOG.md`, nine pages of `docs/` (`architecture/llm-providers.md` "Call mode", `run-event-bus.md`,
`security.md`, `guides/email.md`, `reference/configuration.md`, `tools/inventory.md`, two getting-started pages, ADR-012),
`scripts/check-console-urls.py`, `appsettings.sample.json`, the `backstage` pointer. Identical: `CLAUDE.md`,
`CONTRIBUTING.md`, the root project files, `YamlConfigModels.cs` and the TypeScript typings (no `callMode` key: a host
setting), the loaders, the crew modes, the mount rules, the launchers, `RunnerSettings`, `ToolRegistry`, the tool
contracts (no `[ToolContract]`, description or request record changed), the 17 request records without `[FieldSchema]`.

**What it changes for the workshop (sources).** The tool catalogue of `orkeon-reference.md` § 5 is unchanged: the CLI
built at 23f4eae prints the same 83 names on `orkeon run --list-tools` (13 `email_*`), equal to the lists embedded in
`check_crew.py` and `check_team.py`. Rewritten where the fact moved: `cli.md` (exit 2 and exit 1 rows, `--validate`, the
event kinds — seventeen —, `LogStreamingExchanges`, the unknown-key message of `Llm` that now lists `CallMode` after
`StreamIdleSeconds`, the forge row), `llm-profiles.md` (the `CallMode` / `ORKEON_Llm__CallMode` row; fourteen keys),
`resume-and-memory.md` § 3 and `orkeon-reference.md` § 3 (the final-answer turn), `csharp-crews.md` (`LlmConfig.CallMode`,
`CallModeLlmProvider`, `MeteredLlmProvider.Unwrap`, `ILlmCallObserver`), `yaml-schema.md` and `typescript-dsl.md` (no
`callMode` key), `design/sizing-and-cost.md` (§ 1 the `CallMode` row and `StreamIdleSeconds` under each mode, § 2 the end
of `maxIter`, § 5 the `llm.call.*` events), `reliability/error-handling.md` (the `maxIter reached` and `streamed call` rows,
a provider refusing to stream, the mail rights check), `reliability/resume-patterns.md` (`MaxIterationsReached` now always
empty), `design/team-patterns.md` (what fails a task), `testing/local-vs-remote.md` (both sides stream by default; the
events), `reliability/security.md` and `design/tools-selection.md` (`EmailRightsCheck`, the forge's catalogue), the
`LlmProviderRegistration.cs` of the `OrkeonCrewHost` template, `docs/guides/models.md` (one sentence on `Llm:CallMode`) and
the two `orkeon-bench.md` pages, each with its French page. Moved by label only, the fact checked unchanged in the diff:
the pin, the reference version of the bench and of the five templates (`1.0.0-rc.4.src.20261012.g23f4eae`), the headers
of the references and their table, `HARNESS.md`, the READMEs, `FROZEN-LITERALS.md` row of the remote rule, the
`ATTEMPT-manifest.json` templates, the bench's tests and fixtures (the build-metadata sample `+23f4eae2d101`), the
`run-gate` hook (`Provider` still refused, run on the binary). History stays as written ("since ad6dc63 (LLM-13)" in
`csharp-tools.md`, the lists of the commits a fact was seen on, V-29 to V-32, the plan's journal).

**Checked from the source tree (2026-10-12).** The CLI: a Release build of `src/scripting/Orkeon.Scripting.Cli` at
23f4eae with `-p:Version=1.0.0-rc.4.src.20261012.g23f4eae` (SDK 10.0.301, 1 min 25 s, 0 warning), `HOME`,
`XDG_CONFIG_HOME` and `TMPDIR` on a scratch folder: `orkeon --version` = `orkeon 1.0.0-rc.4.src.20261012.g23f4eae`;
`orkeon run --list-tools` = 83 names; `orkeon settings Llm` lists `Llm:CallMode` and `Llm:Profiles:<name>:CallMode`
(`string`, default `"Auto"`) beside the two `StreamIdleSeconds` (`integer`, no default); `ORKEON_Llm__CallMode=Fast` →
`ERROR: Llm:CallMode is not a call mode: 'Fast'. Use Auto, Buffer or Stream.`. The bench on the new reference version:
`npm run lint` (tsc, no dependency violation over 132 modules) and `npm test`, 1547 tests in 59 files, all passed.
`cc-usage`: 11 unit tests OK. The tests of the five plans of the day (`temp/tests-index-2026-10-12.md`), before the
migration: the strict evals found three defects of the lots, fixed (the A1 sentence of `/dev-implement` wrapped over two
lines, the fourth stderr line of `worktree-create.sh` the D70 case did not expect, `restore-seen` appended after the
`teamapprove` prefix the `layout` case anchors at the end of the purge list); then, under `LC_ALL=C` (V-32), 1155 passed,
the eleven red cases being the ones that need `ast-grep` (10) or `orkeon-studio-check` (1), absent here. After the
migration, with that `orkeon` and `orkeon-bench` on the PATH: 1156 passed, the same eleven skipped cases red and nothing else, the catalogue case PASS ("the two check scripts embed the same tool catalogue as section 5 of orkeon-reference.md, and as the installed orkeon when it is the reference version"), slowest hook `run-gate`, median 178 ms over 141 cases. The site: docfx 2.81.0, 0 warnings,
0 errors; the relative links and anchors of the 404 Markdown files of the repository, hidden folders included: 0 problems.
Not run, as they need a workshop session with the dev pack active: the manual checks of the five test plans, among them the
`/dev-batches` run that closes lot 14.

**The image (binary, 23f4eae).** Rebuilt locally on 2026-10-12 from 09:12 to 09:21 UTC (`docker build --build-arg ORKEON_SOURCE_REF=23f4eae2d1018893c19140d7c13a7ccbb1a2581d --build-arg ORKEON_REFRESH=<the same>`, the unchanged layers cached, Orkeon rebuilt from the commit), with every change of the day in it: plans A–E, the three eval fixes, this migration. `orkeon-workshop:latest` = `e37e1e427d46`, 18.3 GB. In the build: `orkeon --version` = `orkeon 1.0.0-rc.4.src.20261012.g23f4eae` and its packages packed at that version; the templates' self-check PASS (OrkeonCrewHost 117 tests, OrkeonPlugin 8, OrkeonRunner 118, OrkeonStudioCheck 19 and 1 skipped, OrkeonTool 11, 0 warning, each also restored and built offline); the bench, 1547 tests in 59 files, all passed; the harness evals in strict mode, **1167 passed, 0 failed**, the catalogue case included ("the two check scripts embed the same tool catalogue as section 5 of orkeon-reference.md, and as the installed orkeon when it is the reference version": PASS); slowest hook `run-gate`, median 117 ms over 141 cases (budget 1000 ms). Log: the session's scratchpad, `image-build-23f4eae.log`.

## V-34 — the `/dev-batches` run that closes lot 14, three harness defects it found, and the migration to Orkeon `main` at 5668c54 (image e37e1e427d46 on 23f4eae, sources; 2026-10-12)

**The setting.** A scratch repository `arion-orkeon/ledger-scratch` (private, GitHub): a .NET 10 solution `Ledger.sln`,
one domain project, one xunit test project, `Directory.Build.props` with `RestorePackagesPath` = `packages/` as Orkeon,
a repository pack `repo-scratch` dropped under `.claude/harness/packs/` (`layout.shared: [packages]`, `commands.restore`,
`build`, `build_test`, `test_class`, `test`, `tests.rule_trait: BR`, `contrib.branch` `feature|fix|chore/<slug>`), a spec
and a plan written by hand on the templates, three sheets with disjoint `## Anchors` (F1 `Wallet`, F2 `Budget`, F3
`Allowance`). A `docker run` container of the image `e37e1e427d46` (23f4eae), `HARNESS_PROFILE=dev`, Claude Code
2.1.296 installed at the first start (Opus 5.5), the `rtk hook claude` of `~/.claude/settings.json` removed as the
develop page says, `gh` signed in, the session opened in tmux with `workshop --git-identity "Test User" test@example.org`.

**Lot 3 (plan D), checks 10 and 11.** In the container, without identity: `git var GIT_AUTHOR_IDENT` exits 128 ("unable to
auto-detect email address", the hostname carries no domain), `git config user.name` exits 1; with `GIT_AUTHOR_NAME=X
GIT_AUTHOR_EMAIL=x@y` it prints `X <x@y> …` and exits 0. Every commit of the run carries
`Test User <test@example.org>` as author and committer, and `git config --global --list | grep user` is empty.

**The run, `/dev-batches F1 F2 todo/ledger/LEDGER-PLAN.md` (11:58 UTC).** The orchestrator read the summary table, the
`Depends on` lines and the anchors, found them disjoint, checked the absence of the rtk hook, printed `→ Batches: F1 F2
now` and launched two `dev-batch` agents (`run_in_background`), each in `.claude/worktrees/agent-<id>` on
`feature/agent-<id>` with `packages` linked to the main checkout's.

- **Defect 1 — two warm builds at once in one shared cache.** The `WorktreeCreate` hook started the two restores two
  seconds apart (11:58:12, 11:58:14) into the same, cold, `packages/`; each lost a temporary file of the other
  (`NuGet.targets(198,5): error : Could not find file '…/packages/microsoft.net.test.sdk/17.14.1/hv5ez1dg.y4y'`), both
  logs ended `exit=1`, both agents returned `## BLOCKED` with `Reason`, `Missing`, `Next` and their worktree, as the
  charter says; the orchestrator relayed the three lines, ticked nothing and carried the question to the user (plan C3
  observed). Fix: `worktree-create.sh` runs the warm builds of one main checkout under `flock` on
  `<main>/.claude/local/worktrees/.build.lock` (`lock: waiting`, `lock: taken <time>` in the log), and a reused worktree
  whose log does not end `exit=0` is built again. On Orkeon the cache is warm before a first `/dev-batches` (the user's own
  restore), which is why the tests of plan B had not seen it.
- **Defect 2 — the lock held by the build servers.** After the relaunch (12:03:26), the first worktree built in six
  seconds and the second took the lock at 12:15:35: the `dotnet` build servers (MSBuild node reuse, the compiler server)
  inherited the lock's descriptor and kept it until they stopped. Fix: the command runs with the descriptor closed
  (`{ cmd; } 8>&-`); the eval `worktree-hooks` runs two worktrees whose restore leaves a child behind and checks the
  marker `inoutinout` and both `exit=0` within fifteen seconds. F3's worktree, created after the fix, took the lock at once.
- **A resumed agent runs no hook.** The orchestrator relaunched the two agents with `SendMessage` (a resume), which
  creates no worktree: it ran `worktree-create.sh <name>` itself for each (the reuse path) to start the builds again. A
  fresh `Agent` launch with the same name would have done it through the hook.

**F1 and F2, after the relaunch: `VALID`, committed, pushed, pull requests #1 and #2** (the question asked once for both,
`HARNESS_PR_AUTO` left at the managed default: the `-e HARNESS_PR_AUTO=1` of `docker run` is overridden by the
`env` of `settings.local.json`, so the switch belongs there, as the test plan said). Measured on the sixteen transcripts of
the session (`~/.claude/projects/-workspace/<session>/subagents/`, the agents of an agent beside it — H-E3b confirmed):

| | F1 `Wallet` | F2 `Budget` | F3 `Allowance` (after the fixes) |
|---|---|---|---|
| Duration, turns, subagents (`Notes` line) | 00:09, 33, 6 | 00:21 (twelve minutes waiting for the lock, defect 2), 48, 6 | 00:04 wall clock, 29, 6 |
| `cc-usage --agent` (fetched prices): cost, final context | $0.75, 60.1k | $0.84, 62.8k | not read |
| Explicit `dotnet restore` in the batch and its roles | 0 | 0 | 0 |
| `dotnet build`/`test` without `--no-restore`/`--no-build` | 0 | 0 | 0 |
| `dotnet build Ledger.sln` run by the batch | 1 (`--no-restore`, to `dev-build.txt`) | 1 | 1 |
| Reports of the roles (lines) | 5–9 | 5–10 | ≤ 10 |
| `## Mechanical audit — F<n>` (lines), `mechanical table:` in the auditor's prompt | 17, yes | 18, yes | yes |

Plan A in situation: the batch agent read no source or test file (no `cat`, `sed -n`, `grep` or `Read` under `src/` or
`tests/`), read the sheet by `grep -n` then `sed -n` ranges and one `sed -n '/^### Step n /,/^##/p'` per cycle, redirected
every `dotnet` to `${TMPDIR:-/tmp}/dev-*.txt` with `echo "exit=$?"` and a `tail`, and ran one wait loop (the build log).
Final contexts of 60–63k against the ~180k of D70 alone (§ 4 of the cost report) and the ~70k target of plan A. `cc-usage
--no-fetch` prices nothing ($0.00) when no price table is cached; `--agent a561 --json | jq .id` resolves the four-character
prefix. No `clear-nudge` line (contexts under 150k), no `clear-nudge.tsv`; `context.log` has nine lines, all of the main
session (eighth column empty): the `context-log` hook logged nothing for the agents — H-E3a untested, the hypothesis of
the eighth column not confirmed.

**Three defects the agents reported, fixed and verified by F3.** (3) The role charters named
`.claude/skills/...` paths, read in the worktree, which has no `.claude/`: the GREEN agent of F1 looked for
`common-rules.md` and `access-cost.py` there, and the batch had to send the main checkout's paths by `SendMessage`.
Now every contract carries `Harness: <absolute .claude/>` and both audit prompts `— harness: <path>`
(`contracts.md`, "The harness path"; the five charters read `<harness>/...`). F3's four contracts and two audit prompts
carried `/workspace/.claude`. (4) The audit gate refuses a sheet with open `TDD:` lines and a batch agent cannot tick the
main checkout's sheet: F1 and F2 ran it on a ticked copy under their scratchpad, and it failed until `LEDGER-PLAN.md` was
copied beside it (the non-applicable rules). Now `audit-capture.sh --plan-dir <folder of the plan>` reads the plan's
folder when the sheet is a copy kept elsewhere, and `closing.md` § 0 says to copy the sheet to
`${TMPDIR:-/tmp}/dev-sheet-F<n>/`, tick the copy and pass `--plan-dir`; F3 did exactly that (`/tmp/dev-sheet-F3/…
--plan-dir /workspace/todo/ledger`), gate green. (5) `memory-scope` refused the auditor's memory writes under
`<worktree>/.claude/agent-memory/dev-auditor/` (Claude Code resolves `memory: project` against the worktree; the hook
allowed the checkout's folder only). Now `worktree-create.sh` links `<wt>/.claude/agent-memory` to the main checkout's
when the main checkout holds a deployed harness (`.claude/.harness-manifest`) — one memory per repository —, and the hook
also allows the worktree's own `.claude/agent-memory/<agent>/`; F3's auditor met no refusal.

**Lot 5 (plan E), check 4.** The `clear-nudge` hook alone, on a forged agent transcript at 170k: the `PreToolUse`
`additionalContext` starts with `clear-nudge: about 170k tokens of context are replayed on every turn of this agent`, the
tsv holds `ses1:abc	1`, the second run is silent. **Lot 4 (plan C), check 10**: one `| D73` line, one `D1–D73`, the
`| D72` line unchanged. **Not run**: the interview of `/dev-spec` and the `mode: spec` / `mode: plan` reviews (plan C 4–6:
an interview needs a person at the keyboard), `/dev-batches` on a `## BLOCKED` of design (C3 was observed on the
restore block instead), lot 2 check 8 on a real Orkeon checkout (`guard-restore` was never triggered: no role restored),
lot 3 checks 12–13 (`gh auth logout`, the PR from `/dev-verify` alone).

**Orkeon `main` moved during the run: 23f4eae → 5668c54** (one commit, `fix(tests): optimistic concurrency is read from
the version, never from…`, `tests/core/Orkeon.Domain.Tests/Common/AggregateRootTests.cs` only, +3/−1). Nothing a
statement of the workshop depends on changed: every statement checked at 23f4eae was moved to 5668c54 (99 files, the
history phrases — "since 23f4eae", the lists of commits — kept as written), the version `1.0.0-rc.4.src.20261012.g5668c54`
(same day). Bench: lint green, 1547 tests in 59 files. Strict evals outside the image, under `LC_ALL=C`: 1092 passed,
77 red, every one of them a skip (no `orkeon`, `orkeon-bench`, `orkeon-studio-check` or `ast-grep` here: 70 skipped by
the runner, 7 `bench-contract` cases that print `ok (skipped…)` themselves) and nothing else red; `worktree-hooks` 9/9 (two new cases), `memory-scope` 19/19 (one new), `pack-dev` 22/22 (gate case extended).
**The image (binary, 5668c54).** Rebuilt locally on 2026-10-12, done at 13:06 UTC (`docker build --build-arg
ORKEON_SOURCE_REF=5668c54864a76821ca66fa344d280f63509e6985 --build-arg ORKEON_REFRESH=<same> -t orkeon-workshop
.devcontainer`): `orkeon-workshop:latest` = `b304d695e767` (18.3 GB), `orkeon --version` = `orkeon
1.0.0-rc.4.src.20261012.g5668c54`, the templates' self-check PASS (eleven PASS lines, no FAIL), the bench 1547 tests in
59 files, the harness evals in strict mode **1170 passed, 0 failed** (1167 before: the three new cases of `worktree-hooks`
and `memory-scope`), the catalogue case included. The image carries the fixes of this entry (`flock` in
`worktree-create.sh`, `--plan-dir` in `audit-capture.sh`).


## V-35 — S0 of the reading plan: the structure tools of the image, the transcript markers, and the guards replayed (sources; 2026-10-13)

**What was checked.** (1) `ast-grep 0.50.0` (the image's `@ast-grep/cli`) has an `outline` command: on
`csharp/OrkeonCrewHost/tests/SampleTeam.Host.Tests/MountReachTests.cs` (276 lines, 13 351 bytes) it prints the class,
its methods, constructor, properties and fields in 6 lines and 959 bytes — no line range per member in that view (`--json` carries each
item's range: zero-based start and end line, byte offsets), and for markdown the headings alone (`HARNESS.md`). `rtk read -m 40` on the same file: 1 334 bytes of imports, summary and
signatures. The bounds refusal of a code file names both (`bounds_structure_hint`), each only when it is on the PATH.
(2) The markers the pilot guard reads in the main transcript: in the session transcripts of this machine
(`~/.claude/projects/-workspace/*.jsonl`) a typed skill is a user message holding
`<command-name>/<skill></command-name>` — `/dev-plan`, `/dev-batches`, `/dev-verify` and `/dev-change` found, beside
`/clear` and `/compact`; `/dev-implement` was typed in another workspace, by the same writer —; a `Skill` tool call
carries `"skill":"<name>"`, but `/dev-implement` is `disable-model-invocation: true`, so the typed line is its one
launch. The em dash of the closing line is written raw (UTF-8: one transcript here holds 306 raw em dashes), and GNU
grep 3.8 (`/usr/bin/grep`, the one a hook runs; the interactive shell's `grep` is ugrep 7.8.4) has no `\xHH` escape in
an ERE: the first regex matched nothing on the raw bytes — found at the review of 2026-10-13, the first fixtures
carrying the escaped form alone; the guard now passes the bytes through `printf`, and a raw fixture closes the batch in
the evals. (3) The guards, replayed by the evals on the checkout: `pilot-reads` (28 cases — a `dev-batch` agent, the
main conversation with an open, closed (the dash raw or escaped), cleared or quoted transcript, a role agent, the
switch, the flag, a stderr redirect, a tree of notes against a tree of code, by Read and by Bash), `grep-breadth` (27),
`cat-bounds`, `read-bounds` and `delegation-guard` rewritten for the explicit flag and the generic-agent refusal; the
dispatcher's median stays near 130 ms (129 ms over the 76 dispatcher cases of the S0 case files, at the review); the whole suite: 1 239 passed, 0 failed. Not run: a real `/dev-batches` batch
under the guards — the measure S0 asks for (token·turns per role) is the next run's.

## V-36 — No default model: `init-orkeon.sh` replayed with an empty `OLLAMA_DEFAULT_MODEL` (sources; 2026-10-13)

**What was checked.** The image no longer names a local model (D76): `ENV OLLAMA_DEFAULT_MODEL=qwen3:8b` is gone from
the Dockerfile, and the model is the `-e OLLAMA_DEFAULT_MODEL=<name>` of the `docker run` that creates the container.
`init-orkeon.sh` already returned on an empty model in `init_orkeon_config`, `schedule_model_pull` and
`report_host_model`; the change adds a hint. Replayed in this devcontainer (Ollama 0.35.0 up on CUDA, the models
volume mounted), the script run by hand with `OLLAMA_DEFAULT_MODEL=` empty: `--status` prints
`mode      : local (default model: none)`; `OLLAMA_MODE=local` prints `Ollama already answering` then the four hint
lines (`No local model named (OLLAMA_DEFAULT_MODEL is empty): nothing is downloaded and no Orkeon settings file is
written. Name one when the container is created (-e OLLAMA_DEFAULT_MODEL=qwen3:8b), or later by hand: ollama pull
<name>, then orkeon init --provider ollama --model <name> (the timeout and the throttle are completed at the next
start).`), no `[pull]` line reaches `/var/log/ollama.log` and `~/.config/Orkeon/appsettings.json` is not touched
(the file of this container, written earlier for `qwen3:8b`, kept its date); `OLLAMA_MODE=host` starts the
forwarder and warns on nothing (the empty name is not reported as missing). `bash -n` on `init-orkeon.sh` and
`entrypoint.sh`; the three devcontainer files parse as JSON once their `//` lines are dropped, the way the
`layout` eval reads the workshop seed; the evals: 1 239 passed, 0 failed. Not run: an image build (D74) — due,
the Dockerfile changed — and a first `docker run` of a fresh container with and without the option, which only
the built image gives.

## V-37 — After GAP-43-44: what the dev chain cost for nothing, measured and cut (sources; 2026-10-14)

**Source of the figures.** The GAP-43-44 run of Orkeon (2026-10-13, six batches through `/dev-batches`, 11 h 03, about
77.6 USD at list price) was measured from its transcripts in the user's container; those transcripts are not on this
machine, so every figure of that run quoted below is the analysis's (`temp/analyse-gap-43-44-temps-cout.md`, not
re-measured here); what this entry measured itself says so.

**What was checked.** (1) **The audit gate reads no build output.** `audit-capture.sh` searched the traits
(`grep -rnoE` over the roots, then `grep -v '/bin/\|/obj/'`) and the test classes (`grep -rlw --include`) through every
file of `bin/` and `obj/`: 19 gates of 3.8 to 10 minutes in GAP-43-44, 1 h 57, every one of them reusing the build
(`exit: 0 (reused …)`, B3) — the time was the reading (the analysis, measured on `Orkeon.Domain.Tests`, 1.5 GB of
`bin/`: 20.7 s for the grep as written, 0.26 s for `git grep --untracked`). Both searches now go through
`git grep --untracked -I`, which reads the tracked files and the batch's new untracked ones and skips what `.gitignore`
ignores, with `--build-outputs "<dir> <dir>"` (`layout.build_outputs`, `[bin, obj]` for Orkeon) excluding them by
pathspec when `.gitignore` does not; the status, the changed files and the diff of the capture use the same
exclusion. Measured here, on `/workspace` (the 9p mount of `C:\`), on a demo repository whose test project carries a
fake build of 1.4 GB (600 files of 2.5 MB, ignored by `.gitignore`): the gate as committed at dcbc683 took 10.4 s and
10.0 s, the new one 0.86 s and 0.83 s, the whole gate included (status, diff, access cost), the same trait found in
both. Writing that fake build took 60 s, about 23 MB/s: at that rate a built Orkeon worktree (25 to 30 GB) is minutes
of reading for the old search, nothing for the new one, whose time does not grow with the build. The eval case
(`pack-dev`) checks the four sides: a trait only in an ignored `bin/` or `obj/` does not count, a trait of a new
untracked test file does, a repository without the `.gitignore` lines lets the `obj/` copy pass the gate, and
`--build-outputs 'bin obj'` takes the outputs out of the traits, the status, the changed files and the test classes.
The other searches of the harness over a repository root, read for the same defect: `audit-axes.md` § 0.1 told the
conformance auditor to `grep -rn "<Method>"` the test roots — now `git grep -n --untracked`, and the two auditor
charters name it; `guard-restore` walked into the folders of every `obj/` — it now stops at
`obj/project.assets.json`; `pilot-common.sh` (`-maxdepth 3`, `bin` and `obj` pruned), `worktree-create.sh` and
`workshop-profile.sh` (`-maxdepth 3`, links only), `check-links.py` (`bin` and `obj` pruned), `workshop-profile.py`
(the harness tree only) and `access-cost.py` (`git diff`, then `ast-grep`, which honours `.gitignore`) read no build.

(2) **No wait of a batch outlasts the prompt cache (D77).** Read in the Claude Code documentation on 2026-10-14
(Claude Code 2.1.299 here): a subagent's prompt cache lives five minutes, the main conversation's one hour on a
subscription (`code.claude.com/docs/en/prompt-caching`, "Subagents and the cache"), and `subagentPromptCacheTtl` or a
per-agent `cacheTtl` (`experimental` frontmatter, 2.1.248 and later) can raise it; in an interactive session a subagent
that launches background subagents waits for their results before it finishes (`sub-agents`, "Let subagents spawn their
own subagents"); a foreground `sleep` is undocumented, refused from about 25 s according to issue #87920, which reports
a foreground `until … done` loop accepted. The charter's slice (`timeout 270 bash -c "until grep -q '^exit=' …"`) and
the detached command of `contracts.md` replayed here: `setsid nohup bash -c '<cmd> > "$0" 2>&1; echo "exit=$?" >> "$0"'
"$f"` returns at once and leaves the output then `exit=0` in the file. The `pack-dev` case checks the sentences (no
`timeout 1200` left). Not run: a batch, which alone shows the rebuilds gone.

(3) **The whole suite once per batch (D78).** `affected-tests.py` replayed on a demo repository of three production
projects and three test projects (`ProjectReference` written with `\` and with `/`): a change in `Domain` reaches
`Domain.Tests` and, through `App`, `App.Tests`, never `Other.Tests`; a new untracked file of `App` reaches `App.Tests`, a
file of an ignored `bin/` nothing; `Directory.Build.props` prints `all`; a document and the work folder print nothing;
`--base HEAD~1` reads a committed change; a usage error exits 2 (`pack-dev`). Orkeon's `test_project` is the fast filter
of `commands.test` on one project plus `-- --ignore-exit-code 8`, the switch `commands.test_integration` already
carries for the same exit (CONTRIBUTING.md "Development Setup" at 5668c54, as `repo.yaml` cites it). Not run: the
command on an Orkeon checkout (none here), and a correction round of a real batch.

(4) **A merged worktree goes at once.** `worktree-create.sh --space` and `--remove --background` replayed on a demo
repository (`worktree-hooks`): two worktrees created by the script, one merged into the main checkout's HEAD by
fast-forward, one with a commit of its own; `--space` prints the free space (`df -Pk` of `.claude/worktrees`), the
30 GB of `layout.worktree_gb`, `merged:` and `unmerged: … 1 commit(s) not in HEAD`, and exits 3 once the size says
two worktrees do not fit; `--remove --background` refuses the unmerged one at once (exit 1) and, for the merged one,
returns at once, then the detached deletion removes the folder and its branch, the log ending `exit=0`, the other
worktree's branch kept. On this machine `df` on the 9p mount reports the Windows drive (252 GB free). Not measured:
the time of a detached deletion of a built Orkeon worktree (9.4 minutes for four in GAP-43-44, from the analysis),
which no one waits for any more.

(5) **One branch pushed (D79).** What GAP-43-44 left, from the analysis: six `origin/feature/agent-*` tracking refs
of the batch branches in the user's checkout, the batches merged locally into `fix/gap-43-44` by `git merge --ff-only`,
one pull request (#88). Checked here by reading: no sentence of the `dev-batch` charter, of `closing.md` § 0 or of
`/dev-batches` pushes a batch branch any more, `closing.md` § 7 holds the merge, the one push, the one pull request
and the deletion script handed over (`pack-dev`, and the D70 and plan D cases kept green on their literals). Not run:
a `/dev-batches` run, the rebase path of two batches merged out of order, the deletion script on a remote.

(6) **The checks before the first launch.** `preflight.sh` replayed (`pack-dev`) in a clone of a bare repository
with an empty `HOME` and git configuration: `FAIL` for the identity (`git var GIT_AUTHOR_IDENT` exits 128, as it does
in this container today), `FAIL` on `main` once `origin/HEAD` names it, `ok` for no hook, the `gh` line never a
`FAIL` whatever its state, the space said; then on a work branch with `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` set and an
`rtk hook claude` in the settings: identity and branch `ok`, the hook `FAIL`; without the hook, exit 0.

(7) **What stops a background agent, and the checkpoints.** Read in the Claude Code documentation and changelog on
2026-10-14 (up to 2.1.299): `interactive-mode` and `keybindings` — Ctrl+X Ctrl+K "Stop all running background
subagents" (twice within 3 s), `x` on a `/tasks` row; changelog 2.1.196, Ctrl+C stops background agents; 2.1.47,
"Background agents now continue running when you press ESC"; a message typed while Claude works is queued, `/btw`
"doesn't interrupt the main turn"; `sub-agents`, "Resume subagents": a subagent stopped from `/tasks` is not resumed
automatically, the user can type into its transcript while its row is listed. Issues against them, open: #76807 (Esc),
#81765 and #81056 (Ctrl+C), #78151 (a message mid-turn, still reported on 2.1.296 on 2026-10-13). Not tried: the
gestures are the user's keys, and a background agent cannot be stopped from inside this session to observe it. The
checkpoints were checked by reading only (`pack-dev`): the charter's commit, state line, fold and `resume:` line;
`.claude/local/` is in the exclude block `sync-harness.sh` writes for every worktree of a source space (`/.claude/local/`,
a root pattern git applies in each worktree), so the state line never reaches the gate's changed files. Not run: a
stopped batch resumed.

(8) **The model of a batch agent.** `code.claude.com/docs/en/sub-agents`, "Choose a model" (read 2026-10-14): the
`Agent` tool "can also pass a `model` parameter for that specific invocation", first in the order (then the frontmatter,
then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main model), aliases `sonnet`, `opus`, `haiku` or a full id;
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` would override both. The harness's `delegation-guard` lets an explicit `model`
through. Checked by reading (`pack-dev`); not run: a batch launched with the switch.

(11) **A false positive of `delegation-guard`, found during this work.** A `general-purpose` agent briefed to edit
`.devcontainer/harness/packs/dev/claude/skills/dev-implement/references/contracts.md` was refused as "a batch of the dev
chain" (the deployed hook, 2026-10-14): `/dev-implement` matched inside the path. The pattern now requires a character
other than a letter, a digit, `_`, `.`, `/` or `-` before it; two cases added (the path passes, `` `/dev-implement F2` ``
is still refused), the 34 earlier cases unchanged and green.

(10) **`cc-usage`, the final output count.** Seven tests added to `tests/test_workshop_changes.py`, on transcripts
built in a temporary folder: a response written as two records of the same id, output 4 then 812, counts 812 in the
session parser, through `--agent`, in the `(subagents)` line and the per-agent output of `--session`, and in the
aggregate views; the output cost follows (812 × the rate). Against the file as committed at dcbc683, six of the seven
fail (`Ran 44 tests`, `FAILED (failures=6)`; the seventh, "a smaller later count does not lower it", passes before and
after); with the fix, `Ran 44 tests`, `OK`. The upstream patch applies with `git apply --check` to the upstream
`main` (79e1a25) and its own tests pass with it (upstream needs Python 3.12; its codex import stubbed on this 3.11).
The 1 203 multi-record ids with identical input and cache fields, and the GAP-43-44 figures, are the analysis's.

## How to re-run

The stub and the one-task team used for V-01, V-02, V-04, V-05, V-06 and V-13 (`--validate -v 1` on
each variant of the settings), and the scripted stub probes of V-14 and V-16 (a stub that records the
requests, or plays one tool call per step), were hand-made. `orkeon-bench llm-stub serve --scenario
<reply script> --log <file>` now does both — a rule per step, every exchange logged — and the scripts
are kept as examples under `library/examples/` once the pilots have tests (lot 5). In the image:
`docker create` + `docker cp` + `docker start` + `docker logs` — `docker run -i` does not return output through the socket proxy of the
devcontainer. The **build, fb26364** points were run without the image (and the **build, 77ac8a9** and **build, 80fdefe** ones the
same way, the CLI built with `-p:Version=` the version the image gives it — `1.0.0-rc.4.src.20261006.g77ac8a9`, `1.0.0-rc.4.src.20261007.g80fdefe`): a Release build of
`src/scripting/Orkeon.Scripting.Cli` in a checkout of fb26364, `dotnet …/bin/Release/net10.0/orkeon.dll`
with `HOME`, `XDG_CONFIG_HOME` and `TMPDIR` on a scratch folder, hand-made team folders, and a Python
HTTP stub on `127.0.0.1` (ports other than 11434) that records each request and answers a scripted
`tool_calls` or a final text with `usage`. V-15 is re-run at every image build — the tests of
`orkeon-studio-check` (`verify-templates.sh`) and the `bench-contract` evals, which run it on scaffolded teams — and
`orkeon-studio-check` checks the teams of a workshop at any time.
