# SonarQube in the Orkeon Workshop image

The image ships with a complete, project-agnostic SonarQube analysis stack. Everything is pre-installed: Docker CLI, `dotnet-sonarscanner`, and helper scripts. SonarQube needs Docker: in the *Docker-in-Docker* and *Host Socket* VS Code configurations it starts with the container; in a `docker run` container (with `-e DOCKER_MODE=socket` or `dind`), start it once `docker info` answers, with `init-sonarqube.sh`.

---

## Architecture

Three dev container configurations share one image. Pick one in VS Code via
**Dev Containers: Reopen in Container** (or **Switch Container** to swap): *Orkeon Workshop*
(`.devcontainer/devcontainer.json`) has no Docker, hence no SonarQube; the two below carry Docker.

**DinD** — `.devcontainer/dind/` (`--privileged`):

```
Devcontainer (node:24 + .NET SDK + Docker CLI)
  +-- dockerd INSIDE the container (overlay2, /var/lib/docker volume)
        +-- SonarQube container (port 9000)
              image: ghcr.io/green-code-initiative/sonarqube-creedengo-csharp:2.1.0
              = sonarqube:lts-community + Creedengo C# eco-design plugin
              started via Docker-from-Docker pattern
              reachable at http://localhost:9000
```

**Host Socket (DooD)** — `.devcontainer/host-socket/` (no `--privileged`):

```
Host daemon (/var/run/docker.sock, bind-mounted as /var/run/docker-host.sock)
  +-- Devcontainer (node:24 + .NET SDK + Docker CLI)  -- talks to the host daemon
  +-- SonarQube container = SIBLING on the host, port 9000 published on the host
        init-docker.sh forwards 127.0.0.1:9000 -> host.docker.internal:9000
        so SONAR_HOST_URL stays http://localhost:9000 for every tool that assumes it
```

`node` access to the host socket is reconciled at runtime — `groupmod` to the host
socket GID on Linux/WSL, or a `socat` proxy on Windows/GID-0 — without ever changing
the host socket's ownership.

### Choosing a Docker mode

- `--privileged` and the `/var/lib/docker` volume are **DinD-only**.
- **Host-socket** mode requires Docker Desktop with the **WSL2 backend** and WSL
  integration enabled for the distro (the Hyper-V backend is unsupported; use DinD).
- Host-socket shares the host daemon, so run a **single** SonarQube instance per host.
- When first switching a machine from the old vfs-era volume to overlay2, reclaim it
  once on the host: `docker volume rm claude-code-docker-<devcontainerId>`
  (list candidates: `docker volume ls --filter name=claude-code-docker-`).

### Disk management (DinD)

`daemon.json` (baked at `/etc/docker/daemon.json`) bounds disk use: overlay2 storage
driver, json-file log rotation (10m × 3 per container) and BuildKit cache GC
(`defaultKeepStorage` 10GB, with `DOCKER_BUILDKIT=1` so builds actually use BuildKit).
At start, `init-docker.sh` runs a **safe** reclaim — dangling-image prune + build-cache
prune only; never `image prune -a` or `system prune --volumes` (those would force costly
re-pulls). Residual: **tagged** images you pull/build inside DinD are not auto-removed
and still grow `/var/lib/docker` over time — reclaim with `docker image rm` or by
removing the volume as above.

### Files overview

| File | Location in container | Purpose |
|---|---|---|
| `Dockerfile` | build-time | Installs Docker CLI, .NET SDK, `dotnet-sonarscanner`, and copies all scripts |
| `dind/devcontainer.json`, `host-socket/devcontainer.json` | build-time | The two configurations with Docker: privileges or socket, `DOCKER_MODE`, `SONAR_*` variables, and a `postStartCommand` that runs `init-docker.sh`, the firewall and `init-sonarqube.sh` |
| `init-docker.sh` | `/usr/local/bin/` | Docker as `DOCKER_MODE` says (`dind`, `socket`, `none`); run by the entrypoint and by those two configurations |
| `docker-compose.sonarqube.yml` | `/usr/local/share/sonarqube/` | SonarQube + Creedengo C# plugin service definition |
| `init-sonarqube.sh` | `/usr/local/bin/` | Start script (`postStartCommand` of the two configurations with Docker; by hand in a `docker run` container): starts SonarQube, sets the Creedengo profile, creates the project, generates the token |
| `sonar-analyze.sh` | `/usr/local/share/sonarqube/` | Generic analysis script with auto-detection and Markdown report generation |
| `setup-sonar-scripts.sh` | `/usr/local/bin/` (also as `setup-sonar-scripts`) | Deploys analysis scripts into any .NET project |
| `init-firewall.sh` | `/usr/local/bin/` | Firewall rules including Docker bridge and SonarQube port allowance |
| `sync-harness.sh` | `/usr/local/bin/` | Synchronises the image's harness (skills, agents, rules, hooks, references, library seeds) into the workshop (`/workspace`, `ORKEON_WORKSHOP`) at container start |

