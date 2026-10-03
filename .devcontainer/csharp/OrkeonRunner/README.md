# orkeon-harness-run - `orkeon run` with plugins

A console runner built on `Orkeon.Hosting`, the library the `orkeon` CLI itself runs on.
It executes a declarative crew exactly as `orkeon run` does - same host, same tool set,
same options, same exit codes - and adds what no binary shipped with Orkeon (rc.4, `main` at
24ab0d0) does: it loads plugins, so a YAML or TypeScript crew can use C# tools. Two
conveniences come on top, as the launchers do: without `--mount` the mounts come from the
team's `mounts.json`, and without `--settings` it passes the team's settings file of the
workshop, `settings/<team>/appsettings.json`, when that file exists (D33).

## Usage

```bash
orkeon-harness-run <target> [options]

# List the tools a run would expose (no crew needed)
orkeon-harness-run --list-tools --plugins /workspace/library/plugins

# Load the crew strictly, without calling the model
orkeon-harness-run crew --validate --plugins /workspace/library/plugins

# Run, with the event protocol on stdout
orkeon-harness-run crew --plugins /workspace/library/plugins \
    --mount ./input:/workspace:ro ./output:/output:rw --events jsonl
```

`<target>` is a `.yaml` crew, a directory holding a multi-file YAML crew
(`config.yaml` + `agents/` + `tasks/`), or a `.ork.ts` crew definition ending with
`globalThis.crew = crew` (esbuild required, as under `orkeon run`). A procedural script
(`await crew.run()`) is run by `orkeon run`, not by this runner.

Options inherited from `Orkeon.Hosting` (identical to `orkeon run`): `-c/--config`,
`-s/--settings`, `-m/--mount` (every spec after ONE flag), `--mount-id`,
`--allow-external-mounts` (needed when a mount is outside the working directory),
`-V/--var`, `--initial-context`, `--validate`, `--list-tools`, `--llm-log`,
`--llm-log-path`, `-v/--verbose`. Added here:

| Option | Meaning |
|---|---|
| `--plugins <dir>` | Physical plugin directory. Read at startup, **not** exposed to the agents |
| `--events jsonl` | Event protocol on stdout; the crew's answer and the logs go to stderr |

Exit codes: `0` success, `1` configuration error (usage, settings, unloadable crew or
plugin), `2` crew failure, `130` cancelled.

`--list-tools` prints the same manifest as `orkeon run --list-tools` of the same Orkeon
version, plus the tools contributed by plugins.

## mounts.json, when no `--mount` is given

The runner accepts exactly the arguments of `orkeon run`; an explicit `--mount` always
wins, and so does an explicit `--settings` (without one, the team's settings file of the
workshop is passed when it exists, D33). As a convenience, when the command line has no
`--mount` and the team folder holds a `mounts.json` (the format owned by `orkeon-bench`), the
mounts are derived from it:

```bash
cd /workspace/teams/my-team
orkeon-harness-run crew --plugins /workspace/library/plugins              # the team's own folders
TEAM_ENV=test orkeon-harness-run crew --plugins /workspace/library/plugins  # the mount set mounts.test/my-team/
```

which is equivalent to what a launcher or the bench passes explicitly: `crew --mount
<abs>:<root>:<access>... [--allow-external-mounts]`, one binding per mount point. The team
folder is the working directory, or else the parent of the crew target. `TEAM_ENV=<name>`
binds every mount point to `mounts.<name>/<team>/<point>/`, two levels above the team folder;
a set without a folder for the team is refused, naming the sets that exist. A writable root is
created on demand, a read-only root must exist, `--allow-external-mounts` is implied when a
binding lies outside the working directory, and the result is reported on stderr:

```
orkeon-harness-run: mounts from /.../mounts.json (environment: default): /workspace:ro /output:rw
```

Not applied with `--list-tools`.

Before anything is mounted, the team's own folders (the `default` of each point; a named mount
set is not judged) go through the rule of `orkeon-bench` on what the agents may reach (D40),
and a `/plugins` root must be `ro`. A mount point may not use: the team folder itself; `crew/`,
or a folder named `agents`, `tasks`, `appsettings` or `_shared` at the root of the team;
outside the team, a folder that holds the team folder, the workshop or the home folder, or that
is or lies inside the workshop's `settings/`, `workbooks/`, `tests/`, `.claude/`, `library/`,
`references/`, `.devcontainer/` or `.git/`, an `appsettings/` or `_shared/` folder above the
team, a hidden folder of the home folder (`~/.config`, `~/.claude`, `~/.ssh`...), the user's
`AppData`, `$XDG_CONFIG_HOME/Orkeon`, `/proc`, or another team's folder or mount set (the
workshop being the folder two levels above the team, and `$ORKEON_WORKSHOP` as well). Any other
folder outside the team passes. Folders are compared ignoring case and judged as written: a
symbolic link is not followed. A folder name ending with a dot or a space is refused: Windows
drops them, so Studio and `run.cmd` would bind another folder there. Outside Windows a Windows host path is refused: it cannot be
mounted from this machine.

## Where plugins come from

