# Writing and running an Orkeon team in C#

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: in the Orkeon repository at that tag — `src/core/Orkeon.Domain/` (`Agent/AgentBuilder.cs`,
> `Task/CrewTaskBuilder.cs`, `Crew/CrewBuilder.cs`, `Task/ValueObjects/TaskDeliverable.cs`,
> `SharedKernel/ValueObjects/ProcessType.cs`, `Graph/StateGraph.cs`, `Graph/GraphRunner.cs`,
> `Common/StateMachine/CircuitBreakerPolicy.cs`, `Constants/Agent/AgentDefaults.cs`),
> `src/core/Orkeon.Application/` (`Interfaces/ICrewFactory.cs`, `Interfaces/Services/ICrewOrchestrationService.cs`,
> `Interfaces/Checkpointing/`, `Services/Checkpointing/ResumeEngine.cs`, `Crew/ICrewExecutionHook.cs`,
> `Crew/Execution/RequestRates.cs`, `Configuration/RateLimitingOptions.cs`, `Evaluation/`),
> `src/core/Orkeon.Infrastructure/` (`DependencyInjection/InfrastructureExtensions.cs`,
> `DependencyInjection/CheckpointingExtensions.cs`, `DependencyInjection/LlmProviderRegistrationExtensions.cs`,
> `LLMs/LlmProviderFactory.cs`, `LLMs/MeteredLlmProvider.cs`, `LLMs/RateLimitedLlmProvider.cs`, `LLMs/Profiles/LlmSettings.cs`, `Tools/ToolRegistry.cs`,
> `Checkpointing/SqliteStateStore.cs`, `Evaluation/EvaluationServiceCollectionExtensions.cs`,
> `Orchestration/SequentialCrewOrchestrator.cs`, `Crew/ManagerLlmResolver.cs`, `Configuration/CrewFactory.cs`),
> `src/hosting/Orkeon.Hosting/` (`RunnerHost.cs`, `RunnerExecution.cs`, `RunnerSettings.cs`),
> `src/rag/Orkeon.Rag/DependencyInjection/`, `src/tools/Orkeon.Tools.Rag/`,
> `src/tools/Orkeon.Tools.Email/DependencyInjection/`, `docs/getting-started/bootstrap.md`,
> `docs/architecture/domain-events.md`, `docs/reference/opt-in-subsystems.md`, `docs/reference/experimental-apis.md`,
> `docs/reference/limitations.md`, `docs/reference/stability.md`, `docs/tools/new-tool-pattern.md`, `CHANGELOG.md` (`[1.0.0-rc.7]` to `[1.4.0]`). Harness: the image's C# README (`/usr/local/share/orkeon-harness/csharp/README.md`),
> the template `OrkeonCrewHost/` next to it, `.claude/harness/VERIFICATIONS.md` (V-04, V-05, V-08), plan § 8.3.
> The template was written against 24ab0d0; where 1.2.0 changes what it relies on, this document says so. What 1.2.0
> changed (§ 5 "Since rc.7", § 7.3, the builder table) was read in the sources and the CHANGELOG on 2026-11-17, not
> compiled against a template; what 1.4.0 (0389fd2, 2026-11-23) changed is in § 5 "Since 1.4.0", its API compiled in a probe (V-69); 1.3.0 breaks nothing (its CHANGELOG). The facts older than rc.7 stand as read at their dates.

A C# team is a console program that wires Orkeon itself, loads or builds the crew, runs it and reports
like `orkeon run`. This document says when to choose it, how the template does it, the order the wiring
must follow, and what each C#-only feature really does on main. A C# **tool** is `orkeon/csharp-tools.md`;
the build conventions are `csharp/orkeon-guidelines.md`.

## 1. When a team is written in C#

| The team needs | Write it as |
|---|---|
| built-in tools, TypeScript tools | YAML or `.ork.ts` — `orkeon run`, Studio (`orkeon-reference.md` § 1) |
| + a C# tool | YAML or `.ork.ts` + a plugin run by `orkeon-harness-run` (`orkeon/csharp-tools.md` § 9) |
| `StateGraph`, the built-in evaluation as a library, a crew built in code | a **C# host** (this document) — active RAG (`knowledge:`), checkpoints with `--resume` (rc.7, `resume-and-memory.md` § 4), `orkeon eval` and a YAML `graph:` with nodes and edges no longer need one: `orkeon run` has them |

The price: no Studio, no `orkeon run`, and a program to maintain (it is built, analysed and tested like
a tool). Record the choice in a `DEC-000n`.

