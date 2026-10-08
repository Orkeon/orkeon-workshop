# The `orkeon-workshop` image

This folder builds the image `orkeon-workshop`: Claude Code, the Orkeon CLI, a local Ollama and the
harness with which Claude Code designs, builds, tests and releases Orkeon teams. **Using** the image —
installing it, the workshop, teams, models, Docker modes, updates — is told in the
[documentation](../docs/README.md). This page is for whoever builds the image or works on it.

## What the image contains

| | |
|---|---|
| Claude Code | The official npm package: installed at build time in an image you build (`CLAUDE_CODE_VERSION`, `latest` by default), at the first start of a container in the [published image](#the-published-image), which ships without it. Around it: RTK, a CLI proxy that cuts the tokens spent on command output (its hook is set up at first start); the `claude-usage` dashboard; `gh`, git-delta, zsh, fzf, tmux. |
| Orkeon | The `orkeon` CLI (a dotnet tool) **built from the sources of Orkeon's `main` branch** (D32) — or, on request, a published dev or release build —, `esbuild` at the version Orkeon pins for `.ork.ts` crews, the TypeScript typings, `orkeon-update`. |
| The harness | Its files under `/usr/local/share/claude-harness/`, deployed into the workshop by `sync-harness.sh`; the `orkeon-bench` CLI; `orkeon-harness-run`, a runner that loads Orkeon plugins; `orkeon-studio-check`, which reads the workshop's teams with Orkeon Studio's own code (`Orkeon.Studio.Core`, packed from the same commit); the .NET templates under `/usr/local/share/orkeon-harness/csharp/`, with a local NuGet feed of the Orkeon packages (`/usr/local/share/orkeon/packages`) and a warm package cache (`NUGET_PACKAGES`), so that they build behind the firewall. |
| Local models | Ollama with its CUDA runners; `qwen3:8b` by default. |
| Toolchains | Node 24 and TypeScript, .NET SDK 10 (with the `wasm-tools` workload), Python 3 with PyYAML, Rust. The base image is `node:24-bookworm`. |
| Quality tooling | The SonarQube stack and its scanners ([SONARQUBE.md](./SONARQUBE.md)), Stryker (.NET and JavaScript), `dotnet-coverage`, ReportGenerator, Cypress, graphify. |
| Docker | The Docker CLI and Compose v2, against a daemon inside the container or the host's. |
| Firewall | `init-firewall.sh`, an allow-list of outbound hosts. |

## The files of this folder

| File | Role |
|---|---|
| `Dockerfile` | the image; Claude Code is installed in its last layers |
| `entrypoint.sh` | the start of a `docker run` container: Docker, permissions, harness synchronisation, Orkeon and Ollama, then the command as `node` |
| `init-docker.sh` | Docker as `DOCKER_MODE` says — a daemon inside the container (`dind`), the host's through its socket (`socket`), or none (`none`); run by the entrypoint and by the `postStartCommand` of `dind/` and `host-socket/` |
| `sync-harness.sh` | brings the workshop in step with the harness of the image (managed files, seeds, backups; at every start, the scripts of `.claude/` in LF and executable, and a harness file checked out with CRLF line endings put back; deploys only into a workshop) |
| `init-claude-code.sh` | installs Claude Code: `--strict` at build, at start when it is missing |
| `workshop.sh` | the `workshop` command, a function the shells of the image source: it starts `claude --dangerously-skip-permissions --teammate-mode in-process` in the workshop; `WORKSHOP_SKIP_PERMISSIONS=0` and `WORKSHOP_TEAMMATE_MODE=<mode>\|off` change one option each. The permission option is left out in a folder without the harness (no hook guards a session there), as root, and when the caller gives an option that decides the matter |
| `init-orkeon.sh`, `install-ollama.sh`, `orkeon-update.sh` | Orkeon settings and the Ollama server; the Ollama bundle; in-container updates of Orkeon and Ollama |
| `init-firewall.sh` | the outbound allow-list |
| `init-sonarqube.sh`, `setup-sonar-scripts.sh`, `sonar-analyze.sh`, `docker-compose.sonarqube.yml`, `SONARQUBE.md`, `daemon.json` | the quality stack, and the daemon configuration of Docker-in-Docker |
| `clean-restore.sh` | `bin/`/`obj/` clean-up and NuGet restore of a .NET project (never the workshop root) |
| `skills-legacy.manifest` | the skills older images deployed into `/workspace/.claude/skills`, so that the synchronisation can retire them |
| `devcontainer.json`, `dind/`, `host-socket/` | VS Code configurations for **working on the image**: the repository on `/workspace`, no workshop there |
| [`harness/`](./harness/README.md) | the Claude Code side — `HARNESS.md`, skills, subagent charters, rules, hooks, templates, settings — plus reference documents, library seeds, the pilot teams (their READMEs, and the workbook of the first one), the workshop's VS Code configuration and the evals; deployed into the workshop |
| [`bench/`](./bench/README.md) | `orkeon-bench`, the harness CLI (TypeScript) |
| [`csharp/`](./csharp/README.md) | the .NET templates, `orkeon-studio-check`, and the script that packs the Orkeon packages nuget.org does not carry |

The design document is the [Orkeon Workshop plan](../docs/orkeon-workshop-plan.md): `plan § x.y` and
`D<n>` in these sources refer to its sections and to the decisions of its § 13.

## Building

```bash
docker build -t orkeon-workshop .devcontainer
```

From the root of the repository. By default the build clones Orkeon at the head of `main` and compiles
the CLI and the packages the .NET templates need from that commit — no token. To build the commit the
published image carries, the one the workshop was checked on (`ORKEON_COMMIT` in
`.github/workflows/image.yml`), and to refresh the build cache when the commit changes:

```bash
c=$(sed -n 's/^ *ORKEON_COMMIT: *//p' .github/workflows/image.yml)
docker build --build-arg ORKEON_SOURCE_REF=$c --build-arg ORKEON_REFRESH=$c -t orkeon-workshop .devcontainer
```

A published build instead (PowerShell, dev channel with a token):

```powershell
# Dev channel: a personal access token (classic) with the read:packages scope
$env:GITHUB_PACKAGES_TOKEN = "<token>"
docker build --secret id=github_packages_token,env=GITHUB_PACKAGES_TOKEN `
  --build-arg ORKEON_CHANNEL=dev --build-arg ORKEON_REFRESH=$(Get-Date -Format yyyyMMddHHmm) `
  -t orkeon-workshop .devcontainer
```

| Build arg | Default | Meaning |
|---|---|---|
| `ORKEON_CHANNEL` | `source` | `source`: built from the sources at `ORKEON_SOURCE_REF`, version `<sources' version>.src.<commit date>.g<commit>` (e.g. `1.0.0-rc.4.src.20261008.gbd3420c`); the local feed of the templates is packed from the same checkout. `dev`: latest green `main` (`<version>.dev.<n>`) from GitHub Packages, token required. `release`: latest tagged prerelease from nuget.org. `auto`: `dev` when the secret holds a working token, `release` otherwise. |
| `ORKEON_SOURCE_REF` | `main` | With `source`: the branch, tag or commit to build. |
| `ORKEON_VERSION` | — | With `dev` or `release`: exact version to install instead of the latest. |
| `ORKEON_REFRESH` | — | Any new value re-runs the Orkeon layer: a new commit of `main`, the latest published build. |
| `OLLAMA_VERSION` | `0.35.0` | Ollama release to install (`latest` is accepted, but the build cache then keeps whatever was current at the first build). |
| `ESBUILD_VERSION` | `0.25.12` | The version Orkeon pins. |
| `HARNESS_VERIFY` | `1` | `0` skips the self-check of the .NET templates (restore, build and tests without network, plugin loaded end to end): faster rebuilds while iterating on the image. |
| `CLAUDE_CODE_VERSION` | `latest` | Claude Code version installed from npm, in the last layers of the image (the build cache keeps whatever was current when that layer was built; changing the value rebuilds only those layers). `none` leaves Claude Code out: the container then installs it at its first start, which is how the [published image](#the-published-image) is built. |
| `TZ` | — | Time zone of the container, e.g. `Europe/Paris`. |

- GitHub Packages requires a token even for a public repository. With `ORKEON_CHANNEL=auto`, a missing
  or rejected token does not fail the build: it installs the tagged prerelease, and the container start
  banner says so (`Orkeon <version> (channel: release, no usable GitHub Packages token)`). With `dev`, the
  build stops.
- A secret is not part of the build cache key: after adding or renewing the token, change
  `ORKEON_REFRESH`, otherwise the cached layer is reused.
- The token is only mounted for the duration of that build step; it is not stored in the image.

What a build needs and does:

- It needs the network: Docker Hub, the Debian and Microsoft package repositories, npm, PyPI, GitHub,
  nuget.org, huggingface.co and SonarSource. Count on 40 to 70 minutes for a first build, depending on
  the connection and the machine — compiling Orkeon from the sources takes about ten of them; the image
  weighs about 19 GB.
- It is also the test of the harness. The build stops if a hook eval fails, if the tests of
  `orkeon-bench` fail, if a .NET template does not restore, build and pass its tests without network, or
  if one of the three CLIs (`orkeon`, `orkeon-harness-run`, `orkeon-studio-check`) cannot run as `node`.
- The Orkeon packages that nuget.org does not carry are packed from the checkout the CLI was built from
  (or, for a published build, from its tag), and the templates' `OrkeonVersion` is set to that version.
  A new `ORKEON_REFRESH` value re-runs everything from the Orkeon layer down: the build, the pack, the
  restore of the templates and their self-check.
- The Ollama bundle is a 1.4 GB download; `install-ollama.sh` resumes an interrupted transfer. Docker
  Desktop caps the build cache (20 GB by default): where that layer gets evicted, every build downloads
  it again. Raise `builder.gc.defaultKeepStorage` in Settings → Docker Engine to keep it.

## The published image

The CI of the repository builds the image and publishes it to GitHub Container Registry
(`.github/workflows/image.yml`):

| Tag | Published when | Content |
|---|---|---|
| `ghcr.io/orkeon/orkeon-workshop:latest` | a push to `main` changes the image | the state of `main` |
| `:X.Y.Z`, `:X.Y` (and `:X` from 1.0.0 on) | a tag `vX.Y.Z` is pushed | that version |

It differs from an image built locally with the default arguments on two points:

- **It does not contain Claude Code**, which is Anthropic's proprietary software and not the project's
  to redistribute. `init-claude-code.sh` installs it from npm the first time a container starts — the
  entrypoint calls it, so does every `devcontainer.json` (the three of this repository, the workshop's),
  and `workshop` calls it again if the first attempt had no network. It needs the npm registry (which the
  firewall allows) and takes less than a minute; each new container does it once.
  `-e CLAUDE_CODE_VERSION=<version>` installs that version instead of the latest, and
  `-e CLAUDE_CODE_VERSION=none` installs nothing.
- **Its time zone is UTC** (`-e TZ=Europe/Paris` changes it for a container).

It carries Orkeon built from the commit pinned in the workflow, `ORKEON_COMMIT` (D32): the commit the
references, the tool catalogue and the templates were checked on. Every change of this repository brings it
to the latest commit of Orkeon's `main`, once the workshop has been checked on it, and is done only when the
image has been built green on that commit ([`CLAUDE.md`](../CLAUDE.md)). The workflow passes it as `ORKEON_SOURCE_REF`, so the run's summary names it,
and `orkeon --version` shows it (`….src.<date>.g<commit>`). A manual run can build another branch, tag or
commit (input `orkeon_ref`, e.g. `main`), to try a newer Orkeon before moving the pin; it publishes like any
run on `main`.

Its build is the same Dockerfile, so it runs the same tests: a published image has passed the harness
evals, the tests of `orkeon-bench`, the offline self-check of the .NET templates and a run of the three CLIs
(`orkeon`, `orkeon-harness-run`, `orkeon-studio-check`) as `node`. The pull requests are built too, without being published.

Maintainers, at the first publication: GitHub creates the package as private. Make it public once, in
the package settings (Change visibility); until then `docker pull` asks for a login.

## Checking an image

```bash
orkeon-bench doctor                   # the tools the harness relies on, and the workshop layout
bash /workspace/.claude/evals/run.sh  # the hooks, in the layout the workshop really has
orkeon-studio-check                   # every team of the workshop, as Orkeon Studio reads it
/usr/local/share/orkeon-harness/csharp/scripts/verify-templates.sh --offline --smoke
                                      # the .NET templates and the plugin runner, without network
```

The image build already runs the evals (in the image's own layout) and the self-check of the templates;
it runs `orkeon-studio-check` only with `--help`, since the image holds no team.

## Working on the image in VS Code

**Dev Containers: Reopen in Container** on this repository offers three configurations — the three
[Docker modes](../docs/guides/docker-modes.md): *Orkeon Workshop* (`devcontainer.json`, no Docker
access), *Docker-in-Docker (DinD)* (`dind/`) and *Host Socket (DooD)* (`host-socket/`). Each builds the
image from these sources and opens the repository on `/workspace`. The repository is not a workshop, so
the harness is not deployed there (`sync-harness.sh` says so at each start); to build teams, open a
workshop folder instead ([The workshop in VS Code](../docs/getting-started/vs-code.md)).

```bash
devcontainer up --workspace-folder . --config .devcontainer/dind/devcontainer.json
devcontainer up --workspace-folder . --config .devcontainer/host-socket/devcontainer.json
```

In the VS Code flows the image entrypoint does not run: the `postStartCommand` of each configuration
runs the start-up scripts instead — in `dind/` and `host-socket/`, `init-docker.sh` (as root, through
`sudo`), the firewall and `init-sonarqube.sh` as well. `--gpus=all` is in their `runArgs`: remove it on a machine without an
NVIDIA GPU.
