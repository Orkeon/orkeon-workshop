# The `orkeon` CLI — commands, options, events, settings

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at a2bb6c3 (2026-10-03, after 1.0.0-rc.4).
> Sources: at that commit: `src/scripting/Orkeon.Scripting.Cli/` (`Program.cs`, `CliUsage.cs`, `Commands/RunCommand.cs`,
> `Commands/Run/*.cs`, `Events/OrkeonEventWriter.cs`, `Commands/InitCommand.cs`, `Commands/DoctorCommand.cs`,
> `Commands/LlmCommand.cs`, `Commands/EmailCommand.cs`, `Commands/McpCommand.cs`, `Commands/TypingsCommand.cs`,
> `Commands/UseCases/UseCasesCommand.cs`, `Commands/Forge/ForgeCommand.cs`), `src/hosting/Orkeon.Hosting/`
> (`RunnerExecution*.cs`, `RunnerHost.cs`, `RunnerSettings.cs`, `RunnerEnvironment.cs`, `RunnerOptionsBase.cs`,
> `RunnerArguments.cs`), `src/core/Orkeon.Infrastructure/LLMs/Profiles/LlmSettings.cs`,
> `src/constants/Orkeon.Constants.Protocol/` (`RunEventKinds.cs`, `RunEventErrorCodes.cs`), `src/constants/Orkeon.Constants.Cli/RunOptionNames.cs`,
> `src/constants/Orkeon.Constants.FileSystem/RunnerVirtualRoots.cs`, `src/core/Orkeon.Application/Interfaces/Ports/LlmUsageOperations.cs`,
> `CHANGELOG.md` (`[Unreleased]`), `docs/reference/cli.md`, `docs/reference/configuration.md`,
> `docs/architecture/run-event-bus.md`; harness: `.claude/harness/VERIFICATIONS.md` (V-01, V-02, V-04, V-05, V-13), plan § 1.4, § 6.3, § 6.4.
> Binary checks: `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`), 2026-10-02, with a stub on 127.0.0.1;
> what a2bb6c3 changed is read in its sources, not yet run — marked "per the sources".

The model, providers and profiles are in `llm-profiles.md`; resume and memory in `resume-and-memory.md`;
the YAML keys and what `--validate` lets through in `yaml-schema.md`; the team folder and launchers in
`studio-layout.md`.

## 1. The verbs

| Command | Does | In the workshop |
|---|---|---|
| `orkeon run <target> [options]` (also `orkeon <target>`) | runs a crew, or validates it, or lists the tools | launchers, `orkeon-bench`, Studio |
| `orkeon init` | writes a settings file (machine file by default) | the image at first start; the user for a remote provider |
| `orkeon doctor [--json]` | ten checks, in this order: `dotnet-runtime`, `appsettings`, `llm-config` (provider, model, endpoint, where the default's key comes from), `llm-profiles` (each `Llm:Profiles` entry and its key's source), then one `llm-profile-key` warning per profile whose `ApiKeyEnvVar` names a variable set nowhere, `llm-reachability`, `esbuild`, `local-embeddings`, `onnx-reranker`, `tree-sitter`, `workspace-write`; `--json` is an array of `{check, status, detail}` (`ok`, `warn`, `fail`); exit 0 (warnings allowed) or 1; settings resolved from the working directory, no `--settings` (§ 5) | diagnosis |
| `orkeon llm probe` / `orkeon llm models` | runs the provider test protocol / lists the models a provider serves | checking a provider by hand (§ 6) |
| `orkeon email accounts\|login\|logout\|check` | the operator's side of the e-mail tools: declared accounts and their readiness, OAuth sign-in, a connection check | only for a team that reads or writes a mailbox (§ 6) |
| `orkeon rag ingest` / `search` / `eval` | RAG collections (incremental ingestion, state under `./.orkeon`) | not used by teams |
| `orkeon usecases search\|list\|show\|export` | the 104 example use cases, searched offline | finding a model team; `export` writes a team folder |
| `orkeon forge …` | the Atelier: a team from a need | not used (decision D9) |
| `orkeon typings` | writes the TypeScript typings of `.ork.ts` and `.cmd.ts` scripts into `./.orkeon/` | not used |
| `orkeon mcp serve [-s <file>] [--tools a,b]` | serves the host's tools — what `--list-tools` prints for the same settings, `human_input` aside — to an MCP client over stdio; every call crosses the Guardian | not used |
| `orkeon --version`, `orkeon --help` | `orkeon 1.0.0-rc.4.src.20261003.ga2bb6c3` for a build of a2bb6c3 / the verb list, exit 0 | `orkeon-bench doctor` |

