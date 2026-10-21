# The `orkeon` CLI — commands, options, events, settings

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at acd59d6 (2026-10-20, after 1.0.0-rc.5).
> Sources: at that commit: `src/scripting/Orkeon.Scripting.Cli/` (`Program.cs`, `CliUsage.cs`, `Commands/RunCommand.cs`,
> `Commands/Run/*.cs`, `Events/OrkeonEventWriter.cs`, `Commands/InitCommand.cs`, `Commands/DoctorCommand.cs`,
> `Commands/LlmCommand.cs`, `Commands/EmailCommand.cs`, `Commands/EmailEventWriter.cs`, `Commands/McpCommand.cs`, `Commands/TypingsCommand.cs`,
> `Commands/UseCases/UseCasesCommand.cs`, `Commands/Forge/ForgeCommand.cs`, `Commands/SettingsCommand.cs`,
> `InstallChannelReader.cs`), `src/hosting/Orkeon.Hosting/`
> (`RunnerExecution*.cs`, `RunnerHost.cs`, `RunnerSettings.cs`, `RunnerEnvironment.cs`, `RunnerOptionsBase.cs`,
> `RunnerArguments.cs`, `CrewDirectoryLayout.cs`, `SettingsValidation.cs`, `Settings/SettingsCatalog.cs`),
> `src/constants/Orkeon.Constants.Configuration/EnvironmentVariableNames.cs`, `src/core/Orkeon.Infrastructure/LLMs/Profiles/LlmSettings.cs`,
> `src/constants/Orkeon.Constants.Protocol/` (`RunEventKinds.cs`, `RunEventErrorCodes.cs`, `EmailEventKinds.cs`), `src/constants/Orkeon.Constants.Cli/RunOptionNames.cs`,
> `src/constants/Orkeon.Constants.FileSystem/RunnerVirtualRoots.cs`, `src/core/Orkeon.Application/Interfaces/Ports/LlmUsageOperations.cs`,
> `CHANGELOG.md` (`[Unreleased]`), `docs/reference/cli.md`, `docs/reference/configuration.md`,
> `docs/architecture/run-event-bus.md`; harness: `.claude/harness/VERIFICATIONS.md` (V-01, V-02, V-04, V-05, V-13), plan § 1.4, § 6.3, § 6.4.
> Binary checks: `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`), 2026-10-02, with a stub on 127.0.0.1;
> what changed since is read in the sources — marked "per the sources" — except the settings judged at start,
> the `runner-settings` row of `orkeon doctor`, the `crew/` descent of `orkeon run <folder>` and the event
> stream of § 3.5, run on a build of fb26364 (2026-10-06, V-02, V-04, V-05, V-13).

The model, providers and profiles are in `llm-profiles.md`; resume and memory in `resume-and-memory.md`;
the YAML keys and what `--validate` lets through in `yaml-schema.md`; the team folder and launchers in
`studio-layout.md`.

## 1. The verbs

| Command | Does | In the workshop |
|---|---|---|
| `orkeon run <target> [options]` (also `orkeon <target>`) | runs a crew, or validates it, or lists the tools | launchers, `orkeon-bench`, Studio |
| `orkeon quickstart [--to <dir>]` | since acd59d6: writes the README's two-minute crew — `crew.yaml` (one agent, the `file_write` tool, one task that writes `/output/hello.md`), `appsettings.json` (Ollama on `localhost:11434`, `qwen2.5:1.5b`), both embedded byte for byte from `examples/quickstart/`, and an empty `out/` — into `./orkeon-quickstart/`, then prints the two runs to make from there (`--mount ./out:/output:rw`, then `:ro`); it never overwrites (§ 6) | not used: a workshop's teams come from the skills |
| `orkeon init` | writes a settings file (machine file by default) | the image at first start; the user for a remote provider |
| `orkeon doctor [--json]` | twelve checks, in this order: `dotnet-runtime`, `install-channel` (since bd3420c: the channel the build was installed through, the version that runs and the command that updates that channel — `dotnet-tool` for the image's CLI, which `orkeon-update.sh` installs with `dotnet tool install` — the update command it then names, `dotnet tool update -g`, is not the image's: `orkeon-update.sh` is; `unknown` and still `ok` without a marker; never `fail`), `appsettings`, `llm-config` (provider, model, endpoint, where the default's key comes from), `llm-profiles` (each `Llm:Profiles` entry and its key's source), then one `llm-profile-key` warning per profile whose `ApiKeyEnvVar` names a variable set nowhere, `runner-settings` (the file judged as `orkeon run` judges it at its start, § 5: one `fail` row per refusal, each naming its key, one `warn` row per section the file writes that no shipped binary reads — since bd3420c, reported and not refused —, or one `ok` row, `the settings pass the start validation of orkeon run`; skipped when the `Llm` section is already refused), `llm-reachability`, `esbuild`, `local-embeddings`, `onnx-reranker`, `tree-sitter`, `workspace-write`; `--json` is an array of `{check, status, detail}` (`ok`, `warn`, `fail`); exit 0 (warnings allowed) or 1; settings resolved from the working directory, no `--settings` (§ 5) | diagnosis |
| `orkeon settings [<name>] [--all] [--json] [--host run\|host\|repl]` | since bd3420c: lists every setting a host reads, offline, from the catalogue the binary carries — no name: the eleven categories and their sections; a category; a section, every key with its type, default, allowed values and meaning (`orkeon settings Llm`, `orkeon settings RateLimiting`); a key; else a word, looked for in the paths and the descriptions; `env` lists the environment variables Orkeon reads; a name that designates nothing exits 1 with the closest one. It opens no settings file, builds no host and judges nothing: `orkeon doctor` judges a file. `--json` is a contract (`sections`, `settings`) | reading what a section accepts before writing a team settings file (§ 5); `--json` for a check |
| `orkeon llm probe` / `orkeon llm models` | runs the provider test protocol / lists the models a provider serves | checking a provider by hand (§ 6) |
| `orkeon email accounts\|login\|logout\|check` | the operator's side of the e-mail tools: declared accounts and their readiness, OAuth sign-in (`login --events jsonl` for a program, § 6), a connection check | only for a team that reads or writes a mailbox (§ 6) |
| `orkeon drive accounts\|login\|logout\|check` | since 13461ea (ADR-013): the operator's side of the drive tools, the e-mail verb's twin — declared Google Drive and OneDrive accounts and their readiness, OAuth sign-in (`login --events jsonl` for a program, § 6), a connection check (`check --events jsonl` too) | only for a team that reads or writes a cloud drive (§ 6) |
| `orkeon rag ingest` / `search` / `eval` | RAG collections (incremental ingestion, state under `./.orkeon`) | not used by teams |
| `orkeon usecases search\|list\|show\|export` | the 104 example use cases, searched offline | finding a model team; `export` writes a team folder |
| `orkeon forge …` | the Atelier: a team from a need; since 16110e8 (FORGE-10) it offers the twelve mailbox tools to the crews it designs (`ForgeSandbox.DeniedTools` keeps only `shell_command` and `code_interpreter` — and, since 13461ea, the eleven `drive_*` tools, which have no trial drive yet) and tries them on a fictitious mailbox; since 23f4eae a plan's `maxIterations` below 6 is raised to 6 (`ForgeBlueprintAgent.MinIterations`) and a mail task naming a `client://` address is refused | not used (decision D9) |
| `orkeon typings` | writes the TypeScript typings of `.ork.ts` and `.cmd.ts` scripts into `./.orkeon/` | not used |
| `orkeon mcp serve [-s <file>] [--tools a,b]` | serves the host's tools — what `--list-tools` prints for the same settings, `human_input` aside — to an MCP client over stdio; every call crosses the Guardian | not used |
| `orkeon --version [--verbose]`, `orkeon --help` | `orkeon 1.0.0-rc.5.src.20261020.gacd59d6` for the image's build of acd59d6; `--verbose` keeps that line and adds `channel: dotnet-tool` (since bd3420c) / the thirteen verbs (`drive` since 13461ea, `quickstart` since acd59d6), ending on the documentation site and the configuration reference (`orkeon.github.io`; the repository's address until 812cd10), exit 0 | `orkeon-bench doctor` |

