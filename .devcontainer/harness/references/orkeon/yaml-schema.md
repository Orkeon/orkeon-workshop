# YAML schema of an Orkeon crew (multi-file layout)

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew-yaml` skill. Established on Orkeon main at e258730 (2026-10-18, after 1.0.0-rc.5), the
> version the image builds (D32); first written on `1.0.0-rc.4`.
> Sources: at that commit — `src/core/Orkeon.Infrastructure/Configuration/Yaml/` (`YamlConfigModels.cs`,
> `YamlCrewMapper.cs`, `CrewDefinitionValidator.cs`, `CrewYamlKeyCheck.cs`; `RetiredCrewYamlKeys.cs` before
> e258730), `Configuration/YamlCrewDefinitionLoader.cs`, `Configuration/YamlAnchorPreprocessor.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs` and `RequestRates.cs`,
> `docs/architecture/yaml-schema.md`, `docs/orchestration/process-types.md`,
> `docs/architecture/memory-system.md`, `docs/architecture/rag-pipeline.md`. Read in the sources; `maxRpm`,
> `maxIter`, `memoryProvider` and the validator's messages were also run on a build of fb26364 (V-14), the
> other stub runs of V-14 date from 24ab0d0; `maxExecutionTime` and its messages on a build of f59446b (V-38).

**The code takes precedence** over `docs/architecture/yaml-schema.md`, whose discrepancies are listed at
the end.

Reading rules: keys in **camelCase** (canonical) or snake_case (accepted), case-sensitive. Since 63be532
(GAP-50, `CrewYamlKeyCheck`, before the deserialization) **every key is read or refused**: a key no model
carries, a retired one (`rag.provider`, `circuitBreaker` / `circuit_breaker` of the crew or a task, a task's
`outputFile`), a key written twice, a merge key `<<:`, an anchor on an unknown key or a block of the wrong
shape fails the load with its file, line and path — `/crew/agents/writer.yaml, line 8:
'agents[writer].maxIterations' is not a key Orkeon reads. It reads: role, goal, …` (a nearer key gives
`Did you mean '…'?`; `MaxIter` gives `(keys are case-sensitive)`). Only the names you choose stay free: the
ids under `agents:` / `tasks:`, the tool names under `toolRules:`, the keys and values of `context:`. A
`knowledge:` entry's unknown key is refused too; its malformed value still warns. Before 63be532 an unknown
key was ignored silently. Always quote long strings, with a `|` block or double quotes. The entity files of
`agents/` and `tasks/` may end in `.yaml` or `.yml` (the same stem under both is refused, `Keep one.`), and
`anchors:` expands with CRLF line ends too (since 63be532).

## `crew/config.yaml` — crew settings

```yaml
name: tech-watch                    # required; also the scope of the crew's memory
goal: "Produce a weekly sourced tech watch note on a given topic"   # required
process: sequential                 # sequential | hierarchical | parallel | consensual | graph | autonomous
verbose: false                      # true: every agent's turns (tool calls, results, answers) at Information, category Orkeon.Verbose
# managerAgent: coordinator         # hierarchical: REQUIRED, the manager; consensual: the ManagerDecision arbiter; any other process: load fails
# memory: true                      # stores each task's output, recalls the closest before each task (§ Memory); default false
# memoryProvider: Sqlite            # needs memory: true (else load fails); the TYPE only, connected from the host section (Orkeon:Sqlite...)
# planning: true                    # one planner call before the first task; each task reads its own plan; default false
# llm: { temperature: 0.3 }         # crew default, merged field by field under each agent's llm
# maxRpm: 30                        # requests per minute, all agents and the manager together: one more waits; 0 or less: load fails
# graphConfig: { maxRetryCycles: 2, circuitBreakerPreset: strict, maxTotalDurationSeconds: 1800 }   # process: graph
```

No `agents:`/`tasks:` key here (they live in the folders), no `mounts:` block (see `studio-layout.md`),
no `crew:` wrapper, no `circuitBreaker:` (removed: the load fails and names `graphConfig`).

## `crew/agents/<id>.yaml` — an agent

```yaml
role: "Web researcher"
goal: "Find recent, reliable sources on the requested topic"
backstory: |
  Rigorous information specialist. Always cites the URL of every fact, discards anonymous
  sources or sources more than a year old, and flags what it could not verify.
