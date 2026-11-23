# Sizing and cost — limits, budgets and estimates

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: `src/core/Orkeon.Infrastructure/Configuration/Yaml/YamlConfigModels.cs`, `YamlCrewMapper.cs`, `CrewDefinitionValidator.cs` and `Yaml/CrewYamlKeyCheck.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`, `src/scripting/Orkeon.Scripting/Adapters/JsCrewConfigurationAdapter.cs`
> and `Builders/JsAgentBuilder.cs`, `src/scripting/Orkeon.Scripting/Typings/llm.d.ts`, `src/core/Orkeon.Application/Crew/Execution/ChatClientAgentLoop.cs`,
> `ChatOptionsComposer.cs`, `AgentPromptComposer.cs`, `ConversationPolicy.cs`, `RequestRates.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Domain/Constants/Llm/LlmDefaults.cs`, `src/core/Orkeon.Infrastructure/LLMs/Profiles/LlmSettings.cs`,
> `src/core/Orkeon.Infrastructure/Security/LlmRateLimiter.cs`, `src/core/Orkeon.Infrastructure/LLMs/RateLimitedLlmProvider.cs`,
> `src/core/Orkeon.Application/Configuration/RateLimitingOptions.cs`,
> `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs`, `src/core/Orkeon.Domain/Constants/Resilience/ResilienceDefaults.cs`,
> `src/core/Orkeon.Domain/Tools/ToolResultLimitsOptions.cs`, `src/core/Orkeon.Domain/Crew/ValueObjects/CrewBudget.cs`, `src/core/Orkeon.Infrastructure/Crew/Strategies/GraphProcessStrategy.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`,
> `src/constants/Orkeon.Constants.Llm/LlmModelOutputLimits.cs`, `src/scripting/Orkeon.Scripting.Cli/Commands/Run/RunEvents.cs` and
> `ObservedRunContext.cs`, `src/core/Orkeon.Application/Interfaces/Ports/LlmUsageOperations.cs`, `docs/reference/limitations.md`,
> `CHANGELOG.md` `[1.0.0-rc.5]` and `[1.0.0-rc.6]` (STUDIO-29, -30, -42, GAP-03, GAP-07, GAP-17, GAP-36, GAP-38, GAP-48) (main at 151a762); harness
> `claude/templates/bench.config.json`, `bench/src/domain/bench-config.ts`, the image's `init-orkeon.sh` and
> Dockerfile, `VERIFICATIONS.md` (V-04 to V-06 observed on 1.0.0-rc.4 and main at 24ab0d0, V-14). What changed since is
> read in the sources; the `llm:` block, `maxRpm` and `maxIter` were run on a build of fb26364 (V-14).

Cost follows LLM calls, and calls follow iterations, retries and the mode. This document lists every
limit that exists at 151a762 — and the ones that look like limits but are not — then how to estimate tokens,
money and time per task and per run, and how `tests/<slug>/bench.config.json` caps them. Mode costs:
`design/team-patterns.md` § 10; providers, the local model and its settings: `orkeon/llm-profiles.md`.

## 1. The knobs, and what they really do

**In the crew** (exact keys: `orkeon/yaml-schema.md`):