`orkeon <verb> --help` prints the option table (or the sub-verb list) on stdout and exits **0** since
63be532 (`1` before; `orkeon mcp` prints it on stderr); `orkeon forge` has no `--help` (`orkeon forge: Unknown
option '--help'.`, exit 1). An unknown first word gives
``orkeon: unknown command 'x'; run `orkeon --help` for the list.``,
exit 1. Verbs are matched first; then a token holding a `/`, ending in `.yaml`/`.yml`/`.ork.ts`/`.ts`/`.js`,
or naming an existing path is a run target — a crew folder named `email` or, since 13461ea, `drive` runs only as `orkeon run email` (`orkeon run drive`).

## 2. `orkeon run`

**Target.** A directory holding a multi-file YAML crew (`config.yaml` + `agents/` + `tasks/`) — at its
root, or under its `crew/` sub-folder, probed first and one step down only (`CrewDirectoryLayout.Inspect`,
STUDIO-59) —, a `.yaml` file, or a `.ork.ts` script. A script that hands its crew off with
`globalThis.crew = crew` (the declarative shape) goes through the same pipeline as YAML; one that calls
`await crew.run()` goes to the script host (`typescript-dsl.md`). A team is always run as `orkeon run crew`
**from the team folder**; `orkeon run .` there loads the same `crew/` of a YAML team, whatever its root holds
(V-02), and is refused for a script team — pass `crew/crew.ork.ts`. The crew directory is mounted read-only
as `/crew` (`/script` for a script).

| Option | Effect | Notes |
|---|---|---|
| `-s, --settings <file>` | uses that settings file and stops the resolution chain | a missing file: `WARNING: Explicit settings not found: <path>`, no fallback (§ 5) |
| `-m, --mount <spec> [<spec>…]` | VFS mounts `<physical>:<virtual>:<ro\|rw\|rwnd>[;<sub>:<rights>]` | **one** flag, values space-separated; a repeated `--mount` is rejected (§ 2.3) |
| `--mount-id <ulid> […]` | picks one of several settings entries declaring the same root | unused by the harness (no mounts in settings) |
| `--allow-external-mounts` | whitelists `--mount` folders outside the working directory | same as `ORKEON_ALLOW_EXTERNAL_MOUNTS=1` (`1`, `true`, `yes`) |
| `--llm-profile <id>` | makes the host profile `Llm:Profiles:<id>` (settings file or `ORKEON_` variables) the run's default, **whole**: every key of `Llm` unset, the profile's laid over it, its key its own (`llm-profiles.md` § 3); `default` elects nothing; case ignored | an unknown id: `ERROR: --llm-profile names the LLM profile '<id>', which this host does not offer. Known profiles: …`, exit 1 before any host — on `--validate` and `--list-tools` too; never in the workshop: the run gate does not read it (`llm-profiles.md` § 8) |
| `-v, --verbose <0\|1\|2>` | 0: warnings · 1: host decisions, agents and tools at Information · 2: debug; since f59446b the turns of a `verbose` agent or crew (tool calls, results, model answers, the `maxRpm` wait) go to the category `Orkeon.Verbose`, shown at Information at 0 and 1 unless `Logging:LogLevel` names `Orkeon.Verbose` or `Default` | logs on stdout for a plain run and `--validate`, on stderr under `--events` and `--list-tools`; `ORKEON_DEBUG=1` adds full exception dumps |
| `--llm-log`, `--llm-log-path <dir>` | records every HTTP exchange the host makes — the model's and the tools' (§ 4) | the path form implies `--llm-log` |
| `-V, --var KEY=VALUE […]` | variables of the crew input (§ 2.4) | one flag; malformed entry: `ERROR: Invalid --var '…'`, exit 1 — on a real run only, `--validate` does not parse it |
| `--initial-context <text>` | initial context of the crew input (§ 2.4) | |
| `--inputs <json>`, `--inputs-file <path>` | `globalThis.inputs` of a **procedural** script | a declarative script prints `… has no effect on this script` |
| `--memory-limit-mb <n>` | Jint memory limit of a procedural script (`0` disables) | same warning on a declarative script |
| `--events jsonl` | the event protocol on stdout, commands on stdin (§ 3) | any other value: `unsupported --events format`, exit 1 |
| `--stream` | with `--events`, adds `llm.delta` events, token by token: the agent turns of a crew and a script's `ctx.llm.*` calls (per the sources; at 24ab0d0 a YAML crew emitted none; since 0825c64 a stream whose `delta.content` is an array of typed chunks — Mistral's reasoning models — is read instead of throwing or being dropped, LLM-08); without it, turns stay buffered | off in the harness |
| `--client <name>` | with `--events`, the peer's hub name `client://<name>` (default `studio`) | without `--events`: warning only |
| `--validate` | loads the crew, no LLM call (§ 2.2) | with `--events`: warning, plain output |
| `--list-tools` | prints the tool registry, no target needed (§ 2.2) | idem |

**The argument rule** (every command since 63be532, `RunnerArguments`, `CliGrammar`): a single-value option
is written `--option value` or `--option=value`; attached with `=` the value is read as written — cut at the
first `=`, a leading `-`, a space or a line break included —, only an empty one (`--option=`) is refused;
separated, a value starting with `-` is read as the next option and refused. `--` ends the options: every
word after it is positional (`orkeon run --validate -- crew` validates `crew`). A word no option or value
takes is refused before any work, `orkeon run: unexpected argument '<word>'`, exit 1 (an extra word was
silently dropped before). A usage error — an unknown option, an option without its value, a word too
many — writes on stderr, nothing on stdout, exit 1. Studio and the launchers it writes use the `=` form;
`orkeon forge list` refuses any word (`list takes no argument.`), `forge promote` and `forge resume` any but
the session slug, and a forge flag given a value says `<flag> takes no value.`; `orkeon-host` exits `78`
on an unread argument or a repeated `--settings` / `--working-dir`.

**Exit codes** (`RunnerExecution.RunOneShotAsync`, `Program.cs`):

