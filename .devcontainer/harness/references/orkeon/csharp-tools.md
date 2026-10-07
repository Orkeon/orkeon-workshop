# Writing an Orkeon tool in C#

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at 77ac8a9 (2026-10-07, after 1.0.0-rc.4).
> Sources: in the Orkeon repository at that commit — `src/tools/Orkeon.Tools.Abstractions/Base/`
> (`ToolBase.cs`, `ToolBaseGeneric.cs`, `ToolParameterValidator.cs`), `src/core/Orkeon.Domain/Tools/`
> (`ToolSchemaGenerator.cs`, `IBaseTool.cs`, `IToolRegistry.cs`, `ToolAccess.cs`),
> `src/core/Orkeon.Domain/Attributes/` (`FieldSchemaAttribute.cs`, `ReturnSchemaAttribute.cs`,
> `ToolContractAttribute.cs`), `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Infrastructure/Serialization/JsonComponentSerializer.cs`,
> `src/core/Orkeon.Infrastructure/LLMs/ToolCalling/OpenAIToolSchemaFormatter.cs`,
> `src/core/Orkeon.Infrastructure/Tools/ToolRegistry.cs`, `src/core/Orkeon.Infrastructure/Security/ToolResultSanitizer.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`,
> `src/core/Orkeon.Application/Services/Security/ToolInvocationPipeline.cs`, `src/core/Orkeon.Application/Crew/Execution/`
> (`ChatToolDispatcher.cs`, `ToolCallFormatting.cs`, `AgentPromptComposer.cs`), `src/core/Orkeon.Domain/FileSystem/IFileSystemService.cs`,
> `src/analyzers/Orkeon.Compliance.Vfs/`, `src/tools/Orkeon.Tools.Email/Dtos/`, `docs/tools/new-tool-pattern.md`,
> `docs/architecture/security.md`, `docs/reference/limitations.md`, `CHANGELOG.md` (`[Unreleased]`). Harness: the image's C# README
> (`/usr/local/share/orkeon-harness/csharp/README.md`, not `references/csharp/README.md`), the templates
> `OrkeonTool/`, `OrkeonPlugin/`, `OrkeonRunner/` (in the image under `/usr/local/share/orkeon-harness/csharp/`),
> `.claude/harness/VERIFICATIONS.md` (V-04, V-06, V-07).

A whole team in C#: `orkeon/csharp-crews.md`; the conventions the build enforces:
`csharp/orkeon-guidelines.md`; C# or not: `design/tools-selection.md`. **§ 3 is what most often goes wrong.**

## 1. Start from the template

```bash
/usr/local/share/orkeon-harness/csharp/OrkeonTool/new-tool.sh InvoiceParser invoice_parser /workspace/library/tools/csharp
cd /workspace/library/tools/csharp/InvoiceParser
dotnet build -c Release && dotnet test
```

`new-tool.sh <ToolName> <tool_name> [<destination>]` copies the template and replaces its two placeholders
(PascalCase prefix, snake_case agent-visible name): `src/<Name>/Domain/` (pure logic, no Orkeon type),
`src/<Name>/Tool/` (records and tool class), `tests/<Name>.Tests/`. Layout, build rules, packages and the
offline restore: the template's `README.md` and the image's C# README. A tool keeps its own `workbook/` and
tests (`library/tools/csharp/README.md`).

## 2. The contract

```
IBaseTool (Orkeon.Domain.Tools)      Name, Description, Schema, Access, CallAsync, ExecuteAsync, ValidateInput
└─ ToolBase                          reads [ToolContract], validates, fault barrier, IDisposable
   ├─ ToolBase<TRequest,TResponse>   schema generated from TRequest, sealed typed pipeline
   ├─ FileToolBase                   + required IFileSystemService, optional IPathValidator, ResolveVirtualPath(...)
   │  └─ FileToolBase<,>             its own copy of the typed pipeline
   └─ HttpToolBase                   + ValidateUrlAsync (IUrlValidator, else a fail-closed SSRF guard)
      └─ HttpToolBase<,>             its own copy of the typed pipeline
```

