# YAML schema of an Orkeon crew (multi-file layout)

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew-yaml` skill. Established for Orkeon `main` at 24ab0d0 (the version the image builds, D32;
> first written on `1.0.0-rc.4`). A line marked **dropped** is read by the loader but never reaches the
> engine on `main` (`CrewFactory`); a stub run proves it (`orkeon-reference.md` § 1).

Based on `src/core/Orkeon.Infrastructure/Configuration/Yaml/YamlConfigModels.cs`,
`YamlCrewMapper.cs` and `CrewDefinitionValidator.cs`. **The code takes precedence** over
`docs/architecture/yaml-schema.md`, whose discrepancies are listed at the end.

Reading rules: keys in **camelCase** (canonical) or snake_case (accepted); an unknown key
is **ignored without an error** — a typo silently disables a setting.
Always quote long strings, with a `|` block or double quotes.

## `crew/config.yaml` — crew settings

```yaml
name: tech-watch                    # required
goal: "Produce a weekly sourced tech watch note on a given topic"   # required
process: sequential                 # sequential | hierarchical | parallel | consensual | graph | autonomous
verbose: false
# managerAgent: coordinator         # REQUIRED in hierarchical: id of an agent in agents/
# memory: true                      # changes nothing: outputs are stored either way, never read back into a prompt
# memoryProvider: InMemory          # InMemory | Sqlite | ChromaDb | Pinecone | LanceDb — none is read back; Redis (and ChromaDb without a server) fails every task on main
# llm: { temperature: 0.3 }         # dropped: use llmOverride on the tasks
# circuitBreaker: { preset: default, maxStateVisits: 10 } # read by process: graph without graphConfig only; maxRetries & co. are ignored
# graphConfig: { maxRetryCycles: 2, circuitBreakerPreset: strict, maxStateVisits: 10 }   # process: graph
```

No `agents:`/`tasks:` key here (they live in the folders), no `mounts:` block
(see `studio-layout.md`), no `crew:` wrapper.

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
# maxRpm: 10                        # dropped: the limiter reads RateLimiting:AgentRequestsPerMinute
# llm: { temperature: 0.2 }         # dropped: use llmOverride on the agent's tasks
# guardrails: { rules: [...] }      # dropped: put the rules on the agent's tasks
```

The file name is the id. Required: `goal` (`role` falls back to the id). The tools an agent needs for
any of its tasks are listed **here**: a task's `tools` never reach it.

## `crew/tasks/<id>.yaml` — a task

```yaml
description: |
  Search for the past week's news on the topic described in /workspace/topic.md.
  Read that file first with file_read. Keep 5 to 8 sources.
expectedOutput: "A list of 5 to 8 sources: title, URL, date, two-sentence summary."
agent: researcher
# dependencies: [other_task]        # ordering; every earlier output reaches the task anyway (8,000 characters in all)
# humanInput: false                 # auto-approved without --events
# deliverable:
#   path: /output/note.md
#   source: final_message           # final_message | structured_output (requires schemaPath/schemaInline) | tool_call | none
#   format: markdown                # markdown | json | text
#   sanitize: true
#   schemaPath: /crew/schema.json   # required by structured_output; NOT a validation of the content
#   schemaInline: '{"type":"object"}'
# llmOverride:                      # the only model settings applied on main
#   temperature: 0.7
#   maxTokens: 2000
#   thinking: { enabled: true, effort: medium }    # low | medium | high | max
#   responseFormat: json_object                     # text | json_object | json_schema
#   responseSchema: { name: note, strict: true, schema: '{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}' }
# guardrails:                       # applied at task level
#   preset: analysis                # analysis | strict | creative
#   rules: ["Never make up a URL."]
#   toolRules: { web_scrape: ["One page per call."] }
# tools: [file_read]                # dropped: list the tools on the agent
# context: { language: en }         # side data (mapping), NOT an ordering; reaches the hierarchical manager only
# circuitBreaker: { preset: strict } # dropped at task level
```

Required: `description`, `expectedOutput`. `agent` must be the id of a file in
`agents/`; each `dependencies` entry the id of a file in `tasks/`; no cycle.
`asyncExecution` exists but no mode honours it — use `process: parallel`. In `hierarchical`, `agent:`
is not followed: the manager assigns.

## What `--validate` checks — and what it lets through

Checked (validation fails): the crew's `name`/`goal`, the agents' `goal`, the tasks' `description` +
`expectedOutput`, `dependencies` cycles, unknown tools (strict resolution), unknown `process`,
unknown `deliverable.source`, `structured_output` without a schema, `hierarchical` without a manager,
invalid or malformed YAML (list instead of mapping, `responseSchema.schema` as a mapping).

**Not checked** (passes silently): unknown keys; `agent:` or `dependencies:` that name nothing;
out-of-list `thinking.effort`, `memoryProvider`, `guardrails.preset`; unknown `links.direction`
(warning only); the keys marked **dropped** above. Hence `scripts/check_crew.py`, to run **before**
`--validate`.

## Discrepancies between `docs/architecture/yaml-schema.md` and the code

At 24ab0d0 that page gives the keys, the casing (camelCase canonical), the `deliverable.source` and
`links.direction` values, the JSON-string schemas and `thinking.effort: max` as the code reads them. What it
still says and the code does not do:

| Topic | The docs say | The code does |
|---|---|---|
| an agent's `llm`, the crew's `llm` | applied (the crew's merged under each agent's) | read, then dropped by `CrewFactory`: only a task's `llmOverride` reaches the model |
| an agent's `guardrails` | rendered before the task's | read, then dropped: only a task's `guardrails` reach the prompt |
| `maxRpm` | requests per minute (rate limiting) | stored, read by no limiter (`RateLimiting:AgentRequestsPerMinute` applies) |
| `managerAgent` omitted in `hierarchical` | the first agent manages (warning) | the load fails (`Hierarchical process requires either a manager agent or a manager LLM.`) |

## Repository examples to imitate

- `examples/crew-multifile/` — the minimal `config.yaml` + `agents/` + `tasks/` layout.
- `examples/quickstart/` — the smallest sequential crew.
- `examples/01-enterprise/02-code-review/config.yaml` — `hierarchical` + `managerAgent` + fan-out dependencies.
- `examples/01-enterprise/04-financial-reports/config.yaml` — `parallel`.
- `examples/01-enterprise/11-translation-consensus/config.yaml` — `consensual` + `memory`.
- `examples/09-experimental/102-graph-orchestration/config.yaml` — `graph` + `graphConfig`.
