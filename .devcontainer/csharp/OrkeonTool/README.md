# SampleExtractor - an Orkeon tool in C#

Template of a C# tool for Orkeon agents, following the conventions of the Orkeon
repository (`docs/tools/new-tool-pattern.md`, built-in `HumanInputTool` as model). The
sample tool, `sample_extractor`, reads a text file through the virtual file system and
returns its `key: value` lines.

## Layout

```
SampleExtractor.sln
src/SampleExtractor/
  Domain/KeyValueExtractor.cs        pure logic: no I/O, no Orkeon type, tested alone
  Tool/SampleExtractorContracts.cs   request / response records ([FieldSchema], [ReturnSchema])
  Tool/SampleExtractorTool.cs        [ToolContract("sample_extractor")] partial class : ToolBase<,>
  PublicAPI.Shipped.txt              frozen public surface (empty until the first release)
  PublicAPI.Unshipped.txt            additions since the last release
tests/SampleExtractor.Tests/
  Domain/                            domain tests
  Tool/                              tool tests through the real pipeline (CallAsync)
  Doubles/FakeFileSystemService.cs   in-memory IFileSystemService, copied from the Orkeon repository
```

The split is the Clean Architecture one applied to a tool: `Domain/` holds the rule,
`Tool/` holds validation, mapping and file access.

## Create your own tool

```bash
./new-tool.sh InvoiceParser invoice_parser /workspace/library/tools/csharp
cd /workspace/library/tools/csharp/InvoiceParser
dotnet build -c Release && dotnet test
```

`new-tool.sh <ToolName> <tool_name> [<destination>]` copies this template with the licence
notice of the files it takes from the Orkeon repository (`../THIRD-PARTY.md`), renames the
files and replaces the two placeholders: `SampleExtractor` (PascalCase: project, namespace,
class prefix) and `sample_extractor` (snake_case: the exact name a crew lists under
`tools:`). Then replace the domain sample with your logic, adapt the records and the
tests.

Doing it by hand: copy `../THIRD-PARTY.md` along, rename `SampleExtractor.sln`,
`src/SampleExtractor/`, `tests/SampleExtractor.Tests/` and the files that carry the name, then
replace both placeholders in every file (including `PublicAPI.Unshipped.txt`).

## Rules the build enforces

* **Zero warning**: the full analyzer set is on and every warning is an error.
* **VFS only**: `System.IO.File`, `Directory`, `FileStream`, `Path.GetFullPath`... are
  build errors (`ORKVFS001`-`007`). Take a required, non-nullable `IFileSystemService` in
  the constructor and work with virtual paths (`/workspace/...`, `/output/...`).
* **One name, one tool**: a tool registered under a name another tool already holds (a
  built-in included) is refused and the first one kept. Give it its own snake_case name.
* **Public API freeze**: adding or removing a public member without declaring it fails
  the build (`RS0016` / `RS0017`). Without an IDE, run `./update-public-api.sh` and review
  the diff of `PublicAPI.Unshipped.txt`.
* **XML documentation** on every public member of `src/`.
* **Tests**: xUnit v3 on Microsoft.Testing.Platform; doubles are written by hand.
  `dotnet test --filter "Category!=Integration&Category!=Slow"` is the fast run.

The build targets the machine's own runtime (see `Directory.Build.props`): the test
project references `Orkeon.Infrastructure`, and a portable build would copy about 670 MB of
native libraries for every platform into its output. Opt out with
`-p:OrkeonHarnessPortableBuild=true`.

Request and response property names reach the model in snake_case (`Path` -> `path`).
A response with `Success = false` and an `Error` becomes a failed tool call.

## Giving the tool to a team

* **Plugin** (YAML / TypeScript team): reference this project from a plugin project
  (template `OrkeonPlugin/`), drop the plugin DLL in a plugin folder and run the team with
  `orkeon-harness-run --plugins <folder>`.
* **C# host**: reference this project from the team's host (template `OrkeonCrewHost/`)
  and register it with `services.AddSingleton<IBaseTool, SampleExtractorTool>()`.

## Packages

`Orkeon.Domain`, `Orkeon.Tools.Abstractions` and the `Orkeon.Compliance.Vfs` analyzer come
from the local feed of the harness image (`nuget.config`). Outside the image, replace the
two `Orkeon.*` references by the public `Orkeon` package (`dotnet add package Orkeon
--prerelease`): same assemblies and namespaces. Behind the container firewall, set
`ORKEON_HARNESS_OFFLINE=1` (the image does) so that restore skips the vulnerability audit.
