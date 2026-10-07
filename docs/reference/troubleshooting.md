# Troubleshooting

*English · [Français](../fr/reference/troubleshooting.md)*

Start with `orkeon-bench doctor` in the container: it checks the Orkeon CLI and its tool catalogue,
esbuild, PyYAML, the local model server and its concurrency limit, the typings, the workshop layout and
stray settings files.

## Getting the image and starting

| Problem | What to do |
|---|---|
| `docker pull` asks for a login, or says the image does not exist | the package is not public yet: build the image yourself (`docker build -t orkeon-workshop .devcontainer` from a clone of the repository) |
| `could not select device driver "" with capabilities: [[gpu]]`, `nvidia-container-cli: initialization error: …` | Docker cannot hand a GPU to the container: see [the `--gpus=all` option](#the---gpusall-option) below — and remove the container the failed start left behind before trying again |
| `docker: invalid reference format` in PowerShell | a line continuation went wrong: each line but the last must end with a backquote `` ` `` and nothing after it |
| `Conflict. The container name "/my-orkeon-workshop" is already in use` | the container exists: `docker start -ai my-orkeon-workshop` reopens it. If its last start failed — on a GPU error, say — `docker start` fails the same way, since a container keeps the options it was created with: remove it with `docker rm my-orkeon-workshop`, then `docker run` again |
| the container starts, but `workshop` says `claude: command not found` | the first start could not download Claude Code (no network): `workshop` retries at each call; check the connection |

## The `--gpus=all` option

`--gpus=all` asks Docker to hand your NVIDIA GPU to the container. When Docker cannot, `docker run`
stops on one of the errors below. **Whatever the error, first check whether the container was created
anyway**: Docker creates it before starting it, and the failure usually comes at the start.

```bash
docker ps -a --filter name=my-orkeon-workshop
```

If `my-orkeon-workshop` is listed, remove it before anything else — `docker start` would fail exactly the
same way, since a container keeps the options it was created with:

```bash
docker rm my-orkeon-workshop
```

Nothing is lost: your workshop folder and the two volumes (local models, Claude Code's state) survive
`docker rm`. Then run the `docker run` command again, either with the GPU set up as the table says, or
**without `--gpus=all`**: the local models then run on the processor, more slowly, and everything else
works the same ([Models](../guides/models.md#using-the-gpu)). To check the GPU side without creating the
container: `docker run --rm --gpus=all --entrypoint nvidia-smi orkeon-workshop` prints the GPU table when
all is well, and the same error otherwise.

| Error | Cause | What to do |
|---|---|---|
| `could not select device driver "" with capabilities: [[gpu]]` | Docker has no GPU runtime at all. Linux: the NVIDIA Container Toolkit is not installed, or not registered with Docker. Windows: Docker Desktop is not on the WSL 2 based engine | Linux: install the [toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), then `sudo nvidia-ctk runtime configure --runtime=docker` and `sudo systemctl restart docker`. Windows: Settings → General → *Use the WSL 2 based engine*, restart Docker Desktop. Or remove `--gpus=all` |
| `nvidia-container-cli: initialization error: WSL environment detected but no adapters were found` (Windows, Docker Desktop; preceded by `error running prestart hook`) | WSL sees no NVIDIA GPU: the computer has none (an AMD or Intel card does not count), the NVIDIA Windows driver is missing or too old for WSL, or WSL itself is out of date | In PowerShell: `nvidia-smi` — if it fails, there is no usable NVIDIA GPU: remove `--gpus=all`. If it works: `wsl --update`, then `wsl -- nvidia-smi`; if that one fails, update the NVIDIA driver *from Windows* (never inside WSL), restart Docker Desktop, and try again |
| `nvidia-container-cli: initialization error: nvml error: driver not loaded`, or `Driver/library version mismatch` (Linux) | the NVIDIA kernel driver is not loaded, or was just updated and the old one is still running | `nvidia-smi` on the host must print the GPU table; after a driver update, reboot |
| `Conflict. The container name "/my-orkeon-workshop" is already in use`, right after one of the errors above | the failed `docker run` had created the container | `docker rm my-orkeon-workshop`, then `docker run` again |
| the container starts, but `nvidia-smi: command not found` inside it, or `ollama ps` shows `100% CPU` on a computer with an NVIDIA GPU | the container was created without `--gpus=all`; the option cannot be added afterwards | recreate it with `--gpus=all` ([Updating](../guides/updating.md#moving-a-container-to-a-new-image)); the volumes keep the models and Claude Code's state |

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
| Orkeon Studio does not list my team | the list does not depend on what the folder holds: the team must be a folder of Studio's teams folder — `%USERPROFILE%\Orkeon\teams` unless Studio was pointed elsewhere. Settings › Studio, "Teams folder", shows the folder in force and where it comes from: for a workshop in another folder, set it to `<workshop>\teams` and restart Studio ([The workshop](../concepts/workshop.md#orkeon-studio-sees-it)). The team folder's name must not start with a dot, nor the folder be Hidden or System; an archived team is under Archives. Studio re-reads the list when "My teams" opens |
| Studio lists the team but finds no crew, runs the wrong thing, or the launch fails on `config.yaml (or crew.yaml) not found` | Studio reads `crew/` first, and only when `crew/` holds no crew it can run — it is empty, a `*.ork.ts` sits next to a YAML crew, or it holds several scripts and no `crew.ork.ts` — does it fall back on the root of the team: an `agents/` or `tasks/` folder there (a mount point's folder included) or the flat triplet `crew.yaml` + `agents.yaml` + `tasks.yaml` then makes Studio take the team folder for the crew, a `crew.ork.ts` is run, and another `*.ork.ts` makes Studio ask which script to run. `orkeon-studio-check <slug>` names the cause |
| Studio launches the team without its folders | Studio could not read `studio-team.json` (a comment, a trailing comma, a wrong type) and ignored it: `orkeon-studio-check <slug>` gives the parse error |
| Studio refuses the launch on `Nothing to read: the team's folder '…' (mount point /x) does not exist` | a read-only folder of the team is missing (a fresh clone keeps no empty folder): create it and put the inputs there, or run `orkeon-bench scaffold <team>`, which recreates the folders and their `.gitkeep`. A missing writable folder is created by Studio at launch |
| `Crew configuration references unknown tool(s): x` | the tool name does not exist in Orkeon's catalogue (`orkeon run --list-tools`), or it is a plugin tool: run the team with `orkeon-harness-run` ([C# tools](../guides/csharp-tools.md)) |
| `run.sh: <folder> does not exist (mount point /x)` | a read-only folder of the team is missing: create it, or run `orkeon-bench scaffold <team>` again |
| `run.sh: no mount set 'x' for this team` | create `mounts.x/<team>/` in the workshop, with one folder per mount point |
| Studio refuses to launch the team because of a folder | Studio accepts only folders inside the team (never the team folder itself), or folders declared, spelled exactly, in its Settings › Authorized folders |
| `orkeon-bench scaffold`: `error: mounts.json: /x is bound to …` | the folder of that mount point is one its agents must never reach (the team folder, `crew/` or a reserved name at its root; outside it, the workshop's own folders, a settings folder Orkeon reads, a hidden folder of the home folder, `/proc`, another team): give the point a folder of its own ([Mount points](../concepts/mount-points.md#what-a-mount-point-may-not-open)) |
| `orkeon-bench doctor`: `FAIL stray settings files`, or a `[harness] WARNING` about an `appsettings.json` at start-up | a settings file sits where Orkeon looks on its own: in `appsettings/` or `_shared/` above the crews, it replaces the machine's settings for every run that names none — in Studio, the launch of every team without a settings file of its own, unless an Expert pins a file; in a team's `crew/`, the same. Remove it; a team's own settings live in `settings/<slug>/appsettings.json` |
| a team's model or mail account differs in Studio | Studio passes `settings/<slug>/appsettings.json` on its own only to a team of the teams folder it lists — the Run screen then shows a "Team settings file" line; a team launched from a folder picked by hand runs on Studio's own settings. The model setting the card names (`"profile"`, spelled exactly as in Studio) is laid over the file's `Llm` section, and a file pinned in Run › Advanced options (Expert mode) replaces the team's. An account declared in Studio's Settings › E-mail lives in Studio's own settings (the tab names the file) and its password in your Windows user environment: a team launched on its `settings/<slug>/appsettings.json`, and any run in the container, does not see them |
| `run-gate: remote run refused` | the run would reach a paid remote model without an approval: this is intended — a remote named profile in the settings counts too, even beside a local default model, since any agent may name it. Use the local model; for a paid run, the approval is recorded in the open attempt once you have given your explicit yes ([Models](../guides/models.md#the-approval-of-paid-runs)) — or start the run yourself, in a terminal or with `!` |
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
