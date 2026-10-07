# Container options and variables

*English · [Français](../fr/reference/configuration.md)*

## `docker run` options

| Option | What it is for |
|---|---|
| `-v "<folder>:/workspace"` | **Required: the workshop.** The harness is deployed there, Claude Code opens there, your teams live there. Any folder; `%USERPROFILE%\Orkeon` is the one whose `teams\` Orkeon Studio lists by default ([The workshop](../concepts/workshop.md#orkeon-studio-sees-it)). |
| `--name <name>` | the name of the container, for `docker start -ai <name>` and `docker exec` |
| `-it --init` | an interactive terminal, and a small init process that reaps the processes the container starts |
| `-v cc-ollama:/home/node/.ollama/models` | the local models in a volume: downloaded once, shared by every container, kept when a container is replaced. Without a volume, the default model is not pulled automatically. |
| `--gpus=all` | the NVIDIA GPU, for the local models ([Models](../guides/models.md#using-the-gpu)). Remove it on a computer without one, or the container will not start. |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | what the optional firewall needs |
| `-v /var/run/docker.sock:/var/run/docker-host.sock`, `-e DOCKER_MODE=socket`, `--add-host=host.docker.internal:host-gateway` | Docker from inside the container through your computer's daemon, for the SonarQube stack ([Docker modes](../guides/docker-modes.md)) |
| `--privileged -e DOCKER_MODE=dind -v orkeon-docker:/var/lib/docker` | Docker-in-Docker instead, its images in a volume |
| `-v "<name>-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude` | keeps the Claude Code state (sign-in, history, memory) in a volume, so that it survives a new container ([Updating](../guides/updating.md)) |
| `-v <file>:/run/secrets/github_packages_token:ro` | a token for in-container Orkeon updates from the dev channel, kept out of `docker inspect` (`-e GITHUB_PACKAGES_TOKEN` works too) |

## Variables of the image

Set them with `-e NAME=value` on `docker run`, or in `containerEnv` of a `devcontainer.json`. The two
`WORKSHOP_*` variables are read by the `workshop` command each time it runs, so they can also be set
for one call: `WORKSHOP_TEAMMATE_MODE=tmux workshop`. That command starts
`claude --dangerously-skip-permissions --teammate-mode in-process`, followed by whatever you add; an
option you give yourself (`workshop --permission-mode plan`) replaces its default. As root the
permission option is left out, since Claude Code refuses it there.

| Variable | Default | What it does |
|---|---|---|
| `ORKEON_WORKSHOP` | `/workspace` | the workshop's path in the container: `-v "<folder>:/orkeon" -e ORKEON_WORKSHOP=/orkeon` |
| `HARNESS_SYNC` | on | `off`: do not bring the workshop in step with the harness at start |
| `CLAUDE_CODE_VERSION` | `latest` | for an image without Claude Code (the published one): the version installed at the first start; `none` installs nothing |
| `WORKSHOP_SKIP_PERMISSIONS` | on | `workshop` starts Claude Code with `--dangerously-skip-permissions`, which is what lets it run without asking; `0` — or any value other than `1`, `on`, `yes`, `true` — leaves the option out, and Claude Code asks for what the workshop's settings do not allow. In a folder without the harness the option is left out unless this variable is set to `1` |
| `WORKSHOP_TEAMMATE_MODE` | `in-process` | `workshop` starts Claude Code with `--teammate-mode in-process` (the teammates of an agent team run in the same terminal); another mode Claude Code accepts (`auto`, `tmux`, `iterm2`) is passed as it is, and `off` leaves the option out — Claude Code then chooses |
| `OLLAMA_MODE` | `local` | `local`, `host` (your computer's Ollama; add `--add-host=host.docker.internal:host-gateway`), `off` |
| `OLLAMA_DEFAULT_MODEL` | `qwen3:8b` | the model pulled at first start and written to the Orkeon settings |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | the context window of the local model server |
| `OLLAMA_AUTO_PULL` | — | `0`: never pull · `1`: pull even when the models folder is not a volume |
| `DOCKER_MODE` | `dind` | `dind`, `socket` or `none` (no Docker; without `--privileged`, `dind` fails and says so) ([Docker modes](../guides/docker-modes.md)) |
| `FIREWALL_EXTRA_DOMAINS` | empty | more hosts for the firewall (below) |
| `TZ` | UTC | the time zone, e.g. `Europe/Paris` |

**Do not invent `ORKEON_*` variables.** Orkeon loads every variable whose name starts with `ORKEON_`
into its configuration and its secret provider. Use only Orkeon's own (`ORKEON_Llm__Model`,
`ORKEON_Llm__BaseUrl`…, and `ORKEON_Llm__Profiles__<id>__BaseUrl`… for a named profile) and the two of the
harness, `ORKEON_WORKSHOP` and `ORKEON_HARNESS_OFFLINE`, which Orkeon ignores. They override the settings
file, profiles included: the run gate reads them too ([Models](../guides/models.md#the-approval-of-paid-runs)).

The launchers of a team read one more: `TEAM_ENV=<set>` runs it on the mount set `mounts.<set>/<slug>/`
([Mount points](../concepts/mount-points.md#mount-sets-the-same-team-on-other-folders)). The switches of
the harness hooks, `HARNESS_*`, are listed in [The harness](./harness.md#switches).

## Firewall

`init-firewall.sh` limits what the container can reach to an allow-list: GitHub, npm, Anthropic, VS Code
and Microsoft package hosts. The workshop's VS Code configuration starts it; after a `docker run`, start
it by hand:

```bash
sudo --preserve-env=FIREWALL_EXTRA_DOMAINS,OLLAMA_MODE,DOCKER_MODE /usr/local/bin/init-firewall.sh
```

`FIREWALL_EXTRA_DOMAINS` (separated by spaces or commas) adds hosts:

| Need | Hosts |
|---|---|
| NuGet restores, Orkeon from nuget.org | `api.nuget.org` |
| Orkeon dev builds | `nugetregistryv2prod.blob.core.windows.net` |
| Ollama model pulls | `registry.ollama.ai dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com` |
| a remote model provider other than Anthropic | its API host, e.g. `api.openai.com` |

These names often resolve to CDN addresses shared with unrelated sites, so each entry widens what the
container can reach. For models, the alternative is to pull them once into the `cc-ollama` volume from a
container started without the firewall.

## Where things are in the container

| Path | What |
|---|---|
| `/workspace` | the workshop |
| `~/.config/Orkeon/appsettings.json` | the Orkeon settings: the model your teams use |
| `/workspace/settings/<slug>/appsettings.json` | a team's own Orkeon settings, used instead of the line above by its launchers and `orkeon-harness-run` — by Orkeon Studio too, instead of its own settings file; `orkeon-bench run`, on the simulated model, uses a copy of it with the model settings replaced ([The workshop](../concepts/workshop.md)) |
| `/home/node/.ollama/models` | the local models (the `cc-ollama` volume) |
| `/var/log/ollama.log` | the log of the local model server |
| `/usr/local/share/claude-harness/` | the harness shipped by the image (deployed into the workshop) |
| `/usr/local/share/orkeon-harness/csharp/` | the .NET templates |
| `/usr/local/share/orkeon/packages` | the local NuGet feed of the Orkeon packages |
| `/usr/local/share/orkeon/typings/orkeon.d.ts` | the typings of the TypeScript scripting language |

Next: [The harness](./harness.md).
