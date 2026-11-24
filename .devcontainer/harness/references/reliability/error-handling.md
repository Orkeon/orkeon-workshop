# Error handling — failing cleanly, retrying where it pays, asking a person safely

> Reference document of the Orkeon harness (the workshop's `references/reliability/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: at 151a762: `src/core/Orkeon.Application/Crew/ExecutionOrchestrator.cs`,
> `src/core/Orkeon.Application/Crew/Execution/` (`ChatClientAgentLoop.cs`, `ChatToolDispatcher.cs`, `ConversationPolicy.cs`,
> `FinalAnswerPolicy.cs`, `TaskToolbelt.cs`, `GuardrailsPromptRenderer.cs`),
> `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `src/core/Orkeon.Domain/Tools/ToolResultLimitsOptions.cs`,
> `src/core/Orkeon.Application/Services/Security/ToolInvocationPipeline.cs`,
> `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs` and `RateLimitResetHeaders.cs`, `src/core/Orkeon.Infrastructure/LLMs/Base/`
> (`HttpLlmProviderBase.cs`, `OpenAICompatibleProviderBase.cs`), `src/core/Orkeon.Infrastructure/Configuration/`
> (`CircuitBreakerPolicyFactory.cs`, `CrewFactory.cs`, `Yaml/CrewYamlKeyCheck.cs`, `Yaml/YamlCrewMapper.cs`),
> `src/core/Orkeon.Domain/Common/StateMachine/CircuitBreakerPolicy.cs`,
> `src/core/Orkeon.Domain/Graph/GraphRunner.cs`, `src/core/Orkeon.Infrastructure/Crew/Strategies/` (`*ProcessStrategy.cs`,
> `CrewRunOutcome.cs`), `src/core/Orkeon.Infrastructure/Tools/HumanInput/HumanInputTool.cs`,
> `src/core/Orkeon.Infrastructure/HumanInput/AutoApproveHumanInputProvider.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/JsonLinesHumanInputProvider.cs`, `src/core/Orkeon.Domain/Agent/GuardrailPresets.cs`;
> `docs/orchestration/fsm.md`, `graph.md` and `process-types.md`, `docs/architecture/yaml-schema.md`,
> `docs/reference/configuration.md` and `limitations.md`.
> The sketch of § 7 passed `check_crew.py` and `orkeon run crew --validate` on binaries built from 1.0.0-rc.4 and from
> main at 24ab0d0; the behaviours marked "checked" were observed with a simulated LLM on the 24ab0d0
> binary (2026-10-02). At a2bb6c3 and at fb26364 they were re-read in the sources, not re-run; the sketch passed
> `--validate` again on a build of fb26364. The refusals of § 2, the exit code after a signal and the flags of a
missing deliverable were measured on the 1.2.0 CLI (2026-11-17); the rest of what 1.0.0-rc.7 to 1.2.0 changed is
quoted from `CHANGELOG.md` and the documents above.

Orkeon bounds a run — model retries, an iteration cap, a fixed stop on repeated tool errors, the Guardian —
and decides nothing about what a failure means for the work. That is the design's job: which failure stops
the run, which one degrades the output, which one waits for a person. The values of every knob are in
`design/sizing-and-cost.md` § 1; what a failed task does to the run in each mode is
`design/team-patterns.md` § 1; resuming afterwards is `reliability/resume-patterns.md`.

## 1. What fails, and what Orkeon does about it

A task succeeds only when its agent loop ends with a final answer (`ExecutionOrchestrator`: exit reason
`Completed`). An answer that *says* it failed is a success.

| Failure | Orkeon's own handling | Then |
|---|---|---|
| model call: 5xx, 408, 429, transport error | up to `Llm:MaxRetries` retries (10), waiting 1, 2, 3, 9, 27, then 30 s each; a 429 (or a 529 with a reset header) that announces its window — `Retry-After`, `retry-after-ms`, the Anthropic and OpenAI reset headers, the longest wins — is waited out for that window instead of the ladder, up to `Llm:MaxRateLimitWait` (5 minutes by default); a longer window fails the call at once (`LlmRateLimitException`, naming the setting) (`ResiliencePolicies.GetLlmApiPolicy`, `RateLimitResetHeaders`, `orkeon/llm-profiles.md` § 3); since rc.7 a 429 whose body names a spent balance is not retried (#328), and a profile that declares `Llm:Profiles:<name>:Fallback: [b, c]` moves the call to the next profile on "a transport error, a 5xx, a 429 once `Llm:MaxRetries` is spent, a timeout" (event `llm.fallback`; none declared by default) | the task fails (`LlmCallFailed`) with the provider's sentence — then runs again if it declares `retry:` (§ 4) |
| model call: timeout | one retry (`ResilienceDefaults.LlmTimeoutRetries`), none when `MaxRetries` is 0; since ce9ec1f (LLM-12) `Llm:TimeoutSeconds` bounds a streamed call whole, headers and body | the task fails, naming `Llm:TimeoutSeconds` |
| streamed call: silence longer than `Llm:StreamIdleSeconds` between two chunks (unset by default; the image writes 120, D46), or a stream the provider closes without its finish marker and without any answer (since ce9ec1f, LLM-12) — since 23f4eae every call of a provider that streams natively is streamed under the default `Llm:CallMode` `Auto`, `--stream` or not (`design/sizing-and-cost.md` § 1) | no retry of the stream; the chat stream ends with the failure in its final response (`error_type` `StreamIdleTimeout`, `StreamTruncated`); a stream cut after its first event is not a fallback to `Buffer` | the task fails, naming the setting — never an empty answer |
| provider refusing to stream (404, 405, 415, 501, or a 400/422 naming the stream, before any event) | under `Llm:CallMode` `Auto` the call is redone buffered and the run stays in `Buffer`, one warning (`LlmCallModeScope`, e44df3f); under `Stream` the call fails naming `Auto` and `Buffer` | no failure under `Auto`; the task fails under `Stream` |
| model call: other 4xx | no retry, except one resend when Orkeon can adapt the refused payload (`TryAdaptRejectedPayload`) | the task fails |
| a crew on `decision: { mode: required }` while the decision circuit is off (no provider, no key, `--no-decision`, `Orkeon:Decision:Enabled=false`) | refused before its first task, no model called (Orkeon 1.4.0, #429): `ERROR: crew '<name>' requires System One (decision.mode: required) and the decision circuit is off: <cause>`; `--validate` warns | exit 69 (`DecisionUnavailable`, error code `decision_unavailable`); no task ran |
| the LLM judge enabled, `FailMode: Closed`, while the decision circuit is off | refused at start, `--validate` included (`… a fail-closed judge cannot judge …`, 1.4.0 CLI); under `Open` the judge is left out with a warning | exit 1, nothing ran |
| endpoint refusing connections | a 2-second probe before the kickoff (`orkeon/cli.md` § 2) | exit 2, no task ran |
| a tool returns an error or throws | never retried: the error goes back to the model as `Error: …` and the loop goes on (`ChatToolDispatcher`, `ToolInvocationPipeline`) | the model chooses; the same error three rounds in a row stops the task (§ 4, checked) |
| the Guardian refuses a tool call (path traversal, private host, SQL pattern) | the model reads `Error: Blocked by Guardian (…): …` (`reliability/security.md` § 5) | as any tool error: it counts toward the stop on three identical errors |
| the composed prompt holds a High or Critical injection pattern | the Guardian's input phase, before the first call (`Security:Prompt:Policy: Block`, the default) | the task fails (`GuardianBlocked`, the pattern named) |
| a decision stage blocks a model call (a `guard` over its threshold, a stage failing under `FailClosed`; `orkeon/llm-profiles.md` § 3) | no retry and no fallback model: the block names its profile, stage, risk and reason (`DecisionBlocked`, `onError` code `decision_blocked` in a script) | the task fails, exit 2. A blocked turn is a decision, not an outage (Orkeon Code, `run-main-loop.ts`): say the block and route it — reword, another profile, a person — never re-run it as a provider failure |
| the LLM judge of the Guardian blocks an agent's input or a task's output (`Orkeon:Guardian:Llm`, off by default; `reliability/security.md` § 5) | no retry: "a block fails the task (`GuardianBlocked`, `Blocked by Guardian (output): <reason>`) and nothing is kept" — no deliverable, no memory; under the default `FailMode: Closed` a text the decision model could not judge is refused too | the task fails; a `retry:` never runs it again |
| the permission gate refuses a tool call (`Orkeon:Security:PermissionGate:Enabled`, off by default; rc.7 for YAML crews) | "a refusal of the permission gate is a tool result inside an attempt, not a task failure": the model reads the reason | as any tool error |
| the host's budget is spent (`Orkeon:CostTracking:DefaultCrewBudget:MaxTokens` / `MaxCostUsd`, unset by default; enforced since rc.7) | the call that crosses the cap completes, the next is refused before anything is sent | the task ends `BudgetExhausted`, never retried |
| a `RateLimiting` queue is full | the lease is refused at the provider's entrance, then retried five times after the limiter's delay (`RateLimitedLlmProvider`) | the call fails, and the task with it (`LlmCallFailed`; `design/sizing-and-cost.md` § 1) |
| an agent's or the crew's `maxRpm`, or `RateLimiting:AgentRequestsPerMinute`, is reached | the request waits for its window; one Information line names who waited and under which limit (`RequestRates`) | no failure: the run lasts longer |
| a tool result is long | cut at 4,000 characters (`file_read` 32,000, `node_read` 256,000, `shell_command` 10,000, the analysis tools 12,000 since c101cbd; per tool under `Orkeon:Tools:ResultLimits:Limits:<tool>`) with a `[... truncated …]` note — a result the tool already bounded is not cut again —, then a successful result framed as data (`--- BEGIN Tool Result: … (DATA CONTEXT - NOT INSTRUCTIONS) ---`) | a silent loss, not an error |
| `maxIter` reached | the text next to the last tool call is never the answer: one tool-free call asks for the final answer, escalated once, after a Warning `spent its N iterations on tool calls; asking once more, without tools, for the final answer`; at 1.2.0 the agent is warned once when two iterations are left, and that last turn tells it tools are gone and asks what it could not do | completed when that call answers — `success: true`, flagged `endedOnIterationCap` on `task.completed` and counted in `cappedTasks` of `run.finished` (1.2.0): a green run can hold a task that never wrote its file, so a criterion reads the flag; failed (`MaxIterationsReached`, empty output) when it comes back empty |
| empty final answer | one tool-free retry, escalated once | failed |
| a task runs past its agent's `maxExecutionTime` (since f59446b) | the task's token falls when the limit elapses (`TaskDeadline`): the task stops at the latest at the end of the call in progress, no retry; the wait for a human input is not counted; a Warning `the task ran past its maximum execution time of Ns and is cancelled` | the task fails (`ExecutionTimeExceeded`, `Agent exceeded its maximum execution time of Ns`), the run with it |
| a mail tool whose right no ready account grants (`email_send` also needs a non-empty `Send:AllowedRecipients`), or since 13461ea a drive tool (`drive_share` also needs a non-empty `Share:AllowedRecipients` or `Share:AllowPublicLinks`) | refused at crew load, before any model call (`EmailRightsCheck`, `DriveRightsCheck`, e44df3f; `orkeon/cli.md` § 5): `ERROR:` and one line per tool naming the right and where to add it; `--validate` fails with the same lines (exit 1) | exit 2, no task ran — a scripted crew is checked once its script is loaded |
| a deliverable cannot be written | logged (`access_denied`, `invalid_json`, `no_json_payload`) | the task still succeeds |
| a `tool_call` deliverable the agent did not write during the run (1.2.0) | a warning `completed without writing its deliverable '<path>'`, `deliverableMissing: true` on `task.completed`, `missingDeliverables` on `run.finished` | the task still succeeds, exit 0 (measured) |
| SIGINT, SIGTERM | cancellation; the task in flight fails, no later task starts | exit 2, `error` `crew_cancelled` (checked, again on 1.2.0); documented as 130 (`resume-patterns.md` § 1) |
| a question to a human nobody can answer, with `Orkeon:Checkpointing:Enabled` (rc.7) | the run suspends on the persisted question (§ 5) | exit **75**, `run.finished` `status: "waiting_for_input"`: neither a success nor a failure |

Worth knowing:

- **Exhausting retries takes time**: ten transient retries wait at least 190 s on top of the calls; a 429
  that announces its window waits that window instead, up to 5 minutes per retry (`Llm:MaxRateLimitWait`); a timeout
  costs `TimeoutSeconds` twice — 20 minutes with the image's 600 s.
- **There is no circuit breaker on model calls.** The `Resilience` settings section and `ResilienceOptions`
  are gone (4b17b249); only `Llm:MaxRetries` and `Llm:TimeoutSeconds` act, per profile
  (`Llm:Profiles:<id>:MaxRetries`…, `orkeon/llm-profiles.md` § 3).
- **Failure messages name settings loosely.** An exhausted `maxIter` whose tool-free last call came back
  empty says "The agent did not produce a final answer within the allowed iterations: every iteration went
  to tool calls, and the tool-free retry came back empty. Raise the agent's max_iterations, or narrow the
  task" (`FinalAnswerPolicy.MaxIterationsWithoutAnswerReason`, e44df3f — the only `MaxIterationsReached`
  message left: a call that answers completes the task): the YAML key is `maxIter`, and `max_iterations`
  fails the load (an unknown key since 63be532: `Did you mean …?` or the keys it reads).
  An empty answer says "raise Llm:MaxTokens": machine-wide that is the setting; inside the crew the task's
  `llmOverride.maxTokens` wins, else the agent's `llm.maxTokens`, else the `MaxTokens` of the profile in use
  (`design/sizing-and-cost.md` § 1).

## 2. `graph:` — the only breaker a crew declares

The `circuitBreaker:` block is gone, at the crew root and on a task, and since rc.7 so is `graphConfig`: the
load refuses both, `--validate` included (`CrewYamlKeyCheck`). Measured on the 1.2.0 CLI: "'graphConfig' is
retired: the graph block replaced it — write graph: { circuitBreakerPreset, maxTransitions, maxVisits (formerly
maxStateVisits), maxTotalDurationSeconds, and the nodes and edges }; a retry of a failed task is the task's own
retry:, and there is no maxCycles."; "'graph.maxRetryCycles' is not a key Orkeon reads."; and for
`circuitBreaker:` a message naming the `graph` block. The task state machine `circuitBreaker` configured is
deleted; the generic `CircuitBreakerPolicy` stays, for Graph (and forge, CRAG).

| Where, which key | Effect at 1.2.0 (`docs/architecture/yaml-schema.md`, `docs/orchestration/graph.md`) |
|---|---|
| `circuitBreaker:` on the crew or a task, `graphConfig:` | **refused at load** |
| `graph:`, `process: graph` | `circuitBreakerPreset`, `maxTransitions`, `maxVisits`, `maxTotalDurationSeconds` (`CircuitBreakerPolicyFactory.ResolveGraph`), and the topology: `start`, `nodes`, `edges` (`design/team-patterns.md` § 5). No retry key: a retry is the task's `retry:` (§ 4) |
| no explicit `maxVisits` / `maxTransitions` | computed from the crew: `maxVisits` — the visits of **one** node — "the sum over the tasks of `1 + retries`", `maxTransitions` "twice that plus one" |
| the duration | the preset's: `strict` (when `graph:` names none) 10 minutes, `default` 30, `permissive` 2 hours |
| the presets' state timeout | not enforced: `GraphRunner` checks transitions, visits of one node and total duration only; a trip always fails the run (`Graph execution stopped by circuit breaker`, exit 2) |
| `graph:` in any other mode | refused at load ("a `graph:` outside `process: graph`") |

`docs/orchestration/fsm.md` and `graph.md` say the same at 1.2.0, and so does `design/team-patterns.md`
§ 5. Write no `circuitBreaker` at all; in a `graph` crew write `graph:` and size
`maxTotalDurationSeconds` to a measured run — a local model takes up to 600 s per call, so ten minutes is
one or two calls. The guards that act in every mode are `maxIter` (`design/sizing-and-cost.md` § 2), the
stop on repeated tool errors, the model retries and the Guardian.

## 3. How a failure travels

The table is `design/team-patterns.md` § 1. At 1.2.0 every mode fails the run (exit 2) on a failed task
and skips its dependents; the last stderr line names every failed and skipped task (`CrewRunOutcome`, per
the sources). A task skipped because its `when` condition did not hold is no failure. Declare every real dependency, so nothing runs on a failed input; any failed task turns the
run red, optional ones included: an optional step degrades inside its task (§ 6). What the design must add:

| Mode | What the design must add |
|---|---|
| `sequential` | little: dependents are skipped, independent tasks still run |
| `parallel` | the failed task's wave siblings finish; its dependents in later waves are skipped. A synthesis that must run on what is there goes in `sequential`, declared last with no `dependencies` — and the run still exits 2 |
| `graph` | one node per task and no retry of its own: a failed task (after its own `retry:` attempts) fails the run and its dependents are skipped — with declared `nodes`/`edges`, "a node whose task fails ends the run: there is no routing on failure"; a breaker trip (§ 2) fails the run too |
| `hierarchical` | up to three executions; after the third rejection the output is marked `[NEEDS REVISION]`, the task fails, the deliverable keeps the last execution |
| `consensual` | the task fails when the retained result failed — every execution failed, every voter abstained, or the `Fail` fallback (`Orkeon:Consensus:FallbackStrategy`) |
| `autonomous` | the task still failed after one hand-over, or the crew's `budget:` ran out — since e44df3f (#218) no wall time and no token cap unless it sets them, 50 tool calls, depth 4, 10 spawned agents (`orkeon/yaml-schema.md`); before, a fixed 15 minutes: the tasks never reached are named |

The exit code is meaningful in every mode. The bench still reads `task.completed` (`success`, `skipped`)
to say which task failed, the `error` event (`crew_failed`, `crew_cancelled`) and `run.finished`
(`orkeon/cli.md` § 3); an acceptance criterion says what a partial run leaves behind.

## 4. Retrying on purpose

| What failed | Retry where | How |
|---|---|---|
| a model call, transiently | Orkeon already does | per profile: `Llm:MaxRetries`, `Llm:TimeoutSeconds` (`orkeon/llm-profiles.md` § 3); `ORKEON_Llm__MaxRetries=0` in an L2 scenario that tests a failure |
| a flaky tool call (network, timeout) | in the task, by the model | "if `web_scrape` fails, try once more after the other companies, then mark it unavailable" — never "retry until it works" |
| a whole task (empty answer, transient failure, a timeout) | the task, in any mode (rc.7) | `retry: { attempts: 3, backoffMs: 2000, backoff: exponential }` on the task (`taskBuilder().retry({...})` in a script): up to `attempts` runs in all, the first included. "A new attempt replays the whole task, tool calls that already succeeded included: nothing deduplicates them, the crew author keeps the tools idempotent" — so only on a task whose tool calls can run twice (`resume-patterns.md` § 6). Never retried: a cancellation, a Guardian refusal, an exhausted budget; refused on a decision task. Each retry writes a `task.started` with `attempt`, and `task.completed` says which attempt ended the task. Count the attempts in the cost estimate, and in a `graph` crew in `maxTotalDurationSeconds` |
| a unit, across runs | the registry | `attempts` in the unit's marker, a cap, then a list for a person (`resume-patterns.md` § 7) |
| the run | a relaunch, after reading the reason | by the user or a schedule; never an automatic loop on a remote profile — each remote run passes the budget gate (`process/workflow.md` § 4) |

**The stop on repeated tool errors.** After each round, the loop compares the last tool error with the
previous one; the same text three rounds in a row ends the task with
`Agent stopped after 3 identical tool call failures. Error: …` and the partial work
(`ConversationPolicy`, `AgentDefaults.MaxConsecutiveIdenticalErrors`); a success or another error resets
the count. Fixed in the code, unrelated to `graph:`. Checked (24ab0d0 binary, `sequential`): three
identical `file_read` errors ended the task, its dependent was reported `skipped: true`, an independent task
still ran, exit 2. It turns these into failed tasks:

- an existence check repeated on a folder that does not exist yet (`resume-patterns.md` § 4);
- a wrong argument name the model repeats (`Required parameter 'path' is missing`, V-06);
- a URL refused by the SSRF guard, retried as is (`reliability/security.md` § 4);
- a write to a read-only root, retried as is;
- a call the Guardian's tool phase refuses (`Error: Blocked by Guardian …`), retried as is;
- a prompt that says "retry the same call up to five times".

## 5. Asking a person: `human_input`

How the tool behaves is `orkeon/cli.md` § 2.5: without `--events` an auto-approver answers; with
`--events jsonl` (Studio, the bench) the run waits for `input.given` on stdin, with no timeout.

**Durable questions (rc.7).** That is the behaviour while `Orkeon:Checkpointing:Enabled` is `false`, the
default. With it `true`, `Orkeon:HumanInput` applies (`docs/reference/configuration.md`): the question is
persisted with the run's checkpoints under a stable id (`requestId`, `<task>#<n>.<q>`), and "unset, a run with
a person to ask holds, a plain `orkeon run` with nobody suspends, and `orkeon-host` and `--events` hold (30
minutes and no limit)". A suspended run ends with `run.finished` `status: "waiting_for_input"` and exit **75**
(`EX_TEMPFAIL`), and `orkeon run <crew> --resume <id> --input "…"` answers it: "the task that asked is replayed
and gets the answer, the tasks already done are not run again" — replayed from its start, tool calls made again.
The stored answer is in plaintext in the checkpoint store. A launcher or a scheduler that enables checkpointing
must therefore treat 75 as "waiting", not as a failure; the workshop's bench runs with checkpointing off, where
none of this applies unless a settings file turns it on. A tool approval of the permission gate is the same kind of durable question.

What each
answer type becomes when nobody answers (checked, both columns, on the 24ab0d0 binary; at 151a762 the
providers also take `recommended`, an index into `choices`, and the type `multi`):

| `input_type` | Under `./run.sh` (no `--events`) | Under Studio or the bench, stdin closed or run cancelled | Use it for |
|---|---|---|---|
| `approval` | **true**, whatever `default_value` says | refused | never as the only gate of an action |
| `choice` | `default_value`, else the `recommended` choice, else the first | `default_value`, else the first choice | a decision with a safe default, listed first |
| `text` | `default_value`, else the word `approved` | `default_value`, else empty | information the run can do without |
| `multi` | the `recommended` choice alone, else the first | none | a selection the run can do without |

Rules:

1. `humanInput: true` gives the task the tool (`TaskToolbelt.Compose`); the model decides whether to call
   it. Write the condition in the description and test both branches.
2. **Escalate with `choice`**, the safe option first and as `default_value` (`stop`, `skip`): the same safe
   answer comes back in every unattended case. The result carries `was_default`; say in the description
   what to do then.
3. An `approval` answer counts as yes only for the exact strings `y`, `yes`, `true`, `1`, `o`, `oui`
   (`JsonLinesHumanInputProvider`, case-sensitive): `Yes` is a refusal.
4. Under `--events` the run waits as long as stdin stays open: a question nobody answers holds the run,
   which is why the bench answers each question by its `correlationId` from the scenario
   (`orkeon/cli.md` § 2.5).
5. `edit_file_path` is stored with the request and read by no provider of `orkeon run`: do not rely on it.
6. **The default escalation is a file, not a question**: a "needs review" list, a draft, a quarantine list
   under a writable point, read after the run — or, for mail, a draft in the mailbox (`email_draft`, the
   human-review path of `docs/guides/email.md`). It behaves the same under `./run.sh`, Studio and the bench,
   and needs nobody at the screen.
7. `input.needed` events are counted as the indicator "human inputs requested"
   (`testing/invariants-catalog.md`).

## 6. Degrading on purpose

- **Decide what may be lost.** `TEAM.md § Need` names the core and the optional parts. Actions fail closed: no
  evidence, no action. Enrichment fails soft: what is missing is flagged, never invented.
- **Make degradation data**, not prose: a `status` (`complete`, `partial`), an `error` per item, a "Not
  covered" section; a schema on the deliverable (`INV-SCHEMA`) and an acceptance criterion that checks it.
- **Keep an expected failure inside its task** when the run must go on: told to record the failure and
  continue, the agent completes the task and the run exits 0 with a flagged output. A separate optional
  task that fails makes the run exit 2, in every mode.
- **Say it in the guardrails**, on the task or the agent: the `analysis` preset adds "If a tool call fails
  or returns no data, report the failure clearly. Do NOT generate fictional content to compensate."
  (`GuardrailPresets`); the agent's block renders before the task's, and an unknown preset fails the load
  (`design/prompting.md` § 7).
- **Isolate units**: one bad input is marked failed and the others go on (`resume-patterns.md` § 7).
- **Bound each run**: a batch per run, an output cap per task (`design/sizing-and-cost.md` § 3).

## 7. Sketch — a task that degrades, a question with a safe default

```yaml
# --- crew/config.yaml
name: company-brief
goal: "Write a brief on each listed company from its public page, saying plainly which pages could not be read"
process: sequential
# --- crew/agents/enricher.yaml
role: "Company page reader"
goal: "Read the public page of each listed company and keep only what the page states"
backstory: |
  Methodical web researcher. Reports a page it could not read instead of guessing its content.
tools: [file_read, web_scrape]
allowDelegation: false
maxIter: 15
# --- crew/agents/writer.yaml
role: "Brief writer"
goal: "Write a short brief from the enriched list, flagging every company left without data"
backstory: |
  Concise analyst. Never fills a gap with assumptions.
allowDelegation: false
maxIter: 6
# --- crew/tasks/a_enrich.yaml
description: |
  Read /workspace/companies.md with file_read. For each company, call web_scrape once on its URL.
  If the call fails or is refused, do not call it again with the same URL: record the company with
  "page": "unavailable" and "error": the error text, then go on with the next company.
expectedOutput: 'JSON only: {"status": "complete"|"partial", "companies": [{"name": "...", "url": "...", "page": "<summary>"|"unavailable", "error": null|"..."}]}'
agent: enricher
guardrails:
  preset: analysis
  rules:
    - "Never describe a page you could not read; mark it unavailable."
deliverable:
  path: /output/companies.json
  source: structured_output
  format: json
  schemaInline: '{"type":"object","required":["status","companies"]}'
# --- crew/tasks/b_brief.yaml
description: |
  Write the brief from the previous result. When "status" is "partial", first call human_input with
  input_type "choice", choices ["stop", "publish"], default_value "stop" and a prompt naming the
  unavailable companies. On "stop", answer only "STOPPED: <the unavailable companies>".
  On "publish", write the brief and end it with a "Not covered" section listing them.
expectedOutput: "A Markdown brief of 300 words at most, or the single line 'STOPPED: ...'."
agent: writer
dependencies: [a_enrich]
humanInput: true
deliverable:
  path: /output/brief.md
  source: final_message
  format: markdown
```

A refused or failing page leaves `a_enrich` successful with `status: partial`; under `./run.sh`, and when
nobody answers in Studio, the question returns `stop`, so a partial brief is published only on a person's
explicit `publish`.

## 8. Checking it

- **L2** (simulated LLM), one scenario per failure class, each asserting the designed reaction:
  three identical failing tool calls → `task.completed` `success: false`, dependents `skipped: true`,
  exit 2; an HTTP 500 under `ORKEON_Llm__MaxRetries=0` → the task fails at once; a failing optional source →
  the task succeeds with `status: partial`; `input.needed` answered `publish`, then left unanswered → both
  branches; a deliverable aimed at a read-only root → the file is absent although the task succeeded (the
  bench checks files, not only task status).
- **L3**: a real model meets real tool errors and degrades instead of inventing — a judge rubric on the
  flagged output (`testing/llm-judge.md`).
- **Events**: `tool.returned` with `success: false` (the "retries" indicator), `task.completed`,
  `input.needed`, `error`, `run.finished` (`orkeon/cli.md` § 3).
- **Static**: `grep -rn circuitBreaker teams/<slug>/crew/` finds nothing (Orkeon refuses the key at load);
  every `humanInput: true` has a written condition and a `choice` with a safe default; no `approval`
  question guards an acting tool.

## 9. Before the team gate

- [ ] `TEAM.md § Need` says what must stop the run, what may degrade, what waits for a person.
- [ ] The mode's failure behaviour is known (`design/team-patterns.md` § 1) — its retry, revision or vote —
      and covered by an acceptance criterion read from the events.
- [ ] No `circuitBreaker` nor `graphConfig` anywhere; `graph:` sized when the mode is `graph`; every `retry:` on
      a task whose tool calls are idempotent.
- [ ] No prompt asks for the same call to be repeated; existence checks cannot error three times.
- [ ] Every degraded output is flagged in data and checked; nothing is invented to fill a gap.
- [ ] Every question to a person is a `choice` with a safe default, or a file read after the run.