Every configuration works as the user `node`, as the scripts expect.

---

## Quick Start

### Starting it

In the DinD and Host Socket configurations the `postStartCommand` runs `init-sonarqube.sh`; in a
`docker run` container, run it yourself once `docker info` answers. It:

1. Verifies the Docker socket is available
2. Starts SonarQube via Docker Compose
3. Waits until SonarQube is healthy (up to 5 minutes)
4. Creates a default project (key from `SONAR_PROJECT_KEY`, otherwise the name of the workspace `.sln`; skipped when neither exists — the first analysis then creates it)
5. Generates an authentication token saved to `~/.sonar-token` (mode 600)

The token is auto-loaded in every new shell session via `.zshrc`. It is a token of this local instance
(`admin`/`admin` until you change that password, reachable from this machine only), and the one credential the image
ever writes to disk.

### Run an analysis

From your project root:

```bash
# Token is auto-loaded; if not, source it manually:
source ~/.sonar-token

# Run analysis (auto-detects .sln, projects, and tests)
bash scripts/sonar-analyze.sh
```

The script generates a Markdown report in `sonarqube/sonarqube-report-YYYY-MM-DD.md`.

---

## Eco-design analysis (Creedengo)

This devcontainer integrates the [Creedengo C# SonarQube plugin](https://github.com/green-code-initiative/creedengo-csharp-sonarqube) from the [Green Code Initiative](https://green-code-initiative.org/). It adds a catalog of static-analysis rules (`GCIxx`) that flag code patterns with a negative environmental impact: energy / resource over-consumption, "fatware" practices, patterns shortening device lifespan, etc.

### What's already done for you

- The SonarQube container image is `ghcr.io/green-code-initiative/sonarqube-creedengo-csharp:2.1.0` — same as `sonarqube:lts-community` but with the Creedengo plugin pre-installed in `/opt/sonarqube/extensions/plugins/`.
- `init-sonarqube.sh` automatically sets the **Creedengo** quality profile as the default profile for the C# language at first boot, so every new C# project picks it up without any manual UI step.

### What you still need to do per project

The plugin alone only ships rule *metadata* (descriptions, severities, profile). The actual code analysis is performed at build time by the matching Roslyn analyzer, distributed as a NuGet package. Without that package referenced in your `.csproj`, no Creedengo issue will ever be reported.

Add the [`Creedengo`](https://www.nuget.org/packages/Creedengo) NuGet package, version-aligned with the SonarQube plugin (use **2.1.0** to match the plugin pinned here).

**Option 1 — Per-project reference** (recommended for libraries / selective adoption):

```xml
<ItemGroup>
  <PackageReference Include="Creedengo" Version="2.1.0">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
  </PackageReference>
</ItemGroup>
```

**Option 2 — Solution-wide via `Directory.Build.props`** (recommended for monorepos):

Create a `Directory.Build.props` at the root of your solution:

```xml
<Project>
  <ItemGroup>
    <PackageReference Include="Creedengo" Version="2.1.0">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>
</Project>
```

All `.csproj` files at or below that folder will automatically inherit the package — no per-project edit needed.

> **Why `PrivateAssets=all` and `IncludeAssets=analyzers`?** This keeps the analyzer as a build-time-only dependency: it runs during `dotnet build`, emits warnings that `dotnet-sonarscanner` picks up, but is never published as a runtime dependency.

### Verifying that Creedengo is active

After running an analysis:

```bash
source ~/.sonar-token
bash scripts/sonar-analyze.sh
```

You can confirm Creedengo is operational by:

1. **In the report** — look for issues whose rule key starts with `creedengo-csharp:GCI` (e.g. `GCI69`, `GCI88`).
2. **In the UI** — http://localhost:9000 → *Quality Profiles* → C# → the active profile should be the Creedengo one (with rules tagged `eco-design`).
3. **In the rule catalog** — http://localhost:9000/coding_rules?languages=cs&tags=eco-design lists all enabled eco-design rules.

The full rule list is documented in the upstream [`RULES.md`](https://github.com/green-code-initiative/creedengo-csharp-sonarqube/blob/main/RULES.md).

### Migrating from a previous SonarQube setup

If your devcontainer previously ran `sonarqube:lts-community` (without Creedengo), the named Docker volume `sonarqube_extensions` is persistent and will mask the plugin baked into the new image. Wipe the SonarQube volumes once to let them be recreated from the Creedengo image:

```bash
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml down -v
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml up -d
```

> **Warning**: `-v` removes the SonarQube data volume too, so any existing analysis history, custom quality profiles, and admin password change will be lost. `init-sonarqube.sh` recreates the default project, token, and Creedengo profile at its next run.

### Upgrading the plugin

Bump the image tag in `.devcontainer/docker-compose.sonarqube.yml`:

```yaml
image: ghcr.io/green-code-initiative/sonarqube-creedengo-csharp:<new-version>
```

Then bump the matching NuGet package version in your project(s). Plugin and NuGet versions should always stay in sync — see the [compatibility table](https://github.com/green-code-initiative/creedengo-csharp-sonarqube#-compatibility).

---

## Usage Scenarios

### A. Human user — new project setup

```bash
# 1. Navigate to your .NET project
cd /workspace/my-project

# 2. Deploy SonarQube scripts into the project
setup-sonar-scripts

# This creates:
#   scripts/sonar-analyze.sh        — analysis script
#   docker-compose.sonarqube.yml    — SonarQube service (local copy)
#   .env.sonar                      — token config template
#   sonarqube/                      — report output directory
#   + updates .gitignore

# 3. Run analysis
source ~/.sonar-token
bash scripts/sonar-analyze.sh

# 4. View results
cat sonarqube/sonarqube-report-*.md
# or open http://localhost:9000 in a browser
```

### B. Human user — existing project (scripts already deployed)

```bash
cd /workspace/my-project
source ~/.sonar-token
bash scripts/sonar-analyze.sh
```

### C. Claude Code — automated analysis

Claude Code can run the full pipeline autonomously. Example prompt:

> Run a SonarQube analysis on this project and summarize the results.

Claude Code will execute:

```bash
# Ensure token is available
source ~/.sonar-token

# Run analysis from project root
bash scripts/sonar-analyze.sh

# Read and summarize the report
cat sonarqube/sonarqube-report-*.md
```

If the project doesn't have the scripts yet, Claude Code can initialize them first:

```bash
setup-sonar-scripts
source ~/.sonar-token
bash scripts/sonar-analyze.sh
```

### D. Claude Code — targeted analysis with options

```bash
source ~/.sonar-token

# Specify a particular solution file
bash scripts/sonar-analyze.sh --solution src/MyApp.sln

# Override the project key
bash scripts/sonar-analyze.sh --project-key MyCustomKey

# Point to a remote SonarQube instance
bash scripts/sonar-analyze.sh --host http://sonar.example.com:9000
```

---

## Command Reference

### `setup-sonar-scripts`

Deploys SonarQube analysis scripts into the current project directory.

```
Usage: setup-sonar-scripts [--target-dir ./scripts] [--force]

Options:
  --target-dir    Directory for scripts (default: ./scripts)
  --force         Overwrite existing files
```

**What it creates:**

- `scripts/sonar-analyze.sh` — the analysis script (copied from container)
- `docker-compose.sonarqube.yml` — SonarQube service definition (project root)
- `.env.sonar` — configuration template for token and settings
- `sonarqube/` — output directory for Markdown reports
- Updates `.gitignore` with: `sonarqube/`, `.env.sonar`, `coverage/`, `.sonarqube/`

### `sonar-analyze.sh`

Runs a full SonarQube analysis with code coverage and generates a Markdown report.

```
Usage: sonar-analyze.sh [--solution path/to.sln] [--project-key Key] [--host url]

Options:
  --solution      Path to .sln file (default: auto-detect)
  --project-key   SonarQube project key (default: derived from .sln filename)
  --host          SonarQube host URL (default: http://localhost:9000)

Environment variables:
  SONAR_TOKEN        (required) Authentication token
  SONAR_HOST_URL     SonarQube server URL
  SONAR_PROJECT_KEY  Project key
  SONAR_SOLUTION     Path to .sln file
```

**Auto-detection behavior:**

- Scans up to 3 levels deep for `.sln` files
- Identifies source projects (directories with `.csproj`, excluding `*Test*`)
- Identifies test projects (directories with `.csproj` matching `*Test*` or `*test*`)
- Derives project key from the solution filename

**Analysis pipeline:**

1. Check prerequisites (`dotnet`, `dotnet-sonarscanner`, `curl`, `jq`)
2. Auto-detect solution and project structure
3. Temporarily rename `sonar-project.properties` if present (avoids CLI conflicts)
4. Start SonarQube if not running (tries built-in compose, then project-local)
5. `dotnet sonarscanner begin` with OpenCover coverage format
6. `dotnet build` (Release configuration)
7. `dotnet test` with XPlat Code Coverage
8. `dotnet sonarscanner end`
9. Wait for SonarQube Compute Engine task to complete
10. Generate Markdown report with: Quality Gate, metrics, coverage by project/directory, all issues, security hotspots

### Docker Compose (SonarQube)

```bash
# Start SonarQube
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml up -d

# View logs
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml logs -f

# Stop SonarQube
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml down
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SONAR_TOKEN` | generated by `init-sonarqube.sh` (`~/.sonar-token`) | Authentication token for SonarQube API |
| `SONAR_HOST_URL` | `http://localhost:9000` | SonarQube server URL |
| `SONAR_PROJECT_KEY` | name of the `.sln` file | Project key override |
| `SONAR_SCANNER_OPTS` | `-Xmx512m` in the DinD and Host Socket configurations, unset otherwise | JVM options for the scanner |
| `SONAR_SOLUTION` | auto-detected | Path to .sln file |

---

## SonarQube Web UI

- **URL**: http://localhost:9000
- **Default credentials**: `admin` / `admin` (you will be prompted to change the password on first login)
- **Token management**: My Account > Security > Generate Tokens

---

## Report Output

The Markdown report (`sonarqube/sonarqube-report-YYYY-MM-DD.md`) contains:

- **Quality Gate** status with conditions
- **Global metrics**: lines of code, bugs, vulnerabilities, code smells, coverage, duplication, technical debt, cognitive complexity
- **Ratings**: reliability, security, maintainability (A-E scale)
- **Coverage by project**: per-project breakdown with lines, coverage %, bugs, code smells
- **Coverage by directory**: detailed per-directory metrics within each project
- **Issues summary**: by severity, by type, by project
- **All Bugs**: sorted by severity with file, line, and message
- **All Vulnerabilities**: sorted by severity
- **All Code Smells**: grouped by project, sorted by severity, with rule references
- **Security Hotspots**: by status and detailed list

---

## Troubleshooting

### SonarQube doesn't start

```bash
# Check Docker socket
ls -la /var/run/docker.sock

# Check container status
docker ps -a | grep sonarqube

# View SonarQube logs
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml logs

# Restart manually
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml down
docker compose -f /usr/local/share/sonarqube/docker-compose.sonarqube.yml up -d
```

### "SONAR_TOKEN is required" error

```bash
# Check if auto-generated token exists
cat ~/.sonar-token

# Source it
source ~/.sonar-token

# Or regenerate from SonarQube UI:
# http://localhost:9000 > My Account > Security > Generate Tokens
```

### Docker overlay/whiteout error (WSL2, DinD)

The daemon inside the container reads the image's `/etc/docker/daemon.json` (overlay2); when it cannot
start, `init-docker.sh` falls back once to the `vfs` driver on its own (`/var/log/dockerd.log` says why).
Keep a volume on `/var/lib/docker`: on the container's own file system overlay2 cannot run.

### dotnet-sonarscanner not found

```bash
# The image installs it in /usr/local/share/dotnet-tools (on the PATH of every shell)
dotnet tool list --tool-path /usr/local/share/dotnet-tools | grep sonarscanner

# Ensure PATH includes it
export PATH="$PATH:/usr/local/share/dotnet-tools"
```

### Firewall blocking SonarQube

The firewall script (`init-firewall.sh`) already allows traffic on Docker bridge networks (172.17-19.0.0/16) and localhost port 9000. If you encounter issues:

```bash
# Verify firewall rules
sudo iptables -L -n | grep -E "9000|172\.1[789]"

# Check SonarQube is reachable
curl -sf http://localhost:9000/api/system/status
```
