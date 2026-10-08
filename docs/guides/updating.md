# Updating

*English · [Français](../fr/guides/updating.md)*

Three things get updated, in different ways: Orkeon and Ollama inside a container, the harness, and the
image itself.

## Orkeon and Ollama, in a container

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

## The harness

Nothing to do: the harness — the skills, the agents, the rules, the hooks and the `.claude/settings.json`
that declares them — travels in the image, and at each start the container runs `sync-harness.sh`, which
brings the workshop in step with the harness of its image. A new image brings a new harness: recreate the
container on it ([below](#the-image)), and its first start updates the workshop it mounts.

The image carries a manifest of its harness, one hash per file, and the workshop keeps the manifest of
what was deployed last (`.claude/.harness-manifest`). When the two are the same, nothing is done.
Otherwise each file is handled by the rule of its place:

| In the workshop | On a new image |
|---|---|
| `.claude/` (skills, agents, rules, hooks, templates, evals, `settings.json`, `harness/`), `references/`, `library/examples/` | **The image's**: new and changed files are copied, retired ones removed. A file you edited is first saved under `.claude/harness-backup/<stamp>/`. |
| `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.claude/settings.local.json`, `.devcontainer/devcontainer.json`, `settings/README.md`, the shelves of `library/` | **Created once**, when absent: never updated. |
| `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.<name>/`, `archive/`, `.claude/local/`, `references/local/`, anything you add | **Yours**: never touched. |

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
- `-e HARNESS_SYNC=off` turns the synchronisation off for a container.

## The image

A container keeps the image it was created from. Updating is therefore two things: downloading the new
image, then replacing your container by a new one created from it. Nothing of yours lives in the
container itself — your workshop is a folder of your computer, the local models and the Claude Code state
(your sign-in, history and memory) are in Docker volumes — so nothing is lost, and the old container is
kept until the new one works.

### Moving a container to a new image

The commands are typed in a terminal **of your computer** — PowerShell on Windows, any terminal on
Linux — not in the terminal of the container. They are the same on both, except at step 5. They use the
container name of [Install](../getting-started/install.md), `my-orkeon-workshop`: if you gave yours
another name, replace it everywhere (`docker ps -a` lists your containers). The long part is the
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

**5. Create the new container**, with the command of [Install](../getting-started/install.md) and your
folder of step 2 in the variable. On Windows, in PowerShell:

```powershell
$workshop = "$env:USERPROFILE\Orkeon"                        # your workshop folder: the one of step 2

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
workshop="$HOME/Orkeon"                                      # your workshop folder: the one of step 2

docker run -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$workshop:/workspace" \
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

### Without the Claude Code volume

A container created without `-v my-orkeon-workshop-claude:/home/node/.claude` keeps the Claude Code
state — `~/.claude` and `~/.claude.json`: your sign-in, history and memory — in its own writable layer,
and **a new container does not inherit the writable layer of the old one**. After steps 1 to 4, in place
of step 5, create the new container without starting it, copy the state into it, then start it. On
Windows, in PowerShell:

```powershell
$workshop = "$env:USERPROFILE\Orkeon"                        # your workshop folder: the one of step 2

# Create the new container, without starting it
docker create -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${workshop}:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop

# Copy the Claude Code state from the old container into the new one
cmd /c "docker cp my-orkeon-workshop-old:/home/node/.claude - | docker cp - my-orkeon-workshop:/home/node/"
cmd /c "docker cp my-orkeon-workshop-old:/home/node/.claude.json - | docker cp - my-orkeon-workshop:/home/node/.claude/"

# Start it
docker start -ai my-orkeon-workshop
```

On Linux:

```bash
workshop="$HOME/Orkeon"                                      # your workshop folder: the one of step 2

# Create the new container, without starting it
docker create -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$workshop:/workspace" \
  -e DOCKER_MODE=socket orkeon-workshop

# Copy the Claude Code state from the old container into the new one
docker cp my-orkeon-workshop-old:/home/node/.claude - | docker cp - my-orkeon-workshop:/home/node/
docker cp my-orkeon-workshop-old:/home/node/.claude.json - | docker cp - my-orkeon-workshop:/home/node/.claude/

# Start it
docker start -ai my-orkeon-workshop
```

Then go on with step 6.

- The copy streams an archive from one container to the other, so owners and modes are kept. On Windows
  it goes through `cmd` because Windows PowerShell 5 corrupts binary data in a pipe (PowerShell 7.4 and
  `bash` do not need it).
- With `CLAUDE_CONFIG_DIR`, `.claude.json` lives inside `~/.claude`, hence its destination.
- `docker diff my-orkeon-workshop-old` lists anything else the old container changed; the same pair of
  `docker cp` moves it.

The next time, the volume is in place: the steps above are enough, with step 5 as written.

## VS Code

With the workshop's VS Code configuration ([The workshop in VS Code](../getting-started/vs-code.md)),
download the new image — the three commands of step 3 above — then run **Dev Containers: Rebuild
Container** from the command palette (`Ctrl+Shift+P`): it recreates the container on the current
`orkeon-workshop` image. The Claude Code state lives in a volume and survives it.

Next: [Container options and variables](../reference/configuration.md).
