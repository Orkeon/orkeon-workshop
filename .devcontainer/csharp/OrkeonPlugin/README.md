# SampleExtractor.Plugin - an Orkeon plugin

Template of an `IOrkeonPlugin`: one assembly that contributes the `sample_extractor` tool
to a host, so a YAML or TypeScript crew can list it under `tools:` without the host being
recompiled.

## What Orkeon does and does not do (rc.4 and `main`)

No binary shipped with Orkeon (rc.4, `main` at bd3420c) activates plugins (`orkeon run` and Studio never call
`AddOrkeonPlugins`). In the harness, the host that loads them is `orkeon-harness-run`
(template `OrkeonRunner/`).

## Layout

```
SampleExtractor.Plugin.sln
src/SampleExtractor.Plugin/
  SampleExtractorPlugin.cs           the entry point: Name, Version, ConfigureServices
  Domain/, Tool/                     the tool (same sources as the OrkeonTool template)
tests/SampleExtractor.Plugin.Tests/
  SampleExtractorPluginTests.cs      what ConfigureServices registers (one tool, by name)
  PluginLoadingTests.cs              the REAL loader over a drop folder, both layouts
  Hosting/PluginDirectoryPathValidator.cs   what a host must provide (see below)
```

The template keeps the tool sources inside the plugin project so that the plugin is a
single DLL. A plugin that wraps an existing tool library references that project instead;
the library DLL then sits next to the plugin DLL in a folder-per-plugin layout.

## Build and drop

```bash
dotnet build -c Release && dotnet test
mkdir -p /workspace/library/plugins/SampleExtractor.Plugin
cp src/SampleExtractor.Plugin/bin/Release/net10.0/SampleExtractor.Plugin.{dll,deps.json} \
   /workspace/library/plugins/SampleExtractor.Plugin/
```

Two layouts are recognized, at the first level of the plugin directory only:

```
<plugins>/SampleExtractor.Plugin.dll                              flat
<plugins>/SampleExtractor.Plugin/SampleExtractor.Plugin.dll       folder per plugin (+ .deps.json, private dependencies)
```

The output folder holds the plugin DLL and its `.deps.json`, and no `Orkeon.*` or
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
| `Plugins:SearchPattern` | `*.dll` | Glob on candidate file names (the extension must be `.dll` anyway) |
| `Plugins:ContinueOnError` | `false` | `false`: the first unloadable assembly fails the startup; `true`: it is recorded and skipped |
| `Plugins:SharedAssemblyPrefixes` | `Orkeon.`, `Orkeon.Rag.Abstractions`, `Microsoft.Extensions.` | Assemblies resolved from the host, never from the plugin folder |

With `orkeon-harness-run` the physical folder comes from `--plugins <dir>`, from
`ORKEON_HARNESS_PLUGINS`, or from a read-only mount that provides the virtual root
(`--mount <dir>:/plugins:ro`): a writable one is skipped, since the agents could drop code
there that the next run executes, and `mounts.json` refuses a `/plugins` root that is not `ro`.

## Two things a plugin author must know

* **A tool name belongs to one tool**: a plugin tool named like a built-in, or like another
  plugin's tool, stops the host at startup with an error naming both. Give it its own
  snake_case name.
* **A host cannot discover plugins through the regular VFS.** Orkeon's stock
  `PathValidator` refuses `.dll` files, so every candidate is denied and silently dropped.
  The host must hand `AddOrkeonPlugins` a file system whose validator admits the plugin
  directory - `PluginDirectoryPathValidator`, shipped in `OrkeonRunner` and reproduced in
  this template's tests. The test `Loader_ThroughTheStockPathValidator_SilentlyFindsNothing`
  pins the upstream behaviour: when it fails, Orkeon has fixed it.

A plugin runs with the full privileges of the host process; there is no sandbox. Only
load plugins from a folder you control.

## Packages

`Orkeon.Plugins`, `Orkeon.Domain` and `Orkeon.Tools.Abstractions` come from the local feed
of the harness image (`nuget.config`); `Orkeon.Plugins` exists on no public feed.
