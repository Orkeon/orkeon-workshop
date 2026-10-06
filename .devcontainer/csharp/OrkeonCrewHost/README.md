# SampleTeam.Host - a C# host for an Orkeon team

Template of a team whose program is written in C#: it wires Orkeon itself, mounts the
team's virtual roots from `mounts.json`, registers the team's C# tools, loads the crew and
runs it, and writes an `events.jsonl` in the same protocol as `orkeon run --events jsonl`.

Use it when a team needs what YAML and TypeScript do not expose (`StateGraph`, flows,
checkpoint stores, `IResumeEngine`, active RAG, the evaluation subsystem), or when a C#
tool should be compiled in rather than delivered as a plugin. A team that only needs a C#
tool can stay YAML and use a plugin with `orkeon-harness-run` instead.

## Layout (the folder is the team directory)

```
mounts.json              the mount points of the team and their folders
appsettings.json         Llm section (Ollama, no key), RateLimiting, logging
crew/                    YAML crew: config.yaml, agents/*.yaml, tasks/*.yaml
input/                   default binding of /workspace (sample data)
run.sh, run.cmd          launchers
SampleTeam.sln
src/SampleExtractor/     the team's tool, as a library (in the workshop: a project
                         reference into library/tools/csharp/<Tool>/)
src/SampleTeam.Host/
  Program.cs, HostOptions.cs, TeamRun.cs
  Mounts/MountsFile.cs                         mounts.json -> mount strings
  Composition/TeamHost.cs                      the wiring, in the order Orkeon imposes
  Composition/LlmProviderRegistration.cs       Llm section -> provider (echo when absent)
  Composition/TeamTools.cs                     the tools of the team (edit here)
  Composition/DependencyInjectionToolRegistry.cs
  Crews/CrewLoader.cs                          YAML crew, or CrewBuilder when crew/ is absent
  Events/                                      event stream (same classes as OrkeonRunner)
tests/SampleTeam.Host.Tests/                   startup tests without LLM, mounts.json tests
```

## Run

```bash
./run.sh                      # the team's own folders (the default of each mount point)
TEAM_ENV=test ./run.sh        # the mount set mounts.test/<team>/ of the workshop
./run.sh --validate           # build the host and load the crew, no model call
./run.sh --input "context" --var topic=notes --events run/events.jsonl
```

