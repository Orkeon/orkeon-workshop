# Models: local and remote

*English · [Français](../fr/guides/models.md)*

Two kinds of AI models are at work in the workshop, and they are not the same:

| | Which model | Paid by |
|---|---|---|
| **Claude Code**, the builder | Claude, through your Claude account | your Claude plan or API account |
| **Your teams**, when they run | the model of Orkeon's settings: a **local** Ollama model by default, or a **remote** provider you configure | local: nothing but machine time · remote: the provider, per token |

This page is about the second: the model your teams use.

## Local models (Ollama)

The image runs [Ollama](https://ollama.com) inside the container and configures Orkeon to use it: at
the first start it writes `~/.config/Orkeon/appsettings.json` (Ollama on `http://localhost:11434`, model
`qwen3:8b`, 600 seconds per call, 120 seconds of silence at most between two chunks of a streamed answer,
one request at a time) and downloads the model in the background when
the models folder is a volume (`-v cc-ollama:/home/node/.ollama/models`).

| Variable | Default | What it does |
|---|---|---|
| `OLLAMA_MODE` | `local` | `local`: a server in the container · `host`: use the Ollama of your computer (one server and one copy of the model for all containers; add `--add-host=host.docker.internal:host-gateway`) · `off`: start nothing |
| `OLLAMA_DEFAULT_MODEL` | `qwen3:8b` | the model pulled at first start and written to the Orkeon settings (about 5 GB) |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | the context window. Ollama's own default below 24 GB of VRAM is 4096, which an agent with tools overflows silently; `8192` keeps `qwen3:8b` entirely on an 8 GB GPU |
| `OLLAMA_AUTO_PULL` | — | `0` never pulls, `1` pulls even without a volume |

Set them on the container: `-e OLLAMA_MODE=host`. Logs are in `/var/log/ollama.log`.

```bash
orkeon-update --check     # versions, and where the model is loaded: GPU, CPU or a share of each
ollama ps                 # the loaded model and its processor share
```

### Using the GPU

Ollama uses an NVIDIA GPU when the container was **created** with `--gpus=all`. Nothing to install in the
container.

| Host | Prerequisites |
|---|---|
| Windows, Docker Desktop | an NVIDIA GPU, an up-to-date NVIDIA driver, an up-to-date WSL 2 kernel (`wsl --update`), the WSL 2 based engine. See [Docker's documentation](https://docs.docker.com/desktop/features/gpu/). |
| Linux, Docker Engine | the NVIDIA driver and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), then `sudo nvidia-ctk runtime configure --runtime=docker` and `sudo systemctl restart docker` |

Check that Docker can hand the GPU to a container, then that the model really runs on it:

```bash
docker run --rm --gpus=all --entrypoint nvidia-smi orkeon-workshop    # on your computer: the GPU table
ollama run qwen3:8b --think=false "Reply with OK"                       # in the container
ollama ps                                                               # PROCESSOR: 100% GPU
```

| Symptom | Meaning |
|---|---|
| `could not select device driver "" with capabilities: [[gpu]]` | Docker cannot hand over a GPU: see the prerequisites, or remove `--gpus=all` to run on the CPU. The failed `docker run` has usually created the container: `docker rm my-orkeon-workshop` before trying again ([Troubleshooting](../reference/troubleshooting.md#the---gpusall-option)) |
| `nvidia-container-cli: initialization error: WSL environment detected but no adapters were found` | Docker Desktop on Windows, and WSL sees no NVIDIA GPU: no NVIDIA card, or a driver missing or too old, or WSL out of date. `nvidia-smi` in PowerShell, `wsl --update`, `wsl -- nvidia-smi` tell which; the same `docker rm` applies ([Troubleshooting](../reference/troubleshooting.md#the---gpusall-option)) |
| `nvidia-smi: command not found` in the container | it was created without `--gpus=all`; that cannot be added afterwards — recreate it ([Updating](./updating.md#moving-a-container-to-a-new-image)) |
| `ollama ps` shows a split such as `41%/59% CPU/GPU` | the model and its context do not fit in the free VRAM: lower `OLLAMA_CONTEXT_LENGTH`, use a smaller model, or free the card (each container in `local` mode loads its own copy — `OLLAMA_MODE=host` shares one) |
| `100% GPU`, yet slow | the host throttles the GPU (laptop power or thermal profile) |

### One request at a time

A local model answers one request at a time. Several at once — a `parallel` crew, a manager and its
workers — saturate the GPU and slow every one of them down, so a local model runs with
`RateLimiting.MaxConcurrentRequests` at 1: Orkeon then queues the other calls, up to `QueueLimit` (32 here;
the default, 5, refuses the calls beyond it). The image writes
`"RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 }` in `~/.config/Orkeon/appsettings.json`,
and at each start puts the limit back to 1 in that file when it targets the local model without one —
after an `orkeon init`, for instance; absent, 0 or below all mean unlimited. A limit of 1 or more that you
set yourself is kept. When the base URL is local, `orkeon-bench doctor` fails without a limit in the machine
file, and the checks refuse a team's own settings file (`settings/<slug>/appsettings.json`) without one —
nothing rewrites that file for you, and it replaces the machine file.

### When a team is slow

`qwen3` thinks before it answers, which multiplies the tokens to generate — hence the 600 seconds per
call. A streamed answer that stops arriving — a model stuck, a connection gone — fails after 120 seconds of
silence instead of hanging until the timeout: that is `Llm.StreamIdleSeconds`, which the image writes for
the local model and puts back at each start when the file lacks it; a value you set yourself is kept. A
slow machine that stays silent longer while it reads a long prompt needs a higher value, or the key
removed. To trade reasoning for speed, add `"Thinking": { "Enabled": false }` to the `Llm` section of
`~/.config/Orkeon/appsettings.json`, or set `ORKEON_Llm__Thinking__Enabled=false` for one run.

## Remote models

A remote provider (Anthropic, OpenAI, Mistral…) is configured the Orkeon way, never in a team folder:

- for the whole container: `orkeon init` writes `~/.config/Orkeon/appsettings.json`;
- for one team: its own settings file `settings/<slug>/appsettings.json` of the workshop (its launchers,
  `orkeon-harness-run` and Orkeon Studio pass it instead of the machine's; a test run on the simulated
  model, `orkeon-bench run`, uses a copy of it with the model settings replaced —
  [The workshop](../concepts/workshop.md));
- for one run: Orkeon's variables `ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model`, `ORKEON_Llm__ApiKeyEnvVar`;
- for some agents only: a **named profile** `Llm:Profiles:<id>` in any of these settings, with the same keys
  as `Llm` (`BaseUrl`, `Model`, `ApiKeyEnvVar`…). An agent or the crew takes it with `llm: { profile: <id> }`
  in YAML or `llm.profile("<id>")` in TypeScript, a task with `llmOverride: { profile: <id> }` or
  `.withProfile("<id>")`; `orkeon run --llm-profile <id>` runs the whole crew on it. A profile is part of the
  machine's or the team's settings: a team that names one must find it there;
- in Orkeon Studio: Studio's own settings for a team without a settings file of its own, and the model
  setting the team's card names (`"profile"` in `studio-team.json`, spelled exactly as the setting is named
  in Studio), which wins over both files;
- in the bench: a named profile of `tests/<slug>/bench.config.json`
  ([Testing](../concepts/testing.md#local-and-remote-models)).

**Keys never go to disk** in the workshop: a hook refuses to write a key pattern under `teams/`,
`workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/` or `.claude/`, and the checks refuse a
team settings file that holds one — under `Secrets:`, in a `…ApiKey`, `…Password`, `…Secret` or `…Token`, or
in a connection string. Keep keys in environment variables;
settings name the variable (`"ApiKeyEnvVar": "ANTHROPIC_API_KEY"` under `Llm` or a named profile, `"keyEnv"` in
a bench profile), never the key. An agent that holds the
`shell_command` tool reads, whatever its mount points, the machine's settings, the OAuth tokens of the mail
accounts, Claude Code's credentials and, through `/proc`, the key of its run: the checks warn about it and
refuse it in a team with a mail account. Give that tool to no agent that reads untrusted input — a mail, a
web page, a document.

### How a key reaches the container

The settings name the variable; the value reaches the container by one of three ways, and never through the
conversation with Claude — it would keep it. Claude says which way, where to type it, and nothing else:

| For | You type | Lasts |
|---|---|---|
| **this session** | in the terminal of the container, after `/exit`: `workshop --secret ANTHROPIC_API_KEY` — it asks for the value, shows nothing while you type it, keeps nothing (not in the shell history either), and opens Claude Code with the variable set | until the container is left |
| **the container** | on your computer, when you create the container: set the variable in that terminal (`$env:ANTHROPIC_API_KEY = "…"` in PowerShell, `export ANTHROPIC_API_KEY=…` on Linux), then add `-e ANTHROPIC_API_KEY` (no value) to the `docker run` command of [Install](../getting-started/install.md#3-start-the-container) — Docker forwards the variable, so the command holds no value | the life of the container: `docker start` keeps it |
| **VS Code** | in the workshop's `.devcontainer/devcontainer.json`: `"remoteEnv": { "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}" }`, the variable set on your computer | every container VS Code opens |

A line in the container's `~/.zshrc` is your own choice: it is lost when the container is replaced
([Updating](./updating.md)), and it is typed in the clear. Claude never writes a key anywhere, and never
asks you for one ([Harness](../reference/harness.md)); `orkeon doctor` says whether the variable the
settings name is set, without showing it.

The firewall, when it runs, allows `api.anthropic.com`; any other provider needs its host in
`FIREWALL_EXTRA_DOMAINS` ([configuration](../reference/configuration.md#firewall)).

## The approval of paid runs

A remote model costs money, so Claude Code never runs one on its own. The **run gate** — a hook that
watches every `orkeon run`, `orkeon-harness-run`, `./run.sh` and `orkeon-bench run` — classifies each run:

| The run | Gate |
|---|---|
| `--validate`, the simulated model, a model on a local host (`localhost`, `host.docker.internal`, a host listed in `HARNESS_LOCAL_LLM_HOSTS`) | passes |
| anything that would reach a remote host — including a configuration without a base URL, where Orkeon picks a hosted provider itself | refused, unless the team's open attempt holds an approval |

The gate reads what Orkeon reads for the run: the `ORKEON_Llm__*` variables, then the team's
`settings/<slug>/appsettings.json` when its launcher passes it (else an `appsettings.json` in the crew
folder or in an `appsettings/` folder above it, else `~/.config/Orkeon/appsettings.json`), then the
`Llm__*` variables without a prefix. It judges the default model **and every named profile**: one remote
profile makes the run remote, even beside a local default, since any agent may name it. Always give a base
URL, to the default and to each profile: Orkeon has no provider setting — it refuses to start on an
`Llm:Provider` key — and without a base URL it picks a hosted provider.

The approval is a small file in the open attempt (`workbooks/<slug>/attempts/ATT-n/remote-approval.json`:
who approved, when, the estimate, the cap). The method records it only after stating the estimate and the
cap to you: you approve by typing `/team-approve remote <usd>` (D36), and a hook has `orkeon-bench` write
the file from that line, refusing an amount above the cap. Claude never writes it. Every run is logged in
`.claude/run-log.tsv`. Commands you type yourself with `!` in Claude Code are not checked.

`orkeon-bench profile <team> <profile>` tells, before anything runs, whether a profile is remote.

Next: [Docker modes and SonarQube](./docker-modes.md).
