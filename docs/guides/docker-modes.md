# Docker modes and SonarQube

*English · [Français](../fr/guides/docker-modes.md)*

Orkeon teams do not need Docker inside the container. The quality stack does: SonarQube runs as a
small set of containers. The image supports three set-ups.

| Mode | How | Choose it when |
|---|---|---|
| **No Docker** | `-e DOCKER_MODE=none` (no socket, no `--privileged`) | you build and run teams only — the workshop's own VS Code configuration works this way |
| **Host socket** (DooD) | `-v /var/run/docker.sock:/var/run/docker-host.sock -e DOCKER_MODE=socket` | the default of the commands in these pages: light, shares your computer's images and build cache |
| **Docker-in-Docker** (DinD) | `--privileged -e DOCKER_MODE=dind` | you want full isolation from your computer's Docker |

At start, `init-docker.sh` reads `DOCKER_MODE` (`dind` when unset) to start a Docker daemon inside the
container, wire up your computer's, or do nothing (`none`). Without `--privileged`, an unset mode tries
Docker-in-Docker, fails and says so in the start log: pass `-e DOCKER_MODE=none` to skip it.

## Host socket

The container reuses your computer's Docker daemon. No `--privileged`, no nested daemon, nothing piling
up in a volume; containers it starts are *siblings* on your computer, and SonarQube stays reachable at
`http://localhost:9000` through a forwarder.

On Windows it works without any path trick, with Docker Desktop's **WSL 2 based engine**: the container
runs in Docker Desktop's Linux VM, where the socket `/var/run/docker.sock` exists — that is what gets
mounted, not a Windows path. The Hyper-V backend is not supported.

```powershell
$name = "my-orkeon-workshop"                                 # the container; its two volumes take its name
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

docker run -it --init --name $name --cap-add=NET_ADMIN --cap-add=NET_RAW `
  --add-host=host.docker.internal:host-gateway --gpus=all `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop
```

From Git Bash on Windows (not PowerShell), disable path conversion:
`MSYS_NO_PATHCONV=1 docker run … -v //var/run/docker.sock:/var/run/docker-host.sock …`.

Check it from inside the container:

```bash
docker info           # succeeds: it talks to your computer's daemon
docker ps             # shows your computer's containers
echo $DOCKER_MODE     # socket
```

| Problem | Fix |
|---|---|
| `docker info` fails; the start log says "the host Docker daemon is not responding" | Docker Desktop is not running, or its WSL integration is off for this distribution: check both |
| `/var/run/docker-host.sock is missing` | the mount did not resolve — probably the Hyper-V backend: switch to WSL 2, or use DinD |
| SonarQube unreachable at `localhost:9000` | the forwarder retries every 2 s once SonarQube is up; see `/var/log/sonar-forward.log` and `getent hosts host.docker.internal` |

## Docker-in-Docker

```bash
name="my-orkeon-workshop"                                    # the container; its two volumes take its name
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

docker run -it --init --privileged --gpus=all --name "$name" \
  -v orkeon-docker:/var/lib/docker \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$HOME/Orkeon:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e DOCKER_MODE=dind orkeon-workshop
```

In both commands, the `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` line names the local model downloaded at the first
start; remove it to download none ([Models](./models.md)).

A `dockerd` runs inside the container. Its images live in the `orkeon-docker` volume on
`/var/lib/docker`, which keeps them from one container to the next — without a volume there, the overlay2
driver cannot run and the daemon falls back to the slower, larger `vfs`. Its disk use is bounded
(overlay2, log rotation, build cache collected at 10 GB, a safe prune at start), but images you pull or
build inside it still grow that volume. Host-socket mode has no such volume: clean your computer with
`docker system prune` as usual.

## SonarQube

The image carries the SonarQube stack and its scanners. It needs Docker (either mode) and serves its
interface at `http://localhost:9000`. In a `docker run` container, start it once `docker info` answers:

```bash
init-sonarqube.sh     # starts the stack, sets the Creedengo profile, writes a token to ~/.sonar-token
```

That token belongs to this local instance (`admin`/`admin` until you change that password, reachable
from this machine only); it is the one credential the image writes to disk. The configuration and the
analysis of a project are described in [SONARQUBE.md](../../.devcontainer/SONARQUBE.md). The `/quality-report`
skill (pack `quality`, in the `dev`, `release` and `all` profiles) runs Sonar when a server answers
([the skills of the packs](../reference/harness.md#the-skills-of-the-packs)).

## Advanced: the worktrees on a volume

The start commands of the [README](../../README.md#get-started), of [Install](../getting-started/install.md#3-start-the-container)
and of this page create this volume and mount it by default: `-v "${name}-worktrees:/worktrees"` with
`-e HARNESS_WORKTREE_ROOT=/worktrees`, one volume per container, named after it (D85). It matters when your folder
is a Windows folder (the `-v …:/workspace` of the commands: a 9p mount under WSL 2) and you run `/dev-batches`.
Your folder stays where it is, shared with Windows; only the worktrees of the batches, and their package cache
(`packages` for Orkeon), live on the volume, on Docker's own disk. Measured on Orkeon (V-40): a build of the
solution twice as fast, an incremental build of a test project 4.5 times, a worktree made 70 times faster, and
none of the read errors the mount gives under load. Check it from the container: the preflight of `/dev-batches`
prints `ok    worktree root: /worktrees, a mount of its own`.

What you give up: a batch's worktree is not visible from Windows until it is merged into your folder; the
worktrees still read their git history from your folder; the volume grows by about 30 GB per built worktree — the
harness removes each merged one, and `docker system df -v` shows the volume's size. Removing the volume
(`docker volume rm <name>-worktrees`, the container stopped and removed first) deletes the worktrees still there
with their unmerged work, and the package cache, refilled at the next batch.

**To do without it**, leave out the line `-v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees`
and its `docker volume create`: nothing else changes, the worktrees stay under `.claude/worktrees/` in your folder
(D85). With `HARNESS_WORKTREE_ROOT` set but no volume, the preflight warns that the worktrees would die with the
container; an unusable folder is refused, never silently replaced.

**A container created before**, without the two options, gets the volume by being recreated as
[Updating](./updating.md) does — your folder and its Claude Code volume are kept:

1. Create the volume, once, `$name` holding the container's name (the same line in PowerShell and bash):

   ```bash
   docker volume create "${name}-worktrees"
   ```

2. Add two options to its `docker run` command, everything else unchanged — in PowerShell:

   ```powershell
     -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
   ```

   in bash (`\` at the end of the line instead of the backtick):

   ```bash
     -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
   ```

   In VS Code, the same in `devcontainer.json`: `"mounts": ["source=orkeon-worktrees-${devcontainerId},target=/worktrees,type=volume"]`
   beside the others, and `"containerEnv": {"HARNESS_WORKTREE_ROOT": "/worktrees"}`.

## In VS Code

The repository's three VS Code configurations are these three modes — *Orkeon Workshop* (no Docker),
*Orkeon Workshop - Docker-in-Docker (DinD)* and *Orkeon Workshop - Host Socket (DooD)* — for working on
the image itself; the last two set
Docker up at each start (`init-docker.sh`), then SonarQube. The workshop's own
configuration has no Docker access ([The workshop in VS Code](../getting-started/vs-code.md)): for the
quality stack, use a `docker run` container in host-socket mode.

Next: [Updating](./updating.md).
