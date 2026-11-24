# Resume, memory and incremental processing — what Orkeon gives, what it does not

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: at that tag: `src/core/Orkeon.Application/Memory/` (`MemoryService.cs`, `MemoryCoordinator.cs`,
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
> `Memory:Provider` was run on a build of fb26364, V-13, V-14). At 1.2.0 (2026-11-17, published CLI, `--llm-mock`): a
> two-task sequential crew with `Orkeon:Checkpointing` (`Store: Json`) and `Orkeon:RunHistory` on, its second task failed,
> then `--resume latest` — § 4 quotes what it printed; the refusal of a `/state` mount; `orkeon settings` for the
> `Orkeon:Checkpointing`, `Orkeon:RunHistory`, `Orkeon:HumanInput` and `Orkeon:CognitiveMemory` keys. The memory and session facts of
> § 2 were not run again at 1.2.0.

**In one sentence:** since rc.7 Orkeon can continue a failed or killed run — `orkeon run <crew> --resume <id>|latest`,
once `Orkeon:Checkpointing:Enabled` is true, answers the **tasks** the run had completed from their checkpoint — but
that is opt-in, per run and per whole task: a new launch runs every task, nothing skips the units a task already
processed, nothing deduplicates inputs between runs, and crew memory recalls similar earlier outputs without recording
anything a program can check — so a team that must process only what is new, or resume inside a task, still carries
that state itself, in files under a writable root of its own (`/registry`; `/state` and `/runs` are the runner's). The patterns are in
`reliability/resume-patterns.md` and `reliability/incremental-patterns.md`; this document says why.

## 1. The native features at a glance

| Feature | What it does at 1.2.0 | Survives the run? | Resume or incremental? |
|---|---|---|---|
| `memory: true` (+ `memoryProvider`) (crew) | stores each successful task output; before each task, adds the closest memories of the crew (same `name:`) to its prompt (§ 2.1) | only in a durable store the settings name | no |
| `memory_store` tool | typed entries (user/project/feedback/reference): `list` (`newest_first`), `add`, `replace`, `delete`, `get`; in a process-local store, or since c101cbd one `memory.json` per project when `Orkeon:Cli:Memory:Persist` is on (§ 2.2) | no by default; yes with `Persist` | no |
| `semantic_search` tool | searches an in-memory vector store that nothing in a run fills (§ 2.2) | no | no |
| `cache_search` + `web_scrape cached=true` | a RAG cache in the global memory provider (`Memory:Provider`), in memory by default (§ 2.2) | no (not verified otherwise) | no |
| `session_store`, `session_snip`, `session_stats`, `token_budget` | act on a session buffer that no crew loop writes to (§ 2.3); since 151a762 `session_store` reads or writes several state keys in one call and appends one message (`append_message`); since 0ea39d9 a multi-key write is all or nothing and writes are denied in `plan` mode; since c101cbd `session_snip` and `truncate` keep whole **turns** | no in `orkeon run`; the REPL persists its session | no |
| `ctx.memory.agent` (scripting hosts) | key/value entries per project, crew name and agent name, in JSON files (§ 2.3) | yes, under `Orkeon:Scripting:AgentMemory:RootDirectory` | not for a declarative crew |
| `publish_event` `retain_as_last_value` / `get_last_value` | last-value cache of the in-memory event hub | no | no |
| LLM retries, timeouts, agent-loop breaker, the `graph:` budgets, `maxIter` | bound or stop a run (§ 3) | — | no |
| a task's `retry:` (rc.7) | runs a failed task again, whole, up to `attempts` runs (§ 3) | — | no: inside one run |
| Checkpoints and `orkeon run --resume` (rc.7; `Orkeon:Checkpointing`) | one checkpoint per completed task, written as it ends; `--resume <id>\|latest` continues that run, its completed tasks answered from the store (§ 4) | yes with `Enabled: true` and `Store` `Json`, `Sqlite` or `Postgres` (default: off, in memory) | **resume of a run, per task**; not incremental |
| Run history, `orkeon runs` (rc.7; `Orkeon:RunHistory`) | keeps the `--events` lines of every run under `./.orkeon/runs` (`/runs`); `runs list`, `show`, `tail` read them back | yes when `Enabled` (off under `orkeon run` by default) | a record to read, not a state a team resumes from |
| Durable human input (rc.7; `Orkeon:HumanInput`, with checkpointing) | a `human_input` question or a tool approval is persisted; a run with nobody to answer stops, exit 75, and `--resume <id> --input "…"` answers it (§ 4) | yes, in the checkpoint store | resumes that run |
| Cognitive memory (`Orkeon:CognitiveMemory:Enabled`, default false; rc.7) | wires `ICognitiveMemoryService` into the runners, its analyses on `Orkeon:CognitiveMemory:Profile` — host configuration, not read further here | per its store | no |
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
  `"Orkeon": { "Sqlite": { "ConnectionString": "Data Source=/registry/orkeon-memory.db" } }`, the data source a
  virtual path under a writable root of the team (not `/state`, the runner's since rc.7). That is machine or team configuration, not crew definition, and the
  harness has not exercised it.

So: never rely on `memory: true` to pass results between tasks — `dependencies` do that, and memory
excludes what the prompt already carries (`orkeon-reference.md` § 4) — nor as the record of what a run did:
a recall is "similar earlier work", not "this unit is done". It can help an agent stay consistent with its
earlier outputs; record that use in `TEAM.md § Design`, with its store, and keep the registry of § 6 for resume
and incremental processing.

### 2.2 Memory tools

- **`memory_store`** — typed entries (`user`, `project`, `feedback`, `reference`), each with an `id` and a
  `created_at`. Operations: `list` (one category or all; `newest_first: true` orders by `created_at` then `id`
  descending), `add` (returns the new `id`), `replace` (`id`, `content`: retires a stale fact in place, same id and
  category, `created_at` set again; since c101cbd, #286), `delete`, `get`. Its schema reaches the model since c101cbd
  (#282; before, an empty one: a call ran with its defaults and listed). The store is `InMemoryCategoryMemoryStore`,
  one per process, unless `Orkeon:Cli:Memory:Persist` is `true` (default `false`; the REPL turns it on when the key is
  absent): then `FileCategoryMemoryStore` keeps `<RootDirectory>/<project slug>/memory.json` through the VFS,
  `RootDirectory` a virtual directory, default `/workspace/.orkeon/memory` (refused blank when `Persist` is on), read at
  the first access, written after every mutation, an id never reused after a delete; an unreadable file is refused
  and left untouched (`CategoryMemoryOptions.cs`, `FileCategoryMemoryStore.cs`, `SessionToolsExtensions.cs`; read in
  the sources, not run). It is machine or REPL configuration and a store the model writes: still no registry for a
  team's state (§ 6).
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
tasks, bounded reads, few tools — not by these tools. Since c101cbd (#287) `session_snip`'s `retain_count` (default 3) and the
`truncate` operation of `session_store` count **turns**, not messages: a turn starts at a `user` message and owns the
`tool`, `assistant` and `note` messages that follow, so a cut never splits a request from its answer; the head message
is kept on its own, `retain_count: 0` keeps the head alone, a buffer with fewer turns (or no `user` message) is left
untouched, and the answer carries `kept_from` (the index of the first message kept after the head, `-1` when nothing
was removed or `retain_count: 0` kept the head alone). Since e44df3f the buffer is persisted per project
(`FileSessionBufferService`, `<SessionsDirectory>/<project slug>/last.json`, `SessionsDirectory` default
`/workspace/.orkeon/sessions`) when `Orkeon:Cli:Session:Persist` is on: off unless a host turns it on, and
the REPL turns it on when the key is absent (`CliSessionOptions.cs`, `ReplStartup.cs`). Since 151a762 (#263) a script
reads several state keys in one `session_store` call (`get_state` with `keys`, answered in `values`, an unset key absent),
writes or removes several (`set_state` with `values` or `keys`; a null value is dropped on the way, so removal goes through
`keys`) and adds a message with `append_message` (`role`, `content`, optional `timestamp`) instead of reading and
rewriting the whole buffer with `read_messages` / `write_messages` (V-53; over `orkeon mcp serve` the `keys` and
`values` arrays fail, `orkeon-reference.md` § 5).

Since 0ea39d9 (CHANGELOG R-10, R-11; read in `SessionStoreTool.cs`, not run — V-54 g): a multi-key `set_state` goes through
`ISessionBufferService.SetStates`, every key changed under the buffer's one lock, **all or nothing**; a key in both
`values` and `keys` is refused naming it (`set_state: keys present in both values and keys: …`), and `key` / `value` mixed
with `values` / `keys` fails (`success: false`, no message). The tool declares its access per operation: the reads
(`get_state`, `read_messages`, `get_metadata`, or no operation) are `Read`, every other one `Edit`, so **in `plan` mode a
write is denied** (`tool 'session_store' is not permitted in plan mode (read-only).`, `ModePermissionGate`) — when the
permission gate exists at all, `Orkeon:Security:PermissionGate:Enabled: true`; since rc.7 (FWK-06) the gate judges the
tool calls of a YAML or declarative crew's agents too, each under its `permissionMode` (`yaml-schema.md`), not only a
procedural script's `ctx.llm.act` (`reliability/security.md` § 3); before 0ea39d9
every operation passed as a read.

The scripting hosts add a durable per-agent store behind `ctx.memory.agent` (RT-16, `IScriptAgentMemoryStore`:
store, get, search by key or value, delete; `FileScriptAgentMemoryStore`, one JSON file per project and
agent under `Orkeon:Scripting:AgentMemory:RootDirectory`, default `/workspace/.orkeon/agent-memory`;
`SessionToolsExtensions.cs`). The key is `agent:<project>:<crew>:<agent>`, so two agents of one name in
one crew share it (`docs/reference/limitations.md`). A YAML crew's agents do not reach it.

## 3. Failure handling that exists — and does not resume

Details and design rules are in `reliability/error-handling.md`; the facts:

- **Model calls.** Transient failures are retried up to `Llm:MaxRetries` (10) and a timeout once; then the
  task fails (`llm-profiles.md` § 3).
- **Agent loop.** A task succeeds only when its agent ends with a final answer
  (`ExecutionOrchestrator`: exit reason `Completed`). An agent that gets the same tool error three times in
  a row stops (`AgentDefaults.MaxConsecutiveIdenticalErrors = 3`) with `Agent stopped after 3 identical tool
  call failures. Error: …` and its partial work. One that spends its `maxIter` rounds on tool calls always
  gets one more tool-free turn asking for the final answer (`ChatClientAgentLoop`, log line `spent its N
  iterations on tool calls; asking once more, without tools, for the final answer`): an answer there
  completes the task (exit reason `Completed`, `IterationsUsed` = `maxIter`); an empty one fails it
  (`MaxIterationsReached`). Since 23f4eae the text written beside the last tool call ("Mail sent. Now
  the log:") is never taken as the answer — before, it was, and the task failed `MaxIterationsReached`
  with that preamble as its output although the work was done. An agent that answers empty twice fails too.
- **A task's `retry:`** (rc.7; `yaml-schema.md`) runs a failed task again in every mode, the whole task, tool calls
  that already succeeded included — nothing deduplicates them. Only the attempt that ended the task is checkpointed.
- **`graph:`** bounds a `process: graph` run (transitions, visits of one node, total duration); without explicit
  bounds the visits are the sum over the tasks of 1 + their retries, the transitions twice that plus one, and the
  duration is the preset's (10 minutes under `strict`). The Graph process no longer retries a failed task by itself; a
  node whose task fails ends the run. `graphConfig:` and the `circuitBreaker:` blocks are gone: the load refuses them.
- **Every mode.** A failed task marks its dependents `skipped` and the run exits 2 (`cli.md` § 3.5) — after its own
  `retry:` attempts when it declares some. The other tasks still run.
- **Stop.** SIGINT or SIGTERM cancels: an `error` event `crew_cancelled` (under `--events`), exit 2 when
  the signal lands during the run (130 only before the crew starts — checked on the main binary), a partial
  `AUTO_SUMMARY.md` when an `/output…` root is writable. The next task never starts. SIGKILL leaves none of
  these.

Each of these ends or bounds a run. None records what was done in a form the next run can use — the checkpoints of
§ 4 do, for the same run continued.

## 4. Checkpoints and `orkeon run --resume` (rc.7, FWK-01 and FWK-07; before, V-08)

Up to rc.6 `orkeon run` kept its checkpoints in memory, wrote them once the whole run was over and never read them
(V-08). At 1.2.0:

- **Switch.** `Orkeon:Checkpointing` — `Enabled` (default `false`: the in-memory store, gone with the process), `Store`
  `Memory`, `Json`, `Sqlite` or `Postgres`, `Path`, `ConnectionString`, `MaxVersions` (20, Json). `Json` and `Sqlite`
  write under `./.orkeon/state` of the working directory, an internal mount at `/state` (`/state/checkpoints`,
  `/state/checkpoints.db`); a `Store` without `Enabled: true` is ignored with a warning. `orkeon run` and `orkeon-host`
  read the section. For a workshop team it belongs in `settings/<slug>/appsettings.json`, and the folder is
  `teams/<slug>/.orkeon/` since the launchers run from the team folder.
- **What is written.** Every task a run completes is checkpointed as it ends, in the six modes, under `<task name>#<n>`
  (the ordinal of its invocation), with a fingerprint of the task (description and expected output with the `--var`
  values in them, agent, dependencies). A checkpoint that cannot be written fails the task. A run whose crew did not
  succeed ends its session `Failed`, resumable.
- **Resuming.** `orkeon run <crew> --resume <id>|latest` continues a failed or killed run under the same run id: the
  tasks it had completed are answered from the checkpoint, no model asked (`task.completed` carries `resumed: true`),
  the others run. A task edited since is run again with every task after it. Checked on the 1.2.0 CLI: the failed run
  prints `Run <id> did not complete. Resume it, its finished tasks kept, with: orkeon run crew/crew.yaml --resume <id>`
  on stderr and exits 2; `--resume latest` then ran the second task only and left the first task's deliverable as the
  first run wrote it, exit 0; a second `--resume latest` fails with `Nothing to resume: crew '<name>@/crew/crew.yaml~<16
  hex>' has no unfinished run.`; without the setting, `ERROR: --resume needs Orkeon:Checkpointing:Enabled=true in the
  settings: without a checkpoint store nothing of an earlier run is kept to resume.`
- **Refused**: with `--validate`, `--list-tools`, a procedural `.ork.ts`, and with `--events` when the id is `latest`
  (name the run id). `latest` refuses a run still marked `Running` (no lease: name its id to take it over).
- **The crew key** is the crew's name, the virtual path of its file and a 16-hex digest of the file's full path: moving
  or renaming the team folder orphans its earlier runs.
- **Decisions.** In `graph`, a decision node's answer is checkpointed and replayed, so a resumed run takes the route
  the interrupted one took; since 1.4.0 (#430) `sequential` and `parallel` replay theirs too (before, they asked
  again), with its stored `decisionSource` (`task.completed` with `resumed: true`; run on the 1.4.0 CLI in both modes for a
  `fallback`, and in `sequential` for a relay). A decision is replayed only while its task is unchanged: its
  questions, fallback and relay count in the fingerprint, so an edited one is decided again with every task after it (run:
  `Task pick#1 changed since run <id> checkpointed it (…): it and every task after it run again`). A checkpoint written
  before 1.4.0 lacks that part: its first decision task is decided again once and every task after it runs again (per
  the CHANGELOG). An `optional` crew resumed under the other circuit is refused, `error` code
  `decision_circuit_mismatch`, exit 1 (run: `crew '…' (decision.mode: optional) was started with the decision circuit
  off, … and is resumed with the circuit on: resume it with the circuit off (--no-decision), or start a new run`).
  Manager decisions of a hierarchical or autonomous crew are replayed live.
- **Questions.** With checkpointing, a `human_input` question (or a tool approval) is persisted with the session.
  `Orkeon:HumanInput:Pause` is `Hold` or `Suspend` — unset: `Suspend` in a plain `orkeon run`, `Hold` under `--events`
  and in the daemon. A suspended run exits **75** with `run.finished` `status: "waiting_for_input"` and a `requestId`;
  `orkeon run <crew> --resume <id> --input "…"` answers it. The stored prompt and answer are in plaintext
  (`docs/reference/limitations.md`).
- **History.** `Orkeon:RunHistory` (`Enabled` false under `orkeon run`; `Store` `Jsonl` or `Sqlite`; `RetentionDays` 30,
  `MaxRuns` 1000) records the events of each run under `./.orkeon/runs`, mounted at `/runs`; `orkeon runs list | show
  <id> | tail <id>` read them. A killed run reads `orphaned`. Secrets are masked before the sinks write.

**The C# side.** `AddOrkeonCheckpointing(IConfiguration)` reads the section; `AddOrkeonSqliteCheckpointing` and
`AddOrkeonPostgresCheckpointing` now **replace** the registered `IStateStore` (they lost to the in-memory one before).
`ICheckpointManager.StartSessionAsync(ExecutionId sessionId, string crewKey)` — the session id is the run's id —,
`CheckpointAsync(…, retryCount)`; `KickoffOptions.Resume` (and `ExecutionId`, `CrewKey`, `ResumeInput`) through
`ICrewOrchestrationService.KickoffAsync(crewId, input, options, ct)` is the request `--resume` makes; `ResumeResult`
lost `ResumeFromIndex` (a resume is keyed by task). `Orkeon:ExecutionState:Persistence` persists the crew's state
transitions, read with the section (`orkeon/csharp-crews.md`).

## 5. What still does not exist

| Missing at 1.2.0 | Consequence for a team |
|---|---|
| Resume by default, or across launches | `--resume` is an explicit option on a run that failed or was killed, with checkpointing on; a plain launch — a scheduled one, Studio's, the launcher's — starts a new run and runs every task. Skipping what earlier **runs** did is decided by the team from its own registry |
| Resume inside a task | a checkpoint is a whole completed task: a task stopped after 40 of 100 units starts again at unit 1 (and a `retry:` replays the whole task, tool calls included). Units already done are skipped only by the team's registry |
| Resume of a procedural `.ork.ts` | refused; teams are declarative |
| A stable id for a task or a unit | the run has one id (`ExecutionId`, kept across `--resume`), but crew and task ids are new ULIDs at each load: key state by the **input** (file name, message id, hash), never by an Orkeon id |
| Deduplication of inputs | "already processed" is a registry lookup the team performs, deterministically |
| A watermark (last date or id processed) | stored by the team in its registry, advanced only after the unit's deliverable is written |
| A durable record agents can query exactly | crew memory recalls by similarity, and only in a store the settings make durable; the checkpoint store and the run history are the runner's (`/state`, `/runs`: internal mounts no agent reads, refused as user mounts); state lives in files under a writable root of the team, read with `file_read` / `json_tool`, written by a deliverable or a tool |
| A lock between concurrent runs | two launches on the same registry folder race; run one at a time, or design the registry for it |
| A scheduler of Orkeon's own | `orkeon forge schedule <team-folder>` registers with the operating system, for the current user, the schedule a forge-adopted folder declares in its `forge.json` (a Windows task, a systemd user timer or a crontab line; `--check`, `forge unschedule`); a workshop team declares none (`FORGE-SCHEDULE-NONE`): schedule its launcher with the host's own scheduler. Each scheduled launch is a fresh process and a new run: the registry carries what is done |

## 6. Consequences for the design

1. **Resume and incremental processing are written into `TEAM.md § Need` and decided in `TEAM.md § Design`**, built in
   their own batch (typically `B4`, `process/workflow.md` § 5), proven by invariants: `INV-RESUME`,
   `INV-INCR`, `INV-IDEMP` (`testing/invariants-catalog.md`).
2. **State goes under a dedicated writable root** — `/registry` (`rw`, role `state`) in `mounts.json` — never mixed with the
   deliverables (`INV-FS`) and never in Orkeon memory. Not `/state` nor `/runs`: since rc.7 they are the runner's, and
   `orkeon run` refuses a mount so named.
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
7. **A new launch starts from nothing Orkeon kept**: the first task reads the registry, the last one updates
   it. `--resume` is a second net for a run that failed between tasks, not the design: the registry must make a plain
   relaunch correct, since a resumed task that had not completed runs whole again. Test it the way the bench does: stop the run after task *k* with SIGTERM (exit 2, `crew_cancelled`), relaunch,
   compare the registry and the deliverables; then a run on dataset v1 followed by v1 + delta.

## 7. Checks

```bash
grep -n -E 'memory|memoryProvider' teams/<slug>/crew/config.yaml   # if present: TEAM.md § Design says why and where it is stored; no resume or incremental rule relies on it
grep -rn -E 'memory_store|semantic_search|session_' teams/<slug>/crew/   # tools that keep nothing a program can check across runs
orkeon run --help | grep -c -- --resume                              # 1 or more since rc.7; it needs Orkeon:Checkpointing:Enabled=true
orkeon settings Orkeon:Checkpointing                                 # the keys and defaults (Enabled false, Store Memory)
```
