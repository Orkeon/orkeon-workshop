---
name: orkeon-tool-csharp
description: "Creates an Orkeon tool in C# in library/tools/csharp/<Name>/: framing (contract, determinism, side effects, virtual paths), the solution from the image's OrkeonTool template (a ToolBase<TRequest, TResponse> with [ToolContract] and [FieldSchema], pure logic under Domain/), its unit-test project written first, `dotnet build` with the analysers and `dotnet test`, then how a team reaches it — compiled into a C# host, or a plugin run by orkeon-harness-run. Use it when a team needs deterministic work, I/O or .NET integration that a built-in or a TypeScript tool cannot do, when TEAM.md's Tools names a C# tool, and when /team-build drives a batch that builds one."
argument-hint: "<ToolName> <tool_name> [--team <slug>] [need]"
---

# /orkeon-tool-csharp — an Orkeon tool in C#, tested, in front of a team

You frame, test, then write one C# tool as a .NET solution of its own, and put it in front of the
team that needs it. You work autonomously: a missing detail gets a sensible default, flagged in your
report.

Arguments: $ARGUMENTS

## Contract

- Inputs: `<ToolName>` (PascalCase: project, namespace, class prefix) and `<tool_name>` (snake_case:
  the name a crew lists); the need, or the row of `TEAM.md § Design § Tools` and the batch sheet
  when `/team-build` drives it. `--team <slug>`: the team that will call it.
- Output: `library/tools/csharp/<ToolName>/` (§ 3), `dotnet build -c Release` with zero warning and
  `dotnet test` green, the route of § 5 wired and checked; the report of § 6.
- C# only when it earns its place (`references/design/tools-selection.md`): a built-in, or a pure
  TypeScript tool of a `.ork.ts` team, comes first. Say so and stop when one fits.

## 1. Load the references — before any code

- `references/orkeon/csharp-tools.md` — the contract (§ 2), **how the arguments reach the model
  (§ 3, what most often goes wrong)**, call time, the response, the VFS, secrets, tests, the two
  routes (§ 9) and the checklist (§ 10);
- `references/csharp/orkeon-guidelines.md` and `.claude/rules/orkeon-csharp.md` — the build rules
  (`-warnaserror`, the full analyser set, `PublicAPI.*.txt`, file-scoped namespaces, XML
  documentation, `ConfigureAwait(false)`, hand-written doubles);
- `references/orkeon/orkeon-reference.md` § 5 — the built-in catalogue: the name must be none of
  them (`orkeon run --list-tools` on the installed CLI says the same).

## 2. Frame the tool

Write the contract before any code, in `library/tools/csharp/<ToolName>/README.md` (and the tool's
`workbook/NEED.md` when it follows the reduced process of `library/tools/csharp/README.md`):

- **what** it does in one sentence (the `Description` the model reads), and its limits;
- the **request**: flat arguments, each with its description, required or optional with its default
  and its allowed values; no secret among them (a key is read from an environment variable named in
  the settings);
- the **response**: a record well under 4,000 characters, or a file written under a writable root;
  the error messages the model must be able to act on;
- **determinism and side effects**: pure (the default), or which files it reads and writes —
  virtual paths only, through `IFileSystemService`; network only through `HttpToolBase` and the
  team's firewall rules;
- `Access`: `Read`, `Edit` or `Execute`, declared truthfully.

## 3. Generate the solution

