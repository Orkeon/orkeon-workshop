# Resume, memory and incremental processing — what Orkeon gives, what it does not

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: at that commit: `src/core/Orkeon.Application/Memory/` (`MemoryService.cs`, `MemoryCoordinator.cs`,
> `CrewMemoryProviderRegistry.cs`, `CrewMemoryOptions.cs`, `CrewMemoryScope.cs`, `MemoryProviderTypes.cs`),
> `src/core/Orkeon.Application/Agent/AgentExecutionService.cs`, `src/core/Orkeon.Infrastructure/Memory/`
> (`MemoryProviderFactory.cs`, `MemoryProviderSettings.cs`, `RedisMemoryProvider.cs`, `Sqlite/SqliteMemoryOptions.cs`,
> `InMemoryVectorStore.cs`), `src/core/Orkeon.Infrastructure/DependencyInjection/` (`InfrastructureExtensions.cs`,
> `SessionToolsExtensions.cs`, `CheckpointingExtensions.cs`), `src/core/Orkeon.Infrastructure/Orchestration/SequentialCrewOrchestrator.cs`,
> `src/core/Orkeon.Application/Services/Checkpointing/` (`CheckpointManager.cs`, `ResumeEngine.cs`),
> `src/core/Orkeon.Application/Interfaces/Checkpointing/` (`ICheckpointManager.cs`, `IResumeEngine.cs`),
> `src/core/Orkeon.Infrastructure/Checkpointing/` (stores), `src/core/Orkeon.Application/Crew/Execution/ConversationPolicy.cs`,
> `src/core/Orkeon.Infrastructure/Crew/Strategies/GraphProcessStrategy.cs`, `src/core/Orkeon.Domain/Crew/Crew.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`, `SemanticSearchToolExtensions.cs`, `src/tools/Orkeon.Tools.Email/` (`Dtos/`,
> `Tools/`), `src/scripting/Orkeon.Scripting.Cli/Commands/Forge/ForgeScheduling.cs`, `docs/architecture/memory-system.md`,
> `docs/orchestration/process-types.md`, `docs/reference/limitations.md`, `docs/guides/email.md`; harness:
> `.claude/harness/VERIFICATIONS.md` (V-08), plan § 1.4, § 6.7.
> Binary checks (stub on 127.0.0.1): `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`), 2026-10-02 —
> not re-run since; what changed was read in the sources (the refusal of an unknown `memoryProvider` and
> `Memory:Provider` was run on a build of fb26364, V-13, V-14).

**In one sentence:** nothing in `orkeon run` skips work already done, and by default nothing Orkeon keeps
survives the end of the run — the one exception, crew memory in a durable store, recalls similar earlier
outputs and records nothing a program can check — so a team that must resume after a failure or process
only what is new carries that state itself, in files under a writable root of its own. The patterns are in
`reliability/resume-patterns.md` and `reliability/incremental-patterns.md`; this document says why.

## 1. The native features at a glance

| Feature | What it does at ce9ec1f | Survives the run? | Resume or incremental? |
|---|---|---|---|
| `memory: true` (+ `memoryProvider`) (crew) | stores each successful task output; before each task, adds the closest memories of the crew (same `name:`) to its prompt (§ 2.1) | only in a durable store the settings name | no |
| `memory_store` tool | typed entries (user/project/feedback/reference) in a process-local store; reaches the model with an empty schema (§ 2.2) | no | no |
| `semantic_search` tool | searches an in-memory vector store that nothing in a run fills (§ 2.2) | no | no |
| `cache_search` + `web_scrape cached=true` | a RAG cache in the global memory provider (`Memory:Provider`), in memory by default (§ 2.2) | no (not verified otherwise) | no |
| `session_store`, `session_snip`, `session_stats`, `token_budget` | act on a session buffer that no crew loop writes to (§ 2.3) | no | no |
| `publish_event` `retain_as_last_value` / `get_last_value` | last-value cache of the in-memory event hub | no | no |
| LLM retries, timeouts, agent-loop breaker, `graphConfig`, `maxIter` | bound or stop a run (§ 3) | — | no |
| `ICheckpointManager`, `IResumeEngine`, state stores | C# API; `orkeon run` keeps checkpoints in RAM, writes them only once the whole run is over, never reads them (§ 4) | no | no |
| `orkeon rag ingest`, `incremental_reindex` | incremental ingestion of a RAG collection (a separate verb) / of the code index (in memory) | rag: its manifests under `./.orkeon`; index: no | not for team inputs |
| Mailbox flags and folders (`email_search` `unread_only`, `email_mark`, `email_move`) | state kept by the mail server, set by an agent's tool call | yes, on the server | a "processed" marker for a mailbox team (§ 6) |

