# Team patterns — choosing the shape of a team

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: `docs/orchestration/process-types.md`, `docs/reference/limitations.md`,
> `src/core/Orkeon.Infrastructure/Crew/Strategies/*ProcessStrategy.cs`,
> `src/core/Orkeon.Infrastructure/Consensus/ConsensualProcessStrategy.cs` and `ConsensualProcessOptions.cs`,
> `src/core/Orkeon.Infrastructure/Crew/LlmBasedManager.cs`, `src/core/Orkeon.Domain/Graph/GraphRunner.cs`,
> `src/core/Orkeon.Domain/Common/StateMachine/CircuitBreakerPolicy.cs`,
> `src/core/Orkeon.Infrastructure/Orchestration/SequentialCrewOrchestrator.cs`,
> `src/core/Orkeon.Application/Crew/Execution/AgentPromptComposer.cs`, `ChatClientAgentLoop.cs` and `LlmCallGate.cs`,
> `src/core/Orkeon.Application/Crew/ExecutionOrchestrator.cs` (main at 24ab0d0);
> harness `references/orkeon/orkeon-reference.md` § 2. Every sketch below passed `orkeon run crew --validate` and
> `check_crew.py` on the main build (`1.0.0-rc.4.src.20260930.g24ab0d0`, 2026-10-02); the behaviours of § 1 and
> §§ 4–7 were observed on that build with a recording stub LLM.

The mode (`process`) is the lever with the largest effect on cost, latency and failure behaviour. This
document says what each mode really does — read in the code at 24ab0d0, which
`docs/orchestration/process-types.md` and `docs/reference/limitations.md` now describe faithfully — and
which team shape to build on it. Keys are in `orkeon/yaml-schema.md`; prompts in `design/prompting.md`;
limits and costs in `design/sizing-and-cost.md`.

## 1. What every mode does the same way

**Order.** Every mode except `parallel` runs the tasks one after another, in a stable topological order
over `dependencies`; without dependencies the declared order holds, and in the multi-file layout the
declared order is the alphabetical order of the task file names (`CrewTaskSequencer`). Prefix task ids
(`a_extract`, `b_check`) when the order must be readable. `parallel` runs dependency waves. A cycle fails
`--validate`.

**Context.** A task receives, in its prompt, the outputs of **every task finished before it** — not only
the tasks it depends on — under `Previous task results...`, at most **8,000 characters in total**, oldest
first, the rest replaced by `[... truncated for brevity]` (`AgentPromptComposer`). In `parallel`, a task
sees the outputs of the previous waves only. Consequences: keep intermediate outputs short; hand large
intermediate data over through a file (`design/prompting.md` § 5); still declare every task whose result
a task reads — `dependencies` drive the order, and in `sequential` the skipping of a task whose input failed.

**What fails a task.** Only these exits make `success: false` (`ChatClientAgentLoop`, `ExecutionOrchestrator`):
the LLM call fails (timeout, refused request); `maxIter` is exhausted without a final answer; the final
answer stays empty after one tool-free retry; three identical tool errors in a row (fixed circuit breaker);
the run is cancelled; an exception reaches the task — a rate-limiter refusal (`LlmCallGate`, when a
`RateLimiting` queue is full), a failed knowledge retrieval (these two read in the code). An answer that
*says* it failed is a success.
A deliverable that cannot be written (read-only root, path outside every mount, no JSON found) is logged
and **does not** fail the task.

**Who runs a task, and what a failure does to the run** (`*ProcessStrategy.cs`, `KickoffLoadedCrewAsync`:
exit 2 when the crew output is a failure):

