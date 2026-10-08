# C# part of the Orkeon harness

Templates and scripts for building Orkeon **tools** and **teams** in C#, following the
conventions of the Orkeon repository. Established on Orkeon `main` at bd3420c (built from the sources by the image, D32; first written on `v1.0.0-rc.4`, then on `main` at 24ab0d0, a2bb6c3, fb26364, 77ac8a9, 80fdefe and 812cd10), .NET SDK
`10.0.3xx`.

| Path | What it is |
|---|---|
| `scripts/build-orkeon-packages.sh` | Builds the Orkeon assemblies into a local NuGet feed (run once at image build) |
| `scripts/orkeon-pack-helper.py` | Companion of the script above (project closure, manifest) |
| `scripts/verify-templates.sh` | Restores, builds and tests every template on a copy; `--offline` proves the no-network case |
| `nuget.config` | Master copy of the NuGet sources and source mapping (each template, and `OrkeonStudioCheck/`, carries an identical copy) |
| `THIRD-PARTY.md` | Licence notice of the convention files the templates take from the Orkeon repository |
| `OrkeonTool/` | A C# tool as a library: `Domain/` (pure logic), `Tool/` (`ToolBase`, VFS only), tests |
| `OrkeonPlugin/` | An `IOrkeonPlugin` that registers the tool, to drop in a plugin folder |
| `OrkeonRunner/` | `orkeon-harness-run`: the `orkeon run` pipeline **plus plugin loading** (and `mounts.json` when no `--mount` is given) |
| `OrkeonCrewHost/` | A console host for a C# team: mounts from `mounts.json`, tools, crew, `events.jsonl` |
| `OrkeonStudioCheck/` | Not a template: `orkeon-studio-check`, which reads the workshop's teams with Orkeon Studio's own code (`Orkeon.Studio.Core`) — the card, the crew Studio would run, the launches it would refuse — and compares them with what the launchers do (V-15; see [below](#orkeon-studio-check)). Published by the image to `/usr/local/lib/orkeon-studio-check`, linked from `/usr/local/bin`; verified like the templates |

Every template is a self-contained solution: copy the folder and it builds. They carry the
same convention files (`Directory.Build.props` at the root, in `src/` and in `tests/`,
`global.json`, `.editorconfig`, `tests/.editorconfig`, `nuget.config`) and the same
`Directory.Packages.props`, except `OrkeonStudioCheck/`, whose `Directory.Packages.props` pins
only what it uses (`Orkeon.Studio.Core`). The master copy of `nuget.config` is the one next to
this file (`verify-templates.sh` derives its alternate configuration from it); `OrkeonTool/`
holds the master copies of the others.

## Exposing a C# tool to a team: two routes

A YAML or TypeScript crew cannot do I/O of its own, so anything beyond the built-in tools
is a C# tool. There are two ways to put one in front of a crew.

### 1. Plugin (tried first)

The tool ships in a plugin assembly (`OrkeonPlugin/`); the crew stays YAML or TypeScript
and lists the tool by name.

**What Orkeon really does** (rc.4 and `main` at bd3420c). No binary shipped with Orkeon calls `AddOrkeonPlugins`: neither
`orkeon run` nor Studio loads a plugin. The harness therefore brings its own runner,
`orkeon-harness-run` (`OrkeonRunner/`), built on `Orkeon.Hosting` like the CLI itself. It
accepts the same crew targets and options as `orkeon run` for a declarative crew and adds
plugin discovery:

```bash
orkeon-harness-run crew --plugins /workspace/library/plugins --validate
orkeon-harness-run crew --plugins /workspace/library/plugins \
    --mount ./input:/workspace:ro ./output:/output:rw --events jsonl
```

Its `--list-tools` manifest is identical to the one of `orkeon run` built from the same
commit (83 tools on `main` at bd3420c, as at 812cd10, 80fdefe, 77ac8a9, fb26364 and a2bb6c3; 68 at rc.4), plus the tools of the plugins. Without `--mount`, it reads the
team's `mounts.json` (`TEAM_ENV=<name>` binds the mount set `mounts.<name>/<team>/` of the
workshop instead of the team's own folders); without `--settings`, it passes the team's settings
file of the workshop, `settings/<team>/appsettings.json`, when it exists (D33) — like the
launchers. A team that uses a plugin tool is
launched by this runner, not by Studio (Studio starts the stock `orkeon` binary, which
knows nothing about plugins).

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
team folder with Orkeon Studio's own code (`Orkeon.Studio.Core`, packed into the local feed):
the card `studio-team.json`, the crew Studio would run and from where, the launches Studio
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

It prints `PASS <folder>` or `FAIL <folder>`, then one `  - <problem>` line per problem, and
exits 0 when every team passes, 1 when one fails, 2 on a usage error. The check scripts take a
problem starting with `Studio refuses to launch the team because of` (a folder outside the team
that the Authorized folders of the user's machine may declare) as a warning, any other as an
error.

Limits: in the container paths compare case-sensitively, where Studio on Windows does not; the
Hidden and System attributes that hide a folder from Studio on Windows are not seen; a Windows
path on the card counts as refused unless `--authorized` spells it exactly.

## The local NuGet feed

`Orkeon.Plugins` and `Orkeon.Hosting` are not published on nuget.org, and their
dependencies (`Orkeon.Domain`, `Orkeon.Infrastructure`, `Orkeon.Tools.*`...) only exist
there inside the `Orkeon` / `Orkeon.Tools` umbrella packages; `Orkeon.Studio.Core`, which
`orkeon-studio-check` runs, is published nowhere. The harness builds the whole
closure from the Orkeon sources the image installs instead (D32; decision D17, no GitHub
Packages token):

```bash
scripts/build-orkeon-packages.sh <version> <out-dir> [<src-dir>] [--verify]
```

* packs the checkout given as `<src-dir>` — the image passes the one `orkeon-update.sh`
  built the CLI from — or else clones `Orkeon/orkeon` at `v<version>` (shallow);
* packs the ProjectReference closure of `Orkeon.Plugins`, `Orkeon.Hosting`,
  `Orkeon.Constants.Protocol`, `Orkeon.Compliance.Vfs`, `Orkeon.Tools.Rag` and
  `Orkeon.Studio.Core`: 27 projects on `main` at bd3420c, as at 812cd10, 80fdefe, 77ac8a9, fb26364, a2bb6c3 and 24ab0d0 (26 at `v1.0.0-rc.4`), 28
  packages (the `Orkeon.Generators` build-time package comes along), about 5.5 MB, all at `<version>`;
* writes `MANIFEST.txt` (version, source commit, roots, one line per package with its SHA-256
  and dependencies);
* is idempotent: a feed already built for that version from the same roots is left alone
  (`ORKEON_PACK_FORCE=1` rebuilds);
* `--verify` restores a throw-away project referencing every packed id.

The templates' `nuget.config` maps `Orkeon.*` to that feed and everything else to
nuget.org. Consequence for the project files: inside the harness a project references the
per-assembly packages (`Orkeon.Domain`, `Orkeon.Tools.Abstractions`,
`Orkeon.Infrastructure`...). Outside the harness the public equivalent is
`dotnet add package Orkeon --prerelease` (plus `Orkeon.Tools`): same assemblies, same
namespaces, only the `PackageReference` lines change.

## Image integration

Two steps of `.devcontainer/Dockerfile` build all of this (network at build time: github.com,
nuget.org, huggingface.co); the Dockerfile is the reference, this is a summary:

* **The Orkeon step** (comment `# Orkeon (D32)`): `orkeon-update.sh --source` builds and
  installs the CLI from a checkout of Orkeon/orkeon (`ORKEON_SOURCE_REF`, `main` by default),
  then `build-orkeon-packages.sh` packs `/usr/local/share/orkeon/packages` from that same
  checkout, at the version the install stamp records (`/usr/local/share/orkeon/install-stamp`).
  With `ORKEON_CHANNEL=release` or `dev` a published CLI is installed instead and the packages
  are packed from its tag. The checkout never reaches a layer.
* **The templates step** (comment `# .NET templates of the harness`): `csharp/` is copied to
  `/usr/local/share/orkeon-harness/csharp/`; the `<OrkeonVersion>` of every
  `Directory.Packages.props` there is rewritten to the version of the feed (its `MANIFEST.txt`);
  every `Orkeon*/` folder is restored once into the shared cache
  (`NUGET_PACKAGES=/usr/local/share/nuget-packages`, `ORKEON_HARNESS_OFFLINE=1`);
  `orkeon-harness-run` and `orkeon-studio-check` are published to
  `/usr/local/lib/orkeon-harness-run` and `/usr/local/lib/orkeon-studio-check`, linked from
  `/usr/local/bin`, and started once (`--list-tools`, `--help`).
* **The self-check** (`HARNESS_VERIFY=1`, the default): `scripts/verify-templates.sh --offline --smoke`.

Notes for whoever maintains that file:

* The pack script works under `/tmp/orkeon-src` (where the image's checkout lives too) and
  removes it when it exits; nothing outside `<out-dir>` is needed afterwards.
* The **publish** step of the runner is not optional even if the binary were not wanted:
  building it is what downloads the local-embeddings model (17 MB, from huggingface.co) into
  the package cache. Without it, building `OrkeonRunner` at run time would try to download
  it and fail behind the firewall.
* `ORKEON_HARNESS_OFFLINE=1` switches the NuGet vulnerability audit off. It is the only
  part of a restore that still needs the network once the cache is warm (see below).
* `.ork.ts` crews need esbuild, as under `orkeon run`. The runner looks for it in
  `Orkeon:Scripting:Toolchain:EsbuildPath`, then `ORKEON_ESBUILD_PATH`, then
  `esbuild-bin/esbuild` next to the binary, then the `PATH`, where the image installs the
  version Orkeon pins.
* The pre-warmed cache is large: about 2.3 GB for the four templates, 1.5 GB without
  `OrkeonRunner`. Most of it is native code shipped for every platform by packages
  `Orkeon.Infrastructure` depends on (TreeSitter alone: 640 MB for nine runtimes).
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

# Anywhere else: a feed built from the Orkeon sources the templates were written on (main at
# bd3420c), at the version they reference (<OrkeonVersion> in their Directory.Packages.props)
git clone https://github.com/Orkeon/orkeon.git /tmp/orkeon && git -C /tmp/orkeon checkout bd3420c
scripts/build-orkeon-packages.sh 1.0.0-rc.4.src.20261008.gbd3420c /tmp/feed /tmp/orkeon --verify
scripts/verify-templates.sh --feed /tmp/feed --offline --smoke

# The end-to-end plugin check alone, against the installed runner:
OrkeonRunner/smoke/plugin-smoke.sh orkeon-harness-run <path>/SampleExtractor.Plugin.dll
```

The version given to `build-orkeon-packages.sh` must equal the `<OrkeonVersion>` of the
templates (the image rewrites it to the version it built; by hand, pass the version written
there, or change it in every `Directory.Packages.props` of the copies you build). A feed packed
from `v1.0.0-rc.4` has another version, and `OrkeonStudioCheck` needs `main` at fb26364 or
later: the Studio code it calls is not in the `v1.0.0-rc.4` sources (archived teams, folder
declarations named by id), nor all of it at a2bb6c3 (the folders Studio prepares before a launch).

The smoke script drops the plugin DLL in a folder and checks, with Orkeon's echo provider:
the tool is unknown without the plugin and listed with it (both layouts, `--mount
<dir>:/plugins:ro` and `--plugins <dir>`), not loaded from a `/plugins:rw` mount, the YAML
crew that names it is refused then validated, an evented run speaks protocol v2, the mounts
come from `mounts.json` when no `--mount` is given, and (when esbuild is available) a
`.ork.ts` crew names the same tool.

`verify-templates.sh` works on a copy of each template (the template tree never receives
`bin/` or `obj/`), runs `dotnet restore`, `dotnet build -c Release` and `dotnet test`;
with `--offline` it repeats restore and build from a fresh copy with every HTTP request
sent to a dead proxy and an empty NuGet http-cache; with `--smoke` it then runs the plugin
check with the runner and the plugin it just built. By hand, in a template folder:
`dotnet build -c Release && dotnet test`.

## Conventions the templates carry

Copied from the Orkeon repository (MIT licence, Copyright (c) 2024-2026 Orkeon Contributors:
the notice is [`THIRD-PARTY.md`](./THIRD-PARTY.md)), so that code written here would pass its CI:

* **Build**: the full analyzer set (`AnalysisMode=All`), warnings as errors, nullable,
  implicit usings, central package versions, SDK pinned by `global.json`, the repository's
  `.editorconfig` (rules scoped to `src/` and `tests/`: keep that layout), the pinned
  compiler (`Microsoft.Net.Compilers.Toolset` 5.9.0 — at rc.4 the VFS analyzer did not load
  without it; on `main` it loads with any .NET 10 compiler).
* **One addition of the harness**: projects build for the machine's own runtime
  (`RuntimeIdentifier` computed in `Directory.Build.props`, framework-dependent, same
  `bin/<Configuration>/net10.0/` layout). A portable build copies the native libraries of
  every platform into each output folder - about 670 MB per project and per configuration
  as soon as `Orkeon.Infrastructure` is referenced, which a tool's test project does.
  With the default, an output folder is 110 to 190 MB. Opt out with
  `-p:OrkeonHarnessPortableBuild=true`, or pass an explicit `-r <rid>`.
* **VFS only**: `Orkeon.Compliance.Vfs` makes `System.IO` a build error (`ORKVFS001`-`007`)
  in `src/`; file access goes through `IFileSystemService` and virtual paths. Bootstrap
  code that must touch the disk before the container exists carries
  `[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: ...")]`.
* **Style**: file-scoped namespaces, `sealed record` + `init`, XML documentation on public
  members of `src/`, `ArgumentNullException.ThrowIfNull`, `ConfigureAwait(false)`,
  source-generated logging (`[LoggerMessage]` in `partial` classes).
* **Public API freeze** on shared libraries (`PublicAPI.Shipped.txt` /
  `PublicAPI.Unshipped.txt`); executables and plugins opt out.
* **Tests**: xUnit v3 on Microsoft.Testing.Platform, hand-rolled doubles (no mocking
  framework), `tests/<Project>.Tests` mirroring `src/`.

## What differs from the Orkeon documentation (found at rc.4)

Found while building these templates; each one is handled in the code and commented there.

1. **No shipped binary loads plugins** (`docs/architecture/plugins.md` says so): hence
   `orkeon-harness-run`.
2. **Plugin discovery through the regular VFS finds nothing.** The stock `PathValidator`
   refuses `.dll` (fixed list of blocked extensions), so every candidate is denied and
   silently dropped. A host must give `AddOrkeonPlugins` a file system with a validator
   that admits the plugin directory (`PluginDirectoryPathValidator`). Orkeon's own plugin
   tests use a test-only file system without validator.
3. **`AddOrkeonLlmProvider` does not exist.** The runner registers the provider in a
   private method of `RunnerHost`; `OrkeonCrewHost` reproduces it
   (`LlmProviderRegistration`). On `main` (bd3420c) it exists in `Orkeon.Infrastructure`
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
   (CS9057) and skipped it silently. On `main` it is compiled against Roslyn 4.8.0 again and loads with
   any .NET 10 compiler; the templates keep the pinned compiler, as the repository does.
7. **A directory mounted as an internal root hides every root nested in it**: the event
   file of `OrkeonCrewHost` lives in a folder of its own (`run/`, mounted as the internal
   root `/_run`).
8. **`taskId` in the event stream is the runtime id of the task (a ULID)**, not the YAML
   file stem; use `agentRole` or the order of events to map tasks.
