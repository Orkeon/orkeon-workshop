# Writing and running an Orkeon team in C#

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: in the Orkeon repository at that commit — `src/core/Orkeon.Domain/` (`Agent/AgentBuilder.cs`,
> `Task/CrewTaskBuilder.cs`, `Crew/CrewBuilder.cs`, `Task/ValueObjects/TaskDeliverable.cs`,
> `SharedKernel/ValueObjects/ProcessType.cs`, `Graph/StateGraph.cs`, `Graph/GraphRunner.cs`,
> `Common/StateMachine/CircuitBreakerPolicy.cs`, `Flows/`, `Constants/Agent/AgentDefaults.cs`),
> `src/core/Orkeon.Application/` (`Interfaces/ICrewFactory.cs`, `Interfaces/Services/ICrewOrchestrationService.cs`,
> `Interfaces/Checkpointing/`, `Services/Checkpointing/ResumeEngine.cs`, `Crew/ICrewExecutionHook.cs`, `Evaluation/`),
> `src/core/Orkeon.Infrastructure/` (`DependencyInjection/InfrastructureExtensions.cs`,
> `DependencyInjection/CheckpointingExtensions.cs`, `DependencyInjection/LlmProviderRegistrationExtensions.cs`,
> `LLMs/LlmProviderFactory.cs`, `LLMs/MeteredLlmProvider.cs`, `Checkpointing/SqliteStateStore.cs`,
> `Evaluation/EvaluationServiceCollectionExtensions.cs`, `Orchestration/SequentialCrewOrchestrator.cs`,
> `Configuration/CrewFactory.cs`), `src/hosting/Orkeon.Hosting/` (`RunnerHost.cs`, `RunnerExecution.cs`,
> `ServiceProviderToolRegistry.cs`), `src/rag/Orkeon.Rag/DependencyInjection/`, `src/tools/Orkeon.Tools.Rag/`,
> `src/tools/Orkeon.Tools.Email/DependencyInjection/`, `docs/getting-started/bootstrap.md`,
> `docs/orchestration/flows.md`, `docs/reference/opt-in-subsystems.md`, `docs/reference/experimental-apis.md`,
> `docs/reference/limitations.md`, `CHANGELOG.md` (`[Unreleased]`). Harness: the image's C# README (`/usr/local/share/orkeon-harness/csharp/README.md`),
> the template `OrkeonCrewHost/` next to it, `.claude/harness/VERIFICATIONS.md` (V-04, V-05, V-08), plan § 8.3.

A C# team is a console program that wires Orkeon itself, loads or builds the crew, runs it and reports
like `orkeon run`. This document says when to choose it, how the template does it, the order the wiring
must follow, and what each C#-only feature really does on main. A C# **tool** is `orkeon/csharp-tools.md`;
the build conventions are `csharp/orkeon-guidelines.md`.

## 1. When a team is written in C#

| The team needs | Write it as |
|---|---|
| built-in tools, TypeScript tools | YAML or `.ork.ts` — `orkeon run`, Studio (`orkeon-reference.md` § 1) |
| + a C# tool | YAML or `.ork.ts` + a plugin run by `orkeon-harness-run` (`orkeon/csharp-tools.md` § 9) |
| `StateGraph`, flows, checkpoint stores and `IResumeEngine`, active RAG (`knowledge:`), the built-in evaluation, a crew built in code | a **C# host** (this document) |

The price: no Studio, no `orkeon run`, and a program to maintain (it is built, analysed and tested like
a tool). Record the choice in a `DEC-000n`.

## 2. The template: `OrkeonCrewHost`

Copy `/usr/local/share/orkeon-harness/csharp/OrkeonCrewHost/` — its `README.md` describes the layout, the
options, `mounts.json` and the settings; not repeated here. What it does for a team:

- reads the team's `mounts.json` (the same file and rules as `orkeon-bench` and `orkeon-harness-run`),
  binds each point to the team's own folder, or to `mounts.<name>/<slug>/<point>/` with `TEAM_ENV=<name>`
  or `--env <name>`; creates writable roots, refuses a missing read-only one and the reserved roots;
- mounts `crew/` read-only as `/crew` and the directory of the event file as an internal root `/_run`
  that no agent can address;
