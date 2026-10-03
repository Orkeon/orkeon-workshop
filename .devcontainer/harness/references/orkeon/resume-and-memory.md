# Resume, memory and incremental processing — what Orkeon gives, what it does not

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: at that commit: `src/core/Orkeon.Application/Memory/` (`MemoryService.cs`, `MemoryCoordinator.cs`,
> `CrewMemoryProviderRegistry.cs`), `src/core/Orkeon.Application/Agent/AgentExecutionService.cs`,
> `src/core/Orkeon.Application/Common/Mapping/ExecutionMapper.cs`, `src/core/Orkeon.Infrastructure/Memory/`
> (`MemoryProviderFactory.cs`, `RedisMemoryProvider.cs`, `Sqlite/SqliteMemoryOptions.cs`, `InMemoryVectorStore.cs`),
> `src/core/Orkeon.Infrastructure/DependencyInjection/` (`InfrastructureExtensions.cs`, `SessionToolsExtensions.cs`,
> `CheckpointingExtensions.cs`), `src/core/Orkeon.Infrastructure/Orchestration/SequentialCrewOrchestrator.cs`,
> `src/core/Orkeon.Application/Services/Checkpointing/` (`CheckpointManager.cs`, `ResumeEngine.cs`),
> `src/core/Orkeon.Application/Interfaces/Checkpointing/` (`ICheckpointManager.cs`, `IResumeEngine.cs`),
> `src/core/Orkeon.Infrastructure/Checkpointing/` (stores), `src/core/Orkeon.Application/Crew/Execution/ConversationPolicy.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CircuitBreakerPolicyFactory.cs`, `src/core/Orkeon.Domain/Crew/Crew.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`, `SemanticSearchToolExtensions.cs`, `src/tools/Orkeon.Tools.Email/` (`Dtos/`,
> `Tools/`), `src/scripting/Orkeon.Scripting.Cli/Commands/Forge/ForgeScheduling.cs`, `docs/architecture/memory-system.md`,
> `docs/reference/limitations.md`, `docs/guides/email.md`; harness: `.claude/harness/VERIFICATIONS.md` (V-08), plan § 1.4, § 6.7.
> Binary checks (stub on 127.0.0.1): `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`), 2026-10-02.

**In one sentence:** nothing Orkeon keeps survives the end of an `orkeon run`, and nothing in `orkeon run`
skips work already done — a team that must resume after a failure or process only what is new carries
that state itself, in files under a writable root of its own. The patterns are in
`reliability/resume-patterns.md` and `reliability/incremental-patterns.md`; this document says why.

## 1. The native features at a glance

| Feature | What it does at 24ab0d0 | Survives the run? | Resume or incremental? |
|---|---|---|---|
| `memory: true` + `memoryProvider` (crew) | stores each successful task output in the crew memory; **nothing reads it back** into a prompt (§ 2.1) | no | no |
| `memory_store` tool | typed entries (user/project/feedback/reference) in a process-local store; reaches the model with an empty schema (§ 2.2) | no | no |
| `semantic_search` tool | searches an in-memory vector store that nothing in a run fills (§ 2.2) | no | no |
| `cache_search` + `web_scrape cached=true` | a RAG cache in the global memory provider, in memory by default (§ 2.2) | no (not verified otherwise) | no |
| `session_store`, `session_snip`, `session_stats`, `token_budget` | act on a session buffer that no crew loop writes to (§ 2.3) | no | no |
| `publish_event` `retain_as_last_value` / `get_last_value` | last-value cache of the in-memory event hub | no | no |
| LLM retries, timeouts, agent-loop breaker, `circuitBreaker`, `maxIter` | bound or stop a run (§ 3) | — | no |
| `ICheckpointManager`, `IResumeEngine`, state stores | C# API; `orkeon run` keeps checkpoints in RAM, writes them only once the whole run is over, never reads them (§ 4) | no | no |
| `orkeon rag ingest`, `incremental_reindex` | incremental ingestion of a RAG collection (a separate verb) / of the code index (in memory) | rag: its manifests under `./.orkeon`; index: no | not for team inputs |
| Mailbox flags and folders (`email_search` `unread_only`, `email_mark`, `email_move`) | state kept by the mail server, set by an agent's tool call | yes, on the server | a "processed" marker for a mailbox team (§ 6) |

## 2. Memory

### 2.1 Crew memory: write-only

- **Writing.** After every successful task, `AgentExecutionService` saves the task output into the crew's
  memory (`MemoryCoordinator.StoreTaskResultAsync`, tags `agent:<id>`, `task:<id>`). It does so whether
  `memory: true` is set or not: no strategy reads `Crew.MemoryEnabled`.
