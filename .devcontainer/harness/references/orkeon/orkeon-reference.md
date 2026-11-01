# Orkeon — reference for designing an agent team

> Reference document of the Orkeon harness — single copy, deployed to the workshop's `references/orkeon/`
> and read from there by the `orkeon-crew` skill (`--format yaml|ts`) (the
> per-skill copies and `check-skill-shared-refs.sh` are gone).
> Established on Orkeon main at c727c06 (2026-11-01, rc.6; `1.0.0-rc.6.src.20261101.gc727c06`, the
> version the image builds, D32; first written on `1.0.0-rc.4`), from the code — the stub runs of the binary
> behind it date from 24ab0d0, except the ones `VERIFICATIONS.md` marks fb26364 (V-01, V-06, V-14), 77ac8a9, 80fdefe, 812cd10, bd3420c or ce9ec1f (V-01, V-06), and the tool dump and decision checks of e44df3f (V-47), the prompt-cache checks of f80665f (V-48), the `grep` checks of 8f4de67 (V-52), the `session_store` checks of 151a762 (V-53) and the checks of c727c06 (V-54). When in doubt,
> the binary is authoritative: `orkeon run --list-tools`, then `./run.sh --validate`.
> Sources: at that commit — `docs/tools/inventory.md`, `docs/orchestration/process-types.md`,
> `docs/reference/limitations.md`, `docs/architecture/yaml-schema.md`, `docs/architecture/memory-system.md`,
> `docs/architecture/rag-pipeline.md`, `docs/architecture/security.md`, `docs/reference/scripting-dsl.md`,
> `docs/reference/configuration.md`, and the classes named below.

## 1. What an Orkeon team is

A **crew** = **agents** (role, goal, backstory, tools) + **tasks** (description,
expected output, assigned agent, dependencies) + an **orchestration mode** (`process`).
It runs with `orkeon run <target>`; Orkeon Studio merely launches that same binary
(`orkeon run <target> --events jsonl …`) with the team's mounts and model profile.

Two ways to write it, which lead to the **same engine** (the same `CrewConfiguration`, the same
tool catalogue, the same validation):

