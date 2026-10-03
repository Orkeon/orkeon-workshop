# LLM providers and profiles

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: at that commit: `src/core/Orkeon.Infrastructure/LLMs/` (`LlmProviderFactory.cs`, `MeteredLlmProvider.cs`,
> `OllamaLlmProvider.cs`, `Base/HttpLlmProviderBase.cs`), `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs`,
> `src/core/Orkeon.Infrastructure/Configuration/RateLimitingOptions.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs` (`RegisterLlmProvider`), `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs`, `src/core/Orkeon.Infrastructure/Security/LlmRateLimiter.cs`,
> `src/constants/Orkeon.Constants.Llm/`
> (`LlmProviderKeys`, `LlmProviderEndpoints`, `LlmProviderDefaultModels`), `src/apps/Orkeon.Studio.Core/Profiles/ModelProfile.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/RunEvents.cs`, `src/tools/Orkeon.Tools.Email/Constants/EmailDefaults.cs`,
> `docs/reference/configuration.md`, `docs/reference/llm-providers-comparison.md`, `docs/guides/local-models.md`,
> `docs/architecture/run-event-bus.md`, `docs/architecture/studio.md`; image: `init-orkeon.sh`, `init-firewall.sh`, the
> Dockerfile's `OLLAMA_*` variables; harness: the bench README (`/usr/local/share/orkeon-bench/README.md` in the container,
> `.devcontainer/bench/README.md` in the harness repository), `.claude/harness/FROZEN-LITERALS.md` § 3,
> `.claude/harness/VERIFICATIONS.md` (V-04), plan § 6.3–6.5.
> Binary checks (stub on 127.0.0.1): `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`), 2026-10-02.

"LLM" here is the model the **team under test** calls, configured in Orkeon's settings — never the model
of Claude Code. The provider, the model and the key are never written in a crew (`orkeon-reference.md`
§ 7): they come from the settings layers described in `cli.md` § 5.

## 1. The providers

Sixteen provider keys (`LlmProviderKeys`; aliases in brackets), unchanged since 1.0.0-rc.4. The endpoint
is the provider's default `BaseUrl` (`LlmProviderEndpoints`) and therefore the host the firewall must
allow (§ 6). The preset model is what `orkeon llm probe` defaults to (and `orkeon init`, whose presets are
`ollama`, `openai` and Docker Model Runner); under `orkeon run` an absent `Llm:Model` is `gpt-5.6-sol`
whatever the provider (`RunnerHost.RegisterLlmProvider`) — always set the model.

| Key | Default endpoint | Preset model | Inferred from (§ 2) |
|---|---|---|---|
| `openai` | `https://api.openai.com/v1` | `gpt-5.6-sol` | URL holding `openai`; model `gpt…`; the final default |
| `anthropic` | `https://api.anthropic.com` | `claude-sonnet-5` | URL holding `anthropic`; model `claude…` |
| `ollama` | `http://localhost:11434` | `llama3.2` | URL holding `localhost` or `11434`; model `llama…`, `codellama…`, `mistral`, `mistral:<tag>` |
| `azure-openai` (`azure`) | the deployment's URL | none | URL holding `azure` or `.cognitiveservices.` |
| `mistral` | `https://api.mistral.ai/v1` | `mistral-medium-2604` | `mistral.ai`; model `mistral-…`, `ministral…` |
| `deepseek` | `https://api.deepseek.com` | `deepseek-flash` | `deepseek.com` (its `/anthropic` path is refused); model `deepseek…` |
| `kimi` (`moonshot`) | `https://api.moonshot.ai/v1` | `kimi-k2.6` | `moonshot.ai`, `moonshot.cn`; model `moonshot…` |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.7-plus` | `dashscope.aliyuncs.com`, `dashscope-intl.aliyuncs.com`, `maas.aliyuncs.com`; model `qwen…` |
| `together` (`togetherai`) | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | `together.xyz` |
| `huggingface` (`hf`) | `https://router.huggingface.co/v1` | `meta-llama/Llama-3.1-8B-Instruct` | `huggingface.co`, `hf.co`; key `hf_…` |
| `zai` (`glm`, `zhipu`) | `https://api.z.ai/api/paas/v4` | `glm-5.2` | `api.z.ai`, `bigmodel.cn`; model `glm…` |
| `gemini` (`google`) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.7-flash` | that host; model `gemini…` |
| `grok` (`xai`) | `https://api.x.ai/v1` | `grok-4.6` | `api.x.ai`; model `grok…`; key `xai-…` |
| `minimax` | `https://api.minimax.io/v1` | `MiniMax-M2` | `api.minimax.io`, `api.minimaxi.com`; model `minimax…` |
| `openrouter` | `https://openrouter.ai/api/v1` | `google/gemini-3.7-flash` | `openrouter.ai`; model `openrouter/…` |
| `mammouth` | `https://api.mammouth.ai/v1` | `gemini-3.7-flash` | `mammouth.ai` only |