The `ITool` marker of 24ab0d0 (`Orkeon.Domain.Common`) is deleted at a2bb6c3, with no shim: code that names
it no longer compiles.

`FileToolBase<,>` and `HttpToolBase<,>` do not derive from `ToolBase<,>`: they carry their own typed
pipeline, which differs in one place — an exception in `ExecuteTypedAsync` reaches the model as its bare
message (§ 4).

| Member | Where it comes from | Rule |
|---|---|---|
| `Name` | an override, else `[ToolContract("x")]` (`UniqueName`, mandatory: `Name = …` is only a display name), else, without the attribute, the class name | snake_case, `^[a-zA-Z0-9_-]+$` (OpenAI function names); unique, ignoring case, among the built-ins (`orkeon run --list-tools`) and the plugin tools — two DI tools with one name fail the run when `ToolRegistry` is built, naming both types; an MCP tool or a script tool of the same name is refused and the registered one kept |
| `Description` | `[ToolContract(Description = …)]` or an override | with the argument descriptions, the only text the model reads about the tool: what it does, which virtual roots, its limits |
| `Access` | override: `ToolAccess.Read`, `Edit`, `Execute` (default `Unspecified`, classified fail-closed) | read by the opt-in per-call permission gate (`ModePermissionGate`); declare it truthfully anyway |
| `Category` | `[ToolContract(Category = …)]`, default `General`; `FileToolBase` always reports `File Operations`, `HttpToolBase` falls back to `Web Operations` | catalogues and listings; never sent to the model |
| `ExecuteTypedAsync(TRequest, CancellationToken)` | you | the logic; `ConfigureAwait(false)` on every await |
| `ValidateTypedRequest(TRequest)` | optional override | return an error message (failed call) or `null` |
| `Schema` | generated (§ 3) | overridable; do not, unless you build the whole `ToolSchema` yourself |

**Any registered `IBaseTool` is attachable.** `CrewFactory.ResolveToolsAsync` keeps every tool the
registry returns for a name, for an agent's `tools:` and a task's alike; `WithTool` takes an `IBaseTool`.
Under `StrictTools` (`Orkeon:CrewFactory:StrictTools`: `true` in `RunnerHost` — `orkeon run`,
`orkeon-harness-run` — and in the harness host; lenient in the library) a name the registry does not hold
fails the load with `Crew configuration references unknown tool(s): x. Available tools: …`; lenient, it is
dropped with a warning. Derive from `ToolBase<TRequest, TResponse>` anyway (V-07): the schema, the
validation and the fault barrier of §§ 3–5 come from it.

A minimal tool (XML documentation omitted here; the build requires it — the template has the full,
compiling version):

```csharp
using Microsoft.Extensions.Logging;
using Orkeon.Domain.Attributes;        // FieldSchema, ReturnSchema, ToolContract
using Orkeon.Domain.FileSystem;        // IFileSystemService, FileAccessDeniedException
using Orkeon.Domain.Tools;             // ToolAccess
using Orkeon.Tools.Abstractions.Base;  // ToolBase<TRequest, TResponse>

public sealed record InvoiceParserRequest
{
    [FieldSchema(Description = "Virtual path of the invoice text file, e.g. /inbox/2026-001.txt", IsRequired = true)]
    public string Path { get; init; } = "";

    [FieldSchema(Description = "Currency of the amounts (default: EUR)", IsRequired = false, Default = "EUR", Enum = new[] { "EUR", "USD" })]
    public string Currency { get; init; } = "EUR";
}

public sealed record InvoiceParserResponse
{
    public bool Success { get; init; }
    public string? Number { get; init; }
    public int LineCount { get; init; }
    public string? Error { get; init; }
}

[ToolContract("invoice_parser", Description = "Parse an invoice text file under a virtual root and return its number and line count.", Category = "Finance")]
public sealed class InvoiceParserTool : ToolBase<InvoiceParserRequest, InvoiceParserResponse>
{
    private readonly IFileSystemService _fileSystem;   // required, non-nullable (ORKVFS007)

    public InvoiceParserTool(IFileSystemService fileSystem, ILogger<InvoiceParserTool>? logger = null) : base(logger)
    {
        ArgumentNullException.ThrowIfNull(fileSystem);
        _fileSystem = fileSystem;
    }

    public override ToolAccess Access => ToolAccess.Read;

    protected override string? ValidateTypedRequest(InvoiceParserRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return request.Path.StartsWith('/') ? null : $"path must be a virtual path starting with '/', got '{request.Path}'";
    }

    protected override async Task<InvoiceParserResponse> ExecuteTypedAsync(InvoiceParserRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);   // CA1062
        var text = await _fileSystem.TryReadAllTextAsync(request.Path, cancellationToken).ConfigureAwait(false);
        if (text is null)
            return new InvoiceParserResponse { Success = false, Error = $"File not found: {request.Path}" };
        var invoice = InvoiceText.Parse(text, request.Currency);   // Domain/: pure, tested without Orkeon
        return new InvoiceParserResponse { Success = true, Number = invoice.Number, LineCount = invoice.Lines.Count };
    }
}
```