## 2. Memory

### 2.1 Crew memory: recall by similarity

- **Switch.** `memory: true` (`.memory(true)`) turns it on; without it nothing is stored or recalled.
  `memoryProvider` without `memory: true` fails the load.
- **Writing.** After every task that succeeds, `MemoryCoordinator.StoreTaskResultAsync` stores its output,
  embedded on the task and the start of the output (tags `crew:<name>`, properties `agent_role`,
  `task_description`, `stored_at`…). A hierarchical crew stores the accepted output only, a consensual one
  the retained answer, never a ballot nor a coworker's sub-answer.
- **Reading.** Before each task, `AgentExecutionService` recalls the crew's memories closest to the task
  (vector search, `Orkeon:CrewMemory`: `RecallLimit` 5, `MinScore` 0.6, `MaxChars` 4,000) minus what the
  prompt already carries, and the user prompt shows them after the previous outputs, under *From this
  crew's memory — earlier work, possibly outdated; use it only where it helps:*. `MinScore` is on the local
  English embedder's scale: French text scores high whatever it says (`docs/reference/limitations.md`).
- **Embedder and failures.** Every memory and every query is embedded by the host's embedder (the local
  model in `orkeon run`, through `RaggableTree`; `RaggableTree:Enabled: false` removes it). A crew with
  `memory: true` probes its embedder and its store before the first LLM call and fails the run there; a
  store or recall that fails during the run is a warning, the task keeps its output.
- **Where.** `memoryProvider` (`InMemory`, `Sqlite`, `Redis`, `ChromaDb`, `Pinecone`, `LanceDb`,
  case-insensitive; an unknown value fails the load, `--validate` included — it no longer runs in memory
  with a warning) names a **type**: the connection comes from the host section of that type (`Orkeon:Sqlite`,
  `Orkeon:Redis`, `Orkeon:ChromaDb`, `Orkeon:Pinecone`, `Orkeon:LanceDb`) in the settings the run resolves;
  without that section SQLite is an in-process `:memory:` database, and `LanceDb` without its `Endpoint` is
  refused where the memory is first reached. Without `memoryProvider`, a named crew
  lives in the host's default store, `Memory:Provider` (in memory when unset; an unknown type, or
  `lancedb` without its endpoint, refuses the start). Redis now connects on first
  use (the 24ab0d0 failure `Redis provider not initialized` is fixed).
- **Identity.** The scope is the crew's `name:`, not its id (still a fresh ULID at every load): a later run
  of a crew of the same name, in the same durable store, recalls what earlier runs stored; another crew
  never does. There is no retention and no reset: one entry per successful task, run after run.
- **Durable means a settings decision.** `orkeon run` remembers across processes only when the settings
  it resolves give a durable store — for instance `"Memory": { "Provider": "sqlite" }` and
  `"Orkeon": { "Sqlite": { "ConnectionString": "Data Source=/state/orkeon-memory.db" } }`, the data source a
  virtual path under a writable root. That is machine or team configuration, not crew definition, and the
  harness has not exercised it.

So: never rely on `memory: true` to pass results between tasks — `dependencies` do that, and memory
excludes what the prompt already carries (`orkeon-reference.md` § 4) — nor as the record of what a run did:
a recall is "similar earlier work", not "this unit is done". It can help an agent stay consistent with its
earlier outputs; record that use in `DESIGN.md`, with its store, and keep the registry of § 6 for resume
and incremental processing.

### 2.2 Memory tools

- **`memory_store`** — `InMemoryCategoryMemoryStore`, one per process. It reaches the model with an empty
  parameter schema (`orkeon-reference.md` § 5, footnote ¹), so a call runs with its defaults and lists.
- **`semantic_search`** — `SearchTool` over an `InMemoryVectorStore` registered by
  `SemanticSearchToolExtensions`; no code writes into that store, so the search finds nothing. For a local
  corpus use `directory_search`, `txt_search`, `mdx_search` or `pdf_search` on a mounted root
  (`orkeon-reference.md` § 8).
- **`cache_search`** — reads the RAG cache that `web_scrape` fills with `cached=true`, kept in the global
  `IMemoryProvider` (`Memory:Provider`, default in-memory). `Memory:Provider: sqlite` with a file
  `Orkeon:Sqlite:ConnectionString` (a virtual path on a writable mount, `SqliteDataSourceGovernor`) could
  outlive the run — not verified, and a machine-wide setting: not a place for a team's state.