In this order: `--plugins <dir>`, the `ORKEON_HARNESS_PLUGINS` environment variable, then
the mount (settings file or `--mount <dir>:/plugins:ro`) that provides the virtual root
named by `Plugins:Directory` (default `/plugins`) - only when its agents cannot write there.
A writable one is skipped and reported, since its agents could drop code that the next run
executes:

```
orkeon-harness-run: plugins NOT loaded from /plugins: its mount (/srv/drop) is writable, so its agents could drop code that the next run executes - mount it read-only (ro), or name the folder with --plugins
```

With none of the three, plugins stay off and the runner behaves like `orkeon run`.

Section `Plugins` of the settings file: `Directory`, `SearchPattern` (`*.dll`),
`ContinueOnError` (`false`), `SharedAssemblyPrefixes`. Layouts, first level only:
`<dir>/X.dll` or `<dir>/X/X.dll`. Each loaded plugin is reported on stderr:

```
orkeon-harness-run: plugin loaded from /plugins: orkeon-harness.sample-extractor 0.1.0
```

Two tools with the same name make the host fail at startup; a plugin must not reuse the
name of a built-in tool.

## Event protocol

`--events jsonl` writes protocol version 2 (`docs/architecture/run-event-bus.md`): one
JSON document per line, envelope `v`, `seq`, `ts`, then `crewId` / `agentId` /
`correlationId` / `causationId` when known, then `kind` and the payload fields, flat.
Absent values are omitted, never `null`.

| `kind` | Payload |
|---|---|
| `run.started` | `target`, `stream` |
| `task.started` | `taskId`, `agentRole` |
| `task.completed` | `taskId`, `agentRole`, `success`, `skipped`, `durationMs`, `tokens`, `toolCalls` |
| `tool.called` / `tool.returned` | `toolName`, `argsSummary?` / `toolName`, `success`, `durationMs` |
| `delegation.started`, `agent.spawned` | `toRole?` / `role?`, `reason?` |
| `cost.updated` | `tokens` (cumulative), `model?`, `provider?` |
| `input.needed` | `inputKind`, `prompt`, `choices?`, `defaultValue?`, `taskDescription?` |
| `error` | `code` (`crew_cancelled` / `crew_failed`), `message`, `recoverable` |
| `run.finished` | `success`, `exitCode`, `tokens`, `durationMs`, `promptTokens`, `completionTokens` |

`taskId` is the runtime id of the task (a ULID), not the YAML file stem.

Differences from `orkeon run --events jsonl`: no `llm.delta` (`--stream` is not offered),
no hub seat (`hub.message` and the inbound verbs `post`, `send`, `publish`, `reply`,
`subscribe` are not implemented). `input.needed` is implemented: the run waits for an
`{"kind":"input.given","correlationId":"...","value":"..."}` line on stdin, and no answer
(stdin closed) is a refusal, never an approval. `--events` has no effect with
`--list-tools` or `--validate`, which print plain text.

## Build, test, publish

```bash
dotnet build -c Release && dotnet test
dotnet publish src/OrkeonHarnessRun -c Release --use-current-runtime --self-contained false -o <dir>
```

The harness image publishes it to `/usr/local/lib/orkeon-harness-run` and links
`/usr/local/bin/orkeon-harness-run`. The publish folder is about 170 MB: it carries the
whole framework, every built-in tool family and the local-embeddings model.

`smoke/plugin-smoke.sh "<runner command>" <SampleExtractor.Plugin.dll>` checks the plugin
route end to end with no model and no network (echo provider): tool absent without the
plugin, listed with it in both layouts, not loaded from a writable `/plugins` mount, crew
refused then validated, evented run, mounts
taken from `mounts.json`, and - when esbuild is available - the TypeScript crew
`smoke/crew-ts/crew.ork.ts` naming the same tool.

For `.ork.ts` targets esbuild is looked up in `Orkeon:Scripting:Toolchain:EsbuildPath`,
`ORKEON_ESBUILD_PATH`, `esbuild-bin/esbuild` next to the runner, then the `PATH`.

## Implementation notes

* `Plugins/PluginBootstrap.cs` builds the file system `AddOrkeonPlugins` needs at
  registration time: a private read-only mount of the plugin directory, discarded once the
  assemblies are loaded. It takes no plugin folder from a mount its agents can write to.
* `Plugins/PluginDirectoryPathValidator.cs` exists because Orkeon's stock `PathValidator`
  refuses `.dll` files: through the regular VFS, discovery silently finds nothing.
* The direct reference to `SmartComponents.LocalEmbeddings` in the project file is
  required: the runner host enables on-device embeddings by default, and that package
  delivers its model through build targets that do not reach transitive consumers. The
  model is downloaded from huggingface.co at the first build and kept in the NuGet cache.
* `Events/` is a compact re-implementation of the CLI's observer (the CLI's own classes
  are internal to `Orkeon.Scripting.Cli`).
* `Mounts/MountsFile.cs` is the same reader as in `OrkeonCrewHost`; its rules mirror the
  `orkeon-bench` domain (`mounts[]` with `root`, `access`, `role`, `default`; the named
  mount sets `mounts.<name>/<team>/`; `environments` refused; reserved roots; a read-only
  `/plugins`; no `~` / `$` / `%` paths; what the agents may reach, D40).