`orkeon <verb> --help` prints the option table (or the sub-verb list) and exits **1** (CommandLineParser);
`orkeon forge` has no `--help` (`orkeon forge: Unknown option '--help'.`). An unknown first word gives
``orkeon: unknown command 'x'; run `orkeon --help` for the list.``,
exit 1. Verbs are matched first; then a token holding a `/`, ending in `.yaml`/`.yml`/`.ork.ts`/`.ts`/`.js`,
or naming an existing path is a run target — a crew folder named `email` runs only as `orkeon run email`.

## 2. `orkeon run`

**Target.** A directory holding a multi-file YAML crew (`config.yaml` + `agents/` + `tasks/`), a
`.yaml` file, or a `.ork.ts` script. A script that hands its crew off with `globalThis.crew = crew` (the
declarative shape) goes through the same pipeline as YAML; one that calls `await crew.run()` goes to the
script host (`typescript-dsl.md`). A team is always run as `orkeon run crew` **from the team folder**
(`orkeon run .` exits 1: V-02); the crew directory is mounted read-only as `/crew` (`/script` for a script).

| Option | Effect | Notes |
|---|---|---|
| `-s, --settings <file>` | uses that settings file and stops the resolution chain | a missing file: `WARNING: Explicit settings not found: <path>`, no fallback (§ 5) |
| `-m, --mount <spec> [<spec>…]` | VFS mounts `<physical>:<virtual>:<ro\|rw\|rwnd>[;<sub>:<rights>]` | **one** flag, values space-separated; a repeated `--mount` is rejected (§ 2.3) |
| `--mount-id <ulid> […]` | picks one of several settings entries declaring the same root | unused by the harness (no mounts in settings) |
| `--allow-external-mounts` | whitelists `--mount` folders outside the working directory | same as `ORKEON_ALLOW_EXTERNAL_MOUNTS=1` (`1`, `true`, `yes`) |
| `--llm-profile <id>` | makes the host profile `Llm:Profiles:<id>` (settings file or `ORKEON_` variables) the run's default, **whole**: every key of `Llm` unset, the profile's laid over it, its key its own (`llm-profiles.md` § 3); `default` elects nothing; case ignored | an unknown id: `ERROR: --llm-profile names the LLM profile '<id>', which this host does not offer. Known profiles: …`, exit 1 before any host — on `--validate` and `--list-tools` too; never in the workshop: the run gate does not read it (`llm-profiles.md` § 8) |
| `-v, --verbose <0\|1\|2>` | 0: warnings · 1: host decisions, agents and tools at Information · 2: debug | logs on stdout for a plain run and `--validate`, on stderr under `--events` and `--list-tools`; `ORKEON_DEBUG=1` adds full exception dumps |
| `--llm-log`, `--llm-log-path <dir>` | records every HTTP exchange the host makes — the model's and the tools' (§ 4) | the path form implies `--llm-log` |
| `-V, --var KEY=VALUE […]` | variables of the crew input (§ 2.4) | one flag; malformed entry: `ERROR: Invalid --var '…'`, exit 1 — on a real run only, `--validate` does not parse it |
| `--initial-context <text>` | initial context of the crew input (§ 2.4) | |
| `--inputs <json>`, `--inputs-file <path>` | `globalThis.inputs` of a **procedural** script | a declarative script prints `… has no effect on this script` |
| `--memory-limit-mb <n>` | Jint memory limit of a procedural script (`0` disables) | same warning on a declarative script |
| `--events jsonl` | the event protocol on stdout, commands on stdin (§ 3) | any other value: `unsupported --events format`, exit 1 |
| `--stream` | with `--events`, adds `llm.delta` events, token by token: the agent turns of a crew and a script's `ctx.llm.*` calls (per the sources; at 24ab0d0 a YAML crew emitted none); without it, turns stay buffered | off in the harness |
| `--client <name>` | with `--events`, the peer's hub name `client://<name>` (default `studio`) | without `--events`: warning only |
| `--validate` | loads the crew, no LLM call (§ 2.2) | with `--events`: warning, plain output |
| `--list-tools` | prints the tool registry, no target needed (§ 2.2) | idem |

A single-value option may be written `--option=value`: the value is read as written, a leading `-`, a
space or a line break included (`RunnerArguments`); Studio and the launchers it writes use that form.

**Exit codes** (`RunnerExecution.RunOneShotAsync`, `Program.cs`):