The class is `partial` only when it declares `[LoggerMessage]` methods (the template does). The template
also catches `FileAccessDeniedException` (§ 6) and returns it as an error the model can read.

## 3. How the arguments reach the model — the rule

The parameter schema is built **at run time, by reflection**: `ToolBase<TRequest, TResponse>.Schema` calls
`ToolSchemaGenerator.GenerateSchema<TRequest>(Name, Description)` (cached per type). No source generator is
involved (`Orkeon.Generators` only generates `[TypedDictionary]` plumbing). `BuildSchema` walks the public
instance properties of `TRequest` and **skips every property without `[FieldSchema]`**. The provider
formatter (`OpenAIToolSchemaFormatter`, `AnthropicToolSchemaFormatter`) turns the result into
`tools[].function.parameters` — `tools[].input_schema` for Anthropic — (`type: object`, `properties`,
`required`), and the agent's system prompt
repeats the names (`AgentPromptComposer`: `Required: …` / `Optional: …`).

What a C# tool must do for its arguments to reach the model:

1. **Put `[FieldSchema(Description = …)]` on every property of `TRequest` the model must fill.** A property
   without it is invisible: the model is never told it exists (it is still deserialized if sent under its
   wire name).
2. **The wire name is the snake_case of the C# property name**, computed by `ToolSchemaGenerator.ToSnakeCase`
   (an underscore before every capital): `MaxLength` → `max_length`. The arguments are read back by
   `JsonComponentSerializer` (`JsonNamingPolicy.SnakeCaseLower`, case-insensitive). Both agree only when
   each capital starts a word: write `CustomerId`, `MaxRpm`, never `CustomerID`, `MaxRPM` — announced
   `max_r_p_m`, read as `max_rpm`, the value is silently lost.
3. **`[JsonPropertyName]` is ignored by the schema and obeyed by the deserializer.** Omit it, or give it
   exactly the snake_case name. `[JsonPropertyName("query_text")] string Query` is announced as `query` and
   read from `query_text`: the model's value never arrives.
4. **Required is explicit or inferred.** `IsRequired` wins; otherwise a non-nullable value type (`bool`,
   `int`) or non-nullable reference type is **required**. Set `IsRequired = false` on every optional
   argument, or the model must send it and a call without it fails with `Required parameter 'x' is
   missing` (the probe's `bool Strict = true` below; at 1.0.0-rc.4, `email_parser`'s two flags).
5. **Keep arguments flat**: string, bool, integer, number, enum, arrays of those. A nested record is sent
   as `{"type": "object"}` without properties, a `List<Record>` as `items: {"type": "object"}` (like
   `xlsx_writer.sheets`): the model learns the inner fields from the description only.
6. **`TRequest` satisfies `class, new()`**: a `sealed record` or class with `init` properties and a public
   parameterless constructor — no positional record, no `required` member (a type with required members
   cannot meet a `new()` constraint).