tools: [web_search, web_scrape]
allowDelegation: false              # default true!
maxIter: 10                         # default 20; 0 or less: load fails
# verbose: false                    # true: this agent's turns at Information, category Orkeon.Verbose
# maxRpm: 10                        # requests per minute of this agent: one more waits; unset: no limit of its own; 0 or less: load fails
# maxExecutionTime: 600             # whole seconds a task may take on this agent: past it the task fails; unset: no limit; 0 or less, a decimal, above 4294967 or on a hierarchical manager: load fails
# llm:                              # applied to every call of the agent
#   temperature: 0.2                # sent whatever its value; unset: the profile's, else none is sent
#   maxTokens: 2000                 # unset: the model's documented maximum (4096 for a model the catalogue does not know); 0 or less: load fails (since 13461ea)
#   topP: 0.9
#   thinking: { enabled: true, effort: medium }    # low | medium | high | max (not checked)
#   responseFormat: json_object                     # text | json_object | json_schema
#   responseSchema: { name: note, strict: true, schema: '{"type":"object"}' }
#   cache: { system: true, tools: false, ttl: 1h }  # Anthropic prompt caching
#   profile: claude                 # a host LLM profile (Llm:Profiles:<name>); unknown: load fails
#   model: some-model               # unset: the profile's own model
# guardrails:                       # rendered in the system prompt, before the task's
#   preset: analysis                # analysis | strict | creative; any other: load fails
#   rules: ["Never make up a URL."]
#   toolRules: { web_scrape: ["One page per call."] }   # shown only when the agent holds the tool
# knowledge: [product-kb]           # attaches a rag: collection (§ RAG)
```

The file name is the id. Required: `goal` (`role` falls back to the id).

`maxRpm` is applied (sliding window of 60 s per declaring agent or crew, `RequestRates`): the request of
too many waits — it never fails the task —, and one Information line says who waited, how long and under
which limit (`Agent Writer waited 59.8 s for its model request: agent 'Writer' maxRpm 1`). The host's
`RateLimiting:AgentRequestsPerMinute` (20) bounds each agent too, the stricter of the two winning
(`design/sizing-and-cost.md` § 1).

`maxExecutionTime` (`max_execution_time` accepted; read since f59446b — before, an unknown key ignored) bounds each
task the agent runs: past it the task stops, at the latest at the end of the call in progress, and fails
(`ExecutionTimeExceeded`, `Agent exceeded its maximum execution time of 600s`, a Warning line), and the run fails
as on any failed task (`reliability/error-handling.md`). The wait for a human input does not count. The load
refuses 0 or less and above 4294967 (`Agent 'x' maxExecutionTime: 0 — the seconds the agent may spend on a task
must be more than 0 and at most 4294967. Leave maxExecutionTime: out for no limit.`), a decimal (`Exception during
deserialization`, no position) and a limit on the `managerAgent` of a `hierarchical` crew (`Manager agent 'm'
declares maxExecutionTime: a hierarchical manager runs no task of its own, …`).

## `crew/tasks/<id>.yaml` — a task

```yaml
description: |
  Search for the past week's news on the topic described in /workspace/topic.md.
  Read that file first with file_read. Keep 5 to 8 sources.
expectedOutput: "A list of 5 to 8 sources: title, URL, date, two-sentence summary."
agent: researcher                   # an id of agents/; any other: load fails
# dependencies: [other_task]        # ordering + skip when one failed; an unknown id fails the load; every earlier output reaches the task anyway (8,000 characters in all)
# asyncExecution: true              # sequential: runs alongside the next tasks, a dependant waits for it; parallel: no effect; other modes: load fails
# humanInput: false                 # auto-approved without --events
# tools: [count_pattern]            # ADDED to the agent's tools for this task only; resolved strictly like the agent's
# deliverable:
#   path: /output/note.md
#   source: final_message           # final_message | structured_output (requires schemaPath/schemaInline) | tool_call | none
#   format: markdown                # markdown | json | text
#   sanitize: true
#   schemaPath: /crew/schema.json   # required by structured_output; NOT a validation of the content
#   schemaInline: '{"type":"object"}'
# llmOverride:                      # over the agent's llm, for this task
#   profile: claude                 # this task alone on another host profile (its own model)
#   temperature: 0.7
#   maxTokens: 2000                 # 0 or less: load fails (since 13461ea)
#   topP: 0.9
#   thinking: { enabled: true, effort: medium }
#   responseFormat: json_object
#   cache: { system: true, tools: false }        # since 13461ea, the agent's shape; a block with no breakpoint turns the agent's cache off for this task
#   responseSchema: { name: note, strict: true, schema: '{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}' }
# guardrails:                       # same shape as the agent's; rendered after the agent's
#   rules: ["Never make up a URL."]
# context: { language: en }         # side data (mapping), NOT an ordering; reaches the hierarchical/autonomous manager only
```

Required: `description`, `expectedOutput`. `llmOverride` has no `model`; it has a `cache` since 13461ea
(read, sent and exported; dropped at load before). Neither `llm` nor
`llmOverride` has a `callMode` key at e258730: the YAML loader reads none (`YamlConfigModels.cs`), so it is
refused at load like any unknown key (ignored before 63be532) — the call mode is a host setting, `Llm:CallMode` or
`Llm:Profiles:<name>:CallMode` (`llm-profiles.md` § 3). In
`hierarchical` and `autonomous`, `agent:` is not followed: the manager assigns; in `consensual` every agent
runs every task.

## Memory, planning, RAG — what the keys do at e258730

- **`memory: true`**: after each task that succeeds, its output is stored; before each task the 5 closest
  memories (cosine ≥ 0.6, 4,000 characters in all — `Orkeon:CrewMemory`) are added to the user prompt.
  The crew needs an embedder (the local one by default) and probes it with its store before the first LLM
  call — a failure there fails the run; a store or recall that fails later is a warning. Without
  `memoryProvider`, a named crew lives in the host's default store (`Memory:Provider`, in memory when
  unset): it lasts the process. `memoryProvider: Sqlite` with `Orkeon:Sqlite:ConnectionString` =
  `Data Source=/<rw root>/<file>.db` in the settings outlives the run, scoped by `name:` — a design choice
  to record (`resume-and-memory.md` § 2). `memory: false` stores and recalls nothing.
- **`planning: true`**: before the first task, the host's default profile writes a plan per task, read by
  that task in its prompt; it changes neither the order nor the agents; skipped with a warning on the echo
  provider.
- **`rag:` + `knowledge:`**: work under `orkeon run` (every runner registers the RAG subsystem): `rag:`
  collections are ingested when the crew loads (relative sources against the crew folder, `/crew`;
  manifests under `/output/rag/manifests` when `/output` is writable; with the default in-memory store,
  embedded again at each run), and an agent's `knowledge:` injects cited excerpts into its prompts. The store is the host's
  (`Orkeon:Rag:Provider`); `rag.provider` in the crew is refused at load since 63be532 (`'rag.provider' is
  retired: the document store is the host's choice — set Orkeon:Rag:Provider in the settings.`).

