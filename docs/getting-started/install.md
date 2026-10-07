# Install

*English · [Français](../fr/getting-started/install.md)*

This page takes you from nothing to Claude Code open in your workshop. No programming is needed:
you copy a few commands into a terminal. Count on 30 to 60 minutes, most of it downloads.

> Prefer to be walked through it? Paste the prompt of [Discover with Claude](../discover-with-claude.md)
> into a Claude chat and say *"help me install it"*.

## What you need

| | |
|---|---|
| A computer | Windows 10/11 or Linux, on an x86-64 processor. macOS is not tested (the image is built for `linux/amd64` only). |
| Docker | [Docker Desktop](https://docs.docker.com/desktop/) on Windows, with the **WSL 2 based engine** (Settings → General); Docker Engine on Linux. |
| Disk space | about 20 GB for the image, plus 5 GB for the default local model. |
| A Claude account | one that gives access to Claude Code — see [Claude Code's documentation](https://code.claude.com/docs/en/overview). |
| A graphics card (optional) | an NVIDIA GPU makes the local models fast. Without one they run on the processor, more slowly. |

## 1. Get the image

Open a terminal — **PowerShell** on Windows (Start menu → "PowerShell"), any terminal on Linux — and run:

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

The first line downloads the image (about 19 GB, so it takes a while). The second gives it the short
name `orkeon-workshop` that every other command uses.

## 2. Choose the workshop folder

The **workshop** is a folder of your computer where your teams live. Its name is up to you, and it may
already exist:

- **You already have Orkeon teams** — the folder that holds them, with its `teams\` subfolder, is your
  workshop. On Windows it is usually `%USERPROFILE%\Orkeon`, the folder Orkeon Studio reads by default.
  Nothing to create: the first start deploys the harness next to your teams and leaves them untouched.
- **You start from nothing** — create an empty folder anywhere. On Windows, `%USERPROFILE%\Orkeon` is the
  simplest choice, since Orkeon Studio lists the teams of that folder without any setting; any other
  folder works too, once Studio is pointed at its `teams` subfolder
  ([The workshop](../concepts/workshop.md#orkeon-studio-sees-it)).

The commands below keep the folder in a variable, `$workshop` on Windows and `workshop` on Linux: set it
to your folder once, and the start command uses it.

```powershell
# Windows (PowerShell)
$workshop = "$env:USERPROFILE\Orkeon"                        # your folder, existing or new
New-Item -ItemType Directory -Force $workshop | Out-Null     # creates it only if it does not exist
```

```bash
# Linux
workshop="$HOME/Orkeon"                                      # your folder, existing or new
mkdir -p "$workshop"                                         # creates it only if it does not exist
```

On Linux, the container writes as the user `node`, uid 1000: if `id -u` prints another number, give that
uid write access to the folder too, for instance `sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX "$workshop"`.

A folder that is neither empty nor a folder of teams — a source project, say — is refused at the first
start, so that nothing is deployed into the wrong place ([Troubleshooting](../reference/troubleshooting.md#the-workshop)).

## 3. Start the container

On Windows, in PowerShell (the backquote `` ` `` continues the command on the next line; `${workshop}` is
the folder of step 2):

```powershell
docker run -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${workshop}:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop
```

On Linux:

```bash
docker run -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$workshop:/workspace" \
  -e DOCKER_MODE=socket orkeon-workshop
```

> **No NVIDIA graphics card?** Remove `--gpus=all`, or the container will not start.
>
> **The start failed on a GPU error** (`could not select device driver`, `no adapters were found`…)?
> The container was often created anyway, and `docker start` would fail the same way. Remove it with
> `docker rm my-orkeon-workshop`, then run the command again, with the GPU set up or without
> `--gpus=all` — [the `--gpus=all` option](../reference/troubleshooting.md#the---gpusall-option) goes
> through each error.

What each part does:

| Part | Why |
|---|---|
| `--name my-orkeon-workshop` | the name of your container, to reopen it later |
| `-v "<your folder>:/workspace"` | **your workshop**: inside the container it is `/workspace`, and everything written there lands in your folder |
| `-v cc-ollama:/home/node/.ollama/models` | a Docker volume for the local models: downloaded once, kept when the container is replaced |
| `-v my-orkeon-workshop-claude:/home/node/.claude`, `-e CLAUDE_CONFIG_DIR=…` | a volume for Claude Code's state — your sign-in, history and memory — so that a new container, after an update of the image, keeps it ([Updating](../guides/updating.md)) |
| `--gpus=all` | lets the local models use your NVIDIA GPU |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | needed by the optional firewall |
| the Docker socket, `-e DOCKER_MODE=socket`, `--add-host` | Docker from inside the container, for the SonarQube quality stack — teams do not need it ([Docker modes](../guides/docker-modes.md)) |

Every option and variable is in [Container options and variables](../reference/configuration.md).

## 4. What happens at the first start

The container prepares itself, which takes a minute or two the first time:

- it installs Claude Code (the published image does not contain it: it is Anthropic's software);
- it deploys the harness into your workshop — you will see lines like
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)`;
- it starts the local model server (Ollama) and downloads the default model, `qwen3:8b` (about 5 GB),
  **in the background**: you can work meanwhile.

It ends with a prompt inside the container, and this line among the messages:

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? then type /orkeon-tour in Claude Code)
```

Your workshop folder now holds `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`, `settings/` and a
few more: [The workshop](../concepts/workshop.md) explains each of them.

## 5. Check that everything works

```bash
orkeon-bench doctor
```

```text
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20261006.g77ac8a9
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20261006.g77ac8a9
PASS  orkeon tool catalogue           83 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
PASS  Ollama reachable                http://127.0.0.1:11434/api/tags
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
Result: OK
```

A `WARN` is not an error: `Ollama reachable` warns, for instance, while the model server is still
starting, and `orkeon CLI on PATH` warns when the image's Orkeon is another commit than the one the
reference documents were checked on — an image you built yourself from the head of Orkeon's `main`, or
after `orkeon-update`; the published image carries the commit they were checked on. A `FAIL`
is explained in [Troubleshooting](../reference/troubleshooting.md).

## 6. Open Claude Code in the workshop

```bash
workshop
```

The first time, Claude Code asks you to sign in: it shows a link — open it in your browser, sign in,
and paste the code it gives you back into the terminal. It also asks, once, to accept its
bypass-permissions mode, which `workshop` starts it in: read the warning and choose to accept — the
choice selected at first is the one that exits. Then type:

```text
/orkeon-tour
```

and let the guided tour show you around. Or ask directly for a team — see
[Your first team](./first-team.md).

## Later: reopen, add a terminal, stop

```powershell
docker start -ai my-orkeon-workshop                    # reopen the container (then: workshop)
docker exec -it --user node my-orkeon-workshop zsh     # a second terminal in the same container
```

Typing `exit` in the first terminal stops the container; your workshop folder and the models volume
stay. To install a newer image later, see [Updating](../guides/updating.md).

## Other ways to start

- **VS Code**: open the workshop folder in VS Code and run *Reopen in Container* —
  [The workshop in VS Code](./vs-code.md).
- **Build the image yourself** instead of pulling it: `docker build -t orkeon-workshop .devcontainer`
  from a clone of the repository — [Building the image](../../.devcontainer/README.md).

Next: [Your first team](./first-team.md).
