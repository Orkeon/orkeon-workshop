# Updating

*English · [Français](../fr/guides/updating.md)*

Most of the time, updating means one thing: moving your container to the newest image, which brings a
newer Orkeon and a newer harness together — [Update in one line](#update-in-one-line). Updating Orkeon or
Ollama inside a container, and how the harness follows the image, are under [Advanced](#advanced).

## The image

A container keeps the image it was created from. Updating is therefore two things: downloading the new
image, then replacing your container by a new one created from it. Nothing of yours lives in the
container itself — your workshop is a folder of your computer, the local models and the Claude Code state
(your sign-in, history and memory) are in Docker volumes — so nothing is lost, and the old container is
kept until the new one works.

### Update in one line

Finish what is running first: let a test run end, and leave Claude Code (`/exit`). Then, in **a terminal
of your computer** — not in the terminal of the container — paste this line and press Enter.

On **Windows**, in PowerShell:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Update
```

On **Linux**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --update
```

It is the script of [Install](../getting-started/install.md#1-start-the-workshop), with one option more.
It reads how your container `my-orkeon-workshop` was created — its folder, its Claude Code volume, its
local model, its graphics card —, downloads the new image (up to about 19 GB), stops the container, puts
it aside under the name `my-orkeon-workshop-old`, and starts a new one on the new image, with the same
folder and the same volumes. You see:

```text
[workshop] Downloading the image (about 19 GB the first time: it takes a while)...
[workshop] Stopping my-orkeon-workshop...
[workshop] The old container is kept as my-orkeon-workshop-old. When the new one works, type the same line with -CleanUp.
[workshop] To go back instead: docker rm -f my-orkeon-workshop; docker rename my-orkeon-workshop-old my-orkeon-workshop; docker tag orkeon-workshop:previous orkeon-workshop; docker start -ai my-orkeon-workshop
[workshop] Starting my-orkeon-workshop on the new image, folder C:\Users\you\Orkeon...
```

(On Linux the lines say `--clean-up`.) The same window then becomes the terminal of the new container.
Its first start takes a minute or two: it installs Claude Code again — your sign-in is in the volume, it
is not asked again. Among the messages, the harness of the new image arrives in your workshop
([The harness](#the-harness)):

```text
[harness] synchronised into /workspace: 3 added, 41 updated, 1 removed, 0 seeded, 0 saved (image update)
```

— or `[harness] up to date (/workspace)` when the new image carries the same harness. Check it in the
terminal of the container: `orkeon-bench doctor` ends with `Result: OK`, and `workshop` opens Claude Code.

**A line `Not carried over`.** A variable you gave the old container yourself (`-e`, a key for a remote
model, say) goes to the new one when the same variable is set in the window where you typed the line;
otherwise the script names it — never its value — and goes on:

```text
[workshop] Not carried over (not set in this window): ZAI_API_KEY - give a key again with: workshop --secret <NAME>
```

Give the key again for the session with `workshop --secret <NAME>` in the terminal of the container
([Models](./models.md#how-a-key-reaches-the-container)).

**Once the new container works**, the same line with `-CleanUp` in place of `-Update` (`--clean-up` on
Linux) removes the old container and the previous image, which frees their disk space:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -CleanUp
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --clean-up
```

It answers `Removed the old container my-orkeon-workshop-old.`, `Removed the previous image.`, then
`Clean.`

**To go back** instead, before `-CleanUp`: the old container comes back under its name, on the image it
was created from, and its start puts the harness of that image back into the workshop. These are the
commands the script printed; type them in a terminal of your computer, one per line:

```powershell
docker rm -f my-orkeon-workshop
docker rename my-orkeon-workshop-old my-orkeon-workshop
docker tag orkeon-workshop:previous orkeon-workshop
docker start -ai my-orkeon-workshop
```

**A container with another name** — a git checkout's, say: add `-Name <name>` (`--name <name>` on Linux)
to each of these lines. The local model is kept; `-Model <name>` or `-NoModel` (`--model`, `--no-model`)
changes it — the models already downloaded stay in the `cc-ollama` volume either way.

**When the script refuses**, it changes nothing, and its last line says why:

| The last line | What to do |
|---|---|
| `No container named my-orkeon-workshop: type the line without -Update to create it.` | there is no container of that name: `docker ps -a` lists yours. Give its name with `-Name`, or create one with the line of [Install](../getting-started/install.md#1-start-the-workshop) |
| `my-orkeon-workshop-old is still there, from an earlier update: …` | an earlier update was not finished: once the current container works, type the line with `-CleanUp`, then with `-Update` again |
| `The download failed: …` | the image could not be downloaded: check the connection, then type the line again. Your container is unchanged |
| `… has no folder on /workspace: update it by hand …` | the container was not created by these pages: [By hand](#by-hand) |
| `… keeps Claude Code's state inside itself, not on a volume: update it by hand …` | an older container, created without the Claude Code volume: [Without the Claude Code volume](#without-the-claude-code-volume) |
| `The volume … is shared with …` | two containers use the same Claude Code volume: [One Claude Code volume per container](#one-claude-code-volume-per-container) |

The script carries over what the commands of [Install](../getting-started/install.md#starting-by-hand)
set. A container you created with options of your own — another volume, a port — is updated
[by hand](#by-hand), so that nothing of them is lost.

### By hand

The same update, step by step, without the script: for a container the script refuses, or one created
with options of your own.

#### Moving a container to a new image

The commands are typed in a terminal **of your computer** — PowerShell on Windows, any terminal on
Linux — not in the terminal of the container. They are the same on both, except at step 5. They use the
container name of [Install](../getting-started/install.md), `my-orkeon-workshop`: if you gave yours
another name, replace it everywhere, `$name` of step 5 included (`docker ps -a` lists your containers). The long part is the
download, up to about 19 GB.

**1. Stop the container.** Finish what is running first: let a test run end, leave Claude Code (`/exit`).
Then type `exit` in the terminal of the container, or, from another terminal:

```powershell
docker stop my-orkeon-workshop
```

**2. Read how it was created.**

```powershell
docker inspect -f "{{range .HostConfig.Binds}}{{println .}}{{end}}" my-orkeon-workshop
```

```text
/var/run/docker.sock:/var/run/docker-host.sock
cc-ollama:/home/node/.ollama/models
my-orkeon-workshop-claude:/home/node/.claude
C:\Users\you\Orkeon:/workspace
```

Two lines matter:

- the one that ends with `:/workspace` starts with **your workshop folder** — here `C:\Users\you\Orkeon`.
  Step 5 needs it;
- the one that ends with `:/home/node/.claude` is the volume of the Claude Code state. **No such line?**
  Your container was created without that volume: do steps 3 and 4, then
  [Without the Claude Code volume](#without-the-claude-code-volume) in place of step 5.

**3. Download the new image.**

```powershell
docker tag orkeon-workshop orkeon-workshop:previous      # keeps the image you had, to go back to it
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

`Status: Image is up to date`, at the end of the second command, says there is no newer image than the
one you downloaded last.

**4. Put the old container aside.** It is renamed, not removed: it stays whole, to go back to.

```powershell
docker rename my-orkeon-workshop my-orkeon-workshop-old
```

**5. Create the new container**, with the command of [Install](../getting-started/install.md#starting-by-hand) and your
folder of step 2 in the variable; the `-e OLLAMA_DEFAULT_MODEL` line as at your first run, or removed — the
models already in the `cc-ollama` volume stay either way. The two volumes follow `$name`: with the default name,
`"${name}-claude"` is `my-orkeon-workshop-claude`, the volume of step 2, so the new container keeps your Claude
Code state; `"${name}-worktrees"` is created empty if the old container had none
([The worktrees on a volume](./docker-modes.md#advanced-the-worktrees-on-a-volume)). If the `:/home/node/.claude`
line of step 2 names another volume than `<your container's name>-claude`, put that volume on the line instead —
unless another container mounts it too: then see
[One Claude Code volume per container](#one-claude-code-volume-per-container). On Windows, in PowerShell:

```powershell
$name = "my-orkeon-workshop"                                 # the container; its two volumes take its name
$folder = "$env:USERPROFILE\Orkeon"                          # your folder: the one step 2 printed
foreach ($v in "${name}-claude", "${name}-worktrees") { docker volume inspect $v *> $null; if ($LASTEXITCODE -ne 0) { docker volume create $v } }

docker run -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop
```

On Linux:

```bash
name="my-orkeon-workshop"                                    # the container; its two volumes take its name
folder="$HOME/Orkeon"                                        # your folder: the one step 2 printed
for v in "${name}-claude" "${name}-worktrees"; do docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v"; done

docker run -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e DOCKER_MODE=socket orkeon-workshop
```

No NVIDIA graphics card? Remove `--gpus=all`, as at the installation
([the `--gpus=all` option](../reference/troubleshooting.md#the---gpusall-option)).

**6. Check the new container.** Its first start takes a minute or two: it installs Claude Code again —
your sign-in is in the volume, it is not asked again. Among the messages, the harness of the new image
arrives in your workshop ([The harness](#the-harness)):

```text
[harness] synchronised into /workspace: 3 added, 41 updated, 1 removed, 0 seeded, 0 saved (image update)
```

— or `[harness] up to date (/workspace)` when the new image carries the same harness. Then, in the
container:

```bash
orkeon-bench doctor      # ends with "Result: OK"
workshop                 # opens Claude Code in your workshop
```

**7. Remove the old container**, once the new one works:

```powershell
docker rm my-orkeon-workshop-old
docker rmi orkeon-workshop:previous      # frees the disk space of the previous image
```

**To go back**, before step 7: the old container comes back under its name, on the image it was created
from, and its start puts the harness of that image back into the workshop.

```powershell
docker rm -f my-orkeon-workshop
docker rename my-orkeon-workshop-old my-orkeon-workshop
docker tag orkeon-workshop:previous orkeon-workshop
docker start -ai my-orkeon-workshop
```

The same steps, without step 3, recreate a container to give it what cannot be added afterwards:
`--gpus=all`, a volume, a variable.

#### Without the Claude Code volume

A container created without a volume on `/home/node/.claude` keeps the Claude Code
state — `~/.claude` and `~/.claude.json`: your sign-in, history and memory — in its own writable layer,
and **a new container does not inherit the writable layer of the old one**. After steps 1 to 4, in place
of step 5, create the new container without starting it, copy the state into it, then start it. On
Windows, in PowerShell:

```powershell
$name = "my-orkeon-workshop"                                 # the container; its two volumes take its name
$folder = "$env:USERPROFILE\Orkeon"                          # your folder: the one step 2 printed
foreach ($v in "${name}-claude", "${name}-worktrees") { docker volume inspect $v *> $null; if ($LASTEXITCODE -ne 0) { docker volume create $v } }

# Create the new container, without starting it (the model line as at your first run, or removed)
docker create -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop

# Copy the Claude Code state from the old container into the new one
cmd /c "docker cp ${name}-old:/home/node/.claude - | docker cp - ${name}:/home/node/"
cmd /c "docker cp ${name}-old:/home/node/.claude.json - | docker cp - ${name}:/home/node/.claude/"

# Start it
docker start -ai $name
```

On Linux:

```bash
name="my-orkeon-workshop"                                    # the container; its two volumes take its name
folder="$HOME/Orkeon"                                        # your folder: the one step 2 printed
for v in "${name}-claude" "${name}-worktrees"; do docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v"; done

# Create the new container, without starting it (the model line as at your first run, or removed)
docker create -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e DOCKER_MODE=socket orkeon-workshop

# Copy the Claude Code state from the old container into the new one
docker cp "${name}-old:/home/node/.claude" - | docker cp - "${name}:/home/node/"
docker cp "${name}-old:/home/node/.claude.json" - | docker cp - "${name}:/home/node/.claude/"

# Start it
docker start -ai "$name"
```

Then go on with step 6.

- The copy streams an archive from one container to the other, so owners and modes are kept. On Windows
  it goes through `cmd` because Windows PowerShell 5 corrupts binary data in a pipe (PowerShell 7.4 and
  `bash` do not need it).
- With `CLAUDE_CONFIG_DIR`, `.claude.json` lives inside `~/.claude`, hence its destination.
- `docker diff my-orkeon-workshop-old` lists anything else the old container changed; the same pair of
  `docker cp` moves it.

The next time, the volume is in place: the steps above are enough, with step 5 as written.

#### One Claude Code volume per container

The volume on `/home/node/.claude` keeps Claude Code's state — your sign-in, settings, history, transcripts and memory —
from one container to its replacement. It belongs to **one** container: Claude Code files a project's history and
memory under its path, and every container mounts its folder on `/workspace`, so two containers sharing the volume
mix the history and the memory of their projects, and two of them running at once write the same files. The commands
of [Install](../getting-started/install.md) and of step 5 name it after the container, `"${name}-claude"`: one per
container. A container created before them may share one: the earlier commands wrote
`-v my-orkeon-workshop-claude:…` whatever the container's name, so a second container made from them shares the
volume of the first.

To give a container that shares one its own, keeping what it holds: stop every container that mounts the shared
volume, create the new one, copy the state into it with a throw-away container, then recreate the container on it.
In PowerShell, for a container `orkeon-dev`:

```powershell
docker stop orkeon-dev
```

```powershell
docker volume create orkeon-dev-claude
```

```powershell
docker run --rm --user root --entrypoint sh -v my-orkeon-workshop-claude:/from:ro -v orkeon-dev-claude:/to orkeon-workshop -c "cp -a /from/. /to/"
```

Then steps 2 and 4 to 7 of [Moving a container to a new image](#moving-a-container-to-a-new-image), with
`orkeon-dev` in place of `my-orkeon-workshop`: step 2 gives the workshop folder step 5 needs; the old container is put
aside; the new one is created with `$name = "orkeon-dev"`, whose `"${name}-claude"` is exactly `orkeon-dev-claude`,
the volume just filled, in place of the shared one; it is checked; the old one is removed — without step 7's
`docker rmi orkeon-workshop:previous`, which needs the tag of step 3. The copy carries
everything the shared volume held, the other containers' projects included: they all sat under the same
`/workspace`, so they cannot be told apart. To start clean instead, skip the copy — the
container then asks you to sign in once. The shared volume stays as it was for the other containers; `docker volume
rm` it once none uses it.

## VS Code

With the workshop's VS Code configuration ([The workshop in VS Code](../getting-started/vs-code.md)),
download the new image — the three commands of step 3 above — then run **Dev Containers: Rebuild
Container** from the command palette (`Ctrl+Shift+P`): it recreates the container on the current
`orkeon-workshop` image. The Claude Code state lives in a volume and survives it.

## Advanced

What follows is for those who want to know what happens inside: Orkeon and Ollama updated in a running
container, and how the harness follows the image.

### Orkeon and Ollama, in a container

```bash
orkeon-update --check              # installed and available versions; nothing changes
orkeon-update --source             # rebuild the CLI from the head of Orkeon's main branch (a few minutes)
orkeon-update --source <commit>    # from a given branch, tag or commit
orkeon-update --channel dev        # the latest published dev build (needs a GitHub Packages token)
orkeon-update --channel release    # back to the latest tagged prerelease
orkeon-update --version <version>  # an exact published version (1.0.0-rc.4 predates the image's own build)
orkeon-update --ollama             # also upgrade Ollama and restart its server
```

The image carries Orkeon built from the sources of `main` (`orkeon --version` ends with
`.src.<date>.g<commit>`). A source build needs github.com and nuget.org: with the firewall on, add
`api.nuget.org` to `FIREWALL_EXTRA_DOMAINS`. In Claude Code, the `orkeon-update` skill drives the same
script — ask *"update Orkeon"*. An update made this way lives in that container only, and the .NET
templates keep the packages of the image; to update everything, update the image. Without an explicit
channel or version the script never goes down a version. Use `orkeon-update`, not
`dotnet tool update`, which cannot replace a tool installed in an image layer.

### The harness

Nothing to do: the harness — the skills, the agents, the rules, the hooks and the `.claude/settings.json`
that declares them — travels in the image, and at each start the container runs `sync-harness.sh`, which
brings the workshop in step with the harness of its image. A new image brings a new harness: recreate the
container on it ([above](#the-image)), and its first start updates the workshop it mounts.

The image carries a manifest of its harness, one hash per file, and the workshop keeps the manifest of
what was deployed last (`.claude/.harness-manifest`). When the two are the same, nothing is done.
Otherwise each file is handled by the rule of its place:

| In the workshop | On a new image |
|---|---|
| `.claude/` (skills, agents, rules, hooks, templates, evals, `settings.json`, `harness/`), `references/`, `library/examples/` | **The image's**: new and changed files are copied, retired ones removed. What `.claude/` holds follows the active profile: with `user`, exactly what these pages describe; another profile adds or removes packs, and a file the new profile leaves out is removed like one the image no longer ships. A file you edited is first saved under `.claude/harness-backup/<stamp>/`. |
| `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.claude/settings.local.json`, `.devcontainer/devcontainer.json`, `settings/README.md`, the shelves of `library/` | **Created once**, when absent: never updated — except the keys of `.claude/settings.local.json` that `/workshop-profile` owns (the `env` switches of the packs, `skillOverrides`). |
| `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.<name>/`, `archive/`, `.claude/local/` (your language and profile), `.claude/agent-memory/` (the reviewer's memory), `references/local/`, anything you add | **Yours**: never touched. |

Your `CLAUDE.md` is never rewritten, yet the instructions follow: its first line imports
`.claude/harness/HARNESS.md`, which is the image's. [The workshop](../concepts/workshop.md#what-belongs-to-whom)
has the rules in full.

```bash
sync-harness.sh --dry-run   # what the synchronisation would change; nothing changes
sync-harness.sh --force     # synchronise again, even though the image has not changed
```

- A workshop is updated when a container that mounts it starts: with several workshop folders, each
  follows at the next start of its own container.
- The image decides, whichever is the newer: a container left on an earlier image that starts on the
  same folder puts its own harness back. Move every container of a workshop to the new image.
- In a workshop [versioned with git](../concepts/workshop.md#versioning-it-with-git), `.claude/` is
  versioned too: after an update, `git status` shows what the new harness changed — commit it.
- The profile of the space (`.claude/local/profile`, written by `/workshop-profile`) survives an update of
  the image and decides which packs the new harness deploys; when it is not `user`, the summary line ends
  with ` - profile <name> in a <space> space (<packs>)`. In a git checkout the same synchronisation writes
  nothing git tracks, and refuses whole (exit 2) a deployment that would
  ([In a source checkout](../reference/harness.md#in-a-source-checkout)).
- `-e HARNESS_SYNC=off` turns the synchronisation off for a container.

Next: [Container options and variables](../reference/configuration.md).