Since e44df3f (#229) a .NET application can also run a crew definition **in process** without being a host of
its own: `services.AddOrkeonScripting(options => …)` (`Orkeon.Hosting`, `CrewScriptRunner.cs`; the NuGet package
`Orkeon.Scripting`, an opt-in outside the umbrella) registers `ICrewScriptRunner`, whose `RunAsync(path, input, ct)`
runs a `.ork.ts`, a `crew.yaml` or a crew directory on `orkeon run`'s bootstrap and returns its `CrewOutput`; a run
that cannot start throws `CrewScriptRunException`. `CrewScriptRunnerOptions`: `SettingsPath`, `Mounts`, `MountIds`,
`AllowExternalMounts`, `LlmProfile`, `ConfigureServices`, `ConfigureLogging`, `Diagnostics`; `TryAdd`, the first
call wins. The public API, first frozen at 1.0.0-rc.6 (#231: `PublicAPI.Unshipped.txt` moved to `PublicAPI.Shipped.txt`), was
cut once more before 1.0.0 (renames and removals, § 5); from 1.0.0 every member of the `PublicAPI.Shipped.txt` files is the
1.x commitment — a removal or a signature change waits for 2.0, the `[Experimental]` APIs (ORKEXP001–007) aside
(`docs/reference/stability.md`). 1.1.0 and 1.2.0 still carry a few changes marked **[breaking]** on purpose.

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
./run.sh --validate        # loads the crew, no model call: VALIDATION OK: /crew (agents=N, tasks=M, tools resolved=K, decision=<mode>)
./run.sh                   # the team's own folders
TEAM_ENV=test ./run.sh     # the mount set mounts.test/<slug>/
./run.sh --input "context" --var topic=notes --events run/events.jsonl
```

Exit codes as `orkeon run` had them when the template was written: `0` success, `1` configuration error, `2` crew failure, `130` cancelled
(`orkeon run` adds `75`, waiting for input, since rc.7 — the template auto-approves and never suspends). The
crew's answer goes to stdout, the logs to stderr.

**Two cautions.** The template keeps `SampleTeam.sln`, `src/`, `tests/`, `appsettings.json` and the build
files at its root, to build on its own. In a workshop, the skill `orkeon-crew-csharp` runs
`OrkeonCrewHost/new-team.sh`, which puts the solution under `teams/<slug>/host/` (not under `crew/`, which
agents see as `/crew`: `bin/` and `obj/` would land there), writes `run.sh` / `run.cmd` at the team root
(`dotnet run` from `host/` with `--team-dir` the team folder) and no `appsettings*.json` (D33: the
settings are `settings/<slug>/appsettings.json`); the team's acceptance tests stay in `tests/<slug>/`
(D29). And Studio lists every folder of `teams/` (V-03) and recognises a `crew/` holding YAML
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

- **LLM provider.** `RunnerHost.RegisterLlmProvider` (private) now rests on public pieces:
  `services.AddOrkeonLlmProfiles(configuration)` reads and validates `Llm:Profiles:<name>`;
  `LlmSettings.HasDefault(configuration)` says whether the `Llm` section holds a value besides `Profiles`
  (else the echo provider); `LlmSettings.ReadDefault(configuration)` gives the `LlmConfig` that
  `ILlmProviderFactory.Create` builds into `IBasicLlmProvider`, wrapped as an `IChatClient`
  (`Orkeon.Infrastructure.LLMs.Profiles`). The template reproduces the 24ab0d0 reader
  (`LlmProviderRegistration`: `Model`, `BaseUrl`, `ApiKey`, `Temperature`, `MaxTokens`, `TimeoutSeconds`,
  `MaxRetries`, `Thinking:{Enabled, Effort}`; since ce9ec1f `StreamIdleSeconds` too, LLM-12; since 87eb3bb `CallMode` too, STUDIO-71: `LlmConfig.CallMode`, `Auto` | `Buffer` | `Stream`, read by `LlmSettings.ReadCallMode`, another value refuses the start — and `LlmProviderFactory` wraps the provider in `CallModeLlmProvider` under the meter and the limiter, so a host that inspects the vendor type goes through `MeteredLlmProvider.Unwrap`, as `orkeon doctor` does; since e44df3f `MaxRateLimitWait`, `LlmConfig.MaxRateLimitWait`, 5 min by default — the template reads it through `LlmSettings.ReadDefault`); at 151a762 an unset temperature is not sent (the engine's
  0.7 default is gone), `TimeoutSeconds` stays 30 s when unset, `ApiKeyEnvVar` names the variable holding
  the key, `LlmSettings.ReadDefault` reads the default section as strictly as a profile (a number or a
  switch it cannot read throws, naming its key), and agents may name profiles that only
  `AddOrkeonLlmProfiles` registers. No `Llm` value: an echo
  provider that replays the prompt (no model, no network — what the startup tests use). Same settings as
  the CLI, so the stub of V-04, Ollama and the `ORKEON_Llm__*` profiles work unchanged
  (`orkeon/llm-profiles.md`). No key in `appsettings.json`; `appsettings.local.json` is untracked.
  `services.AddOrkeonLlmProvider(sp => <ILlmProvider>, baseConfig)` registers a provider built by hand (an
  echo, a test double, a vendor class): one instance behind `ILlmProvider`, `IBasicLlmProvider` and
  `IChatClient`. `AddOrkeonInfrastructure` registers no model of its own any more: a container without one
  fails at its first LLM resolution, wherever the provider is registered.
- **Token metering (main).** Usage reaches `ILlmUsageSink` only from `MeteredLlmProvider`, which wraps every
  provider `ILlmProviderFactory` builds, every one registered through `AddOrkeonLlmProvider` or
  `AddOrkeonLlmProfile`, and the providers a crew gets from `WithManagerLlm` / `WithPlanningLlm` — when a
  sink is registered. The template's event observer is that sink (§ 6); the agent loop reports nothing
  itself any more.
- **Rate limiting.** The same entrances put the host's limiter around the meter (`RateLimitedLlmProvider`,
  when an `ILlmRateLimiter` is registered — `AddOrkeonInfrastructure` registers one): every model call of
  the host takes one lease against `RateLimiting:GlobalRequestsPerMinute`, `ProviderRequestsPerMinute` and
  `MaxConcurrentRequests` — an agent's turn, the manager, the planner, RAG, the judges alike; a refused
  lease is retried five times, then the call fails. `RateLimiting:AgentRequestsPerMinute` bounds each agent
  instance's own window with its `MaxRpm`, the stricter winning, and a request over it waits
  (`design/sizing-and-cost.md` § 1). A provider registered any other way runs past every cap.
- **Settings.** A host that starts (`IHost.StartAsync`) refuses at its start a value or a name its Orkeon
  registrations cannot honour — each section is registered with `ValidateOnStart`; the keys of its
  sections stay its own. The template builds its container by hand and never starts it: a section is
  judged when its options are first read. `RunnerHost.Build` judges everything at its start, unknown keys
  included, and since bd3420c reports on stderr, without refusing, a section the file writes that no
  shipped binary reads — `ToolRateLimiting`, `TokenBudget`, `Orkeon:Dlp`… (`Orkeon:Checkpointing` and `Evaluation` are read by `orkeon` and `orkeon-host` since rc.7) —, naming
  the registration a C# host reads it through (`cli.md` § 5). A host built by hand, as the template's, says
  nothing of the kind: what it registers is what it reads.
- **Overriding a default.** Most `AddOrkeon*` registrations use `TryAdd*`: register your implementation
  **before** the call. A few are unconditional (`ICrewOrchestrationService`, `ILlmProviderFactory`,
  `IAgentExecutionService`…): register after (`docs/getting-started/bootstrap.md`).
- **Tool registry.** At 151a762 `AddOrkeonInfrastructure` registers `ToolRegistry`
  (`Orkeon.Infrastructure.Tools`, `TryAdd`), seeded from every `IBaseTool` in the container: a YAML crew names
  your tools with nothing more. Two DI tools with one name (case-insensitive) fail its construction, naming
  both types; `RegisterToolAsync` refuses a name another instance holds. `ServiceProviderToolRegistry` is
  gone from `Orkeon.Hosting`; the template's `DependencyInjectionToolRegistry`, registered after, replaces
  the default — redundant now, and it should keep the same first-wins rule. Any `IBaseTool` is attachable
  (`ITool` is deleted, `orkeon/csharp-tools.md` § 2).
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
configureServices, …, llmProfile)` gives exactly the `orkeon run` container (every suite, RAG, telemetry,
`StrictTools`, the LLM profiles, MCP when configured), its settings composed by `RunnerSettings.ComposeSources`
(unprefixed variables, the one settings file, `ORKEON_*`);
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
  C# tools; `rag:` and `knowledge:` act only with § 7.4; an agent's `llm: { profile }` needs the profile
  registered (`AddOrkeonLlmProfiles`).
- A `--validate` equivalent loads the crew without kickoff; the template prints the same `VALIDATION OK`
  line as `orkeon run` (and its startup tests prove no model call happens).
- `CrewInput(InitialContext, Variables)` fills `{KEY}` placeholders of task descriptions.
  `CrewOutput(FinalOutput, TaskOutputs, Duration, TokensUsed)` plus `Succeeded` and `Error`: a crew failure
  comes back as `Succeeded = false`, not as an exception — in every process mode at 151a762. Also on the
  service: `KickoffForEachAsync` (one input after the other), `KickoffStreamingAsync` (the same run as
  `KickoffAsync`, yielding `RunEventKinds` events, `run.finished` last), `KickoffNoWaitAsync` (`KickoffAsyncNoWait` up to rc.7) +
  `GetExecutionStatusAsync` (`bootstrap.md`); since rc.7 `KickoffAsync(crewId, input, KickoffOptions, ct)` and its streaming twin
  carry `ExecutionId`, `CrewKey`, `Resume` and `ResumeInput`, and `CrewOutput.ExecutionId` is the run's id.

## 5. Building a crew in code

```csharp
var agent = new AgentBuilder()
    .Role("Extractor").Goal("Extract the key/value pairs of the notes file")
    .Backstory("You read structured notes with sample_extractor and report exactly what it returns.")
    .WithTool(extractor)                          // an IBaseTool, from IToolRegistry.GetToolByNameAsync
    .AllowDelegation(false).MaxIterations(3)
    .Build();
var task = new CrewTaskBuilder()
    .Description("Call sample_extractor with path \"/workspace/notes.txt\" and list every key = value.")
    .ExpectedOutput("One line per extracted entry, formatted as key = value")
    .AssignTo(agent)
    .Build();
task.SetDeliverable(new TaskDeliverable { Path = "/output/notes.md", Source = DeliverableSource.FinalMessage, Format = "markdown" });
var crew = new CrewBuilder().Name("notes-summary").Goal("Summarise the structured notes").Sequential().WithAgent(agent).WithTask(task).Build();

await agentRepository.AddAsync(agent, ct).ConfigureAwait(false);   // the orchestrator loads by id:
await taskRepository.AddAsync(task, ct).ConfigureAwait(false);     // persist all three (scoped repositories)
await crewRepository.AddAsync(crew, ct).ConfigureAwait(false);
```

| Builder (namespace) | Required | Main methods | Defaults that differ from YAML |
|---|---|---|---|
| `AgentBuilder` (`Orkeon.Domain.Agent`) | `Role`, `Goal` | `Backstory`, `WithTool(s)` (`IBaseTool`), `AllowDelegation`, `MaxIterations`, `MaxRpm` (applied: the request of too many waits; not called, no limit of its own), `MaxExecutionTime(TimeSpan)` (applied since f59446b: a task past it fails, `ExecutionTimeExceeded`; zero or less, or above `AgentDefaults.MaxExecutionTimeCeiling`, about 49.7 days, throws), `PromptTemplate(string)` (since f59446b it wraps the first prompt of each task the agent runs, `{{ .Prompt }}` replaced by the prompt composed as before; a non-empty template without that mark throws), `WithLlmConfig` (a `Profile`, a model, sampling — applied), `WithLlm(ILlmProvider)`, `Thinking`, `MaxOutputTokens`, `WithKnowledge`, `WithGuardrails`, `WithToolWhitelist`/`Blacklist`, `WorkingRoot`, and since rc.7 / 1.1.0 `PermissionMode(PermissionMode)`, `FileSystem(params FileSystemScopeEntry[])`, `AnnounceMounts(bool)` (YAML `permissionMode`, `filesystem:`, `announce_mounts`, `yaml-schema.md`) | `AllowDelegation` **false** (YAML true); `MaxIterations` 20, as YAML `maxIter`; zero or less, like a `MaxRpm` of zero or less, throws at `Build()` |
| `CrewTaskBuilder` (`Orkeon.Domain.Task`) | `Description`, `ExpectedOutput` | `AssignTo`, `DependsOn` (= YAML `dependencies`), `WithTool(s)` (added to the agent's for this task), `Async`, `Retry(TaskRetryPolicy)` (rc.7, YAML `retry:`; refused on a decision task at `Build()`), `WithKey` (the task's name: unique in a crew — `CrewBuilder.Build()` refuses two tasks of one key —, and the key of its checkpoint), `HumanInput`, `WithResponseFormat`, `WithLlmOverride`, `WithGuardrails`, `OutputJson` | — |
| `CrewBuilder` (`Orkeon.Domain.Crew`) | `Goal` | `Name` (the memory scope), `Sequential`, `Hierarchical(manager?)`, `Parallel`, `Consensual`, `Process(ProcessType.Graph \| Autonomous)`, `WithAgent(s)`, `WithTask(s)`, `WithManager`, `WithManagerLlm`, `EnableMemory`, `WithMemoryProvider`, `WithGraphConfig` (`GraphConfig`: since rc.7 `Start`, `Nodes`, `Edges` beside `CircuitBreakerPreset`, `MaxTransitions`, `MaxStateVisits`, `MaxTotalDurationSeconds`; `MaxRetryCycles` is gone), `Planning`, `WithPlanningLlm`, `MaxRpm` (applied: the requests of all the crew's agents and its manager together) | sequential; `Build()` throws `BuilderValidationException` for `Hierarchical` without a manager agent or LLM, a manager (agent or LLM) the mode has none of, `Async` tasks outside Sequential/Parallel; `Crew.Create`, which it calls, refuses a memory provider without `EnableMemory` and a planning LLM without `Planning` |

Since e44df3f (read in the sources, not yet exercised by a template): `AgentBuilder.WorkingRoot(virtualPath)` (YAML
`workingRoot:`, checked against the mounts when the agent's task starts); `CrewTaskBuilder.WithDecision(TaskDecision)`
and `When(decisionTaskId, TaskCondition)` (YAML `decision:` / `when:`; the decision models need
`AddOrkeonDecisionProvider(configuration)` — since 0ea39d9, in place of `AddOrkeonTypeSafe` — and
`AddOrkeonDecisionProfiles(configuration)`, which `orkeon run` calls itself, `docs/architecture/decision-models.md`);
`CrewBuilder.Budget(CrewBudget)` (YAML `budget:`, #218: `Tokens`, `WallTime`,
`ToolCalls` 50, `DelegationDepth` 4, `SpawnedAgents` 10 when null; every limit set 1 or more; refused on any process
but autonomous). `TaskCompletedEvent.AgentId` is now nullable (`null` for a decision task) and
`ParallelProcessStrategy` takes a `CrewStrategyDependencies` (CHANGELOG, **[breaking]**).

Since 0ea39d9 (CHANGELOG, **[breaking]**, read in the sources): the decision model serves three providers and its
TypeSafe-only names go — `AddOrkeonTypeSafe` → `AddOrkeonDecisionProvider(configuration)` (it resolves the active
provider as the runners do, `orkeon/llm-profiles.md` § 3; an overload takes a `DecisionProviderDescriptor`),
`TypeSafeDecisionModel` → `SystemOneDecisionModel`, `TypeSafeOptions` → `SystemOneProviderOptions`, `TypeSafeInputGuard`
→ `DecisionInputGuard` (options `DecisionGuardOptions`, section `Orkeon:Decision:Guard` — renamed again at rc.7, below), in the namespace
`Orkeon.Infrastructure.Decision.SystemOne` (the guard in `Orkeon.Infrastructure.Decision`); the RAG reranker alias
`typesafe` is removed, name it `decision`. `IDecisionModel.ListModelsAsync` and `DecisionModelDto` are removed (drop the
override). `ISessionBufferService` gains `SetStates(IReadOnlyDictionary<string, string?>)`, all or nothing under the
buffer's lock — another implementation of the port must add it. `CommandDispatchService.postWork` gains a trailing
`bool exclusive = false`, with no overload for the previous signature (recompile a host that calls it).

Since c101cbd (CHANGELOG #280, #286, #287, **[breaking]**, read in the sources): `ISessionBufferService.Truncate(int
retainTurns)` counts turns and answers a `SessionTruncation` record (`RemovedCount`, `KeptFromIndex`) instead of an
`int`; `ICategoryMemoryStore.ListAsync` takes `(string? category, bool newestFirst, CancellationToken ct)` and the
port gains `ReplaceAsync(int id, string content, CancellationToken ct)` → `bool` — another implementation of either
port must follow. `IRaggableStore` gains `ListEdgesAsync(EdgeListQuery, CancellationToken)` (an `EdgeListPage`),
`NodeQuery` a `RootFqn`, and `SemanticSearchAsync` answers a `SemanticSearchResult` (`Hits`, `PreFilterCapped`)
instead of a hit list; `FlowTraceRequest.EdgeKinds` is an `ImmutableArray<string>` of workflow names. A host that
turns `Orkeon:Cli:Memory:Persist` on gets `memory_store` entries kept per project (`orkeon/resume-and-memory.md` § 2.2).

Since rc.7, 1.0.0, 1.1.0 and 1.2.0 (CHANGELOG, **[breaking]** where marked; read in the CHANGELOG and, for the names
quoted, in the sources at 1.2.0 — not compiled against a template):

- **Guard.** `DecisionInputGuard` → `LlmJudgeGuard`, `DecisionGuardOptions` merged into `GuardianLlmOptions` (under
  `GuardianOptions.Llm`), section `Orkeon:Decision:Guard` → `Orkeon:Guardian:Llm`, `FailClosed` → `FailMode` (`Closed`, the
  new default, or `Open`); `GuardPhase.Output` joins `Input`, `ToolExecution`, `Delegation` (`llm-profiles.md` § 3).
- **Orchestration.** `ICrewOrchestrationService.KickoffAsyncNoWait` → `KickoffNoWaitAsync(..., cancellationToken)`, and
  the service gains `KickoffAsync` / `KickoffStreamingAsync` with `KickoffOptions` (an implementer adds them). Every
  public async interface method ends with `CancellationToken cancellationToken = default` (`IToolRegistry`,
  `IMemorySystem`, `IEmbeddingService`, `IShortTermMemory`…): a caller compiles unchanged, an implementer adds the
  parameter. `GraphProcessStrategy` builds one node per task; `CrewGraphState.PendingTaskIds`, `FailedTaskIds`,
  `RetryCounts` and `GraphConfig.MaxRetryCycles` are removed.
- **Names.** `OpenAIProvider` → `OpenAILlmProvider`; `SseMcpTransport` → `StreamableHttpMcpTransport`;
  `AddMemoryResult` / `CreateMemoryStoreResult` / `SearchMemoryResult` → `…Response`; `TokenUsageReport` →
  `TokenBudgetReport`; `CrewOutput.TokensUsed` is the one `TokenUsage` of `Orkeon.Application.Common.DTOs`, a `sealed
  record` built with an initializer; `LlmConfig.ApiKeySecretName`, `Gpt4`, `Gpt35Turbo` and their `WithSecret` twins are
  removed; `LlmProviderDefaultModels.*` are `static readonly`, no longer `const`. The DTO, command and query records of
  `Orkeon.Application` and `Orkeon.Domain` nothing derives from are `sealed`. The tool-call parsers and strategies, the
  serialization converters, the `Orkeon.Infrastructure.Stubs.*` defaults and the Jint, Tree-sitter and Terminal.Gui
  plumbing are internal: resolve the defaults through their interfaces.
- **LLM.** `LlmProviderFactory`'s constructor takes an `IFileSystemService` as its third argument and a last optional
  `LlmReplayOptions`; a provider constructed by hand now sends an agent's tools (1.1.0, #367: the vendor's native
  strategy by default); `AddLlmConsoleStreaming` changed its signature. `Llm:Replay` and `Provider: mock` are the settings
  twins of `--llm-record` / `--llm-replay` / `--llm-mock`.
- **Checkpointing** — § 7.3. **Plugins**: a `plugin.json` manifest is required (`csharp-tools.md` § 9).
- **Run results.** `TaskResult.EndedOnIterationCap`, `DeliverableMissing`, `DeliverablePath`, `Resumed`, `RetryCount`
  (and their `TaskResult<TOutput>`, `TaskExecutionSnapshot`, `CrewExecutionEvent` twins); `DeliverableToolCheck.Check(tasks,
  agents, processType, managerAgentId)` runs from a C# host the load check of a `tool_call` deliverable — a crew built
  with `CrewBuilder` is not checked otherwise (1.2.0, #392).
- **A C# host that evaluates a script** catches a `Jint.Runtime.JavaScriptException`, the CLR exception on its `clr`
  property (1.1.0, #364); `JsCrewResult.output` is an `object?` (#369).
- **Templates.** `Orkeon.Templates` (rc.7, FWK-26) is Orkeon's own `dotnet new` package; the workshop keeps its
  templates (`OrkeonCrewHost`, `OrkeonTool`, `OrkeonPlugin`).

Since 1.4.0 (CHANGELOG, **[breaking]** where marked; the API of the first two bullets compiled against the 1.4.0
packages, V-69; what `Build()` enforces and the behaviour read in the sources and the CHANGELOG):

- **Builders.** `CrewBuilder.DecisionMode(CrewDecisionMode)` (YAML `decision: { mode }`, #429: `None`, `Optional`,
  `Required`; not called, `Unspecified`), whose rules `Build()` applies to the tasks and agents it was given;
  `AgentBuilder.ThinkingEffortAuto(min?, max?)` and `ThinkingEnabledAuto()` (#439; the first throws after
  `Thinking(false)`; bounds that leave no host level fail the task at its start, not the load),
  `Compaction(AgentCompaction?)` and `Skills(AgentSkills?)` (YAML `compaction:`, `skills:`). A decision task needs no
  `ExpectedOutput`: `CrewTaskBuilder.Build` gives it `decision` (#476).
- **Recompile** **[breaking]**: `ThinkingYamlConfig.Effort` and `Enabled` are `object?` (`string?` and `bool?` before,
  #439: a read needs a cast or a pattern match); the constructors of `CrewFactory` (`decisionCircuit`,
  `decisionProfiles`, `route`, `effort`) and `SequentialCrewOrchestrator` (`decisionCircuit`) take new trailing optional
  parameters (#429, #433, #434, #439). An assembly built against 1.3.0 fails with `MissingMethodException`; source that
  calls them compiles unchanged, and a host that builds them by hand passes its `DecisionCircuit`
  (`DecisionCircuit.OfHost(services)`).
- **Behaviour** **[breaking]**: a profile registered as `auto` refuses the start (#434), and the agent loops compact a
  long conversation by default (#432, `Orkeon:Compaction:Enabled`).

Gone at a2bb6c3: `WithStepCallback` (agent, crew), `WithTaskCallback`, `CrewTaskBuilder.WithCallback` and
`RequiresTool`, `WithCircuitBreaker` (`IStepCallback`/`ITaskCallback` were never invoked; Graph reads
`WithGraphConfig` alone). A crew given `WithManagerLlm` needs no manager agent: every agent works.

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
  `OnCrewCompletedAsync`, `OnCrewFailedAsync`; since rc.7 also `OnHumanInputAsync`), plus `ILlmUsageSink` for tokens and, since 87eb3bb, `ILlmCallObserver` (`Orkeon.Application.Interfaces.Ports`: `Started`, `Progress`, `Finished` of every model call, with its call mode and its estimated then counted tokens — what `orkeon run --events` writes as `llm.call.*`, `cli.md` § 3.2). At 151a762 a run also
  dispatches its domain events to the `IDomainEventHandler<T>` registrations (task and agent lifecycle as it
  goes, the crew's at the end; a throwing handler is logged), and `ICallbackHandler` hears every tool call
  (`OnStepStartedAsync` / `OnStepCompletedAsync`) — `docs/architecture/domain-events.md`. The template's
  observer chains on the hook already registered (`AutoSummaryWriter`), is the usage sink, and wraps every
  `IBaseTool` to time the calls — hence "register the event stream last".
- `run/events.jsonl` speaks protocol v2 with the envelope and payloads of `orkeon run --events jsonl`
  (`orkeon/cli.md` § 3, V-05): `run.started`, `task.started`, `tool.called`, `tool.returned`,
  `cost.updated`, `task.completed`, `error`, `run.finished`. Not emitted: `input.needed` (`human_input`
  is auto-approved — `AddOrkeonHumanInput()` registers the `AutoApprove` provider), `llm.delta`, the hub
  verbs, and the kinds `orkeon run` gained since (`llm.call.*`, `llm.fallback`, `graph.node.entered`; `cli.md` § 3). `taskId` is a ULID: map events to tasks by order and `agentRole`.
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
`Compile()` checks the structure (an edge from START, an outgoing edge on every node, existing targets; since rc.7,
through `GraphTopologyValidator`, also an orphan node and a graph with no path to END, every fault in one message).
The `CircuitBreakerPolicy` bounds the run: `GraphRunner` enforces `MaxTransitions`, `MaxStateVisits` and
`MaxTotalDuration` — `Default` 100 / 10 / 30 min, `Strict` 50 / 5 / 10 min, `Permissive` 1000 / 50 / 2 h — and a
breach throws `GraphCircuitBrokenException`. The duration is checked between nodes, so a node that hangs is
never interrupted: bound a slow node with your own `CancellationToken`. The policy's `StateTimeout`
(5 min / 2 min / 30 min) is carried but never read. This is **not** `process: graph`, which since rc.7 runs
one node per task — chained in order, or wired by the YAML `graph:` block's nodes and edges (`yaml-schema.md` § Graph);
both run on the same Domain engine. Orkeon's procedural
TypeScript shape also has a `stateGraph()` global; the harness uses the declarative shape only
(`orkeon/typescript-dsl.md`).

### 7.2 Flows — removed

The Flows subsystem (`Orkeon.Domain.Flows`, `IFlowEngine`, `AddOrkeonFlows`, the flow builders and YAML
loader, `docs/orchestration/flows.md`) is deleted at a2bb6c3, with no shim: nothing ran a flow. Chain crews
with a `StateGraph` (§ 7.1) whose nodes call `KickoffAsync`, or in plain C#.

### 7.3 Checkpoint stores and `IResumeEngine`

Rewritten at rc.7 (FWK-01, FWK-07); what `orkeon run --resume` does with it is `orkeon/resume-and-memory.md` § 4.

- `AddOrkeonInfrastructure` registers the in-memory store (`AddOrkeonCheckpointing()`).
  `AddOrkeonCheckpointing(IConfiguration)` reads `Orkeon:Checkpointing` (`Enabled`, `Store` memory, json, sqlite or
  postgres, `Path`, `ConnectionString`) as `orkeon run` does. `AddOrkeonSqliteCheckpointing(connectionString)` — the data
  source a **virtual** path under a writable root of the host's own (not `/state` under `RunnerHost`, which plans that
  mount itself) — and `AddOrkeonPostgresCheckpointing(configuration)` now **replace** the registered `IStateStore`
  whatever the order (`Replace`; before rc.7 they used `TryAdd` and lost to the in-memory store when called after
  `AddOrkeonInfrastructure`). `ICheckpointManager` and `IResumeEngine` stay `TryAdd`.
- What is written: every task a run completes is checkpointed **as it ends**, in the six modes, by
  `CheckpointingAgentExecutionService` (a decorator of `IAgentExecutionService`), under `"{TaskKey}#{n}"` — the task's
  key (`CrewTaskBuilder.WithKey`, the YAML task name) and the ordinal of its invocation —, with a fingerprint of the
  task. The session id is the run's `ExecutionId` (`ICheckpointManager.StartSessionAsync(ExecutionId sessionId, string
  crewKey)`), and the crew is known by a stable `CrewKey`, not by its id, regenerated at each load. A run whose crew did
  not succeed ends its session `Failed`. A database written by a build before rc.7 is not read (`crew_id` → `crew_key`,
  no migration).
- What resume gives: `KickoffOptions.Resume` on `KickoffAsync(crewId, input, options, ct)` continues a session — the
  completed tasks answered from their checkpoint, the others run; `IResumeEngine.CanResumeAsync(crewKey)` and
  `ResumeAsync(crewKey, ResumeOptions)` answer a `ResumeResult` (`Refusal`, `SessionId`, `SkipCount`…; `ResumeFromIndex`
  is removed: a resume is keyed by task). Not exercised by a harness template.
- Still a complement: a checkpoint is a whole task of one run. The application-level registry stays the mechanism for
  units inside a task and for incremental processing across runs (`reliability/resume-patterns.md`,
  `orkeon/resume-and-memory.md`, `INV-RESUME`). `AddCrewExecutionStatePersistence(...)` makes the status records of
  `KickoffNoWaitAsync` executions durable: bookkeeping that re-runs nothing.

### 7.4 Active RAG

- `orkeon run` runs it at 1.2.0 (`orkeon-reference.md` § 8); a host of its own still wires it:
  `services.AddOrkeonRag(configuration)` (`Orkeon.Rag.DependencyInjection`, package `Orkeon.Rag`) registers
  the pipelines, the ingestion, the **knowledge-context augmenter** that makes an agent's `knowledge:`
  (YAML) or `WithKnowledge(collection)` inject retrieved chunks with citations, and the bootstrapper that
  ingests the crew's `rag:` collections at load. Without it both keys are inert, with a warning.
- It needs an embedding provider: `AddOrkeonLocalEmbeddings()` (`Orkeon.Tools.Embeddings.Local.DependencyInjection`, on-device)
  or a remote one from `Orkeon:Embeddings` (`Provider`: `openai`, `ollama`, and since rc.7 `mistral`, `azure-openai`, `gemini`), else it fails at first use.
  Since rc.7 a guard records the embedding model (`Orkeon:Embeddings:FingerprintPath`) and refuses a host whose model
  changed; since 1.2.0 a consumer that references the local embeddings with `ExcludeAssets="build"` builds offline and
  fails only at the first local embedding (#376).
  The document store is `Orkeon:Rag:Provider` (a type, connected from its host section; an unknown type,
  or one whose section lacks what it needs, is refused), else the ambient memory provider.
  Retrieval profile: the attachment's `profile`, else `rag.defaults.profile`, else `Orkeon:Rag:Profile`
  (`fast` by default); `balanced` and `quality` need `AddOrkeonOnnxReranker()` (`Orkeon.Rag.Onnx.DependencyInjection`,
  package `Orkeon.Rag.Onnx`), which the image's local feed does not carry — a host that starts without it
  refuses those profiles at its start, naming `onnx`; `corrective` and `adaptive`
  cannot serve a `knowledge:` attachment (they generate). The model calls of the subsystem go to the host
  profile `Orkeon:Rag:LlmProfile` names, else the default.
- `AddOrkeonRagTools()` registers `rag_search`, `rag_ingest`, `rag_eval`, attachable to a crew agent like
  any tool at 1.2.0 (all three in `orkeon run --list-tools`).
- `Orkeon.Rag` and `Orkeon.Tools.Rag` are in the local feed; add their `PackageVersion` lines to the
  host's `Directory.Packages.props`.

### 7.5 The evaluation subsystem

- `AddOrkeonInfrastructure` already calls `AddOrkeonEvaluation`: the deterministic `IEvaluator`s
  `FormatCompliance`, `SchemaCompliance`, `TextQuality`, `Similarity`, `ToolAccuracy` are there, and the
  default `IEvaluationSuite` adds the LLM judges `Coherence`, `Fluency`, `Groundedness` when
  `Evaluation:EnableLlmJudge` is `true` — bound by `AddOrkeonInfrastructure(configuration)` (the call
  without configuration binds nothing) — on the registered `IChatClient` (none: the suite fails to resolve,
  naming the setting). `IEvaluationSuite.RunAsync(inputs)` takes
  `EvaluationInput(Output, ExpectedOutput, TaskDescription, Context, ExpectedFormat, Metadata)` and returns
  an `EvaluationReport` (per-case `EvaluationScore`s, summary); `EvaluationScore.IsPassing(0.5)` by default.
- Opt-in: `AddOrkeonBenchmarking()` adds `IBenchmarkRunner` (several runs per case, mean and standard
  deviation); `CompareReports` and `JsonFileDataset` are in `Orkeon.Infrastructure.Evaluation`.
- Since rc.7 (FWK-09) `RunnerHost` binds the `Evaluation` section and registers `AddOrkeonBenchmarking()`, and the CLI has
  `orkeon eval run | bench | compare | rag` (`cli.md` § 1): scoring a dataset no longer needs a C# host.
- `EnableLlmJudge` is the section's only key at 151a762 (`DefaultRunsPerCase` and `RegressionThreshold` are
  gone); `AddOrkeonEvaluation` is idempotent. The 24ab0d0 workaround (registering `Options.Create(...)`
  first) is no longer needed: assert the resolved suite in a test (code reading, not run).
- In the harness the judges are Claude subagents (D7) and the checks of `orkeon-bench`; reusing these
  evaluators through a C# bridge is a later option (plan § 8.4, D10).

### 7.6 Experimental surfaces

The .NET types of A2A (`ORKEXP001`), Autonomous orchestration (`AgentExecutionBudget`, `IAgentChannel`,
`SpawnAgentTool` — `ORKEXP002`), corrective RAG (`ORKEXP003`), MCP (`ORKEXP004`) and, since rc.7, the per-model
capabilities (`ORKEXP005`), the host HTTP security (`ORKEXP006`) and the run history ports (`ORKEXP007`) carry `[Experimental]`:
referencing one is a compile error you suppress explicitly (`<NoWarn>$(NoWarn);ORKEXP002</NoWarn>` or a
`#pragma` at the call site) — record that opt-in in a `DEC`. `ProcessType.Autonomous` itself is not
experimental, nor are the stable entry points that wire those surfaces without your code naming a type
(`AddOrkeonInfrastructure(configuration)` for MCP, `AddOrkeonRag(configuration)` for the corrective graph —
`docs/reference/experimental-apis.md`).

## 8. How the bench runs a C# team

`orkeon-bench` knows a C# team by its `host/` (a `.sln` or `.slnx`, or `src/<Team>.Host/*.csproj` as `new-team.sh` writes it: kind `csharp`;
a stray `.csproj` under a YAML team's `host/` mount is not one) and
measures it like a YAML team, from the host and launchers `orkeon-crew-csharp` writes:

- **L0**: `launchers` are those of `new-team.sh` (`dotnet run --project src/<Team>.Host … --team-dir`,
  no Studio card; `orkeon-bench scaffold` refuses the team), `check-script` is skipped,
  `dotnet-build` builds `host/` in Release, and `host-validate` runs the host's `--validate` in place
  of `orkeon run --validate`.
- **L1**: `dotnet test` of `host/` (the startup tests, `HostCommandLineTests`, the tests of its tools).
- **L2 to L4**: each scenario runs `dotnet run --project src/<Team>.Host -c Release --no-build --
  --team-dir <team> --events - [--no-decision] [--settings <file>] --mount <spec>...` from `host/`
  (no `--settings` on `machine` and named profiles: the host's own chain applies; none after a red
  `dotnet-build`, even with `--continue`).
  The host takes those options as `orkeon run` does: `--mount` binds every root of `mounts.json`
  with its declared access, or none; `--settings` is then the only settings file read (the
  `ORKEON_` variables still apply); `--no-decision` is `DecisionCircuit.Off`, as in
  `RunCommand.cs`. The stub, the profiles, the budget gate, the event stream (the same protocol
  v2) and the report are those of a YAML team; `--list-tools` of the host gives the catalogue of
  `INV-TOOLS`. L4 stays paid, behind the gate (`HARNESS.md`, rule 1).
- **Settings**: the bench and the run gate read the host's chain, not `orkeon run`'s —
  `teams/<slug>/appsettings.json`, `appsettings.local.json`, `settings/<slug>/appsettings.json`, then
  `ORKEON_*` (never the user's file) — to classify a run local or remote.
- **Explicit `--mount`**: refused outside the team folder unless `--allow-external-mounts` (or
  `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`), as `orkeon run` refuses one outside its working directory; the team
  folder itself, `crew/`, `host/`, `appsettings/` and `_shared/` always; with the flag, a folder holding
  the root, `$HOME`, the workshop or the team.
- **Deploy**: `orkeon-bench deploy` ships `dotnet publish` of the host under `host/publish/` with
  launchers that run the published dll: the target needs the .NET runtime only, and Studio cannot launch it.

By hand, the same: `./run.sh --validate`; `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1
ORKEON_Llm__Model=stub-model ORKEON_Llm__ApiKey=stub ./run.sh --events run/events.jsonl` (the host
reads the `ORKEON_` variables as the CLI does; V-04), `TEAM_ENV=<set>` to bind a mount set.

## 9. Pitfalls

| Symptom | Cause | Do |
|---|---|---|
| a tool silently missing from an agent | `StrictTools` left at the lenient library default | set it `true` |
| `Two registered tools are named 'x'` at startup | two DI registrations under one name (case-insensitive) | rename or remove one |
| `… names the LLM profile 'x', which this host does not offer` | an agent's or task's `profile` not registered | `AddOrkeonLlmProfiles(configuration)`, or drop the profile |
| `unknown tool(s): email_parser` (or `email_*`) in a host | `AddOrkeonFileSystemTools` no longer registers it on main | `AddOrkeonEmailTools(configuration)` |
| `cost.updated` / `run.finished` count no tokens | provider registered by hand, outside the meter | `ILlmProviderFactory`, or `AddOrkeonLlmProvider` |
| every answer repeats the prompt | no `Llm` section: echo provider | `Llm` in settings or `ORKEON_Llm__*` |
| `Crew <id> not found` in `output.Error` | a built crew not stored in the repositories | `AddAsync` agents, tasks and crew in the same scope |
| no deliverable file | `OutputFile` used | `task.SetDeliverable(...)`, or write from the host |
| checkpoints lost although a store is configured | `Orkeon:Checkpointing:Store` without `Enabled: true` (ignored, with a warning), or a database written before rc.7 | set `Enabled`; start a new database |
| `knowledge:` has no effect (a warning at load) | `AddOrkeonRag` missing, or no embedding provider | § 7.4 |
| the event file is refused | its directory contains a mounted root | a folder of its own (`run/`) |
| compile error `ORKEXP00x` | an experimental type is referenced | explicit suppression + `DEC` |
| compile error `ORKCON001` (since e44df3f, #182) | a `System.Console` member referenced outside a path holding `/tests/` or `/examples/` — the analyzer `Orkeon.Compliance.Vfs` the template references | write through an injected `TextWriter`/`ILogger`; the one sink of the executable carries `[Orkeon.Compliance.Vfs.SuppressConsoleCompliance("CONSOLE-SINK: …")]` (public in `Orkeon.Domain`; `CONSOLE-ADAPTER` for a console abstraction) |