Docker Model Runner (`/engines/` in the URL, `model-runner.docker.internal`) is driven through the `openai`
dialect. Capabilities per provider (tool calling, `response_format`, `thinking`, vision, prompt cache) are
in `docs/reference/llm-providers-comparison.md`; an option a provider cannot honour gives a warning, not
an error.

## 2. How a run picks its provider

`orkeon run` reads **no `Provider` key**: `LlmConfig` has no such field and `RunnerHost` never reads
`Llm:Provider` (Studio's `LlmProviderDetector`: "An appsettings.json has no `Llm:Provider` key — the endpoint
decides"). `LlmProviderFactory.InferProviderType` decides, in this order:

1. **`Llm:BaseUrl`**, lower-cased, matched as a substring: the known hosts of § 1 first, then any URL
   holding `openai` → `openai`, `anthropic` → `anthropic`, `localhost` or `11434` → `ollama`;
2. **the model name** prefixes of § 1;
3. **the key** prefix (`hf_`, `xai-`);
4. otherwise `openai`.

Consequences to design for:

- `http://localhost:<any port>` and any URL holding `11434` speak the **Ollama** dialect (`/api/chat`,
  `/api/generate`) — unless the URL matches a host of § 1 or holds `openai` or `anthropic`, which are tested
  first (Docker Model Runner's `/engines/` URL is OpenAI). An OpenAI-compatible server on the machine must be
  reached as `http://127.0.0.1:<port ≠ 11434>/v1` **with a model name that matches no prefix of § 1**: such a
  URL matches no host rule, so the model name decides next — `llama3.1` would speak the Ollama dialect,
  `qwen2.5` the Qwen one. That is how the stub is selected: `stub-model` matches nothing (V-04, § 8).
- Keep `BaseUrl` explicit in every settings file and profile: without it `qwen3:8b` goes to the Qwen cloud,
  `claude-…` to Anthropic, an unknown name to OpenAI.
- No `Llm` section at all: the **echo** provider (`<undefined-llm>`) replays the prompt instead of
  answering, with the warning ``No `Llm` section configured — falling back to the echo provider``.
  `--validate` passes; a run produces nothing useful.
- `orkeon run crew --validate -v 1` prints `LLM resolved: model=… baseUrl=… temperature=… timeoutSeconds=…`
  (never the key, never the provider). The provider a run really used is the `provider` field of
  `cost.updated` under `--events` — the provider's name: `OpenAI` for the `openai` provider (the stub
  included), `deepseek`, `kimi`, `ollama`, `anthropic`… (`cli.md` § 3.3). The `provider` of the `--llm-log`
  records is only guessed from the request's host — `localhost` or `127.0.0.1` read `ollama`, the stub's
  exchanges included, and an unknown host gives its name (`cli.md` § 4): never read the dialect from it.

## 3. The `Llm` section and its variables

The section is `Llm` at the root of the settings file (`ConfigurationKeys.LlmSection = "Llm"`). Each key is
also an environment variable `ORKEON_Llm__<Key>` (layer 4 of `cli.md` § 5, above every file).

| Key | Variable | Default | Notes |
|---|---|---|---|
| `Model` | `ORKEON_Llm__Model` | `gpt-5.6-sol` | the model id the provider serves |
| `BaseUrl` | `ORKEON_Llm__BaseUrl` | the provider's endpoint | decides the provider (§ 2) |
| `ApiKey` | `ORKEON_Llm__ApiKey` | none | **only** as a variable; never in a file of the workshop |
| `Temperature` | `ORKEON_Llm__Temperature` | `0.7` | per task: `llmOverride.temperature` (below) |
| `MaxTokens` | `ORKEON_Llm__MaxTokens` | the model's documented maximum (`LlmModelOutputLimits`), 4096 for a model the catalogue does not know | a cap on the **answer**, not the context; Ollama gets `num_predict` only when it is set |
| `TimeoutSeconds` | `ORKEON_Llm__TimeoutSeconds` | `30` | per HTTP call; 600 for a model that thinks before it answers |
| `MaxRetries` | `ORKEON_Llm__MaxRetries` | `10` | transient failures (5xx, 408, 429, network), exponential backoff, `Retry-After` honoured |
| `Thinking:Enabled`, `Thinking:Effort` | `ORKEON_Llm__Thinking__Enabled`, `…__Effort` | provider default | per task: `llmOverride.thinking` |

**One key only.** A run reads `Llm:ApiKey`, overridden by `ORKEON_Llm__ApiKey`; the vendor names
(`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`…) are Studio's convention for a profile, never read by the engine,
and `ORKEON_LLM_API_KEY` is the default of `orkeon llm probe -k` and `orkeon llm models -k` only
(`docs/reference/llm-providers-comparison.md`, "API keys"). A call that reaches `TimeoutSeconds` is retried **once** (`ResilienceDefaults.LlmTimeoutRetries`),
then fails its task with a message naming the setting — never an empty answer. Throttling lives in the
`RateLimiting` section: `MaxConcurrentRequests` (default 0 = unlimited), `QueueLimit` (5),
`GlobalRequestsPerMinute` (60), `ProviderRequestsPerMinute` (30), `AgentRequestsPerMinute` (20, one limiter
per agent role). An agent's `maxRpm` is stored and read by no limiter (`LlmRateLimiter`).

**Per task, not per agent.** Under `orkeon run` the agent's `llm:` block — the crew-level `llm:` merged into
it, and a script agent's `.llm(…)` alike — is not applied: `CrewFactory.CreateAgentsAsync` never gives the
agent its LLM settings. The task's `llmOverride` is (`ChatOptionsComposer.ApplyTaskLlmOverrides`):
`temperature`, `maxTokens`, `topP`, `thinking`, `responseFormat`, `responseSchema`. Checked with the stub:
an agent with `llm.temperature: 0.11` and `maxTokens: 123` sent `temperature` 0.7 and
`max_completion_tokens` 4096 (the settings' temperature, and the engine's answer budget for a model its
catalogue does not know), a `.ork.ts` agent with
`.llm(llm.openai({ temperature: 0.33 }))` sent 0.7, a task with `llmOverride: { temperature: 0.22,
maxTokens: 456 }` sent 0.22 and 456. The same holds for `guardrails:`: an agent's rules never reached the
prompt, a task's did. `yaml-schema.md` lists the keys.

## 4. Studio model profiles

Orkeon Studio (Windows) keeps named profiles in `studio-model-profiles.json`, next to the machine settings
file (`%APPDATA%\Orkeon\`): provider, model, URL, temperature, answer budget, timeout, thinking switch and
effort, and **the name** of the user environment variable holding the key (`KeyEnvName`). The profile
elected as default is copied into the file's `Llm` section, so a terminal `orkeon run` follows it. A team
whose card names another `profile` (`studio-team.json`) is launched with that profile laid over the run as
`ORKEON_Llm__Model`, `__BaseUrl`, `__Temperature`, `__TimeoutSeconds`, `__MaxTokens`,
`__Thinking__Enabled`, `__Thinking__Effort` and `ORKEON_Llm__ApiKey` (the value read from `KeyEnvName`) —
never a `Provider`. Studio pre-fills 600 s for providers whose default model reasons (Kimi, DeepSeek,
Z.AI, MiniMax), and can display what is left on a DeepSeek, Kimi or OpenRouter account; nothing of that
reaches a run. The container cannot see these profiles: a named bench profile (§ 8) is their equivalent
in the workshop. Write `profile` in a card only when the user names one (`studio-layout.md`).

## 5. Local models: Ollama as the image configures it

At first start, when `~/.config/Orkeon/appsettings.json` does not exist, `init-orkeon.sh` runs
`orkeon init --provider ollama --model qwen3:8b --no-probe`, then adds the timeout and the throttle:

```json
{
  "Llm": { "Model": "qwen3:8b", "BaseUrl": "http://localhost:11434", "TimeoutSeconds": 600 },
  "RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 }
}
```

`OLLAMA_DEFAULT_MODEL` (default `qwen3:8b`) names the model; `OLLAMA_MODE=local` runs the server in the
container, `host` forwards `127.0.0.1:11434` to the host's Ollama — Orkeon sees `localhost:11434` either
way — and `off` starts nothing and writes no new settings file. `init-orkeon.sh --status` shows the server, the
models and where the loaded one runs (GPU or CPU); `ollama ps` too. What follows from this configuration:

- **Context: 8192 tokens, decided by the server.** `OLLAMA_CONTEXT_LENGTH=8192` in the image; Orkeon sends
  Ollama only `temperature` and, when pinned, `num_predict` — never `num_ctx`. A prompt larger than the
  window is truncated by Ollama without an error. The window holds the system prompt (role, goal,
  backstory, guardrails), the schemas of the agent's tools, the task with its "Previous task results" (capped
  at 8000 characters in all, `AgentPromptComposer`), and the last 40 messages of the loop, each tool result
  cut at 4000 characters — **32 000 for `file_read`** (`AgentDefaults`), about the whole window on its own.
  Keep tasks short, tools per agent few, reads bounded (`file_read` `max_length`, `csv_reader` `max_rows`).
- **Thinking.** `qwen3` reasons before answering, which multiplies the generated tokens — hence 600 s per
  call. To turn it off: `"Thinking": { "Enabled": false }` in `Llm`, `ORKEON_Llm__Thinking__Enabled=false` for
  one run, or `thinking: { enabled: false }` under a task's `llmOverride:` (an agent's `llm:` is not applied,
  § 3). Leave `Effort` unset then: the Ollama provider sends an effort as `think: "<effort>"`, which wins over
  `Enabled: false`.
- **Slow calls fail slowly.** A call stuck past 600 s is retried once: up to 20 minutes before the task
  fails. Size `maxIter` and the number of tasks with that in mind (`design/sizing-and-cost.md`).
- **One request at a time.** `parallel` and `consensual` modes bring no speed locally: their calls wait
  in a queue bounded by `QueueLimit` (32). Without the limit, concurrent calls saturate the GPU and slow
  every one of them; with it and the default queue (5), the calls beyond the queue are refused. The rule: a
  local model runs with a limit — 1 unless set otherwise. The image writes both at first start;
  `init-orkeon.sh` sets the limit to 1 at each start, whatever `OLLAMA_MODE`, in the machine file when its
  base URL is on the machine or the Docker host and it has none (absent, 0 or below, which Orkeon reads as unlimited), adds
  `QueueLimit: 32` beside a limit of 1 when absent, and keeps a limit of 1 or more set by hand;
  `orkeon-bench doctor` fails when there is no limit; a team settings file (`settings/<slug>/appsettings.json`,
  D33) must carry one too — it replaces the machine file, and `check_crew.py` / `check_team.py` refuse it
  otherwise.
- **Noise.** A local 8B model varies from run to run: repeat scenarios (`pass@k` in `bench.config.json`)
  and write local thresholds apart from remote ones (`testing/local-vs-remote.md`).
- **Tokens are measured**: Ollama's `prompt_eval_count` and `eval_count` feed the meter.

Another local model is a named bench profile on `http://localhost:11434` with that model, once pulled.
Pulling through the firewall needs the registry hosts listed in the image documentation
(`docs/reference/configuration.md` of the harness repository).

## 6. Remote providers

- **Firewall.** `init-firewall.sh` — started by the workshop's VS Code configuration, by hand after a
  `docker run` — allows `api.anthropic.com` among a few development hosts. Any other provider needs its host
  in `FIREWALL_EXTRA_DOMAINS` (spaces or commas) on the container, then a rerun of the script. Names are
  resolved to addresses once, at that moment; every port of an allowed address is open.

| Provider | Hosts to add |
|---|---|
| `openai` | `api.openai.com` |
| `anthropic` | none (allowed) |
| `azure-openai` | the deployment host (`<resource>.openai.azure.com`) |
| `mistral`, `deepseek`, `together` | `api.mistral.ai`, `api.deepseek.com`, `api.together.xyz` |
| `kimi`, `minimax` | `api.moonshot.ai` (China `api.moonshot.cn`), `api.minimax.io` (China `api.minimaxi.com`) |
| `qwen` | `dashscope.aliyuncs.com` (international `dashscope-intl.aliyuncs.com`) |
| `huggingface`, `zai`, `gemini`, `grok` | `router.huggingface.co`, `api.z.ai`, `generativelanguage.googleapis.com`, `api.x.ai` |
| `openrouter`, `mammouth` | `openrouter.ai`, `api.mammouth.ai` |
| tools, not models | `web_search`: `api.tavily.com`; `brave_search`: `api.search.brave.com`; e-mail, Gmail: `imap.gmail.com` or `pop.gmail.com`, `smtp.gmail.com`, and for OAuth `accounts.google.com`, `oauth2.googleapis.com`; Outlook (Graph): `graph.microsoft.com`, `login.microsoftonline.com` (`EmailDefaults`) |

A `BaseUrl` naming another host needs that host instead.

- **Keys** live in environment variables only: `ORKEON_Llm__ApiKey` for the machine profile, the variable
  named by `keyEnv` for a bench profile. The `secret-guard` hook refuses a key pattern written in the
  workshop's folders.
- **Approval.** A remote run is paid: estimate, cap and the user's explicit yes, recorded in the open
  attempt, before it starts (`HARNESS.md`, rule 1) — once D36's hook lands (lot 2), the user's
  `/team-approve remote <usd>` records it; until then the marker is written from the shell in the open
  attempt, quoting the user's yes, never on Claude's own initiative. `orkeon llm probe` against a remote provider is paid
  too and is not watched by the run gate (`cli.md` § 6).
- **Do not overwrite the machine file for a trial.** `orkeon init --force` replaces it entirely (timeout and
  throttle included). Keep Ollama there and put each remote target in a named profile.

## 7. Tokens and cost

| Where | What |
|---|---|
| `cost.updated` events | the run's cumulative `tokens`, `promptTokens`, `completionTokens`, cache pair, `estimatedTokens`; `model`, `provider`, `operation` of the call; `cost`, `currency`, `costSource` when the vendor billed (`cli.md` § 3.2) |
| `task.completed` | `tokens` and `toolCalls` of the task |
| `run.finished` | the same totals as the last `cost.updated` |
| plain stdout | `Tokens used: N`, or `(not measured)` |
| `AUTO_SUMMARY.md` | per task: total tokens · cache hit/miss (`/output`-prefixed writable root only) |

Under `--events` every generation call is metered — manager, planner, retries, RAG and memory calls,
judges included (`MeteredLlmProvider`); embedding calls are not. A call whose provider counted nothing is
**estimated** and shows under `estimatedTokens` (per the sources). The OpenAI dialect, however, requires
`usage.total_tokens` in every answer: without it the call fails with `The given key was not present in the
dictionary.` and the task with it (`OpenAICompatibleProviderBase`; seen with the stub on the rc.4 and main
binaries) — a stub always answers with `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`).
**Price**: only what the vendor bills in its answer
reaches the wire — OpenRouter's `usage.cost`, relayed with `costSource: "vendor"`; Orkeon never puts an
estimated price there. The `session_cost` tool still reports zeros under `orkeon run` (its cost manager is
fed by the REPL only). The harness therefore computes cost as tokens × the provider's rate written in
`TEST-PLAN.md`, and uses the vendor's `cost` when there is one; the estimate before an L4 run multiplies
the tokens measured at L3 (plan § 6.4; `orkeon-bench estimate` is planned, lot 9).

## 8. The harness side: bench profiles

`tests/<slug>/bench.config.json` names the targets of a team (template `.claude/templates/bench.config.json`,
plan § 6.5). The bench README is the reference for the file, the variables each profile injects and the
remote rule; in short:

| Profile | What the run gets |
|---|---|
| `machine` (`{ "source": "orkeon-settings" }`) | nothing injected: the settings layers as they are (`cli.md` § 5) |
| `stub` (implicit, cannot be declared) | `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1` (never 11434), `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub`: the `openai` dialect, real tool calls (V-04); the server `orkeon-bench llm-stub` is planned (lot 4) |
| named | `baseUrl`, `model`, `keyEnv` (required, the variable's **name**), `timeoutSeconds` (default 600) → `ORKEON_Llm__BaseUrl`, `__Model`, `__TimeoutSeconds`, `__ApiKey` |

A named profile overrides those four keys only: the other keys of the run's settings file — the team's
`settings/<slug>/appsettings.json` when it exists (D33), else the machine file — (`Thinking`, `Temperature`,
`MaxTokens`, `RateLimiting`) still apply to it. `orkeon-bench profile <team> <name> [--json]` prints the
variables (names only, secrets redacted) and whether the target is remote (`remote`, `base_url_host`,
`remote_reason`) before anything runs.

**The remote rule** (bench `llm-target.ts` and `orkeon-configuration.ts`, mirrored by the `run-gate`
hook): a base URL decides alone — remote unless its host is local (`localhost`, `127.0.0.0/8`, `::1`,
`0.0.0.0`, `host.docker.internal`, or `HARNESS_LOCAL_LLM_HOSTS`); without one, an `Llm` section means
remote (`no-base-url`: § 2 routes it by the model name, then the key, OpenAI by default); no `Llm`
section at all is the echo provider, local. For `machine` both read the layers of `cli.md` § 5 in
Orkeon's order: `ORKEON_Llm__*` variables, the settings file of the run (the team's
`settings/<slug>/appsettings.json` when it exists, which the launchers pass with `--settings` — D33 — else
`crew/appsettings.json`, an `appsettings/` (or `_shared/`) folder up the tree, the user's file), unprefixed `Llm__*`
variables, `appsettings[.<environment>].json` of the working directory (the team folder for a
launcher), `DOTNET_Llm__*` variables. A configuration without base URL is therefore refused without an
approval even when its model would stay on Ollama (`llama…`): always give the base URL.

## 9. Checks

```bash
orkeon run crew --validate -v 1 2>&1 | grep 'LLM resolved'   # model, base URL, temperature, timeout of the next run
init-orkeon.sh --status                                       # Ollama: server, models, GPU or CPU, context
orkeon llm models -p ollama                                   # what the local server serves (free)
orkeon-bench profile <slug> <name> --json                     # variables and remote verdict of a profile
```