| Option | Meaning |
|---|---|
| `--team-dir <dir>` | Team directory (default: current directory) |
| `--env <name>` | Mount set to bind: `mounts.<name>/<team>/` next to `teams/` (default: `$TEAM_ENV`, else the team's own folders) |
| `--events <target>` | Event file, `-` for stdout, `none` to disable (default `run/events.jsonl`) |
| `--input <text>` | Initial context handed to the crew |
| `--var KEY=VALUE` | Template variable (`{KEY}` in task descriptions); repeatable |
| `--validate` | Prints `VALIDATION OK: ... (agents=N, tasks=M, tools resolved=K)` or the load error |

Exit codes: `0` success, `1` configuration error, `2` crew failure, `130` cancelled.
The crew's answer goes to stdout, logs to stderr. When `/output` is a writable root the
framework also writes `AUTO_SUMMARY.md` there, as under `orkeon run`.

## mounts.json

The format is owned by the `orkeon-bench` CLI; this host reads the same file with the
same rules.

```json
{
  "version": 1,
  "mounts": [
    { "root": "/workspace", "access": "ro", "role": "inputs",       "default": "./input"  },
    { "root": "/output",    "access": "rw", "role": "deliverables", "default": "./output" }
  ]
}
```

* `mounts[]`: the mount points of the team, free in name and number.
* `root`: one lowercase segment (`/mailbox`); the crew only ever names virtual paths.
* `access`: `ro`, `rw` or `rwnd` (read-write, no delete). `role`: a kebab-case word
  (`inputs`, `deliverables`, `state`, `archive`, `mailbox`, `reference`...).
* `default`: the folder of the mount point when the team runs on its own folders, relative to
  the team folder or absolute. `description`: optional.
* A named mount set is a folder, not an entry of the file: `TEAM_ENV=<name>` (or `--env`)
  binds every mount point to `mounts.<name>/<team>/<point>/`, two levels above the team folder
  (next to `teams/`); a set without a folder for the team is an error naming the sets that exist.
* Refused: the roots reserved to the runner (`/crew`, `/script`, `/llm-logs`, `/sandbox`,
  `/credentials`), a duplicate root, an empty list, the `environments` key of the first format,
  a path starting with `~`, `$` or `%` (nothing expands them), a `/plugins` root that is not
  `ro` (orkeon-harness-run loads plugins from it), and - outside Windows - a Windows host path
  (`C:\Shares\inbox`).
* What the agents may reach (D40): the folder behind a mount point is all its agents reach, so
  the team's own folders (the `default` of each point; a named mount set is not judged) are
  checked as `orkeon-bench` and the check scripts do. A mount point may not use: the team
  folder itself; `crew/`, or a folder named `appsettings` or `_shared` at the root of the
  team; outside the team, a folder that holds the team folder, the workshop or the
  home folder, or that is or lies inside the workshop's `settings/`, `workbooks/`, `tests/`,
  `.claude/`, `library/`, `references/`, `.devcontainer/` or `.git/`, an `appsettings/` or
  `_shared/` folder above the team, a hidden folder of the home folder (`~/.config`,
  `~/.claude`, `~/.ssh`...), the user's `AppData`, `$XDG_CONFIG_HOME/Orkeon`, `/proc`, or another
  team's folder or mount set. The workshop is the folder two levels above the team, and
  `$ORKEON_WORKSHOP` as well when it names another one. Any other folder outside the team passes
  (orkeon-bench warns that Orkeon Studio launches the team only when that folder is declared,
  spelled exactly, in its Authorized folders). On Windows the same folders are judged natively,
  the home folder being the user profile. Folders are compared ignoring case and judged as
  written: a symbolic link is not followed. A folder name ending with a dot or a space is
  refused: Windows drops them, so Studio and `run.cmd` would bind another folder there.
* A writable root is created on demand; a read-only root must exist.

The host also mounts `crew/` read-only as `/crew` (the YAML loader reads through the VFS)
and the directory of the event file as an internal root `/_run`, which no agent can
address and no team can declare. That is why the event file needs a directory of its own:
everything under an internal root is hidden from the agents, so `--events events.jsonl` at
the top of the team folder is refused.

## Settings

`appsettings.json`, then `appsettings.local.json` (untracked), then the team's settings file
of the workshop, `settings/<team>/appsettings.json` two levels above the team folder (D33),
then the `ORKEON_` environment - the same variables as the CLI (`ORKEON_Llm__BaseUrl`,
`ORKEON_Llm__Model`, `ORKEON_Llm__ApiKey`...), merged key by key. The mounts are the host's
alone: a settings file (or an `ORKEON_` variable) that declares `Orkeon:FileSystem:Mounts` or
`Orkeon:FileSystem:InternalMounts` is refused, since configuration merges an array index by
index and such an entry would silently stay mounted; the folders the host allows the path
validator come after the `PathSecurity:AdditionalAllowedDirectories` a settings file declares.
A team kept in a workshop
puts its settings in `settings/<team>/`, never in its folder; the template's own
`appsettings.json` serves the solution on its own, until lot 8 moves it out. Never write a
key in a settings file. The provider is
inferred from `Llm:BaseUrl` (localhost or port 11434 means Ollama); keep `BaseUrl` for a
local model. Without an `Llm` section the host uses an echo provider that replays the
prompt: no model, no network - which is what the tests rely on.

The `Llm` section and its profiles are read when the host is built, as `orkeon run` reads
them: a value that cannot be read (a `TimeoutSeconds` of `"600s"`, a `Temperature` that is no
finite number) ends the run with exit code 1 and the key to fix. The host builds its
container by hand and never starts it: unlike `orkeon run`, which judges every setting it
reads at its start, it judges any other section when a service first reads it, and does not
report a key no section carries. `RateLimiting` bounds every call to a configured model,
where its provider enters the runtime; the template's `appsettings.json` allows one request
at a time (`MaxConcurrentRequests`).

## Events

`run/events.jsonl` carries protocol version 2: `run.started`, `task.started`,
`task.completed`, `tool.called`, `tool.returned`, `delegation.started`, `agent.spawned`,
`cost.updated`, `error`, `run.finished` (same envelope and payloads as `orkeon-harness-run`, see
`OrkeonRunner/README.md`). It is written through the VFS and flushed line by line, so a
watcher can follow a run. `input.needed` is not emitted: a task declared `humanInput` is
auto-approved, as in an unattended `orkeon run`.

## Adapt it to a team

1. Rename `SampleTeam` (solution, project, namespace) and replace `src/SampleExtractor`
   by project references to the team's tools.
2. `Composition/TeamTools.cs`: the tool suites and the team's tools.
3. `crew/` for a YAML crew; or delete `crew/` and write the crew in
   `Crews/CrewLoader.cs` with `AgentBuilder`, `CrewTaskBuilder`, `CrewBuilder`.
4. `mounts.json` for the roots; keep the definition free of physical paths.
5. Keep the startup tests green: they are the C# equivalent of `orkeon run --validate`.

## Build and test

```bash
dotnet build -c Release && dotnet test
```

The tests build the host for real, load the YAML crew and the code-built crew, check that
no model was called, and run the crew once on the echo provider to check the event stream.
