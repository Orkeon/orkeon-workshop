# SampleExtractor.Plugin - an Orkeon plugin

Template of an `IOrkeonPlugin`: one assembly and its manifest `plugin.json`, which contribute the
`sample_extractor` tool to a host, so a YAML or TypeScript crew can list it under `tools:` without
the host being recompiled.

## What Orkeon does and does not do (rc.4 to 1.2.0)

No runner of a crew shipped with Orkeon (rc.4 to 1.2.0) activates plugins (`orkeon run` and `orkeon-host` never call
`AddOrkeonPlugins`; since 13461ea only `orkeon-repl`, the interactive console, loads a `Plugins` section). In the harness, the host that loads them is `orkeon-harness-run`
(template `OrkeonRunner/`).

## Layout

```
SampleExtractor.Plugin.sln
src/SampleExtractor.Plugin/
  SampleExtractorPlugin.cs           the entry point: Name, Version, ConfigureServices
  plugin.json                        the manifest Orkeon requires: name, version, orkeonVersion, entryAssembly, tools
  Domain/, Tool/                     the tool (same sources as the OrkeonTool template)
tests/SampleExtractor.Plugin.Tests/
  SampleExtractorPluginTests.cs      what ConfigureServices registers (one tool, by name)
  PluginLoadingTests.cs              the REAL loader over a drop folder; the manifest against the plugin class
  Hosting/PluginDirectoryPathValidator.cs   what a host must provide (see below)
  Doubles/FakeFileSystemService.cs          in-memory IFileSystemService, copied from the Orkeon repository
```

The template keeps the tool sources inside the plugin project so that the plugin is a
single DLL. A plugin that wraps an existing tool library references that project instead;
the library DLL then sits next to the plugin DLL in a folder-per-plugin layout.

## Build and drop

```bash
dotnet build -c Release && dotnet test
mkdir -p /workspace/library/plugins/SampleExtractor.Plugin
cp src/SampleExtractor.Plugin/bin/Release/net10.0/{SampleExtractor.Plugin.dll,SampleExtractor.Plugin.deps.json,plugin.json} \
   /workspace/library/plugins/SampleExtractor.Plugin/
```

One layout is recognized, at the first level of the plugin directory only: a sub-folder per plugin,
holding `plugin.json` and the entry assembly it names.

```
<plugins>/SampleExtractor.Plugin/plugin.json                  the manifest, read before the assembly is loaded
<plugins>/SampleExtractor.Plugin/SampleExtractor.Plugin.dll   the entry assembly (+ .deps.json, private dependencies)
```

Since Orkeon 1.0.0 an assembly lying flat in the plugin directory, or in a folder without
`plugin.json`, is refused, not skipped: with the default `Plugins:ContinueOnError=false` the host
does not start.

## The manifest

```json
{
  "name": "orkeon-harness.sample-extractor",
  "version": "0.1.0",
  "orkeonVersion": "[1.0.0,2.0.0)",
  "entryAssembly": "SampleExtractor.Plugin.dll",
  "tools": [ "sample_extractor" ]
}
```

`name` and `version` must equal `IOrkeonPlugin.Name` and `Version`; `entryAssembly` is a file name
of the plugin folder; `tools` lists the name of every `IBaseTool` the plugin registers - a tool it
does not declare is refused when the host builds it. `orkeonVersion` is a NuGet-style range the
running Orkeon must fall in, read from the version of the host's `Orkeon.Plugins` assembly; a
pre-release sorts below its release, so a range starting at `1.2.0` would refuse an Orkeon built
from the sources as `1.2.0-...`: start it at the release before. Keep the manifest in step with
the plugin class when either changes - `Manifest_NamesThePluginItsVersionItsAssemblyAndItsTool`
checks it. The project copies `plugin.json` next to the built assembly.

The output folder holds the plugin DLL, its `.deps.json` and `plugin.json`, and no `Orkeon.*` or
`Microsoft.Extensions.*` assembly: the project references them with
`ExcludeAssets="runtime"` because the loader unifies those with the host's copies.
Shipping a second `Orkeon.Plugins.dll` would break the type identity of `IOrkeonPlugin`.

## Use it from a crew

```yaml
# crew/agents/extractor.yaml
tools:
  - "sample_extractor"
```

```bash
orkeon-harness-run crew --plugins /workspace/library/plugins --list-tools | grep sample_extractor
orkeon-harness-run crew --plugins /workspace/library/plugins --validate
```

## Configuration keys (host side, section `Plugins`)

| Key | Default | Meaning |
|---|---|---|
| `Plugins:Directory` | `/plugins` | **Virtual** path of the plugin directory; it must resolve inside a mount |
| `Plugins:SearchPattern` | `*.dll` | Glob the entry assembly's file name must match (the extension must be `.dll` anyway) |
| `Plugins:ContinueOnError` | `false` | `false`: the first plugin Orkeon refuses fails the startup; `true`: it is recorded and skipped |
| `Plugins:SharedAssemblyPrefixes` | `Orkeon.`, `Orkeon.Rag.Abstractions`, `Microsoft.Extensions.` | Assemblies resolved from the host, never from the plugin folder |

With `orkeon-harness-run` the physical folder comes from `--plugins <dir>`, from
`ORKEON_HARNESS_PLUGINS`, or from a read-only mount that provides the virtual root
(`--mount <dir>:/plugins:ro`): a writable one is skipped, since the agents could drop code
there that the next run executes, and `mounts.json` refuses a `/plugins` root that is not `ro`.

## Two things a plugin author must know

* **A tool name belongs to one tool**: a plugin tool named like a built-in, or like another
  plugin's tool, stops the host at startup with an error naming both. Give it its own
  snake_case name.
* **A host cannot load plugins through the regular VFS.** Orkeon's stock
  `PathValidator` refuses `.dll` files, so the entry assembly is denied and the plugin refused
  as if the assembly were missing (before 1.0.0 the candidate was silently dropped).
  The host must hand `AddOrkeonPlugins` a file system whose validator admits the plugin
  directory - `PluginDirectoryPathValidator`, shipped in `OrkeonRunner` and reproduced in
  this template's tests. The test `Loader_ThroughTheStockPathValidator_RefusesThePlugin`
  pins the upstream behaviour: when it fails, Orkeon lets a stock file system load a plugin.

A plugin runs with the full privileges of the host process; there is no sandbox. Only
load plugins from a folder you control.

## Packages

`Orkeon.Plugins`, `Orkeon.Domain` and `Orkeon.Tools.Abstractions` come from the local feed
of the harness image (`nuget.config`); on nuget.org `Orkeon.Plugins` has no package of its own
(at 1.2.0 the assembly ships inside the `Orkeon` umbrella package).