`$CS` is `/usr/local/share/orkeon-harness/csharp` in the image (`.devcontainer/csharp` in a checkout
of the workshop's repository). From the workshop root:

```bash
$CS/OrkeonTool/new-tool.sh <ToolName> <tool_name> library/tools/csharp
```

```
library/tools/csharp/<ToolName>/
├── <ToolName>.sln, Directory.*.props, global.json, nuget.config, .editorconfig, THIRD-PARTY.md
├── src/<ToolName>/Domain/       pure logic, no Orkeon type — replace the sample KeyValueExtractor
├── src/<ToolName>/Tool/         <ToolName>Contracts.cs (request, response), <ToolName>Tool.cs
├── src/<ToolName>/PublicAPI.Shipped.txt, PublicAPI.Unshipped.txt
├── tests/<ToolName>.Tests/      Domain/, Tool/, Doubles/FakeFileSystemService.cs
└── update-public-api.sh         refreshes PublicAPI.Unshipped.txt from RS0016/RS0017
```

It refuses an existing folder: a tool is changed in place, not generated again.

## 4. Tests first, then the code

1. **Red.** Replace the sample's tests by the tool's, in `tests/<ToolName>.Tests/`: the domain rules
   (`Domain/`), then the tool (`Tool/`) — name and access; the schema shows every argument with its
   type and whether it is required (`csharp-tools.md` § 8, `Schema_ShowsEveryArgumentToTheModel`); a
   `CallAsync` round trip with each argument under its snake_case wire name; each error message; a
   path outside every mount and a write to a read-only root refused. Under `/team-build` the tests
   come from `team-test-author` and are not yours to change. `dotnet test`: red for the right reason.
2. **Green.** `Domain/` (pure), the request and response records (`[FieldSchema(Description = …)]`
   on every argument), the `ToolBase<TRequest, TResponse>` class with
   `[ToolContract("<tool_name>", Description = …, Category = …)]`, I/O through `IFileSystemService`
   (`FileToolBase<,>` when the tool resolves paths), `FileAccessDeniedException` turned into an
   error the model reads. Then `./update-public-api.sh` and review its diff.
3. **Check.**

   ```bash
   cd library/tools/csharp/<ToolName> && dotnet build -c Release && dotnet test   # zero warning: analysers, VFS, public API
   ```

## 5. Put it in front of the team

One route per team (`csharp-tools.md` § 9, decision D6):

- **Compiled into a C# host** — the team is a host (`/orkeon-crew-csharp`). A new host:
  `--tool <ToolName>` there. An existing one: in `teams/<slug>/host/`, a `ProjectReference` to
  `library/tools/csharp/<ToolName>/src/<ToolName>/<ToolName>.csproj` in `src/<Team>.Host/<Team>.Host.csproj`,
  `services.AddSingleton<IBaseTool, <ToolName>Tool>()` in `Composition/TeamTools.cs` (one line per
  tool, `AddSingleton`, not `TryAddSingleton`), `dotnet sln add` the project, the tool name in the
  startup tests; then `dotnet build`, `dotnet test`, `./run.sh --validate` (`tools resolved=` counts it).
- **A plugin** — the team stays YAML (or a declarative `.ork.ts`) and lists `<tool_name>`. Copy
  `$CS/OrkeonPlugin/` to `library/tools/csharp/<ToolName>/plugin/` and follow its `README.md`: rename
  `SampleExtractor.Plugin`, reference the tool project instead of the sample sources, build, drop the
  plugin DLL, its `.deps.json` and the tool DLL into `library/plugins/<ToolName>.Plugin/`, with the
  `plugin.json` manifest Orkeon requires there since 1.0.0 (`name` and `version` equal to the plugin's
  `Name` and `Version`, `orkeonVersion` such as `[1.0.0,2.0.0)`, `entryAssembly` the plugin DLL's file
  name, `tools` the tool names it registers): a folder without it is refused. Then
  `orkeon-harness-run --list-tools --plugins library/plugins` lists the name and, from the team
  folder, `orkeon-harness-run crew --plugins <workshop>/library/plugins --validate` loads the crew.
  The launchers `orkeon-bench scaffold` writes call `orkeon`, which loads no plugin: such a team runs
  through `orkeon-harness-run` by hand, and not from Studio.

## 6. Report

In the user's language, briefly: the folder and its tree; the contract (request, response, access,
side effects, virtual paths); the tests and the result of `dotnet build` and `dotnet test`; the route
chosen, what was wired and its check (`--validate` output); the defaults chosen; what is left (an L2
run of the team under the simulated LLM, `references/testing/test-levels.md` § 4). Under
`/team-build`, answer that skill's contract instead: the files written, the checks and their exit codes.
