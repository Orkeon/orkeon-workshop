# YAML schema of an Orkeon crew (multi-file layout)

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew-yaml` skill. Established on Orkeon main at a2bb6c3 (2026-10-03, after 1.0.0-rc.4), the
> version the image builds (D32); first written on `1.0.0-rc.4`.
> Sources: at that commit — `src/core/Orkeon.Infrastructure/Configuration/Yaml/` (`YamlConfigModels.cs`,
> `YamlCrewMapper.cs`, `CrewDefinitionValidator.cs`, `RetiredCrewYamlKeys.cs`),
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs`, `docs/architecture/yaml-schema.md`,
> `docs/orchestration/process-types.md`, `docs/architecture/memory-system.md`,
> `docs/architecture/rag-pipeline.md`. Read in the sources: the stub runs of V-14 date from 24ab0d0 and were
> not re-run on a2bb6c3.

**The code takes precedence** over `docs/architecture/yaml-schema.md`, whose discrepancies are listed at
the end.

Reading rules: keys in **camelCase** (canonical) or snake_case (accepted); an unknown key is **ignored
without an error** — a typo silently disables a setting (exceptions: a malformed `knowledge:` entry warns,
`rag.provider` warns, `circuitBreaker:` fails the load). Always quote long strings, with a `|` block or
double quotes.

## `crew/config.yaml` — crew settings

```yaml
name: tech-watch                    # required; also the scope of the crew's memory
goal: "Produce a weekly sourced tech watch note on a given topic"   # required
process: sequential                 # sequential | hierarchical | parallel | consensual | graph | autonomous
verbose: false
# managerAgent: coordinator         # hierarchical: REQUIRED, the manager; consensual: the ManagerDecision arbiter; any other process: load fails
# memory: true                      # stores each task's output, recalls the closest before each task (§ Memory); default false
# memoryProvider: Sqlite            # needs memory: true (else load fails); the TYPE only, connected from the host section (Orkeon:Sqlite...)
# planning: true                    # one planner call before the first task; each task reads its own plan; default false
# llm: { temperature: 0.3 }         # crew default, merged field by field under each agent's llm
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
maxIter: 10                         # default 20
# verbose: false
# maxRpm: 10                        # stored, read by no limiter: RateLimiting:AgentRequestsPerMinute applies
# llm:                              # applied to every call of the agent
#   temperature: 0.2                # sent whatever its value; unset: the profile's, else none is sent
#   maxTokens: 2000                 # unset: the model's documented maximum (4096 for a model the catalogue does not know)
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
#   maxTokens: 2000
#   topP: 0.9
#   thinking: { enabled: true, effort: medium }
#   responseFormat: json_object
#   responseSchema: { name: note, strict: true, schema: '{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}' }
# guardrails:                       # same shape as the agent's; rendered after the agent's
#   rules: ["Never make up a URL."]
# context: { language: en }         # side data (mapping), NOT an ordering; reaches the hierarchical/autonomous manager only
```

Required: `description`, `expectedOutput`. `llmOverride` has no `model` and no `cache`. In
`hierarchical` and `autonomous`, `agent:` is not followed: the manager assigns; in `consensual` every agent
runs every task.

## Memory, planning, RAG — what the keys do at a2bb6c3

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
  (`Orkeon:Rag:Provider`); `rag.provider` in the crew draws a warning.

## What `--validate` checks — and what it lets through

Checked (validation fails): the crew's `name`/`goal`, the agents' `goal`, the tasks' `description` +
`expectedOutput`; an `agent:`, `dependencies:` entry or `managerAgent` that names nothing; `dependencies`
cycles; unknown tools, on an agent or a task (strict resolution); an unknown LLM `profile`; unknown
`process`; `hierarchical` without a manager; a `managerAgent` in a mode without one; `asyncExecution: true`
outside `sequential`/`parallel`; `memoryProvider` without `memory: true`; an unknown `guardrails.preset`, a
tool written twice in `toolRules`; a `circuitBreaker:` block (crew or task); unknown `deliverable.source`;
`structured_output` without a schema; invalid or malformed YAML (list instead of mapping,
`responseSchema.schema` as a mapping).

**Not checked** (passes silently): unknown keys (`circuit_breaker:` among them: only the camelCase key is
refused); out-of-list `thinking.effort`; an unknown `memoryProvider` (in memory, with a warning at run time);
an unknown `responseFormat` (forwarded, with a warning); unknown `links.direction` (warning only); `maxRpm`.
Hence `scripts/check_crew.py`, to run **before** `--validate`.

## Discrepancies between `docs/architecture/yaml-schema.md` and the code

At a2bb6c3 that page describes the agent and crew `llm`, the agent `guardrails`, task `tools`, `memory`,
`planning`, `asyncExecution`, `managerAgent` and the removal of `circuitBreaker` as the code does. What it
still says and the code does not do:

| Topic | The docs say | The code does |
|---|---|---|
| `maxRpm` | requests per minute (rate limiting) | stored on the agent, read by no limiter (`RateLimiting:AgentRequestsPerMinute` applies) |
| `rag.provider` (schema block, model list) | recorded on `RagCrewConfig`, not consumed | no such property: a warning at load (the page says so further down) |
| `rag.defaults.profile`, a `knowledge` entry's `profile` | recorded, not consumed yet | used: the attachment's `profile`, else `rag.defaults.profile`, else `Orkeon:Rag:Profile` (the page's RAG section agrees) |
| `circuitBreaker` refused at load | any spelling | the camelCase key only; `circuit_breaker:` is an ignored unknown key |

## Repository examples to imitate

- `examples/crew-multifile/` — the minimal `config.yaml` + `agents/` + `tasks/` layout.
- `examples/quickstart/` — the smallest sequential crew.
- `examples/01-enterprise/02-code-review/config.yaml` — `hierarchical` + `managerAgent` + fan-out dependencies.
- `examples/01-enterprise/04-financial-reports/config.yaml` — `parallel`.
- `examples/01-enterprise/11-translation-consensus/config.yaml` — `consensual` + `memory`.
- `examples/09-experimental/102-graph-orchestration/config.yaml` — `graph` + `graphConfig`.