- registers the LLM provider, Orkeon, the VFS, the tools, a DI-backed tool registry, `StrictTools`;
- loads the YAML crew under `crew/`, or builds it in code when `crew/` is absent;
- writes `run/events.jsonl` (§ 6) and, when `/output` is writable, `AUTO_SUMMARY.md` as `orkeon run` does.

```bash
./run.sh --validate        # loads the crew, no model call: VALIDATION OK: /crew (agents=N, tasks=M, tools resolved=K)
./run.sh                   # the team's own folders
TEAM_ENV=test ./run.sh     # the mount set mounts.test/<slug>/
./run.sh --input "context" --var topic=notes --events run/events.jsonl
```

Exit codes as `orkeon run`: `0` success, `1` configuration error, `2` crew failure, `130` cancelled. The
crew's answer goes to stdout, the logs to stderr.

**Two cautions.** The template keeps `SampleTeam.sln`, `src/`, `tests/`, `appsettings.json` and the build
files at the root of the team folder, which neither D29 ("a team folder holds only what Studio and the
crew need") nor D33 (no `appsettings*.json` in a team folder) nor plan § 8.3 (the project under `crew/`)
foresees: the placement is settled with the
`orkeon-crew-csharp` skill (lot 8); until then the team's acceptance tests still go to `tests/<slug>/`.
And Studio lists every folder of `teams/` (V-03) and recognises a `crew/` holding YAML
(`studio-layout.md`): it would launch the stock `orkeon run crew`, without the host's tools and wiring.
A C# team is never launched from Studio.

## 3. The composition root — order matters

The template's `Composition/TeamHost.cs`, reduced to its order:

```csharp
var services = new ServiceCollection();
services.AddSingleton<IConfiguration>(configuration);   // appsettings.json, appsettings.local.json, settings/<team>/appsettings.json (D33), ORKEON_*, then the mounts
services.AddLogging(/* everything to stderr */);
services.AddTeamLlmProvider(configuration);              // 1. the LLM provider, BEFORE the infrastructure
services.AddOrkeonApplication();                         // 2. orchestration, services
services.AddOrkeonInfrastructure(configuration);         //    LLM plumbing, memory, YAML, evaluation, checkpointing...
services.AddOrkeonFileSystem(configuration);             // 3. the VFS, from Orkeon:FileSystem:Mounts
services.AddTeamTools();                                 // 4. tool suites + one AddSingleton<IBaseTool, T>() per tool
services.AddSingleton<IToolRegistry, DependencyInjectionToolRegistry>();          // 5. names -> tools
services.Configure<CrewFactoryOptions>(factory => factory.StrictTools = true);    //    unknown tool = load error
// 6. observation (AUTO_SUMMARY.md, events) last: it wraps the tools registered so far
```

- **LLM provider.** No public method reads the `Llm` section: `RunnerHost` does it in a private method
  (`RegisterLlmProvider`), which the template reproduces (`LlmProviderRegistration`). It reads `Model`,
  `BaseUrl`, `ApiKey`, `Temperature` (0.7), `MaxTokens`, `TimeoutSeconds` (30), `MaxRetries`,
  `Thinking:{Enabled, Effort}`, builds `IBasicLlmProvider` through `ILlmProviderFactory` and an
  `IChatClient` adapter. No `Llm` section: an echo provider that replays the prompt (no model, no network —
  what the startup tests use). Same settings as the CLI, so the stub of V-04, Ollama and the
  `ORKEON_Llm__*` profiles work unchanged (`orkeon/llm-profiles.md`). No key in `appsettings.json`;
  `appsettings.local.json` is untracked. Main adds a public
  `services.AddOrkeonLlmProvider(sp => <ILlmProvider>, baseConfig)` for a provider built by hand (an echo, a
  test double, a vendor class): one instance behind `ILlmProvider`, `IBasicLlmProvider` and `IChatClient`.
  `AddOrkeonInfrastructure` registers its LLM services with `TryAdd`: the template registers before it
  (main's `bootstrap.md` too; `porting-methodology.md` registers after, which works as well — last wins).
- **Token metering (main).** Usage reaches `ILlmUsageSink` only from `MeteredLlmProvider`, which wraps every
  provider `ILlmProviderFactory` builds and every one registered through `AddOrkeonLlmProvider` — when a
  sink is registered. The template's event observer is that sink (§ 6); the agent loop reports nothing
  itself any more.
- **Overriding a default.** Most `AddOrkeon*` registrations use `TryAdd*`: register your implementation
  **before** the call. A few are unconditional (`ICrewOrchestrationService`, `ILlmProviderFactory`,
  `IAgentExecutionService`…): register after (`docs/getting-started/bootstrap.md`).
- **Tool registry.** `AddOrkeonInfrastructure` registers an **empty** in-memory `IToolRegistry`: a YAML crew
  can name your tools only through a DI-backed registry — `ServiceProviderToolRegistry` (`Orkeon.Hosting`)
  or the template's copy, `DependencyInjectionToolRegistry` — or after `RegisterToolAsync` of every
  registered `IBaseTool` (main's `bootstrap.md`). A tool must be an `ITool` (`orkeon/csharp-tools.md` § 2).
- **Tool suites.** `AddOrkeonFileSystemTools()` no longer registers `email_parser` on main:
  `AddOrkeonEmailTools(configuration)` (package `Orkeon.Tools.Email`) registers it with the 12 mailbox tools,
  which refuse every call until an account is declared under `Orkeon:Tools:Email` (`email_accounts` then
  lists none). Other suites the CLI adds and a host adds the same way: `AddOrkeonAbstractionTools()` (`list_mounts`), `AddOrkeonSessionTools()`,
  `AddOrkeonInMemoryEventHub()` + `AddOrkeonEventHubTools()`, `AddOrkeonDataTools()`, `AddOrkeonWebTools()`.
- **`StrictTools`.** The library default is lenient (a missing tool is dropped with a warning); the runner
  and the template set it `true` (`Orkeon:CrewFactory:StrictTools`).
- **VFS.** Mandatory: the YAML loader itself reads through `IFileSystemService`. The template writes each
  binding of `mounts.json` as an `Orkeon:FileSystem:Mounts` entry and allows its folder
  (`PathSecurity:AdditionalAllowedDirectories`, what `--allow-external-mounts` does for the runner).

**On top of `Orkeon.Hosting` instead.** `RunnerHost.Build(settingsPath, RunnerMountPlan, …,
configureServices)` gives exactly the `orkeon run` container (every suite, telemetry, `StrictTools`, MCP
when configured);
`RunnerExecution.RunOneShotAsync(options, loggerCategory, configureServices)` runs a crew file the way the
CLI does (`--validate`, `--list-tools`, exit codes) — that is `orkeon-harness-run`. The first suits a host
that wants the stock container plus its own code; the second has no hook to build the crew in code.
`Orkeon.Hosting` ships inside the CLI, not on NuGet (main's `bootstrap.md`): the image packs it into its
local feed, and a consumer needs a direct reference to `SmartComponents.LocalEmbeddings` (the image's C#
README, discrepancy 5). The template carries its own root.

## 4. Loading a YAML crew from C#

```csharp
var scope = provider.CreateAsyncScope();               // the built container; factory, repositories, orchestrator are scoped
await using (scope.ConfigureAwait(false))
{
    var crew = await scope.ServiceProvider.GetRequiredService<ICrewFactory>()
        .CreateFromDirectoryAsync("/crew", ct).ConfigureAwait(false);          // a VIRTUAL path
    var output = await scope.ServiceProvider.GetRequiredService<ICrewOrchestrationService>()
        .KickoffAsync(crew.Id, CrewInput.WithStringVariables(initialContext, variables), ct).ConfigureAwait(false);
    if (!output.Succeeded) { /* output.Error; exit code 2 */ }
}
```

- `ICrewFactory` (`Orkeon.Application.Interfaces`): `CreateFromDirectoryAsync`, `CreateFromFileAsync`,
  `CreateFromConfigAsync`. Paths go through the VFS — a physical path fails. The factory validates the
  definition, resolves the tools (`StrictTools`), creates the agents and tasks, stores everything in the
  repositories the orchestrator reads, and ingests the `rag:` collections when a bootstrapper is registered.
- The YAML is the one `orkeon run` takes (`orkeon/yaml-schema.md`); its `tools:` may also name the host's
  C# tools; `rag:` and `knowledge:` act only with § 7.4.
- A `--validate` equivalent loads the crew without kickoff; the template prints the same `VALIDATION OK`
  line as `orkeon run` (and its startup tests prove no model call happens).
- `CrewInput(InitialContext, Variables)` fills `{KEY}` placeholders of task descriptions.
  `CrewOutput(FinalOutput, TaskOutputs, Duration, TokensUsed)` plus `Succeeded` and `Error`: a crew failure
  comes back as `Succeeded = false`, not as an exception. Also on the service: `KickoffForEachAsync`,
  `KickoffStreamingAsync`, `KickoffAsyncNoWait` + `GetExecutionStatusAsync` (`bootstrap.md`).

## 5. Building a crew in code

```csharp
var agent = new AgentBuilder()
    .Role("Extractor").Goal("Extract the key/value pairs of the notes file")
    .Backstory("You read structured notes with sample_extractor and report exactly what it returns.")
    .WithTool(extractor)                          // an ITool, from IToolRegistry.GetToolByNameAsync
    .AllowDelegation(false).MaxIterations(3)
    .Build();
var task = new CrewTaskBuilder()
    .Description("Call sample_extractor with path \"/workspace/notes.txt\" and list every key = value.")
    .ExpectedOutput("One line per extracted entry, formatted as key = value")
    .AssignTo(agent)
    .Build();
task.SetDeliverable(new TaskDeliverable { Path = "/output/notes.md", Source = DeliverableSource.FinalMessage, Format = "markdown" });
var crew = new CrewBuilder().Goal("Summarise the structured notes").Sequential().WithAgent(agent).WithTask(task).Build();

await agentRepository.AddAsync(agent, ct).ConfigureAwait(false);   // the orchestrator loads by id:
await taskRepository.AddAsync(task, ct).ConfigureAwait(false);     // persist all three (scoped repositories)
await crewRepository.AddAsync(crew, ct).ConfigureAwait(false);
```

| Builder (namespace) | Required | Main methods | Defaults that differ from YAML |
|---|---|---|---|
| `AgentBuilder` (`Orkeon.Domain.Agent`) | `Role`, `Goal` | `Backstory`, `WithTool(s)` (`ITool` only), `AllowDelegation`, `MaxIterations`, `MaxRpm`, `WithLlmConfig`, `Thinking`, `MaxOutputTokens`, `WithKnowledge`, `WithGuardrails`, `WithToolWhitelist`/`Blacklist` | `AllowDelegation` **false** (YAML true); `MaxIterations` **15** (YAML `maxIter` 20) |
| `CrewTaskBuilder` (`Orkeon.Domain.Task`) | `Description`, `ExpectedOutput` | `AssignTo`, `DependsOn` (= YAML `dependencies`), `HumanInput`, `WithResponseFormat`, `WithLlmOverride`, `WithGuardrails`, `OutputJson` | — |
| `CrewBuilder` (`Orkeon.Domain.Crew`) | `Goal` | `Sequential`, `Hierarchical(manager)`, `Parallel`, `Consensual`, `Process(ProcessType.Graph \| Autonomous)`, `WithAgent(s)`, `WithTask(s)`, `EnableMemory`, `WithMemoryProvider`, `WithGraphConfig`, `WithCircuitBreaker`, `Planning`, `MaxRpm` | sequential; `Hierarchical` without a manager agent or LLM throws `BuilderValidationException` |

`WithStepCallback` (agent, crew), `WithTaskCallback` (crew) and `CrewTaskBuilder.WithCallback` are accepted
and never called: `IStepCallback` and `ITaskCallback` are not invoked at run time (`limitations.md`). The
crew's `WithCircuitBreaker` is read by the Graph mode only, when no `WithGraphConfig` is given.

**Deliverables.** The builders have no deliverable method: call `task.SetDeliverable(TaskDeliverable)`
before the kickoff — the very object the YAML `deliverable:` key produces (`CrewFactory`), written by the
framework (`DeliverableResolverFactory`, registered by `AddOrkeonApplication`): `Path` (virtual, under a
writable root), `Source` (`FinalMessage`, `StructuredOutput` with `SchemaPath` or `SchemaInline`,
`ToolCall`, `None`), `Format`. Established from the code, not yet exercised by a harness template.
`OutputFile(path)` is stored and **never written**, on main as at rc.4 (no consumer); `OutputJson(schema)` validates
the final answer against a JSON schema, with correction retries, and writes nothing. The host can also
write files itself from `CrewOutput.TaskOutputs` through `IFileSystemService`.

## 6. Observing a run

- The supported observation point is `ICrewExecutionHook` (`OnTaskStartedAsync`, `OnTaskCompletedAsync`,
  `OnCrewCompletedAsync`, `OnCrewFailedAsync`), plus `ILlmUsageSink` for tokens: domain events raised during
  a run are not dispatched (`limitations.md`). The template's observer chains on the hook already
  registered (`AutoSummaryWriter`), is the usage sink, and wraps every `IBaseTool` to time the calls —
  hence "register the event stream last".
- `run/events.jsonl` speaks protocol v2 with the envelope and payloads of `orkeon run --events jsonl`
  (`orkeon/cli.md` § 3, V-05): `run.started`, `task.started`, `tool.called`, `tool.returned`,
  `cost.updated`, `task.completed`, `error`, `run.finished`. Not emitted: `input.needed` (`human_input`
  is auto-approved — `AddOrkeonHumanInput()` registers the `AutoApprove` provider), `llm.delta`, the hub
  verbs. `taskId` is a ULID: map events to tasks by order and `agentRole`.
- The event file is written through the VFS on the internal root `/_run`; everything under an internal
  root is hidden from the agents, so its directory may contain no mounted root (`--events events.jsonl`
  at the top of the team folder is refused).

## 7. The C#-only features

### 7.1 `StateGraph<TState>` — a graph you draw

```csharp
var graph = new StateGraph<Draft>(CircuitBreakerPolicy.Default)        // Orkeon.Domain.Graph
    .AddNode("write", WriteAsync)                                       // Func<Draft, CancellationToken, Task<Draft>>
    .AddNode("review", ReviewAsync)
    .AddEdge(StateGraph<Draft>.StartNode, "write")
    .AddEdge("write", "review")
    .AddConditionalEdge("review",
        d => d.Approved || d.Rounds >= 3 ? StateGraph<Draft>.EndNode : "write",
        ["write", StateGraph<Draft>.EndNode]);
var result = await graph.Compile().RunAsync(new Draft(), ct).ConfigureAwait(false);
// result.FinalState, result.Trace, result.TotalTransitions, result.Duration
```

A node is any async function of the state: run a crew (`KickoffAsync`), call a tool, plain code.
`Compile()` checks the structure (an edge from START, an outgoing edge on every node, existing targets).
The `CircuitBreakerPolicy` bounds the run: `GraphRunner` enforces `MaxTransitions`, `MaxStateVisits` and
`MaxTotalDuration` — `Default` 100 / 10 / 30 min, `Strict` 50 / 5 / 10 min, `Permissive` 1000 / 50 / 2 h — and a
breach throws `GraphCircuitBrokenException`. The duration is checked between nodes, so a node that hangs is
never interrupted: bound a slow node with your own `CancellationToken`. The policy's `StateTimeout`
(5 min / 2 min / 30 min) is carried but never read. This is **not** `process: graph`, the fixed
`execute_task → route` loop (`orkeon-reference.md` § 2). Orkeon's procedural
TypeScript shape also has a `stateGraph()` global; the harness uses the declarative shape only
(`orkeon/typescript-dsl.md`).

### 7.2 Flows

A flow chains typed **steps** — `crew` (a whole crew), `llm`, `tool`, `conditional`, `human_input`,
`delay` — over a shared key/value `FlowState`, in `Sequential`, `Parallel`, `Conditional` or `Loop` mode.
`IFlowEngine` (`Orkeon.Application.Interfaces.Ports`) is registered by `AddOrkeonInfrastructure`
(`AddOrkeonFlows`): `ExecuteFlowAsync(IFlow)`, `ValidateFlow(IFlowDefinition)`, history and metrics; a
definition comes from `FlowDefinitionBuilder` in C# or from YAML (`YamlFlowDefinitionLoader`), and
`DefinitionBasedFlow` runs it. Main's `docs/orchestration/flows.md` is the guide, and it says plainly that
**no CLI, host or script runs a flow**: only your own C# code does. No harness template exercises it; read
that page and the sources, then decide in a `DEC`.

### 7.3 Checkpoint stores and `IResumeEngine`

- `AddOrkeonInfrastructure` already registers the in-memory store (`AddOrkeonCheckpointing()`). Durable:
  `services.AddOrkeonSqliteCheckpointing("Data Source=/state/checkpoints.db")` (namespace
  `Orkeon.Infrastructure.Checkpointing`) — the data source is a **virtual** path, resolved under a writable
  root — or `AddOrkeonPostgresCheckpointing(configuration)` (`Orkeon:Checkpointing:ConnectionString`…).
  Call it **before** `AddOrkeonInfrastructure`: all of them use `TryAdd`, so a later call leaves the
  in-memory store in place.
- What is written: `SequentialCrewOrchestrator` — the one `ICrewOrchestrationService`, whatever the process
  mode — opens a session per kickoff, keyed by the crew id, and checkpoints the task outputs only **after
  the whole crew returns**; a crew that throws gets a failed `crew-execution` mark and no task checkpoint
  (V-08).
- What resume gives: `CanResumeAsync(crewId)` and `ResumeAsync(crewId, ResumeOptions)` compute
  `CompletedTaskIds`, `CompletedOutputs`, `ResumeFromIndex`, `SkipCount`. Nothing re-runs the crew for you,
  and crew and task ids are new ULIDs at every load (`CrewId.Create()`): a new process must keep the
  previous crew id and map tasks by order — not verified end to end.
- Hence a complement, never the resume mechanism: the application-level state registry stays mandatory
  (`reliability/resume-patterns.md`, `orkeon/resume-and-memory.md`, `INV-RESUME`). The same holds on main
  (that code did not change). `AddCrewExecutionStatePersistence(...)`, often read as resume, makes the
  status records of `KickoffAsyncNoWait` executions durable: bookkeeping that re-runs nothing.

### 7.4 Active RAG

- `services.AddOrkeonRag(configuration)` (`Orkeon.Rag.DependencyInjection`, package `Orkeon.Rag`) registers
  the pipelines, the ingestion, the **knowledge-context augmenter** that makes an agent's `knowledge:`
  (YAML) or `WithKnowledge(collection)` inject retrieved chunks with citations, and the bootstrapper that
  ingests the crew's `rag:` collections at load. Without it both keys are inert (`orkeon-reference.md` § 8).
- It needs an embedding provider: `AddOrkeonLocalEmbeddings()` (`Orkeon.Tools.Embeddings.Local.DependencyInjection`, on-device)
  or a remote one from `Orkeon:Embeddings`, else it fails at first use. The document store sits on the
  ambient memory provider unless `Orkeon:Rag:Provider` names one. Profile `Orkeon:Rag:Profile`: `fast`
  (default) and `corrective` run as is; `balanced`, `quality`, `adaptive` need `AddOrkeonOnnxReranker()`
  (`Orkeon.Rag.Onnx.DependencyInjection`, package `Orkeon.Rag.Onnx`), which the image's local feed does not
  carry.
- `AddOrkeonRagTools()` registers `rag_search`, `rag_ingest`, `rag_eval` — `IBaseTool`-only, so a crew agent
  cannot use them (`StrictTools` refuses them, `WithTool` does not accept them). Active RAG for agents
  goes through `knowledge:`.
- `Orkeon.Rag` and `Orkeon.Tools.Rag` are in the local feed; add their `PackageVersion` lines to the
  host's `Directory.Packages.props`.

### 7.5 The evaluation subsystem

- `AddOrkeonInfrastructure` already calls `AddOrkeonEvaluation()` (without configuration): the
  deterministic `IEvaluator`s `FormatCompliance`, `SchemaCompliance`, `TextQuality`, `Similarity`,
  `ToolAccuracy` are there, and the LLM judges `Coherence`, `Fluency`, `Groundedness` are disabled
  placeholders (`EvaluationOptions.EnableLlmJudge` is `false`). `IEvaluationSuite.RunAsync(inputs)` takes
  `EvaluationInput(Output, ExpectedOutput, TaskDescription, Context, ExpectedFormat, Metadata)` and returns
  an `EvaluationReport` (per-case `EvaluationScore`s, summary); `EvaluationScore.IsPassing(0.5)` by default.
- Opt-in: `AddOrkeonBenchmarking()` adds `IBenchmarkRunner` (several runs per case, mean and standard
  deviation); `CompareReports` and `JsonFileDataset` are in `Orkeon.Infrastructure.Evaluation`.
- The `Evaluation` section (`EnableLlmJudge`, `DefaultRunsPerCase` 3, `RegressionThreshold` 0.05) does not
  enable the judges through `AddOrkeonEvaluation(configuration)` (code reading, not run): the call
  `AddOrkeonInfrastructure` has already made registers a fixed `IOptions<EvaluationOptions>` holding the
  defaults, which wins over the bound section, and the five deterministic evaluators are registered a second
  time. To enable the judges, register `Options.Create(new EvaluationOptions { EnableLlmJudge = true })`
  before `AddOrkeonInfrastructure`, and assert the resolved suite in a test.
- In the harness the judges are Claude subagents (D7) and the checks of `orkeon-bench`; reusing these
  evaluators through a C# bridge is a later option (plan § 8.4, D10).

### 7.6 Experimental surfaces

The .NET types of A2A (`ORKEXP001`), Autonomous orchestration (`AgentExecutionBudget`, `IAgentChannel`,
`SpawnAgentTool` — `ORKEXP002`), corrective RAG (`ORKEXP003`) and MCP (`ORKEXP004`) carry `[Experimental]`:
referencing one is a compile error you suppress explicitly (`<NoWarn>$(NoWarn);ORKEXP002</NoWarn>` or a
`#pragma` at the call site) — record that opt-in in a `DEC`. `ProcessType.Autonomous` itself is not
experimental, nor are the stable entry points that wire those surfaces without your code naming a type
(`AddOrkeonInfrastructure(configuration)` for MCP, `AddOrkeonRag(configuration)` for the corrective graph —
`docs/reference/experimental-apis.md`).

## 8. How the bench will run a C# team

- **Today**: `orkeon-bench run` does not exist yet (lot 4). By hand: L0 = `dotnet build -c Release`,
  `dotnet test` (the startup tests) and `./run.sh --validate`; L2 = `./run.sh` against the simulated LLM —
  `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1 ORKEON_Llm__Model=stub-model ORKEON_Llm__ApiKey=stub
  ./run.sh --events run/events.jsonl` (the host reads the `ORKEON_` variables as the CLI does; V-04) —
  with `TEAM_ENV=<set>` to bind a dataset prepared as a mount set (`testing/test-levels.md` § 4).
- **Planned (lot 8, plan § 7.5 and § 8.3)**: a `DotnetHostRunner` adapter of `orkeon-bench` starts the host
  (`run.sh` → `dotnet run`) with the bindings of `mounts.json` or of the dataset, injects the profile as
  `ORKEON_Llm__*`, reads `events.jsonl` exactly as it reads `orkeon run --events jsonl`, applies the same
  budget gate and writes the same report — a C# team measured like a YAML team; with it come the skill
  `orkeon-crew-csharp` and the launchers. L4 stays paid, behind the gate (`HARNESS.md`, rule 1).

## 9. Pitfalls

| Symptom | Cause | Do |
|---|---|---|
| `unknown tool(s): x` at load, yet `x` is listed as available | `x` is `IBaseTool`-only (`rag_search`…) | derive the tool from `ToolBase<,>` |
| a tool silently missing from an agent | `StrictTools` left at the lenient library default | set it `true` |
| a YAML crew cannot name the host's tools | the default, empty `IToolRegistry` | register a DI-backed registry |
| `unknown tool(s): email_parser` (or `email_*`) in a host | `AddOrkeonFileSystemTools` no longer registers it on main | `AddOrkeonEmailTools(configuration)` |
| `cost.updated` / `run.finished` count no tokens | provider registered by hand, outside the meter | `ILlmProviderFactory`, or `AddOrkeonLlmProvider` |
| every answer repeats the prompt | no `Llm` section: echo provider | `Llm` in settings or `ORKEON_Llm__*` |
| `Crew <id> not found` in `output.Error` | a built crew not stored in the repositories | `AddAsync` agents, tasks and crew in the same scope |
| no deliverable file | `OutputFile` used | `task.SetDeliverable(...)`, or write from the host |
| checkpoints lost although SQLite is configured | the SQLite store registered after `AddOrkeonInfrastructure` | register it before |
| `knowledge:` has no effect | `AddOrkeonRag` missing, or no embedding provider | § 7.4 |
| the event file is refused | its directory contains a mounted root | a folder of its own (`run/`) |
| compile error `ORKEXP00x` | an experimental type is referenced | explicit suppression + `DEC` |