| Mode | `agent:` of the task | A task that fails | The run fails (exit 2) when |
|---|---|---|---|
| `sequential` | honoured, else round-robin | its dependents are **skipped** (`task.completed` with `skipped: true`); independent tasks still run | any task failed or was skipped |
| `parallel` | honoured, else round-robin | dependents still run, with its output in their context — `Task failed: …` when that output is empty | never because of a task — only an exception (no agent, a cycle) |
| `graph` | honoured, else round-robin | re-run after the pending tasks, up to `maxRetryCycles`; dependents are not skipped | the circuit breaker trips (§ 5) |
| `hierarchical` | **ignored**: the manager LLM picks a worker | kept, success false (after a rejected review: `[NEEDS REVISION]` prefix) | never because of a task (no worker, no manager) |
| `consensual` | **ignored**: every agent runs every task | the fallback re-runs it with the first agent | only with `Orkeon:Consensus:FallbackStrategy: Fail` (not the default) |
| `autonomous` | **ignored**: the manager LLM picks an agent | delegated to another agent if `allowDelegation: true` | never; an exhausted budget drops the remaining tasks and still returns success |

`docs/reference/limitations.md` says it, the code confirms it, and the `DESIGN.md` template holds it:
**only `sequential` fails the run on a failed task.** Any other mode needs an acceptance criterion on what
happens when a task fails, and the bench must check the per-task `success` of the events, not the exit code.
Events also differ: `task.completed` carries the role `graph` and arrives when the graph ends, `autonomous`
when the run ends, and `consensus` (on `task.started` too) in `consensual` — attach those by order, not by
role (`orkeon/cli.md` § 3.5).

`allowDelegation: true` (the YAML default) adds `ask_question_to_coworker` and `delegate_work_to_coworker`
in `sequential` and `graph` only; in `autonomous` it allows delegation after a failed attempt; elsewhere it
does nothing. Write `allowDelegation: false` on every agent unless the design uses delegation.

## 2. Choosing

| The need | Pattern | Mode |
|---|---|---|
| Steps that each consume the previous result (read → analyse → write) | pipeline | `sequential` (default) |
| N independent units of the same kind, then one synthesis | fan-out and synthesis | `parallel` |
| A step that fails transiently (flaky source, empty answer) and should be re-run | retry | `graph` |
| A draft that a reviewer criticises and the writer then revises | write/review | `sequential`, unrolled (§ 5) |
| Specialists, the work routed to the right one at run time, a quality gate per task | manager | `hierarchical` — know its limits (§ 6) |
| Several independent viewpoints on one decision | consensus | not `consensual` today: fan-out of viewpoints + a judge task (§ 7) |
| An ill-defined exploration with no acceptance test | exploration | `autonomous` — rarely in this workshop (§ 8) |

Default to `sequential`. Choose another mode only when the need names its benefit, and write the reason
in `DESIGN.md` (`## Process`).

## 3. Pipeline — `sequential`

**When.** Each step needs the previous one; the run must fail when a step fails. **Agents:** one per
competency, 2 to 4; one agent may run several tasks. **Cost:** the sum of the tasks' LLM calls; latency
is the sum of the durations. **Failure:** the cleanest of all modes — dependents skipped, run exit 2,
the reason naming every failed and skipped task.

```yaml
# --- crew/config.yaml
name: release-notes
goal: "Turn the list of merged changes into release notes"
process: sequential
# --- crew/agents/analyst.yaml
role: "Change analyst"
goal: "Group the merged changes by user-visible theme"
backstory: "Reads change lists literally; never invents a change."
tools: [csv_reader]
allowDelegation: false
maxIter: 4
# --- crew/agents/writer.yaml
role: "Release-notes writer"
goal: "Write release notes an end user understands"
allowDelegation: false
maxIter: 3
# --- crew/tasks/a_group.yaml
description: |
  Read /workspace/changes.csv with csv_reader (path: /workspace/changes.csv).
  Group the rows by theme: features, fixes, other.
expectedOutput: "Three Markdown lists (features, fixes, other), one line per change, the change id first."
agent: analyst
# --- crew/tasks/b_write.yaml
description: "Write the release notes from the grouped changes."
expectedOutput: "Markdown starting with '# Release notes', one section per theme, at most 300 words."
agent: writer
dependencies: [a_group]
deliverable: { path: /output/release-notes.md, source: final_message, format: markdown }
```

