# YAML schema of an Orkeon crew (multi-file layout)

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew --format yaml` skill. Established on Orkeon 1.2.0 (a9f3878, 2026-11-16);
> what 1.4.0 (0389fd2, the version the image installs, D110) changes is stated with its source (V-68); first written on `1.0.0-rc.4`.
> Sources: at that tag — `src/core/Orkeon.Infrastructure/Configuration/Yaml/` (`YamlConfigModels.cs`,
> `YamlCrewMapper.cs`, `CrewDefinitionValidator.cs`, `CrewYamlKeyCheck.cs`, `WhenClauseParser.cs`; `RetiredCrewYamlKeys.cs` before
> acd59d6), `src/core/Orkeon.Domain/Task/DecisionTaskRules.cs`, `Task/ValueObjects/TaskDecision.cs`, `Configuration/YamlCrewDefinitionLoader.cs`, `Configuration/YamlAnchorPreprocessor.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs` and `RequestRates.cs`,
> `docs/architecture/yaml-schema.md`, `docs/orchestration/process-types.md`,
> `docs/architecture/memory-system.md`, `docs/architecture/rag-pipeline.md`, `docs/architecture/decision-models.md`. Read in the sources; the
> `graph:`, `retry:`, `permissionMode`, `filesystem:` and deliverable messages quoted below were run with `--validate` on the published
> 1.2.0 CLI (2026-11-17); `maxRpm`,
> `maxIter`, `memoryProvider` and the validator's messages were also run on a build of fb26364 (V-14), the
> other stub runs of V-14 date from 24ab0d0; `maxExecutionTime` and its messages on a build of f59446b (V-38).

**The code takes precedence** over `docs/architecture/yaml-schema.md`, whose discrepancies are listed at
the end.

Reading rules: keys in **camelCase** (canonical) or snake_case (accepted), case-sensitive. Since 63be532
(GAP-50, `CrewYamlKeyCheck`, before the deserialization) **every key is read or refused**: a key no model
carries, a retired one (`rag.provider`, `circuitBreaker` / `circuit_breaker` of the crew or a task, the crew's
`graphConfig`, a task's `outputFile`), a key written twice, a merge key `<<:`, an anchor on an unknown key or a block of the wrong
shape fails the load with its file, line and path — `/crew/agents/writer.yaml, line 8:
'agents[writer].maxIterations' is not a key Orkeon reads. It reads: role, goal, …` (a nearer key gives
`Did you mean '…'?`; `MaxIter` gives `(keys are case-sensitive)`). Only the names you choose stay free: the
ids under `agents:` / `tasks:`, the tool names under `toolRules:`, the keys and values of `context:`, the
collection names under `rag.collections:`, and since e44df3f the question names under `decision.questions:` and
`decision.fallback:`, the options under `choice:` and the keys of `when:`. A
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
# graph: { circuitBreakerPreset: strict, maxTotalDurationSeconds: 1800 }   # process: graph only: budgets, and optionally start / nodes / edges (§ Graph)
# announce_mounts: false            # default true: every agent with a file-system tool lists its virtual paths in its system prompt; an agent's own key wins
# budget: { tokens: 400000, wallTimeSeconds: 1800, toolCalls: 80, delegationDepth: 2, spawnedAgents: 3 }   # process: autonomous only (since e44df3f)
# decision: { mode: optional }      # 1.4.0: none | optional | required (any case); unset: "unspecified" (§ Decision tasks)
```

No `agents:`/`tasks:` key here (they live in the folders), no `mounts:` block (see `studio-layout.md`),
no `crew:` wrapper, no `circuitBreaker:` and no `graphConfig:` (both retired: the load fails and names the `graph` block).