### 2.3 Session tools

`session_store`, `session_snip`, `session_stats` and `token_budget` work on an `ISessionBufferService`
designed for the interactive REPL. In `orkeon run` only those tools reference it: the agent's conversation
never enters it, so `session_snip` does not shorten an agent's context and `token_budget` does not measure
it. `session_cost` reports zeros (`llm-profiles.md` § 7). Context size is governed by the design — short
tasks, bounded reads, few tools — not by these tools.

## 3. Failure handling that exists — and does not resume

Details and design rules are in `reliability/error-handling.md`; the facts:

- **Model calls.** Transient failures are retried up to `Llm:MaxRetries` (10) and a timeout once; then the
  task fails (`llm-profiles.md` § 3).
- **Agent loop.** A task succeeds only when its agent ends with a final answer
  (`ExecutionOrchestrator`: exit reason `Completed`). An agent that gets the same tool error three times in
  a row stops (`AgentDefaults.MaxConsecutiveIdenticalErrors = 3`) with `Agent stopped after 3 identical tool
  call failures. Error: …` and its partial work; one that reaches `maxIter` fails too, unless the one
  tool-free call it then gets returns an answer, and so does one that answers empty twice.
- **`graphConfig`** bounds a `process: graph` run (transitions, visits, total duration); without explicit
  bounds the visits are computed from the crew (tasks × (1 + `maxRetryCycles`)) and the duration is the
  preset's (10 minutes under `strict`). The `circuitBreaker:` blocks are gone: the load refuses them.
- **Every mode.** A failed task marks its dependents `skipped` and the run exits 2 (`cli.md` § 3.5) — in
  `graph` after its retries, which run before the next task. The other tasks still run.
- **Stop.** SIGINT or SIGTERM cancels: an `error` event `crew_cancelled` (under `--events`), exit 2 when
  the signal lands during the run (130 only before the crew starts — checked on the main binary), a partial
  `AUTO_SUMMARY.md` when an `/output…` root is writable. The next task never starts. SIGKILL leaves none of
  these.

Each of these ends or bounds a run. None records what was done in a form the next run can use.

## 4. Checkpoints and `IResumeEngine` (V-08, unchanged at ce9ec1f)

**What `orkeon run` does.** `AddOrkeonInfrastructure()` registers `AddOrkeonCheckpointing()`:
`InMemoryStateStore`, `CheckpointManager`, `ResumeEngine`. The orchestrator (`SequentialCrewOrchestrator`,
which runs every process mode) opens a checkpoint session at kickoff, keyed by the crew id. Only **after
the whole strategy has returned** does it checkpoint each task output — every one marked `Completed`,
failed tasks included — and complete the session; when the strategy throws, it marks the session failed
with no task checkpoint. Then the process exits and the store is gone. There is no `--resume` option
(`cli.md` § 2), and no shipped program calls `IResumeEngine`.

**What the API offers a C# host.**

| Piece | Content |
|---|---|
| `ICheckpointManager` | `StartSessionAsync(crewId)`, `CheckpointAsync(sessionId, taskId, output)`, `MarkFailedAsync`, `CompleteSessionAsync`, `GetLatestCheckpointAsync(crewId)`, history, restore, fork, diff |
| `IResumeEngine` | `CanResumeAsync(crewId)` (a latest session not completed); `ResumeAsync(crewId, options)` → `ResumeResult`: completed task ids and their outputs, skip count, resume index. It reads; it re-runs nothing |
| Stores | `AddOrkeonSqliteCheckpointing(connectionString)` (the `Data Source` is a virtual path on a writable mount), `AddOrkeonPostgresCheckpointing(configuration)` (`Orkeon:Checkpointing:ConnectionString`, `SchemaName`, `AutoMigrate`, `MaxHistoryPerSession`), `JsonFileStateStore(fileSystem, baseVirtualPath)` without a DI extension |

