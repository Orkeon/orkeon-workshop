# C# tools

*English · [Français](../fr/guides/csharp-tools.md)*

A YAML or TypeScript team cannot do I/O of its own beyond Orkeon's built-in tools. Anything more —
parsing a binary format, calling an internal API, heavy computation — is an **Orkeon tool in C#**. The
image ships four .NET templates — a tool, a plugin, a team host, and `orkeon-harness-run`, the runner that
loads plugins — and every package they need, so that they build without network.

> **Planned (lot 8):** the `orkeon-tool-csharp` and `orkeon-crew-csharp` skills, and C# teams measured by
> the bench. Today Claude works from the templates below.

## The templates

They live in `/usr/local/share/orkeon-harness/csharp/` in the container:

| Template | What it is |
|---|---|
| `OrkeonTool/` | a C# tool as a library: `Domain/` (pure logic), `Tool/` (the Orkeon tool, file access through the virtual file system only), tests |
| `OrkeonPlugin/` | a plugin that registers the tool, to drop in a plugin folder |
| `OrkeonRunner/` | `orkeon-harness-run`: the `orkeon run` pipeline **plus plugin loading** — installed on the `PATH` |
| `OrkeonCrewHost/` | a console program that hosts a C# team: mounts from `mounts.json`, tools, crew, an event file |

Each is a self-contained solution that follows the conventions of the Orkeon repository (all analyzers,
warnings as errors, central package versions, xUnit v3), so code written here would pass Orkeon's CI.

## Create a tool

A C# tool lives in the workshop's `library/tools/csharp/<Name>/`. From the template:

```bash
/usr/local/share/orkeon-harness/csharp/OrkeonTool/new-tool.sh InvoiceParser invoice_parser /workspace/library/tools/csharp
cd /workspace/library/tools/csharp/InvoiceParser
dotnet build -c Release && dotnet test
```

`InvoiceParser` names the projects, namespace and classes; `invoice_parser` is the name a crew lists
under `tools:`. The template's sample logic (`KeyValueExtractor`) is the starting point: replace it with
yours, then adapt the request and response records and the tests.

**File access goes through Orkeon's virtual file system.** An analyzer makes `System.IO` a build error
in `src/` (`ORKVFS001`–`007`): a tool reads `/invoices/march.pdf`, never a disk path.

## Put the tool in front of a team

| | Plugin + `orkeon-harness-run` | C# host |
|---|---|---|
| The crew | YAML or `.ork.ts`, unchanged — it lists the tool by name | YAML under `crew/`, or built in C# |
| The tool | one DLL dropped in a folder | compiled into the host |
| `--validate`, `--list-tools`, `--events jsonl` | yes | `--validate` and an event file |
| Launched by Orkeon Studio | no | no |
| C#-only features (state graphs, flows, checkpoint stores, resume) | no | yes |

**The plugin route** is tried first. Neither `orkeon run` nor Studio loads plugins, hence the harness's
own runner:

```bash
orkeon-harness-run crew --plugins /workspace/library/plugins --validate
orkeon-harness-run crew --plugins /workspace/library/plugins --events jsonl
```

Without `--mount`, it reads the team's `mounts.json`, and `TEAM_ENV=<set>` binds a mount set; without
`--settings`, it passes the team's own settings file, `settings/<slug>/appsettings.json` of the workshop, when
there is one — like the launchers. A team that uses a plugin tool is launched by this runner, not by Studio.

**The C# host** (`OrkeonCrewHost/`) is the fallback, and the only route for the features only C#
exposes.

## Building without network

The container's firewall, when it runs, rejects nuget.org. It does not matter: the Orkeon packages nuget.org does not
carry were packed from the Orkeon sources into a local feed when the image was built, and every package
the templates need is in the shared cache (`NUGET_PACKAGES`). A new tool restores and builds offline.
Adding a package that is not in the cache needs the network — open `api.nuget.org` with
`FIREWALL_EXTRA_DOMAINS` ([configuration](../reference/configuration.md#firewall)).

To check the whole set in one command:

```bash
/usr/local/share/orkeon-harness/csharp/scripts/verify-templates.sh --offline --smoke
```

It restores, builds and tests every template on a copy, repeats the build with the network cut, then
loads the plugin end to end with the runner.

## A .NET project shared with Windows

When a project's `bin/` and `obj/` were produced on Windows, clean them and restore for the container:

```bash
clean-restore.sh /workspace/library/tools/csharp/InvoiceParser
```

It refuses the root of the workshop — your teams are not build output.

More: the [README of the templates](../../.devcontainer/csharp/README.md) (the local feed, the image
integration, what differs from Orkeon's documentation).

Next: [Models: local and remote](./models.md).
