# C# part of the Orkeon harness

Templates and scripts for building Orkeon **tools** and **teams** in C#, following the
conventions of the Orkeon repository. Established on Orkeon 1.2.0 (tag `v1.2.0`, commit a9f3878: the release the image installs, D110; first written on `v1.0.0-rc.4`, then on `main` at 24ab0d0, a2bb6c3, fb26364, 77ac8a9, 80fdefe, 812cd10, bd3420c, ce9ec1f, c39c5fa, ad6dc63, 23f4eae, 5668c54, f59446b, 13461ea, fa46bb5, 63be532, e258730, acd59d6, f80665f, 8f4de67, 151a762, 0ea39d9, c727c06, 83cd91d and c101cbd), .NET SDK
`10.0.3xx`.

| Path | What it is |
|---|---|
| `scripts/build-orkeon-packages.sh` | Builds the Orkeon assemblies into a local NuGet feed (run once at image build) |
| `scripts/orkeon-pack-helper.py` | Companion of the script above (project closure, manifest) |
| `scripts/build-orkeon-studio.sh` | Packs `Orkeon.Studio.Core` from the Orkeon Studio sources at a tag into that feed, and publishes Studio's two terminal applications (run once at image build, D111) |
| `scripts/verify-templates.sh` | Restores, builds and tests every template on a copy; `--offline` proves the no-network case |
| `nuget.config` | Master copy of the NuGet sources and source mapping (each template carries an identical copy; `OrkeonStudioCheck/` has its own mapping, explained in its file) |
| `THIRD-PARTY.md` | Licence notice of the convention files the templates take from the Orkeon repository |
| `OrkeonTool/` | A C# tool as a library: `Domain/` (pure logic), `Tool/` (`ToolBase`, VFS only), tests |
| `OrkeonTool/new-tool.sh`, `OrkeonTool/update-public-api.sh` | Copies the template into a new tool solution; refreshes `PublicAPI.Unshipped.txt` from the compiler's RS0016/RS0017 diagnostics |
| `OrkeonPlugin/` | An `IOrkeonPlugin` that registers the tool, with its manifest `plugin.json`, to drop in a plugin folder |
| `OrkeonRunner/` | `orkeon-harness-run`: the `orkeon run` pipeline **plus plugin loading** (and `mounts.json` when no `--mount` is given) |
| `OrkeonCrewHost/` | A console host for a C# team: mounts from `mounts.json`, tools, crew, `events.jsonl` |
| `OrkeonCrewHost/new-team.sh` | Generates a workshop team's host into `teams/<slug>/host/` (renamed, each `--tool` referenced and registered, or the sample kept), with `run.sh` / `run.cmd` at the team root; run by the skill `orkeon-crew-csharp`. `verify-templates.sh` builds, tests and validates what it and `new-tool.sh` generate |
| `OrkeonStudioCheck/` | Not a template: `orkeon-studio-check`, which reads the workshop's teams with Orkeon Studio's own code (`Orkeon.Studio.Core`) — the card, the crew Studio would run, the launches it would refuse — and compares them with what the launchers do (V-15; see [below](#orkeon-studio-check)). Published by the image to `/usr/local/lib/orkeon-studio-check`, linked from `/usr/local/bin`; verified like the templates |

Every template is a self-contained solution: copy the folder and it builds. They carry the
same convention files (`Directory.Build.props` at the root, in `src/` and in `tests/`,
`global.json`, `.editorconfig`, `tests/.editorconfig`, `nuget.config`) and the same
`Directory.Packages.props`, except `OrkeonStudioCheck/`, whose `Directory.Packages.props` pins
only what it uses - `Orkeon.Studio.Core` at `OrkeonStudioVersion`, the version of Orkeon Studio, the
`Orkeon.Compliance.Vfs` analyzer at `OrkeonVersion`, the test packages and the pinned Roslyn
compiler - and whose `nuget.config` maps its packages differently (see
[The local NuGet feed](#the-local-nuget-feed)). The master copy of `nuget.config` is the one next to
this file (`verify-templates.sh` derives the alternate configuration of each template from the
template's own file); `OrkeonTool/` holds the master copies of the others.

## Exposing a C# tool to a team: two routes

A YAML or TypeScript crew cannot do I/O of its own, so anything beyond the built-in tools
is a C# tool. There are two ways to put one in front of a crew.

### 1. Plugin (tried first)

The tool ships in a plugin (`OrkeonPlugin/`): a folder holding the manifest `plugin.json` and
the assembly it names, which Orkeon requires since 1.0.0 (an assembly without manifest is
refused). The crew stays YAML or TypeScript and lists the tool by name.

**What Orkeon really does** (rc.4 to 1.2.0). Neither `orkeon run` nor `orkeon-host` calls `AddOrkeonPlugins`: no
runner of a crew loads a plugin (since 13461ea `orkeon-repl`, the interactive console, loads the plugins of a `Plugins`
section, but it runs no team folder). The harness therefore brings its own runner,
`orkeon-harness-run` (`OrkeonRunner/`), built on `Orkeon.Hosting` like the CLI itself. It
accepts the same crew targets and options as `orkeon run` for a declarative crew and adds
plugin discovery:

```bash
orkeon-harness-run crew --plugins /workspace/library/plugins --validate
orkeon-harness-run crew --plugins /workspace/library/plugins \
    --mount ./input:/workspace:ro ./output:/output:rw --events jsonl
```

Its `--list-tools` manifest is identical to the one of `orkeon run` of the same
version (112 tools at 1.2.0, against the published CLI; 111 on `main` at c101cbd; 110 at 83cd91d and 151a762, as at 8f4de67 and f80665f; 94 at acd59d6, e258730, 63be532, fa46bb5 and 13461ea; 83 at f59446b, 5668c54, 23f4eae, ad6dc63, c39c5fa, ce9ec1f, bd3420c, 812cd10, 80fdefe, 77ac8a9, fb26364 and a2bb6c3; 68 at rc.4), plus the tools of the plugins. Without `--mount`, it reads the
team's `mounts.json` (`TEAM_ENV=<name>` binds the mount set `mounts.<name>/<team>/` of the
workshop instead of the team's own folders); without `--settings`, it passes the team's settings
file of the workshop, `settings/<team>/appsettings.json`, when it exists (D33) — like the
launchers. A team that uses a plugin tool is
launched by this runner, not by Studio (Studio starts the stock `orkeon` binary, which
knows nothing about plugins). The options `orkeon run` gained since rc.6 come with
`Orkeon.Hosting`: `--llm-mock`, `--llm-record`, `--llm-replay`, `--resume`, `--input`, and the
exit code 75 of a run that waits for an answer.

### 2. C# host (fallback, and the only route for C#-only features)

The team has its own console program (`OrkeonCrewHost/`) that registers the tool in DI,
loads the crew (YAML under `crew/`, or built with `CrewBuilder`) and runs it. Required when
the team needs what YAML and TypeScript do not expose: `StateGraph`, flows, checkpoint
stores, `IResumeEngine`, active RAG, the evaluation subsystem.

| | Plugin + `orkeon-harness-run` | C# host |
|---|---|---|
| Crew definition | YAML or `.ork.ts`, unchanged | YAML under `crew/`, or C# builders |
| Tool delivery | one DLL dropped in a folder | project reference, compiled in |
| `--validate`, `--list-tools`, `--events jsonl` | yes (the first two come from `Orkeon.Hosting`, the event stream is written by the runner) | `--validate` and `events.jsonl`, written by the host |
| Launched by Studio | no | no |
| C#-only features | no | yes |

In both routes a tool name belongs to one tool: a tool registered under a name another tool
already holds, a built-in's included, stops the host at startup with an error naming both.

## orkeon-studio-check

`orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]` reads each
team folder with Orkeon Studio's own code (`Orkeon.Studio.Core`, packed into the local feed from
the Studio sources): the card `team.json`, the crew Studio would run and from where, the launches Studio
refuses (an archived team, a folder declaration its Authorized folders lack, a mount it cannot
vouch for, a read-only folder of the team that does not exist — a missing writable one Studio
creates at the launch, as the launchers do) and the mount points it binds. It compares them
with what the launchers that `orkeon-bench scaffold` writes do — run `crew/` or
`crew/crew.ork.ts` from the team folder, with the mount points of `mounts.json` — without
reading `run.sh` or `run.cmd`. A slug stands for
`<workshop>/teams/<slug>` (`$ORKEON_WORKSHOP`, else `/workspace`); without an argument, every
team of the workshop is checked. `--authorized` names a settings file whose
`Orkeon:FileSystem:Mounts`, read as Studio reads them (keys spelled exactly), are Studio's
Authorized folders; without it, there are none.

A card still named `studio-team.json`, its name before Orkeon 1.0.0-rc.7, fails the team: Orkeon no
longer reads it, and Studio renames it to `team.json` the first time its catalogue reads the team.
The check writes nothing, so it does not hand such a folder to Studio's catalogue: it reports the
card and the crew, and leaves the launch and the mount points unchecked until the card is renamed
(`orkeon-bench scaffold <team>` writes `team.json`). Next to a `team.json`, a `studio-team.json` is
a leftover nobody reads.

It prints `PASS <folder>` or `FAIL <folder>`, then one `  - <problem>` line per problem, and
exits 0 when every team passes, 1 when one fails, 2 on a usage error. The check scripts take a
problem starting with `Studio refuses to launch the team because of` (a folder outside the team
that the Authorized folders of the user's machine may declare) as a warning, any other as an
error.

Limits: in the container paths compare case-sensitively, where Studio on Windows does not; the
Hidden and System attributes that hide a folder from Studio on Windows are not seen; a Windows
path on the card counts as refused unless `--authorized` spells it exactly.

## The local NuGet feed

`Orkeon.Plugins` and `Orkeon.Hosting` are published on nuget.org under no id of their own: at
1.2.0 the first ships inside the `Orkeon` umbrella package and the second inside
`Orkeon.Scripting`, as do their dependencies (`Orkeon.Domain`, `Orkeon.Infrastructure`,
`Orkeon.Tools.*`... inside `Orkeon` and `Orkeon.Tools`). The harness builds the whole closure, one
package per assembly, from the Orkeon sources at the version the image installs instead (D32;
decision D17, no GitHub Packages token):

```bash
scripts/build-orkeon-packages.sh <version> <out-dir> [<src-dir>] [--verify]
```

* packs the checkout given as `<src-dir>` — the image passes the one `orkeon-update.sh --source`
  built the CLI from, when Orkeon is built from its sources — or else clones `Orkeon/orkeon` at
  `v<version>` (shallow), which is what the image does for a released Orkeon;
* packs the ProjectReference closure of `Orkeon.Plugins`, `Orkeon.Hosting`,
  `Orkeon.Constants.Protocol`, `Orkeon.Compliance.Vfs` and `Orkeon.Tools.Rag`: 27 projects at
  1.2.0, 28 packages (the `Orkeon.Generators` build-time package comes along), about 7 MB, all at
  `<version>`. With `Orkeon.Studio.Core`, which was a project of Orkeon until 1.0.0-rc.7, the
  closure held 28 projects on `main` at c101cbd, as at 83cd91d, c727c06, 0ea39d9, 151a762, 8f4de67, f80665f, acd59d6, e258730, 63be532, fa46bb5 and 13461ea, with `Orkeon.Tools.Drive` (27 at f59446b, 5668c54, 23f4eae, ad6dc63, c39c5fa, ce9ec1f, bd3420c, 812cd10, 80fdefe, 77ac8a9, fb26364, a2bb6c3 and 24ab0d0, 26 at `v1.0.0-rc.4`);
* writes `MANIFEST.txt` (version, source commit, roots, one line per package with its SHA-256
  and dependencies);
* is idempotent: a feed already built for that version from the same roots is left alone
  (`ORKEON_PACK_FORCE=1` rebuilds);
* `--verify` restores a throw-away project referencing every packed id.

Environment read by the script: `ORKEON_REPO_URL` (the clone URL), `ORKEON_PACK_ROOTS` (the project
paths whose closure is packed), `ORKEON_PACK_WORKDIR` and `ORKEON_PACK_KEEP=1` (the work directory, and
whether it survives the run), `ORKEON_PACK_FORCE=1`, `ORKEON_PACK_ATTEMPTS` (retries on a network
failure, default 3), `NUGET_PACKAGES` (the package cache the restore fills). The header of the script
is the reference.

`Orkeon.Studio.Core`, which `orkeon-studio-check` runs, is published nowhere, and since Orkeon
1.0.0-rc.7 it is no project of Orkeon: Orkeon Studio has its own repository and its own versions.
A second script adds it to the same feed (D111):

```bash
scripts/build-orkeon-studio.sh <studio version> <feed-dir> <install-dir> [<src-dir>] [--no-apps]
```

It clones `Orkeon/orkeon-studio` at `v<studio version>` (or takes `<src-dir>`), packs
`Orkeon.Studio.Core.<studio version>.nupkg` into `<feed-dir>` and, unless `--no-apps`, publishes
`orkeon-studio-config` and `orkeon-studio-run` under `<install-dir>`. Studio builds against the
Orkeon packages of nuget.org at the version its `Directory.Packages.props` pins, which the script
prints (`orkeon_version=`; 1.2.0 for Studio 1.2.0).

The templates' `nuget.config` maps `Orkeon.*` to that feed and everything else to
nuget.org. Consequence for the project files: inside the harness a project references the
per-assembly packages (`Orkeon.Domain`, `Orkeon.Tools.Abstractions`,
`Orkeon.Infrastructure`...). Outside the harness the public equivalent is
`dotnet add package Orkeon` (plus `Orkeon.Tools`, and `Orkeon.Scripting` for `Orkeon.Hosting`):
same assemblies, same namespaces, only the `PackageReference` lines change.

`OrkeonStudioCheck/nuget.config` maps otherwise: `Orkeon.Studio.Core` and the analyzer
`Orkeon.Compliance.Vfs` come from the feed, and everything else from nuget.org — the two packages
`Orkeon.Studio.Core` depends on included, `Orkeon` (the umbrella) and `Orkeon.Constants.Cli`, at the
Orkeon version that Studio release pins. The umbrella exists on nuget.org alone, and the feed is at
the pinned version only when the image's Orkeon is that release: built from another commit, it has
another version. So the check restores the same way in both cases, and runs Studio's code on the
Orkeon assemblies Studio ships with. Its `Directory.Packages.props` therefore carries two versions:
`OrkeonVersion` (the feed, for the analyzer) and `OrkeonStudioVersion` (Studio).

## Image integration

Four steps of `.devcontainer/Dockerfile` build all of this (network at build time: github.com,
nuget.org, huggingface.co); the Dockerfile is the reference, this is a summary:

* **The Orkeon step** (comment `# Orkeon (D110)`): `orkeon-update.sh` installs the released CLI
  `ORKEON_VERSION`, then `build-orkeon-packages.sh` packs `/usr/local/share/orkeon/packages` from
  the tag of that version (`/usr/local/share/orkeon/install-stamp` records it). With
  `ORKEON_CHANNEL=source` the CLI is built from a checkout of Orkeon/orkeon (`ORKEON_SOURCE_REF`)
  and the packages are packed from that same checkout, at the version of that build. The checkout
  never reaches a layer.
* **The Studio step** (comment `# Orkeon Studio and Orkeon Code (D111)`): `build-orkeon-studio.sh`
  packs `Orkeon.Studio.Core` at `ORKEON_STUDIO_VERSION` into the same feed and publishes
  `orkeon-studio-config` and `orkeon-studio-run`.
* **The templates step** (comment `# .NET templates of the harness`): `csharp/` is copied to
  `/usr/local/share/orkeon-harness/csharp/`; the `<OrkeonVersion>` of every
  `Directory.Packages.props` there is rewritten to the version of the feed (its `MANIFEST.txt`),
  and the `<OrkeonStudioVersion>` of `OrkeonStudioCheck/` to the Studio version just packed;
  every `Orkeon*/` folder is restored once into the shared cache
  (`NUGET_PACKAGES=/usr/local/share/nuget-packages`, `ORKEON_HARNESS_OFFLINE=1`);
  `orkeon-harness-run` and `orkeon-studio-check` are published to
  `/usr/local/lib/orkeon-harness-run` and `/usr/local/lib/orkeon-studio-check`, linked from
  `/usr/local/bin`, and started once (`--list-tools`, `--help`).
* **The self-check** (`HARNESS_VERIFY=1`, the default): `scripts/verify-templates.sh --offline --smoke`.

Notes for whoever maintains that file:

* The pack script works under `/tmp/orkeon-src` (where the image's checkout lives too) and
  removes it when it exits (`ORKEON_PACK_WORKDIR` names another directory, which is kept;
  `ORKEON_PACK_KEEP=1` keeps the default one); nothing outside `<out-dir>` is needed afterwards.
* The **publish** step of the runner is not optional even if the binary were not wanted:
  building it is what downloads the local-embeddings model (17 MB, measured at lot 0, from huggingface.co) into
  the package cache. Without it, building `OrkeonRunner` at run time would try to download
  it and fail behind the firewall.
* `ORKEON_HARNESS_OFFLINE=1` switches the NuGet vulnerability audit off. It is the only
  part of a restore that still needs the network once the cache is warm (see below).
* `.ork.ts` crews need esbuild, as under `orkeon run`. The runner looks for it in
  `Orkeon:Scripting:Toolchain:EsbuildPath`, then `ORKEON_ESBUILD_PATH`, then
  `esbuild-bin/esbuild` next to the binary, then the `PATH`, where the image installs the
  version Orkeon pins.
* The restore loop covers every `Orkeon*/` folder: the four templates and `OrkeonStudioCheck/`,
  whose restore takes `Orkeon` and `Orkeon.Constants.Cli` from nuget.org at the version Studio pins
  (see [The local NuGet feed](#the-local-nuget-feed)).
  The pre-warmed cache is large: about 2.3 GB for the four templates, 1.5 GB without
  `OrkeonRunner` (measured at lot 0 on `v1.0.0-rc.4`, not re-measured since). Most of it is native
  code shipped for every platform by packages `Orkeon.Infrastructure` depends on (TreeSitter alone:
  640 MB for nine runtimes, same measurement).
* `run.cmd` (in `OrkeonCrewHost/`) uses CRLF line endings on purpose.

## Working without network

The container firewall rejects nuget.org at run time. After the pre-warm above:

* every package a template needs is in `NUGET_PACKAGES`; NuGet contacts a source only for
  a package that is absent from that folder, so a fresh copy of a template (or a tool
  created by `OrkeonTool/new-tool.sh`) restores and builds with no network;
* the vulnerability audit (`NuGetAudit`, on by default as in the Orkeon repository) is the
  exception: it downloads the advisory database at each real restore. With
  `ORKEON_HARNESS_OFFLINE=1` it is skipped. Without the variable the restore still
  succeeds - `NU1900` is the one warning the templates never promote to an error - but it
  spends a few seconds on retries and leaves that warning in the build output;
* adding a package that is not in the cache needs the network (open the firewall for
  `api.nuget.org`).

## Verifying

```bash
# In the image (feed at /usr/local/share/orkeon/packages): everything in one command
scripts/verify-templates.sh --offline --smoke

# Anywhere else: a feed built from the Orkeon sources the templates were written on (v1.2.0), at
# the version they reference (<OrkeonVersion> in their Directory.Packages.props), then
# Orkeon.Studio.Core added to it at <OrkeonStudioVersion> (OrkeonStudioCheck/Directory.Packages.props)
scripts/build-orkeon-packages.sh 1.2.0 /tmp/feed --verify
scripts/build-orkeon-studio.sh 1.2.0 /tmp/feed /tmp/studio --no-apps
scripts/verify-templates.sh --feed /tmp/feed --smoke             # fills the package cache
scripts/verify-templates.sh --feed /tmp/feed --offline --smoke   # then proves the no-network case

# The end-to-end plugin check alone, against the installed runner:
OrkeonRunner/smoke/plugin-smoke.sh orkeon-harness-run <path>/SampleExtractor.Plugin.dll
```

The version given to `build-orkeon-packages.sh` must equal the `<OrkeonVersion>` of the
templates (the image rewrites it to the version it built; by hand, pass the version written
there, or change it in every `Directory.Packages.props` of the copies you build), and the one
given to `build-orkeon-studio.sh` the `<OrkeonStudioVersion>` of `OrkeonStudioCheck/`. The templates
are written for Orkeon 1.2.0 and do not build on an earlier one (tool logging, `IToolRegistry`,
plugin manifests and run events changed at 1.0.0); `OrkeonStudioCheck` needs Orkeon Studio 1.2.0,
which reads `team.json`.

The smoke script drops the plugin folder (`plugin.json` and the DLL) in a folder and checks, with
Orkeon's echo provider: the tool is unknown without the plugin and listed with it (`--mount
<dir>:/plugins:ro` and `--plugins <dir>`), not loaded from a `/plugins:rw` mount, a DLL without
`plugin.json` is refused, the YAML crew that names the tool is refused then validated, an evented
run speaks protocol v2, the mounts come from `mounts.json` when no `--mount` is given, and (when
esbuild is available) a `.ork.ts` crew names the same tool.

`verify-templates.sh [--feed <dir>] [--work <dir>] [--offline] [--smoke] [--keep] [<Template>...]`
works on a copy of each template (the template tree never receives `bin/` or `obj/`), runs
`dotnet restore`, `dotnet build -c Release` and `dotnet test`; with `--offline` it repeats restore
and build from a fresh copy with every HTTP request sent to a dead proxy and an empty NuGet
http-cache; with `--smoke` it then runs the plugin check with the runner and the plugin it just
built. `--feed` names another feed than the one of `nuget.config` (an alternate configuration is
generated for each template from its own file, the templates are never edited; the feed must hold
`Orkeon.Studio.Core` for `OrkeonStudioCheck`), `--work` the directory of the copies (a temporary one
by default, removed unless `--keep`), and `<Template>` restricts the run to the named `Orkeon*/`
folders. By hand, in a template folder: `dotnet build -c Release && dotnet test`.

## Conventions the templates carry

Copied from the Orkeon repository (MIT licence, Copyright (c) 2024-2026 Orkeon Contributors:
the notice is [`THIRD-PARTY.md`](./THIRD-PARTY.md)), so that code written here would pass its CI:

* **Build**: the full analyzer set (`AnalysisMode=All`), warnings as errors, nullable,
  implicit usings, central package versions, SDK pinned by `global.json`, the repository's
  `.editorconfig` (rules scoped to `src/` and `tests/`: keep that layout), the pinned
  compiler (`Microsoft.Net.Compilers.Toolset` 5.9.0, as the repository pins it — at rc.4 and on
  `main` at c101cbd the VFS analyzer did not load without it; since 1.0.0 it is built against
  Roslyn 4.8.0 and loads in the compiler of any .NET 10 SDK, checked at 1.2.0).
* **One addition of the harness**: projects build for the machine's own runtime
  (`RuntimeIdentifier` computed in `Directory.Build.props`, framework-dependent, same
  `bin/<Configuration>/net10.0/` layout). A portable build copies the native libraries of
  every platform into each output folder - about 670 MB per project and per configuration
  as soon as `Orkeon.Infrastructure` is referenced, which a tool's test project does.
  With the default, an output folder is 110 to 190 MB (both measured at lot 0, not re-measured
  since). Opt out with
  `-p:OrkeonHarnessPortableBuild=true`, or pass an explicit `-r <rid>`.
* **VFS only**: `Orkeon.Compliance.Vfs` makes `System.IO` a build error (`ORKVFS001`-`007`)
  in `src/`; file access goes through `IFileSystemService` and virtual paths. Bootstrap
  code that must touch the disk before the container exists carries
  `[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: ...")]`.
* **Style**: file-scoped namespaces, `sealed record` + `init`, XML documentation on public
  members of `src/`, `ArgumentNullException.ThrowIfNull`, `ConfigureAwait(false)`,
  source-generated logging (`[LoggerMessage]` in `partial` classes; in a tool, `static partial`
  methods taking the `ILogger` first, called with the `Logger` property of `ToolBase` - since
  1.0.0 the base classes expose their services as properties, not fields).
* **Public API freeze** on shared libraries (`PublicAPI.Shipped.txt` /
  `PublicAPI.Unshipped.txt`); executables and plugins opt out.
* **Tests**: xUnit v3 on Microsoft.Testing.Platform, hand-rolled doubles (no mocking
  framework), `tests/<Project>.Tests` mirroring `src/`.

## What differs from the Orkeon documentation (found at rc.4)

Found while building these templates; each one is handled in the code and commented there.

1. **No shipped runner of a crew loads plugins** (`docs/architecture/plugins.md` says so; since 13461ea only
   `orkeon-repl`, the interactive console, does - still so at 1.2.0): hence `orkeon-harness-run`.
2. **Plugin discovery through the regular VFS loads nothing.** The stock `PathValidator`
   refuses `.dll` (fixed list of blocked extensions), so every assembly is denied: at rc.4 the
   candidate was silently dropped; at 1.2.0 the loader reads the manifest, counts the entry
   assembly it names as missing and refuses the plugin (`PluginManifestException`). A host must
   give `AddOrkeonPlugins` a file system with a validator that admits the plugin directory
   (`PluginDirectoryPathValidator`). Orkeon's own plugin tests use a test-only file system
   without validator, and `orkeon-repl` builds a file system of its own for discovery.
3. **`AddOrkeonLlmProvider` does not exist.** The runner registers the provider in a
   private method of `RunnerHost`; `OrkeonCrewHost` reproduces it
   (`LlmProviderRegistration`). At 1.2.0, as on `main` before it, it exists in `Orkeon.Infrastructure`
   (`LlmProviderRegistrationExtensions`), for a provider the caller builds, and the reading
   of the `Llm` section is public (`LlmSettings.HasDefault` / `ReadDefault`, and
   `AddOrkeonLlmProfiles` for the named profiles): the template's registration now calls
   them, as `RunnerHost` does, so a C# team reads its models, profiles and `ApiKeyEnvVar`
   exactly as `orkeon run` - the default section as strictly as a profile: a number or a
   switch it cannot read fails the host build, naming its key.
4. **`bootstrap.md` says the `Orkeon` package carries Hosting, Plugins and Scripting**; it
   does not (`publication-matrix.md` is right). On `main` at 24ab0d0 `bootstrap.md` still said so;
   at a2bb6c3 it is corrected.
5. **`Orkeon.Hosting` as a package needs a direct reference to
   `SmartComponents.LocalEmbeddings`**: the model is delivered by `build/` targets, which
   do not flow transitively; without it the host throws as soon as the tool registry is
   resolved.
6. **At rc.4 the VFS analyzer needed Roslyn 5.9.0**: the SDK 10.0.301 compiler (5.6.0) rejected it
   (CS9057) and skipped it silently, and so again on `main` at c101cbd. Since 1.0.0 it is compiled
   against Roslyn 4.8.0 and loads with any .NET 10 compiler (checked at 1.2.0: without the pinned
   compiler, `ORKVFS001` still fails a build); the templates keep the pinned compiler, as the
   repository does.
7. **A directory mounted as an internal root hides every root nested in it**: the event
   file of `OrkeonCrewHost` lives in a folder of its own (`run/`, mounted as the internal
   root `/_run`).
8. **`taskId` in the event stream is the runtime id of the task (a ULID)**, not the YAML
   file stem; use `agentRole` or the order of events to map tasks.
