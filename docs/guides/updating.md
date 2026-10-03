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

Nothing to do: at each start, the container brings the workshop in step with the harness of its image
([The workshop](../concepts/workshop.md#what-belongs-to-whom)). A new image brings a new harness; files
you edited among the image's are saved under `.claude/harness-backup/` before being replaced.

## The image

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

A container keeps the image it was created from: to use the new one, recreate the container. Your
workshop folder and the models volume are not inside the container, so they stay.

### Moving a container to a new image

A container started with the commands of [Install](../getting-started/install.md) keeps the Claude Code
state in its `my-orkeon-workshop-claude` volume: recreate it with the same command and nothing is lost.
The steps below are for a container created without that volume.

A container can neither change its image nor gain `--gpus` or a volume: it has to be recreated, and **a
new container does not inherit the writable layer of the old one** — `~/.claude` and `~/.claude.json`
(your Claude Code sign-in, history and memory) and everything else that is not in a mounted folder. The
steps below keep the old container until the new one is validated, and copy the Claude Code state over.

Before pulling or building the new image, keep the previous one:
`docker tag orkeon-workshop:latest orkeon-workshop:previous`. Then, in PowerShell:

```powershell
$c = "my-orkeon-workshop"   # the container to move

# 1. Stop the old container and keep it under another name
docker stop $c
docker rename $c "${c}-old"

# 2. Create the new one, without starting it. The volume on ~/.claude, with CLAUDE_CONFIG_DIR,
#    makes the Claude Code state survive the next updates.
docker create -it --init --name $c --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${c}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop

# 3. Copy the Claude Code state from the old container into the new one
cmd /c "docker cp ${c}-old:/home/node/.claude - | docker cp - ${c}:/home/node/"
cmd /c "docker cp ${c}-old:/home/node/.claude.json - | docker cp - ${c}:/home/node/.claude/"

# 4. Start it
docker start -ai $c

# 5. Once the new container works
docker rm "${c}-old"
```

- Step 3 streams an archive from one container to the other, so owners and modes are kept. It goes
  through `cmd` because Windows PowerShell 5 corrupts binary data in a pipe (PowerShell 7.4 and `bash`
  do not need it).
- With `CLAUDE_CONFIG_DIR`, `.claude.json` lives inside `~/.claude`, hence its destination. Without the
  volume and the variable, copy it to `${c}:/home/node/`.
- `docker diff "${c}-old"` lists anything else the old container changed; the same pair of `docker cp`
  moves it.
- To go back: `docker rm -f $c; docker rename "${c}-old" $c`.

The next time, with the `~/.claude` volume in place, recreating the container keeps the Claude Code
state without step 3.

## VS Code

With the workshop's VS Code configuration, **Dev Containers: Rebuild Container** recreates the container
on the current `orkeon-workshop` image; the Claude Code state lives in a volume and survives it.

Next: [Container options and variables](../reference/configuration.md).