| Key | Where | Default | Effect at 151a762 (per the sources) |
|---|---|---|---|
| `maxIter` (YAML) · `.maxIterations(n)` (TS) | agent | 20 (C# too) | LLM calls of the main loop for **one execution of one task**; 0 or less fails the load |
| `llmOverride.maxTokens` | task (YAML) | unset | output cap of every call of that task (a positive integer: 0 or less fails the load since 13461ea, here as on an agent's or the crew's `llm`); unset → the agent's `llm.maxTokens`, else `MaxTokens` of the profile in use (`Llm:MaxTokens` for the default), else the model's documented maximum (`LlmModelOutputLimits`), else **4,096** for a model the table does not know (the V-06 stub request carried `max_completion_tokens: 4096`); Ollama receives a cap (`num_predict`) only when one is set (`orkeon/llm-profiles.md` § 3) |
| `llmOverride.temperature` · `topP` · `thinking` · `responseFormat` · `cache` (since 13461ea) | task (YAML) | unset → the agent's `llm:`, else the profile's (`Llm:Temperature`…), else **not sent** — the model's own | sent with every call of the task, whatever its value — as written since 13461ea (`0.7`, not `0.699999988079071`); a `cache` block with no breakpoint turns the agent's cache off for the task — since f80665f the host's `Llm:Cache` too (§ 7) |
| `llmOverride.profile` · `.withProfile(id)` (TS) | task | unset → the agent's profile | the task's calls go to that profile's provider: another endpoint, another price (`orkeon/llm-profiles.md` § 3) |
| `llm:` (`profile`, `model`, `maxTokens`, `temperature`, `topP`, `thinking`, `cache`…) · `.llm(llm.profile(id, {…}))` / `.llm(llm.model(name, {…}))` (TS) | agent, crew (merged into each agent) | unset → the default profile, its model | **applied** to every call of the agent's turns, a task's `llmOverride` winning for that task (`CrewFactory` → `WithLlmConfig`). At 24ab0d0 the block was dropped (V-14: 0.7 and 4,096 sent for an agent declaring 0.22 and 777); a build of fb26364 sent 0.22 and 777 (V-14). A `profile` or a `model` changes what a call costs — size and price per agent |
| `maxRpm` (YAML; `max_rpm` accepted) · `.maxRpm(n)` (TS) | agent · crew | none | **applied**: at most *n* model requests per minute, over a sliding 60 s window per declaring agent or crew — an agent's counts each turn of its loop, its tool-free retry and its correction round; a crew's counts those of all its agents and its manager together, parallel waves included. The request of too many **waits** (it never fails the task) and one Information line says who waited, how long and under which limit; with `maxRpm: 1`, a build of fb26364 sent the agent's second request 60 s after the first (V-14). 0 or less fails the load. Leave it unset unless a provider's quota asks for it: its waits are run time (§ 6) |
| `maxExecutionTime` (YAML, whole seconds; `max_execution_time` accepted) · `.maxExecutionTime(s)` (TS) | agent | none | **applied** since f59446b: the longest one task may take on this agent, the wait for a human input not counted; past it the task fails (`ExecutionTimeExceeded`) and the run with it. 0 or less, a decimal, above 4294967 or on a `hierarchical` manager fails the load. Size it well above the slowest good run of the task (a local model, a long answer): it caps a stuck task, not a slow one |
| `retry:` (`attempts`, `backoffMs`, `backoff`) · `taskBuilder().retry({...})` (TS) | task, every mode (1.2.0) | none — the task runs once | a failed task runs again, **whole**, up to `attempts` runs in all (the first included); `backoffMs` 0, `backoff` `fixed` or `exponential` (doubling, capped at five minutes). Each attempt costs the task again; never retried: a cancellation, a Guardian refusal, an exhausted budget; refused on a decision task |
| `graph:` (`maxVisits`, `maxTransitions`, `maxTotalDurationSeconds`, `circuitBreakerPreset`; `start`, `nodes`, `edges`) | crew, `graph` only | `maxVisits` (visits of one node) the sum over the tasks of `1 + retries` and `maxTransitions` twice that plus one unless set; 10 min (preset `strict`) | run duration, visits of a looping node — size it (`design/team-patterns.md` § 5). `graphConfig`, `maxRetryCycles` and `maxStateVisits` are gone: the load refuses them |
| `circuitBreaker` | crew · task | — | **refused at load** (`CrewYamlKeyCheck`): `graph:` carries the graph's limits |
| `budget:` (`tokens`, `wallTimeSeconds`, `toolCalls`, `delegationDepth`, `spawnedAgents`) · `.budget()` (TS) | crew, `autonomous` only | no token cap, no wall time, 50 tool calls (the tasks handed out), depth 4, 10 spawns (`CrewBudget`) | the autonomous run stops when one limit runs out; each value at least 1; on another process it fails the load (`CrewDefinitionValidator`, `JsCrewConfigurationAdapter`) — set `tokens` and `wallTimeSeconds`, the defaults cap neither (`design/team-patterns.md` § 8) |

**Fixed in the code** (`AgentDefaults`, `AgentPromptComposer`, `ChatClientAgentLoop`): tool result
4,000 characters (`file_read` 32,000, `node_read` 256,000, `shell_command` 10,000, the analysis tools 12,000 since c101cbd — per tool under
`Orkeon:Tools:ResultLimits:Limits:<tool>` in the settings since rc.6, `ToolResultLimitsOptions`; a result the tool already bounded is not cut again); conversation compacted by default since 1.4.0 (#432; it was cut to 40 messages
before): past `Orkeon:Compaction:TriggerShare` (0.75) of the usable window, one summary call — charged to the task —
replaces the older turns, the last `KeepRecentTurns` (6) kept; the window is `Llm:ContextWindowTokens` (or
`Llm:Profiles:<name>:ContextWindowTokens`), else the model's documented one, else `Orkeon:Cli:Session:ContextWindowTokens`
(200,000) with one warning per profile, and on that assumed figure the 40-message trim stays beside compaction — set
`ContextWindowTokens` for a small local model the table does not know; `Orkeon:Compaction:Enabled=false` or an agent's
`compaction: { enabled: false }` restores the trim alone (`orkeon settings Orkeon:Compaction`, 1.4.0 CLI); previous outputs 8,000 characters in
total; three identical tool errors in a row stop the task; up to two hand-backs of a malformed tool-call
answer; one tool-free retry (escalated once) after an empty answer, and always after an exhausted `maxIter` (§ 2); `hierarchical`
three reviews. The three rounds of `consensual` are a setting, below.

**In the settings** (the machine's `~/.config/Orkeon/appsettings.json` — or the team's own
`settings/<slug>/appsettings.json`, which its launchers pass instead, D33 — or `ORKEON_*` variables for one
run; `orkeon settings <section>` lists every key of a section with its default, offline, since bd3420c):

| Setting | Default | The image | Effect |
|---|---|---|---|
| `Llm:TimeoutSeconds` | 30 | **600** | HTTP timeout of one call; a timed-out call is retried **once**, then the task fails. Each `Llm:Profiles:<id>` has its own, 30 when unset |
| `Llm:CallMode` | `Auto` | — | how a call reaches the model, whoever makes it (agent turn, manager, planner, judge, RAG): `Auto` streams on the wire when the provider streams natively and folds the stream into the same answer, tool calls and usage as a buffered call — a clear refusal of streaming before any event (404, 405, 415, 501, a 400/422 naming the stream) falls back to `Buffer` for the rest of the run, with one warning; `Buffer` answers whole; `Stream` fails the call on a refusal. Case ignored; another value fails the load (`LlmCallMode`, `CallModeLlmProvider`, e44df3f, STUDIO-71). Each `Llm:Profiles:<id>` has its own |
| `Llm:StreamIdleSeconds` | unset | **120** | the longest silence between two chunks of a streamed answer — under `CallMode` `Auto` (the default) every call of a provider that streams natively, `--stream` or not; none under `Buffer`; elapsed, the call fails naming the setting instead of hanging (ce9ec1f, LLM-12; D46). Each `Llm:Profiles:<id>` has its own |
| `Llm:MaxRetries` | 10 | — | retries of transient errors (5xx, 408, 429, transport), back-off capped at 30 s — except a 429 (or a 529 with a reset header) that announces its window (`Retry-After`, `retry-after-ms`, the providers' reset headers): that call waits the window instead (`RateLimitResetHeaders`, `ResiliencePolicies`) |
| `Llm:MaxRateLimitWait` | `00:05:00` | — | the longest announced rate-limit window a call waits out; a longer one fails the call at once with a rate-limit error; `00:00:00` waits for nothing (`ResilienceDefaults.DefaultMaxRateLimitWait`) |
| `Llm:MaxTokens` · `Llm:Temperature` | unset · unset (none sent) | — | defaults for every call on the default profile that neither the agent nor the task sets |
| `RateLimiting:GlobalRequestsPerMinute` · `ProviderRequestsPerMinute` · `AgentRequestsPerMinute` | 60 · 30 (per provider) · 20 (per agent instance) | — | sliding one-minute windows. The global and per-provider caps count **every** model call of the host once, at its provider's entrance: agent turns, the manager, the planner, RAG, judges, memory, a script's `ctx.llm` (embeddings do not). The per-agent cap bounds each agent's own window together with its `maxRpm`, the stricter winning: a request over it **waits** its turn |
| `RateLimiting:MaxConcurrentRequests` · `QueueLimit` | 0 (unlimited) · 5 | **1 · 32** | in-flight calls, one gate for every profile of the run (a remote profile's calls wait behind the local ones); the global, per-provider and concurrency caps each hold `QueueLimit` waiting calls; a call beyond the queue is refused, retried five times after the limiter's delay, then **fails as a failed call** — the turn, and with it the task |
| `Orkeon:Scripting:Limits` (TypeScript) | 100 MB cumulative · 30 s wall clock · recursion 64 | — | the script engine; `--memory-limit-mb` overrides the memory. `MemoryLimitBytes` counts what the script allocates on the engine's thread **during one run** since 0ea39d9 (the window reset when the run starts, no longer since the engine was created); the execution of a host tool is left out, not the rest of `ctx.llm.act` (`ScriptingLimitsOptions`, `HostWorkMemoryConstraint`) |
| `Orkeon:Consensus:MaxVotingRounds` | 3 | — | voting rounds of a `consensual` task, every agent running it in each round (`design/team-patterns.md` § 7) |

There is no run timeout in the crew, and a task has one only when its agent declares `maxExecutionTime`
(since f59446b). A run ends when its tasks end, when one fails, on Ctrl+C, or when the bench
stops it.

## 2. Sizing `maxIter`

An iteration is one LLM call; the tools the answer asks for run, their results join the conversation, and
the next call starts. A capable remote model may ask for several tools in one answer; a small local model
asks for one. Count the calls the task needs — one per tool call it must make, plus one for the final
answer — and add 2 or 3:

| Task | Calls needed | `maxIter` |
|---|---|---|
| write from the context, no tool | 1 | 3 to 4 |
| read 1 to 3 known files, then answer | 2 to 4 | 5 to 7 |
| list a folder, process N files one by one | N + 2 | N + 4 (keep N small: § 4) |
| web research (search, scrape 3 to 5 pages) | 5 to 8 | 10 to 12 |

With two iterations left the agent is told so once, while it can still act (1.2.0, #388; nothing is sent when
`maxIter` is 2 or less). At exhaustion (`ChatClientAgentLoop.HandleMaxIterExhaustedAsync`): the text written next to the last
tool call ("Mail sent. Now the log:") is never taken as the answer; one tool-free call always asks for the
final answer (escalated once when the model mimics a tool call as text), after a Warning `spent its N
iterations on tool calls; asking once more, without tools, for the final answer`. An answer **completes**
the task — one that made all its tool calls still ends "completed", at the price of one extra call, and since
1.2.0 it is flagged: `endedOnIterationCap: true` on its `task.completed`, counted in `cappedTasks` of
`run.finished`, `⚠ completed on its iteration cap` in the run summary (the tool-free turn tells the agent tools
are gone and asks what it could not do — a file it did not write); an
empty one **fails** it (`MaxIterationsReached`, output empty, reason "…every iteration went to tool calls,
and the tool-free retry came back empty. Raise the agent's max_iterations, or narrow the task"). Before
5668c54 a text left next to the last tool call failed the task with that preamble as output. Too high
costs little on a well-behaved agent and a lot on a confused one (it repeats calls until the limit); too
low fails good runs. `maxIter` is per execution: `hierarchical` revisions, a task's `retry:` attempts, the
visits of a looping `graph` node and `consensual` rounds multiply it. `orkeon forge` raises a plan's `maxIterations` below 6 to 6 in the crew
it writes (`ForgeBlueprint.MinIterations`, e44df3f; a plan setting none keeps the default 20); the
loader accepts 1 — a hand-written team is sized by the table above.

## 3. Sizing the output cap and the context

- Output cap: set `llmOverride.maxTokens` on a task whose output size you know — about 1.5 × the expected
  output, more for a model that reasons in its output budget. A thinking model under a tight cap can spend
  it all thinking and answer empty (one tool-free retry, then failure). Disable thinking where it is not
  needed — per agent `llm.thinking.enabled: false`, per task `llmOverride.thinking.enabled: false`, for the whole machine or one run
  `Llm:Thinking:Enabled` / `ORKEON_Llm__Thinking__Enabled=false`, without an `Effort`
  (`orkeon/llm-profiles.md` § 5).
- Context (local): the image runs Ollama with `OLLAMA_CONTEXT_LENGTH=8192`, and Orkeon sends no context
  size; a longer prompt is truncated silently by the server. Every call must fit: system prompt + tool
  schemas + task + previous outputs + conversation so far + the output cap. One `file_read` result can be
  32,000 characters (about 8,000 tokens): on the local model, pass `max_length`.

## 4. Estimating tokens per task

At about four characters per token (an approximation for English; measure your own), the first call of a
task sends *P₀* = system prompt (role, goal, backstory: 100 to 300 tokens; each tool: about 100 to 400 —
`design/tools-selection.md` § 6) + user prompt (task, expected output, variables, previous outputs up to
8,000 characters ≈ 2,000 tokens). Each later call resends the whole conversation, which grows by *r* per
round: the assistant's call plus the tool result (up to 1,000 tokens, 8,000 for a full `file_read`). For *c*
calls:

    prompt tokens ≈ c × P₀ + r × c × (c − 1) / 2          completion ≈ (c − 1) × 50…200 + the final answer

Example (illustrative): *P₀* = 2,500, *r* = 1,200, *c* = 5 → 12,500 + 12,000 = 24,500 prompt tokens, plus
about 1,200 completion tokens: ~26,000 tokens for one task. The quadratic term is why long tool loops are
expensive — split a task that reads twenty files into units of work (`reliability/resume-patterns.md` § 3). Compaction (§ 1, since 1.4.0) bounds the growth of very long loops, at the price of one summary call each time it fires; the 40-message cap did before, and still does on a model whose window is only assumed. Then multiply by the mode
(`design/team-patterns.md` § 10) and by the repetitions of the test plan.

Replace estimates by measurements as soon as an L3 run exists: the events give the real figures.

## 5. What the events report

`--events jsonl` (protocol v2, V-05; full protocol in `orkeon/cli.md` § 3). On main every **generation**
call of a run goes through one metering decorator (`MeteredLlmProvider`, STUDIO-42): agent turns, their
retries and fallbacks, the hierarchical manager, the planner, RAG pipelines, memory services and judges.

- `cost.updated` — after each call: cumulative `tokens`, `promptTokens`, `completionTokens`; the cache pair
  `cacheHitTokens` / `cacheMissTokens` once a provider measured it (since f80665f a count no call reported stays
  absent, never 0: an absent pair means *not measured*, not *no hit*); `estimatedTokens` once the runtime had
  to estimate a call that carried no usage; `model`, `provider`, `agentId` (the role) and `operation` — the
  kind of work (`agent`, `manager`, `planning`, `rag`, `memory`, `judge`, a script's `ctx.llm.*`) — with
  named profiles a run's calls can carry several `provider` and `model` values: price each by its own rate.
  `cost`, `currency` and `costSource: "vendor"` appear **only** when the vendor bills in its answer
  (OpenRouter's `usage.cost`): no estimated price ever reaches the wire (`RunEvents.Record`).
- `llm.call.started`, `llm.call.progress`, `llm.call.finished` (151a762, STUDIO-71; `--stream` or not) —
  one model call, by any caller the meter counts: `callId`; `mode` (`stream` or `buffer`, the `CallMode`
  resolved) and `estimatedPromptTokens` at the start; the cumulative `estimatedCompletionTokens` of a
  streamed call at most every 250 ms (a buffered call writes none); at the end the `mode` actually used,
  `fellBack` (a refused stream redone in buffer) and `promptTokens` / `completionTokens` when the provider
  counted them — the estimate is dropped when they come, kept and marked when they do not. A live counter,
  not a bill: price from `cost.updated` and `run.finished` (`docs/architecture/run-event-bus.md`).
- `task.completed` — `tokens`, `durationMs`, `toolCalls`, `success`, `skipped` for the task, since rc.6
  `skipReason`, `defaulted`, `isDecision` and `decision` (a decision task's answers), at 1.2.0 also `resumed`,
  `attempt` (the attempt that ended the task), `endedOnIterationCap` and `deliverableMissing`; the manager's
  calls belong to no task.
- `run.finished` — `tokens`, `promptTokens`, `completionTokens`, the cache pair, `estimatedTokens`,
  `durationMs`, `success`, `exitCode`, at 1.2.0 also `cappedTasks` and `missingDeliverables` (always written,
  `0` when none) and, for a run stopped on a question, `status: "waiting_for_input"` (`ObservedRunContext`).

Still outside the meter: **embedding** calls (`semantic_search`, RAG retrieval, RaggableTree indexing) —
`docs/reference/limitations.md`. An estimated part is marked, never priced: treat it as approximate in an
estimate. A buffered OpenAI-dialect answer without `usage.total_tokens` is not estimated: the call fails
(observed on the main build — every stub answers with `usage`; `orkeon/llm-profiles.md` § 7). Ollama reports
its counts (`prompt_eval_count`, `eval_count`). The field list in full: `orkeon/cli.md` § 3.2.

## 6. Duration

- **Local**: one call at a time (`MaxConcurrentRequests: 1` in the image), so `parallel` gains nothing on
  LLM time. A call lasts prompt processing + generation on the machine's GPU; measure it (`durationMs` of
  `task.completed` divided by the calls). Worst case per call: 2 × 600 s (timeout, one retry). A task of *c*
  calls lasts *c* × the mean call; a run, the sum of its tasks; `pass@k` repetitions multiply it.
- **Remote**: latency + generation per call, in seconds; `parallel` waves overlap within `RateLimiting`.
  A rate-limit answer (429) that announces its window is waited out, up to `Llm:MaxRateLimitWait` (5 min) —
  a longer window fails the call; one that announces none is retried with back-off, up to 30 s per wait. A declared `maxRpm` and the
  per-agent cap (20 requests a minute by default) add their waits: an agent that makes its twenty-first
  request within a minute waits for the window.
- Budget the `graph` duration (`maxTotalDurationSeconds`) and the `autonomous` `budget.wallTimeSeconds` against these
  figures, not against a remote model's speed.

## 7. Money

Local runs cost machine time (`local_minutes_max`). A remote run costs *tokens in × input rate + tokens out
× output rate* of the model each call ran on — the profile's, or the one an agent's `llm:` or a task's
`llmOverride:` names —, at the rate written in `TEAM.md § Acceptance`; Orkeon puts a price on the wire
only when the vendor billed it (§ 5), and its internal pricing registry feeds budgets, not events
(`orkeon/llm-profiles.md` § 7). Those budgets are enforced at 1.2.0 (`docs/reference/configuration.md`,
`Orkeon:CostTracking`): with `DefaultCrewBudget:MaxTokens` or `MaxCostUsd` set in the settings, "the call that
crosses a cap completes; the next one is refused before anything is sent and the task ends `BudgetExhausted`,
never retried" — summed per crew id, so per run for a YAML crew; unset (the default) means unlimited. The
built-in price list covers the default model of every paid provider except Hugging Face, `ollama` models
cost 0, a model with no price is counted at zero with one warning, and a `CustomPricings` row
(`ModelPattern`, optional `Provider`) always wins over a built-in one. A host cap is a backstop the user's
settings carry; the bench's own caps (§ 8) stay the workshop's rule. The procedure before an L4 run — estimate from the local runs, compare with
the cap, the user's explicit approval recorded in the open attempt — is `testing/local-vs-remote.md` § 8
(rule 1 of `.claude/harness/HARNESS.md`; `orkeon-bench estimate`). What the design
controls are the three terms of § 4: the number of calls (mode, tasks, `maxIter`), their size (tools per
agent, bounded reads, short intermediate outputs) and the output cap.

**Prompt cache.** On Anthropic, an agent whose system prompt and tool list stay the same from one call to the next
pays the cached part of each later prompt at a tenth of the input rate; writing the cache costs 1.25× once per
lifetime (Orkeon's price table since f80665f: 0.20 $/M read on Opus 5.5 and Sonnet 5.5, 0.25 on Fable 5.1, #257; since
c101cbd the 1-hour share of a write, `usage.cache_creation.ephemeral_1h_input_tokens`, is costed at 2× the prompt rate,
`CacheWrite1hTokens`, instead of the 5-minute 1.25×, and `claude-opus-4-5`, dated ids included, at 5 / 25 $/M instead of the
`claude-opus-4` prefix's 15 / 75 — `ModelPricingRegistry`, `CostBudgetManager`). Anthropic caches only what the request marks: ask for it with
`llm: { cache: { system: true, tools: true } }` (YAML) or `.cache({ systemPrompt: true, tools: true })` (TypeScript,
since f80665f), or once for the whole host with `Llm:Cache:SystemPrompt` / `Llm:Cache:Tools`
(`orkeon/llm-profiles.md` § 3), which every agent setting no cache of its own inherits and `cache: {}` turns off. Keep
the marked prefix byte-identical across turns — no date, run id or counter in a role, goal or backstory — or each call
writes again. This is what Orkeon Code does on every agent (its ADR 0014). Other providers cache by their own rules
and ignore the request — since 0ea39d9 the host's `Llm:Cache` is no longer applied to a provider whose cache is
implicit (`LlmProviderToChatClientAdapter`; no more `cache_ttl` warning on every OpenAI call); leave `ttl` out unless a
pause between calls outlasts five minutes (`5m` or `1h` only, else the load fails; a `ttl` with neither `system` nor
`tools` fails it too since 0ea39d9). Price the hits at the read rate in `TEAM.md § Acceptance`, and an absent pair as not measured.

## 8. The `budget` block of `bench.config.json`

```json
{
  "profiles": {
    "machine": { "source": "orkeon-settings" },
    "claude": { "baseUrl": "https://api.anthropic.com", "model": "<to decide>", "keyEnv": "ANTHROPIC_API_KEY", "timeoutSeconds": 600 }
  },
  "levels": {
    "e2e_local": { "profile": "machine", "repeat": 3, "pass_at": 2 },
    "e2e_remote": { "profile": "claude", "repeat": 1 }
  },
  "budget": { "local_minutes_max": 60, "remote_usd_max": 2.0 },
  "retention": { "runs_keep": 10 }
}
```

- `budget.local_minutes_max` — positive number, default 60: the local machine time an attempt may use.
- `budget.remote_usd_max` — non-negative, default 2.0 USD **per attempt** (D2), adjustable per team.
- `levels.<level>.repeat` and `pass_at` (≤ `repeat`) multiply the runs; a named profile carries `baseUrl`,
  `model`, `keyEnv` (the variable's name, never the key) and `timeoutSeconds` (default 600) — the bench
  injects them as `ORKEON_Llm__*`. Template: `.claude/templates/bench.config.json`; `orkeon-bench` refuses a
  file that breaks these rules.

Set the caps from the estimate: *per-run tokens × scenarios × repeat × price* for remote, *per-run minutes
× scenarios × repeat* for local, plus 30 to 50 % margin. A cap below one honest run is a design problem
(too many calls), not a reason to skip a level. `INV-BUDGET` checks every run's tokens and duration against
the caps (`testing/invariants-catalog.md`).

## 9. Before the team gate

- `TEAM.md § Design` gives each agent a justified `maxIter` and each long-output task an `llmOverride.maxTokens`.
- The estimate per run (tokens, minutes; USD for a remote target) is written next to the plan, with the mode
  factor and the repetitions, and fits `bench.config.json`.
- Every call fits the target model's context: tools per agent minimal, `file_read` bounded, intermediate
  outputs short.
- `graph`: `graph:` sized, each `retry:` counted in the estimate; `parallel` waves under `RateLimiting:QueueLimit`; a `maxRpm` only where a provider's
  quota asks for one, its waits counted in the duration; every agent-level
  `llm` and task `llmOverride` written in `TEAM.md § Design` with its profile and model, and every profile they name
  local unless the run is approved as remote (`orkeon/llm-profiles.md` § 8).
