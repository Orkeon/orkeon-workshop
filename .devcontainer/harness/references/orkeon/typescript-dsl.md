# Orkeon TypeScript DSL (`.ork.ts`) — declarative shape

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew --format ts` skill. Established on Orkeon 1.2.0 (a9f3878, 2026-11-16), the
> version the image installs (D110); first written on `1.0.0-rc.4`.
> Sources: at that tag — `src/scripting/Orkeon.Scripting/Typings/*.d.ts`, `Orkeon.Scripting.csproj` (the
> `orkeon.d.ts` roll-up), `Builders/JsAgentBuilder.cs`, `Builders/JsCrewBuilder.cs`,
> `Adapters/JsCrewConfigurationAdapter.cs`, `Builders/JsDecisionMapper.cs`, `docs/reference/scripting-dsl.md`,
> `docs/guides/write-a-crew-in-typescript.md`, `docs/orchestration/process-types.md`; the `orkeon.d.ts` that `orkeon typings` of
> the published 1.2.0 CLI writes, and `--validate` and `orkeon run` on that CLI for the facts marked (1.2.0 CLI).

Reference model in the repository: `examples/scripting/crew-review-desk/`.

## The required shape: declarative

An `.ork.ts` goes to one of **two engines**, depending on how it ends:

| | Procedural | **Declarative (to produce)** |
|---|---|---|
| The file ends with | `await crew.run()` | `globalThis.crew = crew;` |
| Tasks, `process`, `manager`, `memory`, `planning`, `deliverable` | **ignored** | honoured |
| Agents' `.body()` | executed | ignored (warning) |
| `orkeon run --validate` | since rc.7 (#316) checks the version directive, the types and the esbuild bundle, never evaluates the script: `VALIDATION OK: <file> (procedural script: bundled, not run)` (1.2.0 CLI) — nothing of a crew is checked | loads the crew and checks it, as for a YAML crew |
| Tool catalogue | — | the same as a YAML crew |

A team for Studio is **always declarative**: last line `globalThis.crew = crew;`, never
`crew.run()`, never `.body()`, `.withState()`, `.onError()`, `.onCrew*()`,
`.onAgent*()` (ignored, with a warning). `.budget()` is no longer ignored since e44df3f: honoured on
`process("autonomous")`, it refuses the crew on any other process (`crewBuilder()` below). `globalThis.inputs` does not exist in this shape (passing
`--inputs` prints a warning): the inputs are read from files (`/workspace/...`) with the tools.

Two facts of the procedural engine only, since c727c06, for a probe script, never a team (V-55): `ctx.llm.act(prompt,
{ system, context })` sends `context` as a user message of its own between `system` and the prompt, so a decision
profile's `guard` and `route` judge the prompt alone (#276); and a call a decision stage blocks rejects with a
`DecisionBlockedError` (`errorType` `DecisionBlocked`, `profile`, `stage`, `risk`, `reason`; `onError` code
`decision_blocked`) from `complete`, `chat`, `extract`, `decide`, `act` and `stream` — uncaught, the run exits 2 with
`Script rejected with: DecisionBlockedError: Blocked by the decision stage '<stage>' of profile '<profile>': …` on
stderr and no `error` event (#269; before, an `<undefined-llm:…>` text). A declarative team meets the same block as a
failed task (`llm-profiles.md` § 3).

Since c101cbd (#285), also procedural only: `ctx.llm.extract<T>(prompt, schema, opts?)` takes as `prompt` a string,
a `readonly Message[]` or a `MessageList` (`{ messages: [...] }`, the forms `chat` takes; `chat({ messages })` no
longer sends an empty conversation), and `ExtractOptions` (`LlmCallOptions` plus `system?: string`). With `system`,
a `system` message carrying the JSON instruction goes first and the user content is sent untouched; without it the
instruction is appended to the prompt, or to the last user message of the messages form. The messages form is the
**re-ask**: send the refused answer back as an `assistant` turn and the correction as a `user` turn. When the provider
declares JSON Schema support, the caller's schema is sent as a **non-strict** `json_schema` (`extract`), otherwise
`json_object` as before; an explicit `responseFormat` on the call still wins (`Typings/context.d.ts`,
`Runtime/JsLlmFacade.cs`).

More of the procedural engine, read in the 1.2.0 typings and CHANGELOG — for a probe script, never a team:

- `crew.run()` resolves to `{ output, tasks }` where `output` is the last agent output that was not `null`, as the body
  returned it: an object stays an object (it was the CLR type name `"System.Dynamic.ExpandoObject"` before 1.1.0,
  #369; `CrewResult.output` is `unknown`). Checked on the 1.2.0 CLI: a body returning `{ k: 1 }` gives `typeof
  res.output === "object"`. A script that read it as a string narrows it first.
- `ctx.llm.act`'s `onToolCall` answers `"allow"`, `"ask"`, `{ deny }` or `{ input }`; `{ context }` is no longer a
  verdict (rc.7, #307: an unknown shape denies the call, `DENIED: onToolCall returned no valid verdict`) — to change what
  the model reads of a result, return `{ context }` from `onToolResult`. Without the host's invocation pipeline,
  `onToolCall` runs first and the permission gate is consulted once, on the input it returns (#303).
- `ActOptions.onContextPressure` (rc.7, #327) runs before a model turn once the loop's messages pass
  `contextPressure.thresholdTokens` (100,000 estimated tokens by default) and says which older tool results to prune.
- `{ llm: { profile: "small" } }` on a `ctx.llm` call runs that one call on a host profile (rc.7, #331);
  `llm.profiles` (1.1.0, #364) is the frozen list of the names `llm.profile(name)` takes, `"default"` first.
- `ctx.fileSystem.prompt` (1.1.0, #378) is the `## File system` section a declarative turn of the agent would hold —
  `""` when no path is visible, no tool of the agent uses the file system, or `.announceMounts(false)`.
- A refusal of a builder, a factory or the `llm` namespace is an `InvalidScriptError` (an `Error` subclass, `clrType`
  `"InvalidScriptException"`) a script catches with `try … catch` (1.1.0, #364, #366); it crossed every `catch` before.
- `stateGraph(...)` refuses, in one message, an orphan node, a node with no outgoing edge, an edge from or to an
  undeclared node and a graph with no path to END (rc.7, `GraphTopologyValidator`).
- `orkeon run --test` binds the global `test` (`test.mockLlm`, `test.mockTool`, `test.assertLlmCalled`,
  `test.assertToolCalled`) in a procedural script; on a YAML crew, a declarative script or `--validate` the flag is
  refused (exit 1).

## Runtime environment

- esbuild bundles the entry point (`--bundle --format=esm --platform=neutral --target=es2022`), then Jint
  runs it. **No Node, no DOM**: no `fs`, no `fetch`, no `process`, no Node module (`require("fs")` or a bare import fails the bundle), no
  `setTimeout`, no `Buffer`, no **`console`** (`console is not defined` at run time). All file or network access goes through the agents' tools.
- Relative `import`s are resolved and inlined: `import { pickTools } from "./tools/index.ts";`
  (explicit `.ts` extension, as in the examples). esbuild also follows an import that leaves the crew
  folder, but a copy of the team carries only its folder: keep every import inside `crew/`.
- The script's folder is mounted read-only under `/script` (data shipped with the team).
- **Do not write** the `/// <reference orkeon-script="1.0" />` directive: it is optional (1.0 by default)
  and `tsc` rejects it (`TS1084: Invalid 'reference' directive syntax`) — the repository strips it before its own `tsc`.
  Since fa46bb5 the runtime also reads `// @orkeon-script 1.0`, a plain line comment `tsc` accepts, with the same
  validation (`VersionDirectiveParser`; the reference form wins when both are present) — optional too.
- Everything is global: no `import` for `agentBuilder`, `taskBuilder`, `crewBuilder`, `toolBuilder`, `llm`.

## `agentBuilder()`

| Method | Purpose |
|---|---|
| `.name(id)` | Identifier (snake_case/kebab-case) — required |
| `.role(s)` `.goal(s)` `.backstory(s)` | The agent's prompts — `role` and `goal` required: `build()` throws without them (`agentBuilder() requires .role(...).`); unlike YAML, the role never falls back to the id |
| `.tools(["file_read", …])` | **Built-in** tools, by catalogue name (strict resolution) |
| `.withAutonomousTool(t)` / `.withAutonomousTools([t, …])` | **Custom** tools (`toolBuilder`), as built instances (anything else is refused) |
| `.allowDelegation(bool)` | Delegation (adds the coworker tools when the process is `sequential` or `graph`) — `false` by default in TS; write it anyway, explicitly |
| `.maxIterations(n)` | LLM ⇄ tool iterations (default 20); 0 or less: `build()` throws |
| `.maxRpm(n)` | YAML parity `maxRpm:` — at most *n* model requests per minute for this agent: one more waits its turn, it never fails the task. The host's `RateLimiting:AgentRequestsPerMinute` bounds it too, the stricter winning. Left out: no limit of its own; 0 or less: `build()` throws (`agentBuilder() '<name>': .maxRpm(0) — …`) |
| `.maxExecutionTime(seconds)` | YAML parity `maxExecutionTime:` (since f59446b) — the longest a task may take on this agent: past it the task fails (`ExecutionTimeExceeded`); the wait for a human input does not count. A whole number from 1 to 4294967, else `build()` throws (`agentBuilder() '<name>': .maxExecutionTime(0) — the seconds the agent may spend on a task must be a whole number from 1 to 4294967. …`); on the manager of a `hierarchical` crew the load fails; a procedural script ignores it with a warning. Left out: no limit |
| `.verbose(true)` | The agent's turns (tool calls, results, model answers) at Information under `Orkeon.Verbose`, shown by `orkeon run` without `-v` (since f59446b) |
| `.llm(cfg)` | **Applied** to every call of the agent. Takes an `LlmConfig` only: `llm.default_` (the run's profile, its model), `.with({ temperature, maxTokens, responseFormat, model, effort, cache })` on it (`effort` since e44df3f, as `.effort(level)`; `cache` since f80665f, as `.cache(...)`) (`maxTokens` an integer from 1 to 2147483647 since 13461ea, else the script fails — no more truncation; no `callMode`: at 151a762 the typings and the runtime know none — the call mode is the host setting `Llm:CallMode` / `Llm:Profiles:<name>:CallMode`, `llm-profiles.md` § 3), `llm.model(name, overrides?)`, `llm.profile(name, overrides?)` (a host profile, `Llm:Profiles:<name>`; unknown: the load fails, listing the known ones). A string or an object literal throws (`.llm(...) takes an LlmConfig, not …`); `llm.openai(…)` and the other vendor factories are gone. Tune with `llm.default_.with({ temperature: 0.2 })`; never pin a model or a profile without a design decision (`orkeon-reference.md` § 7) |
| `.effort(level)` | Since e44df3f: turns the provider's thinking on at `"low" \| "medium" \| "high" \| "xhigh" \| "max"` (another value throws; `JsLlmConfig.RequireEffort`); a provider whose field knows fewer levels (three for OpenAI's `reasoning_effort` and Ollama's `think`) sends the highest it knows below the one asked, and warns. Same as `effort` in `llm.default_.with({...})` |
| `.cache({ systemPrompt, tools, ttl })` | Since f80665f (#254), YAML parity `llm.cache:` — asks the provider's prompt cache: `systemPrompt: true` marks the system prompt, `tools: true` the tool list, `ttl` is `"5m"` or `"1h"` (left out: the vendor's default). Honoured where the cache is explicit (Anthropic), ignored elsewhere; also applied to the agent's procedural `ctx.llm` calls. Another key (`.cache(...) does not apply 'system'. It takes: systemPrompt, tools, ttl.`), another `ttl` (`.cache(...): cache ttl must be 5m or 1h, not '2h'; …`), a flag that is no boolean, or a `ttl` with neither flag `true` (`.cache(...) ttl caches nothing on its own: set systemPrompt or tools to true.`) throws when the crew loads. `.cache({})` is an explicit off, which also turns off the host's default `Llm:Cache` (`llm-profiles.md` § 3); left out, the agent inherits it. Same as `cache` in `llm.default_.with({...})` (`LlmConfig.with({ cache }): …` in its messages). For a stable prompt across turns on Anthropic, `.cache({ systemPrompt: true, tools: true })` (`design/sizing-and-cost.md` § 7) |
| `.filesystem([...])` | 1.1.0 (#349), YAML parity `filesystem:` — the only virtual paths the agent's tools may touch, each a path or `{ path, access }` with `access` `"ro"`, `"rw"` or `"rwnd"` (left out: the mount's own rights). An entry narrows the mount that holds it, never widens it; a path under no mount, or an access the mount does not grant, refuses the agent's run when it starts, never at build (`--validate` passes it, 1.2.0 CLI). A `.workingRoot(...)` must lie inside it. Left out: the run's mounts apply |
| `.announceMounts(false)` | 1.1.0 (#348), YAML parity `announce_mounts:` — turns off the `## File system` section an agent with a file-system tool gets in its system prompt (its scope, else the run's agent-facing mounts and their rights, and its working root). On by default |
| `.workingRoot(path)` | Since e44df3f, YAML parity `workingRoot:` (RT-06): the virtual directory the agent's file and shell tools (`file_*`, `node_*`, `edit_batch`, `shell_command`) stay inside — a relative path resolves under it, a path outside is refused, a command runs there. An absolute VFS path under a mount, without `..`; one that is not refuses the agent's run when it starts, never at build; an empty path throws (`.workingRoot(path) requires a non-empty virtual path.`). A child of `spawn_agent` without a root of its own runs under its parent's. Left out: unrooted |
| `.withResponseFormat(t)` / `.withResponseSchema(name, schema, strict?)` | The agent's output format (`text` \| `json_object` \| `json_schema`) |
| `.build()` | Required |

## `taskBuilder()`

| Method | Purpose |
|---|---|
| `.name(id)` | Names the task in a load error only |
| `.agent(agentInstance)` | Assigned agent (the built instance, one the crew holds, else the load fails) |
| `.description(s)` `.expectedOutput(s)` | Required |
| `.withContext(t)` / `.withContexts([t, …])` | **Dependencies**: `t` runs before, and the task is skipped when `t` failed — this is the DAG (a task the crew does not hold fails the load). Every earlier output reaches the task anyway, 8,000 characters in all (`orkeon-reference.md` § 4) |
| `.tools([...])` | Built-in names and/or `toolBuilder` instances **added** to the agent's tools for this task only, resolved strictly (an unknown name fails `--validate`). `.withTaskTool(t)` is gone |
| `.retry({ attempts, backoffMs?, backoff? })` | rc.7 (FWK-15), YAML parity `retry:` — a failed attempt runs the WHOLE task again, tool calls included (nothing deduplicates a call that already succeeded), up to `attempts` runs in all (required, 1 or more); `backoffMs` (default 0), `backoff` `"fixed"` (default) or `"exponential"` (doubling, capped at five minutes). Never retried: a cancellation, a Guardian refusal, an exhausted budget. A decision task cannot have one. In `.process("graph")` it is the only retry |
| `.humanInput(true)` | Gives the agent the `human_input` tool for this task |
| `.asyncExecution(true)` | `process("sequential")`: runs alongside the next tasks, a task that lists it in `withContext` waits for it; `parallel`: no effect; any other process: the load fails |
| `.withResponseFormat(t)` / `.withResponseSchema(…)` | This task's output format (over the agent's) |
| `.withProfile(name)` | This task alone on another host profile (YAML `llmOverride.profile`) |
| `.decision(spec)` | Since e44df3f (#234), YAML parity `decision:`: `{ questions: { <name>: { choice: { <option>: <what it is> } } \| { score: [labels] } \| { noul: <test> } (each with optional `instructions`) }, minConfidence? (default 0.5), state? (task names; default each dependency that ran), longContext?, fallback? ({ question: answer }, what is answered when the circuit is off — `--no-decision`, `Orkeon:Decision:Enabled=false`, no model) }`. The task needs `.name(...)` (`taskBuilder() decision task requires .name(...).`); an object literal only. Since 0ea39d9 the load refuses, naming the task and the key, a `state` that is not an array of task names, a `fallback` that is not an object of strings (quote every answer), a `choice` value or a `score` entry that is not a string |
| `.when(decisionTask, clauses)` | Since e44df3f, YAML parity `when:`: runs the task only when the named decision task's answers match — `{ question: [options] \| ">= 0.7", "question.option": ">= 0.25" }` — or `"otherwise"` (no other task gated on that decision matched). The decision task and the tasks its `state` reads become dependencies; an unknown decision task fails the load (`Task 'x' when: 'y' is not a decision task of the crew.`), and the process rules are YAML's (`DecisionTaskRules`, `yaml-schema.md`). One `.when()` per task: since 0ea39d9 a second one throws (`.when(task, clauses) is called twice on task 'x': a task has one condition.`) |
| `.expect(jsonSchema)` | No effect on the worker: recorded in the task context only when there is no deliverable, never validated. Use `.deliverable({ source: "structured_output", … })` |
| `.deliverable({ path: "/output/x.md", source: "final_message", format: "markdown" })` | File written by the framework (`source`: `final_message` \| `structured_output` (requires `schema`/`schemaPath`/`schemaInline`) \| `tool_call` \| `none` — required by the typings, so `tsc` catches its absence; omitted at run time it means `tool_call`, as in YAML; `format`: `markdown` \| `json` \| `text`; also `sanitize`, `schemaPath`, `schemaInline`) |
| `.build()` | Required |

Declare a task **after** the ones it references in `withContext` (they are constants).

Since 0ea39d9 a task is keyed by its `.name()`, else by its full description, and two tasks with the same key are refused
at load: `Task 'same' is declared twice: a task name is unique in a crew.` (`--validate` exit 1, a run exit 2; at 151a762
both passed and the second task won — V-54). The crew-level checks (duplicates, `state`, `when:`) run only when the
script hands its crew to the runner (`(globalThis as any).crew = crew`): a script that ends on `await crew.run()` takes
the procedural engine, which never reads the declared tasks (`Procedural crew script: crew 'dup' declares 2 task(s) that
this run will not read.`), so neither duplicates nor decisions are checked (Orkeon's own `examples/scripting/14-decision-and-when.ork.ts` ended so up
to 1.0.0; since 1.1.0, #370, it hands its crew off with `globalThis.crew = crew`).

## `crewBuilder()`

| Method | Purpose |
|---|---|
| `.name(slug)` `.goal(s)` | Always write them (unset, the name is `crew` and the goal is synthesized from it); the name scopes the crew's memory |
| `.process("sequential")` | `"sequential" \| "hierarchical" \| "parallel" \| "consensual" \| "graph" \| "autonomous"`, lower case exactly (`"Sequential"` throws). A TypeScript `graph` crew has no `graph:` block (no nodes, no edges, no budgets): it runs one node per task in execution order under the default bounds — visits the sum over the tasks of 1 + their retries, transitions twice that plus one, the strict preset's 10 minutes in all —, and the mode no longer retries a failed task by itself (`.retry(...)` on the task does). A graph team that needs edges, loops or more time is YAML (`yaml-schema.md` § Graph) |
| `.withAgents([a, b])` / `.withAgent(a)` | All the agents, built (a builder callback is refused); list the manager there too (it is added if missing) |
| `.withTasks([t1, t2])` / `.withTask(t)` | All the tasks, built |
| `.manager(agent)` | **Required** in `hierarchical` (otherwise: `crewBuilder().process("hierarchical") requires .manager(agent).`), where it assigns and reviews on its own `.llm(...)`; the `ManagerDecision` arbiter in `consensual`; any other process: the load fails |
| `.memory(true)` | Crew memory: each task's output stored, the closest recalled before each task, in the host's default store under the crew's name — under `orkeon run`, for the life of the process unless the settings make `Memory:Provider` durable (`resume-and-memory.md` § 2) |
| `.planning(true)` | A plan per task, written once before the first task on the default profile, read by each task |
| `.maxRpm(n)` | YAML parity of the crew's `maxRpm:` — at most *n* model requests per minute for all the crew's agents and its manager together, parallel waves included; one more waits. Left out: no limit; 0 or less: `build()` throws |
| `.verbose(true)` | Every agent's turns at Information under `Orkeon.Verbose`, shown by `orkeon run` without `-v` (since f59446b) |
| `.budget({ toolCalls, delegationDepth, wallTime, tokens, contextTokens, spawnedAgents })` | Since e44df3f (#218), YAML parity `budget:` — spent by `process("autonomous")` alone (its manager, the agents it delegates to and those they spawn, together); any other process is refused when the run adapts the crew (`Crew 'x': crewBuilder().budget({...}) - the sequential process spends no budget: its limits would bound nothing. Remove .budget(...), or use .process("autonomous") - …`), and so is a limit that is not 1 or more. A key left out: no token cap, no wall time, 50 tool calls (tasks handed out), 4 delegations, 10 spawns. `wallTime` in seconds or a duration (`"5m"`). `contextTokens` (#224: context counted once) is refused on a declarative autonomous crew, which counts the tokens of each finished task. Before e44df3f it was ignored here, with a warning |
| `.build()` | Required, then `globalThis.crew = crew;` |

Not exposed by the DSL (they exist only in YAML): `guardrails` (agent and task), a task's temperature,
`maxTokens`, `thinking` and `cache` (`llmOverride`), an agent's `topP`, `thinking` beyond `.effort(...)` (turning it off), `knowledge`,
the `graph:` block, an agent's `permissionMode`, `memoryProvider`. If the need requires them, use the `orkeon-crew --format yaml` skill.

## `toolBuilder<TIn, TOut>()` — custom tools

```ts
const wordCount = toolBuilder<{ text: string }, { words: number }>()
    .name("word_count")                                   // snake_case, unique, ≠ built-in tools
    .description("Counts the words in a text")            // what the model reads: say when to use it
    .withSchema({
        type: "object",
        properties: { text: { type: "string", description: "The text to count" } },
        required: ["text"],
    })
    .execute((input) => ({ words: input.text.trim().split(/\s+/).length }))
    .access("read")                                       // read | edit | execute
    .build();
```

- The `<TIn, TOut>` generics are required: without them `input` is `unknown` and every access is a type error.
- `execute` is pure JavaScript, synchronous or `async`, **without** I/O (no Node): computations, parsing,
  normalization, business rules. To read/write files or the web, use the built-in tools.
- Put the tools in `crew/tools/index.ts` with a `pickTools(...names)` that **throws** on an unknown
  name (see the template) — a missing tool must stop the run, not silently weaken it.

## Canonical skeleton

```ts
import { pickTools } from "./tools/index.ts";

const researcher = agentBuilder()
    .name("researcher").role("Web researcher")
    .goal("Find recent, reliable sources")
    .backstory(`Rigorous information specialist; cites the URL of every fact.`)
    .tools(["web_search", "web_scrape", "file_read"])
    .allowDelegation(false).maxIterations(10)
    .build();

const writer = agentBuilder()
    .name("writer").role("Writer")
    .goal("Write a clear note from the sources")
    .backstory(`Technical journalist; short, factual, sourced.`)
    .withAutonomousTools(pickTools("word_count"))
    .llm(llm.default_.with({ temperature: 0.7 }))
    .allowDelegation(false).maxIterations(5)
    .build();

const research = taskBuilder().name("research").agent(researcher)
    .description(`Read /workspace/topic.md with file_read, then search for this week's news.`)
    .expectedOutput("5 to 8 sources: title, URL, date, two-sentence summary")
    .build();

const note = taskBuilder().name("note").agent(writer)
    .description("Write the tech watch note from the sources.")
    .expectedOutput("A Markdown note of 600 words maximum, sources at the end of the note")
    .withContext(research)
    .deliverable({ path: "/output/note.md", source: "final_message", format: "markdown" })
    .build();

const crew = crewBuilder()
    .name("tech-watch").goal("Produce a sourced tech watch note")
    .process("sequential")
    .withAgents([researcher, writer])
    .withTasks([research, note])
    .build();

globalThis.crew = crew;
```

## Type checking (optional but recommended)

The typings are one `orkeon.d.ts`, rolled up from `Typings/*.d.ts` when `Orkeon.Scripting` builds and
embedded in it: `orkeon typings [--out <dir>]` writes it (with `orkeon-cli.d.ts`) into `./.orkeon/` of any
installation, and the repository's build copies it to
`src/scripting/Orkeon.Scripting/bin/<Config>/net10.0/dist/orkeon.d.ts`. The image installs it at
`/usr/local/share/orkeon/typings/orkeon.d.ts`, rebuilt from the commit the CLI was built from. Up to 83cd91d the
roll-up `orkeon typings` writes was garbled on Linux: the `*\/` escape of two doc comments became `*//` (Orkeon
#288). Since c101cbd it equals the sources byte for byte (the 1.2.0 CLI writes `orkeon.d.ts` and `orkeon-cli.d.ts`); the image's roll-up, which `orkeon-update.sh` concatenates
from the sources, was never affected. Once it is
copied into the team folder's `typings/orkeon.d.ts`, the template's `tsconfig.json` enables `tsc -p <team>`
(the image's `tsc`, on the PATH; in the repository, `tools/scripting-typecheck/node_modules/.bin/tsc`).
Essential options: `moduleDetection: "force"`, `target`/`lib` `ES2022`, `types: []`,
`moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`. Since a2bb6c3 a parity test holds the
typings to the runtime member by member: what `tsc` accepts, the runtime applies or refuses.

Since rc.7 (FWK-12) `orkeon run --validate` type-checks a `.ork.ts` itself, with `tsc` against the roll-up the build
embeds, on the script and the local modules it imports: a type error is `VALIDATION FAILED: type errors`, then `<virtual
path>:line:col TSxxxx message` per error, exit 1. `Orkeon:Scripting:Toolchain:TypeCheck` is `Validate` (default), `Off`
or `Always` (also before every run: `ERROR: type errors`, exit 2); `TscPath` and `TypeCheckTimeout` (60 s) go with it.
`tsc` is found through `TscPath`, then `tools/scripting-typecheck/node_modules/.bin/` above the install directory, then
the `PATH`; nothing is downloaded. Without it, `Validate` prints `WARNING: type check skipped: TypeScript compiler (tsc)
not found. …` and goes on (1.2.0 CLI), and `Always` fails; since 1.2.0 `orkeon doctor` fails under `Always` when `tsc`
is missing (#387). A module that keeps `/// <reference path="…/.orkeon/orkeon.d.ts" />` passes when the copy equals the
build's roll-up (#315).