## What `--validate` checks — and what it lets through

Checked (validation fails): the crew's `name`/`goal`, the agents' `goal`, the tasks' `description` +
`expectedOutput`; an `agent:`, `dependencies:` entry or `managerAgent` that names nothing; `dependencies`
cycles; unknown tools, on an agent or a task (strict resolution); an unknown LLM `profile`; unknown
`process`; `hierarchical` without a manager; a `managerAgent` in a mode without one; `asyncExecution: true`
outside `sequential`/`parallel`; `memoryProvider` without `memory: true`, or naming no provider (`inmemory`,
`redis`, `sqlite`, `chromadb`, `pinecone`, `lancedb` and their aliases); a `maxRpm` (crew or agent) or a
`maxIter` of 0 or less; an unknown `guardrails.preset`, a
tool written twice in `toolRules`; every key no model reads, a retired key (`circuitBreaker:` and
`circuit_breaker:`, `rag.provider`), a duplicate key, a `<<:` merge key (above); unknown `deliverable.source`;
`structured_output` without a schema; invalid or malformed YAML (list instead of mapping,
`responseSchema.schema` as a mapping). A message names an agent or a task by its key — the file name —
(`Invalid crew configuration: Agent 'researcher' must have a goal.`).

**Not checked** (passes silently): out-of-list `thinking.effort`; a `memoryProvider` whose host section is missing;
an unknown `responseFormat` (forwarded, with a warning); unknown `links.direction` (warning only).
Hence `scripts/check_crew.py`, to run **before** `--validate`.

## Discrepancies between `docs/architecture/yaml-schema.md` and the code

At e258730 that page describes the agent and crew `llm`, the agent `guardrails`, task `tools`, `memory`,
`planning`, `asyncExecution`, `managerAgent`, `maxRpm`, `maxIter`, `maxExecutionTime` and `verbose`, a task's
`llm_override` `cache` and the refusal of a `max_tokens` of 0 or less, `rag.provider`, the RAG `profile` keys
and the removal of `circuitBreaker` as the code does. At e258730 it also states the key check (GAP-50) as the code does, and the
discrepancy recorded before (`circuit_breaker:` let through) is gone: the snake_case key is refused as
retired. No discrepancy is known at e258730.

## Repository examples to imitate

- `examples/crew-multifile/` — the minimal `config.yaml` + `agents/` + `tasks/` layout.
- `examples/quickstart/` — the smallest sequential crew.
- `examples/01-enterprise/02-code-review/config.yaml` — `hierarchical` + `managerAgent` + fan-out dependencies.
- `examples/01-enterprise/04-financial-reports/config.yaml` — `parallel`.
- `examples/01-enterprise/11-translation-consensus/config.yaml` — `consensual` + `memory`.
- `examples/09-experimental/102-graph-orchestration/config.yaml` — `graph` + `graphConfig`.