7. Sent per argument: `type`, `description` (else the property name), `default` (`Default`), `enum`
   (`Enum`, or the member names of a C# enum), `format`, `items.type`. `Example` is not sent.

| C# property type | `type` sent | Notes |
|---|---|---|
| `string` | `string` | |
| `bool` | `boolean` | required unless `IsRequired = false` |
| `int`, `long`, `short`, `byte`, unsigned | `integer` | `format` `int32` / `int64` |
| `double`, `float` | `number` | |
| `decimal`, `DateTime(Offset)`, `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid`, `Uri` | `string` | `format` `date-time`, `uuid`, `uri`… |
| C# `enum` | `string` | `enum` lists the member names |
| array, `List<T>`, `IReadOnlyList<T>`, any `IEnumerable<T>` | `array` | `items.type` from `T`, or `ItemsType` |
| `Dictionary<,>`, any other class or record | `object` | no properties |

**Why 17 built-ins reach the model with an empty schema although they take arguments**
(`orkeon-reference.md` § 5, footnote ¹ — the same 17 at 77ac8a9 as at 1.0.0-rc.4; `index_codebase` lost
four of its properties): `memory_store`,
`session_store`, `session_snip` carry `[JsonPropertyName]` on their request properties but no `[FieldSchema]`;
14 of the 15 code-analysis request records carry neither (the fifteenth, `index_status`, takes no
argument). `file_read` and the 13 e-mail tools annotate every
argument (`src/tools/Orkeon.Tools.Email/Dtos/`). The tools still read an argument the model sends under its
wire name — checked on the 24ab0d0 binary: `memory_store` adds then lists an entry when it gets `operation`,
`category`, `content`; `index_codebase` answers `root_path is required` to `rootpath` and indexes with
`root_path`. So a task description that must use one names the snake_case of the property names.

**Docs and code.** At 77ac8a9, `docs/tools/new-tool-pattern.md` states rules 1, 3 and 4, the return rule of
§ 5 and "never a secret in the request" (§ 7), but still says the names are "the property names in snake_case
… both in the schema and in the deserializer" — not true for consecutive capitals (rule 2) — and misses the
response-side naming filter. Orkeon's
`CLAUDE.md` (§ "Tool Development (Typed Pipeline)") still shows a request record without `[FieldSchema]`:
followed literally, it gives an empty schema. The code wins.

**Verified** (2026-10-02): two probe tools loaded as a plugin by the 1.0.0-rc.4 `orkeon-harness-run`, a
one-task crew, a stub LLM recording the request and replaying scripted `tool_calls` (the method of V-04 and
V-06). At 77ac8a9, `ToolSchemaGenerator`, `ToolBaseGeneric.cs`, `JsonComponentSerializer` and the schema
formatters are unchanged; `ToolBase` lost `ITool`, and `ChatToolDispatcher` now calls the tool through
`IToolInvocationPipeline` (§ 4). The probe has not been re-run on a runner built from main.

| Probe request property | Schema sent | The stub sent | The tool received |
|---|---|---|---|
| `[JsonPropertyName("operation")] string Operation`, no `[FieldSchema]` | `properties: {}` | `operation: "add"` | `add` |
| `[FieldSchema] [JsonPropertyName("query_text")] string Query` | `query`, required | `query: "hello"` | `""` |
| `[FieldSchema(IsRequired = false)] int? MaxRPM` | `max_r_p_m` | `max_r_p_m: 7` | `null` |
| `[FieldSchema] bool Strict = true` | `strict`, **required** | `strict: false` | `false` |
| `[FieldSchema(IsRequired = false)] int? MaxItems` | `max_items` | `max_items: 3` | `3` |
| `string Hidden`, no attribute | absent | `hidden: "seen"` | `seen` |

**The harness template follows the rule.** `SampleExtractorRequest` annotates both properties —
`Path` (`IsRequired = true`) and `Keys` (`IsRequired = false`, `ItemsType = "string"`) — with simple names
and no `[JsonPropertyName]`; the same probe run recorded `path` (string, required) and `keys` (array of
string, optional). Its tests do not pin the schema: give every tool the schema test of § 8.

## 4. At call time

Every call of an agent loop goes through `IToolInvocationPipeline` (a2bb6c3): the Guardian's tool phase
first — path traversal, SSRF targets, SQL injection outside the `*_query` tools; a blocked call never
reaches the tool and the model reads `Error: Blocked by Guardian (…): <reason>` —, then `CallAsync` →
validation against the schema (`ToolParameterValidator`: required present, JSON type — an `integer`
accepts any whole number, `20.0` included — enum) → `Default` injected for missing
optional arguments → keys snake-cased, values coerced (`"true"`, `"42"`
accepted) and deserialized into `TRequest` → `ValidateTypedRequest` → `ExecuteTypedAsync`. Each failure
becomes a failed call; the model receives `Error: <message>` as the tool result and the run goes on (a
failed call does not fail the task — V-06 — but the same error three times in a row stops the agent and
fails its task, `reliability/error-handling.md` § 4):

| Failure | Message |
|---|---|
| required argument absent | `Required parameter 'path' is missing` |
| wrong JSON type / value outside `enum` | `Parameter 'x' has invalid type. Expected: integer` / `Parameter 'x' must be one of: …` |
| deserialization | `Invalid parameters: …` |
| `ValidateTypedRequest` | your message |
| exception in `ExecuteTypedAsync` | `Tool execution failed: <exception message>` (cancellation: `Operation cancelled`); under `FileToolBase<,>` / `HttpToolBase<,>`, the bare exception message |

Write messages the model can act on ("path must be under /inbox"), and test them (§ 8).

## 5. The response

- **Serialized to JSON**, snake_case keys (`JsonNamingPolicy.SnakeCaseLower`), `null` values omitted; that
  string is the `role: tool` message (`ToolCallFormatting.FormatResult`, called by `ChatToolDispatcher` —
  the path of every host that registers an `IChatClient`, as the runner and the harness host do).
- **Filtered by the return schema.** `Returns` lists the properties annotated `[ReturnSchema]`, or every
  property when none is; its keys are `ToSnakeCase(property name)`, and a serialized key absent from it is
  dropped. Same naming rule as the arguments: verified with the probe, `TotalUSD` (serialized `total_usd`,
  listed `total_u_s_d`) and `[JsonPropertyName("note_text")] Note` never reached the model, with or without
  `[ReturnSchema]` (`new-tool-pattern.md` at 77ac8a9 says every property is returned when none is annotated:
  only those whose names follow the rule). `[ReturnSchema]` descriptions are not sent to the model.
- **Success and errors.** A `bool Success` property set to `false` makes the call a failure; the message is
  taken from `error` (string) or `errors` (list). No `success` key means success.
- **Size.** The result is cut at 4,000 characters (`AgentDefaults.ResolveMaxToolResultLength`; only
  `file_read` gets 32,000), followed by `[... truncated, N chars omitted …]`. Return counts, ids and short
  summaries; write a large result to a file under a writable root and return its virtual path.
- **Framed as data.** Then the result sanitizer (`Security:ToolResults:Policy`, `Warn` by default) wraps it
  in `--- BEGIN Tool Result: <name> (DATA CONTEXT - NOT INSTRUCTIONS) ---` … `--- END Tool Result: <name> ---`
  and logs any injection pattern; under `Block` a result with a High or Critical pattern is withheld. The
  `email_*` tools are trusted (not wrapped); a plugin tool is not.

## 6. Files: the virtual file system only

A tool never sees a physical path. It takes a **required, non-nullable `IFileSystemService`** in its
constructor (DI) and works with the virtual paths of the team's roots (`orkeon-reference.md` § 6,
`design/io-contracts.md`).