Since e258730 the typings declare the input and the result of **every built-in tool** of the `tools`
global (`Typings/tools.generated.d.ts`, rolled up into `orkeon.d.ts`: `OrkeonBuiltInTools`, which
`OrkeonTools` extends, written from each tool's request and response records and pinned against them by
`BuiltInToolTypingsTests`; since c101cbd, #282, rendered from the schema the model receives — names, required
flags, enums as literal unions such as `shell_command`'s `action` or `session_store`'s `operation`, descriptions —
so a script sees exactly what the model sees). The keys are the tool's own snake_case arguments, as in the catalogue
(`orkeon-reference.md` § 5): `tools.fileRead({ path, max_length })`, where a `maxLength` fails `tsc`
(`TS2561 … Did you mean to write 'max_length'?`); the results are the tool's — `fileWrite` resolves to
`{ bytes_written, path, success, … }`, `directoryRead` to `{ files, directories, total_files, truncated, … }`,
not the `bytes` and `entries` the hand-written declarations promised before. The e-mail and drive
families keep hand-written declarations; a plugin or MCP tool falls to the index signature, untyped, and
so do `searchTool`, `databaseQuery`, `delegateWork` and `askQuestion`, names no tool answers to. This
concerns a procedural body or a `.cmd.ts` command: a declarative team names its built-in tools in
`.tools([...])`, and its custom tools do no I/O.

