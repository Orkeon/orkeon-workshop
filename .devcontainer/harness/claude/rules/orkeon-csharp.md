---
paths:
  - "library/tools/csharp/**"
  - "teams/*/crew/**/*.cs"
  - "teams/*/crew/**/*.csproj"
  - "library/examples/teams/*/crew/**/*.cs"
---

# Orkeon tools and crews in C#

First version, from the conventions of the Orkeon repository as the plan records them (§ 8). The
dated extract is `references/csharp/orkeon-guidelines.md` (lot 1); the templates under
`/usr/local/share/orkeon-harness/csharp/` are the working example. Orkeon `main` at ce9ec1f, .NET SDK
10. A team written in C# (a host): `references/orkeon/csharp-crews.md`.

## When C#

A tool that must do I/O, call a system, carry heavy logic or integrate with .NET is a **C# tool**
(the TypeScript of a team runs in Jint, without I/O). A team that needs `StateGraph`, checkpoint
stores or the built-in evaluation is a **C# crew** (`references/orkeon/csharp-crews.md` § 1).

## Build

- `-warnaserror` and the full analyzer set; `Directory.Build.props`, `Directory.Packages.props`
  (central package versions), `.editorconfig` and `global.json` come from the template — do not
  loosen them.
- nuget.org is the only remote source, with package source mapping. `Orkeon.Plugins` and
  `Orkeon.Hosting` come from the image's local feed, built from the Orkeon sources at the installed
  version; never mix that feed with the nuget.org umbrella package in one project.
- Every project references the `Orkeon.Compliance.Vfs` analyzer.

## Style

- File-scoped namespaces; `sealed record` with `init` for values and results; XML documentation on
  every public member.
- Guards: `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrWhiteSpace`.
- `ConfigureAwait(false)` on every await in library code; write `System.Threading.Tasks.Task` in full
  (it collides with the `Orkeon.Domain.Task` namespace).
- Logging through source-generated `[LoggerMessage]` methods in `partial` classes.
- Every warning suppression carries its justification.

## Architecture

- Domain has no external dependency; Application holds the ports; Infrastructure the adapters.
- Dependency injection through `AddOrkeonXxx()` extensions. Services use `TryAdd*`, so the first
  registration wins: a host replaces a default by registering its own before `AddOrkeonInfrastructure`.
  A tool registers with `AddSingleton<IBaseTool, T>()` (or `TryAddEnumerable`), never
  `TryAddSingleton<IBaseTool, T>()`, which keeps only the first tool (`references/orkeon/csharp-tools.md`).
- **All I/O goes through `IFileSystemService` and virtual paths.** `System.IO` is a compile error
  (VFS analyzer); the rare exception carries `[SuppressVfsCompliance("<why>")]`.

## A tool

- A `partial` class deriving from `ToolBase<TRequest, TResponse>`, annotated
  `[ToolContract("snake_case_name", Name = …, Description = …, Category = …)]`; `TRequest` and
  `TResponse` are records whose properties carry `[FieldSchema]` / `[ReturnSchema]`.
- Its name is its own: two tools registered in DI under one name — a plugin's or a host's against a
  built-in's included — stop the host at startup, the error naming both types.
- Layout: `Domain/` (pure logic, tested without Orkeon), `Tool/` (validation, mapping, I/O through
  `IFileSystemService`), `Tests/`.
- Exposure to a team: a **plugin** loaded by `orkeon-harness-run` (the shipped `orkeon` loads none —
  Studio on Windows will not see the tool), or a **C# host**. No MCP bridge, no executable called
  through `shell_command`.
- A tool meant to be shared from `library/` freezes its public API (`PublicAPI.Shipped.txt` /
  `PublicAPI.Unshipped.txt`) and keeps a CHANGELOG.

## Tests

Microsoft.Testing.Platform runner; hand-written doubles, never a mocking framework; a
`<Project>.Tests` project whose folders mirror the sources; `Integration` and `Slow` categories
stay out of the fast run. Tests are written before the tool (`team-test-author`), and are never
edited to make it pass.