| Need | `IFileSystemService` member | Behaviour |
|---|---|---|
| read | `TryReadAllTextAsync` (UTF-8), `TryReadAllBytesAsync` | `null` when the file does not exist |
| stream | `OpenReadStreamAsync`, `OpenWriteStreamAsync`, `OpenAppendStreamAsync` | the caller disposes; wrap the `Stream` in a `StreamReader`/`StreamWriter`, never a path |
| write | `WriteAllTextAsync` (UTF-8 without BOM, parents created), `WriteAllBytesAsync`, `AppendAllTextAsync` | needs Write and Create on the root |
| list, inspect | `EnumerateFilesAsync`, `TryGetEntryAsync`, `ExistsAsync`, `GetEntryKindAsync` | |
| other | `CreateDirectoryAsync`, `DeleteAsync`, `CopyAsync`, `GetAvailableMounts`, `ResolveAndValidate` | rights `Read`, `Write`, `Create`, `Delete` |

A path outside every mount, or without the right, throws `FileAccessDeniedException`
(`Orkeon.Domain.FileSystem`) — except `ExistsAsync` (false) and `TryGetEntryAsync` (`null`), which never
throw: catch it and return an error the model understands, as the template does.
Rights come from the mount: `ro` grants Read, `rw` Read, Write, Create and Delete, `rwnd` all but Delete
(`docs/architecture/vfs-compliance.md` § Mounts, rights and visibility).