`budget:` (since e44df3f, #218; `CrewBudgetYamlConfig`, mapped to `CrewBudget` by `YamlCrewMapper.MapBudget`) bounds
one run of a `process: autonomous` crew, its manager, the agents it delegates to and those they spawn: `tokens` (the
running sum of prompt plus completion of every call), `wallTimeSeconds`, `toolCalls`, `delegationDepth`,
`spawnedAgents`. A key left out keeps its default — no token cap, no wall time, 50 tool calls, depth 4, 10 spawned
agents. `CrewDefinitionValidator` refuses it on any other process (`Crew 'x' budget: the Sequential process spends no
budget. Remove budget:, or use process: autonomous.`) and a limit of 0 or less (`… every limit of a crew's budget must
be 1 or more. Leave the key out for its default.`). Before e44df3f the key did not exist (an autonomous run used
`AgentExecutionBudget.Permissive`).

### Graph

`graph:` (1.2.0; `GraphYamlConfig`, upstream `docs/architecture/yaml-schema.md` § Graph configuration, ADR-018) is read
under `process: graph` only — elsewhere the load fails (`Crew 't' declares graph:, which only process: graph reads, and
its process is 'sequential'. Remove graph, or set process: graph.`). Its keys, all optional: `start`, `nodes`, `edges`,
`circuitBreakerPreset` (`strict` by default, `default`, `permissive`), `maxTransitions`, `maxVisits`,
`maxTotalDurationSeconds`; any other is refused (`'graph.maxRetryCycles' is not a key Orkeon reads. It reads: start,
nodes, edges, circuitBreakerPreset, maxTransitions, maxVisits, maxTotalDurationSeconds.`).

```yaml
process: graph
graph:
  start: triage                      # optional: the first node by default
  nodes:                             # optional: absent = one node per task, named after it
    - { id: triage, task: triage }
    - { id: fix, task: fix }
    - { id: escalate, task: escalate }
  edges:
    - { from: triage, to: fix, when: { triage.category: [bug] } }
    - { from: triage, to: escalate } # no when: the "otherwise"
    - { from: fix, to: END }
    - { from: escalate, to: END }
  maxVisits: 5                       # visits of ONE node; default: the sum over the tasks of 1 + their retries
  maxTransitions: 50                 # default: 2 x visits + 1
  maxTotalDurationSeconds: 600       # overrides the preset's duration
```

- Without `graph:`, or with budgets only, the crew runs one node per task, chained in execution order; a node whose task
  fails ends the run (no routing on failure: a retry is the task's `retry:`).
- Several edges from one `from` are one conditional edge, evaluated in the order declared: the first whose `when` holds
  wins, the edge without `when` is the "otherwise". A `from` with `when` edges is a decision task and has exactly one edge
  without `when`; an ordinary task has exactly one edge. The `when` keeps the grammar of the task-level one. A loop is an
  edge leading back to a node, bounded by `maxVisits`; on a revisit the latest output and decision win.
- Refused at load, naming the node or the task: a `when` on a `from` that is no decision task, a decision with no edge
  without `when`, two edges without `when` from one node, several edges on an ordinary task, an orphan node, a node with
  no way to `END`, an edge to an unknown node, a task run by two nodes (or by none once `nodes` is given), `START` or `END`
  as a node id, and a task-level `when:` or `dependencies:` in a crew that has nodes or edges.
- `graphConfig:` is retired (`'graphConfig' is retired: the graph block replaced it — write graph: {
  circuitBreakerPreset, maxTransitions, maxVisits (formerly maxStateVisits), maxTotalDurationSeconds, and the nodes and
  edges }; a retry of a failed task is the task's own retry:, and there is no maxCycles.`). The Graph process no longer
  retries a failed task by itself.

## `crew/agents/<id>.yaml` — an agent

```yaml
role: "Web researcher"
goal: "Find recent, reliable sources on the requested topic"
backstory: |
  Rigorous information specialist. Always cites the URL of every fact, discards anonymous
  sources or sources more than a year old, and flags what it could not verify.
tools: [web_search, web_scrape]
allowDelegation: false              # default true!
# workingRoot: /workspace/sub       # since e44df3f (RT-06; working_root accepted): confines the agent's file tools and shell_command to this virtual path
# filesystem: [/mailbox, { path: /output/drafts, access: rw }]   # 1.1.0: the ONLY virtual paths this agent's tools may touch; a list of paths or {path, access: ro|rw|rwnd}
# announce_mounts: false            # default: the crew's; lists the agent's virtual paths and working root in its system prompt (announceMounts accepted)
# permissionMode: plan              # default | acceptEdits | bypassPermissions | plan | dontAsk; read by the permission gate once Orkeon:Security:PermissionGate:Enabled is true
maxIter: 10                         # default 20; 0 or less: load fails
# verbose: false                    # true: this agent's turns at Information, category Orkeon.Verbose
# maxRpm: 10                        # requests per minute of this agent: one more waits; unset: no limit of its own; 0 or less: load fails
# maxExecutionTime: 600             # whole seconds a task may take on this agent: past it the task fails; unset: no limit; 0 or less, a decimal, above 4294967 or on a hierarchical manager: load fails
# llm:                              # applied to every call of the agent
#   temperature: 0.2                # sent whatever its value; unset: the profile's, else none is sent
#   maxTokens: 2000                 # unset: the model's documented maximum (4096 for a model the catalogue does not know); 0 or less: load fails (since 13461ea)
#   topP: 0.9
#   thinking: { enabled: true, effort: medium }    # low | medium | high | xhigh | max, any case since 1.4.0; or auto, or { auto: true, min, max }; enabled: true | false | auto (below)
#   responseFormat: json_object                     # text | json_object | json_schema
#   responseSchema: { name: note, strict: true, schema: '{"type":"object"}' }
#   cache: { system: true, tools: false, ttl: 1h }  # Anthropic prompt caching; ttl 5m | 1h, else load fails (since f80665f); ttl with neither system nor tools fails (since 0ea39d9); {} = explicit off, which beats the host's Llm:Cache
#   profile: claude                 # a host LLM profile (Llm:Profiles:<name>); unknown: load fails; auto (1.4.0): System One picks on Orkeon:Decision:Route:Ladder (below)
#   model: some-model               # unset: the profile's own model
# guardrails:                       # rendered in the system prompt, before the task's
#   preset: analysis                # analysis | strict | creative; any other: load fails
#   rules: ["Never make up a URL."]
#   toolRules: { web_scrape: ["One page per call."] }   # shown only when the agent holds the tool
# knowledge: [product-kb]           # attaches a rag: collection (§ RAG)
# skills: [/workspace/skills/review.md]           # 1.4.0: virtual paths of markdown files; or { auto: true, fallback: [...] } (below)
# compaction: { enabled: true, triggerShare: 0.75, prune: false }   # 1.4.0: the agent loop's compaction of its context (below)
```

The file name is the id. Required: `goal` (`role` falls back to the id).

`maxRpm` is applied (sliding window of 60 s per declaring agent or crew, `RequestRates`): the request of
too many waits — it never fails the task —, and one Information line says who waited, how long and under
which limit (`Agent Writer waited 59.8 s for its model request: agent 'Writer' maxRpm 1`). The host's
`RateLimiting:AgentRequestsPerMinute` (20) bounds each agent too, the stricter of the two winning
(`design/sizing-and-cost.md` § 1).

`workingRoot` (`working_root`; `AgentYamlConfig.WorkingRoot` → `AgentConfiguration.WorkingRoot`, since e44df3f, RT-06)
roots the agent's run scope: a relative path of a file tool or `shell_command` resolves under it, a path outside it
is refused. Unset: nothing changes. The load does not check it; the run start refuses a root that is relative, holds
`..` or lies under no mount (`The agent working root '/x' is not under any mount of the file system.`,
`Orkeon.Application/Agent/AgentWorkingRoot.cs`).

`filesystem:` (1.1.0, #349; C# `AgentBuilder.FileSystem`, `.filesystem([...])` in `.ork.ts`) declares the only virtual
paths the agent's tools may touch: each entry selects and narrows the mount that holds it, never widens it; every other
path is refused during the agent's tool calls, on every mount, and `list_mounts` lists the scope. The load refuses a
value that is not a list (`Agent 'a' filesystem: expected a list, each item a virtual path or a map with path and
access; got '/output'. Write each path as an item: '- /workspace/docs'.`), an empty list, an unknown key or `access`; the
run start refuses an entry under no mount or above the mount's rights, naming the agent and the entry (`--validate`
passes it). A `workingRoot` must lie inside the scope; a spawned or delegated child runs under its parent's scope.

`announce_mounts` (1.1.0, #348; crew and agent, `announceMounts` accepted): an agent holding a file-system tool gets a
`## File system` section in its system prompt — its scope, else the run's agent-facing mounts with their rights, and
its working root. `false` turns it off, for one agent or, at crew level, for every agent that sets none.

`permissionMode` (rc.7, FWK-06): the mode the permission gate reads for this agent's tool calls, YAML crews included,
once `Orkeon:Security:PermissionGate:Enabled` is true; unset, `Orkeon:Security:PermissionGate:DefaultMode`. Another value
fails the load (`Agent 'a' permissionMode: 'foo' is not one of default, acceptEdits, bypassPermissions, plan, dontAsk.`).

The `effort` of `thinking` takes five levels since e44df3f (`LlmThinkingConfig.Levels`: `low`, `medium`, `high`,
`xhigh`, `max`). A provider declares the levels its field knows (`LlmProviderCapabilities.EffortLevels`), and since 1.1.0
(#356) a per-model capability table narrows them: an effort the provider or a listed model does not take is sent as the
highest level below it that both take, with a warning; thinking asked on a model that does not reason, or switched off on
one that always does, is dropped with a warning (`llm-profiles.md`).

**System One's picks** (1.4.0, checked on the published CLI, V-68). Each of these lets the decision model choose at run
time; with the decision circuit off (no decision provider, the workshop's default) it picks nothing, with a warning at
run start, and a crew with `decision.mode: none` refuses each at load (`Agent 'a' declares thinking: { effort: auto },
which System One picks and a crew with decision.mode: none refuses: write a level instead.`).

- `thinking.effort` takes the five levels in any case, `auto`, or `{ auto: true, min, max }`; the load refuses another
  value (`'extreme' is not a thinking level: write one of low, medium, high, xhigh, max, 'auto' …`), a map without
  `auto: true` or with another key, a `min` above its `max`, and bounds that keep none of the host's levels
  (`Orkeon:Decision:Effort:Levels`, default `low, medium, high`, lower case and cheapest first, else Orkeon refuses to
  start). Circuit off: the effort the task would have had without `auto`. `Llm:Thinking:Effort` (or a profile's) may not
  be `auto`: Orkeon refuses to start. `thinking.enabled` is `true`, `false` or `auto` (off for a trivial task).
- `llm.profile: auto` (agent, crew, a task's `llmOverride`) needs `Orkeon:Decision:Route:Ladder` in the host's settings:
  two profiles or more, each defined (`default` included), cheapest first, none blank, repeated or `auto` (a one-rung
  ladder refuses the start); no `model` beside it, the crew's included. `auto` is a reserved name under `Llm:Profiles`
  and `Orkeon:Decision:Profiles`. Circuit off: each task runs on the default profile. In `.ork.ts`, `.withProfile("auto")`
  on a task is read; `llm.profile("auto")` on an agent is refused (`typescript-dsl.md`).
- `skills:` is a list of virtual paths (an empty item refused), or `{ auto: true, fallback: [...] }` — keys `auto` and
  `fallback` only, case-sensitive, `auto` written `true` (`yes` and `false` refused). Circuit off: the fallback list, or no
  skill.
- `compaction:` takes `enabled` (true or false), `triggerShare` (above 0, at most 1) and `prune` (true: the decision
  model judges what to drop; refused under mode `none`).

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
# retry: { attempts: 3, backoffMs: 250, backoff: exponential }   # attempts required (runs in all, 1 or more); backoffMs 0 by default; backoff fixed (default) | exponential. Replays the WHOLE task
# humanInput: false                 # auto-approved without --events; with checkpointing the question is durable: the run can stop on it (exit 75) and resume with --resume <id> --input
# tools: [count_pattern]            # ADDED to the agent's tools for this task only; resolved strictly like the agent's
# deliverable:
#   path: /output/note.md
#   source: final_message           # tool_call (the default: the agent writes the path itself) | final_message | structured_output (requires schemaPath/schemaInline) | none
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
#   cache: { system: true, tools: false }        # since 13461ea, the agent's shape; a block with no breakpoint turns the agent's cache off for this task (and, since f80665f, the host's Llm:Cache)
#   responseSchema: { name: note, strict: true, schema: '{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}' }
# guardrails:                       # same shape as the agent's; rendered after the agent's
#   rules: ["Never make up a URL."]
# context: { language: en }         # side data (mapping), NOT an ordering; reaches the hierarchical/autonomous manager only
# decision:                         # since e44df3f: a decision task — no agent:, answered by the decision model (below)
#   questions:
#     category: { choice: { bug: a defect, billing: an invoice question } }   # or score: [low, medium, high], or noul: "statement"
#   minConfidence: 0.6              # default 0.5, in [0, 1]
#   state: [ticket]                 # tasks whose output is judged; added to dependencies
#   longContext: false
#   fallback: { category: bug }     # the answer when the decision circuit is off; refused under decision.mode: optional
#   without: { agent: triager, instructions: "Pick the category." }   # 1.4.0, decision.mode: optional only (required there): the agent that answers when the circuit is off
# when: { triage.category: [bug] }  # since e44df3f: runs only when that decision task answered so; else skipped
```

Required: `description`, `expectedOutput` — not on a decision task since 1.4.0 (#476). `llmOverride` has no `model`; it has a `cache` since 13461ea
(read, sent and exported; dropped at load before). Neither `llm` nor
`llmOverride` has a `callMode` key at 1.2.0: the YAML loader reads none (`YamlConfigModels.cs`), so it is
refused at load like any unknown key (ignored before 63be532) — the call mode is a host setting, `Llm:CallMode` or
`Llm:Profiles:<name>:CallMode` (`llm-profiles.md` § 3). In
`hierarchical` and `autonomous`, `agent:` is not followed: the manager assigns; in `consensual` every agent
runs every task.

**`retry:`** (rc.7, FWK-15; `taskBuilder().retry({...})`, `CrewTaskBuilder.Retry`): a failed task runs again, in every
mode, up to `attempts` runs in all. A new attempt replays the whole task, the tool calls that already succeeded
included — nothing deduplicates them, so the tools of a retried task must be safe to run twice. Never retried: a
cancellation, a Guardian refusal (`GuardianBlocked`), an exhausted budget; a timeout (`ExecutionTimeExceeded`) and an
exhausted fallback chain are. Each retry emits a `task.started` carrying `attempt`; only the attempt that ended the task
is checkpointed. The load refuses a block without `attempts` (`Task 'o' retry: attempts is required, the number of times
the task may run (1 or more).`), `attempts` below 1, a negative `backoffMs`, another `backoff`, and a `retry:` on a
decision task (`Task 'tri' is a decision task and cannot declare retry:, a decision runs no agent. Remove retry.`).

**A `tool_call` deliverable is checked at load** (1.2.0, #392): when no agent able to run the task holds a built-in tool
that writes the path (`file_write` for a text file, never a binary one; `docx_writer`, `xlsx_writer`,
`image_generation`, `firefox` for their formats), the load logs a warning and `--validate` prints it as one `WARNING:`
line on stderr, exit code unchanged (`WARNING: Task 'one' declares the deliverable '/output/x.docx' (source tool_call),
but its agent 'a' has no tool that writes it (docx_writer): the file may not be written. Give the agent docx_writer, or
deliver a text format (.md, .html, .csv) instead.`). A toolbelt holding a tool Orkeon does not ship (MCP, script, plugin)
is not warned about. A decision task that declares a `deliverable:` gets its own warning (`Task 'tri' is a decision
task: its deliverable '/output/a.md' is never written, …`). At run time a successful task that did not write its
`tool_call` deliverable keeps `Success` and is flagged `deliverableMissing` on `task.completed` (`cli.md` § 3).

**Decision tasks and `when:`** (since e44df3f, #234, ADR-016; `DecisionYamlConfig`, `QuestionYamlConfig`,
`TaskDecision.Create`, `DecisionTaskRules`, `WhenClauseParser`). A task with a `decision:` block runs no agent: it
sends its state and every question to the active decision provider (TypeSafe, Liquid or Kev since 0ea39d9,
`llm-profiles.md` § 3) in one request, and its output is the answers; an answer outside a question's options fails the
task, with no retry (1.2.0: a decision task cannot declare `retry:`, and the graph's former retry cycles are gone). A question declares one of `choice` (option → description), `score` (ordered levels) or `noul` (a
yes-no statement), plus `instructions`; names are unique. `minConfidence` defaults to 0.5
(`DecisionLimits.DefaultConfidenceFloor`); `state` lists the tasks whose output is judged (default: the dependencies
that ran) and, like the decision task a `when:` names, is added to the task's dependencies. `fallback` maps a question
to an answer of it (quote `"no"`), used when the decision circuit is off (`orkeon run --no-decision`,
`Orkeon:Decision:Enabled=false`, or no decision model) and never when a configured provider is down: unreachable, timed
out, 429 or 5xx after its retries, the decision task fails with the reason (`DecisionTaskRunner`, `llm-profiles.md` § 3).
With the circuit off, the run stops at entry on a decision task that has neither a `fallback` nor an `otherwise` task
(`DecisionPreflight`, D96; since 1.4.0 `--validate` only warns, `WARNING: a run would be refused now …`, and the run
exits 2).

**The crew's decision mode** (1.4.0, `decision: { mode }` in `config.yaml`, `.decision({ mode })` on `crewBuilder()`;
checked on the published CLI, V-68; the success line of `--validate` ends `decision=<mode>`, `unspecified` when unset):
- unset — as above: a `fallback` or an `otherwise` task, a `without:` refused (`… declares a without: relay, which needs
  decision.mode: optional on the crew.`);
- `none` — no decision task, no `without:`, no `system_one_decide`, nor any of System One's picks (§ agent);
- `optional` — at least one decision task (and a process that runs them); each carries `without: { agent, instructions }`,
  whose agent answers the questions when the circuit is off, and no `fallback` (`… never uses (the model answers with the
  circuit on, the relay with it off): remove it.`); no `system_one_decide`;
- `required` — every run without a decision provider is refused (`crew 'x' requires System One (decision.mode:
  required) and the decision circuit is off …`, exit 69; `--validate` warns); a `fallback` or `without:` is warned as
  never used. The workshop's teams must run without a provider (D96): `check_crew.py` refuses it.

A crew that lists `system_one_decide` with the circuit off passes `--validate` with a warning, and its run stops before
its first task (`references tool 'system_one_decide' withheld`, exit 2). A later task's `when:` names one decision task:
`<task>.<question>: [a, b]` (a choice, at or above the floor; an unquoted `no` in the list is refused since 1.4.0 — quote
it —, and a list on a `score` question is refused), `<task>.<question>: ">= 0.7"` (a yes-no probability or a
score's level position, 0 to n-1), `<task>.<question>.<option>: ">= 0.25"` (one option's probability), or
`<task>: otherwise`, alone; every clause must hold (an `otherwise` never holds by itself since 0ea39d9: its task runs only when no
sibling condition did). A false condition **skips** the task (it does not fail it), a task
whose dependencies were all skipped is skipped too, and a skipped task leaves nothing in later context. The load
refuses a task with both `agent:` and `decision:`, more than one kind on a question, a fallback naming an unknown
question or answer, a `when:` on a task that is no decision task or naming an unknown question or option, a misplaced
or duplicated `otherwise`, an empty `when:`, and any decision or `when:` outside `sequential`, `parallel` and `graph`
(`Task 'triage' declares a decision or a condition, which the Hierarchical process does not support.`); since 0ea39d9 also
a `minConfidence` that is not a finite number and a `score` whose levels repeat. A crew made of decision tasks
only is still refused at 1.2.0: `--validate` says `Invalid crew configuration: At least one agent is required.`
(`CrewDefinitionValidator.ValidateAgents`; YAML and `.ork.ts` alike, V-54; run again on the 1.2.0 CLI for YAML) — the strategies only
moved their own `No agents available` check. A crew declares one agent. A failed or cancelled decision
stops its dependants in `parallel` and `graph`. In a `graph` crew with a `graph:` block, the routing on a decision is
written on the edges (§ Graph), and a task-level `when:` is refused there.

## Memory, planning, RAG — what the keys do at 151a762

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
`expectedOutput` (a decision task's `description` only, since 1.4.0); an `agent:`, `dependencies:` entry or `managerAgent` that names nothing; `dependencies`
cycles; unknown tools, on an agent or a task (strict resolution); an unknown LLM `profile`; unknown
`process`; `hierarchical` without a manager; a `managerAgent` in a mode without one; `asyncExecution: true`
outside `sequential`/`parallel`; `memoryProvider` without `memory: true`, or naming no provider (`inmemory`,
`redis`, `sqlite`, `chromadb`, `pinecone`, `lancedb` and their aliases); a `maxRpm` (crew or agent) or a
`maxIter` of 0 or less; since f80665f a `cache` `ttl` other than `5m` or `1h` — agent, crew `llm` or task
`llmOverride` (`cache ttl must be 5m or 1h, not '10m'; leave it out for the vendor default. (Parameter 'ttl')`), and since
c101cbd a `ttl` with neither `system` nor `tools` (`cache ttl caches nothing on its own: mark the system prompt or the tools
as well. (Parameter 'ttl')`) and a `thinking.effort` outside `low`, `medium`, `high`, `xhigh`, `max` in lower case
(`thinking.effort: Unknown thinking effort 'High': …`; at 151a762 `High` passed) — both checked on the build, V-54; since
1.4.0 any case is read, and the forms above (§ agent) with their refusals (V-68);
the crew's decision mode and System One's picks (above);
a `budget:` outside `autonomous` or a limit of 0 or less; the `decision:` / `when:` rules
above; the `graph:` rules (§ Graph) and a `graph:` outside `process: graph`; a malformed `retry:` or one on a decision task; an
unknown `permissionMode`; a `filesystem:` that is not a list, is empty or carries an unknown key or `access`; an unknown `guardrails.preset`, a
tool written twice in `toolRules`; every key no model reads, a retired key (`circuitBreaker:` and
`circuit_breaker:`, `graphConfig`, `rag.provider`), a duplicate key, a `<<:` merge key (above); unknown `deliverable.source`;
`structured_output` without a schema; invalid or malformed YAML (list instead of mapping,
`responseSchema.schema` as a mapping). A message names an agent or a task by its key — the file name —
(`Invalid crew configuration: Agent 'researcher' must have a goal.`).

Since rc.7 `--validate` also type-checks a `.ork.ts` (`typescript-dsl.md`). **Warned, not refused**: a `tool_call`
deliverable no agent can write, a `deliverable:` on a decision task (above).

**Not checked** (passes silently): a `workingRoot` or a `filesystem:` entry under no mount (refused at run start); a `memoryProvider` whose host section is missing;
an unknown `responseFormat` (forwarded, with a warning); unknown `links.direction` (warning only).
Hence `scripts/check_crew.py`, to run **before** `--validate`.

## Discrepancies between `docs/architecture/yaml-schema.md` and the code

At 151a762 that page describes the agent and crew `llm`, the agent `guardrails`, task `tools`, `memory`,
`planning`, `asyncExecution`, `managerAgent`, `maxRpm`, `maxIter`, `maxExecutionTime` and `verbose`, a task's
`llm_override` `cache` and the refusal of a `max_tokens` of 0 or less, `rag.provider`, the RAG `profile` keys
and the removal of `circuitBreaker` as the code does. At acd59d6 it also stated the key check (GAP-50) as the code does, and the
discrepancy recorded before (`circuit_breaker:` let through) is gone: the snake_case key is refused as
retired. At e44df3f it adds `working_root`, the five effort levels, the crew `budget:` (its former "not implemented
in YAML" warning is gone) and a section on decision tasks and conditions, read against the code above. At 151a762 it
does not yet say that a `ttl` other than `5m` or `1h` fails the load, nor that a `cache` block marking nothing is an explicit
off that also turns off the host's `Llm:Cache` (`LlmCacheConfig.Request`, V-48): follow the code. No discrepancy
is known at 151a762. At 1.2.0 the page describes `graph:`, `retry:`, `permissionMode`, `filesystem:`, `announce_mounts`,
the crew's `mounts:` and `links:`, and the deliverable check as quoted above (read 2026-11-17; the messages run on the CLI).

## Repository examples to imitate

- `examples/crew-multifile/` — the minimal `config.yaml` + `agents/` + `tasks/` layout.
- `examples/quickstart/` — the smallest sequential crew; `orkeon quickstart` writes it, byte for byte, since acd59d6 (`cli.md` § 6).
- `examples/01-enterprise/02-code-review/config.yaml` — `hierarchical` + `managerAgent` + fan-out dependencies.
- `examples/01-enterprise/04-financial-reports/config.yaml` — `parallel`.
- `examples/01-enterprise/11-translation-consensus/config.yaml` — `consensual` + `memory`.
- `examples/09-experimental/102-graph-orchestration/config.yaml` — `process: graph` + the `graph:` block.
