# LLM providers and profiles

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: at that commit: `src/core/Orkeon.Infrastructure/LLMs/` (`LlmProviderFactory.cs`, `MeteredLlmProvider.cs`,
> `RateLimitedLlmProvider.cs`, `OllamaLlmProvider.cs`, `Base/HttpLlmProviderBase.cs`, `Profiles/LlmSettings.cs`,
> `Profiles/LlmProfileRegistry.cs`),
> `src/core/Orkeon.Infrastructure/DependencyInjection/LlmProviderRegistrationExtensions.cs`,
> `src/core/Orkeon.Infrastructure/Resilience/ResiliencePolicies.cs`,
> `src/core/Orkeon.Application/Configuration/RateLimitingOptions.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Domain/Constants/Llm/LlmDefaults.cs`, `src/core/Orkeon.Domain/SharedKernel/ValueObjects/LlmConfig.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs` (`RegisterLlmProvider`, `ElectLlmProfile`, `WarnIfLlmNotConfigured`),
> `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`, `Configuration/Yaml/YamlConfigModels.cs` and `YamlCrewMapper.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs`, `LlmCallGate.cs` and `RequestRates.cs`, `src/core/Orkeon.Infrastructure/Security/LlmRateLimiter.cs`,
> `src/constants/Orkeon.Constants.Llm/`
> (`LlmProviderKeys`, `LlmProviderEndpoints`, `LlmProviderDefaultModels`, `LlmProfileNames`), `src/constants/Orkeon.Constants.Configuration/ConfigurationKeys.cs`,
> `src/scripting/Orkeon.Scripting/Typings/llm.d.ts` and `task.d.ts`, `src/apps/Orkeon.Studio.Core/Profiles/` (`ModelProfile.cs`, `HostLlmProfiles.cs`),
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/RunEvents.cs`, `src/tools/Orkeon.Tools.Email/Constants/EmailDefaults.cs`,
> `docs/reference/configuration.md` ("The API key", "Named profiles"), `docs/reference/llm-providers-comparison.md`, `docs/guides/local-models.md`,
> `docs/architecture/run-event-bus.md`, `docs/architecture/studio.md`; image: `init-orkeon.sh`, `init-firewall.sh`, the
> Dockerfile's `OLLAMA_*` variables; harness: the bench README (`/usr/local/share/orkeon-bench/README.md` in the container,
> `.devcontainer/bench/README.md` in the harness repository), `.claude/harness/FROZEN-LITERALS.md` § 3,
> `.claude/harness/VERIFICATIONS.md` (V-04, V-13, V-14), plan § 6.3–6.5.
> Binary checks (stub on 127.0.0.1) were made on `orkeon-workshop:main-probe` (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`),
> 2026-10-02; what changed since is read in the sources — marked "per the sources" — except what
> `VERIFICATIONS.md` marks fb26364 (V-13: settings judged at start; V-14: the agent's `llm:` block, `maxRpm`).

"LLM" here is the model the **team under test** calls, configured in Orkeon's settings — never the model
of Claude Code. The provider, the endpoint and the key are never written in a crew (`orkeon-reference.md`
§ 7): they come from the settings layers described in `cli.md` § 5. A crew can only name a **profile**
those settings define, and a model (§ 3) — which is enough to send its calls to another provider.

## 1. The providers

Sixteen provider keys (`LlmProviderKeys`; aliases in brackets), unchanged since 1.0.0-rc.4. The endpoint
is the provider's default `BaseUrl` (`LlmProviderEndpoints`) and therefore the host the firewall must
allow (§ 6). The preset model is each provider's `DefaultModel` (`HttpLlmProviderBase.ResolveModel`): what
a run sends when neither the call, the crew nor the section or profile names a model, what `orkeon llm
probe` defaults to, and what `orkeon init` writes for its presets (`ollama`, `openai`, Docker Model Runner).
Azure, which has none, takes the deployment it is configured with, else `gpt-5.6-sol`. Always set the
model: a preset is a vendor's moving default.

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

`orkeon run` reads **no `Provider` key** — and refuses one: `LlmConfig` has no such field, and
`Llm:Provider`, in a settings file or as `ORKEON_Llm__Provider` / `Llm__Provider`, stops the start (`ERROR:
Llm:Provider is not a setting: Llm carries Profiles, AvailableModels, BaseUrl, ApiKey, …`; a profile's
likewise — § 3) (Studio's `LlmProviderDetector`: "An appsettings.json has no `Llm:Provider` key — the endpoint
decides"). `LlmProviderFactory.InferProviderType` decides, in this order — for the `Llm` section and
for each profile of `Llm:Profiles` alike (§ 3):

1. **`BaseUrl`**, lower-cased, matched as a substring: the known hosts of § 1 first, then any URL
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
- No default provider: the **echo** provider (`<undefined-llm>`) replays the prompt instead of
  answering, with the warning ``No `Llm` section configured — falling back to the echo provider``. That is
  an `Llm` section with no non-blank value outside `Profiles` (`LlmSettings.HasDefault`): absent, empty,
  `null`, holding `Profiles` alone, or every value blank. `--validate` passes; a run produces nothing useful.
- `orkeon run crew --validate -v 1` prints `LLM resolved: model=… baseUrl=… temperature=… timeoutSeconds=…
  apiKey=…` — `(default)`, `(provider default)`, `(not set: the model's own)`, `(default 30)` for what is
  unset, and for the key where it comes from (`from configuration (Llm:ApiKey)`, `from the variable named by
  Llm:ApiKeyEnvVar (process environment)`, `none`), never the key nor the provider; then one
  `LLM profile <id>: apiKey=…` line per profile and `LLM profiles offered to crews besides the default: …`. The provider a run really used is the `provider` field of
  `cost.updated` under `--events` — the provider's name: `OpenAI` for the `openai` provider (the stub
  included), `deepseek`, `kimi`, `ollama`, `anthropic`… (`cli.md` § 3.3). The `provider` of the `--llm-log`
  records is only guessed from the request's host — `localhost` or `127.0.0.1` read `ollama`, the stub's
  exchanges included, and an unknown host gives its name (`cli.md` § 4): never read the dialect from it.

## 3. The `Llm` section, its profiles and its variables

The section is `Llm` at the root of the settings file (`ConfigurationKeys.LlmSection = "Llm"`): the
**default profile**. Each key is also an environment variable `ORKEON_Llm__<Key>` (layer 2 of `cli.md` § 5,
above the file) and, lower than the file, `Llm__<Key>`. A blank value reads as absent, for every key.

| Key | Variable | Default | Notes |
|---|---|---|---|
| `Model` | `ORKEON_Llm__Model` | the provider's preset (§ 1) | the model id the provider serves |
| `BaseUrl` | `ORKEON_Llm__BaseUrl` | the provider's endpoint | decides the provider (§ 2); an address that is not absolute refuses the start |
| `ApiKey` | `ORKEON_Llm__ApiKey` | none | **only** as a variable; never in a file of the workshop; a `${NAME}` value refuses the start |
| `ApiKeyEnvVar` | `ORKEON_Llm__ApiKeyEnvVar` | none | the **name** of the variable holding the key, read when no `ApiKey` resolves (below) |
| `Temperature` | `ORKEON_Llm__Temperature` | none sent: the model's own | also an agent's `llm.temperature`, a task's `llmOverride.temperature` (below) |
| `MaxTokens` | `ORKEON_Llm__MaxTokens` | the model's documented maximum (`LlmModelOutputLimits`), 4096 for a model the catalogue does not know | a cap on the **answer**, not the context; Ollama gets `num_predict` only when it is set |
| `TimeoutSeconds` | `ORKEON_Llm__TimeoutSeconds` | `30` (`LlmDefaults.DefaultTimeoutSeconds`) | per HTTP call, headers and body, streamed or not (since ce9ec1f, LLM-12); 600 for a model that thinks before it answers |
| `StreamIdleSeconds` | `ORKEON_Llm__StreamIdleSeconds` | unset: nothing bounds the silence | since ce9ec1f (LLM-12): the longest silence between two chunks of a streamed answer; elapsed, the call fails naming the setting (`error_type` `StreamIdleTimeout`), never an empty answer. The image writes **120** in the machine file for the local model (D46); a model that thinks before it writes, or a long prompt on a slow machine, may stay silent longer: raise it, or turn thinking off |
| `MaxRetries` | `ORKEON_Llm__MaxRetries` | `10` | transient failures (5xx, 408, 429, network), exponential backoff, `Retry-After` honoured |
| `Thinking:Enabled`, `Thinking:Effort` | `ORKEON_Llm__Thinking__Enabled`, `…__Effort` | provider default | also per agent and per task: `thinking` |
| `Grammar` | `ORKEON_Llm__Grammar` | `false` | `true` only for a llama.cpp-compatible server (GBNF `grammar` of a `structured_output` deliverable) |
| `Profiles:<id>:…` | `ORKEON_Llm__Profiles__<id>__<Key>` | none | named profiles, each with every key above (below) |

These keys, and `AvailableModels`, are the whole section (thirteen at ce9ec1f, `LlmSettingsShape`): the host judges it at its start (`cli.md` § 5), the
default as strictly as a profile. Another key — in the file or as a variable of any layer — refuses the
start, and so does a value it cannot read: a `TimeoutSeconds` written `"600s"`, a `Thinking:Enabled` or a
`Grammar` that is not `true` or `false`, a `Temperature` that is no finite number. The refusal of a key ends
on `` `orkeon settings Llm` lists its keys `` (bd3420c): that verb prints the table above from the binary,
offline — each key with its type, its default and its meaning, `Profiles:<name>:…` included (`cli.md` § 1).

**The key** (`LlmSettings.ResolveApiKey`), for the section and for each profile: an `ApiKey` the
configuration resolves — the file, `ORKEON_Llm__ApiKey` (`ORKEON_Llm__Profiles__<id>__ApiKey` for a profile),
`Llm__ApiKey` —, else the variable `ApiKeyEnvVar` names, read in the process environment (on Windows, then in
the user's persistent scope), never copied into the process, else none: every call then answers that an API
key is required. The reference may name **any** variable, a vendor's (`ANTHROPIC_API_KEY`,
`DEEPSEEK_API_KEY`), the harness's, or Claude Code's own; one that cannot be a name (`=`, a space, a line
break) refuses the start, by its path. A reference set nowhere is a `WARNING:` per section at startup and an
`orkeon doctor` row (`cli.md` § 1). `ORKEON_LLM_API_KEY` is the default of `orkeon llm probe -k` and
`orkeon llm models -k` (`docs/reference/llm-providers-comparison.md`, "API keys"); a run reads it only when a
settings file names it in `ApiKeyEnvVar`. A call that reaches `TimeoutSeconds` is retried **once**
(`ResilienceDefaults.LlmTimeoutRetries`), then fails its task with a message naming the setting — never an
empty answer. Throttling lives in the `RateLimiting` section, one limiter for the whole run, every profile
included: `MaxConcurrentRequests` (default 0 = unlimited; one gate across all providers), `QueueLimit` (5),
`GlobalRequestsPerMinute` (60), `ProviderRequestsPerMinute` (30, one limiter per provider name) — every
model call takes one lease at its provider's entrance (`RateLimitedLlmProvider`): agent turns, the manager,
the planner, RAG, the judges, the memory analyses, a script's `ctx.llm`; a lease refused past the queue is
retried five times, then the call fails. `AgentRequestsPerMinute` (20) is no part of that limiter: it bounds
each agent instance's own window together with the agent's `maxRpm`, the stricter winning, and a request
over it waits its turn (`RequestRates`; `design/sizing-and-cost.md` § 1).

**Named profiles** (`Llm:Profiles:<id>`, `LlmSettings.ReadProfiles`). Each is a provider of the section's
shape, inferred like the section (§ 2), built at its first use, metered like the default, with its own key.
They come from every layer — the settings file, `ORKEON_Llm__Profiles__<id>__*`, `Llm__Profiles__<id>__*` —
merged key by key: a variable alone can create a profile. `default` is reserved (it names the section); an
invalid `BaseUrl` or a value that is not a number refuses the start with the key. A **crew names a profile,
never an endpoint or a key**: in YAML `llm: { profile: <id> }` on the crew (merged into each agent), on an
agent, or `llmOverride: { profile: <id> }` on a task; in `.ork.ts` `.llm(llm.profile("<id>", { model,
temperature, maxTokens, responseFormat }))` on an agent and `.withProfile("<id>")` on a task. A name the
host does not offer fails the load, listing the known ones. Who runs where: an agent's turns on its profile,
or its task's for that task; the hierarchical manager on its manager agent's `llm:` (profile and model),
else the default; the RAG subsystem on `Orkeon:Rag:LlmProfile` (unset: the default); the planner, the
Guardian, the judges and the memory analyses on the default. `orkeon run --llm-profile <id>` makes one
profile the run's default, **whole**: every key the section sets is unset, the profile's are laid over it,
so its key is its own (`cli.md` § 2). A section holding `Profiles` alone configures no default (echo, § 2).
**Consequence for the workshop**: a settings file whose `Llm` points at Ollama but defines a remote
profile lets any agent, task or manager that names it — or `Orkeon:Rag:LlmProfile`, or `--llm-profile` —
make paid calls, with the key its `ApiKeyEnvVar` finds in the environment (§ 8).

**Per agent and per task.** Under `orkeon run` the agent's `llm:` block — the crew-level `llm:` merged
into it, and a script agent's `.llm(…)` alike — is applied (`CrewFactory.CreateAgentsAsync` →
`WithLlmConfig`): `profile`, `model` (unset: the profile's own), `temperature`, `maxTokens`, `topP`,
`thinking`, `responseFormat`, `responseSchema`, `cache`. The task's `llmOverride` is laid over it for that
task (`ChatOptionsComposer.ApplyAgentLlmOverrides`, then `ApplyTaskLlmOverrides`): `profile`, `temperature`,
`maxTokens`, `topP`, `thinking`, `responseFormat`, `responseSchema`. What none of them sets comes from the
profile; a temperature or a `top_p` nothing sets is not sent. `.ork.ts` has no vendor factory any more
(`llm.openai()`…): `llm.default_`, `llm.model(name, overrides?)` and `llm.profile(name, overrides?)` only. An
agent's `guardrails:` reach the prompt too, rendered before its task's (`GuardrailsPromptRenderer`). A stub
run on a build of fb26364 saw the agent's temperature and `maxTokens`, the task's override and both
guardrails in the requests (V-14: at 24ab0d0 the agent block and the agent guardrails were dropped).
`yaml-schema.md` lists the keys.

## 4. Studio model profiles

Orkeon Studio (Windows) keeps its model settings in `studio-model-profiles.json`, next to the machine
settings file (`%APPDATA%\Orkeon\`): provider, model, URL, temperature, answer budget, timeout, thinking
switch and effort, and **the name** of the user environment variable holding the key (`KeyEnvName`, the
provider's conventional name — `DEEPSEEK_API_KEY`, `ZAI_API_KEY`; `ORKEON_CUSTOM_LLM_API_KEY` for a new
"OpenAI-compatible" setting). Every setting that names a provider is also written into the machine file as
a host profile, `Llm:Profiles:<id>` (`HostLlmProfiles`; the id is the setting's name by the team folder
rule, « Z.AI » → `z-ai`), with `ApiKeyEnvVar` and never the key — so a crew can write `profile: z-ai`. The
setting elected as default is written into `Llm` whole, its `ApiKeyEnvVar` included, so a terminal
`orkeon run` or a scheduled team follows it with its key. Every launch from Studio lays every setting over
its child as `ORKEON_Llm__Profiles__<id>__*`, keys included; a team whose card names another `profile`
(`studio-team.json`) also gets that setting laid over `Llm` as `ORKEON_Llm__*` — every field it models,
value or blank, `ORKEON_Llm__ApiKeyEnvVar` included — never a `Provider`. A setting renamed in Studio
carries its teams (the cards' `profile` is rewritten, STUDIO-52); a card naming a setting absent from the
machine is said absent, and the default runs. A Docker Model Runner setting writes and lays the placeholder
`"ApiKey": "not-needed"`, as `orkeon init` does (STUDIO-54), and Studio refuses to save what a run refuses
— a `${NAME}` `ApiKey`, a profile named `default`, a temperature that is no finite number, a fraction where
an integer is read (STUDIO-55). A workshop team launched from Studio also gets its own settings file as
`--settings` (STUDIO-62, `studio-layout.md`): Studio's variables lie over that file. The launchers Studio
writes for a team it adopted carry the setting as `--llm-profile <id>`. Studio pre-fills 600 s for providers whose
default model reasons (Kimi, DeepSeek, Z.AI, MiniMax), and can display what is left on a DeepSeek, Kimi or
OpenRouter account; nothing of that reaches a run. The container cannot see these settings: a named bench
profile (§ 8) is their equivalent in the workshop. Write `profile` in a card only when the user names one
(`studio-layout.md`).

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
  Ollama only what something sets — `temperature`, `top_p`, `seed`, `stop`, and `num_predict` for a pinned
  cap; nothing set, the Modelfile's value applies — never `num_ctx`. A prompt larger than the
  window is truncated by Ollama without an error. The window holds the system prompt (role, goal,
  backstory, guardrails), the schemas of the agent's tools, the task with its "Previous task results" (capped
  at 8000 characters in all, `AgentPromptComposer`), and the last 40 messages of the loop, each tool result
  cut at 4000 characters — **32 000 for `file_read`** (`AgentDefaults`), about the whole window on its own.
  Keep tasks short, tools per agent few, reads bounded (`file_read` `max_length`, `csv_reader` `max_rows`).
- **Thinking.** `qwen3` reasons before answering, which multiplies the generated tokens — hence 600 s per
  call. To turn it off: `"Thinking": { "Enabled": false }` in `Llm`, `ORKEON_Llm__Thinking__Enabled=false` for
  one run, or `thinking: { enabled: false }` under an agent's `llm:` or a task's `llmOverride:` (§ 3). Leave `Effort` unset then: the Ollama provider sends an effort as `think: "<effort>"`, which wins over
  `Enabled: false`.
- **Slow calls fail slowly.** A call stuck past 600 s is retried once: up to 20 minutes before the task
  fails. Size `maxIter` and the number of tasks with that in mind (`design/sizing-and-cost.md`).
- **One request at a time.** `parallel` and `consensual` modes bring no speed locally: their calls wait
  in a queue bounded by `QueueLimit` (32). Without the limit, concurrent calls saturate the GPU and slow
  every one of them; with it and the default queue (5), the calls beyond the queue are refused — retried
  five times, then failed. The rule: a
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

Another local model is a named bench profile on `http://localhost:11434` with that model, once pulled —
or an Orkeon profile `Llm:Profiles:<id>` on that base URL, which a crew names (§ 3).
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
| `qwen` | `dashscope.aliyuncs.com`; an international key is served by `dashscope-intl.aliyuncs.com` only (Orkeon's provider comparison, 2026-10-07): set `Llm:BaseUrl` to `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` and allow that host instead |
| `huggingface`, `zai`, `gemini`, `grok` | `router.huggingface.co`, `api.z.ai`, `generativelanguage.googleapis.com`, `api.x.ai` |
| `openrouter`, `mammouth` | `openrouter.ai`, `api.mammouth.ai` |
| tools, not models | `web_search`: `api.tavily.com`; `brave_search`: `api.search.brave.com`; e-mail, Gmail: `imap.gmail.com` or `pop.gmail.com`, `smtp.gmail.com`, and for OAuth `accounts.google.com`, `oauth2.googleapis.com`; Outlook: `login.microsoftonline.com` for the sign-in — OAuth2, which an Outlook account requires whatever its protocol —, then `graph.microsoft.com` (Graph) or `outlook.office365.com` and `smtp-mail.outlook.com` (IMAP, POP3, SMTP) (`EmailDefaults`) |

A `BaseUrl` naming another host needs that host instead.

- **Keys** live in environment variables only: `ORKEON_Llm__ApiKey` (or the variable `Llm:ApiKeyEnvVar`
  names) for the machine profile, `ORKEON_Llm__Profiles__<id>__ApiKey` or the profile's `ApiKeyEnvVar` for an
  Orkeon profile, the variable named by `keyEnv` for a bench profile. A settings file holds names, never
  values. The `secret-guard` hook refuses a key pattern written in the workshop's folders. How a value reaches
  the container — `workshop --secret <NAME>` for a session, `-e NAME` on `docker run`, `remoteEnv` in VS Code —
  and how it is handed to the user is `process/hand-over.md` § 5 (D47). A vendor variable
  already in the container's environment (`ANTHROPIC_API_KEY`, which Claude Code may use) is a key any
  settings file can name: check what `ApiKeyEnvVar` names before a run.
- **Approval.** A remote run is paid: estimate, cap and the user's explicit yes, recorded in the open
  attempt, before it starts (`HARNESS.md`, rule 1) — the user types `/team-approve remote <usd>`, and
  its hook has `orkeon-bench` write the marker in the open attempt (D19, D36); never Claude, on its own
  initiative or from the shell. `orkeon llm probe` against a remote provider is paid
  too and is not watched by the run gate (`cli.md` § 6).
- **Do not overwrite the machine file for a trial.** `orkeon init --force` replaces it entirely (timeout and
  throttle included). Keep Ollama there and put each remote target in a named bench profile (§ 8), not in an
  `Llm:Profiles` entry the run gate does not judge.

## 7. Tokens and cost

| Where | What |
|---|---|
| `cost.updated` events | the run's cumulative `tokens`, `promptTokens`, `completionTokens`, cache pair, `estimatedTokens`; `model`, `provider`, `operation` of the call; `cost`, `currency`, `costSource` when the vendor billed (`cli.md` § 3.2) |
| `task.completed` | `tokens` and `toolCalls` of the task |
| `run.finished` | the same totals as the last `cost.updated` |
| plain stdout | `Tokens used: N`, or `(not measured)` |
| `AUTO_SUMMARY.md` | per task: total tokens · cache hit/miss (`/output`-prefixed writable root only) |

Under `--events` every generation call is metered — every profile's, manager, planner, retries, RAG and
memory calls, judges included (`MeteredLlmProvider`); embedding calls are not. A call whose provider counted nothing is
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
| `stub` (implicit, cannot be declared) | `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1` (never 11434), `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub`: the `openai` dialect, real tool calls (V-04); the server is `orkeon-bench llm-stub serve --scenario <file>`, which `orkeon-bench run` starts itself at L2 |
| named | `baseUrl`, `model`, `keyEnv` (required, the variable's **name**), `timeoutSeconds` (default 600) → `ORKEON_Llm__BaseUrl`, `__Model`, `__TimeoutSeconds`, `__ApiKey` |

A named profile overrides those four keys of the `Llm` section only: the other keys of the run's settings
file — the team's `settings/<slug>/appsettings.json` when it exists (D33), else the machine file —
(`Thinking`, `Temperature`, `MaxTokens`, `RateLimiting`) still apply to it, and so do its `Llm:Profiles`: a
crew that names one of them still reaches that profile's endpoint under `stub` or a named profile. `orkeon-bench profile <team> <name> [--json]` prints the
variables (names only, secrets redacted) and whether the target is remote (`remote`, `base_url_host`,
`remote_reason`) before anything runs.

**The remote rule** (bench `llm-target.ts` and `orkeon-configuration.ts`, mirrored by the `run-gate`
hook): a base URL decides alone — remote unless its host is local (`localhost`, `127.0.0.0/8`, `::1`,
`0.0.0.0`, `host.docker.internal`, or `HARNESS_LOCAL_LLM_HOSTS`); without one, an `Llm` section means
remote (`no-base-url`: § 2 routes it by the model name, then the key, OpenAI by default); no `Llm`
section at all is the echo provider, local. For `machine` both read the layers of `cli.md` § 5 in
Orkeon's order: `ORKEON_Llm__*` variables, the settings file of the run (the team's
`settings/<slug>/appsettings.json` when it exists, which the launchers pass with `--settings` — D33 — else
`crew/appsettings.json`, an `appsettings/` (or `_shared/`) folder up the tree, the user's file), unprefixed
`Llm__*` variables; the working directory's `appsettings[.<environment>].json` and the `DOTNET_Llm__*`
variables, which Orkeon no longer reads for a run, are not read either. Any key under `Llm` counts as a section, where Orkeon needs a non-blank key outside `Profiles`
(§ 2). A configuration without base URL is therefore refused without an approval even when its model would
stay on Ollama (`llama…`): always give the base URL.

**Every named profile is judged.** The rule judges the default provider and every `Llm:Profiles:<id>`
entry of any layer (file, `ORKEON_Llm__Profiles__*`, `Llm__Profiles__*`), fail-closed: which profiles a crew
names is not read — an agent's `llm: { profile }`, `--llm-profile <id>` or `Orkeon:Rag:LlmProfile` may name
any of them, and a script may compute the name — so the run is remote as soon as one of them is. A named
bench profile and the stub are injected over the default and over every named profile of the run. For
`orkeon-bench run` on the stub, the bench passes with `--settings` a generated copy of the settings file
the run would have read, its whole `Llm` section replaced by the simulated LLM for the default and every
profile and the rest kept, and removes from the run's environment every variable Orkeon reads an `Llm`
section from, whatever its case, and `ORKEON_OPENAI_API_KEY`: a run on the simulated LLM cannot reach
another model, whatever launches `orkeon` (`bench/README.md`, "The simulated LLM").
**What the rule does not see**: a run started from inside another program (`.claude/harness/README.md`,
the limits of the guards).

## 9. Checks

```bash
orkeon run crew --validate -v 1 2>&1 | grep 'LLM '          # default: model, base URL, temperature, timeout, key source; each profile's key source
orkeon doctor --json                                          # llm-config, llm-profiles, llm-profile-key, runner-settings rows (from the working directory)
init-orkeon.sh --status                                       # Ollama: server, models, GPU or CPU, context
orkeon llm models -p ollama                                   # what the local server serves (free)
orkeon-bench profile <slug> <name> --json                     # variables and remote verdict of a profile
```
