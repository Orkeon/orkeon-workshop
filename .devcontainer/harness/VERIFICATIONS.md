# Verifications

Facts the harness relies on, checked against Orkeon. Lot 0 checked them on `1.0.0-rc.4` (2026-10-01);
since D32 the image builds Orkeon from the sources of `main`, and the entries say where `main` at commit
24ab0d0 (`1.0.0-rc.4.src.20260930.g24ab0d0`, 2026-10-02) was checked and what changed. `main` at a2bb6c3
(`1.0.0-rc.4.src.20261003.ga2bb6c3`, 2026-10-03, 52 commits later) was re-read in its **sources** for the
entries on settings, models, keys and the shell (V-01, V-04, V-13, V-14, V-16), the tool catalogue,
plugins and resume (V-06, V-07, V-08); its binary was then run in a container of this image
(2026-10-03) for the points the entries mark **binary, a2bb6c3**; the rest is from the sources. Each entry says how it was checked: **binary** = run in a container of this image; **sources** =
read in the Orkeon repository at that version. Re-run them when the Orkeon commit of the image changes.

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

## V-02 — a promoted team is launched as `orkeon run crew` from the team folder (binary)

`orkeon run . --validate` from the team folder exits 1 (the layout inspector never looks inside
`crew/`). `orkeon run crew --validate` from the team folder exits 0 and prints
`VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K)`. Launchers and the bench use
the second form, with the team folder as working directory.

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

## V-05 — the `--events jsonl` stream (binary)

Envelope `{"v":2,"seq":n,"ts":"…Z","kind":…}` plus flat fields. Kinds seen on a one-task run:
`run.started`, `task.started`, `tool.called` (`toolName`, `argsSummary` = argument names,
`correlationId`), `tool.returned` (`success`, `durationMs`), `cost.updated` (cumulative
`tokens`, `model`), `task.completed` (`agentRole`, `success`, `skipped`, `durationMs`,
`tokens`, `toolCalls`), `run.finished` (`success`, `exitCode`, `tokens`, `promptTokens`,
`completionTokens`, `durationMs`).

`taskId` is a generated ULID, not the task file name, and `agentId` carries the agent **role**:
events are attached to tasks by order and by role.

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

## How to re-run

The stub and the one-task team used for V-01, V-02, V-04, V-05, V-06 and V-13 (`--validate -v 1` on
each variant of the settings), and the scripted stub probes of V-14 and V-16 (a stub that records the
requests, or plays one tool call per step), are kept as examples under `library/examples/` once lot 4
lands (`orkeon-bench llm-stub`). Until then: `docker create` + `docker cp` + `docker start` +
`docker logs` on the image — `docker run -i` does not return output through the socket proxy of the
devcontainer. V-15 is re-run at every image build — the tests of `orkeon-studio-check`
(`verify-templates.sh`) and the `bench-contract` evals, which run it on scaffolded teams — and
`orkeon-studio-check` checks the teams of a workshop at any time.