## 4. Fan-out and synthesis — `parallel`

**When.** The same work on N independent units (one report per market, one file per source), then a
synthesis. **Agents:** one worker agent can serve every task of a wave, plus a synthesiser. **Cost:** the
same tokens as `sequential`; the gain is latency only, and only when calls may overlap: the image's
settings set `RateLimiting:MaxConcurrentRequests: 1` for the local model, so a local fan-out runs its LLM
calls one at a time. Calls beyond the `RateLimiting` windows or concurrency wait in a queue (5 by
default, 32 in the image); a call that finds it full is refused and its task fails, so a wave wider than
the queue is a design error (`design/sizing-and-cost.md` § 1). **Failure:**
a failed collector does not stop the synthesis, which runs with its output as input — `Task failed: …`
when that output is empty (a failed LLM call), else its last text (an exhausted `maxIter`); the run exits 0.
Make the synthesis say which units are missing, and test it. The tasks of one wave do not see each other.

```yaml
# --- crew/config.yaml
name: market-scan
goal: "Summarise each market report, then compare them"
process: parallel
# --- crew/agents/reader.yaml
role: "Report reader"
goal: "Extract the key figures of one market report"
tools: [file_read]
allowDelegation: false
maxIter: 3
# --- crew/agents/synthesizer.yaml
role: "Market analyst"
goal: "Compare the markets from the extracted figures; flag a missing market"
allowDelegation: false
maxIter: 3
# --- crew/tasks/fr.yaml
description: "Read /workspace/fr.md with file_read (path: /workspace/fr.md). Extract revenue, growth and market share."
expectedOutput: "Three lines: revenue, growth, market share, each with unit and period."
agent: reader
# --- crew/tasks/de.yaml
description: "Read /workspace/de.md with file_read (path: /workspace/de.md). Extract revenue, growth and market share."
expectedOutput: "Three lines: revenue, growth, market share, each with unit and period."
agent: reader
# --- crew/tasks/synthesis.yaml
description: "Compare France and Germany from the figures of the previous tasks. Name any market whose figures are missing."
expectedOutput: "Markdown starting with '# Market comparison': a table (market, revenue, growth, share), then three bullet points."
agent: synthesizer
dependencies: [fr, de]
deliverable: { path: /output/comparison.md, source: final_message, format: markdown }
```

## 5. Write/review loop — `graph` retries, an unrolled review revises

`process: graph` is **not** a review loop: its fixed graph `execute_task → route` re-runs a task that
*failed* (§ 1), after all pending tasks, at most `maxRetryCycles` more times (default 2). It never reads
what a reviewer wrote, and it re-runs the failed task itself, never an upstream one — a backstory such as
"report failure so the graph retries the collection step" (repository example
`09-experimental/102-graph-orchestration`) has no effect. Use `graph` for transient failures.

Its circuit breaker is the trap: without `graphConfig`, or with `graphConfig` but no preset, the preset is
`strict` — at most **5 visits of `execute_task`** (every task attempt counts), 50 transitions and
**10 minutes** of run — and a trip fails the run (`Graph execution stopped by circuit breaker`). `default`
gives 10 visits / 100 transitions / 30 minutes, `permissive` 50 / 1000 / 2 hours. Size `maxStateVisits` to
at least *tasks × (1 + maxRetryCycles)* and `maxTotalDurationSeconds` to a measured run (a local model
takes up to 600 s per call). The `stateTimeout` of the presets is not enforced by `GraphRunner`.

