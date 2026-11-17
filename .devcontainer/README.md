# The `orkeon-workshop` image

This folder builds the image `orkeon-workshop`: Claude Code, the Orkeon CLI, a local Ollama and the
harness with which Claude Code designs, builds, tests and releases Orkeon teams. **Using** the image —
installing it, the workshop, teams, models, Docker modes, updates — is told in the
[documentation](../docs/README.md). This page is for whoever builds the image or works on it.

## What the image contains

| | |
|---|---|
| Claude Code | The official npm package: installed at the first start of a container — the image ships without it, the [published image](#the-published-image) and a local build with the default arguments alike (`CLAUDE_CODE_VERSION=none`, D60); the `devcontainer.json` files of this repository build with `latest`, which puts it in the image at build time. Around it: RTK, a CLI proxy that cuts the tokens spent on command output (its hook is set up by the entrypoint at the first start of a `docker run` container, not in the VS Code flows); `claude-usage-dashboard`, a web dashboard of what Claude Code spent per day, model and project, started in the background by the entrypoint at each start (log `/var/log/claude-usage.log`); `cc-usage`, what one session cost and what filled its context (D53); `gh`, the GitHub CLI at its latest release (from GitHub's apt repository: a new release rebuilds that layer alone), git-delta, zsh, fzf, tmux. |
| Orkeon | The `orkeon` CLI **built from the sources of the commit of Orkeon's `main` pinned as `ORKEON_SOURCE_REF`** (4709278, after the release 1.2.0: a fix the workshop needs is in no release yet, D115) — the released CLI published on nuget.org at `ORKEON_VERSION` when the channel is `release` (D110, which replaces D32), or a published dev build —, `esbuild` at the version Orkeon pins for `.ork.ts` crews, the TypeScript typings, `orkeon-update`, and `orkeon-mcp`, which serves Orkeon's tools to Claude Code over MCP (D112). |
| Orkeon Code | The coding agent built on Orkeon, from the commit of its `main` pinned as `ORKEON_CODE_COMMIT` (219cc06, version 1.0.0-rc.2; D111, D115): its launcher `orkeon-code` under `/usr/local/lib/orkeon-code/`, installed by its own installer from the archive its `scripts/build-install-archive.sh` builds at that commit (from its release archive at `ORKEON_CODE_VERSION` when `ORKEON_CODE_COMMIT` is empty), and the `orkeon-repl` it runs on, taken from the release archive of Orkeon 1.2.0 (the dotnet tool carries none), checked against its `SHA256SUMS`. `orkeon-code-run` runs one of its crews without the REPL (D113). |
| Orkeon Studio | Its two terminal applications, `orkeon-studio-config` and `orkeon-studio-run`, built from the tag `ORKEON_STUDIO_VERSION` (1.2.0; D111) under `/usr/local/share/orkeon-studio/`; `ORKEON_STUDIO_TEAMS_ROOT=/workspace/teams` makes them list the workshop's teams. The desktop application is Windows-only and not in the image. |
| The harness | Its files under `/usr/local/share/claude-harness/`, deployed into the workshop by `sync-harness.sh` — the packs of the folder's profile, chosen with `HARNESS_PROFILE` at the first start or the `workshop-profile` command after; the `orkeon-bench` CLI; `orkeon-harness-run`, a runner that loads Orkeon plugins; `orkeon-studio-check`, which reads the workshop's teams with Orkeon Studio's own code (`Orkeon.Studio.Core`, packed from the same commit); the .NET templates under `/usr/local/share/orkeon-harness/csharp/`, with a local NuGet feed of the Orkeon packages (`/usr/local/share/orkeon/packages`) and a warm package cache (`NUGET_PACKAGES`), so that they build behind the firewall. |
| Local models | Ollama with its CUDA runners; no model by default — the one to download is named at `docker run` (`-e OLLAMA_DEFAULT_MODEL=qwen3:8b`), D76. |
| Toolchains | Node 24 and TypeScript, .NET SDK 10 (with the `wasm-tools` workload), Python 3 with PyYAML, Rust. The base image is `node:24-bookworm`. |
| Quality tooling | The SonarQube stack and its scanners ([SONARQUBE.md](./SONARQUBE.md)), Stryker (.NET and JavaScript), vitest (pinned: the runner of the method's L1 unit level), `dotnet-coverage`, ReportGenerator, Cypress, graphify, `ast-grep` (pinned: the syntax-tree search the harness's `code-map.py` runs on). |
| Docker | The Docker CLI and Compose v2, against a daemon inside the container or the host's. |
| Firewall | `init-firewall.sh`, an allow-list of outbound hosts: GitHub's address ranges, `registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, three VS Code hosts, `packages.microsoft.com`, `download.docker.com`; plus DNS, outbound SSH (tcp/22), the Docker bridges (172.17-19.0.0/16) and the host's /24, tcp/9000 in `DOCKER_MODE=socket`, tcp/11434 in `OLLAMA_MODE=host` and tcp/`KEV_PORT` (8009) in `KEV_MODE=host`, both towards the address `host.docker.internal` resolves to only. `FIREWALL_EXTRA_DOMAINS` adds names (NuGet restores, Ollama pulls, the hosted decision APIs `api.typesafe.ai` and `api.liquid.ai`); nuget.org is not in the list. Started by the `postStartCommand` of the VS Code configurations, never by the entrypoint. |

## The files of this folder

| File | Role |
|---|---|
| `Dockerfile` | the image; Claude Code is installed in its last layers |
| `entrypoint.sh` | the start of a `docker run` container, as root: Docker, the harness synchronisation (as `node`), the permissions of `node`'s home, Claude Code, the RTK hook, zsh and the git identity, `claude-usage-dashboard`, Orkeon and Ollama, then the command as `node` (`gosu`) |
| `init-docker.sh` | Docker as `DOCKER_MODE` says — a daemon inside the container (`dind`), the host's through its socket (`socket`), or none (`none`); run by the entrypoint and by the `postStartCommand` of `dind/` and `host-socket/` |
| `sync-harness.sh` | brings the workshop in step with the harness of the image (managed files, seeds, backups; at every start, the scripts of `.claude/` in LF and executable, and a harness file checked out with CRLF line endings put back; deploys into a workshop, or into the git checkout of a repository whose profile is made for one — `HARNESS_PROFILE`, `workshop-profile` — without writing a file git tracks). `--dry-run`, `--force` (even when the image has not changed), `--adopt` (a folder that is not a workshop yet, once); `--write-manifest <harness-dir> <manifest-file>` at image build. In a git checkout it refuses whole, exit 2, a deployment that would write a file git tracks or write through a symbolic link; registers the MCP server `orkeon` in the folder's `.mcp.json` and enables it in `.claude/settings.local.json`, leaving alone the user's own entries, a changed command, `disabledMcpjsonServers` and a `.mcp.json` git tracks (`HARNESS_ORKEON_MCP=0` turns it off, D112) |
| `init-claude-code.sh` | installs Claude Code: `--strict` at build, at start when it is missing |
| `workshop.sh` | the `workshop` command, a function the shells of the image source: it starts `claude --dangerously-skip-permissions --teammate-mode in-process` in the workshop; `WORKSHOP_SKIP_PERMISSIONS=0` and `WORKSHOP_TEAMMATE_MODE=<mode>\|off` change one option each; `workshop --secret NAME` first asks for the value of a variable without echoing it and exports it into the shell for the session — a key reaches the runs without being typed in the clear or kept in the history (D47); `workshop --git-identity "<name>" <email>` exports the four `GIT_AUTHOR_*`/`GIT_COMMITTER_*` variables git reads before its configuration, so that the harness commits with that identity (D71) without a `git config` on disk. The permission option is left out in a folder without the harness (no hook guards a session there), as root (unless `IS_SANDBOX=1`), and when the caller gives an option that decides the matter; `workshop setup [status | keys --provider <id> --model <model> | subscription]` starts no Claude Code: it sets the model keys of the workshop through `orkeon-bench setup`, the key asked without echo and handed to that one command in `WORKSHOP_SETUP_KEY` (D108, D109) |
| `init-orkeon.sh`, `install-ollama.sh`, `orkeon-update.sh` | Orkeon settings, the Ollama server and, with `KEV_MODE=host`, the forwarder to a decision model server on the host (`init-orkeon.sh --status` shows what runs); the Ollama bundle; in-container updates of Orkeon and Ollama (`orkeon-update [--check] [--channel auto\|dev\|release\|source] [--version X] [--source [ref]] [--source-dir <dir>] [--ollama [version]]`) |
| `orkeon-mcp.sh` | the `orkeon-mcp` command, the MCP server the workshop's `.mcp.json` names (D112): ends as `orkeon mcp serve` with the session's folder mounted read-write at `/workspace` and a short list of tools crossed with what the CLI has; `WORKSHOP_MCP_TOOLS` and `WORKSHOP_MCP_EXTRA_TOOLS` change the list, `--print-tools` prints it |
| `install-orkeon-code.sh` | at image build: `install-orkeon-code.sh <orkeon version> <orkeon-code version>` installs the `orkeon-repl` of that Orkeon release, then Orkeon Code by its own installer, each archive checked against the `SHA256SUMS` of its release (D111) |
| `orkeon-code-run.sh` | the `orkeon-code-run` command (D113): `orkeon-code-run <crew> --inputs '<json>'` runs one crew of Orkeon Code through its own `orkeon-code run` (D115), the project on `/workspace`, JSON on stdout, settings derived from the machine's when Orkeon Code has none; an untrusted folder is refused (exit 3); `--list` names the crews; used by the skill `/orkeon-code` |
| `init-firewall.sh` | the outbound allow-list |
| `init-sonarqube.sh`, `setup-sonar-scripts.sh`, `sonar-analyze.sh`, `docker-compose.sonarqube.yml`, `SONARQUBE.md`, `daemon.json` | the quality stack, and the daemon configuration of Docker-in-Docker |
| `clean-restore.sh` | `bin/`/`obj/` clean-up and NuGet restore of a .NET project (never the workshop root) |
| `skills-legacy.manifest` | the skills older images deployed into `/workspace/.claude/skills`, so that the synchronisation can retire them |
| `.dockerignore` | keeps local build output out of the build context: `bench/node_modules`, `dist/`, `coverage/`, the `bin/`, `obj/` and `packages/` of the templates, `harness/evals/.fixtures` |
| `devcontainer.json`, `dind/`, `host-socket/` | VS Code configurations for **working on the image**: the repository on `/workspace`, no workshop there |
| [`harness/`](./harness/README.md) | the Claude Code side — `HARNESS.md`, skills, subagent charters, rules, hooks, templates, settings — plus reference documents, library seeds, the pilot teams (their READMEs, and the workbook of the first one), the workshop's VS Code configuration and the evals; deployed into the workshop |
| [`bench/`](./bench/README.md) | `orkeon-bench`, the harness CLI (TypeScript) |
| [`cc-usage/`](./cc-usage/README.md) | `cc-usage`, copied from `claude-code-token-usage` (MIT) with four changes; installed under `/usr/local/share/cc-usage/` with a `cc-usage` command, read by `/token-usage` (pack `usage`, not in the `user` profile); its unit tests run at image build, from the evals |
| [`csharp/`](./csharp/README.md) | the .NET templates, `orkeon-studio-check`, the script that packs the Orkeon packages nuget.org does not carry (`scripts/build-orkeon-packages.sh`), and the one that builds Orkeon Studio from its tag — `Orkeon.Studio.Core` into the local feed, the two terminal applications into an install folder (`scripts/build-orkeon-studio.sh <version> <feed> <install dir>`, D111) |

The design document is the [Orkeon Workshop plan](../docs/orkeon-workshop-plan.md): `plan § x.y` and
`D<n>` in these sources refer to its sections and to the decisions of its § 13.

### Variables read at container start

The variables a `docker run -e` or a `devcontainer.json` sets, and the script that reads each. The
user-facing meaning is in [configuration](../docs/reference/configuration.md).

| Variable | Default | Read by |
|---|---|---|
| `ORKEON_WORKSHOP` | `/workspace` | `entrypoint.sh`, `sync-harness.sh`, `workshop.sh` |
| `HARNESS_SYNC` | — (`off` skips the synchronisation) | `sync-harness.sh` |
| `HARNESS_PROFILE` | `user` | `sync-harness.sh`: the first profile of a folder that has none |
| `HARNESS_ORKEON_MCP` | — (`0`: the Orkeon MCP server is neither registered in `.mcp.json` nor enabled) | `sync-harness.sh` |
| `WORKSHOP_MCP_TOOLS`, `WORKSHOP_MCP_EXTRA_TOOLS` | — (the default list of `orkeon-mcp.sh`; `all`, or a list) | `orkeon-mcp.sh` |
| `ORKEON_STUDIO_TEAMS_ROOT` | `/workspace/teams` (image `ENV`) | `orkeon-studio-run`, `orkeon-studio-config` |
| `CLAUDE_CODE_VERSION` | `latest` (`none`: install nothing) | `init-claude-code.sh` |
| `WORKSHOP_SKIP_PERMISSIONS`, `WORKSHOP_TEAMMATE_MODE` | — | `workshop.sh` |
| `IS_SANDBOX` | — (`1`: root may skip the permissions) | `workshop.sh` |
| `OLLAMA_MODE` | `local` (`host`, `off`) | `init-orkeon.sh`, `init-firewall.sh` |
| `OLLAMA_DEFAULT_MODEL` | — (the model pulled at the first start and written to the Orkeon settings; empty: nothing is pulled, no settings file) | `init-orkeon.sh` |
| `OLLAMA_CONTEXT_LENGTH` | `8192` (image `ENV`) | Ollama |
| `OLLAMA_AUTO_PULL` | — (`1`: pull even without a models volume, `0`: never) | `init-orkeon.sh` |
| `OLLAMA_MODELS` | `/home/node/.ollama/models` | `init-orkeon.sh` |
| `KEV_MODE` | `off` (`host`: forward 127.0.0.1:`KEV_PORT` to `host.docker.internal`, a decision model server on the host) | `init-orkeon.sh`, `init-firewall.sh` |
| `KEV_PORT` | `8009` | `init-orkeon.sh`, `init-firewall.sh` |
| `DOCKER_MODE` | `dind` (`socket`, `none`) | `init-docker.sh`, `init-firewall.sh` |
| `FIREWALL_EXTRA_DOMAINS` | — | `init-firewall.sh` |
| `TZ` | — (UTC in the published image) | the container |
| `GITHUB_PACKAGES_TOKEN` (or `/run/secrets/github_packages_token`), `GITHUB_PACKAGES_USER` | — | `orkeon-update.sh`, dev channel |
| `ORKEON_HARNESS_OFFLINE` | `1` (image `ENV`: no NuGet vulnerability audit of the templates) | the templates' restore |
| `CLAUDE_CONFIG_DIR` | `/home/node/.claude`, set by the repository's root `devcontainer.json` and by the workshop's seeded one (not by `dind/`, `host-socket/` or the image) | Claude Code, `cc-usage` |
| `NUGET_LOCAL_PATTERNS` | — | `clean-restore.sh` |

## Building

```bash
docker build -t orkeon-workshop .devcontainer
```

From the root of the repository. By default the build builds Orkeon from the sources of the commit of
its `main` the Dockerfile pins (`ORKEON_CHANNEL=source`, `ORKEON_SOURCE_REF`, D115) and packs from the
same checkout the packages the .NET templates need, builds Orkeon Studio's terminal applications from
their tag, and installs Orkeon Code built from the commit `ORKEON_CODE_COMMIT` on the `orkeon-repl` of the
Orkeon release `ORKEON_VERSION` — no token (D110, D111, D115). To build exactly
what the published image carries, with the pins of `.github/workflows/image.yml`, and to refresh the build
cache when they change:

```bash
v() { sed -n "s/^ *$1: *//p" .github/workflows/image.yml; }
docker build --build-arg ORKEON_CHANNEL=$(v ORKEON_CHANNEL) --build-arg ORKEON_SOURCE_REF=$(v ORKEON_COMMIT) \
  --build-arg ORKEON_VERSION=$(v ORKEON_VERSION) --build-arg ORKEON_REFRESH=$(v ORKEON_COMMIT) \
  --build-arg ORKEON_CODE_VERSION=$(v ORKEON_CODE_VERSION) --build-arg ORKEON_CODE_COMMIT=$(v ORKEON_CODE_COMMIT) \
  --build-arg ORKEON_STUDIO_VERSION=$(v ORKEON_STUDIO_VERSION) -t orkeon-workshop .devcontainer
```

To try another unreleased Orkeon, build it from its sources; Orkeon Code then needs the release whose
`orkeon-repl` it runs on:

```bash
docker build --build-arg ORKEON_CHANNEL=source --build-arg ORKEON_SOURCE_REF=<branch, tag or commit> \
  --build-arg ORKEON_REPL_VERSION=<a release> --build-arg ORKEON_REFRESH=<any new value> -t orkeon-workshop .devcontainer
```

A published dev build instead (PowerShell, dev channel with a token):

```powershell
# Dev channel: a personal access token (classic) with the read:packages scope
$env:GITHUB_PACKAGES_TOKEN = "<token>"
docker build --secret id=github_packages_token,env=GITHUB_PACKAGES_TOKEN `
  --build-arg ORKEON_CHANNEL=dev --build-arg ORKEON_REFRESH=$(Get-Date -Format yyyyMMddHHmm) `
  -t orkeon-workshop .devcontainer
```

| Build arg | Default | Meaning |
|---|---|---|
| `ORKEON_CHANNEL` | `source` | `release`: the CLI published on nuget.org, at `ORKEON_VERSION`; the local feed of the templates is packed from the tag of that version (D110). `source`: built from the sources at `ORKEON_SOURCE_REF`, version `<sources' version>.src.<commit date>.g<commit>`; the feed is packed from the same checkout; needs `ORKEON_REPL_VERSION`. `dev`: latest green `main` (`<version>.dev.<n>`) from GitHub Packages, token required. `auto`: `dev` when the secret holds a working token, `release` otherwise. |
| `ORKEON_SOURCE_REF` | `4709278…` (D115) | With `source`: the branch, tag or commit to build. |
| `ORKEON_VERSION` | `1.2.0` | With `release` or `dev`: the exact version to install; empty, the latest of the channel. With `source`: the release whose `orkeon-repl` Orkeon Code runs on, unless `ORKEON_REPL_VERSION` is given. |
| `ORKEON_CODE_VERSION` | `1.0.0-rc.2` | The Orkeon Code release to install (D111); with `ORKEON_CODE_COMMIT`, the version that commit's `package.json` must carry. |
| `ORKEON_CODE_COMMIT` | `219cc06…` (D115) | A commit of Orkeon Code (40 characters) to build and install instead of the release; empty, the release. |
| `ORKEON_STUDIO_VERSION` | `1.2.0` | The tag of Orkeon Studio its terminal applications and `Orkeon.Studio.Core` are built from (D111). |
| `ORKEON_REPL_VERSION` | — | The Orkeon release whose `orkeon-repl` Orkeon Code runs on: `ORKEON_VERSION` unless given. |
| `ORKEON_REFRESH` | — | Any new value re-runs the Orkeon layer and those after it: a new release, a new commit, the latest published build. |
| `OLLAMA_VERSION` | `0.35.0` | Ollama release to install (`latest` is accepted, but the build cache then keeps whatever was current at the first build). |
| `GIT_DELTA_VERSION` | `0.18.2` | git-delta. |
| `ZSH_IN_DOCKER_VERSION` | `1.2.0` | The zsh-in-docker set-up script. |
| `DOCKER_COMPOSE_VERSION` | `v2.32.4` | The Compose v2 plugin. |
| `SONAR_SCANNER_VERSION` | `8.0.1.6346` | The SonarScanner CLI. |
| `ESBUILD_VERSION` | `0.25.12` | The version Orkeon pins. |
| `HARNESS_VERIFY` | `1` | Any other value skips the self-check of the .NET templates (restore, build and tests without network, plugin loaded end to end): faster rebuilds while iterating on the image. |
| `CLAUDE_CODE_VERSION` | `none` | `none` leaves Claude Code out of the image: the container installs it at its first start — how the [published image](#the-published-image) is built, and a local build with the default arguments too (D60). A version (`latest`, `2.1.296`) installs it from npm in the last layers of the image (the build cache keeps whatever was current when that layer was built; changing the value rebuilds only those layers): the `devcontainer.json` files of this repository build that way. |
| `TZ` | — | Time zone of the container, e.g. `Europe/Paris`. |

- GitHub Packages requires a token even for a public repository. With `ORKEON_CHANNEL=auto`, a missing
  or rejected token does not fail the build: it installs the tagged prerelease, and the container start
  banner says so (`Orkeon <version> (channel: release, no usable GitHub Packages token)`). With `dev`, the
  build stops.
- A secret is not part of the build cache key: after adding or renewing the token, change
  `ORKEON_REFRESH`, otherwise the cached layer is reused.
- The token is only mounted for the duration of that build step; it is not stored in the image.

What a build needs and does:

- It needs the network: Docker Hub, the Debian and Microsoft package repositories, npm, PyPI, GitHub (and
  `cli.github.com`, the apt repository of `gh`), nuget.org, huggingface.co and SonarSource. Count on 40 to 70 minutes for a first build, depending on
  the connection and the machine (a `source` build compiles Orkeon, about ten minutes more); the image
  weighed about 19 GB before Orkeon Code and Studio's applications were added.
- It is also the test of the harness. The build stops if a harness eval fails or cannot run (strict mode,
  `HARNESS_EVALS_STRICT=1`: a skipped case fails; the evals run the unit tests of `cc-usage` too), if the
  tests of `orkeon-bench` fail, if a .NET template does not restore, build and pass its tests without
  network, or if one of the three CLIs (`orkeon`, `orkeon-harness-run`, `orkeon-studio-check`) cannot run
  as `node`. It stops too if `orkeon-studio-config --version`, `orkeon-studio-run --version` or
  `orkeon-code --version` fails, or if an archive of Orkeon or Orkeon Code does not match its `SHA256SUMS`. It also stops if `orkeon doctor` does not report `esbuild` ok, if an Ollama binary has a
  library `ldd` cannot find, if the `workshop` function is missing from bash or from `node`'s zsh, if the
  zsh profile still prints a locale warning, or if `CLAUDE_CODE_VERSION=none` leaves a copy of Claude Code
  in the image.
- The Orkeon packages that nuget.org does not carry are packed from the tag of the installed version
  (or, for a `source` build, from the checkout the CLI was built from), and the templates' `OrkeonVersion` is set to that version.
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
| `ghcr.io/orkeon/orkeon-workshop:latest` | a push to `main` touches `.devcontainer/**` (this README excepted) or the workflow, or a manual run on `main` | the state of `main` |
| `:X.Y.Z`, `:X.Y` (and `:X` from 1.0.0 on) | a tag `vX.Y.Z` is pushed | that version |

**It does not contain Claude Code**, which is Anthropic's proprietary software and not the project's to
redistribute — nor does an image built locally with the default arguments (`CLAUDE_CODE_VERSION=none`,
D60). `init-claude-code.sh` installs it from npm the first time a container starts — the entrypoint calls
it, so does every `devcontainer.json` (the three of this repository, the workshop's), and `workshop` calls
it again if the first attempt had no network. It needs the npm registry (which the firewall allows) and
takes less than a minute; each new container does it once. `-e CLAUDE_CODE_VERSION=<version>` installs
that version instead of the latest, and `-e CLAUDE_CODE_VERSION=none` installs nothing. Only an image built
with `CLAUDE_CODE_VERSION=latest` (or a version), as the `devcontainer.json` files of this repository do,
carries it from the start.

It differs from an image built locally with the default arguments on one point: **its time zone is UTC**
(`-e TZ=Europe/Paris` changes it for a container).

It carries the Orkeon pinned in the workflow: `ORKEON_COMMIT`, the commit the references, the tool
catalogue and the templates were checked on, with `ORKEON_CHANNEL` and `ORKEON_VERSION` beside it. With
the channel `release` that commit is the one of the tag `v<ORKEON_VERSION>` (D110, which replaces D32);
with `source`, the present case, a commit of Orkeon's `main` that carries a fix no release has yet, built
from its sources, `ORKEON_VERSION` naming the release before it (D115). Orkeon Code
(`ORKEON_CODE_VERSION`, and `ORKEON_CODE_COMMIT` when its `main` is pinned) and Orkeon Studio
(`ORKEON_STUDIO_VERSION`) are pinned there too (D111). Every change of this repository brings the pins to
the latest release of Orkeon, once the workshop has been checked on it — Orkeon's `main` is not followed
commit by commit, a pinned commit of it being an exception that ends with the release carrying its fix; the image itself is built and validated only when the user asks for it (D74,
[`CLAUDE.md`](../CLAUDE.md)). The run's summary names the versions, and `orkeon --version` prints
`orkeon <version>`. A manual run can build Orkeon from the sources of a branch, tag or
commit (input `orkeon_ref`, e.g. `main`), to try a newer Orkeon before moving the pin; `no_cache` rebuilds every
layer. Started on `main`, a manual run publishes and moves `:latest` like a push there; on any other branch it
builds without publishing, like a pull request.

Its build is the same Dockerfile, so it runs the same tests: a published image has passed the harness
evals, the tests of `orkeon-bench`, the offline self-check of the .NET templates and a run of the three CLIs
(`orkeon`, `orkeon-harness-run`, `orkeon-studio-check`) as `node`. The pull requests are built too, without being published.

Workflows. `image.yml` runs on a push to `main` or a `vX.Y.Z` tag and on a pull request that touches
`.devcontainer/**` (this README excepted) or the workflow itself; its build cache lives in the same package,
under the tag `:buildcache`, written from `main` only. `checks.yml` gives faster feedback: on a push to `main`
or a pull request that touches `harness/**`, `bench/**`, `workshop.sh`, `sync-harness.sh`, `cc-usage/**` or
itself, it runs `npm test` of the bench and `evals/run.sh` in a bare `node:24-bookworm` container. `docs.yml`
builds the documentation site with docfx on a change of `docs/**`, the root READMEs, `docfx.json`, `toc.yml`,
`scripts/build-docs-site.sh` or `scripts/docs-site/**`, and publishes it to GitHub Pages from `main`.

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
the harness is not deployed there (`sync-harness.sh` says so at each start) unless you give it a profile
made for a checkout: `workshop-profile dev` in a terminal deploys the packs of the `dev` profile and this repository's own
(`repo-orkeon-workshop`), kept out of git by `.git/info/exclude`
([profiles](../docs/reference/harness.md#profiles-and-packs)). To build teams, open a workshop folder instead ([The workshop in VS Code](../docs/getting-started/vs-code.md)).

```bash
devcontainer up --workspace-folder . --config .devcontainer/dind/devcontainer.json
devcontainer up --workspace-folder . --config .devcontainer/host-socket/devcontainer.json
```

In the VS Code flows the image entrypoint does not run: the `postStartCommand` of each configuration
runs the start-up scripts instead — `init-claude-code.sh`, `sync-harness.sh`, `init-orkeon.sh` and the
firewall (as root, through `sudo`) in all three; `dind/` and `host-socket/` add `init-docker.sh` and
`init-sonarqube.sh`. The RTK hook and `claude-usage-dashboard` are set up by the entrypoint only: a
`docker run` container has them, a VS Code container does not. That hook, `rtk hook claude` in
`~/.claude/settings.json`, rewrites `git` into `rtk git`, which the worktree isolation of Claude Code
refuses: in a folder where Claude Code works in worktrees (D70), remove it from that file — the harness's own
dispatcher runs rtk, and leaves git alone in a worktree. `--gpus=all` is in the `runArgs` of all three:
remove it on a machine without an NVIDIA GPU.
