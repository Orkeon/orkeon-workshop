# Sizing and cost — limits, budgets and estimates

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon main at a2bb6c3 (2026-10-03, after 1.0.0-rc.4).
> Sources: `src/core/Orkeon.Infrastructure/Configuration/Yaml/YamlConfigModels.cs`, `YamlCrewMapper.cs` and `RetiredCrewYamlKeys.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`, `src/scripting/Orkeon.Scripting/Adapters/JsCrewConfigurationAdapter.cs`
> and `Builders/JsAgentBuilder.cs`, `src/scripting/Orkeon.Scripting/Typings/llm.d.ts`, `src/core/Orkeon.Application/Crew/Execution/ChatClientAgentLoop.cs`,
> `ChatOptionsComposer.cs`, `AgentPromptComposer.cs`, `ConversationPolicy.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Domain/Constants/Llm/LlmDefaults.cs`, `src/core/Orkeon.Infrastructure/LLMs/Profiles/LlmSettings.cs`,
> `src/core/Orkeon.Infrastructure/Security/LlmRateLimiter.cs` and `Configuration/RateLimitingOptions.cs`,
> `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs`, `src/core/Orkeon.Infrastructure/Crew/Strategies/GraphProcessStrategy.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`,
> `src/constants/Orkeon.Constants.Llm/LlmModelOutputLimits.cs`, `src/scripting/Orkeon.Scripting.Cli/Commands/Run/RunEvents.cs` and
> `ObservedRunContext.cs`, `src/core/Orkeon.Application/Interfaces/Ports/LlmUsageOperations.cs`, `docs/reference/limitations.md`,
> `CHANGELOG.md` `[Unreleased]` (STUDIO-29, -30, -42, GAP-03, GAP-07, GAP-17, GAP-36) (main at a2bb6c3); harness
> `claude/templates/bench.config.json`, `bench/src/domain/bench-config.ts`, the image's `init-orkeon.sh` and
> Dockerfile, `VERIFICATIONS.md` (V-04 to V-06 observed on 1.0.0-rc.4 and main at 24ab0d0, V-14). What a2bb6c3 changed is
> read in its sources, not yet run.

Cost follows LLM calls, and calls follow iterations, retries and the mode. This document lists every
limit that exists at a2bb6c3 — and the ones that look like limits but are not — then how to estimate tokens,
money and time per task and per run, and how `tests/<slug>/bench.config.json` caps them. Mode costs:
`design/team-patterns.md` § 10; providers, the local model and its settings: `orkeon/llm-profiles.md`.

## 1. The knobs, and what they really do

**In the crew** (exact keys: `orkeon/yaml-schema.md`):