```yaml
# --- crew/config.yaml
name: invoice-extract
goal: "Extract the fields of an invoice, retrying a step that fails"
process: graph
graphConfig:
  maxRetryCycles: 1                # each failed task runs at most twice
  circuitBreakerPreset: permissive
  maxStateVisits: 4                # >= tasks x (1 + maxRetryCycles) = 2 x 2
  maxTotalDurationSeconds: 5400    # local model, 600 s per call: size it on an L3 run
# --- crew/agents/extractor.yaml
role: "Invoice clerk"
goal: "Extract invoice fields exactly as printed"
tools: [pdf_reader]
allowDelegation: false
maxIter: 4
# --- crew/agents/checker.yaml
role: "Invoice checker"
goal: "Check the extracted fields against the rules of the need"
allowDelegation: false
maxIter: 3
# --- crew/tasks/a_extract.yaml
description: "Read /workspace/invoice.pdf with pdf_reader (path: /workspace/invoice.pdf). Extract number, date, supplier, total."
expectedOutput: "Four lines 'field: value', null when absent."
agent: extractor
# --- crew/tasks/b_check.yaml
description: "Check the extracted fields: the date is ISO 8601, the total is a positive amount with its currency."
expectedOutput: "Markdown starting with '# Invoice': the four fields, each followed by OK or the rule it breaks."
agent: checker
dependencies: [a_extract]
deliverable: { path: /output/invoice.md, source: final_message, format: markdown }
```

A real write/review loop — the reviewer's words reaching the writer — is a **`sequential` pipeline
unrolled** to a fixed number of rounds: draft → review → revise (one round is usually enough; two cost
twice). Every round is visible in the events and testable at L2 with a scripted LLM.

```yaml
# --- crew/config.yaml
name: product-page
goal: "Write a product page, review it, and revise it once"
process: sequential
# --- crew/agents/writer.yaml
role: "Copywriter"
goal: "Write and revise product pages from the product sheet"
tools: [file_read]
allowDelegation: false
maxIter: 4
# --- crew/agents/reviewer.yaml
role: "Editor"
goal: "Find what breaks the style guide or the product sheet"
backstory: "Lists problems precisely, one per line, with the sentence quoted; never rewrites."
tools: [file_read]
allowDelegation: false
maxIter: 4
# --- crew/tasks/a_draft.yaml
description: "Read /workspace/product.md with file_read (path: /workspace/product.md). Write the product page."
expectedOutput: "A Markdown page starting with '# ', at most 250 words."
agent: writer
# --- crew/tasks/b_review.yaml
description: |
  Read the style guide /crew/style-guide.md with file_read (path: /crew/style-guide.md)
  and the product sheet /workspace/product.md. Review the draft of the previous task.
expectedOutput: "A numbered list of problems: quoted sentence, rule broken, fix. 'No problem.' when none."
agent: reviewer
dependencies: [a_draft]
# --- crew/tasks/c_revise.yaml
description: "Revise the draft: fix every problem the review lists, change nothing else."
expectedOutput: "The revised page, Markdown starting with '# ', at most 250 words."
agent: writer
dependencies: [a_draft, b_review]
deliverable: { path: /output/product-page.md, source: final_message, format: markdown }
```

## 6. Manager — `hierarchical`

**What it really is** (`HierarchicalProcessStrategy`, `LlmBasedManager`). `managerAgent: <id>` is
mandatory (without it, or naming no agent, loading fails). The manager agent is removed from the workers
and **never runs a task**; at least one worker must remain. For each task, in the sequential order, a
built-in "project manager" prompt — not the manager agent's role, goal or backstory, which are unused —
picks a worker from their role, goal, backstory and tools (an LLM error: the first worker), the worker
runs, then the same built-in prompt reviews the output against `description` and `expectedOutput` (an
LLM error: approved). A rejection re-runs the task with only a generic `revision_feedback` context
variable ("Previous output was rejected. Revision n/3. Please improve.") — the manager's feedback is
discarded. Three reviews at most, so at most three executions; after the third rejection the output is
marked `[NEEDS REVISION]` and success false — the deliverable file keeps the last execution.