## Common errors

| Message / symptom | Cause |
|---|---|
| `Script '<path>' did not assign globalThis.crew. …` | A script loaded as a crew that never hands one off (`ScriptHost`); since rc.7 `--validate` of a procedural file no longer says it: it answers `VALIDATION OK … (procedural script: bundled, not run)`, which proves nothing about a team |
| `VALIDATION FAILED: type errors` | `--validate` ran `tsc` (rc.7): fix the lines it lists, each `<virtual path>:line:col TSxxxx` |
| The crew runs but the tasks are ignored | `await crew.run()` instead of `globalThis.crew = crew` |
| `Crew configuration references unknown tool(s): x` | Name absent from the catalogue, on an agent or a task (or custom tool passed to `.tools([...])` by name instead of as an instance) |
| `unknown … tool "x" — available: …` | `pickTools` with a typo |
| `Cannot find name 'process'` / `fs` | Node API: does not exist in Jint |
| `.llm(...) takes an LlmConfig, not …` / `llm.openai is not a function` | A model name, an object literal or a removed vendor factory: use `llm.default_.with({...})`, `llm.model(…)`, `llm.profile(…)` |
| `… names the LLM profile 'x', which this host does not offer. Known profiles: …` | `llm.profile(…)` or `.withProfile(…)` naming a profile the machine's settings do not define |
| `… sets asyncExecution …` / `… has no manager …` at load | `.asyncExecution()` or `.manager()` in a process that refuses it |
| `TS1084: Invalid 'reference' directive syntax` | `/// <reference orkeon-script=…>` directive: remove it |

**Do not** imitate: `examples/09-experimental/llm-response-format/crew.ork.ts` (pins a model with
`llm.default_.with({ model: "deepseek-flash" })`, and ends with neither `globalThis.crew` nor `run()`).