| Key | Where | Default | Effect at a2bb6c3 (per the sources) |
|---|---|---|---|
| `maxIter` (YAML) · `.maxIterations(n)` (TS) | agent | 20 | LLM calls of the main loop for **one execution of one task** |
| `llmOverride.maxTokens` | task (YAML) | unset | output cap of every call of that task; unset → the agent's `llm.maxTokens`, else `MaxTokens` of the profile in use (`Llm:MaxTokens` for the default), else the model's documented maximum (`LlmModelOutputLimits`), else **4,096** for a model the table does not know (the V-06 stub request carried `max_completion_tokens: 4096`); Ollama receives a cap (`num_predict`) only when one is set (`orkeon/llm-profiles.md` § 3) |
| `llmOverride.temperature` · `topP` · `thinking` · `responseFormat` | task (YAML) | unset → the agent's `llm:`, else the profile's (`Llm:Temperature`…), else **not sent** — the model's own | sent with every call of the task, whatever its value |
| `llmOverride.profile` · `.withProfile(id)` (TS) | task | unset → the agent's profile | the task's calls go to that profile's provider: another endpoint, another price (`orkeon/llm-profiles.md` § 3) |
| `llm:` (`profile`, `model`, `maxTokens`, `temperature`, `topP`, `thinking`, `cache`…) · `.llm(llm.profile(id, {…}))` / `.llm(llm.model(name, {…}))` (TS) | agent, crew (merged into each agent) | unset → the default profile, its model | **applied** to every call of the agent's turns, a task's `llmOverride` winning for that task (`CrewFactory` → `WithLlmConfig`). At 24ab0d0 the block was dropped (V-14: 0.7 and 4,096 sent for an agent declaring 0.22 and 777); the a2bb6c3 behaviour is not yet run. A `profile` or a `model` changes what a call costs — size and price per agent |
| `maxRpm` | agent (YAML) | 10 | stored, read by no limiter — throttling is the `RateLimiting` settings below (with `maxRpm: 1`, the main build sent the agent's second call 0.2 s after the first). Leave it unset |
| `graphConfig` | crew, `graph` only | `maxRetryCycles` 2; `maxStateVisits` *tasks × (1 + maxRetryCycles)* and `maxTransitions` twice that plus one unless set; 10 min (preset `strict`) | attempts per task, run duration — size it (`design/team-patterns.md` § 5); a task that exhausts its retries fails the run |
| `circuitBreaker` | crew · task | — | **refused at load** (`RetiredCrewYamlKeys`): `graphConfig` carries the graph's limits |
| — | `autonomous` | `Permissive`: 50 tool calls, depth 4, 15 min, 64,000 tokens, 10 spawns | fixed, not configurable in YAML |

**Fixed in the code** (`AgentDefaults`, `AgentPromptComposer`, `ChatClientAgentLoop`): tool result
4,000 characters (`file_read` 32,000); conversation 40 messages; previous outputs 8,000 characters in
total; three identical tool errors in a row stop the task; up to two hand-backs of a malformed tool-call
answer; one tool-free retry (escalated once) after an empty answer or an exhausted `maxIter`; `hierarchical`
three reviews. The three rounds of `consensual` are a setting, below.

**In the settings** (the machine's `~/.config/Orkeon/appsettings.json` — or the team's own
`settings/<slug>/appsettings.json`, which its launchers pass instead, D33 — or `ORKEON_*` variables for one
run):

| Setting | Default | The image | Effect |
|---|---|---|---|
| `Llm:TimeoutSeconds` | 30 | **600** | HTTP timeout of one call; a timed-out call is retried **once**, then the task fails. Each `Llm:Profiles:<id>` has its own, 30 when unset |
| `Llm:MaxRetries` | 10 | — | retries of transient errors (5xx, 408, 429, transport), back-off capped at 30 s |
| `Llm:MaxTokens` · `Llm:Temperature` | unset · unset (none sent) | — | defaults for every call on the default profile that neither the agent nor the task sets |
| `RateLimiting:GlobalRequestsPerMinute` · `ProviderRequestsPerMinute` · `AgentRequestsPerMinute` | 60 · 30 (per provider) · 20 (per role) | — | sliding one-minute windows |
| `RateLimiting:MaxConcurrentRequests` · `QueueLimit` | 0 (unlimited) · 5 | **1 · 32** | in-flight calls, one gate for every profile of the run (a remote profile's calls wait behind the local ones); waiting calls beyond the queue are **refused, and the task fails** |
| `Orkeon:Scripting:Limits` (TypeScript) | 100 MB cumulative · 30 s wall clock · recursion 64 | — | the script engine; `--memory-limit-mb` overrides the memory |
| `Orkeon:Consensus:MaxVotingRounds` | 3 | — | voting rounds of a `consensual` task, every agent running it in each round (`design/team-patterns.md` § 7) |

There is no task or run timeout in the crew. A run ends when its tasks end, on Ctrl+C, or when the bench
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

At exhaustion: if the last assistant message has text, the task **fails** (`MaxIterationsReached`) with
that text as output; if not, one tool-free call asks for the final answer — a task can thus end
"completed" without having made all its calls. Too high costs little on a well-behaved agent and a lot on
a confused one (it repeats calls until the limit); too low fails good runs. `maxIter` is per execution:
`hierarchical` revisions, `graph` retries and `consensual` rounds multiply it.

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
expensive — split a task that reads twenty files into units of work (`reliability/resume-patterns.md` § 3). The 40-message cap bounds the growth of very long loops. Then multiply by the mode
(`design/team-patterns.md` § 10) and by the repetitions of the test plan.

Replace estimates by measurements as soon as an L3 run exists: the events give the real figures.

## 5. What the events report

`--events jsonl` (protocol v2, V-05; full protocol in `orkeon/cli.md` § 3). On main every **generation**
call of a run goes through one metering decorator (`MeteredLlmProvider`, STUDIO-42): agent turns, their
retries and fallbacks, the hierarchical manager, the planner, RAG pipelines, memory services and judges.

- `cost.updated` — after each call: cumulative `tokens`, `promptTokens`, `completionTokens`; the cache pair
  `cacheHitTokens` / `cacheMissTokens` once a provider measured it; `estimatedTokens` once the runtime had
  to estimate a call that carried no usage; `model`, `provider`, `agentId` (the role) and `operation` — the
  kind of work (`agent`, `manager`, `planning`, `rag`, `memory`, `judge`, a script's `ctx.llm.*`) — with
  named profiles a run's calls can carry several `provider` and `model` values: price each by its own rate.
  `cost`, `currency` and `costSource: "vendor"` appear **only** when the vendor bills in its answer
  (OpenRouter's `usage.cost`): no estimated price ever reaches the wire (`RunEvents.Record`).
- `task.completed` — `tokens`, `durationMs`, `toolCalls`, `success`, `skipped` for the task; the manager's
  calls belong to no task.
- `run.finished` — `tokens`, `promptTokens`, `completionTokens`, the cache pair, `estimatedTokens`,
  `durationMs`, `success`, `exitCode` (`ObservedRunContext`).

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
  Rate-limit answers (429) are retried with back-off, up to 30 s per wait.
- Budget the `graph` duration (`maxTotalDurationSeconds`) and the `autonomous` 15 minutes against these
  figures, not against a remote model's speed.

## 7. Money

Local runs cost machine time (`local_minutes_max`). A remote run costs *tokens in × input rate + tokens out
× output rate* of the model each call ran on — the profile's, or the one an agent's `llm:` or a task's
`llmOverride:` names —, at the rate written in `TEST-PLAN.md`; Orkeon puts a price on the wire
only when the vendor billed it (§ 5), and its internal pricing registry feeds budgets, not events
(`orkeon/llm-profiles.md` § 7). The procedure before an L4 run — estimate from the local runs, compare with
the cap, the user's explicit approval recorded in the open attempt — is `testing/local-vs-remote.md` § 8
(rule 1 of `.claude/harness/HARNESS.md`; `orkeon-bench estimate` is planned, lot 9). What the design
controls are the three terms of § 4: the number of calls (mode, tasks, `maxIter`), their size (tools per
agent, bounded reads, short intermediate outputs) and the output cap.

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

## 9. Before gate 3

- `DESIGN.md` gives each agent a justified `maxIter` and each long-output task an `llmOverride.maxTokens`.
- The estimate per run (tokens, minutes; USD for a remote target) is written next to the plan, with the mode
  factor and the repetitions, and fits `bench.config.json`.
- Every call fits the target model's context: tools per agent minimal, `file_read` bounded, intermediate
  outputs short.
- `graph`: `graphConfig` sized; `parallel` waves under `RateLimiting:QueueLimit`; no `maxRpm`; every agent-level
  `llm` and task `llmOverride` written in `DESIGN.md` with its profile and model, and every profile they name
  local unless the run is approved as remote (`orkeon/llm-profiles.md` § 8).