**When.** Heterogeneous specialists and tasks whose right specialist is not known when designing. If you
know it, write `agent:` in `sequential`: cheaper and deterministic. **Agents:** a manager (no tools, it
never runs) + 2 to 4 workers. **Cost:** per task, one assignment call, 1 to 3 executions, 1 to 3 reviews.
The manager's calls go to the team's default model (the settings' `Llm`, never the manager agent's `llm:`)
and are metered under the manager's role (`operation: manager` in `cost.updated`), outside every task's own
figure: measure their weight on a run. **Failure:** the run exits 0 whatever the tasks did.

```yaml
# --- crew/config.yaml
name: code-review
goal: "Review a change from two specialist angles, then summarise"
process: hierarchical
managerAgent: lead
# --- crew/agents/lead.yaml
role: "Review lead"
goal: "Coordinate the review"
allowDelegation: false
# --- crew/agents/security.yaml
role: "Security reviewer"
goal: "Find security defects in the change"
backstory: "Injection, secrets, unsafe deserialisation; cites file and line."
tools: [file_read]
allowDelegation: false
maxIter: 6
# --- crew/agents/style.yaml
role: "Maintainability reviewer"
goal: "Find maintainability defects in the change"
backstory: "Naming, duplication, dead code; cites file and line."
tools: [file_read]
allowDelegation: false
maxIter: 6
# --- crew/tasks/a_security.yaml
description: "Review /workspace/change.diff (file_read, path: /workspace/change.diff) for security defects."
expectedOutput: "A list: file:line, defect, severity (high/medium/low). 'None found.' when none."
# --- crew/tasks/b_style.yaml
description: "Review /workspace/change.diff (file_read, path: /workspace/change.diff) for maintainability defects."
expectedOutput: "A list: file:line, defect, severity (high/medium/low). 'None found.' when none."
# --- crew/tasks/c_summary.yaml
description: "Merge the two reviews into one verdict."
expectedOutput: "Markdown starting with '# Review', a verdict (approve / changes requested), then the defects by severity."
dependencies: [a_security, b_style]
deliverable: { path: /output/review.md, source: final_message, format: markdown }
```

`check_crew.py` warns `no 'agent'` on these tasks: expected, the manager assigns them.

## 7. Consensus — `consensual`

**What it really is** (`ConsensualProcessStrategy`, `MajorityVotingStrategy`). For each task, every
agent runs it (concurrently); each agent's result is its own vote, so with two agents or more and the
default `Majority` type (strictly more than 50 %) **no consensus is ever reached**. Three rounds follow
(`Orkeon:Consensus:MaxVotingRounds`, default 3), each agent seeing the others' previous results in a
`discussion_context` variable, then the fallback `AcceptBestScore` **re-runs the task with the first
agent** (alphabetical file name) and keeps that result. The vote is not semantic. `--var` values are not
interpolated in this mode. The settings (`Orkeon:Consensus`: the machine's, or the team's
`settings/<slug>/appsettings.json`, D33) cannot be set in the crew.

**Cost:** per task, *agents × 3 × calls per execution* plus one fallback execution — 7 executions for two
agents. Every execution of a task with a deliverable rewrites the file. **Recommendation:** do not build on
`consensual` while its vote compares nothing. For several viewpoints, use the fan-out of § 4 — one task per viewpoint, each with
its own agent — and a judge task that compares them against written criteria: the same diversity, a third
of the cost, and a decision you can test. If you must keep it, one minimal valid sketch:

```yaml
# --- crew/config.yaml
name: risk-rating
goal: "Rate the risk of a supplier from two independent viewpoints"
process: consensual
# --- crew/agents/finance.yaml
role: "Financial risk analyst"
goal: "Rate the supplier's financial risk"
tools: [file_read]
allowDelegation: false
maxIter: 3
# --- crew/agents/operations.yaml
role: "Operational risk analyst"
goal: "Rate the supplier's operational risk"
tools: [file_read]
allowDelegation: false
maxIter: 3
# --- crew/tasks/rate.yaml
description: "Read /workspace/supplier.md with file_read (path: /workspace/supplier.md). Rate the supplier's risk."
expectedOutput: "One line 'risk: low|medium|high', then three reasons."
deliverable: { path: /output/risk.md, source: final_message, format: markdown }
```