- **Reading.** Nothing brings it back: `MemoryCoordinator.RetrieveRelevantMemoriesAsync` has no caller, the
  strategies receive a `NullMemoryScope`, and `ExecutionMapper` sets `MemoryContext = null` ("Would be
  mapped from memory service"). An agent never sees a memory in its prompt.
- **Where.** `memoryProvider` (`InMemory`, `Sqlite`, `Redis`, `ChromaDb`, `Pinecone`, `LanceDb`,
  case-insensitive; an unknown value falls back to in-memory with a warning, and `--validate` does not
  check it) backs the long-term part through `MemoryProviderFactory`, built with an **empty connection
  string**: SQLite opens `Data Source=:memory:`, LanceDB falls back to in-memory with a warning, ChromaDB
  aims at `http://localhost:8000` (with no server there, its first write fails the task the way Redis's
  does — code reading), and Redis is never initialized, so its first write throws inside the successful
  task, which then fails: on the main binary, `memoryProvider: Redis` ended every run with
  `Task … failed: Redis provider not initialized. Call InitializeAsync first.`, exit 2. `Memory:Provider` /
  `Memory:ConnectionString` of the settings do not reach it; `docs/architecture/memory-system.md` now says
  so, but its advice to use "the application-wide provider instead" does not apply: crew memory never uses
  it. Without `memoryProvider`, process-local lists.
- **Identity.** Each load gives the crew a fresh id (`Crew.Create` → `CrewId.Create()`), and the memory is
  keyed by it: even a durable store would hold nothing the next process can find.

So: never rely on `memory: true` to pass results between tasks — `dependencies` do that (`orkeon-reference.md`
§ 4) — nor between runs.

### 2.2 Memory tools

- **`memory_store`** — `InMemoryCategoryMemoryStore`, one per process. It reaches the model with an empty
  parameter schema (`orkeon-reference.md` § 5, footnote ¹), so a call runs with its defaults and lists.
- **`semantic_search`** — `SearchTool` over an `InMemoryVectorStore` registered by
  `SemanticSearchToolExtensions`; no code writes into that store, so the search finds nothing. For a local
  corpus use `directory_search`, `txt_search`, `mdx_search` or `pdf_search` on a mounted root
  (`orkeon-reference.md` § 8).
- **`cache_search`** — reads the RAG cache that `web_scrape` fills with `cached=true`, kept in the global
  `IMemoryProvider` (`Memory:Provider`, default in-memory). A SQLite `Memory:ConnectionString` would be a
  virtual path on a writable mount (`SqliteDataSourceGovernor`) and could outlive the run — not verified,
  and a machine-wide setting: not a place for a team's state.

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
- **`circuitBreaker`**: the crew-level block takes effect only with `process: graph`, and only when
  `graphConfig` is absent (`CircuitBreakerPolicyFactory.ResolveGraph` reads the crew block alone); a
  task-level block never applies, in any mode (`CreateTaskFsm` has no caller). Orkeon's
  `docs/reference/limitations.md` says the same at 24ab0d0, and so does `orkeon-reference.md` § 8.
- **Sequential mode.** A failed task marks its dependents `skipped` and the run exits 2 (`cli.md` § 3.5).
  In `graph` mode a failed task skips nothing and only the breaker fails the run
  (`docs/orchestration/graph.md`).
- **Stop.** SIGINT or SIGTERM cancels: an `error` event `crew_cancelled` (under `--events`), exit 2 when
  the signal lands during the run (130 only before the crew starts — checked on the main binary), a partial
  `AUTO_SUMMARY.md` when an `/output…` root is writable. The next task never starts. SIGKILL leaves none of
  these.

Each of these ends or bounds a run. None records what was done in a form the next run can use.

## 4. Checkpoints and `IResumeEngine` (V-08, unchanged at 24ab0d0)

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

| Missing at 24ab0d0 | Consequence for a team |
|---|---|
| `orkeon run --resume`, or any "skip the tasks already done" | every launch runs every task; skipping is decided by the team from its own registry |
| A durable run identity | each process gets new task ids (ULIDs) and a new crew id: key state by the **input** (file name, message id, hash), never by an Orkeon id |
| Deduplication of inputs | "already processed" is a registry lookup the team performs, deterministically |
| A watermark (last date or id processed) | stored by the team in its registry, advanced only after the unit's deliverable is written |
| Durable memory reachable by agents | state lives in files under a writable root, read with `file_read` / `json_tool`, written by a deliverable or a tool |
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
   server has UIDPLUS). The marker is an agent's tool call, so the registry stays the record. The send quota `Send:MaxPerHour` is counted per
   process (`docs/guides/email.md`, `docs/reference/limitations.md`).
7. **A restart starts from nothing Orkeon kept**: the first task reads the registry, the last one updates
   it. Test it the way the bench will (lot 4): stop the run after task *k* with SIGTERM (exit 2, `crew_cancelled`), relaunch,
   compare the registry and the deliverables; then a run on dataset v1 followed by v1 + delta.

## 7. Checks

```bash
grep -n -E 'memory|memoryProvider' teams/<slug>/crew/config.yaml   # if present: no design decision may rely on it
grep -rn -E 'memory_store|semantic_search|session_' teams/<slug>/crew/   # tools that keep nothing across runs
orkeon run --help | grep -c resume                                   # 0: there is no resume option
```
