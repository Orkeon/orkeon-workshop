# Orkeon TypeScript DSL (`.ork.ts`) — declarative shape

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`), read by the
> `orkeon-crew-typescript` skill. Established for Orkeon `main` at 24ab0d0 (the version the image
> builds, D32; first written on `1.0.0-rc.4`).

Based on `src/scripting/Orkeon.Scripting/Typings/*.d.ts`, `JsCrewConfigurationAdapter.cs`,
`docs/reference/scripting-dsl.md` and `docs/guides/write-a-crew-in-typescript.md`.
Reference model in the repository: `examples/scripting/crew-review-desk/`.

## The required shape: declarative

An `.ork.ts` goes to one of **two engines**, depending on how it ends:

| | Procedural | **Declarative (to produce)** |
|---|---|---|
| The file ends with | `await crew.run()` | `globalThis.crew = crew;` |
| Tasks, `process`, `manager`, `memory`, `deliverable` | **ignored** | honoured |
| Agents' `.body()` | executed | ignored (warning) |
| `orkeon run --validate` | fails | works |
| Tool catalogue | — | the same as a YAML crew |

A team for Studio is **always declarative**: last line `globalThis.crew = crew;`, never
`crew.run()`, never `.body()`, `.withState()`, `.onError()`, `.budget()`, `.onCrew*()`,
`.onAgent*()` (ignored, with a warning). `globalThis.inputs` does not exist in this shape: the
inputs are read from files (`/workspace/...`) with the tools.

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
| `.withAutonomousTool(t)` / `.withAutonomousTools([t, …])` | **Custom** tools (`toolBuilder`), as instances |
| `.allowDelegation(bool)` | Delegation (adds the coworker tools when the process is `sequential` or `graph`) — `false` by default in TS; write it anyway, explicitly |
| `.maxIterations(n)` | LLM ⇄ tool iterations |
| `.verbose(true)` | Detailed log |
| `.llm(llm.openai({ model, temperature }))` | Read and **dropped** on `main`, like a YAML agent's `llm:`: every call uses the team's profile. Never write it |
| `.build()` | Required |

## `taskBuilder()`

| Method | Purpose |
|---|---|
| `.name(id)` | Task identifier |
| `.agent(agentInstance)` | Assigned agent (the built instance, not a string) |
| `.description(s)` `.expectedOutput(s)` | Required |
| `.withContext(t)` / `.withContexts([t, …])` | **Dependencies**: `t` runs before — this is the DAG. Every earlier output reaches the task anyway, 8,000 characters in all (`orkeon-reference.md` § 4) |
| `.tools([...])` / `.withTaskTool(t)` | Read and **dropped** on `main`: a task's tools never reach its agent and are not even resolved, so a typo passes `--validate` (like a YAML task's `tools`, `orkeon-reference.md` § 4). Put every tool on the agent (`.tools([...])`, `.withAutonomousTools([...])`); never write them |
| `.humanInput(true)` | Gives the agent the `human_input` tool for this task |
| `.expect(jsonSchema)` | No effect on the worker: recorded in the task context only when there is no deliverable, never validated. Use `.deliverable({ source: "structured_output", … })` |
| `.deliverable({ path: "/output/x.md", source: "final_message", format: "markdown" })` | File written by the framework (`source`: `final_message` \| `structured_output` (requires `schema`/`schemaPath`/`schemaInline`) \| `tool_call` \| `none` — required by the typings, so `tsc` catches its absence; omitted at run time it means `tool_call`, as in YAML; `format`: `markdown` \| `json` \| `text`; also `sanitize`, `schemaPath`, `schemaInline`) |
| `.build()` | Required |

Declare a task **after** the ones it references in `withContext` (they are constants).

## `crewBuilder()`

| Method | Purpose |
|---|---|
| `.name(slug)` `.goal(s)` | Always write them (unset, the name is `crew` and the goal is synthesized from it) |
| `.process("sequential")` | `"sequential" \| "hierarchical" \| "parallel" \| "consensual" \| "graph" \| "autonomous"`, lower case exactly (`"Sequential"` throws). A TypeScript `graph` crew always runs the strict breaker — at most 5 executions of the task node, retries included, and 10 minutes in all — since the DSL has no `graphConfig`: a larger graph team is YAML |
| `.withAgents([a, b])` / `.withAgent(a)` | All the agents; list the manager there too (it is added if missing) |
| `.withTasks([t1, t2])` / `.withTask(t)` | All the tasks |
| `.manager(agent)` | **Required** in `hierarchical` (otherwise: `process("hierarchical") requires .manager(agent)`) |
| `.memory(true)` | Crew memory: written, never read back into a prompt on `main` |
| `.verbose(true)` | Detailed log |
| `.build()` | Required, then `globalThis.crew = crew;` |

Not exposed by the DSL (they exist only in YAML): task `guardrails`, a task's `llmOverride` temperature,
`maxTokens` and `thinking` — the only model settings applied on `main` —, `knowledge`, `circuitBreaker`,
`graphConfig`, `memoryProvider`. Only the response format of `llmOverride` exists in TypeScript, through
`taskBuilder().withResponseFormat(…)` / `.withResponseSchema(…)`, which the typings do not declare. If the
need requires the rest, use the `orkeon-crew-yaml` skill.

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

The typings are generated as `orkeon.d.ts`: the image installs them at `/usr/local/share/orkeon/typings/orkeon.d.ts`,
rebuilt from the commit the CLI was built from (in the Orkeon repository:
`src/scripting/Orkeon.Scripting/bin/<Config>/net10.0/dist/orkeon.d.ts`; no published package carries them at 24ab0d0).
Once they are copied into the team folder's `typings/orkeon.d.ts`, the template's `tsconfig.json` enables
`tsc -p <team>` (the image's `tsc`, on the PATH; in the repository, `tools/scripting-typecheck/node_modules/.bin/tsc`).
Essential options: `moduleDetection: "force"`, `target`/`lib` `ES2022`, `types: []`,
`moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`.

## Common errors

| Message / symptom | Cause |
|---|---|
| `did not assign globalThis.crew` | Procedural file (`crew.run()`) passed to `--validate` / Studio |
| The crew runs but the tasks are ignored | `await crew.run()` instead of `globalThis.crew = crew` |
| `Crew configuration references unknown tool(s): x` | Name absent from the catalogue (or custom tool passed to `.tools([...])` by name instead of `withAutonomousTools`) |
| `unknown … tool "x" — available: …` | `pickTools` with a typo |
| `Cannot find name 'process'` / `fs` | Node API: does not exist in Jint |
| `.llm(...)` has no effect | Dropped on `main`: the model is the profile's; a per-task temperature, `maxTokens` or `thinking` needs YAML `llmOverride` |
| A task's `.tools([...])` or `.withTaskTool(t)` never reaches its agent | Dropped on `main`, without a warning: put the tools on the agent |
| `TS1084: Invalid 'reference' directive syntax` | `/// <reference orkeon-script=…>` directive: remove it |

**Do not** imitate: `examples/09-experimental/llm-response-format/crew.ork.ts` (object literal in `.llm()`,
neither `globalThis.crew` nor `run()`).