| Code | Meaning | What stderr shows |
|---|---|---|
| `0` | success: `VALIDATION OK`, tool list printed, crew succeeded | — |
| `1` | usage or configuration: parser error (also `run --help`), unknown command, missing target, unrecognised or ambiguous crew directory, a mount guard (§ 2.3), crew directory or `--llm-log-path` outside the working directory without the flag, malformed `--var` (real run), an unknown `--llm-profile`, a setting the host refuses (a retired key, an `Llm` or `Llm:Profiles` value it cannot read — an invalid `BaseUrl`, an `ApiKeyEnvVar` that is no variable name, a `${NAME}` `ApiKey` —, an unreadable settings file, named with its line), `VALIDATION FAILED` | an `ERROR: …` line per problem (a refused target: `orkeon run: …`; `VALIDATION FAILED: <path>` then the reason); a parser error, `run --help` included, prints CommandLineParser's text on stdout |
| `2` | the run failed: crew load failure **on a real run** (it is `1` under `--validate`), LLM endpoint refusing the connection, a crew that ran and did not succeed | last line `ERROR: <reason>`; stack at `-v 2` or `ORKEON_DEBUG=1` |
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

`--validate` resolves the settings, applies the mount guards, builds the host, connects the MCP servers
the settings declare, loads the crew with **strict** tool resolution (script tools included), skips RAG
ingestion, calls no model and runs no task. Success: stdout
`VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K)`, exit 0 (`K` = distinct tool names
attached to agents). Failure: stderr `VALIDATION FAILED: <path>` and the reason, exit 1. It does not check
external keys (`ORKEON_TAVILY_API_KEY`…), e-mail accounts, nor what `yaml-schema.md` lists as let through.
It does check, per the sources, that every profile a crew names (`llm.profile`, `llmOverride.profile`) is
one the settings define, and refuses a retired key (`circuitBreaker:`).

`--list-tools` builds the host without a crew and prints the sorted registry, one name per line, on
stdout (logs on stderr). Without configuration that was **80 names** on a binary of 24ab0d0 (68 at rc.4,
V-01); at a2bb6c3 every runner host also registers the RAG subsystem and its `rag_search`, `rag_ingest`,
`rag_eval` (not yet counted on a binary). The thirteen `email_*` tools are listed whether or not an account
is declared (`AddOrkeonEmailTools`: an account is checked at its first call). `brave_search` appears only
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
  OAuth tokens of e-mail accounts (``ERROR: '/credentials' is a virtual root reserved by the runner: this
  command mounts it for itself (reserved here: /crew, /llm-logs, /sandbox, /credentials).``); a physical
  folder that does not exist (`ERROR: mount source directory does not exist: …`). Orkeon accepts `/script`
  on a YAML crew; the harness forbids it for every team (`mounts.json` rules of `orkeon-bench`).
- **Outside the working directory** a `--mount` needs `--allow-external-mounts`: without it the mount is
  registered but the path validator refuses every access under it. Mount sets `mounts.<name>/<slug>/`
  always need it; the launchers and Studio add it (V-12).
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
same envelope for `run`, `forge` and `usecases` (`OrkeonEventWriter`, protocol version 2). New fields
are added without changing `v`; the kinds (`RunEventKinds`) and error codes (`RunEventErrorCodes`) are
those of 24ab0d0 at a2bb6c3, and `docs/architecture/run-event-bus.md` describes them.

### 3.1 Envelope

`{"v":2,"seq":<n>,"ts":"<yyyy-MM-ddTHH:mm:ssZ>","kind":"<kind>", …identity…, …payload…}` — `seq` starts at 1
and strictly increases; `ts` has **second** resolution (take durations from `durationMs`). Identity
fields `crewId`, `agentId`, `correlationId`, `causationId` appear when known; payload fields sit flat
beside them. An absent value is **omitted, never `null`**, and a payload cannot overwrite an envelope name.

### 3.2 Outbound kinds