## 8. Exploration — `autonomous`

The same built-in manager prompt picks an agent per task; on a failed attempt, an agent with
`allowDelegation: true` hands the task to another agent through the agent channel. The budget is the
fixed `Permissive` preset — 50 tool calls, delegation depth 4, **15 minutes of wall time**, 64,000 tokens,
10 spawned agents — not configurable in YAML (`SequentialCrewOrchestrator`). The wall time is checked
before each task: once spent, the remaining tasks are dropped and the run still exits 0. `spawn_agent` is
not registered by `orkeon run`. With a local model at up to 600 s per call, 15 minutes is one or two
tasks. Choose it only for an exploration whose acceptance is a human reading the result; never for a team
with an incremental, resume or action requirement.

```yaml
# --- crew/config.yaml
name: topic-explorer
goal: "Explore an ill-defined question and report what was found"
process: autonomous
# --- crew/agents/explorer.yaml
role: "Explorer"
goal: "Find what the corpus says about the question in /workspace/question.md"
tools: [file_read, directory_read]
allowDelegation: true
maxIter: 8
# --- crew/agents/critic.yaml
role: "Critic"
goal: "Challenge the findings and point at missing evidence"
tools: [file_read]
allowDelegation: true
maxIter: 6
# --- crew/tasks/explore.yaml
description: "Read /workspace/question.md (file_read, path: /workspace/question.md), then explore /workspace with directory_read (path: /workspace)."
expectedOutput: "Markdown starting with '# Findings': findings with their source file, then open questions."
deliverable: { path: /output/findings.md, source: final_message, format: markdown }
```

## 9. How many agents

- **One competency, one tool set, one agent**: split when two tasks need different tools or a different
  stance (writer vs reviewer), merge two agents with the same tools and rules. 2 to 5 agents cover almost
  every need; more usually means two teams, or steps that should be deterministic tools
  (`design/tools-selection.md`).
- **Tasks carry the work units.** An agent may run several tasks; each task is a fresh conversation that
  knows only its prompt and the previous outputs injected in it.

## 10. Cost at a glance

*N* tasks, *M* agents, *c* LLM calls per execution of a task (≈ the iterations it uses, up to `maxIter`,
plus at most two tool-free retries and two hand-backs of a malformed tool call — `design/sizing-and-cost.md`).
Every one of these calls is metered (`cost.updated`, `run.finished`): the manager's and the retries
included, since STUDIO-42.

| Mode | LLM calls | Latency |
|---|---|---|
| `sequential` | Σ *c* | Σ durations |
| `parallel` | Σ *c* | Σ over waves of the longest task — if calls may overlap |
| `graph` | Σ *c* × attempts (≤ 1 + `maxRetryCycles`) | Σ durations |
| `hierarchical` | Σ (1 assignment + *c* × 1–3 executions + 1–3 reviews) | Σ, × 1.5 to 3 |
| `consensual` | Σ (*M* × 3 × *c* + *c*) when *M* ≥ 2 | Σ of 3 rounds + fallback |
| `autonomous` | 1 assignment + *c* (+ delegations) per task, within the budget | ≤ 15 min |

## 11. Before gate 3

- `DESIGN.md` names the mode and why; for any mode but `sequential`, `ACCEPTANCE.md` has a criterion on
  the behaviour when a task fails, and the bench reads the per-task `success`, not the exit code.
- `graph`: `graphConfig` present, `maxStateVisits` ≥ tasks × (1 + `maxRetryCycles`), duration sized.
- `hierarchical`: `managerAgent` set, ≥ 2 workers; the cost estimate includes the manager's calls.
- Every agent: `allowDelegation` written; `maxIter` justified in `DESIGN.md` (`## Agents`).
- `check_crew.py` then `./run.sh --validate`; the invariants that apply (`testing/invariants-catalog.md`),
  `INV-BUDGET` always.