The registrations use `TryAdd`: a durable store registered **after** `AddOrkeonInfrastructure()` loses to
the in-memory one. Even then, resuming through this API means the host must write a checkpoint per task
itself (for instance from an `ICrewExecutionHook.OnTaskCompletedAsync`), key the session by an id of its
own instead of the generated crew id, and on restart build a crew without the completed tasks, handing
their outputs in as context — Orkeon has no entry point that takes a `ResumeResult`. That is an
application registry with more moving parts; use it only when the team is already a C# host for other
reasons (`orkeon/csharp-crews.md`). `Orkeon:ExecutionState:Persistence` (C# opt-in) persists the crew's
state transitions, not task results (`docs/reference/limitations.md`).

## 5. What does not exist

| Missing at ce9ec1f | Consequence for a team |
|---|---|
| `orkeon run --resume`, or any "skip the tasks already done" | every launch runs every task; skipping is decided by the team from its own registry |
| A durable run identity | each process gets new task ids (ULIDs) and a new crew id: key state by the **input** (file name, message id, hash), never by an Orkeon id |
| Deduplication of inputs | "already processed" is a registry lookup the team performs, deterministically |
| A watermark (last date or id processed) | stored by the team in its registry, advanced only after the unit's deliverable is written |
| A durable record agents can query exactly | crew memory recalls by similarity, and only in a store the settings make durable; state lives in files under a writable root, read with `file_read` / `json_tool`, written by a deliverable or a tool |
| A lock between concurrent runs | two launches on the same state folder race; run one at a time, or design the registry for it |
| A scheduler of Orkeon's own | `orkeon forge schedule <team-folder>` registers with the operating system, for the current user, the schedule a forge-adopted folder declares in its `forge.json` (a Windows task, a systemd user timer or a crontab line; `--check`, `forge unschedule`); a workshop team declares none (`FORGE-SCHEDULE-NONE`): schedule its launcher with the host's own scheduler. Each scheduled launch is a fresh process: the registry carries what is done |

## 6. Consequences for the design

1. **Resume and incremental processing are written into `NEED.md` and decided in `DESIGN.md`**, built in
   their own batch (typically `B4`, `process/workflow.md` § 5), proven by invariants: `INV-RESUME`,
   `INV-INCR`, `INV-IDEMP` (`testing/invariants-catalog.md`).
2. **State goes under a dedicated writable root** — `/state` (`rw`) in `mounts.json` — never mixed with the
   deliverables (`INV-FS`) and never in Orkeon memory.
3. **Cut the work into units** (one input file, one message, one record) with a stable key derived from
   the input; a unit is done when its deliverable exists **and** the registry says so.
4. **Keep the bookkeeping deterministic**: computing keys, diffing a listing against the registry and
   advancing the watermark are computations for a tool with unit tests, not for the model. A TypeScript
   `toolBuilder` tool computes but has no I/O: the agent hands it what `directory_read` / `file_read`
   returned and writes the result with `file_write` or a deliverable. A C# tool does its own I/O through the
   VFS but reaches a team only through `orkeon-harness-run` or a C# host, not Studio (V-07). See
   `design/tools-selection.md`. The model judges and writes.
5. **Make tasks idempotent**: the same unit gives the same deliverable path, overwritten on a rerun; an
   action on the outside world is guarded by the registry (`reliability/security.md` for e-mail).
6. **A mailbox can carry part of the state** (IMAP or Microsoft Graph; POP3 has no folders nor marks):
   process `unread_only` messages or one folder, then `email_mark` (`seen`) or `email_move` the message once
   its deliverable is written — both need the account's `Organize` right; `email_read` leaves a message
   unread unless `mark_read`. Key the registry by the `message_id` that `email_read` returns: an
   `email_search` `id` survives a move on Graph, not on IMAP (`email_move` returns the new one only when the
   server has UIDPLUS, and so does `email_delete` for a message it moved to the trash; both list about forty
   ids in a result before the agent loop cuts the list — smaller batches when each new id matters). The marker is an agent's tool call, so the registry stays the record. The send quota `Send:MaxPerHour` is counted per
   process (`docs/guides/email.md`, `docs/reference/limitations.md`).
7. **A restart starts from nothing Orkeon kept**: the first task reads the registry, the last one updates
   it. Test it the way the bench will (lot 4): stop the run after task *k* with SIGTERM (exit 2, `crew_cancelled`), relaunch,
   compare the registry and the deliverables; then a run on dataset v1 followed by v1 + delta.

## 7. Checks

```bash
grep -n -E 'memory|memoryProvider' teams/<slug>/crew/config.yaml   # if present: DESIGN.md says why and where it is stored; no resume or incremental rule relies on it
grep -rn -E 'memory_store|semantic_search|session_' teams/<slug>/crew/   # tools that keep nothing across runs
orkeon run --help | grep -c resume                                   # 0: there is no resume option
```
