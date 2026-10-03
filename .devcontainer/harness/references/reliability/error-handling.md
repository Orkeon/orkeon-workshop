# Error handling — failing cleanly, retrying where it pays, asking a person safely

> Reference document of the Orkeon harness (the workshop's `references/reliability/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: at 24ab0d0 (what is described here behaves as at 1.0.0-rc.4): `src/core/Orkeon.Application/Crew/ExecutionOrchestrator.cs`,
> `src/core/Orkeon.Application/Crew/Execution/` (`ChatClientAgentLoop.cs`, `ChatToolDispatcher.cs`, `ConversationPolicy.cs`,
> `FinalAnswerPolicy.cs`, `ChatOptionsComposer.cs`), `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs`, `src/core/Orkeon.Infrastructure/LLMs/Base/`
> (`HttpLlmProviderBase.cs`, `OpenAICompatibleProviderBase.cs`), `src/core/Orkeon.Infrastructure/Configuration/`
> (`CircuitBreakerPolicyFactory.cs`, `CrewFactory.cs`, `ResilienceOptions.cs`, `Yaml/YamlConfigModels.cs`,
> `Yaml/YamlCrewMapper.cs`), `src/core/Orkeon.Domain/Common/StateMachine/CircuitBreakerPolicy.cs`,
> `src/core/Orkeon.Domain/Graph/GraphRunner.cs`, `src/core/Orkeon.Infrastructure/Crew/Strategies/*ProcessStrategy.cs`,
> `src/core/Orkeon.Infrastructure/Tools/HumanInput/HumanInputTool.cs`, `src/core/Orkeon.Infrastructure/HumanInput/AutoApproveHumanInputProvider.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/JsonLinesHumanInputProvider.cs`, `src/core/Orkeon.Domain/Agent/GuardrailPresets.cs`;
> `docs/orchestration/fsm.md` and `process-types.md`, `docs/architecture/yaml-schema.md`, `docs/reference/configuration.md`.
> The sketch of § 7 passed `check_crew.py` and `orkeon run crew --validate` on binaries built from 1.0.0-rc.4 and from
> main at 24ab0d0; the behaviours marked "checked" were observed with a simulated LLM on the binary built from main
> (2026-10-02).

Orkeon bounds a run — model retries, an iteration cap, a fixed stop on repeated tool errors — and decides
nothing about what a failure means for the work. That is the design's job: which failure stops the run,
which one degrades the output, which one waits for a person. The values of every knob are in
`design/sizing-and-cost.md` § 1; what a failed task does to the run in each mode is
`design/team-patterns.md` § 1; resuming afterwards is `reliability/resume-patterns.md`.

## 1. What fails, and what Orkeon does about it

A task succeeds only when its agent loop ends with a final answer (`ExecutionOrchestrator`: exit reason
`Completed`). An answer that *says* it failed is a success.

| Failure | Orkeon's own handling | Then |
|---|---|---|
| model call: 5xx, 408, 429, transport error | up to `Llm:MaxRetries` retries (10), waiting 1, 2, 3, 9, 27, then 30 s each; a `Retry-After` (in seconds) is waited on top of that delay, capped at 30 s (`ResiliencePolicies.GetLlmApiPolicy`, `orkeon/llm-profiles.md` § 3) | the task fails (`LlmCallFailed`) with the provider's sentence |
| model call: timeout | one retry (`ResilienceDefaults.LlmTimeoutRetries`), none when `MaxRetries` is 0 | the task fails, naming `Llm:TimeoutSeconds` |
| model call: other 4xx | no retry, except one resend when Orkeon can adapt the refused payload (`TryAdaptRejectedPayload`) | the task fails |
| endpoint refusing connections | a 2-second probe before the kickoff (`orkeon/cli.md` § 2) | exit 2, no task ran |
| a tool returns an error or throws | never retried: the error goes back to the model as `Error: …` and the loop goes on (`ChatToolDispatcher`) | the model chooses; the same error three rounds in a row stops the task (§ 4, checked) |
| a tool result is long | cut at 4,000 characters (`file_read` 32,000) with a `[... truncated …]` note | a silent loss, not an error |
| `maxIter` reached | the last text kept as output, or one tool-free call asks for a final answer | failed, unless that call answers |
| empty final answer | one tool-free retry, escalated once | failed |
| a deliverable cannot be written | logged (`access_denied`, `invalid_json`, `no_json_payload`) | the task still succeeds |
| SIGINT, SIGTERM | cancellation; the task in flight fails, no later task starts | exit 2, `error` `crew_cancelled` (checked); documented as 130 (`resume-patterns.md` § 1) |

Worth knowing:

- **Exhausting retries takes time**: ten transient retries wait at least 190 s on top of the calls (more
  when the server sends `Retry-After`); a timeout
  costs `TimeoutSeconds` twice — 20 minutes with the image's 600 s.
- **There is no circuit breaker on model calls.** The `Resilience` settings section is bound and read by
  nothing (`ResilienceOptions`: `LlmMaxRetries`, `LlmTimeoutSeconds`, `CircuitBreakerThreshold`,
  `CircuitBreakerDurationSeconds`…), as `docs/reference/configuration.md` now says; only `Llm:MaxRetries`
  and `Llm:TimeoutSeconds` act.
- **Failure messages name settings loosely.** An exhausted `maxIter` whose tool-free last call came back
  empty says "Raise the agent's max_iterations" (`FinalAnswerPolicy`; with text in hand it says "Agent did not
  produce a final answer within the allowed iterations"): the YAML key is `maxIter`, and `max_iterations` is
  silently ignored.
  An empty answer says "raise Llm:MaxTokens": machine-wide that is the setting; inside the crew only a
  task's `llmOverride.maxTokens` reaches the model, not an agent's `llm` block (`design/prompting.md` § 7).

## 2. `circuitBreaker` — what it really does

The YAML block (`CircuitBreakerYamlConfig`, at the crew root and on a task) takes `preset` (`strict`,
`default`, `permissive`; any other value means `strict`), `maxTransitions`, `stateTimeoutSeconds`,
`maxStateVisits`, `maxTotalDurationSeconds`, `useDegradedMode`, `maxRetries`, `maxToolCallsPerRound`,
`maxValidationRetries`. At 24ab0d0, as at rc.4:

| Where, which key | Effect |
|---|---|
| crew level, `process: graph`, no `graphConfig` | the graph's limits: `preset`, `maxTransitions`, `maxStateVisits`, `maxTotalDurationSeconds` (`CircuitBreakerPolicyFactory.ResolveGraph`) |
| crew level, `graph` with `graphConfig` | none: `graphConfig` wins |
| crew level, any other mode | none |
| task level | none: mapped by `YamlCrewMapper`, never copied onto the task by `CrewFactory.CreateTasks` |
| `maxRetries`, `maxToolCallsPerRound`, `maxValidationRetries` | none: read only by `CreateGuardContext`, which nothing calls |
| `stateTimeoutSeconds`, `useDegradedMode` | none: `GraphRunner` checks transitions, visits and total duration only; a trip always fails the run |

Checked: a six-task `graph` crew with neither block stopped at its sixth task, no task having failed —
`Cycle detected: node 'execute_task' visited 6 times (max: 5)`, exit 2; a crew-level
`circuitBreaker: {preset: permissive}` let it finish; adding `graphConfig: {circuitBreakerPreset: strict}`
stopped it again; in `sequential`, a crew- and task-level `circuitBreaker` with `maxTransitions: 1`
changed nothing.

Orkeon's own pages say the same at 24ab0d0 (`docs/orchestration/fsm.md`, `docs/architecture/yaml-schema.md`;
at rc.4 they still described a per-task state machine), and so does § 8 of `orkeon/orkeon-reference.md`.
Write no `circuitBreaker` outside a `graph` crew; in
a `graph` crew write `graphConfig` and size it — the default `strict` preset allows five task attempts in all
and ten minutes (`design/team-patterns.md` § 5). The guards that act in every mode are `maxIter`
(`design/sizing-and-cost.md` § 2), the stop on repeated tool errors and the model retries.

## 3. How a failure travels

The table is `design/team-patterns.md` § 1; its consequences for error handling:

| Mode | What the design must add |
|---|---|
| `sequential` | little: dependents are skipped, the run exits 2, the last stderr line names every failed and skipped task. Declare every real dependency, so nothing runs on a failed input. Any failed task turns the run red, optional ones included: an optional step degrades inside its task (§ 6) |
| `parallel` | dependents run with the failure text as their input and the run exits 0: the synthesis checks its inputs, and an acceptance criterion says what a failed branch must produce |
| `graph` | a failed task is re-run up to `maxRetryCycles`; exhausted retries still exit 0 — only a breaker trip fails the run |
| `hierarchical`, `consensual`, `autonomous` | exit 0 whatever the tasks did (except `consensual` with `Orkeon:Consensus:FallbackStrategy: Fail`): an acceptance criterion on the failure behaviour |

Outside `sequential` the exit code proves nothing: the bench reads `task.completed` (`success`, `skipped`),
the `error` event (`crew_failed`, `crew_cancelled`) and `run.finished` (`orkeon/cli.md` § 3).

## 4. Retrying on purpose

| What failed | Retry where | How |
|---|---|---|
| a model call, transiently | Orkeon already does | per profile: `Llm:MaxRetries`, `Llm:TimeoutSeconds` (`orkeon/llm-profiles.md` § 3); `ORKEON_Llm__MaxRetries=0` in an L2 scenario that tests a failure |
| a flaky tool call (network, timeout) | in the task, by the model | "if `web_scrape` fails, try once more after the other companies, then mark it unavailable" — never "retry until it works" |
| a whole task (empty answer, transient failure) | `process: graph` | `maxRetryCycles` and a sized breaker (`design/team-patterns.md` § 5) |
| a unit, across runs | the registry | `attempts` in the unit's marker, a cap, then a list for a person (`resume-patterns.md` § 7) |
| the run | a relaunch, after reading the reason | by the user or a schedule; never an automatic loop on a remote profile — each remote run passes the budget gate (`process/workflow.md` § 4) |

**The stop on repeated tool errors.** After each round, the loop compares the last tool error with the
previous one; the same text three rounds in a row ends the task with
`Agent stopped after 3 identical tool call failures. Error: …` and the partial work
(`ConversationPolicy`, `AgentDefaults.MaxConsecutiveIdenticalErrors`); a success or another error resets
the count. Fixed in the code, unrelated to `circuitBreaker`. Checked: three identical `file_read` errors
ended the task, its dependent was reported `skipped: true`, an independent task still ran, exit 2. It turns
these into failed tasks:

- an existence check repeated on a folder that does not exist yet (`resume-patterns.md` § 4);
- a wrong argument name the model repeats (`Required parameter 'path' is missing`, V-06);
- a URL refused by the SSRF guard, retried as is (`reliability/security.md` § 4);
- a write to a read-only root, retried as is;
- a prompt that says "retry the same call up to five times".

## 5. Asking a person: `human_input`

How the tool behaves is `orkeon/cli.md` § 2.5: without `--events` an auto-approver answers; with
`--events jsonl` (Studio, the bench) the run waits for `input.given` on stdin, with no timeout. What each
answer type becomes when nobody answers (checked, both columns):

| `input_type` | Under `./run.sh` (no `--events`) | Under Studio or the bench, stdin closed or run cancelled | Use it for |
|---|---|---|---|
| `approval` | **true**, whatever `default_value` says | refused | never as the only gate of an action |
| `choice` | `default_value`, else the first choice | `default_value`, else the first choice | a decision with a safe default, listed first |
| `text` | `default_value`, else the word `approved` | `default_value`, else empty | information the run can do without |

Rules:

1. `humanInput: true` gives the task the tool (`ChatOptionsComposer`); the model decides whether to call
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

- **Decide what may be lost.** `NEED.md` names the core and the optional parts. Actions fail closed: no
  evidence, no action. Enrichment fails soft: what is missing is flagged, never invented.
- **Make degradation data**, not prose: a `status` (`complete`, `partial`), an `error` per item, a "Not
  covered" section; a schema on the deliverable (`INV-SCHEMA`) and an acceptance criterion that checks it.
- **Keep an expected failure inside its task** when the run must go on: told to record the failure and
  continue, the agent completes the task and the run exits 0 with a flagged output. A separate optional
  task that fails makes a `sequential` run exit 2.
- **Say it in the task's guardrails**: the `analysis` preset adds "If a tool call fails or returns no data,
  report the failure clearly. Do NOT generate fictional content to compensate." (`GuardrailPresets`) — task
  level only (`design/prompting.md` § 7).
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
- **Static**: `grep -rn circuitBreaker teams/<slug>/crew/` finds nothing, or only the `config.yaml` of a
  `graph` crew without `graphConfig`; every `humanInput: true` has a written condition and a `choice` with a
  safe default; no `approval` question guards an acting tool.

## 9. Before gate 3

- [ ] `NEED.md` says what must stop the run, what may degrade, what waits for a person.
- [ ] The mode's failure behaviour is known (`design/team-patterns.md` § 1) and, outside `sequential`,
      covered by an acceptance criterion read from the events.
- [ ] No `circuitBreaker` outside `graph`; `graphConfig` sized when the mode is `graph`.
- [ ] No prompt asks for the same call to be repeated; existence checks cannot error three times.
- [ ] Every degraded output is flagged in data and checked; nothing is invented to fill a gap.
- [ ] Every question to a person is a `choice` with a safe default, or a file read after the run.