| | YAML (`crew/config.yaml` + `agents/` + `tasks/`) | Declarative TypeScript (`crew/crew.ork.ts`) |
|---|---|---|
| Built-in tools by name | ✅ | ✅ |
| Custom tools written in the team | ❌ — a C# plugin launched by `orkeon-harness-run` (`csharp-tools.md`); the tools of an MCP server declared in the settings (`MCP:Servers`) can be named, but they belong to the machine, not to the team (§ 5) | ✅ `toolBuilder()` |
| Conditional logic at build time, reuse | ❌ (only anchors, `anchors:`) | ✅ (it is code) |
| Agent and task `guardrails`, task `llmOverride` (temperature, `maxTokens`, `thinking`), `graphConfig`, `knowledge`, `memoryProvider` | ✅ | ❌ (not exposed by the DSL; an agent's `.llm(...)` carries temperature and `maxTokens`, a task only its response format and profile — `typescript-dsl.md`) |
| `managerAgent`, `memory`, `planning`, `asyncExecution`, `deliverable`, dependencies, agent `llm`, task `tools`, agent and crew `maxRpm`, agent `maxExecutionTime` | ✅ | ✅ |

At 151a762 every key the loader reads reaches the engine, an agent's and the crew's `maxRpm` included
(§ 3), an agent's `maxExecutionTime`, read since f59446b (an ignored unknown key before), and a task's
`llmOverride.cache`, read since 13461ea (dropped at load before). The keys dropped at 24ab0d0 — an agent's or the crew's `llm`, an agent's `guardrails`, a task's
`tools`, `.llm(…)` and a task's `.tools([...])` in TypeScript — are applied; `circuitBreaker` and
`.withTaskTool(…)` are gone (the first fails the load). A task's `context` mapping reaches only the
manager (§ 4). `--validate` now refuses what it used to let through: a reference that names nothing, a
`managerAgent` or an `asyncExecution` the mode does not take, an unknown guardrails preset, LLM profile
or `memoryProvider`, a `maxRpm` or `maxIter` of 0 or less, a `maxExecutionTime` out of range or on a
hierarchical manager, and since 13461ea a `maxTokens` of 0 or less in an `llm` or `llmOverride` block (§ 9).

## 2. Orchestration modes (`process`)

Values (case-insensitive in YAML, lower case exactly in TypeScript): `sequential` (default) ·
`hierarchical` · `parallel` · `consensual` · `graph` · `autonomous`. Unknown value ⇒ error at load time.

| Mode | Principle | When to choose it | Constraints |
|---|---|---|---|
| `sequential` | Tasks run one by one, in topological order over `dependencies`; a task with `asyncExecution: true` runs alongside the next ones | Research → analysis → writing pipeline; sensible default | — |
| `hierarchical` | A manager assigns each task, then reviews the result | Controlled quality, proofreading | **Required**: `managerAgent: <id>` (YAML) / `.manager(agent)` (TS), or validation fails. The assignment and the review use Orkeon's built-in prompts on the manager agent's `llm` profile and model: its `goal` and `backstory` never reach the model, and a task's `agent:` is not followed. Three rejections fail the task. Manager calls are counted (`operation: manager`) |
| `parallel` | Independent tasks launched in concurrent waves; a task that depends on others waits for its wave | Fan-out (one analysis per market/source) then synthesis | Cost = N calls, latency = max; no concurrency cap inside a wave |
| `consensual` | Every agent runs each task, then every agent ranks the others' anonymised answers | Several independent attempts worth their cost | Needs three agents or more (two always tie); per round N executions + N ballots, up to 3 rounds, then the last count's leader (`AcceptBestScore`, nothing re-run) |
| `graph` | Fixed loop `execute_task → route`; a failed task is retried before the next one | Bounded retries of a flaky step | Tuned by `graphConfig` (YAML); not a graph drawn by the user. Without explicit bounds the visits are computed from the crew (tasks × (1 + `maxRetryCycles`)) and the duration is the preset's: 10 minutes under `strict`, the default — a local model's call may take up to 600 s: raise `graphConfig.maxTotalDurationSeconds` (or `circuitBreakerPreset`), and prove it with a stub run |
| `autonomous` | The manager LLM (default profile) assigns each task; a failed agent delegates to a peer; 5-dimension budget | Exploration, R&D, ill-defined problem | The least predictable; an exhausted budget fails the run. Since e44df3f the crew's `budget:` (YAML) / `.budget({...})` (TS) sets it — `tokens`, `wallTimeSeconds` (none by default), `toolCalls` (50), `delegationDepth` (4), `spawnedAgents` (10); any other process refuses a `budget` at load (#218) |

In **every** mode a failed task fails the run (exit 2) and its dependents are skipped (`task.completed`
with `skipped: true`); the other tasks still run, and the error names every failed and skipped task (there
is no `task.failed` event, `cli.md` § 3). Sources: `SequentialCrewOrchestrator` (which dispatches every
mode), `CrewRunOutcome`, the six `*ProcessStrategy` classes, `ConsensualProcessStrategy`,
`ManagerLlmResolver`, `CircuitBreakerPolicy` (main); `process-types.md` and `limitations.md` of the Orkeon
docs agree.

`planning: true` (YAML) / `.planning(true)` (TS), in any mode: one call on the host's default profile before
the first task writes a plan per task, which that task reads in its prompt; the order and the agents do not
change.

Default: `sequential`. Choose another mode only if the need calls for it.

## 3. Agents

| Field | Purpose | Default |
|---|---|---|
| `role` | The agent's job — it is prompt text | the id (YAML); required in TS |
| `goal` | Its own objective (**required**) | — |
| `backstory` | Experience, style, what it refuses to do — it is prompt text | empty |
| `tools` | Tool names from the catalogue (§ 5) | none |
| `allowDelegation` | Adds `ask_question_to_coworker` and `delegate_work_to_coworker` under `sequential` and `graph`; lets an `autonomous` agent delegate after a failure | **`true` in YAML**, `false` in TS |
| `maxIter` (YAML) / `maxIterations` (TS) | Max LLM ⇄ tool iterations; 0 or less fails the load | 20 |
| `maxRpm` (YAML; also a crew key of `config.yaml`) / `.maxRpm(n)` (TS, agent and crew) | At most *n* model requests per minute — for the agent; on the crew, for all its agents and its manager together. One more **waits** its turn: it never fails the task. `RateLimiting:AgentRequestsPerMinute` of the settings (20) bounds each agent too, the stricter of the two winning. 0 or less fails the load (`design/sizing-and-cost.md` § 1) | none |
| `maxExecutionTime` (YAML, whole seconds; `max_execution_time` accepted) / `.maxExecutionTime(s)` (TS) | The longest a task may take on this agent: past it the task stops, at the latest at the end of the call in progress, and **fails** (`ExecutionTimeExceeded`, `Agent exceeded its maximum execution time of Ns`), so the run fails as on any failed task. The wait for a human input does not count. 0 or less, a decimal, above 4294967 or on a `hierarchical` manager fails the load (TS: `build()` throws); a procedural script ignores it with a warning. Since f59446b | none |
| `workingRoot` (YAML, `working_root` accepted) / `.workingRoot(path)` (TS) | A virtual path under a mount that confines the agent's file tools and `shell_command` to it, and where `shell_command` runs without `working_directory`; a run whose root no mount holds is refused at start, naming it. Since e44df3f (#186) | none |
| `verbose` (agent; also a crew key, for all its agents) | The agent's turns — tool calls, tool results, model answers, the `maxRpm` wait — at Information under the category `Orkeon.Verbose`, which `orkeon run` shows at `-v 0` and `-v 1` unless `Logging:LogLevel` names `Orkeon.Verbose` or `Default` (since f59446b; `cli.md` § 1) | `false` |
| `llm` (YAML; the crew's `llm` merged under it) / `.llm(cfg)` (TS) | Applied to every call of the agent: temperature, `maxTokens`, `topP`, `thinking`, response format, cache, a host `profile`, a `model` (§ 7) | the run's profile |
| `guardrails` | Rules in the agent's system prompt, before its task's (§ 8) — YAML only | — |

Best practices:
- One agent = one competency. 2 to 5 agents are almost always enough.
- Concrete, domain-specific `role`/`goal`/`backstory`: they are the system prompts.
- Give an agent **only** the tools it needs. A writer often needs no tool at all
  if a `deliverable` writes its result.
- Set `allowDelegation: false` unless delegation is wanted: under `sequential` and `graph` an agent left
  at the YAML default gets the coworker tools, can subcontract, and the cost explodes.
- `maxIter` counts LLM ⇄ tool rounds (one round can call several tools): 4–6 for an agent
  without tools, 8–12 for a web researcher, about 2 × N + 5 for an agent that processes N files one by one.
  An agent whose rounds all go to tool calls still gets one tool-free turn asking for its final answer
  (since 23f4eae the text written beside its last tool call is never taken as that answer; before, it
  was, and the task failed `MaxIterationsReached` with that preamble as output — `resume-and-memory.md` § 3).

## 4. Tasks

| Field | Purpose |
|---|---|
| `description` | What to do (**required**) — precise, with the virtual paths to read |
| `expectedOutput` | Exact shape of the result (**required**) — format, length, sections |
| `agent` | Id of the assigned agent |
| `dependencies` (YAML) / `.withContext(t)` (TS) | Prerequisite tasks: they run before, and the task is skipped when one failed. Declare every task whose result a task needs — but each task receives the outputs of **all** earlier tasks, not only of its dependencies, capped at **8,000 characters in total** (`AgentPromptComposer`): keep outputs short, and pass a large result through a file |
| `asyncExecution` | `sequential` only: the task runs alongside the next ones; a dependant waits for it (refused by the modes that order tasks themselves) |
| `llmOverride` | Temperature, `maxTokens`, `topP`, `thinking`, `responseFormat`, `cache` (since 13461ea), a `profile` for this task, over the agent's `llm` (§ 7) |
| `guardrails` | Rules for this task, injected into the prompt after the agent's (§ 8) |
| `tools` | Tools **added** to the agent's for this task only (`TaskToolbelt`), resolved strictly like the agent's |
| `context` | A mapping of side data. It reaches only the manager's assignment prompt in `hierarchical` and `autonomous`, **never the worker**: write what the agent needs in the description |
| `humanInput` | Gives the agent the `human_input` tool for this task. Under `--events` (Studio) the question goes on the event stream and the run waits for the answer; without `--events` the call is **approved automatically** |
| `deliverable` | The **framework** writes the result to a file — the agent does not touch the disk |
| `decision` | Since e44df3f (#234): a **decision task** — no `agent:` (both together fail the load), no LLM call; its `questions` (each a `choice`, a `score` or a yes-no) go in one request to the host's active decision provider (since 0ea39d9 TypeSafe or Liquid, paid remote endpoints, or Kev, local; `orkeon/llm-profiles.md` § 3), and its output is the answers; an answer outside the options fails the task without retry. A crew of decision tasks only is still refused at load, `At least one agent is required.` (V-54). Without a decision model, with `Orkeon:Decision:Enabled: false` or under `orkeon run --no-decision`, it answers by its `fallback` without a request (`defaulted`); a run with the circuit off is refused before its first task when a decision task has neither a `fallback` nor an `otherwise` task. `sequential`, `parallel` and `graph` only |
| `when` | Runs the task only when one decision task answered as written (`<task>.<question>: [options]`, a quoted threshold `">= 0.7"`, or `<task>: otherwise`); the decision task is added to its `dependencies`. A condition that does not hold **skips** the task, and the crew still succeeds |

`deliverable`:
```yaml
deliverable:
  path: /output/report.md        # under a writable mount point of the team (/output here)
  source: final_message          # final_message | structured_output | tool_call | none
  format: markdown               # markdown | json | text
```
- `final_message`: the agent's last message becomes the file — **the default choice**.
- `structured_output`: the model's JSON output; **requires** `schemaPath` or `schemaInline` (otherwise
  validation fails). The schema is also sent as a non-strict `json_schema` response format to a provider
  that declares one (a GBNF grammar only where `Llm:Grammar` is on); an explicit `responseFormat` wins.
- `tool_call`: the agent writes the file itself with `file_write` — avoid it. It is the value used when
  `source` is omitted, in YAML and in TS at run time (the TS typings make `source` required, so `tsc` catches
  the omission).
- `schemaPath` / `schemaInline` (JSON string) are **not** a validation: only `schemaInline`'s required keys
  are looked at, and a partial JSON is still written (`{"title": "x"}` for a schema requiring `title` and
  `items`). A deliverable that cannot be written — a path under a read-only root — does not fail the task
  either. The tests check the deliverables (`INV-SCHEMA`), never the exit code alone.
- A Markdown preamble around a JSON answer is stripped before the file is written.

## 5. Tool catalogue

The tables below were generated on 2026-10-03 from the schemas `orkeon run` sends to the model, on Orkeon
`main` at a2bb6c3, with `orkeon-bench tools dump` — a stub LLM recorded the `tools[]` of a request made by
an agent that lists every tool of `orkeon run --list-tools` —, generated again on 2026-10-06 on `main`
at fb26364 (the same 83 names, descriptions and arguments), on 2026-10-07 at 77ac8a9 (the same 83 names
and arguments, and three descriptions that say more — `email_folders`, `email_search`, `email_delete`),
on 2026-10-07 at 80fdefe (`1.0.0-rc.4.src.20261007.g80fdefe`) on 2026-10-08 at 812cd10 (`1.0.0-rc.4.src.20261008.g812cd10`) and at bd3420c
(`1.0.0-rc.4.src.20261009.gce9ec1f`), and on 2026-10-10 at ce9ec1f (`1.0.0-rc.4.src.20261009.gce9ec1f`): nothing differs
(`.claude/harness/VERIFICATIONS.md`, V-06); c39c5fa (`1.0.0-rc.4.src.20261011.gc39c5fa`) changes no source file, so its catalogue is the one of ce9ec1f; ad6dc63 (`1.0.0-rc.4.src.20261011.gad6dc63`, LLM-13) changes the schema of five tools of the event bus — the free `payload` of `publish_event`, `post_message`, `send_request` and `reply_to` (`JsonNode`) is sent without a `type` instead of `"type":"any"`, and the `metadata` dictionaries and the `metadata_match` of `wait_for_event` (`ImmutableDictionary<string, string>`) as `{"type":"object","additionalProperties":{"type":"string"}}` instead of an array — and no name, description, argument name or required flag (read in `src/tools/Orkeon.Tools.EventHub/Dtos/` and `ToolSchemaGenerator.cs` at ad6dc63; the dump itself is regenerated at the image build, V-32); 5668c54 (`1.0.0-rc.4.src.20261012.g5668c54`) changes no tool contract: the same 83 names from `orkeon run --list-tools`, and no `[ToolContract]` description or request class differs between ad6dc63 and 5668c54 (`git diff --stat`; `EmailAccountsTool.cs` only hides the account's address inside a forge mail trial); f59446b (`1.0.0-rc.5.src.20261014.gf59446b`) changes none either: under `src/tools/` only the `PublicAPI.*.txt` files the rc.5 freeze moves differ, and `orkeon run --list-tools` on a build of f59446b prints the same 83 names, byte for byte (V-38); 13461ea (`1.0.0-rc.5.src.20261018.g13461ea`) adds the eleven `drive_*` tools of the new `Orkeon.Tools.Drive` family (ADR-013) and changes no other tool name, description or argument name (only the field description of `shell_command`'s `working_directory`, which now defaults to the first mount the command may use) — the Drive table below is written from their `[ToolContract]` descriptions and request classes (`src/tools/Orkeon.Tools.Drive/Tools/`, `Dtos/`), not yet from a dump; 63be532 (`1.0.0-rc.5.src.20261018.g63be532`) changes no tool name, description or argument (`shell_command`'s `[ToolContract]` and `ShellCommandRequest` are unchanged; only how its process runs changes, `reliability/security.md` § 7); e258730 (`1.0.0-rc.5.src.20261018.ge258730`) changes none either — under `src/tools/` only `web_scrape`, `scrape_element` and `rag_search` declare `ToolAccess.Read` and `rag_ingest` `ToolAccess.Edit`, read by the scripting permission gate, never sent to the model (`reliability/security.md` § 3); acd59d6 (`1.0.0-rc.5.src.20261020.gacd59d6`) changes none: it adds a verb, `orkeon quickstart`, and nothing under `src/tools/`; `orkeon run --list-tools` prints the same 94 names; e44df3f (`1.0.0-rc.6.src.20261030.ge44df3f`), dumped again on 2026-10-30 on a local build of the commit (V-47), adds sixteen tools — `glob`, `grep` and `edit_file` with the file tools, `node_read`, `node_outline`, `node_replace`, `node_insert`, `node_ensure`, `edit_batch`, `structural_search`, `structural_rewrite`, `access_cost`, `affected_tests`, `batch_anchors`, `documented_in` and `documents_of` with the code-analysis tools (Orkeon #180, #195, #210) — and new arguments for `file_read` (`offset`, `limit`), `github` (`base`, `head`, for `create_pr`), `shell_command` (`action`, `job_id`, `tail_lines`), `human_input` (`recommended`) and `rag_ingest` (`prune`), a `[FieldSchema]` on the `edge_kinds` and `node_kinds` of `dependency_graph` and `sub_graph`, and longer descriptions for `github`, `index_codebase`, `incremental_reindex` and `token_budget`. That dump leaves out the `drive_*` and `email_*` tools: the rights checks of the start refuse a crew that names a drive or mailbox tool no ready account grants (`DriveRightsCheck` since 13461ea), so `orkeon-bench tools dump` fails on a bare configuration; their tables are written from their `[ToolContract]` descriptions and request classes; 8f4de67 (`1.0.0-rc.6.src.20261031.g8f4de67`, V-52) changes `grep` only — the `output_mode` argument (`hits` by default, or `count`) and the `total_matches`, `files_matched`, `scan_complete` and `counts` return fields, and a new description (Orkeon #260, read in `GrepTool.cs` at d6fd816) — and no other tool name, description or argument. 151a762 (`1.0.0-rc.6.src.20261031.g151a762`, V-53) changes `session_store` only — `get_state` reads several keys (`keys`, answered in `values`, one entry per set key, an unset key absent), `set_state` writes several (`values`, a `{key: value}` object) and removes several (`keys`), a new `append_message` operation (`role`, `content`, optional `timestamp`) appends one message without returning or rewriting the buffer, and a new description (Orkeon #263, read in `SessionStoreTool.cs` at 151a762) — and no other tool name, description or argument: the same 110 tools. c727c06 (`1.0.0-rc.6.src.20261101.gc727c06`, V-54) adds no tool and renames none — `orkeon run --list-tools` prints the same 110 names, 111 with a decision provider active (`system_one_decide`) — and changes `grep`'s `output_mode` field description (the `hits` scan is not stopped by `max_results`) and `scan_complete` return description (false when a file over 1 MiB was left unread), `truncated` now also true when count mode cuts its counts, and `session_store`'s access per operation (no wire change); these rows were edited from the sources (`docs/tools/inventory.md`, `Typings/tools.generated.d.ts`, `GrepTool.cs`, `SessionStoreTool.cs` at c727c06), not regenerated: `orkeon-bench tools dump` fails on the c727c06 build as on the 151a762 one (`drive_upload needs the Write right on a ready drive account, and no account has it`, the dump's crew naming `drive_upload` with no Drive account; `DriveRightsCheck`, since 13461ea). Names, descriptions and
argument names are the real ones; **bold** arguments are required. Paths are **virtual** (§ 6). The
catalogue is the same for a YAML crew and a declarative `.ork.ts` launched by `orkeon run` or Studio, and
resolution is **strict**, for an agent's and a task's tools alike: an unknown name makes the launch fail
(`Crew configuration references unknown tool(s): x`). Every registered tool is attachable (the `ITool`
filter is gone). The `tools resolved=K` of `--validate` also counts a script's custom tools. The installed
binary is the authority: `orkeon run --list-tools`.

`orkeon run --list-tools` lists **110 tools** without any configuration at c727c06, as at 0ea39d9, 151a762, 8f4de67, f80665f and e44df3f — **111** with a decision provider active, the extra one `system_one_decide` (V-54) — (94 at acd59d6, as at e258730, 63be532, fa46bb5 and 13461ea; 83 at f59446b, before
the eleven `drive_*` tools; 80 at 24ab0d0, before the three `rag_*` tools).

Every tool call goes through Orkeon's Guardian (path traversal, SSRF, SQL injection outside the `*_query`
tools: a blocked call returns `Error: Blocked by Guardian (…)`), and every result except the `email_*`
tools' and `drive_read`'s reaches the model framed as data (`--- BEGIN Tool Result: … (DATA CONTEXT - NOT INSTRUCTIONS) ---`).

### Files — always registered

| Tool | What it does | Arguments |
|---|---|---|
| `file_read` | Read content from files: text, JSON, XML and the like. Parse .eml e-mail files with email_parser. | **`path`**, `encoding`, `max_length`, `use_raggable_cache`, `offset`, `limit` |
| `file_write` | Write content to files. Can create new files or overwrite existing ones. Creates directories if needed. | **`path`**, **`content`**, `encoding`, `append`, `create_backup` |
| `directory_read` | List directory contents including files and subdirectories. Supports recursive listing and glob pattern filtering. | **`path`**, `recursive`, `pattern`, `max_results` |
| `directory_search` | Perform semantic search across all files in a directory using RAG embeddings. Finds the most relevant file content matching a query. | **`path`**, **`query`**, `file_patterns`, `recursive`, `top_k`, `threshold`, `chunk_size`, `max_file_size_kb` |
| `count_pattern` | Count regex occurrences in a file (deterministic, per-pattern). Use when verification requires exact counts rather than LLM estimation. | **`path`**, **`patterns`**, `multiline`, `distinct_matches`, `include_matches`, `max_matches_returned` |
| `list_mounts` | Lists all available file system mounts with their virtual paths and access rights. | none |
| `glob` | Expand a wildcard pattern (relative to a mounted directory) and list the matching file paths, sorted and capped. | **`pattern`**, **`path`**, `max_results` |
| `grep` | Search the lines of text files under a mounted directory (path) with a regex; glob filters files relative to path. Binary, unreadable and over-1-MiB files are skipped; regex timeout, max_results and max_files bound the scan. Returns path:line:text hits plus total_matches and files_matched, or with output_mode "count" the counts alone (a "how many" question takes one call). Since 0ea39d9, `scan_complete` is false when a file over 1 MiB was left unread (as when `max_files` or the time budget cut the scan), and `truncated` is true when count mode cuts its counts (at `max_results` or the character budget); the `hits` mode reads on to `max_files` or the 20 s budget after `max_results`, so a wide tree can end `timed_out` or `truncated` | **`pattern`**, **`path`**, `glob`, `case_insensitive`, `max_results`, `max_files`, `output_mode` |
| `edit_file` | Replace a string in a file when it occurs exactly once. | **`path`**, **`old_string`**, **`new_string`**, `replace_all`, `create_backup` |

### Documents — always registered

| Tool | What it does | Arguments |
|---|---|---|
| `csv_reader` | Read CSV files and return structured data. Supports custom delimiters and header detection. | **`path`**, `has_header`, `delimiter`, `max_rows` |
| `pdf_reader` | Extract text content from PDF files. Supports page range selection. | **`path`**, `page_range` |
| `docx_reader` | Read DOCX (Word) files and return structured data including text, tables, and metadata. | **`file_path`**, `include_tables`, `include_metadata` |
| `docx_writer` | Create DOCX (Word) files with title, paragraphs, and bullet lists. | **`file_path`**, `title`, **`paragraphs`**, `bullet_items` |
| `xlsx_reader` | Read Excel (.xlsx) files and return structured data including sheets, rows, columns, and metadata. | **`file_path`**, `sheet_name`, `include_metadata`, `has_header_row` |
| `xlsx_writer` | Create or update Excel (.xlsx) files with structured data including multiple sheets, headers, and rows. | **`file_path`**, **`sheets`**, `append_to_existing` |
| `json_tool` | JSON manipulation tool supporting parse, query, and format operations. | **`input`**, **`operation`**, `query` |
| `xml_parser` | Parse XML data from files or strings with XPath query support. | **`input`**, `xpath`, `operation` |
| `txt_search` | Perform semantic search within plain text (.txt) files using RAG embeddings. | **`path`**, **`query`**, `top_k`, `threshold`, `chunk_size` |
| `mdx_search` | Perform semantic search within Markdown (.md, .mdx) files using RAG embeddings. Strips frontmatter and JSX before searching. | **`path`**, **`query`**, `top_k`, `threshold`, `chunk_size` |
| `pdf_search` | Perform semantic search within PDF documents using RAG embeddings. | **`path`**, **`query`**, `page_range`, `top_k`, `threshold`, `chunk_size` |

### Databases — the connection string is a call argument: the agent must be given it, never a secret

| Tool | What it does | Arguments |
|---|---|---|
| `relational_database_query` | Execute SQL queries on relational databases (SQL Server, PostgreSQL, MySQL, MariaDB, SQLite) | **`connection_string`**, **`provider_name`**, **`query`**, `query_type`, `parameters`, `max_rows`, `timeout_seconds` |
| `sqlserver_query` | Execute SQL queries on Microsoft SQL Server databases | **`connection_string`**, **`provider_name`**, **`query`**, `query_type`, `parameters`, `max_rows`, `timeout_seconds` |
| `postgres_query` | Execute SQL queries on PostgreSQL databases | **`connection_string`**, **`provider_name`**, **`query`**, `query_type`, `parameters`, `max_rows`, `timeout_seconds` |
| `mysql_query` | Execute SQL queries on MySQL databases | **`connection_string`**, **`provider_name`**, **`query`**, `query_type`, `parameters`, `max_rows`, `timeout_seconds` |
| `mariadb_query` | Execute SQL queries on MariaDB databases | **`connection_string`**, **`provider_name`**, **`query`**, `query_type`, `parameters`, `max_rows`, `timeout_seconds` |
| `database_schema` | Inspect database schema (tables, columns, indexes, foreign keys) | **`connection_string`**, **`provider_name`**, `schema_scope`, `table_filter` |
| `mongodb_query` | Execute operations on MongoDB databases (Find, Aggregate, CRUD) | **`connection_string`**, **`database`**, **`collection`**, **`operation`**, `filter`, `projection`, `pipeline`, `document`, `update`, `sort`, `limit`, `skip` |
| `mongodb_schema` | Inspect MongoDB database schema by sampling documents | **`connection_string`**, **`database`**, `collection`, `sample_size` |
| `arcadedb_query` | Execute Cypher or SQL queries on ArcadeDB via Bolt protocol | **`bolt_uri`**, **`database`**, `username`, `password`, **`query`**, `parameters`, `query_language`, `max_results` |
| `janusgraph_query` | Execute Gremlin traversals on JanusGraph databases | **`gremlin_endpoint`**, **`traversal`**, `bindings`, `max_results`, `timeout_ms` |
| `graph_schema` | Inspect graph database schema (vertex labels, edge labels, properties, indexes) | **`endpoint`**, **`graph_type`**, `database`, `username`, `password` |

### Web — `web_search` needs a Tavily key (`ORKEON_TAVILY_API_KEY`); the firewall must allow the hosts reached

| Tool | What it does | Arguments |
|---|---|---|
| `web_search` | Search the web using the Tavily Search API. Returns relevant results with titles, URLs, content snippets, and scores. | **`query`**, `max_results`, `search_depth` |
| `web_scrape` | Scrape a web page. cached=false returns full text; cached=true chunks+embeds+stores the page in the RAG cache and returns only a short summary (use cache_search to retrieve chunks). | **`url`**, `selector`, `cached`, `chunk_size` |
| `scrape_element` | Extract targeted elements from a web page using CSS selectors. Returns text, optional HTML, and attributes for matched elements. | **`url`**, **`css_selector`**, `extract_attributes`, `include_html`, `max_elements` |
| `cache_search` | Semantic search over content previously stored in the RAG cache (e.g. by web_scrape with cached=true). source filter scopes by producing tool; url_filter scopes by URL substring; both are optional — empty means global search. | **`query`**, `source`, `url_filter`, `top_k`, `min_score` |
| `http_api` | Make HTTP API calls with support for GET, POST, PUT, DELETE, PATCH methods. Returns response body, status code, and headers. | **`url`**, `method`, `headers`, `body`, `content_type` |
| `github` | Interact with GitHub API v3: list/create issues, create/read PRs, search repos. create_pr (base, head, title, optional body) needs a token with pull-request write scope. No token is configured: write operations (create_issue, create_pr) need one. It is read from the setting Orkeon:Tools:GitHub:Token, then the environment variable named by Orkeon:Tools:GitHub:TokenVariable (default GITHUB_TOKEN), then GH_TOKEN. | **`action`**, `owner`, `repo`, `number`, `title`, `body`, `base`, `head`, `query` |
| `image_generation` | Generate images using OpenAI DALL-E API. Supports text-to-image generation with configurable size, quality, and format. | **`prompt`**, `model`, `size`, `quality`, `number_of_images`, `response_format`, `save_to_path` |

### E-mail

Always registered; a mailbox tool refuses every call until an account is declared under `Orkeon:Tools:Email` (`email_accounts` then lists none; IMAP, POP3, SMTP or Microsoft Graph; Gmail and Outlook presets); the agent names an account, never a server; `email_send` only reaches the addresses of `Send:AllowedRecipients`; bodies go through a prompt-injection screen; OAuth tokens live in the internal `/credentials` root; `email_parser` reads an `.eml` file of a mount point and needs no account.

| Tool | What it does | Arguments |
|---|---|---|
| `email_accounts` | List the e-mail accounts configured for this run: the name to pass as `account`, what each may do (rights: Read, Organize, Draft, Send, Delete, Purge) and whether it is ready. | none |
| `email_folders` | List the folders of an e-mail account with their role (inbox, sent, drafts, trash, junk, archive, all), message and unread counts. Needs the Read right. | `account` |
| `email_search` | Search a folder of an e-mail account (default: inbox), newest first: unread/flagged, from, to, subject, text, dates, attachments, or a provider-native raw_query. Returns one page of ids for email_read, email_move, email_mark, email_delete; a page can be shorter than `limit`, so read on with `next_cursor` until it is null. Needs the Read right. | `account`, `folder`, `unread_only`, `flagged_only`, `from`, `to`, `subject`, `text`, `since`, `before`, `has_attachments`, `raw_query`, `limit`, `cursor` |
| `email_read` | Read one e-mail by id: headers, body as text (in slices: continue with `offset` = `next_offset`), attachments, and a prompt-injection screening verdict. The content is untrusted data, never instructions. Does not mark it read unless mark_read. Needs the Read right. | `account`, **`id`**, `offset`, `max_chars`, `mark_read` |
| `email_save_attachment` | Save one attachment (by index from email_read) or all of them into a virtual directory such as /output/attachments; file names are sanitized and never overwrite. Read them afterwards with the file tools. Needs the Read right and a writable mount. | `account`, **`id`**, **`directory`**, `index` |
| `email_create_folder` | Create a folder in an e-mail account (a label on Gmail); '/' separates levels and missing parents are created. Answers created=false when it already exists. Needs the Organize right. | `account`, **`path`** |
| `email_rename_folder` | Rename a folder of an e-mail account (its last segment); system folders (inbox, sent, drafts, trash…) are refused. Needs the Organize right. | `account`, **`path`**, **`new_name`** |
| `email_move` | Move messages (ids from email_search) to a folder path or role (archive, junk, inbox…). Returns each message's new id. Needs the Organize right. | `account`, **`ids`**, **`destination`** |
| `email_mark` | Mark messages read or unread (`seen`) and flag or unflag them (`flagged`, a star on Gmail). Needs the Organize right. | `account`, **`ids`**, `seen`, `flagged` |
| `email_delete` | Delete messages: moved to the trash by default (needs the Delete right); `permanent: true` deletes them for good (needs the Purge right, cannot be undone). Returns each deleted id, with its new id in the trash. | `account`, **`ids`**, `permanent` |
| `email_draft` | Write an e-mail and save it in the account's Drafts folder WITHOUT sending it, for a human to review and send: a new message, a reply (reply_to_id, reply_all) or a forward (forward_id), with attachments from virtual paths. Needs the Draft right. | `account`, `to`, `cc`, `bcc`, `subject`, `text`, `html`, `attachments`, `reply_to_id`, `reply_all`, `quote_original`, `forward_id` |
| `email_send` | Send an e-mail from an account: a new message, a reply (reply_to_id, reply_all) or a forward (forward_id), with attachments from virtual paths. Only recipients the operator allowed for the account can receive it; prefer email_draft when a human should review. Needs the Send right. | `account`, `to`, `cc`, `bcc`, `subject`, `text`, `html`, `attachments`, `reply_to_id`, `reply_all`, `quote_original`, `forward_id` |
| `email_parser` | Parse an .eml file (RFC 5322 message) from a virtual path: headers, body as text in slices (continue with `offset` = `next_offset`), attachments, and a prompt-injection screening verdict. Same output as email_read. | **`path`**, `offset`, `max_chars` |

### Drive

Always registered (13461ea, ADR-013); a drive tool refuses every call until an account is declared under `Orkeon:Tools:Drive` (`drive_accounts` then lists none; Google Drive through the Drive API v3, OneDrive — personal or for work — through Microsoft Graph); the agent names an account, never a client or a token; each account declares its `Rights` (mandatory: `Read`, `Write`, `Organize`, `Share`, `Delete`, `Purge`) and may be confined to a folder (`Root`: an item outside it is reported as not found); `drive_share` reaches only the addresses of `Share:AllowedRecipients` (empty: nobody) and creates a public link only with `Share:AllowPublicLinks`; a run whose crew names a drive tool that no ready account grants its right is refused at start (`DriveRightsCheck`); `drive_read` screens the text for prompt injection and frames it as untrusted itself; OAuth tokens live in the `drive` subdirectory of the internal `/credentials` root (`orkeon drive login`, `cli.md`). `orkeon forge` never puts a drive tool in a forged crew (`ForgeSandbox.DeniedTools`).

| Tool | What it does | Arguments |
|---|---|---|
| `drive_accounts` | List the cloud drive accounts (Google Drive, OneDrive) configured for this run: the name to pass as `account`, what each may do (rights: Read, Write, Organize, Share, Delete, Purge), the folder it is confined to and whether it is ready. | none |
| `drive_list` | List the files and folders of a cloud drive folder (the account's root folder by default), folders first, with their ids, types, sizes and dates; page with `cursor`. Needs the Read right. | `account`, `folder_id`, `limit`, `cursor` |
| `drive_search` | Search a cloud drive by words (names and content), name, MIME type, kind (file or folder), modification date or folder, inside the account's root folder; page with `cursor` (a page may come back short, even empty, while `next_cursor` is set: call again with it). OneDrive needs `text` or `name_contains`. Needs the Read right. | `account`, `text`, `name_contains`, `mime_type`, `kind`, `modified_after`, `folder_id`, `raw_query`, `limit`, `cursor` |
| `drive_info` | Read the metadata of one file or folder of a cloud drive: name, type, MIME type, size, date, parent and browser address. Needs the Read right. | `account`, **`id`** |
| `drive_read` | Read the text of a cloud drive file — a text file (txt, md, csv, json, xml, code...) or a Google Docs, Sheets or Slides file — screened for prompt injection, a slice at a time with `offset`. A PDF, an Office file or an image is downloaded with drive_download and read with the file tools. Needs the Read right. | `account`, **`id`**, `offset`, `max_chars` |
| `drive_download` | Download a cloud drive file into a virtual directory such as /output/downloads (a Google document is exported, to `format` or its default); the name is sanitized and never overwrites. Read it afterwards with the file tools. Needs the Read right and a writable mount. | `account`, **`id`**, **`directory`**, `format` |
| `drive_upload` | Upload a file of the virtual file system (e.g. /output/report.pdf) to a cloud drive folder (the account's root folder by default), or replace the content of an existing file with `replace_id`. A name already taken in the folder is refused. Needs the Write right. | `account`, **`path`**, `folder_id`, `name`, `replace_id` |
| `drive_create_folder` | Create a folder in a cloud drive folder (the account's root folder by default); a name already taken there is refused. Needs the Write right. | `account`, `parent_id`, **`name`** |
| `drive_move` | Move a cloud drive file or folder into another folder (`destination_id`), rename it (`new_name`), or both, inside the account's root folder. Needs the Organize right. | `account`, **`id`**, `destination_id`, `new_name` |
| `drive_delete` | Move a cloud drive file or folder to the trash (a person can restore it), or delete it for good with `permanent` (needs the Purge right). Needs the Delete right. | `account`, **`id`**, `permanent` |
| `drive_share` | Share a cloud drive file or folder with e-mail addresses (as reader or writer), each on the account's share allow-list, or create a link anyone can open when the account allows public links. Needs the Share right. | `account`, **`id`**, `recipients`, `role`, `public_link`, `notify`, `message` |

### Execution — keep it for technical teams

| Tool | What it does | Arguments |
|---|---|---|
| `shell_command` | Execute shell commands with security controls. Supports allowlist/blocklist, timeout, and output capture. | **`command`**, `working_directory`, `timeout_seconds`, `action`, `job_id`, `tail_lines` |

Since fa46bb5 (ADR-014) its commands run in one shell session per agent run, confined by default by the
operating system (`Orkeon:Tools:Shell:Confinement:Mode` `Auto`: bubblewrap, Seatbelt or an AppContainer; no
network) — except in a container, the workshop's included, where it runs unconfined (`reliability/security.md` § 7).

### Humans

Under `--events` the question goes on the event stream (Studio shows it) and the run waits for the answer; without `--events` the call is approved automatically.

| Tool | What it does | Arguments |
|---|---|---|
| `human_input` | Ask the human user for input (text, approval, or a choice). The runtime suspends until the user responds. | **`prompt`**, `input_type`, `choices`, `default_value`, `edit_file_path`, `recommended` |

### Session and memory

| Tool | What it does | Arguments |
|---|---|---|
| `memory_store` | List, add, delete, and get typed memory entries (user/project/feedback/reference). | none sent to the model ¹ — the tool reads `operation`, `category`, `content`, `id` |
| `semantic_search` | Perform semantic search using embeddings to find relevant information. | **`query`**, `top_k`, `threshold` |
| `local_embed_text` | Generate embeddings for one or more texts using the on-device BGE-micro-v2 model. | **`inputs`**, `requested_dimensions`, `model` |
| `session_store` | Read, write, append to, truncate, and annotate the current session conversation buffer and metadata; get_state reads one key or several (keys), set_state writes one (key, value) or several (values) and removes several (keys). | none sent to the model ¹ — the tool reads `operation` (`append_message` since 151a762), `messages`, `note`, `title`, `retain_count`, `key`, `value`, `keys`, `values`, `role`, `content`, `timestamp`; since 0ea39d9 a multi-key `set_state` is all or nothing, and a write is denied in `plan` mode (`orkeon/resume-and-memory.md` § 2.3) |
| `session_snip` | Immediately truncate the conversation to a minimal window without analysis. | none sent to the model ¹ — the tool reads `retain_count` |
| `session_stats` | Report full session telemetry: message count, estimated tokens, cost, and call totals. | none |
| `session_cost` | Report cumulative session cost in USD, token usage, and a per-model breakdown. | none |
| `token_budget` | Return the current model's context window size, used tokens (split by kind: system, user, assistant, tool, other), and available budget. | none |

### Event bus between agents and crews

| Tool | What it does | Arguments |
|---|---|---|
| `publish_event` | Publish an event on a topic (broadcast 1→N). Optional crew scope and metadata. | **`topic`**, `payload`, `target_crew_id`, `metadata`, `retain_as_last_value`, `last_value_key` |
| `post_message` | Fire-and-forget a message to a mailbox (agent://, crew://, topic://, or client://). | **`target_mailbox`**, `payload`, `metadata` |
| `send_request` | Send a request to a mailbox and wait for a correlated reply (timeout_ms required). | **`target_mailbox`**, `payload`, `timeout_ms`, `metadata` |
| `reply_to` | Reply to a pending request identified by correlation_id. | **`correlation_id`**, `payload` |
| `receive_message` | Pull the next message from a mailbox (default: current agent). Only mailboxes of the calling crew are readable — reading is destructive, and a mailbox belongs to its owner. Requires exactly one of timeout_ms / wait_forever. | `timeout_ms`, `wait_forever`, `mailbox` |
| `wait_for_event` | Wait for the next event on a topic. Requires exactly one of timeout_ms / wait_forever. | **`topic`**, `timeout_ms`, `wait_forever`, `metadata_match` |
| `get_last_value` | Read the last retained payload for a given key (LastValueCache). | **`key`**, `crew_scope` |

### Code analysis (RaggableTree) — index first (`index_codebase`), then query; registered unless `RaggableTree:Enabled` is `false`

| Tool | What it does | Arguments |
|---|---|---|
| `index_codebase` | Scan the codebase and build the full RaggableTree index, reusing the one saved by an earlier session when the host wires the cache. | none sent to the model ¹ — the tool reads `root_path`, `languages`, `exclude`, `enrich_with_llm`, `embedding_model`, `root_alias`, `respect_gitignore`, `max_parallelism`, `use_cache` |
| `incremental_reindex` | Reindex only files changed since a prior commit or from an explicit list. Cost is proportional to the changed files, not the repository: one file of 2 000 lines reindexes in under 2 s. | none sent to the model ¹ — the tool reads `root_path`, `changed_files`, `from_commit`, `to_commit`, `languages`, `enrich_with_llm` |
| `index_status` | List every virtual root currently indexed in the RaggableTree store. | none |
| `is_path_indexed` | Check whether a virtual path is covered by any indexed root (longest match wins). | none sent to the model ¹ — the tool reads `virtual_path` |
| `codebase_map` | Structural map of the codebase at a given zoom level (L0-L3). | none sent to the model ¹ — the tool reads `level`, `include_metrics`, `root_fqn`, `max_entries` |
| `package_summary` | Details about a package (L1): file count, symbol count, exports, dependencies. | none sent to the model ¹ — the tool reads `fqn`, `include_public_exports`, `include_dependencies`, `max_exports` |
| `symbol_detail` | Expanded detail for an L3 symbol: signature, doc, body metrics, members, callers, callees, statements. | none sent to the model ¹ — the tool reads `fqn`, `expand` (since c727c06 by name, #274: `members`, `callers, callees`…, `all`; a combination joined by `,` or `\|`; an unknown name is refused with the valid ones — it failed with a `JsonException`), `include_signature`, `include_doc`, `include_body_metrics`, `max_children` |
| `symbol_source` | Deterministic source citation for a symbol. Returns file path, lines, code, SHA-256, and stable flag. | none sent to the model ¹ — the tool reads `fqn`, `mode`, `max_lines`, `statement_id` |
| `codebase_search` | Hybrid (vector + BM25) search over the codebase. Returns ranked hits with FQN, score and match origin. | none sent to the model ¹ — the tool reads `query`, `levels`, `top_k`, `filter_kinds`, `filter_packages`, `filter_languages`, `min_score`, `include_signature`, `mode` |
| `dependency_graph` | Dependency graph at a given scope (L1 packages, L2 modules, L3 symbols). | `edge_kinds`, `node_kinds` (by name: `contains`, `calls`, `imports`, `inherits`, `tests`, `documents`, `project_depends`; `file`, `project`, `namespace`, `type`, `member`, `doc_section`, `test`), and since c727c06 `max_cycles` (20) and `max_cycle_members` (50); the tool also reads ¹ `scope`, `include_external`, `root_fqn`, `max_nodes`, `include_mermaid`, `include_dot`. Since c727c06 (#272, #274) it answers `cycles` — each cycle of the whole scope as `{ fqns, member_count, edge_kind }`, the largest first — and `cycles_truncated`; `edges[].kind` and `edge_kind` are names (`imports`, `imports, calls`), no longer numbers; an empty `edge_kinds` follows imports, for the cycles too |
| `sub_graph` | Sub-graph expansion around seeds, bounded by depth and node count. | `edge_kinds`, `node_kinds` (the names of `dependency_graph`); the tool also reads ¹ `seeds`, `depth`, `direction`, `max_nodes`, `include_mermaid`; `edges[].kind` is a name since c727c06 (#274) |
| `flow_trace` | Trace call flow from a symbol (optionally to a target) within a depth budget. | none sent to the model ¹ — the tool reads `from`, `to`, `direction`, `max_depth`, `edge_kinds`, `include_all_paths`, `max_paths` |
| `impact_analysis` | Who is affected if we change this symbol? Direct + transitive callers, grouped by package. | none sent to the model ¹ — the tool reads `target`, `direction`, `max_depth`, `max_nodes` |
| `complexity_report` | Top-N methods by complexity (Cyclomatic, NestingDepth, FanOut, LoC, Callers) with median and P95. | none sent to the model ¹ — the tool reads `root_fqn`, `top_n`, `metric` |
| `statement_query` | Query L4 statements by kind, parent FQN, or semantic similarity. | none sent to the model ¹ — the tool reads `parent_fqns`, `kinds`, `semantic_query`, `top_k` |
| `access_cost` | Port-access cost of members, mirroring the access-cost.py script. | none sent to the model ¹ — the tool reads `fqns`, `changed_files`, `receivers`, `roots` |
| `affected_tests` | Test projects and classes reached through the graph by changed files. | none sent to the model ¹ — the tool reads `changed_files`, `base` |
| `batch_anchors` | Closure of anchors (contains, callers, tests) and overlap of two anchor sets. | none sent to the model ¹ — the tool reads `action`, `fqns`, `files`, `a`, `b` |
| `documented_in` | Markdown sections that document a symbol. | none sent to the model ¹ — the tool reads `fqn` |
| `documents_of` | Symbols documented by the sections of a Markdown file. | none sent to the model ¹ — the tool reads `path` |

### Structural editing — registered with the code-analysis tools (unless `RaggableTree:Enabled` is `false`); tree-sitter grammars and Markdown, no index needed

| Tool | What it does | Arguments |
|---|---|---|
| `node_outline` | Outline of a file's members. | **`path`** |
| `node_read` | Reads one member of a file by selector: text, range and SHA-256, uncut. | **`path`**, **`selector`** |
| `node_replace` | Replaces one node of a file by selector and expected SHA-256 (from node_read): refused when the hash is stale or when the replacement introduces a parse error that was not there before; the file is then untouched. The replaced span includes the node's leading comments and attributes, so a replacement that omits them removes them; a Markdown section replaces its sub-sections too. Line endings are normalised to the file's. | **`path`**, **`selector`**, **`expected_hash`**, **`text`** |
| `node_insert` | Inserts text relative to an anchor node: position 'inside' appends to a type or namespace body (after the last member of an indented or end-closed body; an enum member or a JSON pair gets its separating comma) or to the end of a Markdown section, 'before' puts it above the anchor's leading comments and attributes, 'after' below the anchor. There is no expected_hash: no anchor hash is required for before/after, the anchor is only a location. The text is re-indented line by line to the siblings' indentation (tabs or spaces as the file does); the insert is refused when it introduces a parse error that was not there before, the file is then untouched. | **`path`**, **`selector`**, **`position`**, **`text`** |
| `node_ensure` | Applies one idempotent intent operation on one file: ensure_using / ensure_import (name, plus module for TypeScript or JavaScript) adds the using or import line in its place only when absent; ensure_field / ensure_member (selector of the type, text) adds a field, property or method next to its peers only when no member of that name exists. On Markdown: ensure_section (name = heading path, optional level) creates the missing headings; insert_under_heading (selector, text) appends at the end of a section; replace_mermaid (selector, index 0-based, text) replaces the body of the n-th mermaid fence of a section. Calling it again changes nothing and writes nothing: applied is false and range is the existing line or member. The insert is refused when it introduces a parse error that was not there before, the file is then untouched. | **`op`**, **`path`**, `selector`, `name`, `module`, `text`, `index`, `level` |
| `edit_batch` | Applies node_replace, node_insert and idempotent intent operations over several files as one transaction. Each operation is {kind, path, selector, text} plus expected_hash (required, node_replace only) or position (node_insert: 'inside', 'before' or 'after'). An intent operation is {kind, path} with kind ensure_using / ensure_import (name, module for TypeScript or JavaScript) or ensure_field / ensure_member (selector of the type, text): it adds the line or member only when absent and reports applied false when it was already there. Operations on one file apply in order, each on the bytes the previous one produced. validate 'parse' (default) refuses the batch when an operation introduces a parse error; 'build' also runs dotnet build on the project above the edited files and restores every file when it is red. On any failure all files are left as they were. | **`operations`**, `validate` |
| `structural_search` | Searches the files of one language (any tree-sitter grammar Orkeon loads, or Markdown) for a code pattern parsed with the target grammar: $NAME matches one node and captures its text, $$$NAME matches zero or more sibling nodes. Returns path, line, column, text, captures and the enclosing symbol of each match. | `pattern`, `rule`, `rule_file` |
| `structural_rewrite` | Applies a rule's fix template to the matching files; dry run by default. | none sent to the model ¹ — the tool reads `rule`, `rule_file`, `pattern`, `language`, `fix`, `paths`, `glob`, `dry_run` (default `true`), `max_files` |

¹ These tools reach the model with an **empty parameter schema**, although they take arguments (read
in their request classes at a2bb6c3, unchanged at c727c06 and still without `[FieldSchema]`, the six new ones of e44df3f included; `dependency_graph` and `sub_graph` send only their `edge_kinds` and `node_kinds`, which got one at e44df3f, and `dependency_graph` its `max_cycles` and `max_cycle_members` since c727c06 — `orkeon-bench tools dump` and the `tools/list` of `orkeon mcp serve`, V-55). The names shown are the wire
names: the snake case of the C# property (`TopK` → `top_k`), as the tool's deserialiser reads them —
`index_codebase` answered `{"root_path": …}` and ignored `rootpath` on the 24ab0d0 binary. The model sees only the description and
calls them without arguments, so each runs with its defaults (`memory_store` lists).
Do not build a team on them without an end-to-end run that proves the call works; name the arguments
in the task description if one must be used.
An array or object argument does not pass through `orkeon mcp serve` at c727c06: the server hands it to the tool
as a JSON string, so `session_store`'s `keys` and `values` fail there (`Invalid parameters: The JSON value could not be converted …`)
while a script's call passes them (V-53); a typed tool's array or object argument is proven from a script, not over MCP.

What the index reads and links changed at f80665f, not the contracts: `respect_gitignore` (default `true`) applies the ignore files
as git does — `.git/info/exclude`, the root `.gitignore` and each nested `.gitignore` for the paths under its folder, character
classes such as `[Bb]in/` included (Orkeon #251, #258; before, the root `.gitignore` only); the imports of C#, Go and Rust files now
trace `Imports` edges, which `dependency_graph`, `sub_graph` and `package_summary` follow (#252); `package_summary` gives as
dependencies the packages holding the targets of its modules' imports, and as entry points only the modules named `main`,
`__main__`, `program` or `index` (#249, #250; before, any module whose name contained one of these words).

### Knowledge (RAG) — registered by every runner; prefer `knowledge:` (§ 8) for a crew's own corpus

| Tool | What it does | Arguments |
|---|---|---|
| `rag_search` | Search knowledge bases and retrieve answers grounded in documents. Use this when you need factual information from the agent's knowledge sources. | **`question`**, `top_k`, `collection` |
| `rag_ingest` | Ingest documents into a knowledge collection so they become searchable via rag_search. Accepts file paths, glob patterns and http(s) addresses; unchanged sources are skipped (incremental). | **`collection`**, **`sources`**, `chunking_strategy`, `reindex`, `prune` |
| `rag_eval` | Evaluate a RAG knowledge collection against a golden dataset (YAML): recall@k, precision@k, MRR, groundedness and answer-relevance (judge mode labelled: llm or heuristic). Writes markdown/JSON reports and returns the aggregate summary. | **`dataset`**, `collection`, `profile`, `compare`, `k`, `use_llm_judge`, `reindex` |

`rag_search` and `rag_eval` fall back to the collection of `Orkeon:Rag:Collection`; `rag_eval` writes its reports and may call an LLM judge.

### Not in the list above

| Tool | Status on `main` at c727c06 |
|---|---|
| `ask_question_to_coworker`, `delegate_work_to_coworker` | **added automatically** to every agent with `allowDelegation: true` under `process: sequential` or `graph` — never list them |
| `brave_search` | registered only when `BRAVE_API_KEY` is set; otherwise the name is unknown and validation fails |
| tools of the MCP servers of the settings (`MCP:Servers`) | connected before the crew loads, under their own names, and attachable from `tools:`; a name a registered tool already holds is refused (logged, the built-in kept). The server is machine configuration: a team that names its tools does not run where the server is absent |
| `semantic_search`, `human_input` | listed above; registered by the shared runner, so for a YAML crew and a declarative `.ork.ts` alike (not for a procedural script); `human_input` goes on the event stream under `--events` and is **auto-approved** without it |
| `slack_send_message`, `slack_read_messages` | not registered by any shipped composition root (a C# host may) |
| `spawn_agent` | not in `--list-tools` and never attachable from a crew's `tools:`; offered to an agent of a procedural script's `act` (f80665f) |
| `system_one_decide` | registered for the active decision provider only (since 0ea39d9 `AddOrkeonDecisionProvider`: "Ask the active decision provider (TypeSafe, Liquid or Kev) typed questions about a state", `docs/tools/inventory.md`; the wire description still reads "Ask the decision model typed questions about a state and get calibrated answers …") — named by `Orkeon:Decision:Provider` or deduced from an `Orkeon:TypeSafe` or `Orkeon:Liquid` section or key (`orkeon/llm-profiles.md` § 3); a paid remote endpoint for TypeSafe and Liquid, local by default for Kev — not on a bare configuration: 111 tools then (V-54) |
| `code_interpreter` | registered by concrete type only: not resolvable by name |
| `progress_report` | scripted REPL commands only |

## 6. Files: the virtual file system

Agents address only virtual paths; Orkeon's code never sees the disk.
In a team folder (see `studio-layout.md`):
- the **mount points** of the team, declared in its `mounts.json`, free in name and number — for
  instance `/mailbox` (read-only) for the mails to triage, `/reports` (write) for the deliverables;
  the generic scheme `/workspace` (read-only, folder `input/`) and `/output` (write, folder `output/`)
  is only a proposal for a need that names no folder;
- `/crew/…` (YAML) or `/script/…` (TypeScript): the files shipped with the definition, read-only —
  an `appsettings.json` there is readable by any agent with `file_read`, and it is also the settings
  file Orkeon resolves first for a run that names no `--settings` (`cli.md` § 5).

Reserved roots, refused as mount points: `/crew`, `/llm-logs`, `/sandbox`, `/credentials` (the OAuth
tokens of the mailbox tools and, since 13461ea, of the drive tools), and `/script` for a TypeScript run.

A tool result is cut at 4,000 characters before it reaches the model — 32,000 for `file_read`, 10,000 for
`shell_command` and 256,000 for `node_read` at c727c06 (`AgentDefaults.MaxToolResultLengthOverrides`) — followed
by `[... truncated, N chars omitted …]`; since e44df3f a machine's settings may change a tool's bound
(`Orkeon:Tools:ResultLimits:Limits:<tool>`), so a team never relies on more than these defaults: an agent that reads large files needs a plan (one file at a time,
`txt_search` / `pdf_search` first). Since 8f4de67 (#260) a `grep` answer carries `total_matches`, `files_matched` and `scan_complete` whatever its `output_mode`, and reaching `max_results` no longer stops the scan (only `max_files` or a timeout does): a total read with `scan_complete: true` is exact even when the hits were cut, and a "how many" question takes one call with `output_mode: "count"` (per-file `counts`, highest first, cut to `max_results`; any other value is refused before the tool runs by the host's schema check, `Parameter 'output_mode' must be one of: hits, count`, V-52). `total_matches` counts matching lines, not occurrences. A crew with a `rag:` block writes its ingestion manifests under
`/output/rag/manifests` when `/output` is writable.

Always spell out the virtual paths **in full** in task descriptions
("Read the files in `/mailbox` with `directory_read`, then `file_read`").

## 7. Language model

- The **model** comes from the run's profile: the team's Studio model setting, the settings Orkeon resolves
  for the run, or the `ORKEON_Llm__*` variables (`llm-profiles.md`). There is no provider key: Orkeon infers
  the provider from the base URL alone when there is one, else the model name, then the key. Each Studio model setting is also a
  **host profile** (`Llm:Profiles:<name>`), and `orkeon run --llm-profile <name>` makes one the run's default.
- A crew **may** pin a model (`llm: { model }`, `llm.model(…)`) or name a profile (`llm: { profile }`,
  `llmOverride: { profile }`, `llm.profile(…)`, `.withProfile(…)`); both are applied at 151a762. **Do not**,
  without a design decision recorded in `TEAM.md § Design`: a model name ties the team to one vendor, and a profile
  name ties it to the machines whose settings define it — an unknown profile fails the load, the bench's
  and CI's included. The manager (hierarchical: its agent's `llm`), the planner, the RAG subsystem and the
  Guardian stay on the default profile unless stated.
- Settings per **agent** (`llm:`, the crew's `llm:` merged field by field under it) and per **task**
  (`llmOverride`, over the agent's): `temperature` (0.2 analytical, 0.7 creative), `maxTokens`, `topP`,
  `thinking: {enabled, effort: low|medium|high|xhigh|max}` (`xhigh` since e44df3f, #242; a provider whose field
  knows fewer levels sends the highest it knows below, and says so), `responseFormat: text|json_object|json_schema`
  (+ `responseSchema: {name, schema: "<JSON as a string>", strict}`); `cache` on the agent and, since 13461ea,
  on a task (a task block holding no breakpoint turns the agent's cache off for that task); since f80665f its `ttl` is
  `5m` or `1h` or the load fails, the TypeScript agent asks for it with `.cache({ systemPrompt, tools, ttl })` (#254),
  the host may set a default for every agent that sets none (`Llm:Cache`, `llm-profiles.md`), applied on Anthropic only,
  and a block that marks nothing (`cache: {}`) is an explicit off that turns that default off too. The task's override
  is merged once over the agent's configuration (`LlmConfigResolver.Resolve`), and since 13461ea a temperature,
  a `top_p` or a penalty reaches the vendor as written (`0.7`, never `0.699999988079071`); a `maxTokens` of 0 or
  less fails the load. A temperature or `top_p` nothing sets is **not sent** (the model applies its own; Mistral still writes
  `top_p: 1`); an unset `maxTokens` sends the model's documented maximum, 4,096 for a model the catalogue
  does not know. An option the provider cannot honour produces a warning, not an error.
- Cost: `cost.updated` events carry `promptTokens`, `completionTokens`, `model`, `provider` and
  `operation`; manager, planner and ballot calls and retries are counted, embeddings are not
  (`sizing-and-cost.md`). Since f80665f a cache or reasoning count no call reported is null, not 0: absent from the
  events, `n/a` beside a reported one in `AUTO_SUMMARY.md`, left out of `session_stats` `by_model_tokens[]`, which gains `reasoning_tokens` (#254).
- Fixed at f80665f, so a team need not work around them: on Anthropic, a turn that called a tool failed on its second model
  call (`KeyNotFoundException`, #245); a host tool (`index_codebase` on a large repository) counted against a script's
  memory limit and failed it at random — `--memory-limit-mb 0` is no longer needed for it (#247).
- 16 providers (configuration ids): `openai`, `anthropic`, `ollama`, `azure-openai`, `mistral`,
  `deepseek`, `kimi`, `qwen`, `together`, `huggingface`, `zai`, `gemini`, `grok`, `minimax`,
  `openrouter`, `mammouth`. Machine configuration: `orkeon init`.

## 8. Other features

- **Memory**: `memory: true` (default `false`) stores each successful task output and recalls the 5 closest
  memories of the crew (same `name:`) into each task's prompt; it needs the embedder and probes it with its
  store before the first call. `memoryProvider: InMemory|Sqlite|Redis|ChromaDb|Pinecone|LanceDb` (needs
  `memory: true`; any other name fails the load) names a type, connected from the host section
  (`Orkeon:Sqlite`…); without it, the host's default store (`Memory:Provider`, in memory by default; an
  unknown type there refuses the start). Under `orkeon run` the memory dies with the
  process unless the settings give a durable store; even then it is recall by similarity, never a record of
  what was done: state that must survive a run goes to a file under a writable root
  (`resume-and-memory.md`, `reliability/resume-patterns.md`). `semantic_search` still searches a store
  that nothing fills.
- **Guardrails** (YAML, agent and task level): `preset: analysis|strict|creative` (any other fails the
  load), `rules: [..]`, `toolRules: {tool: [..]}` — rules injected into the system prompt, the agent's
  before the task's; a `toolRules` entry shows only when the agent holds the tool for that task.
- **Graph** (YAML, `process: graph`): `graphConfig: {maxRetryCycles, circuitBreakerPreset,
  maxTransitions, maxStateVisits, maxTotalDurationSeconds}` — the only breaker setting. The
  `circuitBreaker:` block is removed: the load refuses it, crew or task (`reliability/error-handling.md` § 2).
- **Planning** (`planning: true`): § 2.
- **Declarative RAG** (YAML `rag:` + `knowledge:` on the agent): active under `orkeon run` and Studio.
  `rag.collections.<name>.sources` (relative to the crew folder, globs, directories) are ingested when the
  crew loads, embedded by the local model; an attached collection is queried with the task and its
  excerpts, cited, join the agent's prompt (`top_k`, `min_score`, `max_context_tokens`; profile `fast`
  unless the attachment, `rag.defaults.profile` or `Orkeon:Rag:Profile` says otherwise). The store is the
  host's (`Orkeon:Rag:Provider`, in memory by default, so the collections are embedded again at each run;
  manifests under `/output/rag/manifests` when `/output` is writable). The local embedder reads English. For a few files, `directory_search`,
  `pdf_search`, `mdx_search` or `txt_search` on a read-only mount point stay simpler.

## 9. Known pitfalls

`--validate` does not see everything. It **silently** lets through an out-of-list value for
`thinking.effort` (and the values `yaml-schema.md` lists). Since 63be532 it refuses every key no model reads
— a typo, a retired key (`circuitBreaker` / `circuit_breaker`, `rag.provider`, a task's `outputFile` /
`output_file`), a duplicate, a `<<:` merge key, a block of the wrong shape — with its file and line (an
unknown key was ignored silently before). It does detect dependency cycles, an `agent:`, `dependencies:` entry or `managerAgent` that names nothing,
unknown tools (agent or task), an unknown LLM profile or guardrails preset, an unknown `process` or
`deliverable.source`, `hierarchical` without a manager, a `managerAgent` or `asyncExecution` the mode
refuses, `memoryProvider` without `memory: true` or naming no provider, a `maxRpm` or `maxIter` of 0 or
less, a `maxExecutionTime` of 0 or less, above 4294967 or on a `hierarchical` manager, since 13461ea a
`maxTokens` of 0 or less (an agent's or the crew's `llm`, a task's `llmOverride`), since f80665f a `cache` `ttl` other than `5m` or `1h`, a `circuitBreaker:` block. Its messages name an agent or a task by its key, the file name
(`Agent 'researcher' must have a goal.`). The YAML skill ships
`scripts/check_crew.py`, which covers the rest; in TypeScript, references are variables and `tsc` checks
them.

| Written | Effect | Write instead |
|---|---|---|
| `output_file: x.md` | `'tasks[x].output_file' is retired: the framework writes a task's file from its deliverable: block — …` (ignored before 63be532) | `deliverable: {path: /output/x.md, source: final_message}` |
| `context: [task_a]` (CrewAI style) | error `Expected 'MappingStart', got 'SequenceStart'`: `context` is a mapping of data, not an ordering | `dependencies: [task_a]` |
| `deliverable.source: final` / `raw` | error | `final_message` |
| a root `crew:` wrapping everything | `'crew' is not a key Orkeon reads. It reads: name, goal, process, …` (since 63be532; `Crew name is required.` before) | keys at the root |
| `agents:` as a list `- role: …` (single file) | `Expected 'MappingStart', got 'SequenceStart'` | mapping `id: {…}` (or one file per agent) |
| `links.direction: send`/`receive` | ignored with a warning | `outbound` / `inbound` / `bidirectional` / `both` |
| `responseSchema.schema:` as a YAML mapping | `Exception during deserialization`, no position | JSON string (`schema: '{"type":"object",…}'`) |
| `brave_search` without `BRAVE_API_KEY` | unknown tool | `web_search`, or set the key |
| `maxIterations: 5` on a YAML agent | `'agents[x].maxIterations' is not a key Orkeon reads. It reads: role, goal, backstory, tools, allowDelegation, maxIter, …` (ignored before 63be532) | `maxIter: 5` |
| `circuitBreaker:` (crew or task) | `'circuitBreaker' is retired: the crew-level circuit breaker bounded Graph mode only, …` (a task's: `… the task state machine it configured never ran …`) | `graphConfig` on a `graph` crew; nothing elsewhere |
| `managerAgent:` in `sequential`, `parallel`, `graph` or `autonomous` | `managerAgent: x is set, but process: … has no manager …` | remove it, or `hierarchical` |
| `asyncExecution: true` outside `sequential` / `parallel` | `Task 'x' sets asyncExecution: true, which process: … does not honour …` | remove it |
| `memoryProvider:` without `memory: true` | `memoryProvider: '…' needs memory: true …` | both, or neither |
| `memoryProvider: Sqlight` | `memoryProvider: is 'Sqlight', which is not a memory provider: write one of inmemory, in-memory, redis, sqlite, …` | a provider type |
| `maxRpm: 0`, `maxIter: 0` (or less) | `Agent 'x' maxRpm: 0 — the model requests the agent may make per minute must be 1 or more. Leave maxRpm: out for no limit of its own.` | leave the key out |
| `maxExecutionTime: 0` (or less, or above 4294967) | `Agent 'x' maxExecutionTime: 0 — the seconds the agent may spend on a task must be more than 0 and at most 4294967. Leave maxExecutionTime: out for no limit.` | whole seconds, or leave the key out |
| `maxExecutionTime:` on the manager of a `hierarchical` crew | `Manager agent 'm' declares maxExecutionTime: a hierarchical manager runs no task of its own, so the limit would never apply. Remove it.` (TS: the manager named by its id, a ULID) | remove it |
| `guardrails: {preset: analysys}` | `Agent 'x': unknown guardrails preset 'analysys'. Expected one of: …` | `analysis`, `strict`, `creative` |
| `agent: wrtier` / `dependencies: [a_grop]` | `A task reference names nothing: …` | an id of `agents/` / `tasks/` |
| `source: structured_output` without a schema | `StructuredOutput deliverable requires SchemaPath or SchemaInline.` | add `schemaInline: '{…}'` or `schemaPath` |
| `hierarchical` without a manager | `Hierarchical process requires a manager agent: name one of the crew's agents as its manager …` | `managerAgent: <id>` / `.manager(agent)` |
| `cache: {system: true, ttl: 10m}` | `cache ttl must be 5m or 1h, not '10m'; leave it out for the vendor default.` (since f80665f; sent to the vendor before) | `ttl: 5m` or `1h`, or no `ttl` |
| a `*.ork.ts` in a YAML folder | folder rejected (ambiguous) | one format per folder |
