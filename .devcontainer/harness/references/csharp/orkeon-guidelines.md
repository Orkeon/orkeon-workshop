# Orkeon repository conventions for C# code — dated extract

> Reference document of the Orkeon harness (the workshop's `references/csharp/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16) — at that tag the toolchain table, the analyzer's Roslyn pin, the test packages, the API freeze, the ADR list and `CLAUDE.md`'s sections were read again on 2026-11-17; the other conventions stand as extracted; first extracted on 2026-10-02 at 24ab0d0, re-checked on 2026-10-03, 2026-10-06, 2026-10-07, 2026-10-07, 2026-10-08, 2026-10-11, 2026-10-12, 2026-10-14, 2026-10-18, 2026-10-18, 2026-10-18 and 2026-10-18 (the convention files and `CONTRIBUTING.md` are the same at 80fdefe as at 77ac8a9; `CLAUDE.md` differs in three lines, none in a convention; none of these files is among the five that differ between 80fdefe and 812cd10; between 812cd10 and ce9ec1f only `CONTRIBUTING.md` differs, below; between ce9ec1f and ad6dc63 only `CLAUDE.md` differs, cut from 691 lines to 89 that keep the rules the code cannot tell (DOC-03): the sections cited below are named as at ad6dc63, and a convention it no longer restates is marked so and kept, the code being identical; between 23f4eae and 5668c54 only `tests/core/Orkeon.Domain.Tests/Common/AggregateRootTests.cs` changed, and between ad6dc63 and 5668c54 none of these files differs; between 5668c54 and f59446b only `CLAUDE.md` (the version in preparation, rc.5), `CONTRIBUTING.md` (104 bundled examples) and `src/Directory.Build.props` (`VersionSuffix` rc.5) differ, none in a convention; between f59446b and 13461ea `CLAUDE.md` (102 built-in tool classes, 49 `src/` and 37 test projects, and the `*Response` suffix now illustrated by a port's answer record, `AgentChannelResponse`, instead of the removed `ApiResponse<T>`), `CONTRIBUTING.md` (eleven tool packs, the drive family the third exception to the scope freeze), `Directory.Packages.props` (the `MessagePack` and `System.Security.Cryptography.Pkcs` security pins), `tests/.editorconfig` (one comment) and `tests/shared/Orkeon.Tests.Shared/` (three new doubles) differ, none in a convention; between 13461ea and fa46bb5 only `tests/shared/Orkeon.Tests.Shared/` differs, one new double, `FakeAsyncDisposable`; between fa46bb5 and 63be532 only `tests/shared/Orkeon.Tests.Shared/` (one new file, `Llm/LlmEndpointCases.cs`) and `docs/architecture/vfs-compliance.md` (a folder a daemon grants a crew is readable wherever it lies) differ, none in a convention; between 63be532 and e258730 none of these files differs, only `CHANGELOG.md`; between e258730 and acd59d6 only `CONTRIBUTING.md` (a test awaiting a script engine waits under `HangGuards.EnginePromise`) and `tests/shared/Orkeon.Tests.Shared/` (`Timing/HangGuards.cs`) differ; between acd59d6 and e44df3f `.editorconfig` (the `ORKCON001` console ratchet, § 2), `CLAUDE.md` (120 built-in tool classes, rc.6, 50 `src/` and 38 test projects, the Console rule), `CONTRIBUTING.md` (project counts, native libraries of the machine's runtime only, the ten-package lineup), `Directory.Packages.props` (package updates: xUnit, the test SDK, § 6), the analyzer (`ORKCON001`, its compiler reference, § 5), `src/Directory.Build.props` (`VersionSuffix` rc.6), `docs/architecture/vfs-compliance.md` (the working directory, the agent working root), `docs/tools/new-tool-pattern.md` (`AccessFor`, arrays of records, `IExpectedToolError`), `docs/adr/` (ADR-015, ADR-016 and status lines) and `tests/shared/Orkeon.Tests.Shared/` (`StubLlmProvider.RespondToChat`, a `DevRepo` fixture) differ; between f80665f and 8f4de67 none of these files differs, only `CHANGELOG.md`; between 8f4de67 and 151a762 none of these files differs, only `CHANGELOG.md`).
> Sources: in the Orkeon repository at that tag — `CLAUDE.md`, `CONTRIBUTING.md`, `.editorconfig`,
> `tests/.editorconfig`, `Directory.Build.props`, `src/Directory.Build.props`, `tests/Directory.Build.props`,
> `Directory.Packages.props`, `global.json`, `src/analyzers/Orkeon.Compliance.Vfs/` (analyzer, csproj, `README.md`),
> `src/core/Orkeon.Domain/Attributes/SuppressVfsComplianceAttribute.cs`, `docs/architecture/vfs-compliance.md`,
> `docs/adr/`, `docs/reference/experimental-apis.md`, `docs/getting-started/bootstrap.md`,
> `docs/tools/new-tool-pattern.md`, `tests/shared/Orkeon.Tests.Shared/`, `CHANGELOG.md` (`[Unreleased]`). The
> convention files are identical to those of 1.0.0-rc.4 except `Directory.Packages.props` (MailKit and MimeKit
> added by 24ab0d0, `OpenTelemetry.Exporter.Console` removed by a2bb6c3, `Microsoft.Extensions.Configuration.Binder`
> pinned by fb26364), a comment in `Directory.Build.props` (fb26364) and `CONTRIBUTING.md` (the third-party
> notices rule, a2bb6c3; tests under load and pinned versions, fb26364; the release smokes' check of the notices,
> 77ac8a9; "Adding a setting", bd3420c — the settings catalogue, the reference tables, `orkeon settings` and
> the sample file are produced from the property's XML summary and its category — rules of Orkeon's own
> release chain and settings, as is the branch naming its `CLAUDE.md` gained at 77ac8a9: none applies to C#
> written in a workshop). Harness: the image's C# README
> (`/usr/local/share/orkeon-harness/csharp/README.md`) § "Conventions the templates carry", the templates'
> convention files, `.claude/rules/orkeon-csharp.md`.

The conventions of the Orkeon repository that apply to C# written in the workshop: tools under
`library/tools/csharp/`, plugins, team hosts. The templates under `/usr/local/share/orkeon-harness/csharp/`
already carry the files (`Directory.Build.props`, `Directory.Packages.props`, `global.json`, `.editorconfig`,
`tests/.editorconfig`, `nuget.config`), and the image's C# README § "Conventions the templates carry" sums
them up: **copy them, never loosen them** (`.claude/rules/orkeon-csharp.md`). This extract says what each
convention is, where it comes from and whether the build enforces it (**build**) or only review does
(**review**). Tool-specific rules — above all the schema rule — are in `orkeon/csharp-tools.md`.

## 1. Toolchain and layout

| Convention | Source | Enforced | In the harness |
|---|---|---|---|
| SDK `10.0.300`, `rollForward: latestFeature` | `global.json` | build | same |
| Tests on Microsoft.Testing.Platform (`"test": { "runner": "Microsoft.Testing.Platform" }`) | `global.json` | build | same |
| `net10.0`, `LangVersion latest`, `Nullable enable`, `ImplicitUsings enable` | `Directory.Build.props`, `src/Directory.Build.props` | build | same, in the root props |
| Central package versions (`ManagePackageVersionsCentrally`) | `Directory.Packages.props` | build (NU1008 on a version in a csproj) | same; `OrkeonVersion` pins every `Orkeon.*` |
| Pinned compiler `Microsoft.Net.Compilers.Toolset` 5.9.0 (for the repository's own generator) | `Directory.Build.props`, `Directory.Packages.props` | build | same; since 1.0.0 the VFS analyzer no longer needs it (§ 5) |
| NuGet lock files: every project of `Orkeon.sln` outside `examples/` restores with a committed `packages.lock.json`, CI in locked mode (1.0.0) | `CONTRIBUTING.md` | CI | none: the templates carry no lock file, as Orkeon's own `dotnet new` templates |
| NuGet audit: `NuGetAudit` true, mode `all`, level `low`; an advisory fails CI | `Directory.Packages.props` | CI | `ORKEON_HARNESS_OFFLINE=1` switches the audit off; NU1900 is never an error |
| `src/<zone>/<Project>/`, mirrored by `tests/<zone>/<Project>.Tests/` | `CONTRIBUTING.md` § Project Structure | review | `src/<Name>/`, `tests/<Name>.Tests/` |
| LF, UTF-8, 4 spaces, final newline, no trailing spaces; YAML 2 spaces | `.editorconfig` `[*]` | review | same |

**Keep the `src/` and `tests/` layout**: the analyzer ratchets of `.editorconfig` are path globs
(`[src/**.cs]`, `[{src,tests}/**.cs]`, `[examples/**.cs]`) and `tests/` has its own `.editorconfig`; code
outside those folders silently loses the `src` rules, and code under the root `examples/` folder gets the
relaxed demo set (the glob matches that folder only, while the VFS analyzer exempts any path holding
`/examples/`, § 5).

**Microsoft.Testing.Platform** (`CLAUDE.md` § Commands, `CONTRIBUTING.md`): a `--filter` that matches zero tests in a
module is an error (exit 8), so never exclude a project by name from a solution run — a category run
passes `-- --ignore-exit-code 8` (main's `CONTRIBUTING.md`); the VSTest flags `--collect`, `--logger`,
`--blame` are rejected; coverage goes through `dotnet-coverage collect -- dotnet test`. Checked in the
image on the tool template: `dotnet test --nologo` runs **zero tests** and exits 5 (the platform's code for
invalid command-line arguments) — set `DOTNET_NOLOGO=1` instead.

## 2. Analyzers and warnings

- **The full set**: `AnalysisMode=All`, `AnalysisLevel=latest-all` on every project (root
  `Directory.Build.props`); `.editorconfig` is the ledger that arbitrates each family, with its reason.
- **Warnings as errors.** Orkeon's CI builds `-c Release -warnaserror`; locally only `CS1998`, `CS1574` (src),
  `CS8602`, `CS8604` (tests), `RS0016`, `RS0017` (frozen API) and the `.editorconfig` error severities fail
  the build. The harness writes the gate into the props (`TreatWarningsAsErrors=true`, NU1900 excepted):
  a plain `dotnet build` fails on any warning. Same gate, moved from CI to the build.
- **Suppressions**: fix first, narrow second; otherwise `[SuppressMessage("<Category>", "CAxxxx",
  Justification = "<why this site is a false positive>")]` on the member, or a local commented
  `#pragma warning disable`. Never a blanket `NoWarn`.

What `.editorconfig` makes an **error in `src/**`**, and what to write:

| Rules | Write |
|---|---|
| CA2007 | `.ConfigureAwait(false)` on every await (exempt: `Orkeon.ConsoleApp`; neutralised in tests and examples) |
| CA1305, CA1307, CA1304, CA1308, CA1310, CA1311 | `StringComparison.Ordinal` / `OrdinalIgnoreCase`; `CultureInfo.InvariantCulture` to format and parse; `ToLowerInvariant` only to produce a wire value, under a justified pragma |
| CA1062 | `ArgumentNullException.ThrowIfNull(arg)` for every externally visible parameter |
| CA1848, CA1873 | `[LoggerMessage]` partial methods; hoist an expensive argument under `IsEnabled` |
| CA1805 | no initializer to the default value |
| CA5394 | no `System.Random` without a justified pragma |
| CA1002, CA2227, CA1819 | read-only collections on the public surface (`IReadOnlyList<T>`, get-only or `init`) |
| CA1054, CA1056, CA2234 | `System.Uri` rather than URL strings |
| CA1716, CA1024, CA1034 | no reserved keyword as a name; properties, not getter methods; no public nested type |
| CA1031 | narrow catches; a deliberate fault barrier carries a site-specific `[SuppressMessage]` and lets `OperationCanceledException` through |
| CA1515, CA1852, CA1812, CA1052, CA1813 | types of an executable `internal`; seal; static holder types |
| CA2000, CA2213, CA1001, CA1849, CA2025 | dispose what you own; `await`, never `.Result` or `.Wait()` |
| CA1822 | `static` when no instance state is used |
| CA2100 | parameterised SQL |
| CA1860, CA1861, CA1854, CA1847, CA1826, CA2016 (src, tests, examples) | `Count > 0`; `static readonly` arrays; `TryGetValue`; char overloads; indexing; forward the `CancellationToken` |
| SYSLIB1045 (src, tests) | `[GeneratedRegex]` |
| ORKCON001 (since a5b274e, #182) | no `System.Console`: log through an injected `ILogger`, read and write through an injected `TextWriter`/`TextReader` or console abstraction; only a console adapter or the one sink of an executable carries `[SuppressConsoleCompliance("CONSOLE-ADAPTER: …")]` / `("CONSOLE-SINK: …")` |

`tests/.editorconfig` **neutralises** for tests: CA1707 (underscores in test names), CA2007, CA1515,
CA1852, the culture family, the API-shape family, CA1062, CA1848, CA1031, CA5394, CA2201, CA1065; and
**raises to error**: CA2000, CA1849, CA1063, CA1001, CA2213, CA1816, CA1822, xUnit1051 (pass
`TestContext.Current.CancellationToken`), xUnit2032 (`Assert.IsType<T>` / `IsAssignableFrom<T>`);
xUnit2033 is off. `ORKCON001` is not a CA rule: `ConsoleUsageAnalyzer` ships in the
`Orkeon.Compliance.Vfs` package beside the VFS rules, **error by default** wherever the package is referenced, exempts
paths holding `/tests/` or `/examples/` as the VFS rules do, and its attribute is public in `Orkeon.Domain`
(namespace `Orkeon.Compliance.Vfs`; `docs/architecture/console-compliance.md`, `CLAUDE.md` § Other rules). A
workshop host or tool that prints to the console is reported unless it suppresses the rule at its one sink. Its header says `AnalysisMode=All` is not enabled for tests: stale — the root props
enable it for every project.

## 3. Style

| Convention | Source | Enforced |
|---|---|---|
| File-scoped namespaces | the code (2,471 of the 2,482 `src/` files with a `namespace` line at 151a762 (as at 8f4de67 and f80665f), counted with `git grep`; 2,231 of the 2,241 `src/` files that declare a namespace at acd59d6; 2,229 of 2,239 at 63be532; 2,222 of 2,232 at fa46bb5) | review |
| `sealed record` with `{ get; init; }` for values, DTOs and results | `CLAUDE.md` § DTO conventions | review |
| Application DTOs: `required` for required fields, `Immutable*` collections, suffixes `*Dto` / `*Request` (an input record a port takes; a CQRS command is a `*Command`) / `*Response` (a port's answer record), `[JsonPropertyName("snake_case")]`, `ICommandValidator<T>`, enums in `*Enums.cs` | `CLAUDE.md` § DTO conventions | review |
| XML documentation on every public member (`GenerateDocumentationFile`) | `src/Directory.Build.props`, `CONTRIBUTING.md` | build (CS1591; harness locally, Orkeon in CI) |
| Guards `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrWhiteSpace` | CA1062, the code | build |
| Logging through `[LoggerMessage]` methods of `partial` classes; per-class `EventId` from 1; the exception as a parameter | `.editorconfig` (B3 ratchet), `ToolBase.cs` | build (CA1848) |
| `System.Threading.Tasks.Task` written in full where `Orkeon.Domain.Task` is imported | `CLAUDE.md` § Other rules | build (ambiguity) |
| PascalCase public members; `I` prefix for interfaces; private fields `_camelCase`, static `s_camelCase`, thread-static `t_camelCase`; `…Async` | `CONTRIBUTING.md` § C# Style Guide ("camelCase for private fields"), the code | review |
| Comments in English, never accented | `CONTRIBUTING.md`; `scripts/check-comment-accents.py` | Orkeon CI only |
| Small methods, async/await, AAA tests, meaningful names | `CONTRIBUTING.md` | review |

**A tool's request record is the exception to the DTO conventions**: it cannot have `required` members
(`ToolBase<TRequest, TResponse>` demands `new()`), and a `[JsonPropertyName]` on it must equal the
snake_case of the property name, or the model's value is lost (`orkeon/csharp-tools.md` § 3, verified).

## 4. Architecture and dependency injection

- **Clean Architecture** (`CLAUDE.md` § Architecture map): Domain = entities and value objects,
  referencing only `Orkeon.Constants.Llm`; Application = use cases, ports, DTOs, no database, HTTP or
  framework code (that last clause stated by Orkeon's `CLAUDE.md` at ce9ec1f, § Clean Architecture Layers;
  not restated at acd59d6, f80665f, 8f4de67, 151a762, 0ea39d9, c727c06, 83cd91d, c101cbd nor 1.2.0); Infrastructure = the adapters (LLM providers, memory stores, file system,
  HTTP). The allowed exceptions are ADRs (ADR-002, -003, -005, -006, -012). In a workshop tool: `Domain/` (pure logic, no
  Orkeon type) and `Tool/` (the `ToolBase` class: validation, mapping, VFS I/O).
- **DI through `AddOrkeonXxx(this IServiceCollection)` extensions**, services registered with `TryAdd*` so
  that a host that registers first wins (`bootstrap.md` § Overriding an Orkeon service). **Tools are the
  exception**: one `services.AddSingleton<IBaseTool>(…)` per tool, or
  `TryAddEnumerable(ServiceDescriptor.Singleton<IBaseTool, T>())`; never `TryAddSingleton<IBaseTool, T>()`,
  which keeps the first tool only (`new-tool-pattern.md` § 7).
- **A tool's access class**: `Access` for the tool, and since #219 `IBaseTool.AccessFor(arguments)` per call
  (defaults to `Access`), which the permission gates read; a tool whose operations differ overrides it and
  returns the most restrictive class for arguments it does not recognise (`IBaseTool.cs`,
  `new-tool-pattern.md`).
- **Opt-in subsystems** are enabled by their own `AddOrkeonXxx()` after `AddOrkeonInfrastructure()`
  (`opt-in-subsystems.md`) — but replacing a `TryAdd` default, such as the checkpoint store, means
  registering before (`orkeon/csharp-crews.md` § 7.3).
- **Experimental surfaces** (`[Experimental("ORKEXP001")]`…`ORKEXP004`: A2A, Autonomous types, corrective
  RAG, MCP): referencing one is a compile error. Orkeon suppresses the four ids centrally in its own
  trees; in the workshop, suppress per project or per call site and record the opt-in in a `DEC`.

## 5. File access: VFS compliance

- **Principle** (`CLAUDE.md` § Virtual File System, ADR-008 "virtual paths are the only currency"): no
  `System.IO.File.*`, `Directory.*`, `new FileStream/FileInfo/DirectoryInfo/FileSystemWatcher`; all I/O
  through `IFileSystemService` and virtual paths; inject it as a **required, non-nullable** constructor
  parameter (`docs/architecture/vfs-compliance.md` § Adding a new tool or service).
- **The analyzer** `Orkeon.Compliance.Vfs`, errors by default: `ORKVFS001` `File.*`, `002` `Directory.*`,
  `003` `FileStream`/`FileInfo`/`DirectoryInfo` built from a string, `004` `Path.GetFullPath`, `005`
  `FileSystemWatcher`, `006` `StreamReader`/`StreamWriter` built from a string, `007` a nullable
  `IFileSystemService?` field or parameter. Calls are judged on the resolved symbol (`using static` does not
  hide them).
- **Exemptions by path**: any file whose path contains `/tests/` or `/examples/` is not analysed at all
  (plus Orkeon's own VFS folders and four listed files).
- **Exemption by attribute**: `[SuppressVfsCompliance("<CATEGORY>: <reason>")]` on the assembly, a type or
  a member (the analyzer walks up the containing symbols). Categories: `EXCEPTION-BOOTSTRAP` (runs before
  the mounts exist), `EXCEPTION-WATCHER-BRIDGE`, `OUT-OF-SCOPE` (host probing); `EXCEPTION-BACKCOMPAT` and
  `EXCEPTION-OBSOLETE` are retired. At 1.2.0 both copies of the attribute (`Orkeon.Domain`, the analyzer) document `ORKVFS001..007` and
  these three categories, and a repository test (`SuppressionReasonCategoryTests`) refuses a reason in `src/`
  that does not start with one; `ORKVFS005` now says to inject `IVirtualFileSystemWatcher` and consume
  `WatchAsync`. The type, `Orkeon.Compliance.Vfs.SuppressVfsComplianceAttribute`, is
  public in `Orkeon.Domain`; a project without `Orkeon.Domain` declares an internal attribute of that exact
  full name (main's `vfs-compliance.md` and the analyzer's `README.md`). `CLAUDE.md` and main's
  `CONTRIBUTING.md` still speak of inline `// EXCEPTION-BOOTSTRAP` / `// OUT-OF-SCOPE` comments: the analyzer
  reads only the attribute.
- **The compiler**: from 1.0.0-rc.5 to acd59d6 the analyzer was compiled against Roslyn 4.8.0
  (`CHANGELOG.md` § "Fixed — Orkeon.Compliance.Vfs is compiled against Roslyn 4.8.0 again"), which any SDK
  from .NET 8.0.100 loads. From f80665f to c101cbd — and in the release candidates — its csproj said `VersionOverride="5.9.0"` again (the package updates of
  7bd3255, #184): a compiler older than 5.9.0 (the SDK 10.0.3xx one is 5.6.0) skipped it with a CS9057 warning and no
  ORKVFS or ORKCON rule ran, and the harness's pin of `Microsoft.Net.Compilers.Toolset` 5.9.0 was what kept the rules
  running. Since 1.0.0 the analyzer compiles against Roslyn **4.8.0** once more (`VersionOverride="4.8.0"` at 1.2.0;
  CHANGELOG `[1.0.0]`, "Orkeon.Compliance.Vfs loads in a stock SDK again"), and a repository test, `RoslynFloorTests`,
  fails above it: a stock SDK loads it. Whatever the version, check that the analyzer runs: a deliberate `File.ReadAllText` in a scratch
  copy must fail the build with ORKVFS001.

## 6. Tests

- **Framework**: xUnit v3 — `xunit.v3` 4.0.2, `xunit.runner.visualstudio` 4.0.1, `Microsoft.NET.Test.Sdk`
  18.11.0 at 1.2.0, as at c101cbd, 83cd91d, c727c06, 0ea39d9, 151a762, 8f4de67 and f80665f (4.0.1, 4.0.0 and 18.10.1 up to acd59d6) — on Microsoft.Testing.Platform; test projects are `OutputType Exe`, with `<Using Include="Xunit" />`.
  This settles the open point of plan § 8.1.
- **Native xUnit assertions only**: no mocking framework (Moq, NSubstitute, FakeItEasy), no fluent
  assertion library (FluentAssertions, Shouldly, Verify) — `CLAUDE.md` § Test doubles and assertions.
- **Hand-written doubles**, by design: plain classes named `Mock*`, `Fake*` or `Stub*` that implement the
  production interface, expose plain fields or properties to inspect calls, and live in a `Doubles/` (or
  `Fakes/`) folder of the consuming test project; the reference is `MockTaskRepository`.
- **Shared doubles** in `tests/shared/Orkeon.Tests.Shared` (not published): `FakeFileSystemService`,
  `DiskBackedFileSystemService`, `PassThroughFileSystemService`, `ThrowingFileSystemService`,
  `StubLlmProvider`, `StubBaseTool`, `StubPathValidator`, `MockLogger`, `RecordingLogger(Factory)`,
  `FakeDocumentStore`, `StubReranker`, `AssertEx`, `Polling`, `LoopbackPorts`, `ActivityRecorder`,
  `ManualTimeProvider`. Copy what you need with its MIT notice
  (`/usr/local/share/orkeon-harness/csharp/THIRD-PARTY.md`), as the tool template did for `FakeFileSystemService`.
- **Shape**: Arrange / Act / Assert; descriptive names with underscores (`Call_ReportsAMissingFileAsAnError`);
  `TestContext.Current.CancellationToken` to cancellable calls; dispose what the test creates.
- **True under load** (`CONTRIBUTING.md`): a test server takes its port through `LoopbackPorts` and listens
  on `127.0.0.1`; a delay a test must not reach is a hang guard (`Polling.DefaultTimeout`); no unit test
  bounds a duration.
- **Categories**: `[Trait("Category", "Integration")]` (Docker, a network service) and
  `[Trait("Category", "Slow")]` (minutes of runtime); the CI fast run is
  `dotnet test --no-build --filter "Category!=Integration&Category!=Slow"`, the two categories run nightly,
  and locally `dotnet test --no-build --filter "Category=Integration|Category=Slow" -- --ignore-exit-code 8`.
- **Disk**: tests may touch the real disk (path exemption, `DiskBackedFileSystemService`); prefer the
  in-memory `FakeFileSystemService`, which also proves the mount boundaries and the access rights.
- `Orkeon.Scripting.Testing.MockLlmProvider` is public but its expectations are added through an internal
  method (the scripting `test.mockLlm` binding): from C#, use an echo provider or the simulated LLM of V-04.
- In the workshop, tests come first and are never edited to make code pass (`HARNESS.md`, rule 5).

## 7. Public API and versioning

- **Public API freeze** (`CONTRIBUTING.md` § Versioning and API stability, `src/Directory.Build.props`):
  `Microsoft.CodeAnalysis.PublicApiAnalyzers`, `PublicAPI.Shipped.txt` (released surface) and
  `PublicAPI.Unshipped.txt` (additions since); RS0016 and RS0017 are errors; RS0026, RS0027, RS0041 are
  off. Executables opt out with `<OrkeonFreezePublicApi>false</OrkeonFreezePublicApi>` — in the harness the
  plugin, runner and host templates do, the tool template keeps the freeze (`update-public-api.sh`
  rewrites `Unshipped` without an IDE).
- **Breaking change** = editing or removing a line of `Shipped`: major version (a minor before 1.0), a
  `*REMOVED*` entry, a CHANGELOG line; nothing public is removed without one minor of `[Obsolete]` naming
  the replacement.
- **SemVer 2.0**; **CHANGELOG** in the Keep a Changelog 1.1.0 format; at release `Unshipped` moves to
  `Shipped`. 1.0.0-rc.6 froze the surface so (2dd1f73, #231): the 2 618 additions and 3 672 removals since
  rc.5 moved to `PublicAPI.Shipped.txt`, and `ORKCON001` to `AnalyzerReleases.Shipped.md` under `## Release 1.0.0`. rc.7 and
  1.0.0 then cut that surface once more without an `[Obsolete]` step ("the product was never deployed": renames, removed
  shims, plumbing made internal — `orkeon/csharp-crews.md` § 5, `orkeon/csharp-tools.md` § 2). **From 1.0.0** every member
  of the `PublicAPI.Shipped.txt` files of the published packages is the 1.x commitment (`docs/reference/stability.md`): a
  removal or a signature change waits for 2.0, the `[Experimental]` APIs (ORKEXP001–007) stay outside it, and a member
  whose signature carries a Jint, TreeSitter.DotNet or Terminal.Gui type follows that library's major version. 1.1.0
  and 1.2.0 are minors that add members, each with a few changes marked **[breaking]** on purpose, listed at the top of
  their CHANGELOG section.
- **ADRs** in `docs/adr/` (ADR-002 to ADR-018 at 1.2.0 — ADR-012 is the e-mail family, ADR-013 the drive family,
  ADR-014 shell confinement by default, ADR-015 model provider categories and decision stages, ADR-016 decision
  tasks, ADR-017 the transcript display model, ADR-018 the graph engines' shared topology and the YAML `graph:` block; ADR-010 is amended at a2bb6c3:
  Context, Decision, Consequences…), a model of form for the workshop's `DEC-000n`. Commit messages are in English and
  follow the history's `type(scope): summary` shape (`feat`, `fix`, `docs`, `test`, `chore`…; main's
  `CONTRIBUTING.md`).

## 8. Repository rules that stay in the repository

Bilingual EN/FR documentation (`scripts/check-docs-parity.sh`), the CLA, SonarQube, `check-doc-claims.py`,
the third-party notices regenerated after any package change (`scripts/third-party-notices.py`, checked in
CI), the metered-network rules of `CLAUDE.md` (`--no-restore`, `--no-build`…), the frozen functional scope
(no new built-in tool: custom tools are plugins or scripts — which is the harness's model anyway).

## 9. Where the harness differs, adds or disagrees

| Point | Orkeon | Harness |
|---|---|---|
| Warnings as errors | CI flag `-warnaserror` | `TreatWarningsAsErrors=true` in the props |
| Package sources | nuget.org; project references inside the repository | nuget.org + the local feed `/usr/local/share/orkeon/packages` for every `Orkeon.*` id (source mapping, D17); per-assembly packages (`Orkeon.Domain`, `Orkeon.Tools.Abstractions`…) |
| Runtime identifier | portable | the machine's RID, framework-dependent (`-p:OrkeonHarnessPortableBuild=true` to opt out) |
| NU1900 | warning | never an error; audit off with `ORKEON_HARNESS_OFFLINE=1` |
| Shared test doubles | project reference to `Orkeon.Tests.Shared` | copied, with the notice |

Disagreements to keep in mind (the code above wins):

1. The image's C# README and the templates' `Directory.Build.props` mention only the `/tests/` exemption of the
   VFS analyzer; `/examples/` is exempt too — so C# under `library/examples/` (which the rule's paths
   cover) is never VFS-checked: L0 there proves nothing about VFS compliance.
2. Orkeon's own `CLAUDE.md` showed, up to ce9ec1f, a typed tool whose request omitted `[FieldSchema]`, which
   gives the model an empty schema; since acd59d6 the example is gone (still at 1.2.0) and `CLAUDE.md` only points to
   `docs/tools/new-tool-pattern.md`, which states the rule except the consecutive capitals and the
   response-side filter (`orkeon/csharp-tools.md` § 3 and § 5).
