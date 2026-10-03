# Troubleshooting

*English · [Français](../fr/reference/troubleshooting.md)*

Start with `orkeon-bench doctor` in the container: it checks the Orkeon CLI and its tool catalogue,
esbuild, PyYAML, the local model server and its concurrency limit, the typings, the workshop layout and
stray settings files.

## Getting the image and starting

| Problem | What to do |
|---|---|
| `docker pull` asks for a login, or says the image does not exist | the package is not public yet: build the image yourself (`docker build -t orkeon-workshop .devcontainer` from a clone of the repository) |
| `could not select device driver "" with capabilities: [[gpu]]` | Docker cannot hand a GPU to the container: remove `--gpus=all`, or set up the GPU ([Models](../guides/models.md#using-the-gpu)) |
| `docker: invalid reference format` in PowerShell | a line continuation went wrong: each line but the last must end with a backquote `` ` `` and nothing after it |
| `Conflict. The container name "/my-orkeon-workshop" is already in use` | the container exists: `docker start -ai my-orkeon-workshop`, or remove it first with `docker rm my-orkeon-workshop` |
| the container starts, but `workshop` says `claude: command not found` | the first start could not download Claude Code (no network): `workshop` retries at each call; check the connection |

## The workshop

| Problem | What to do |
|---|---|
| `[harness] /workspace is not an Orkeon workshop … Nothing deployed.` | the folder mounted on `/workspace` holds something else — a source project? Mount your Orkeon folder instead, or run `sync-harness.sh --adopt` once if this folder really is meant to be a workshop |
| `workshop: no harness in /workspace` | same cause: the harness was not deployed there |
| my files in `.claude/` were replaced | `.claude/` belongs to the image: your previous version is in `.claude/harness-backup/<stamp>/`. Put your own settings in `.claude/settings.local.json`, your additions in `.claude/local/` |
| `orkeon-bench doctor`: `FAIL workshop layout` | `ORKEON_WORKSHOP` points at a folder that does not exist, or the workshop was not mounted |

## Teams

| Problem | What to do |
|---|---|
| Orkeon Studio does not list my team | the list does not depend on what the folder holds: the team must be a folder of `%USERPROFILE%\Orkeon\teams` — is your workshop `%USERPROFILE%\Orkeon` itself? The team folder's name must not start with a dot, nor the folder be Hidden or System; an archived team is under Archives. Studio re-reads the list when "My teams" opens |
| Studio lists the team but finds no crew, runs the wrong thing, or the launch fails on `config.yaml (or crew.yaml) not found` | at the root of the team, an `agents/` or `tasks/` folder (a mount point's folder included) or the flat triplet `crew.yaml` + `agents.yaml` + `tasks.yaml` makes Studio take the team folder for the crew, a `crew.ork.ts` is run instead of `crew/`, and another `*.ork.ts` makes Studio ask which script to run; a `*.ork.ts` next to a YAML crew hides it. `orkeon-studio-check <slug>` names the cause |
| Studio launches the team without its folders | Studio could not read `studio-team.json` (a comment, a trailing comma, a wrong type) and ignored it: `orkeon-studio-check <slug>` gives the parse error |
| Studio's run stops on `mount source directory does not exist` | a folder of the team is missing (a fresh clone keeps no empty folder): run `orkeon-bench scaffold <team>`, which recreates the folders and their `.gitkeep` |
| `Crew configuration references unknown tool(s): x` | the tool name does not exist in Orkeon's catalogue (`orkeon run --list-tools`), or it is a plugin tool: run the team with `orkeon-harness-run` ([C# tools](../guides/csharp-tools.md)) |
| `run.sh: <folder> does not exist (mount point /x)` | a read-only folder of the team is missing: create it, or run `orkeon-bench scaffold <team>` again |
| `run.sh: no mount set 'x' for this team` | create `mounts.x/<team>/` in the workshop, with one folder per mount point |
| Studio refuses to launch the team because of a folder | Studio accepts only folders inside the team (never the team folder itself), or folders declared, spelled exactly, in its Settings › Authorized folders |
| `orkeon-bench scaffold`: `error: mounts.json: /x is bound to …` | the folder of that mount point is one its agents must never reach (the team folder, `crew/` or a reserved name at its root; outside it, the workshop's own folders, a settings folder Orkeon reads, a hidden folder of the home folder, `/proc`, another team): give the point a folder of its own ([Mount points](../concepts/mount-points.md#what-a-mount-point-may-not-open)) |
| `orkeon-bench doctor`: `FAIL stray settings files`, or a `[harness] WARNING` about an `appsettings.json` at start-up | a settings file sits where Orkeon looks on its own: in `appsettings/` or `_shared/` above the crews, it replaces the machine's settings for every run that names none — every Studio launch, unless an Expert pins a file; an `appsettings*.json` in a team folder is read beneath the settings of every run started there. Remove it; a team's own settings live in `settings/<slug>/appsettings.json` |
| a team's model or mail account differs in Studio | Studio does not read `settings/<slug>/`: it runs the team on its own settings, or on the profile the card names. Pin the file in Run › Advanced options (Expert mode) for a launch that needs it |
| `run-gate: remote run refused` | the run would reach a paid remote model without an approval: this is intended. Use the local model; for a paid run, the approval is recorded in the open attempt once you have given your explicit yes ([Models](../guides/models.md#the-approval-of-paid-runs)) — or start the run yourself, in a terminal or with `!` |
| a write is refused by `guard-phase` | the method allows that folder at another phase or to another role; the message says which. Follow it rather than working around it |

## Local models

| Problem | What to do |
|---|---|
| `orkeon-bench doctor`: `WARN Ollama reachable … ECONNREFUSED` | the model server is starting, or `OLLAMA_MODE=off`; see `/var/log/ollama.log` |
| the model was never downloaded | the models folder is not a volume: start the container with `-v cc-ollama:/home/node/.ollama/models`, or set `OLLAMA_AUTO_PULL=1` |
| a team is very slow | check where the model runs with `orkeon-update --check` and `ollama ps` — `100% GPU` is the goal ([Models](../guides/models.md)) |
| a model pull fails with the firewall on | add the Ollama hosts to `FIREWALL_EXTRA_DOMAINS` ([configuration](./configuration.md#firewall)) |

## .NET

| Problem | What to do |
|---|---|
| a restore tries nuget.org and fails | the package is not in the container's cache: open `api.nuget.org` in the firewall, or stay with the packages the templates use |
| a build fails with `ORKVFS00x` | a tool used `System.IO`: go through Orkeon's virtual file system |
| build output from Windows breaks the build | `clean-restore.sh <project folder>` |

Still stuck? Ask Claude in the workshop — it can read the logs and the files — or open an issue on the
repository.