| Code | Meaning | What stderr shows |
|---|---|---|
| `0` | success: `VALIDATION OK`, tool list printed, crew succeeded | — |
| `1` | usage or configuration: parser error, an unexpected argument, unknown command, missing target, unrecognised or ambiguous crew directory, a mount guard (§ 2.3), crew directory or `--llm-log-path` outside the working directory without the flag, malformed `--var` (real run), an unknown `--llm-profile`, `--validate` of a crew whose mail tools need a right no ready account grants (below, code 2), a setting the host refuses at its start (§ 5: a value it cannot read — an invalid `BaseUrl`, one no run serves (no `http://`, a vendor's `/anthropic` path), an `ApiKeyEnvVar` that is no variable name, a `${NAME}` or `%NAME%` reference in a setting passed as written, a number or a switch that is none —, a key no section carries, a retired one included, a section or component name it does not know, an unreadable settings file, named with its line), `VALIDATION FAILED` | an `ERROR: …` line per problem (a refused target or argument: `orkeon run: …`; `VALIDATION FAILED: <path>` then the reason); a parser error prints CommandLineParser's text on stderr since 63be532, and `run --help` exits `0` |
| `2` | the run failed: crew load failure **on a real run** (it is `1` under `--validate`), LLM endpoint refusing the connection, a crew that ran and did not succeed; since 16110e8 (`EmailRightsCheck`, FORGE-10) a crew whose mail tools need a right no ready account grants — since 13461ea its drive tools too (`DriveRightsCheck`, the base right of each drive tool on a ready drive account) — `email_folders`, `email_search`, `email_read`, `email_save_attachment` need `Read`; `email_create_folder`, `email_rename_folder`, `email_move`, `email_mark` need `Organize`; `email_delete` `Delete`; `email_draft` `Draft`; `email_send` `Send` with a non-empty `Send:AllowedRecipients` on the same account; `email_accounts` nothing — is refused at crew load, before any model call (so by Studio and the scheduler too; `orkeon-host` fails the run the same way; a `.ork.ts` crew is checked once its script is loaded) | last line `ERROR: <reason>`; stack at `-v 2` or `ORKEON_DEBUG=1`; the rights refusal: one `ERROR:` line per tool, `<tool> needs the <Right> right on a ready e-mail account, and no account has it. Add it in Studio (Settings › E-mail) or under Orkeon:Tools:Email:Accounts:<name>:Rights.` |
| `130` | cancelled by SIGINT or SIGTERM **before the crew starts**; a signal that lands during the run gives `2` with an `error` event `crew_cancelled` (the orchestrator catches the cancellation — checked on the main binary) | `[runner] SIGTERM received — canceling crew for graceful shutdown...` |
| `134` | the process aborted on an unhandled exception (at 24ab0d0: an empty `ORKEON_Llm__Model`, which now reads as absent per the sources, § 5) | `Unhandled exception. System.…` and a stack |

Exit 0 does not mean every tool call worked: a tool that fails returns an error to the model and the
run may still succeed (V-06). Count `tool.returned` with `success: false` (§ 3.5).

**Where output goes.** Plain run: stdout `=== Crew Output ===`, the final output, `Duration: …`,
`Tokens used: N` (or `(not measured)`), and the logger's lines (warnings at `-v 0`, more at `-v 1` and `2`:
the console logger keeps .NET's default, stdout, on a plain run and under `--validate`); stderr
`Using settings: <file>` and the `WARNING:` / `ERROR:` lines. Under `--events` (and `--list-tools`) every
log goes to stderr, stdout carries the protocol only and that banner moves to stderr. Before the kickoff the
runner makes a 2-second TCP probe of `Llm:BaseUrl` (the elected profile's under `--llm-profile`; the other
profiles are not probed); only an active refusal stops it (`ERROR: No reachable
LLM endpoint …`, exit 2) — a slow or unresolvable host is let through.

### 2.1 What a run leaves behind

- **Deliverables**, written by the framework at their `deliverable.path` (`yaml-schema.md`).
- **`AUTO_SUMMARY.md`**, only when a writable `--mount` has a virtual root that **starts with `/output`**
  (`DetectOutputMountPath`; a root declared in the settings does not count, nor does a procedural script):
  a table task id / agent role / status / duration / tool calls / tokens (total · cache hit/miss), then the
  files of that mount. Written when the crew completes, fails or is
  cancelled (partial table). A team whose writable roots are `/reports` or `/state` gets none.
- **LLM exchange logs** with `--llm-log` (§ 4); a sandbox folder `/tmp/orkeon-sandbox/<pid>-<stamp>`, deleted at exit (V-10).

### 2.2 `--validate` and `--list-tools`

`--validate` resolves the settings, applies the mount guards, builds the host — which judges every
setting it reads (§ 5): a file the run would refuse never answers `VALIDATION OK` —, connects the MCP servers
the settings declare, loads the crew with **strict** tool resolution (script tools included), skips RAG
ingestion, calls no model and runs no task. Success: stdout
`VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K)`, exit 0 (`K` = distinct tool names
attached to agents). Failure: stderr `VALIDATION FAILED: <path>` and the reason, exit 1. It does not check
external keys (`ORKEON_TAVILY_API_KEY`…), the reachability of an e-mail account, nor what `yaml-schema.md` lists as let through.
Since 16110e8 it does refuse (exit 1, the same `ERROR:` lines as the run's exit 2 above) a crew whose mail tools
need a right no ready account grants — ready meaning its secret is present, no network check.
It does check, per the sources, that every profile a crew names (`llm.profile`, `llmOverride.profile`) is
one the settings define, and refuses — since 63be532 with its file and line — every crew key no model reads,
a retired key (`circuitBreaker:`, `rag.provider`), a duplicate or a `<<:` merge key, a `maxRpm` or `maxIter` of 0 or less
and a `memoryProvider` that names no provider (`yaml-schema.md`).

`--list-tools` builds the host without a crew and prints the sorted registry, one name per line, on
stdout (logs on stderr). Without configuration that was **80 names** on a binary of 24ab0d0 (68 at rc.4,
V-01); since a2bb6c3 every runner host also registers the RAG subsystem and its `rag_search`, `rag_ingest`,
`rag_eval`: **83 names** (V-01); since 13461ea the eleven `drive_*` tools too: **94 names** (read in the sources). The
thirteen `email_*` and the eleven `drive_*` tools are listed whether or not an account is declared
(`AddOrkeonEmailTools`, `AddOrkeonDriveTools`: an account is checked at its first call). `brave_search` appears only
with `BRAVE_API_KEY`; MCP tools appear when the settings declare servers, and any registered tool — an MCP
tool or a `rag_*` one included — can be attached to an agent; a name belongs to one tool, so an MCP tool
never replaces a built-in. It resolves the settings from the **working directory** and never lists a
script's custom tools.

### 2.3 Mounts

- Grammar: `<physical>:<virtual>:<rights>`; rights `ro`, `rw`, `rwnd` (read-write, no delete);
  `;<sub>:<rights>` overrides a sub-path. A physical path holding `:` or `;` is double-quoted inside the
  spec, and the whole spec single-quoted for the shell. Relative physical paths resolve against the
  working directory (the launchers `cd` into the team folder first).
- **One variadic flag.** `orkeon run crew --mount a:/x:ro b:/y:rw`: the target comes **before** the
  bindings, or it is read as one more binding. `orkeon-bench mounts <team>` prints the right line.
- Refused before any host, exit 1: a root mounted twice on the command line (`ERROR: '/x' is mounted
  twice on the command line: … Keep one.`); a root the runner reserves — `/crew` (or `/script` for a
  script), `/llm-logs`, `/sandbox`, and for **every** command `/credentials`, where the runner keeps the
  OAuth tokens of e-mail and, since 13461ea, drive accounts (``ERROR: '/credentials' is a virtual root reserved by the runner: this
  command mounts it for itself (reserved here: /crew, /llm-logs, /sandbox, /credentials).``); a physical
  folder that does not exist (`ERROR: mount source directory does not exist: …`). Since fa46bb5 these guards read
  the mounts the settings declare in every layer the host reads — the environment without a prefix
  (`Orkeon__FileSystem__Mounts__0`, an Aspire `WithOrkeonSetting`), the file, the `ORKEON_` environment
  (`RunnerSettings.ReadConfiguration`): a reserved root, a duplicate or a missing folder declared by a variable is
  refused before any host as in the file, where until f59446b it passed. Orkeon accepts `/script`
  on a YAML crew; the harness forbids it for every team (`mounts.json` rules of `orkeon-bench`).
- **Outside the working directory** a `--mount` needs `--allow-external-mounts` (or
  `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`): since 63be532 the run refuses it at start, exit 1, `ERROR: The mount
  /x (<folder>) is outside the directories this run may read: pass --allow-external-mounts (or set
  ORKEON_ALLOW_EXTERNAL_MOUNTS=1), or mount a folder under the working directory.` — `--validate` included;
  before, the mount was registered and every access under it refused. The implicit flags of `run`, `rag`,
  `forge` and the daemon are gone; the inputs of a command (the crew folder, a script) are whitelisted
  without it, and a linked folder with its target. Mount sets `mounts.<name>/<slug>/` always need it; the
  launchers of `orkeon-bench scaffold` add it (V-12), and the launchers Studio writes carry it since 63be532
  when a folder leaves the team.
- A quote inside a quoted physical path is **doubled** (`"/a/b""c":/x:ro`); a single `"` breaks the grammar
  (`ERROR: Invalid mount format. …; a quote inside a quoted path is doubled.`, exit 1). The `run.sh` Orkeon
  and `orkeon-bench scaffold` write double each quote of the team folder's path (acd59d6).
- A `--mount` on a root the settings already declare replaces that entry for the run (logged at
  `-v 1`: `mount /x: --mount replaces the settings entry`).

### 2.4 Inputs

`--var KEY=VALUE` and `--initial-context` build the crew input of a YAML crew: every `{KEY}` in a task's
`description` and `expectedOutput` is replaced (case-insensitive), all variables are listed under a
`Context variables:` section of the task prompt, and the initial context joins them as `initial_context`
(`AgentPromptComposer`, `SequentialCrewOrchestrator.PromptVariables`). For a declarative `.ork.ts` the
help says `--var` is ignored while the code hands it to the same runner (not verified): in TypeScript,
read inputs from files under a read-only root. Data that changes per launch belongs in a mounted folder
anyway (`studio-layout.md`).

### 2.5 Human input — auto-approved without `--events`

Without `--events`, `human_input` is answered by `AutoApproveHumanInputProvider`, in the user's place: a
confirmation is **true**, a text is the default value or `approved`, a choice the default or the first
option. A team with `humanInput: true` launched by `./run.sh` in a terminal therefore approves everything —
the stub run's tool result read `{"response":"approved",…,"is_approved":true}`. With `--events jsonl` the
question goes out as `input.needed` (`inputKind: "confirm"` for an approval) and the run waits for
`input.given` on stdin — indefinitely while stdin stays open. If stdin is closed (EOF) or the run is
cancelled, the confirmation is **refused** (`"response":"rejected"`), a text falls back to the default (else
empty), a choice to the default (else the first option). The bench keeps stdin open and answers each
question by its `correlationId` (plan § 6.4).

## 3. The event protocol (`--events jsonl`)

What Studio and `orkeon-bench` read: the base of run analysis. One JSON object per line on stdout, the
same envelope for `run`, `forge`, `usecases`, since 4956aab `email login --events jsonl`
(`OrkeonEventWriter`, protocol version 2; the five kinds of the sign-in are `EmailEventKinds`, § 6) and, since
63be532, `drive login --events jsonl` and `drive check --events jsonl` (`DriveEventKinds`, six kinds, § 6). New fields
are added without changing `v`; the kinds (`RunEventKinds`) and error codes (`RunEventErrorCodes`) are
those of 24ab0d0 plus, since 87eb3bb (STUDIO-71), `llm.call.started`, `llm.call.progress` and `llm.call.finished`
(`RunEventKinds.All` names seventeen kinds at acd59d6, the inbound `input.given` included), and
`docs/architecture/run-event-bus.md` describes them.

### 3.1 Envelope

`{"v":2,"seq":<n>,"ts":"<yyyy-MM-ddTHH:mm:ssZ>","kind":"<kind>", …identity…, …payload…}` — `seq` starts at 1
and strictly increases; `ts` has **second** resolution (take durations from `durationMs`). Identity
fields `crewId`, `agentId`, `correlationId`, `causationId` appear when known; payload fields sit flat
beside them. An absent value is **omitted, never `null`**, and a payload cannot overwrite an envelope name.

### 3.2 Outbound kinds

| `kind` | Identity | Payload | When |
|---|---|---|---|
| `run.started` | — | `target`, `stream` | first line, before the host is built: a configuration failure — a refused setting included — still opens and closes the stream (`run.finished`, `exitCode` 1) — except a refusal made before routing (no target, a folder without a crew layout, a bad `--events` or `--client`, a parser error): exit 1 and nothing on stdout |
| `task.started` | `agentId` = role | `taskId`, `agentRole` | a task begins, every mode |
| `task.completed` | `agentId` = role (`graph` mode: `"graph"`) | `taskId`, `agentRole`, `success`, `skipped`, `durationMs`, `tokens`, `toolCalls` | a task ends, failure included; `skipped: true` when a dependency did not succeed, with `durationMs` 0 (seen in `sequential`; per the sources every mode now skips such a task and counts it as a failure) |
| `tool.called` | `correlationId` | `toolName`, `argsSummary` (up to 6 argument **names**, then `…`) | a tool is invoked |
| `tool.returned` | `correlationId` | `toolName`, `success`, `durationMs` | the tool finished, also when it threw |
| `delegation.started` | `correlationId` | `toRole` | replaces `tool.called` for `delegate_work_to_coworker` |
| `agent.spawned` | `correlationId` | `role`, `reason` | replaces it for `spawn_agent` (attached by no shipped composition root) |
| `cost.updated` | `crewId`; `agentId` = role of the agent the call was made for | cumulative `tokens`, `promptTokens`, `completionTokens`; `cacheHitTokens`, `cacheMissTokens`, `estimatedTokens` once measured or estimated; `model`, `provider`, `operation`; `cost`, `currency`, `costSource` only when the vendor billed | after **every** generation call (§ 3.3) |
| `llm.delta` | — | `text` | `--stream` only: the agent turns of a crew, a script's `ctx.llm.*` calls |
| `llm.call.started` | — | `callId`, `mode` (`stream`\|`buffer`: the setting's `CallMode` resolved, `llm-profiles.md` § 3), `estimatedPromptTokens` | since 87eb3bb: a model call was sent, by any caller the meter counts; with or without `--stream` |
| `llm.call.progress` | — | `callId`, `estimatedCompletionTokens` (cumulative) | a streamed call received more: at most one line per call every 250 ms, always the last one before `finished`; a buffered call writes none |
| `llm.call.finished` | — | `callId`, `mode` (the mode actually used), `fellBack`, `promptTokens`, `completionTokens` (the provider's, when it gave them) | the call ended, answered or failed; `fellBack: true` when a refused stream was redone in buffer; a reader drops the call's estimate when the counts are there, else keeps it as estimated; the `cost.updated` that follows adds them to the cumulative figures |
| `input.needed` | `agentId`, `correlationId` | `inputKind` (`text`\|`confirm`\|`choice`), `prompt`, `choices`, `defaultValue`, `taskDescription` | `human_input` asks |
| `hub.message` | `correlationId` (on a send) | `from`, `topic`, `payload`, `expectsReply` | the run's event hub relays to the peer |
| `error` | `crewId` | `code` (`crew_failed`\|`crew_cancelled`), `message`, `recoverable` (`false`) | the crew failed or was cancelled, before `run.finished` |
| `run.finished` | — | `success`, `exitCode`, `tokens`, `durationMs`, `promptTokens`, `completionTokens`, `cacheHitTokens`, `cacheMissTokens`, `estimatedTokens` | last line; mirrors the exit code; the cache pair and `estimatedTokens` are absent when not measured or not estimated |

### 3.3 The meter behind `cost.updated`

Under `--events`, every provider is wrapped in `MeteredLlmProvider`, so every generation call is counted
— agent turns and their retries, the hierarchical manager, the planner, RAG pipelines, memory services,
LLM judges, on whichever profile they run. `operation` says what the call was for (`agent`, `manager`,
`planning`, `rag`, `memory`, `judge`, or a script's `ctx.llm.*` method) and is absent for a call nothing
claimed; `provider` is the provider class's name (`OpenAI`, `ollama`, `anthropic`…) — with profiles, a run
can carry several. A call whose provider counted nothing is
**estimated** under `estimatedTokens`; an OpenAI-dialect answer without `usage.total_tokens` fails instead
(`llm-profiles.md` § 7). A price appears only as the vendor's own charge read from its answer
(OpenRouter: `cost`, `currency`, `costSource: "vendor"`); Orkeon never puts an estimated price on the
wire. Embedding calls are not counted. Without `--events` no meter is registered: the plain
`Tokens used:` line comes from the strategy's own telemetry.

### 3.4 Inbound (stdin)

One JSON object per line; malformed or unknown lines are ignored. `{"kind":"input.given","correlationId":"<id>","value":"<text>"}`
answers an `input.needed` (`value` is a string; without `correlationId` it answers the oldest pending
question). The hub verbs `post`, `send`, `publish`, `reply`, `subscribe`, `unsubscribe` give the peer a
seat at the run's event hub (fields in `run-event-bus.md` § 4); teams of the harness do not rely on them.

### 3.5 Reading a run

1. `taskId` is a generated ULID, not the task file name, and `agentId` carries the agent's **role**:
   attach events to task files by the order of `task.started` and by role (V-05). Give every agent a
   distinct role. In `graph`, `task.completed` carries the role `"graph"`: match it to its `task.started`
   by `taskId`.
2. Tool events carry a `correlationId` but no task or agent: in `sequential` they belong to the task open
   between `task.started` and `task.completed`; in `parallel` or `consensual` runs they interleave and
   cannot be attributed from the stream alone (`cost.updated` keeps its `agentId`).
3. Argument **values** never appear (`argsSummary` lists names), except the role a delegation names
   (`delegation.started.toRole`) and the role and goal of a spawned agent. Which paths a tool wrote comes from a
   snapshot of the roots or from the tool calls recorded by `--llm-log` (`INV-FS`, `INV-TOOLS` in
   `testing/invariants-catalog.md`).
4. Per task: `tokens`, `toolCalls`, `durationMs` of `task.completed`; per run: `run.finished`. Report
   `estimatedTokens` beside the counted ones. Cost = tokens × the rate written in the test plan, unless the
   vendor billed (`costSource: "vendor"`) — `llm-profiles.md` § 7.
5. In `sequential`, a failure reads `task.completed` (`success: false`), dependents `skipped: true`,
   `error`, then `run.finished` with `exitCode` 2 — also when the run is cancelled midway (`code:
   crew_cancelled`; 130 only before the crew starts). Per the sources a failed task fails the run in every
   mode (`CrewRunOutcome`) — in `graph`, a task that exhausted its retries, or the circuit breaker; there the
   `task.completed` events all came when the graph ended (seen at 24ab0d0). A
   process killed with SIGKILL ends without `error` nor `run.finished`, and without `AUTO_SUMMARY.md`.
6. Ignore an unknown `kind` or field; keep any non-JSON line: stdout is protocol-only, so such a line is a
   defect.

A one-task run against the stub on a build of fb26364 (V-04, V-05; one `file_read` call, then the final
answer; the ids shortened):

```jsonl
{"v":2,"seq":1,"ts":"2026-10-06T05:18:10Z","kind":"run.started","target":"crew","stream":false}
{"v":2,"seq":2,"ts":"2026-10-06T05:18:11Z","kind":"task.started","agentId":"Writer","taskId":"01M4…","agentRole":"Writer"}
{"v":2,"seq":3,"ts":"2026-10-06T05:18:12Z","kind":"cost.updated","crewId":"01M4…","agentId":"Writer","tokens":110,"promptTokens":100,"completionTokens":10,"model":"stub-model","provider":"OpenAI","operation":"agent"}
{"v":2,"seq":4,"ts":"2026-10-06T05:18:12Z","kind":"tool.called","correlationId":"9225…","toolName":"file_read","argsSummary":"path"}
{"v":2,"seq":5,"ts":"2026-10-06T05:18:12Z","kind":"tool.returned","correlationId":"9225…","toolName":"file_read","success":true,"durationMs":29}
{"v":2,"seq":6,"ts":"2026-10-06T05:18:12Z","kind":"cost.updated","crewId":"01M4…","agentId":"Writer","tokens":220,"promptTokens":200,"completionTokens":20,"model":"stub-model","provider":"OpenAI","operation":"agent"}
{"v":2,"seq":7,"ts":"2026-10-06T05:18:12Z","kind":"task.completed","agentId":"Writer","taskId":"01M4…","agentRole":"Writer","success":true,"skipped":false,"durationMs":341,"tokens":220,"toolCalls":1}
{"v":2,"seq":8,"ts":"2026-10-06T05:18:12Z","kind":"run.finished","success":true,"exitCode":0,"tokens":220,"durationMs":1811,"promptTokens":200,"completionTokens":20}
```

## 4. `--llm-log`

- `--llm-log` writes to `./llm-logs` **relative to the working directory** (the team folder);
  `--llm-log-path <dir>` chooses the folder. A folder outside the working directory needs
  `--allow-external-mounts` (or the variable), otherwise exit 1. The folder is mounted as the internal
  root `/llm-logs`, invisible to agents.
- One file per run, `llm-exchanges-<UTC stamp>-<token>.jsonl`; one object per HTTP exchange made through
  the host's HTTP client factory — the model's, and the tools' too (`http_api`, the scrapers, `github`,
  `brave_search`, `image_generation`, the e-mail tools' Graph and OAuth calls): filter by `request.url`.
  Fields: `exchange_id`, `timestamp`, `provider`, `model`, `is_streaming`, `duration_ms`, `is_success`, `error`,
  `request` (`method`, `url`, `headers`, `body`), `response` (`status_code`, `headers`, `body`).
- Sensitive headers (`Authorization`, `api-key`, `x-api-key`…) are redacted by name, secret patterns in
  bodies and URL keys too (`LlmLoggingDelegatingHandler`). The bodies still hold every prompt and every
  input read: keep the files under `workbooks/<slug>/runs/` and scan them for `INV-SECRETS`.
- Settings section `LlmLogging`: `FullEmbeddingLog` (default true), `LogStreamingExchanges` (true; since
  87eb3bb a stream passes through to the caller as it arrives and is logged once it ends, as its rebuilt
  answer — or the raw text received when it was cut; before, as its request only), `MaxBodyLengthChars`
  (0 = no truncation).
- Uses: the real exchanges for the stub's record/replay mode (plan § 6.3), the tool-call arguments that
  the event stream omits.

## 5. Settings: where a run reads its configuration

Layers from lowest to highest priority, merged **key by key** — the same for every host, `orkeon doctor`,
`orkeon init`'s probe and the `--llm-profile` guard (`RunnerSettings.ComposeSources`, called by
`RunnerHost.ConfigureAppConfiguration` and `RunnerSettings.ReadConfiguration`; per the sources, the binary
check of the rc.4 and 24ab0d0 layers is V-13):

| # | Layer | Notes |
|---|---|---|
| 0 | every environment variable without prefix, `__` between levels (`Llm__Model`, `Llm__Profiles__x__BaseUrl`) | the lowest layer; `OTEL_*` reach telemetry through it |
| 1 | **the** resolved settings file (chain below) | stderr `Using settings: <path>`; only one file is resolved |
| 2 | `ORKEON_*` variables, prefix removed: `ORKEON_Llm__Model` → `Llm:Model` | also feeds the secret provider (`ORKEON_TAVILY_API_KEY`) |
| 3 | the run's own entries: the `--llm-profile` election, `--mount` placements, internal mounts, path whitelist | in memory, last |

**Nothing else is read**: whatever the .NET host builder held is cleared first — the `appsettings.json` and
`appsettings.<environment>.json` of the working directory, `<binary>.settings.json`, the user secrets, and
the `DOTNET_*` host configuration (a `DOTNET_Llm__Model` is the key `DOTNET_Llm:Model` of layer 0, read by
nothing). A key absent from a higher layer keeps its lower value. A default provider exists when `Llm`
holds a non-blank value outside `Profiles` (`LlmSettings.HasDefault`); otherwise — no section, `{}`,
`null`, `Profiles` alone, every value blank — the echo provider runs. A blank value reads as absent for
every `Llm` key (an empty `ORKEON_Llm__Model=` too). Those three readings are per the sources; V-13 records
what the 24ab0d0 binary did. A JSON key holding a colon is a path (`"Llm:Model"`); comments and trailing
commas are accepted — by Orkeon: the run gate and `orkeon-bench` read a settings file as strict JSON (no
comment, no trailing comma, no key written twice) and judge a run on what they read, so a team's settings
file is written strictly (`orkeon-bench run` reports an offence at L0, with the file and the line).

**Every setting a host reads is judged at its start** (`RunnerHost.Build` → `SettingsValidation`, GAP-40),
whether the run uses it or not — `orkeon run` in every form, `--validate` and `--list-tools` included,
`orkeon mcp serve`, `orkeon-repl`, `orkeon-host` —, before the crew loads and before any model is called.
The start is refused, with one `ERROR:` line naming the key and exit 1, on:

- a **variable reference** — `${NAME}` anywhere in the value (`${env:NAME}`, `${NAME:-x}`, `sk-${X}`) or
  `%NAME%` as the whole value — in a setting Orkeon passes as written (since 63be532, `SettingPlaceholders`:
  `Llm:ApiKey`, `Llm:ApiKeyEnvVar`, `Llm:BaseUrl` and their profiles', `MCP:Servers:<id>:Command`, `:Args:<i>`,
  `:Url`, `:Env:<name>`, `Secrets:<name>`, the RAG and store endpoints, connection strings and keys…): it
  expands none, so the start is refused — ``ERROR: Llm:ApiKeyEnvVar holds a variable reference, but Orkeon
  expands no variable in its settings and would pass the text as written. Write the name alone, without ${
  and }.`` (`orkeon-host`: exit 78); `$NAME` passes as written; an e-mail or drive account holding one is set
  aside, not refused;
- a **model address no run serves** (since 63be532, `LlmEndpointReading`): ``ERROR: Llm:BaseUrl is
  'localhost:11434', which no run serves: write an absolute http:// or https:// address, with its scheme (for
  example http://localhost:11434), and no vendor path on another vendor's host.`` — the same for
  `https://api.deepseek.com/anthropic`; an address with no path (`http://host:8000`) is a warning only
  (`llm-profiles.md` § 2);
- a **value** the section cannot read or that one of its rules refuses: `Llm:TimeoutSeconds` written
  `"600s"`, a `Thinking:Enabled` that is not `true` or `false`, a `Temperature` that is no finite number —
  the default `Llm` section is read as strictly as its profiles —, `"Orkeon:Guardian:Enabled": "oui"`;
- an **unknown key** in a section the host reads — ``ERROR: Llm:Provider is not a setting: Llm carries
  Profiles, AvailableModels, BaseUrl, ApiKey, ApiKeyEnvVar, Model, Temperature, MaxTokens, TimeoutSeconds,
  StreamIdleSeconds, CallMode, MaxRetries, Thinking, Grammar. `orkeon settings Llm` lists its keys.`` (`StreamIdleSeconds` in the
  list since ce9ec1f, `CallMode` since 87eb3bb; the last sentence since bd3420c, for a
  section the catalogue knows), `RateLimiting:MaxConcurentRequests`, `Orkeon:Guardian:Enabeld` — and an
  unknown section name under `Orkeon:` (and under `Orkeon:Cli`, `Orkeon:Tools`, `Orkeon:Scripting`,
  `Orkeon:Security`, `Security`), the closest one proposed (`Orkeon:Guardain` → `Orkeon:Guardian`); keys
  and names compare without case;
- an unknown **name** a component is chosen by: `Memory:Provider`, `Orkeon:Rag:Provider` (with what the
  named provider needs from its section), `Orkeon:Rag:Profile`, `Orkeon:Embeddings:Provider` (`openai` or
  `ollama`), a `Logging` level.

Left open: the configuration root (it also holds the unprefixed environment variables), `Logging` beyond
its levels, `Secrets`, the keys of a dictionary (`Llm:Profiles:<id>`, `MCP:Servers:<id>`,
`Orkeon:Tools:Email:Accounts:<name>`) and the sections another host reads (`Orkeon:Host`). The e-mail
accounts are the exception: an account that cannot be read is set aside and reported when it is named. A
team settings file is judged whole on every run of its team: one mistyped key stops the team, and
`orkeon doctor`'s `runner-settings` row reports the same refusals on the file of the working directory.

**Reported, not refused** (since bd3420c, `SettingsValidation.Notices`): a section the file or the `ORKEON_`
environment writes that Orkeon knows and no shipped binary reads — a host written in C# reads it through
its registration: `ToolRateLimiting`, `TokenBudget`, `Orkeon:Dlp`, `Orkeon:Monitoring`,
`Orkeon:CognitiveMemory`, `Orkeon:MultiModal`, `Evaluation`, `Orkeon:VectorSearch`,
`Orkeon:Checkpointing`, `Orkeon:ExecutionState:Persistence`, ten at acd59d6, computed from the catalogue (eleven at
bd3420c, with `Plugins`, which `orkeon-repl` reads since 13461ea).
The host says it once per process on stderr and starts (`WARNING: ToolRateLimiting is read by no component
of this host: a C# host reads it through AddOrkeonToolRateLimiting(). The calls to the model are limited by
RateLimiting, which this host reads.`), the exit code is the run's; `orkeon doctor` gives one `runner-settings`
row at `warn` per such section and no `ok` row, exit code unchanged. Not reported: a section another shipped
binary reads (`Orkeon:Host`), a root section Orkeon does not know, a single value at a section's path. Write
none of them in a team settings file: `orkeon run` applies nothing of them, and the team runs without the
limit, the budget or the screening its author meant (`design/sizing-and-cost.md` § 1 for what does apply).

**Resolution chain of layer 1** (`RunnerSettings.ResolveSettingsPath`), anchored at the crew's directory
(`crew/` for `orkeon run crew`, the script's folder for a `.ork.ts`; the **working directory** for
`--list-tools`, `orkeon doctor`, `orkeon email`, `orkeon drive`, `orkeon mcp serve` and `orkeon rag`):

1. `--settings <file>` (`-s`); a missing file ends the chain with `WARNING: Explicit settings not found:
   <path>` — variables only;
2. `appsettings.json` in the crew directory — for a team, `crew/appsettings.json`, which agents can also
   read as `/crew/appsettings.json`; for the verbs anchored at the working directory, `./appsettings.json`
   of the team folder;
3. `appsettings/appsettings.json` in the crew directory or **any parent** (then the deprecated
   `_shared/appsettings.json` of a folder that has none), stopping after a folder holding
   `Orkeon.Examples.sln` — a folder `appsettings/` in `teams/<slug>/`, `teams/` or the workshop root
   would capture every run below it;
4. the machine file `${XDG_CONFIG_HOME:-~/.config}/Orkeon/appsettings.json` (macOS the same; Windows:
   `%APPDATA%\Orkeon\appsettings.json`), written by `orkeon init`;
5. nothing: `WARNING: No appsettings.json found. Using environment variables only. Run `orkeon init` to
   create a configuration.`

**Who sets what in the workshop**

| Source | Holds | Reference |
|---|---|---|
| machine file | the default model of every run: Ollama, written by the image at first start when `OLLAMA_DEFAULT_MODEL` names a model; a remote provider written by `orkeon init`; an e-mail account (`Orkeon:Tools:Email`) only when every team may share it — a team's own goes in its settings file (below) | `llm-profiles.md` § 5, § 6 |
| `ORKEON_Llm__*` for one run | a bench profile, a Studio team profile; Studio also lays every one of its settings as `ORKEON_Llm__Profiles__<id>__*`, keys included | `llm-profiles.md` § 4, § 8 |
| team settings file (D33) | `settings/<slug>/appsettings.json` of the workshop, outside the team folder: a mailbox, another model. The launchers and `orkeon-harness-run` pass it with `--settings`, so it replaces the machine file and carries its own `Llm` section; `orkeon-bench run` on the simulated LLM passes a generated copy of it instead, whose `Llm` section points at the stub and whose other sections are the team's; Studio passes it too, for a team folder right under its teams root (STUDIO-62, `studio-layout.md`). Never an `appsettings*.json` in a team folder or `crew/`, never an `appsettings/` or `_shared/` folder in the workshop: `crew/` is readable by agents. The bench and the run gate read these layers in this order to judge a run — the `Llm` section only, not its `Profiles` (`llm-profiles.md` § 8) | `studio-layout.md` |

A file at the team-folder root is not read by `orkeon run crew` — nor by `orkeon run .`, whose chain starts
at `crew/` too —, but it **is** the settings file of
`--list-tools`, `orkeon doctor`, `orkeon email`, `orkeon drive` and `orkeon mcp serve` started from the team folder, in
place of the machine file; the team settings file does not merge with the machine file, it replaces it. When an
e-mail account signs in with OAuth2, the runner creates `credentials/email/` next to the machine file — and,
since 13461ea, `credentials/drive/` for a drive account (owner-only on Unix; `Orkeon:Tools:Email:CredentialsDirectory`
or `Orkeon:Tools:Drive:CredentialsDirectory` moves the directory, one per run: when the two name different
ones the e-mail family's wins — a machine-wide setting: the check scripts refuse it in a team settings file)
and mounts it as the internal root `/credentials`, which no agent-facing tool resolves.

Never invent `ORKEON_*` variables: Orkeon loads all of them as configuration — `ORKEON_Llm__Profiles__<id>__*`
creates or changes a profile. The runner's own are `ORKEON_ALLOW_EXTERNAL_MOUNTS`, `ORKEON_DEBUG`,
`ORKEON_ESBUILD_PATH` (the esbuild of `.ork.ts` crews; `Orkeon:Scripting:Toolchain:EsbuildPath` in the
settings) and `ORKEON_MCP_SERVE` (set by `orkeon mcp serve` for what it starts; a serve that finds it
refuses to start); the secret chain reads `ORKEON_<NAME>` (`ORKEON_TAVILY_API_KEY`, `ORKEON_OPENAI_API_KEY`
for `image_generation`); `ORKEON_LLM_API_KEY` is `orkeon llm`'s default `-k` and `ORKEON_CUSTOM_LLM_API_KEY`
Studio's variable for an OpenAI-compatible setting, read by a run only when an `ApiKeyEnvVar` names them.
`orkeon settings env` (bd3420c) lists every variable a binary reads by its name — those above, `OLLAMA_BASE_URL`
(the Ollama provider's address when `Llm:BaseUrl` gives none; `localhost:11434` without either), `XDG_CONFIG_HOME`,
and the ones Studio and the text consoles read — with who reads it and what it does, and `--json` for a program.
The harness's `ORKEON_WORKSHOP` and `ORKEON_HARNESS_OFFLINE` reach the configuration but no Orkeon key reads
them.

## 6. The other verbs

**`orkeon init`** — `-p, --provider ollama|docker-model-runner|openai|custom|none` (omitted: interactive
wizard, refused when stdin is not a terminal), `-u, --base-url`, `-m, --model` (both required for
`custom`), `-k, --api-key-env <NAME>`, `--api-key <key>` (stored in clear, never use it), `--path <file|dir>`
(an existing directory receives `appsettings.json`), `-f, --force` (an existing file is otherwise refused,
exit 1), `--no-probe`. It writes `Llm.Model` and `Llm.BaseUrl` (plus `Llm.ApiKey` when inline, and the
placeholder `not-needed` for `docker-model-runner`; `-p none` writes no `Llm` section), and
`Llm.ApiKeyEnvVar` for a `--api-key-env` name other than `ORKEON_Llm__ApiKey` (the default, read natively,
not recorded): every run then reads the key from that variable. Its probe reads the file as a run does and
presents the run's key at the run's endpoint, saying where the key comes from, never the key; a section a
run would refuse fails it, exit 1, the file written.

**`orkeon quickstart`** (since acd59d6) — `--to <dir>` (default `./orkeon-quickstart`): writes `crew.yaml`,
`appsettings.json` and an empty `out/` there and prints `orkeon run crew.yaml --mount ./out:/output:rw`, then
the same with `:ro`, exit 0; `--help` prints the usage, exit 0. Exit 1, nothing written: a folder that is not
empty (`orkeon quickstart: '<target>' is not empty; nothing was written. Choose another folder with --to.`),
a file (`'<target>' is a file; choose another folder with --to.`), `--to` alone (`--to needs a directory.`),
an unknown option (`unknown argument '--x'; run \`orkeon quickstart --help\`.`) or a word too many
(`unexpected argument 'a'; …`). Checked on the acd59d6 build (V-46).

**`orkeon llm probe`** — `-p` (required: a key of `llm-profiles.md` § 1, `azure` for Azure), `-m`, `-u`,
`-k` (default `ORKEON_LLM_API_KEY`, which a run reads only when a settings file names it), campaign options (`--modes`, `--archive`,
`--format md|json`, `--timeout` 180 s…). **`orkeon llm models`** — `-p`, `-u`, `-k`, `-f, --filter <glob>`,
`--json`. `probe` sends real completion requests: against a remote provider it is a paid call, which needs
the user's approval like any remote run — the run gate watches `orkeon run`, not `orkeon llm`.

**`orkeon email`** — `accounts [--json]` (the declared accounts, their rights, `ready` or what to fix; no
network), `login <account> [--events jsonl]` (OAuth2: Microsoft device code, Google in the browser with a
paste-the-address fallback for containers — a pasted line that is not the address the browser ended on
is answered with the reason, and the sign-in goes on waiting; with `--events jsonl`, the way Studio
drives it, each step is one event on stdout in the envelope of § 3 — `email.login.device_code`,
`email.login.authorization_url`, `email.login.redirect_rejected`, `email.login.completed`, `error` —,
the pasted address is read as a line of stdin, and the end of stdin aborts the sign-in; another format
is refused, exit 1), `logout <account>`, `check <account>` (connects and lists
the folders); each takes `-s, --settings` resolved like `orkeon run` from the working directory. With no
account, `accounts` prints `No e-mail account is configured. Declare one under Orkeon:Tools:Email:Accounts …`
(`--json`: `[]`), exit 0. Exit `0`,
`1` usage, configuration or refusal, `2` network or server, `130` Ctrl+C or, under `--events`, stdin
closed. Agents never run it: a tool
without a usable token answers "run `orkeon email login <account>`". Accounts, rights and the send
allow-list are in `reliability/security.md`.

**`orkeon drive`** (since 13461ea, ADR-013) — the same four verbs for the accounts of `Orkeon:Tools:Drive`:
`accounts [--json]` (the declared accounts, their rights, root folder and readiness; no network),
`login <account> [--events jsonl]` (OneDrive with Microsoft's device code, Google Drive in the browser with the
pasted-address fallback; with `--events jsonl` each step is one event in the envelope of § 3 —
`drive.login.device_code`, `drive.login.authorization_url`, `drive.login.redirect_rejected`,
`drive.login.completed`, `error` —, the pasted address is a line of stdin, the end of stdin aborts),
`logout <account>`, `check <account> [--events jsonl]` (connects, finds the root folder and lists its first
items; under `--events` the verdict is one `drive.check.completed` or `error` line); each takes `-s, --settings`
resolved like `orkeon run` from the working directory. With no account, `accounts` prints `No drive account is
configured. Declare one under Orkeon:Tools:Drive:Accounts in the settings file (see docs/guides/drive.md).`, exit 0.
Exit `0`, `1` usage, configuration or refusal, `2` network or server, `130` Ctrl+C. Agents never run it.

**`orkeon usecases`** — `search "<need>"` (`--top`, `--lang`; offline), `list` (`--category`, `--process`,
`--tag`), `show <id>` (`--crew`), `export <id> --to <folder>` (a team folder with `crew/config.yaml`, its
`data/` and `studio-team.json`; refused for a reference-only case or a non-empty folder). Exit `0`, `1`, `2`.

**`orkeon rag`** — `ingest`, `search`, `eval` over a RAG collection, auto-mounting the working directory
at `/workspace` (ro) and `./.orkeon` at `/output` (rw); not used by teams (`docs/reference/cli.md`).

**`orkeon forge`** — ignored by the harness process (D9). Sub-verbs `list`, `resume`, `promote`, `reopen`,
`schedule`, `unschedule`, `rename`, `rephrase`; options and error codes in `docs/reference/cli.md`.
`forge schedule <team-folder>` registers a schedule with the operating system (`resume-and-memory.md` § 5).

## 7. Checks

```bash
orkeon --version                                         # the version the image was built with
orkeon run --list-tools | wc -l                          # 94 without configuration at acd59d6, as at e258730, 63be532, fa46bb5 and 13461ea (83 before the drive_* tools; 80 on the 24ab0d0 binary, before rag_search, rag_ingest, rag_eval)
cd teams/<slug> && ./run.sh --validate                   # VALIDATION OK: … (agents=N, tasks=M, tools resolved=K)
orkeon run crew --validate -v 1 2>&1 | grep -E 'Using settings|LLM '   # the file, the default model, each profile's key source
orkeon doctor --json                                     # rows from the file resolved from the working directory, Llm__* and ORKEON_* variables; runner-settings judges it as a run does
orkeon settings Llm                                      # every key of a section — type, default, meaning — from the binary, offline (acd59d6)
orkeon --version --verbose                               # the version line, then `channel: dotnet-tool` (bd3420c)
orkeon-bench mounts <slug>                               # the exact --mount line of the launchers
```
