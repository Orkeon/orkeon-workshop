# Install

*English · [Français](../fr/getting-started/install.md)*

This page takes you from nothing to Claude Code open in the folder of your role — a workshop, or a git
checkout. No programming is needed: you copy a few commands into a terminal. Count on 30 to 60 minutes,
most of it downloads.

> Prefer to be walked through it? Paste the prompt of [Discover with Claude](../discover-with-claude.md)
> into a Claude chat and say *"help me install it"*.

## What you need

| | |
|---|---|
| A computer | Windows 10/11 or Linux, on an x86-64 processor. macOS is not tested (the image is built for `linux/amd64` only). |
| Docker | [Docker Desktop](https://docs.docker.com/desktop/) on Windows, with the **WSL 2 based engine** (Settings → General); Docker Engine on Linux. |
| Disk space | about 20 GB for the image, plus 5 GB for `qwen3:8b`, the local model the command below downloads. |
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

## 2. Choose the folder

The folder you mount on `/workspace`, and the profile of step 3, depend on your role
([One image, one role at a time](../../README.md#one-image-one-role-at-a-time)):

| You | What you mount on `/workspace` | Profile (step 3) |
|---|---|---|
| build Orkeon teams | your **workshop** | `user` |
| report a failure, validate a fix | your workshop too: the reproduction is a team | `contrib` |
| develop, release or document Orkeon, prepare a pull request | a **git checkout of Orkeon** | `dev`, `release`, `docs` or `contrib` |
| maintain Orkeon Workshop itself | a **checkout of this repository** | `dev`, `docs` or `all` |

The commands below keep the folder in a variable, `$folder` on Windows and `folder` on Linux: set it once
with the block of your row, and the start command of step 3 uses it.

**A workshop** is a folder of your computer where your teams live. Its name is up to you. If you already
have Orkeon teams, the folder that holds them, with its `teams\` subfolder, is your workshop — on Windows
usually `%USERPROFILE%\Orkeon`, the folder Orkeon Studio reads by default; nothing to create, the first
start deploys the harness next to your teams and leaves them untouched. If you start from nothing, an
empty folder anywhere does: on Windows, `%USERPROFILE%\Orkeon` is the simplest choice, since Orkeon
Studio lists the teams of that folder without any setting; any other folder works too, once Studio is
pointed at its `teams` subfolder ([The workshop](../concepts/workshop.md#orkeon-studio-sees-it)).

```powershell
# Windows (PowerShell)
$folder = "$env:USERPROFILE\Orkeon"                          # your workshop, existing or new
New-Item -ItemType Directory -Force $folder | Out-Null       # creates it only if it does not exist
```

```bash
# Linux
folder="$HOME/Orkeon"                                        # your workshop, existing or new
mkdir -p "$folder"                                           # creates it only if it does not exist
```

**A git checkout of Orkeon** is cloned first — never create it empty: an empty folder is taken for a new
workshop.

```powershell
# Windows (PowerShell)
git clone https://github.com/Orkeon/orkeon.git "$env:USERPROFILE\src\orkeon"
$folder = "$env:USERPROFILE\src\orkeon"
```

```bash
# Linux
git clone https://github.com/Orkeon/orkeon.git "$HOME/src/orkeon"
folder="$HOME/src/orkeon"
```

**A checkout of this repository**, the same way:

```powershell
# Windows (PowerShell)
git clone https://github.com/Orkeon/orkeon-workshop.git "$env:USERPROFILE\src\orkeon-workshop"
$folder = "$env:USERPROFILE\src\orkeon-workshop"
```

```bash
# Linux
git clone https://github.com/Orkeon/orkeon-workshop.git "$HOME/src/orkeon-workshop"
folder="$HOME/src/orkeon-workshop"
```

On Linux, the container writes as the user `node`, uid 1000: if `id -u` prints another number, give that
uid write access to the folder too, for instance `sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX "$folder"`.

A folder that is neither empty nor a folder of teams is refused at the first start, so that nothing is
deployed into the wrong place ([Troubleshooting](../reference/troubleshooting.md#the-workshop)) — unless
it is a git checkout started with a profile made for one (step 3): the harness then lands in its
`.claude/`, listed in `.git/info/exclude`, and never in a tracked file
([In a source checkout](../reference/harness.md#in-a-source-checkout)).

## 3. Start the container

On Windows, in PowerShell (the backquote `` ` `` continues the command on the next line; `${folder}` is
the folder of step 2 and `<profile>` the profile of its table):

```powershell
docker run -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e HARNESS_PROFILE=<profile> -e DOCKER_MODE=socket orkeon-workshop
```

On Linux:

```bash
docker run -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e HARNESS_PROFILE=<profile> -e DOCKER_MODE=socket orkeon-workshop
```

**The profile** is the one of your row in step 2 — `user`, `contrib`, `dev`, `release`, `docs` or `all`:
the last line reads for instance `-e HARNESS_PROFILE=dev -e DOCKER_MODE=socket orkeon-workshop`. It is the
folder's first profile: a folder that has one already keeps it, and `/workshop-profile` changes it later,
in Claude Code.

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
| `-v "<your folder>:/workspace"` | **your workshop, or your checkout**: inside the container it is `/workspace`, and everything written there lands in your folder |
| `-e HARNESS_PROFILE=<profile>` | the first profile of the folder — `user`, `contrib`, `dev`, `release`, `docs` or `all` (step 2); a folder that has one already keeps it, and `user` is the default when the option is left out ([Profiles and packs](../reference/harness.md#profiles-and-packs)) |
| `-v cc-ollama:/home/node/.ollama/models` | a Docker volume for the local models: downloaded once, kept when the container is replaced |
| `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` | the local model your teams run on, downloaded in the background at the first start (about 5 GB) and written to the Orkeon settings; remove the line to download none — your teams then need a model before their first run ([Models](../guides/models.md)) |
| `-v my-orkeon-workshop-claude:/home/node/.claude`, `-e CLAUDE_CONFIG_DIR=…` | a volume for Claude Code's state — your sign-in, history and memory — so that a new container, after an update of the image, keeps it ([Updating](../guides/updating.md)) |
| `--gpus=all` | lets the local models use your NVIDIA GPU |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | needed by the optional firewall, which a `docker run` container does not start by itself: VS Code's `postStartCommand` starts it, or you do ([Firewall](../reference/configuration.md#firewall)) |
| the Docker socket, `-e DOCKER_MODE=socket`, `--add-host` | Docker from inside the container, for the SonarQube quality stack — teams do not need it ([Docker modes](../guides/docker-modes.md)) |

Every option and variable is in [Container options and variables](../reference/configuration.md).

## 4. What happens at the first start

The container prepares itself, which takes a minute or two the first time:

- it installs Claude Code (the published image does not contain it: it is Anthropic's software);
- it deploys the harness into your folder — you will see lines like
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)`;
- it starts the local model server (Ollama) and downloads the model the command names, `qwen3:8b` (about 5 GB),
  **in the background**: you can work meanwhile — nothing is downloaded when the line was removed.

It ends with a prompt inside the container, and this line among the messages (its hint between
parentheses appears in a workshop whose `teams/` folder is still empty and where no language is set):

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? Francais, Deutsch, Espanol...? Once Claude Code is open, type /workshop-language fr (or de, es, pt-BR...) to work in your language, then /orkeon-tour for a guided tour)
```

A workshop now holds `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`, `settings/` and a few
more: [The workshop](../concepts/workshop.md) explains each of them. A checkout gets the harness of its
profile in `.claude/` and nothing else — no `CLAUDE.md`, no `teams/` —, the `[harness]` summary line
ends with the profile and its packs, for instance `profile dev in a source space (core source dev quality usage)`,
and the last line reads `[entrypoint] Checkout: /workspace — profile dev — open it with: workshop`: no tour and
no language hint there. A checkout mounted from Windows is preceded by one more line, `[harness] git: /workspace
is owned by another user (a bind mount): added to safe.directory for node.`, which makes git accept the folder
([Troubleshooting](../reference/troubleshooting.md#the-workshop)).

## 5. Check that everything works

```bash
orkeon-bench doctor
```

```text
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.5.src.20261018.ge258730
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.5.src.20261018.ge258730
PASS  orkeon tool catalogue           94 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
PASS  Ollama reachable                http://127.0.0.1:11434/api/tags
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
PASS  sandboxes left by a killed run  none
Result: OK
```

In a checkout, the two checks about the workshop — `workshop layout`, `stray settings files` — do not
apply; read the others. A `WARN` is not an error: `Ollama reachable` warns, for instance, while the model server is still
starting, and `orkeon CLI on PATH` warns when the image's Orkeon is another commit than the one the
reference documents were checked on — an image you built yourself from the head of Orkeon's `main`, or
after `orkeon-update`; the published image carries the commit they were checked on. A `FAIL`
is explained in [Troubleshooting](../reference/troubleshooting.md).

## 6. Open Claude Code in the workshop or the checkout

```bash
workshop
```

The first time, Claude Code asks you to sign in: it shows a link — open it in your browser, sign in,
and paste the code it gives you back into the terminal. It also asks, once, to accept its
bypass-permissions mode, which `workshop` starts it in: read the warning and choose to accept — the
choice selected at first is the one that exits.

In a checkout, the two commands below do not exist: Claude follows the language of your messages, and
your next step is the page of your role in [the workflows](../workflows/overview.md#where-do-you-start).

### Your language

The commands are in English; your workshop need not be. If English is not your language, type this
before anything else, with your own language in place of `fr`:

```text
/workshop-language fr
```

— `fr`, `de`, `es`, `pt-BR`…, or the name of the language. From then on Claude talks with you in that
language, even when you only type commands, and writes in it the documents that describe your teams: the
need, the criteria, the test plan, the design, the decisions. What scripts read stays in English — the
headings of the documents, the identifiers. The team itself is another matter: its definition, and the
language its agents write their output in, are decided for each team, in its need. You type the command
once: the workshop remembers it, in every session. `/workshop-language` alone shows the current
language, and `/workshop-language default` goes back. Without this setting, Claude still answers in the
language you write in, and writes its files in English ([more](../concepts/process.md)).

### The guided tour

Then type:

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

Inside the container, `/exit` leaves Claude Code and gives you its terminal back; `workshop` opens Claude
Code again. When Claude asks you to type a command yourself, it says in which of these places — Claude Code,
the terminal of the container, or a terminal of your computer ([FAQ](../faq.md)). A key for a remote model
is given with `workshop --secret <NAME>`, which asks for the value without showing it
([Models](../guides/models.md#how-a-key-reaches-the-container)). Typing `exit` in the first terminal stops
the container; your folder and the models volume stay. To install a newer image later, see
[Updating](../guides/updating.md).

## Other ways to start

- **VS Code**: open the workshop folder in VS Code and run *Reopen in Container* —
  [The workshop in VS Code](./vs-code.md).
- **Build the image yourself** instead of pulling it: `docker build -t orkeon-workshop .devcontainer`
  from a clone of the repository — [Building the image](../../.devcontainer/README.md).

Next: [Your first team](./first-team.md).