The `Orkeon.Compliance.Vfs` analyzer, referenced by every template project, makes the bypasses build
errors: `ORKVFS001` `File.*`, `002` `Directory.*`, `003` `new FileStream/FileInfo/DirectoryInfo(<string>)`,
`004` `Path.GetFullPath`, `005` `new FileSystemWatcher`, `006` `new StreamReader/StreamWriter(<string>)`,
`007` a nullable `IFileSystemService?` field or parameter. A tool has no legitimate exception; the
attribute `[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: …")]` exists for host bootstrap code (rules,
exemptions and the compiler pin: `csharp/orkeon-guidelines.md` § 5).

## 7. Secrets, side effects, network

- **Never a secret as an argument**: the model writes the arguments and reads them back. Resolve a key at
  execution time from configuration or `ISecretProvider` (`Orkeon.Application.Interfaces.Security`; that
  is how `web_search` gets `TAVILY_API_KEY` and, since a2bb6c3, `image_generation` gets `OPENAI_API_KEY` —
  `docs/tools/new-tool-pattern.md` § "Never a secret in the request"); keys come from `ORKEON_*` variables,
  never from a file of the team (`reliability/security.md`).
- **Declare the side effects**: `Access`, and the contract in the tool's `README.md` — input, output, side
  effects, virtual paths touched (`library/tools/csharp/README.md`). A tool that writes is idempotent on
  the same input (`INV-IDEMP`, `INV-RESUME` in `testing/invariants-catalog.md`).
- **Outbound HTTP**: derive from `HttpToolBase<,>` (SSRF guard, header sanitizer —
  `docs/tools/new-tool-pattern.md` § 4); the container firewall must allow the host.
- **Mail**: use main's e-mail family (`email_*`, `Orkeon:Tools:Email`, fail-closed `Send:AllowedRecipients`,
  ADR-012; `orkeon-reference.md` § 5), not a custom SMTP tool. It is also a model for a tool with side
  effects: rights per account, secrets as variable names, results sized for the cap, untrusted content flagged.

## 8. Testing

| Level | For a tool |
|---|---|
| L0 | `dotnet build -c Release`: every analyzer, VFS included, public API, zero warning |
| L1 | the project's tests: xUnit v3 on Microsoft.Testing.Platform, hand-written doubles (`csharp/orkeon-guidelines.md` § 6) |
| L2 | the tool called by a one-task crew under the simulated LLM (`testing/test-levels.md` § 4) |

The template's tool tests show the pattern: set the component serializer once
(`ComponentBase.TrySetDefaultSerializer(JsonComponentSerializer.Instance)`, from `Orkeon.Infrastructure`,
which the test project references), mount an in-memory `FakeFileSystemService`, call `CallAsync` with the
snake_case keys the model would send, `using var tool = …` (`ToolBase` is `IDisposable`; CA2000 is an
error in tests), pass `TestContext.Current.CancellationToken` (xUnit1051). Every tool also gets:

