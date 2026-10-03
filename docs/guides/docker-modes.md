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
docker run -it --init --name my-orkeon-workshop --cap-add=NET_ADMIN --cap-add=NET_RAW `
  --add-host=host.docker.internal:host-gateway --gpus=all `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
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
docker run -it --init --privileged --gpus=all --name my-orkeon-workshop \
  -v orkeon-docker:/var/lib/docker \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$HOME/Orkeon:/workspace" \
  -e DOCKER_MODE=dind orkeon-workshop
```

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
analysis of a project are described in [SONARQUBE.md](../../.devcontainer/SONARQUBE.md).

## In VS Code

The repository's three VS Code configurations are these three modes — *Orkeon Workshop* (no Docker),
*Docker-in-Docker (DinD)* and *Host Socket (DooD)* — for working on the image itself; the last two set
Docker up at each start (`init-docker.sh`), then SonarQube. The workshop's own
configuration has no Docker access ([The workshop in VS Code](../getting-started/vs-code.md)): for the
quality stack, use a `docker run` container in host-socket mode.

Next: [Updating](./updating.md).