| `kind` | Identity | Payload | When |
|---|---|---|---|
| `run.started` | — | `target`, `stream` | first line, before the host is built: a configuration failure still opens and closes the stream — except a refusal made before routing (no target, a folder without a crew layout such as `orkeon run .`, a bad `--events` or `--client`, a parser error): exit 1 and nothing on stdout |
| `task.started` | `agentId` = role | `taskId`, `agentRole` | a task begins, every mode |
| `task.completed` | `agentId` = role (`graph` mode: `"graph"`) | `taskId`, `agentRole`, `success`, `skipped`, `durationMs`, `tokens`, `toolCalls` | a task ends, failure included; `skipped: true` when a dependency did not succeed, with `durationMs` 0 (seen in `sequential`; per the sources every mode now skips such a task and counts it as a failure) |
| `tool.called` | `correlationId` | `toolName`, `argsSummary` (up to 6 argument **names**, then `…`) | a tool is invoked |
| `tool.returned` | `correlationId` | `toolName`, `success`, `durationMs` | the tool finished, also when it threw |
| `delegation.started` | `correlationId` | `toRole` | replaces `tool.called` for `delegate_work_to_coworker` |
| `agent.spawned` | `correlationId` | `role`, `reason` | replaces it for `spawn_agent` (attached by no shipped composition root) |
| `cost.updated` | `crewId`; `agentId` = role of the agent the call was made for | cumulative `tokens`, `promptTokens`, `completionTokens`; `cacheHitTokens`, `cacheMissTokens`, `estimatedTokens` once measured or estimated; `model`, `provider`, `operation`; `cost`, `currency`, `costSource` only when the vendor billed | after **every** generation call (§ 3.3) |
| `llm.delta` | — | `text` | `--stream` only: the agent turns of a crew, a script's `ctx.llm.*` calls |
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

A one-task run against the stub on the main binary (V-04, V-05), shortened:

```jsonl
{"v":2,"seq":1,"ts":"2026-10-01T09:12:03Z","kind":"run.started","target":"crew","stream":false}
{"v":2,"seq":2,"ts":"2026-10-01T09:12:05Z","kind":"task.started","agentId":"Writer","taskId":"01K6…","agentRole":"Writer"}
{"v":2,"seq":3,"ts":"2026-10-01T09:12:05Z","kind":"tool.called","correlationId":"9f2c…","toolName":"file_read","argsSummary":"path"}
{"v":2,"seq":4,"ts":"2026-10-01T09:12:05Z","kind":"tool.returned","correlationId":"9f2c…","toolName":"file_read","success":true,"durationMs":12}
{"v":2,"seq":5,"ts":"2026-10-01T09:12:06Z","kind":"cost.updated","crewId":"01K6…","agentId":"Writer","tokens":412,"promptTokens":380,"completionTokens":32,"model":"stub-model","provider":"OpenAI","operation":"agent"}
{"v":2,"seq":6,"ts":"2026-10-01T09:12:06Z","kind":"task.completed","agentId":"Writer","taskId":"01K6…","agentRole":"Writer","success":true,"skipped":false,"durationMs":1180,"tokens":412,"toolCalls":1}
{"v":2,"seq":7,"ts":"2026-10-01T09:12:06Z","kind":"run.finished","success":true,"exitCode":0,"tokens":412,"durationMs":3105,"promptTokens":380,"completionTokens":32}
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
- Settings section `LlmLogging`: `FullEmbeddingLog` (default true), `LogStreamingExchanges` (true),
  `MaxBodyLengthChars` (0 = no truncation).
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
commas are accepted.

**Resolution chain of layer 1** (`RunnerSettings.ResolveSettingsPath`), anchored at the crew's directory
(`crew/` for `orkeon run crew`, the script's folder for a `.ork.ts`; the **working directory** for
`--list-tools`, `orkeon doctor`, `orkeon email`, `orkeon mcp serve` and `orkeon rag`):

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
| machine file | the default model of every run: Ollama, written by the image at first start; a remote provider written by `orkeon init`; an e-mail account (`Orkeon:Tools:Email`) only when every team may share it — a team's own goes in its settings file (below) | `llm-profiles.md` § 5, § 6 |
| `ORKEON_Llm__*` for one run | a bench profile, a Studio team profile; Studio also lays every one of its settings as `ORKEON_Llm__Profiles__<id>__*`, keys included | `llm-profiles.md` § 4, § 8 |
| team settings file (D33) | `settings/<slug>/appsettings.json` of the workshop, outside the team folder: a mailbox, another model. The launchers, `orkeon-harness-run` and the bench pass it with `--settings`, so it replaces the machine file and carries its own `Llm` section; Studio reads it only when pinned in its launch form. Never an `appsettings*.json` in a team folder or `crew/`, never an `appsettings/` or `_shared/` folder in the workshop: `crew/` is readable by agents. The bench and the run gate read these layers in this order to judge a run — the `Llm` section only, not its `Profiles` (`llm-profiles.md` § 8) | `studio-layout.md` |

A file at the team-folder root is not read by `orkeon run crew`, but it **is** the settings file of
`--list-tools`, `orkeon doctor`, `orkeon email` and `orkeon mcp serve` started from the team folder, in
place of the machine file; the team settings file does not merge with the machine file, it replaces it. When an
e-mail account signs in with OAuth2, the runner creates `credentials/email/` next to the machine file
(owner-only on Unix; `Orkeon:Tools:Email:CredentialsDirectory` moves it — a machine-wide setting: the
check scripts refuse it in a team settings file) and mounts it as the internal root `/credentials`, which
no agent-facing tool resolves.

Never invent `ORKEON_*` variables: Orkeon loads all of them as configuration — `ORKEON_Llm__Profiles__<id>__*`
creates or changes a profile. The runner's own are `ORKEON_ALLOW_EXTERNAL_MOUNTS`, `ORKEON_DEBUG`,
`ORKEON_ESBUILD_PATH` (the esbuild of `.ork.ts` crews; `Orkeon:Scripting:Toolchain:EsbuildPath` in the
settings) and `ORKEON_MCP_SERVE` (set by `orkeon mcp serve` for what it starts; a serve that finds it
refuses to start); the secret chain reads `ORKEON_<NAME>` (`ORKEON_TAVILY_API_KEY`, `ORKEON_OPENAI_API_KEY`
for `image_generation`); `ORKEON_LLM_API_KEY` is `orkeon llm`'s default `-k` and `ORKEON_CUSTOM_LLM_API_KEY`
Studio's variable for an OpenAI-compatible setting, read by a run only when an `ApiKeyEnvVar` names them.
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

**`orkeon llm probe`** — `-p` (required: a key of `llm-profiles.md` § 1, `azure` for Azure), `-m`, `-u`,
`-k` (default `ORKEON_LLM_API_KEY`, which a run reads only when a settings file names it), campaign options (`--modes`, `--archive`,
`--format md|json`, `--timeout` 180 s…). **`orkeon llm models`** — `-p`, `-u`, `-k`, `-f, --filter <glob>`,
`--json`. `probe` sends real completion requests: against a remote provider it is a paid call, which needs
the user's approval like any remote run — the run gate watches `orkeon run`, not `orkeon llm`.

**`orkeon email`** — `accounts [--json]` (the declared accounts, their rights, `ready` or what to fix; no
network), `login <account>` (OAuth2: Microsoft device code, Google in the browser with a
paste-the-address fallback for containers), `logout <account>`, `check <account>` (connects and lists
the folders); each takes `-s, --settings` resolved like `orkeon run` from the working directory. With no
account, `accounts` prints `No e-mail account is configured. Declare one under Orkeon:Tools:Email:Accounts …`
(`--json`: `[]`), exit 0. Exit `0`,
`1` usage, configuration or refusal, `2` network or server, `130` Ctrl+C. Agents never run it: a tool
without a usable token answers "run `orkeon email login <account>`". Accounts, rights and the send
allow-list are in `reliability/security.md`.

**`orkeon usecases`** — `search "<need>"` (`--top`, `--lang`; offline), `list` (`--category`, `--process`,
`--tag`), `show <id>` (`--crew`), `export <id> --to <folder>` (a team folder with `crew/config.yaml`, its
`data/` and `studio-team.json`; refused for a reference-only case or a non-empty folder). Exit `0`, `1`, `2`.

**`orkeon rag`** — `ingest`, `search`, `eval` over a RAG collection, auto-mounting the working directory
at `/workspace` (ro) and `./.orkeon` at `/output` (rw); not used by teams (`docs/reference/cli.md`).

**`orkeon forge`** — ignored by the harness process (D9). Sub-verbs `list`, `resume`, `promote`, `reopen`,
`schedule`, `unschedule`, `rename`; options and error codes in `docs/reference/cli.md`.
`forge schedule <team-folder>` registers a schedule with the operating system (`resume-and-memory.md` § 5).

## 7. Checks

```bash
orkeon --version                                         # the version the image was built with
orkeon run --list-tools | wc -l                          # 80 on the 24ab0d0 binary, without configuration; a2bb6c3 adds rag_search, rag_ingest, rag_eval
cd teams/<slug> && ./run.sh --validate                   # VALIDATION OK: … (agents=N, tasks=M, tools resolved=K)
orkeon run crew --validate -v 1 2>&1 | grep -E 'Using settings|LLM '   # the file, the default model, each profile's key source
orkeon doctor --json                                     # rows from the file resolved from the working directory, Llm__* and ORKEON_* variables
orkeon-bench mounts <slug>                               # the exact --mount line of the launchers
```