```csharp
[Fact]
public void Schema_ShowsEveryArgumentToTheModel()
{
    using var tool = new SampleExtractorTool(Workspace());

    var parameters = tool.Schema.Parameters;   // what the formatter turns into tools[].function.parameters

    Assert.Equal(2, parameters.Count);
    Assert.True(parameters["path"].Required);
    Assert.Equal("string", parameters["path"].Type);
    Assert.False(parameters["keys"].Required);
    Assert.Equal("array", parameters["keys"].Type);
}
```

plus: name and access (the template has it); a `CallAsync` round trip with each argument under its
wire name; each error message of § 4; a path outside every mount and a write to a read-only root refused.
For L2 through a plugin, `OrkeonRunner/smoke/plugin-smoke.sh` drives a crew naming the template tool with the
echo provider; a scripted stub (V-04) proves the call with exact arguments and returns the tool's JSON result.

```bash
dotnet build -c Release && dotnet test
dotnet test --filter "Category!=Integration&Category!=Slow"   # the fast run
```

## 9. Putting the tool in front of a team

Two routes, detailed in the image's C# README § "Exposing a C# tool to a team" (decision D6):

| | Plugin + `orkeon-harness-run` | C# host |
|---|---|---|
| Team | YAML or declarative `.ork.ts`, lists the tool by name | a host from `OrkeonCrewHost/` (`orkeon/csharp-crews.md`) |
| Delivery | a plugin project (`OrkeonPlugin/`) referencing the tool; its DLL and `.deps.json` in `<plugins>/X.dll` or `<plugins>/X/X.dll` — a plugin that references a separate tool project ships that DLL too, in the folder layout | project reference; `services.AddSingleton<IBaseTool, InvoiceParserTool>()` in `TeamTools.cs` (the default `ToolRegistry` reads it) |
| Run | `orkeon-harness-run crew --plugins <dir>` from the team folder | `./run.sh` (`dotnet run`) |
| Studio | no — it starts the stock `orkeon`, which loads no plugin and refuses the crew (`unknown tool(s)`) | no |

- **Register one `AddSingleton<IBaseTool, T>()` per tool** (or `TryAddEnumerable`, as Orkeon's e-mail family
  does), never `TryAddSingleton<IBaseTool, T>()`: TryAdd keys on the service type, so only the first tool
  would survive.
- **A plugin** is a public `IOrkeonPlugin` class (`Name`, `Version`, `ConfigureServices`) with a parameterless
  constructor; it references `Orkeon.*` and `Microsoft.Extensions.*` with `ExcludeAssets="runtime"` and
  sets `EnableDynamicLoading` — copy the template rather than writing it. Plugins come from `--plugins`,
  `ORKEON_HARNESS_PLUGINS` or a read-only mount providing `/plugins` (a writable `/plugins` point is refused:
  its agents could drop code that the next run executes); without `--mount` the runner reads the team's
  `mounts.json` (and honours `TEAM_ENV`).
- **Launchers**: `orkeon-bench scaffold` writes launchers that call `orkeon run` today; a team that uses a
  plugin tool is run with `orkeon-harness-run` by hand until its launchers and bench support land (lot 8,
  plan § 8.2).

```bash
orkeon-harness-run --list-tools --plugins /workspace/library/plugins | grep invoice_parser
cd /workspace/teams/<slug> && orkeon-harness-run crew --plugins /workspace/library/plugins --validate
```

## 10. Before calling a tool done

- [ ] Flat arguments, each with `[FieldSchema(Description = …)]`, optional ones `IsRequired = false`; one
      capital per word in property names (in `TResponse` too); no `[JsonPropertyName]`, or the snake_case name.
- [ ] `Description` says what, where (virtual roots) and the limits; errors are actionable.
- [ ] All I/O through `IFileSystemService`; `FileAccessDeniedException` handled; no secret argument.
- [ ] The result stays well under 4,000 characters, or goes to a file. Tests: name and access, schema,
      wire-name round trip, error paths, mount boundaries; L0 and L1 green.
- [ ] Exposed by one route, checked with `--list-tools` and `--validate` (plugin) or the host's
      startup tests (`orkeon/csharp-crews.md`).
