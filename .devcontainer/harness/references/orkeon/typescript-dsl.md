# Orkeon TypeScript DSL (`.ork.ts`) — declarative shape

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew-typescript` skill. Established on Orkeon main at fb26364 (2026-10-06, after 1.0.0-rc.4), the
> version the image builds (D32); first written on `1.0.0-rc.4`.
> Sources: at that commit — `src/scripting/Orkeon.Scripting/Typings/*.d.ts`, `Orkeon.Scripting.csproj` (the
> `orkeon.d.ts` roll-up), `Builders/JsAgentBuilder.cs`, `Builders/JsCrewBuilder.cs`,
> `Adapters/JsCrewConfigurationAdapter.cs`, `docs/reference/scripting-dsl.md`,
> `docs/guides/write-a-crew-in-typescript.md`, `docs/orchestration/process-types.md`.

Reference model in the repository: `examples/scripting/crew-review-desk/`.

## The required shape: declarative

An `.ork.ts` goes to one of **two engines**, depending on how it ends:

| | Procedural | **Declarative (to produce)** |
|---|---|---|
| The file ends with | `await crew.run()` | `globalThis.crew = crew;` |
| Tasks, `process`, `manager`, `memory`, `planning`, `deliverable` | **ignored** | honoured |
| Agents' `.body()` | executed | ignored (warning) |
| `orkeon run --validate` | fails | works |
| Tool catalogue | — | the same as a YAML crew |

A team for Studio is **always declarative**: last line `globalThis.crew = crew;`, never
`crew.run()`, never `.body()`, `.withState()`, `.onError()`, `.budget()`, `.onCrew*()`,
`.onAgent*()` (ignored, with a warning). `globalThis.inputs` does not exist in this shape (passing
`--inputs` prints a warning): the inputs are read from files (`/workspace/...`) with the tools.

## Runtime environment

- esbuild bundles the entry point (`--bundle --format=esm --platform=neutral --target=es2022`), then Jint
  runs it. **No Node, no DOM**: no `fs`, no `fetch`, no `process`, no `require`, no
  `setTimeout`, no `Buffer`, no **`console`** (`console is not defined` at run time). All file or network access goes through the agents' tools.
- Relative `import`s are resolved and inlined: `import { pickTools } from "./tools/index.ts";`
  (explicit `.ts` extension, as in the examples). esbuild also follows an import that leaves the crew
  folder, but a copy of the team carries only its folder: keep every import inside `crew/`.
- The script's folder is mounted read-only under `/script` (data shipped with the team).
- **Do not write** the `/// <reference orkeon-script="1.0" />` directive: it is optional (1.0 by default)
  and `tsc` rejects it (`TS1084: Invalid 'reference' directive syntax`) — the repository strips it before its own `tsc`.
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
| `.verbose(true)` | Detailed log |
| `.llm(cfg)` | **Applied** to every call of the agent. Takes an `LlmConfig` only: `llm.default_` (the run's profile, its model), `.with({ temperature, maxTokens, responseFormat, model })` on it, `llm.model(name, overrides?)`, `llm.profile(name, overrides?)` (a host profile, `Llm:Profiles:<name>`; unknown: the load fails, listing the known ones). A string or an object literal throws (`.llm(...) takes an LlmConfig, not …`); `llm.openai(…)` and the other vendor factories are gone. Tune with `llm.default_.with({ temperature: 0.2 })`; never pin a model or a profile without a design decision (`orkeon-reference.md` § 7) |
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
| `.humanInput(true)` | Gives the agent the `human_input` tool for this task |
| `.asyncExecution(true)` | `process("sequential")`: runs alongside the next tasks, a task that lists it in `withContext` waits for it; `parallel`: no effect; any other process: the load fails |
| `.withResponseFormat(t)` / `.withResponseSchema(…)` | This task's output format (over the agent's) |
| `.withProfile(name)` | This task alone on another host profile (YAML `llmOverride.profile`) |
| `.expect(jsonSchema)` | No effect on the worker: recorded in the task context only when there is no deliverable, never validated. Use `.deliverable({ source: "structured_output", … })` |
| `.deliverable({ path: "/output/x.md", source: "final_message", format: "markdown" })` | File written by the framework (`source`: `final_message` \| `structured_output` (requires `schema`/`schemaPath`/`schemaInline`) \| `tool_call` \| `none` — required by the typings, so `tsc` catches its absence; omitted at run time it means `tool_call`, as in YAML; `format`: `markdown` \| `json` \| `text`; also `sanitize`, `schemaPath`, `schemaInline`) |
| `.build()` | Required |

Declare a task **after** the ones it references in `withContext` (they are constants).

## `crewBuilder()`

| Method | Purpose |
|---|---|
| `.name(slug)` `.goal(s)` | Always write them (unset, the name is `crew` and the goal is synthesized from it); the name scopes the crew's memory |
| `.process("sequential")` | `"sequential" \| "hierarchical" \| "parallel" \| "consensual" \| "graph" \| "autonomous"`, lower case exactly (`"Sequential"` throws). A TypeScript `graph` crew has no `graphConfig`: its breaker allows tasks × 3 task attempts (2 retry cycles) and the strict preset's 10 minutes in all — a graph team that needs more time is YAML |
| `.withAgents([a, b])` / `.withAgent(a)` | All the agents, built (a builder callback is refused); list the manager there too (it is added if missing) |
| `.withTasks([t1, t2])` / `.withTask(t)` | All the tasks, built |
| `.manager(agent)` | **Required** in `hierarchical` (otherwise: `crewBuilder().process("hierarchical") requires .manager(agent).`), where it assigns and reviews on its own `.llm(...)`; the `ManagerDecision` arbiter in `consensual`; any other process: the load fails |
| `.memory(true)` | Crew memory: each task's output stored, the closest recalled before each task, in the host's default store under the crew's name — under `orkeon run`, for the life of the process unless the settings make `Memory:Provider` durable (`resume-and-memory.md` § 2) |
| `.planning(true)` | A plan per task, written once before the first task on the default profile, read by each task |
| `.maxRpm(n)` | YAML parity of the crew's `maxRpm:` — at most *n* model requests per minute for all the crew's agents and its manager together, parallel waves included; one more waits. Left out: no limit; 0 or less: `build()` throws |
| `.verbose(true)` | Detailed log |
| `.build()` | Required, then `globalThis.crew = crew;` |

Not exposed by the DSL (they exist only in YAML): `guardrails` (agent and task), a task's temperature,
`maxTokens` and `thinking` (`llmOverride`), an agent's `topP`, `thinking` and `cache`, `knowledge`,
`graphConfig`, `memoryProvider`. If the need requires them, use the `orkeon-crew-yaml` skill.

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
`/usr/local/share/orkeon/typings/orkeon.d.ts`, rebuilt from the commit the CLI was built from. Once it is
copied into the team folder's `typings/orkeon.d.ts`, the template's `tsconfig.json` enables `tsc -p <team>`
(the image's `tsc`, on the PATH; in the repository, `tools/scripting-typecheck/node_modules/.bin/tsc`).
Essential options: `moduleDetection: "force"`, `target`/`lib` `ES2022`, `types: []`,
`moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`. Since a2bb6c3 a parity test holds the
typings to the runtime member by member: what `tsc` accepts, the runtime applies or refuses.

## Common errors

| Message / symptom | Cause |
|---|---|
| `did not assign globalThis.crew` | Procedural file (`crew.run()`) passed to `--validate` / Studio |
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
