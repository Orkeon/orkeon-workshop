# Install

*English · [Français](../fr/getting-started/install.md)*

This page takes you from nothing to Claude Code open in your workshop. You do not need to program or to
know Docker: you install one program, paste one line, and answer one question. Count on 30 to 60
minutes, most of it downloads.

It follows the simplest case: one workshop, on the folder Orkeon Studio reads. A folder of your own, a
second workshop, no graphics card, no local model, a git checkout to work on — the same line takes
options: [The script's options](#the-scripts-options).

> Prefer to be walked through it? Paste the prompt of [Discover with Claude](../discover-with-claude.md)
> into a Claude chat and say *"help me install it"*.

## Before you start

### Three places where you type

The pages of this documentation always say where a command goes. There are three places:

| Place | What it is | How you open it |
|---|---|---|
| **A terminal of your computer** | a window where you type commands for your computer: **PowerShell** on Windows, the **Terminal** on Linux | Windows: Start menu, type `PowerShell`, Enter. Linux: the *Terminal* application |
| **The terminal of the container** | the same window, once the workshop has started in it: the messages begin with `[entrypoint]` or `[harness]`, and the commands you type now run inside the workshop | it opens by itself at the end of step 1 |
| **Claude Code** | the conversation with Claude: you type messages, and commands that start with `/` | type `workshop` in the terminal of the container; `/exit` leaves it |

To paste in a terminal: right-click, or `Ctrl+V` (PowerShell) / `Ctrl+Shift+V` (Linux). Then press Enter.

### Words you will meet

- **The workshop** — a folder of your computer where your teams live (`Orkeon` in your user folder,
  unless you choose another). Everything Claude writes for you lands there, so it is never lost.
- **Docker** — the program that runs the workshop in its own sealed box, without installing anything
  else on your computer.
- **The image** — what Docker downloads once: the box with everything inside (about 19 GB).
- **The container** — the box running on your computer, made from the image. Its name is
  `my-orkeon-workshop`.
- **A volume** — a storage place that Docker keeps for the container: your Claude sign-in and the local
  models stay there when the container is replaced.

### What you need

| | |
|---|---|
| A computer | Windows 10/11 or Linux, on an x86-64 processor (Intel or AMD). macOS is not tested. |
| Disk space | about 25 GB free: 19 GB for the image, 5 GB for the local model. |
| A Claude account | one that gives access to Claude Code — see [Claude Code's documentation](https://code.claude.com/docs/en/overview). |
| A graphics card (optional) | an NVIDIA graphics card makes the local models fast. Without one they run on the processor, more slowly. Nothing to do either way: step 1 finds out by itself. |

### Install Docker

**On Windows**:

1. Download **Docker Desktop for Windows** from
   [docs.docker.com](https://docs.docker.com/desktop/setup/install/windows-install/) and run the
   installer.
2. Keep the option **Use WSL 2 instead of Hyper-V** ticked, if it is offered. WSL 2 is the part of
   Windows that lets it run Linux programs.
3. Restart the computer when the installer asks.
4. Open **Docker Desktop** from the Start menu. Accept its terms; you can skip signing in to Docker. Wait
   until its window says **Engine running** (bottom left).

**On Linux**: install Docker Engine for your distribution
([docs.docker.com](https://docs.docker.com/engine/install/)), then let your user run it:
`sudo usermod -aG docker $USER`, and log out and in again. With an NVIDIA graphics card, also install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

**Check it**: in a terminal of your computer, type

```powershell
docker version
```

The answer has two parts, `Client:` and `Server:`. **No `Server:` part**, or an error? On Windows, Docker
Desktop is not started yet, or is still starting; on Linux, Docker is not running. When Docker Desktop
complains about WSL or about virtualization, see
[Troubleshooting](../reference/troubleshooting.md#installing-and-starting).

## 1. Start the workshop

In a terminal of your computer, paste this line and press Enter.

On **Windows**, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1 | iex
```

On **Linux**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop
```

The line downloads a small script and runs it. You can
[read the script](https://github.com/Orkeon/orkeon-workshop/tree/main/install) first. It asks you one
question:

```text
[workshop] The folder of your workshop, where your teams live [C:\Users\you\Orkeon] (Enter keeps it):
```

Press **Enter** to keep the folder shown, or type another one. If you already have Orkeon teams, give
the folder that holds their `teams` subfolder; on Windows, Orkeon Studio reads `C:\Users\<you>\Orkeon`
by default ([The workshop](../concepts/workshop.md#orkeon-studio-sees-it)). Then it works by itself and
says what it does:

```text
[workshop] Creating the folder C:\Users\you\Orkeon
[workshop] Downloading the image (about 19 GB the first time: it takes a while)...
[workshop] NVIDIA GPU found: the local models will use it.
[workshop] Creating my-orkeon-workshop on C:\Users\you\Orkeon (profile user). The first start takes a minute or two.
```

— or `No usable NVIDIA GPU: the local models will run on the processor, more slowly.`, which is not an
error. The download is the long part. When the script stops early, its last line says why and what to do,
for instance `Docker does not answer. Open Docker Desktop (Start menu), wait until it says 'Engine running',
then type this line again.`

What the script does, in order: it checks that Docker answers, creates the folder if it does not exist,
downloads the image, tries the graphics card, then creates the container `my-orkeon-workshop` with the
command of [Starting by hand](#starting-by-hand). A folder that already holds other files — a project —
is refused, so that nothing lands in the wrong place; a folder of teams that git versions is a workshop
like any other ([what makes a folder a workshop](../concepts/workshop.md#into-a-workshop-or-a-git-checkout)).

## 2. What happens at the first start

The same window has become **the terminal of the container**. The container prepares itself, which takes
a minute or two the first time:

- it installs Claude Code (the published image does not contain it: it is Anthropic's software);
- it puts the harness — the skills and rules Claude works with — into your folder, next to your teams,
  which it leaves untouched. You will see lines like
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)`.
  `/workspace` is the name of your folder inside the container;
- it starts the local model server (Ollama) and downloads the model `qwen3:8b` (about 5 GB) **in the
  background**: you can work meanwhile.

It ends with this line among the messages (the part between parentheses appears in a new workshop):

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? Francais, Deutsch, Espanol...? Once Claude Code is open, type /workshop-language fr (or de, es, pt-BR...) to work in your language, then /orkeon-tour for a guided tour)
```

Your folder now holds `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`, `settings/` and a few
more: [The workshop](../concepts/workshop.md) explains each of them.

## 3. Check that everything works

In the terminal of the container, type:

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

The last line is what matters: `Result: OK`. A `WARN` is not an error: `Ollama reachable` warns, for
instance, while the model server is still starting — type the command again a minute later. A `FAIL`
is explained in [Troubleshooting](../reference/troubleshooting.md).

## 4. Open Claude Code

In the terminal of the container, type:

```bash
workshop
```

The first time, Claude Code asks you to sign in: it shows a link. Open it in your browser, sign in, and
paste the code it gives you back into the terminal. It also asks, once, to accept its
*bypass permissions* mode, which `workshop` starts it in: read the warning and choose to accept — the
choice selected at first is the one that exits.

### Your language

The commands are in English; your workshop need not be. If English is not your language, type this
in Claude Code before anything else, with your own language in place of `fr`:

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

- **Reopen the workshop**, another day: start Docker Desktop, then paste **the same line as in step 1**
  in a terminal of your computer. The container exists already: the script starts it again, with no
  question and no download. Then type `workshop`.
- **A second terminal** in the running workshop — to look at a file while Claude works: the same line
  again, in a new terminal window of your computer.
- **Leave Claude Code**: `/exit`. You are back in the terminal of the container; `workshop` opens Claude
  Code again.
- **Stop the workshop**: type `exit` in the terminal of the container. Your folder, your sign-in and the
  models are kept.
- **One line is one named container.** The script finds the container by its name — `-Name`,
  `my-orkeon-workshop` unless you gave another — never by the folder: the same line reopens the same
  container whatever folder you type it from. A `-Folder` or a `-Profile` given with the name of a
  container that works elsewhere is refused with a message, never applied in silence: another folder is
  another `-Name` ([One line, one named container](#one-line-one-named-container)).

The same thing, without the script, in a terminal of your computer:

```powershell
docker start -ai my-orkeon-workshop                    # reopen the container (then: workshop)
docker exec -it --user node my-orkeon-workshop zsh     # a second terminal in the same container
```

When Claude asks you to type a command yourself, it says in which of the three places
([above](#three-places-where-you-type)). A key for a remote model is given with
`workshop --secret <NAME>`, which asks for the value without showing it
([Models](../guides/models.md#how-a-key-reaches-the-container)). To install a newer image later, see
[Updating](../guides/updating.md): one line too.

## The script's options

The line of step 1 runs the script with no option: `irm … | iex` hands the script's text to PowerShell
as it is, and nothing can be typed after it. To give options, PowerShell is asked to make a command of
that text first — one line, longer, with the options at the end:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <name> -Folder <path> -Profile <profile>
```

On Linux, the line of step 1 takes the options after `start-workshop`:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <name> --folder <path> --profile <profile>
```

| Windows | Linux | What it does |
|---|---|---|
| `-Folder <path>` | `--folder <path>` | the folder of the workshop — or of the checkout — mounted on `/workspace`. Asked when left out, default `Orkeon` in your user folder |
| `-Name <name>` | `--name <name>` | the name of the container, `my-orkeon-workshop` by default. **One name, one container**: the same line reopens it; a second folder takes a second name |
| `-Profile <name>` | `--profile <name>` | the folder's first profile: `user` by default, for a folder of teams; `dev`, `release`, `docs`, `contrib` or `all` for a git checkout you work on ([Profiles](../reference/profiles.md)) |
| `-Model <name>` | `--model <name>` | the local model downloaded at the first start, `qwen3:8b` by default ([Models](../guides/models.md)) |
| `-NoModel` | `--no-model` | no local model: nothing is downloaded, and your teams need a model before their first run |
| `-NoGpu` | `--no-gpu` | do not try the NVIDIA graphics card: the local models run on the processor |
| `-Update` | `--update` | move the container to the latest image; the old one is kept as `<name>-old` until the clean-up ([Updating](../guides/updating.md)) |
| `-CleanUp` | `--clean-up` | remove `<name>-old` and the previous image, once the updated container works |
| `-DryRun` | `--dry-run` | print the commands that would change something, without running any |

An option is read on the line that **creates** the container, which keeps it. Later lines name the
container (`-Name`) and need nothing else: `-Folder` and `-Profile` repeated unchanged are accepted,
changed they are refused ([One line, one named container](#one-line-one-named-container)).

### Recipes

Each line is complete: copy it and replace what is between `<…>`. Windows first, Linux under it.

**A second workshop, on a folder of mine** — a folder of teams, empty or already holding `teams/`,
versioned with git or not; the profile stays `user`. Orkeon Studio lists one folder of teams: to see
this one's, point it at its `teams` subfolder ([Orkeon Studio sees it](../concepts/workshop.md#orkeon-studio-sees-it)).

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <name> -Folder "D:\Work\my-workshop"
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <name> --folder ~/work/my-workshop
```

**Without a graphics card**, or without using it — the local models run on the processor:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -NoGpu
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --no-gpu
```

**Without a local model** — nothing downloaded beyond the image; a remote model, or `ollama pull` later:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -NoModel
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --no-model
```

**Update, then clean up** — the first line moves the container to the latest image and keeps the old one
as `my-orkeon-workshop-old`; once the new one works, the second line removes the old one. A container
with another name adds its `-Name` to both:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Update
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -CleanUp
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --update
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --clean-up
```

**See what the line would do, without doing anything** — the commands are printed with a `+` in front,
nothing is created, downloaded or changed; the folder still has to be acceptable:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -DryRun -Name <name> -Folder "D:\Work\my-workshop"
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --dry-run --name <name> --folder ~/work/my-workshop
```

### What the workshops share

The image and the volume `cc-ollama` of the local models are shared by every container: a model is
downloaded once. Each container has its own folder, its own volume of Claude Code's state —
`<name>-claude`: the sign-in, the history, the memory — and its own volume of worktrees,
`<name>-worktrees` ([what each part of the command does](#starting-by-hand)).

### One line, one named container

The script finds the container by its `-Name`, never by the folder: the same line reopens the same
container, and a container keeps the folder and the profile it was created with. Typing the line with
another `-Folder`, or another `-Profile`, and the name of an existing container — expecting a new one —
is refused, with what to do:

```text
[workshop] my-orkeon-workshop already works on C:\Users\you\Orkeon, not on D:\Work\other: one line opens one named container, whatever -Folder says.
[workshop] For another folder, give it another name: -Name <other-name> -Folder "D:\Work\other" - or remove this container first: docker rm my-orkeon-workshop (your folder and the volumes are kept).
```

The same folder written differently — `C:/Users/you/Orkeon/`, another case, or the form Docker Desktop
records it in — is the same folder, and the line opens the container. The profile is compared with the one
the container was created with; `workshop-profile <name>` inside the container changes it, and a
container created by hand without a profile is opened with a line saying the profile was not checked.

## For a git checkout

This section is for whoever works on a repository: to develop, release or document Orkeon, this project
or another repository, the folder of the container is the top of a **git checkout**, not a workshop,
and it takes a profile made for one — the source profiles build no team ([Profiles](../reference/profiles.md)):

| You | The folder | Profile |
|---|---|---|
| report a failure, validate a fix | your workshop: the reproduction is a team | `contrib` |
| develop, release or document a repository, prepare a pull request | the top of its **git checkout** — Orkeon, this project, or another: its repository pack joins when it has one | `dev`, `release`, `docs` or `contrib` |
| maintain Orkeon Workshop itself | a **checkout of this repository** | `dev`, `docs` or `all`; to build the image: [Building the image](../../.devcontainer/README.md) |

Clone it first — never create it empty: an empty folder is taken for a new workshop. Then give the
script the folder, the profile, and a name of its own, so that it gets its own container next to your
workshop's. On Windows, in PowerShell:

```powershell
git clone https://github.com/Orkeon/orkeon.git "$env:USERPROFILE\src\orkeon"
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Folder "$env:USERPROFILE\src\orkeon" -Profile dev -Name orkeon-dev
```

On Linux:

```bash
git clone https://github.com/Orkeon/orkeon.git "$HOME/src/orkeon"
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --folder "$HOME/src/orkeon" --profile dev --name orkeon-dev
```

For this repository, the clone is `https://github.com/Orkeon/orkeon-workshop.git`. The same script with
the same `-Name` reopens that container later; the other options are [above](#the-scripts-options).
Started with `user` — the option forgotten — a checkout of this repository is told so, `… is a git
checkout: give it a profile made for one, for instance -Profile dev …`, and any other project's checkout
is refused as a folder of other files, with the same hint
([Troubleshooting](../reference/troubleshooting.md#installing-and-starting)).

A checkout gets the harness of its profile in `.claude/` and nothing else — no `CLAUDE.md`, no
`teams/` —, listed in `.git/info/exclude` and never in a tracked file
([In a source checkout](../reference/harness.md#in-a-source-checkout)). The `[harness]` summary line ends
with the profile and its packs, for instance `profile dev in a source space (core source dev quality usage)`,
and the last line reads `[entrypoint] Checkout: /workspace — profile dev — open it with: workshop`: no tour
and no language hint there; Claude follows the language of your messages, and your next step is the page
of your role in [the workflows](../workflows/overview.md#where-do-you-start). A checkout mounted from
Windows is preceded by one more line, `[harness] git: /workspace is owned by another user (a bind mount):
added to safe.directory for node.`, which makes git accept the folder
([Troubleshooting](../reference/troubleshooting.md#the-workshop)). In `orkeon-bench doctor`, the two checks
about the workshop — `workshop layout`, `stray settings files` — do not apply. `orkeon CLI on PATH` warns
when the image's Orkeon is another commit than the one the reference documents were checked on — an image
you built yourself from the head of Orkeon's `main`, or after `orkeon-update`; the published image carries
the commit they were checked on.

## Starting by hand

The script runs the commands below; you can type them yourself instead, to change an option the script
does not offer. They are typed in a terminal of your computer, in one window from top to bottom: the
variables `$name` and `$folder` (Windows) or `name` and `folder` (Linux) do not survive the window.

**Get the image.**

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

The first line downloads the image (about 19 GB). The second gives it the short name `orkeon-workshop`
that every other command uses.

**Choose the folder** — your workshop, or a checkout cloned before ([For a git checkout](#for-a-git-checkout)):

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

On Linux, the container writes as the user `node`, uid 1000: if `id -u` prints another number, give that
uid write access to the folder too, for instance `sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX "$folder"`.

A folder that is neither empty nor a folder of teams is refused at the first start, so that nothing is
deployed into the wrong place ([Troubleshooting](../reference/troubleshooting.md#the-workshop)) — unless
it is a git checkout started with a profile made for one: the harness then lands in its
`.claude/`, listed in `.git/info/exclude`, and never in a tracked file
([In a source checkout](../reference/harness.md#in-a-source-checkout)). A folder of teams that git
versions, or a repository holding nothing but its README and licence next to `.git`, is a workshop like
any other ([the rule](../concepts/workshop.md#into-a-workshop-or-a-git-checkout)).

**Start the container.** On Windows, in PowerShell (the backquote `` ` `` continues the command on the
next line; `${folder}` is the folder above, `<profile>` the profile — `user` for a workshop — and `$name`
the container's name, which its two volumes take):

```powershell
$name = "my-orkeon-workshop"                                 # the container; its two volumes take its name
foreach ($v in "${name}-claude", "${name}-worktrees") { docker volume inspect $v *> $null; if ($LASTEXITCODE -ne 0) { docker volume create $v } }

docker run -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e HARNESS_PROFILE=<profile> -e DOCKER_MODE=socket orkeon-workshop
```

On Linux:

```bash
name="my-orkeon-workshop"                                    # the container; its two volumes take its name
for v in "${name}-claude" "${name}-worktrees"; do docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v"; done

docker run -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e HARNESS_PROFILE=<profile> -e DOCKER_MODE=socket orkeon-workshop
```

**The profile** is the one of your row — `user`, `contrib`, `dev`, `release`, `docs` or `all`: the last
line reads for instance `-e HARNESS_PROFILE=dev -e DOCKER_MODE=socket orkeon-workshop`. It is the
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
| `--name $name` | the name of your container, to reopen it later; its two volumes below follow it. A second container — another folder — gets another name, and so its own volumes. The line before `docker run` creates each volume only when it is missing (`docker volume inspect`, else `docker volume create`): run it again, nothing is touched |
| `-v "<your folder>:/workspace"` | **your workshop, or your checkout**: inside the container it is `/workspace`, and everything written there lands in your folder |
| `-e HARNESS_PROFILE=<profile>` | the first profile of the folder — `user`, `contrib`, `dev`, `release`, `docs` or `all`; a folder that has one already keeps it, and `user` is the default when the option is left out ([Profiles and packs](../reference/harness.md#profiles-and-packs)) |
| `-v cc-ollama:/home/node/.ollama/models` | a Docker volume for the local models: downloaded once, kept when the container is replaced |
| `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` | the local model your teams run on, downloaded in the background at the first start (about 5 GB) and written to the Orkeon settings; remove the line to download none — your teams then need a model before their first run ([Models](../guides/models.md)) |
| `-v "${name}-claude:/home/node/.claude"`, `-e CLAUDE_CONFIG_DIR=…` | a volume for Claude Code's state — your sign-in, history and memory — so that a new container, after an update of the image, keeps it ([Updating](../guides/updating.md)). **One per container, named after it**: every container mounts its folder on `/workspace`, so two of them on one volume would mix the history and the memory of their projects. With the default name it is `my-orkeon-workshop-claude`, the volume of the earlier commands: an existing container keeps it ([One Claude Code volume per container](../guides/updating.md#one-claude-code-volume-per-container)) |
| `-v "${name}-worktrees:/worktrees"`, `-e HARNESS_WORKTREE_ROOT=/worktrees` | the worktrees of `/dev-batches` on Docker's own disk rather than in your folder: on a Windows folder their builds run twice as fast; your folder is unchanged, and nothing else changes without it ([The worktrees on a volume](../guides/docker-modes.md#advanced-the-worktrees-on-a-volume)) |
| `--gpus=all` | lets the local models use your NVIDIA GPU |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | needed by the optional firewall, which a `docker run` container does not start by itself: VS Code's `postStartCommand` starts it, or you do ([Firewall](../reference/configuration.md#firewall)) |
| the Docker socket, `-e DOCKER_MODE=socket`, `--add-host` | Docker from inside the container, for the SonarQube quality stack — teams do not need it ([Docker modes](../guides/docker-modes.md)) |

Every option and variable is in [Container options and variables](../reference/configuration.md).

## Other ways to start

- **VS Code**: open the workshop folder in VS Code and run *Reopen in Container* —
  [The workshop in VS Code](./vs-code.md).
- **Build the image yourself** instead of pulling it: `docker build -t orkeon-workshop .devcontainer`
  from a clone of the repository — [Building the image](../../.devcontainer/README.md).

Next: [Your first team](./first-team.md).
