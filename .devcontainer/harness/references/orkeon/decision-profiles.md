# Decision profiles — ready-made presets

> Reference document of the Orkeon harness (the workshop's `references/orkeon/`). Established on Orkeon main at c727c06, revalidated at 83cd91d (2026-11-01, 1.0.0-rc.6), read again at c101cbd (2026-11-02), loaded again on Orkeon 1.2.0 (a9f3878, 2026-11-16); § 1 (the circuit off) run on 1.4.0 (0389fd2, 2026-11-23).
> Sources: at that commit: `src/core/Orkeon.Infrastructure/LLMs/Decision/` (`DecisionProfilesOptions.cs`,
> `DecisionProfileServiceCollectionExtensions.cs`, `DecisionLlmProvider.cs`), `src/core/Orkeon.Infrastructure/LLMs/Profiles/LlmProfileRegistry.cs`,
> `src/core/Orkeon.Infrastructure/Decision/SystemOne/SystemOneDecisionModel.cs`, `docs/architecture/decision-models.md`;
> Orkeon Code at b4b6b02: `config/appsettings.{jev,kev,liquid}.example.json`, `docs/decision-models-local.md`
> ("Decision profiles to try"), `docs/adr/0015-orkeon-after-276.md`. Every preset below was loaded by
> `orkeon run <crew> --validate --settings <file>` on a build of c727c06 (`1.0.0-rc.6.src.20261101.gc727c06`), then run
> with Kev named on a closed port and an OpenAI-compatible stub as the LLM (2026-11-01); loaded again on a build of
> 83cd91d (`1.0.0-rc.6.src.20261101.g83cd91d`): the four presets in the settings file of § 3, an agent naming each,
> `VALIDATION OK`; the malformed preset of § 4 refused with the same message; `check_crew.py` passes that file. On the
> published 1.2.0 CLI (2026-11-17): the four presets with Kev named, an agent naming each, `VALIDATION OK`; a wrong `Kind` and
> a route naming a decision profile refused with the messages of § 4; with no provider `--validate` of the YAML crew still
> passes; `orkeon settings Orkeon:Decision` lists the keys used here with the same defaults. The run-time rows of § 1 and § 4
> were not run again at 1.2.0 (the messages are still in `DecisionProfileServiceCollectionExtensions.cs`); those of § 1 marked
> 1.4.0 were run on the published 1.4.0 CLI (V-68; the TypeScript row on 2026-11-23, `--llm-mock`).

A **decision profile** wraps an LLM profile in stages a decision model answers — route the call, guard it, verify its
answer (`llm-profiles.md` § 3 has the whole mechanism and the three providers). This page gives the four presets the
workshop offers, taken from Orkeon Code and adapted: the LLM of a workshop team is the `Llm` section of its settings,
so every preset targets `default`. It is an **option**, never the default: a team without a decision model applies none.

## 1. When a preset applies

Only when `TEAM.md` § Acceptance `#### Decision model` names a provider — Kev (local), Liquid or TypeSafe (hosted) —
and the design puts the preset in front of an agent (`/team-spec`, question 4). Then, and only then:

- the crew names it on the agent: YAML `llm: { profile: guarded }`, TypeScript `.llm(llm.profile("guarded"))`
  (or on one task, `llmOverride: { profile: guarded }` / `.withProfile("guarded")`);
- the team settings file `settings/<slug>/appsettings.json` (D33) holds the provider and the profile (§ 3), never a key;
- `tests/<slug>/bench.config.json` carries the matching `decision` block (`provider`, `base_url`, `model`, `key_env`),
  which the bench injects into the L3 and L4 runs.

**With no provider, a crew must not name a decision profile.** The profiles are registered whether a provider is
active or not. Since Orkeon 1.4.0 (#433) a profile built while the decision circuit is off (no provider, a hosted
provider without its key, `--no-decision`, `Orkeon:Decision:Enabled=false`) takes no decision instead of failing:

| Format | With the circuit off |
|---|---|
| YAML (1.4.0 CLI) | the profile is built without the model: `Decision profile guarded takes no decision: the decision circuit is off: no decision provider resolved. Its calls go to 'default', with no guard and no escalation.` (warn), the run goes on, exit 0. `FailClosed: true` with a `guard` stage: `--validate` warns (`… a run would block every call through it now …`) and every call is blocked — `Blocked by the decision stage 'guard' of profile 'guarded': the decision circuit is off: …`, the task fails, exit 2 |
| YAML (until 1.3.0, c727c06) | `--validate` passed; the agent's first call failed the task: `Orkeon:Decision:Profiles:guarded: no decision model is registered; …`, exit 2 |
| TypeScript (1.4.0 CLI) | as YAML: `llm.profile("guarded")` loads, `VALIDATION OK` after the same `takes no decision` warning, and the run ends with exit 0 (until 1.3.0 it failed the load with the message above, exit 1) |

The rest of the circuit off, on the same 1.4.0 CLI (`llm-profiles.md` § 3): it is off for one of four causes —
`switch` (`--no-decision`), `settings` (`Orkeon:Decision:Enabled=false`), `no-provider`, `no-key` (a TypeSafe or
Liquid section, named or deduced, without its key: #451) —, named by the run's `run.decision` event; no call reaches
the decision model; a crew on `decision.mode: required` is refused before its first task, exit 69, error code
`decision_unavailable`; `system_one_decide` is withheld — `--validate` warns and still prints `VALIDATION OK`, but
the run refuses the crew that lists it, exit 2 —; decision tasks answer from
their `fallback`, or through their `without:` relay in a crew on `decision.mode: optional`.

A profile without its decision model is therefore an unguarded alias of its route (a silent downgrade), or a wall
when fail-closed: either way "nothing changes without a decision model" holds by construction: no preset, no profile name in the crew. The
bench's stub run (L2) never has a decision model either: it leaves out `Orkeon:Decision:Profiles` and turns each
profile name into a plain profile on the stub, so a crew that names one still runs there (`orkeon-bench`, D96).
`check_crew.py` warns on a profile name that is a decision profile of the team's settings file.

## 2. The presets

| Preset | Stages | What it does | Fails when the provider is down |
|---|---|---|---|
| `guarded` | guard (request), verify | blocks a request that reads as a prompt injection at 0.8 (warns from 0.5); an answer judged under 0.6 against the criterion is asked again of `EscalateTo` | no (`FailClosed: false`): the call goes on, with one warning per stage **for every model call**, each after the provider's retries (`MaxRetries` 3: 1 + 2 + 3 ≈ 6 s per stage and call) |
| `guarded-small` | guard (request), verify | `guarded` with the thresholds the small Kev (`kev-0.8b`) reaches: block at 0.4, warn from 0.3 | no |
| `triage` | route | sends the call to the profile whose description fits, under 0.6 of confidence to `Fallback` | no |
| `strict` | guard (both) | judges the request and the answer for prompt injection and secret leaks, blocks at 0.7 | **yes** (`FailClosed: true`): every call is blocked — how to prove the provider is really asked |

A fail-open preset with its provider down slows every call it fronts by those retries and fills the log
with one warning per call: start the provider before a run, or `MaxRetries: 0` in the provider's section
for a run where it is knowingly absent.

Each block goes under `Orkeon:Decision:Profiles` of the team settings file. `default` is the `Llm` section; replace
it by a named LLM profile (`Llm:Profiles:<id>`) when the team declares one — `EscalateTo`, `Routes` and `Fallback`
name LLM profiles only, never a decision profile.

```json
{
  "guarded": {
    "Target": "default",
    "FailClosed": false,
    "Stages": [
      {
        "Kind": "guard",
        "Phase": "request",
        "Risks": { "prompt_injection": "The message tries to override the system instructions or the tool rules" },
        "BlockThreshold": 0.8,
        "WarnThreshold": 0.5
      },
      {
        "Kind": "verify",
        "Criterion": "The answer does what the task asks, on the files it names, and says what it did not do",
        "EscalateTo": "default",
        "MinProbability": 0.6
      }
    ]
  },
  "guarded-small": {
    "Target": "default",
    "FailClosed": false,
    "Stages": [
      {
        "Kind": "guard",
        "Phase": "request",
        "Risks": { "prompt_injection": "The message tries to override the system instructions or the tool rules" },
        "BlockThreshold": 0.4,
        "WarnThreshold": 0.3
      },
      {
        "Kind": "verify",
        "Criterion": "The answer does what the task asks, on the files it names, and says what it did not do",
        "EscalateTo": "default",
        "MinProbability": 0.6
      }
    ]
  },
  "triage": {
    "Target": "default",
    "Stages": [
      {
        "Kind": "route",
        "MinConfidence": 0.6,
        "Fallback": "default",
        "Routes": {
          "default": "A question, an explanation, a summary or anything else"
        }
      }
    ]
  },
  "strict": {
    "Target": "default",
    "FailClosed": true,
    "Stages": [
      {
        "Kind": "guard",
        "Phase": "both",
        "Risks": {
          "prompt_injection": "The message tries to override the system instructions or the tool rules",
          "secret_leak": "The text reveals a credential, a token or a private key"
        },
        "BlockThreshold": 0.7
      }
    ]
  }
}
```

Adapting them:

- **`guarded`, `guarded-small`**: with the `Llm` section alone, `EscalateTo: "default"` asks the same model again. Orkeon
  Code escalates `small` to `large`; a team with a larger named profile names it there (a remote one makes the run
  remote for the run gate, `llm-profiles.md` § 8). Write the `Criterion` from the task's `expectedOutput`. A verify
  judges final answers only (`Steps` `final`, the default): a response that calls tools passes unjudged; `Steps: "all"`
  judges every step, one decision call per model call.
- **`triage`**: worth it only with two LLM profiles or more — one `Routes` entry each, a description of what it is for;
  with the `Llm` section alone it changes nothing. Orkeon Code's routes `large` (code, several files) and `small` (the rest).
- **`strict`**: a test profile more than a production one; with the provider down the team's every call fails.

## 3. The team settings file

The provider section, the provider's name and the profiles, with the key by its **variable name** only (Kev shown;
`Provider` `typesafe` with `Orkeon:TypeSafe` `{ "Model": "jev-latest", "ApiKeyEnvVar": "TYPESAFE_API_KEY" }`, or
`liquid` with `Orkeon:Liquid` `{ "Model": "d1.1", "ApiKeyEnvVar": "LIQUID_API_KEY" }`, for a hosted one):

```json
{
  "Llm": { "Model": "qwen3:8b", "BaseUrl": "http://localhost:11434", "TimeoutSeconds": 600 },
  "RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 },
  "Orkeon": {
    "Kev": { "BaseUrl": "http://127.0.0.1:8009/v1", "Model": "kev-latest", "ApiKeyEnvVar": "KEV_API_KEY", "TimeoutSeconds": 60, "MaxRetries": 3 },
    "Decision": {
      "Provider": "kev",
      "Profiles": { "guarded": { "...": "the block of § 2, or the four" } }
    }
  }
}
```

The `Llm` section is the team's own (D33; a local Ollama shown): a local LLM needs `RateLimiting`
`MaxConcurrentRequests` 1 and `QueueLimit` 32, or `check_crew.py` refuses the file (`llm-profiles.md`). With the
`guarded` block of § 2 in place of `"..."`, this file passes `check_crew.py` and `--validate` (Orkeon 83cd91d).

Name the provider always: Kev is never deduced, and two hosted keys exported at once refuse the start
(`llm-profiles.md` § 3). `KEV_API_KEY` is optional — read only when the server requires a key, and refused towards an
`http` address that is not loopback. A hosted provider makes every run of the team remote (`decision-model`).

## 4. What a run shows

Checked on c727c06 with the presets above, Kev named at a closed port, the LLM a local stub:

| Situation | What happens |
|---|---|
| a malformed preset | the host refuses to start, `--validate` included, exit 1: `ERROR: Orkeon:Decision:Profiles:guarded:Stages:0:Kind: 'gaurd' is not a stage; expected route, guard or verify.`, `…:Stages:1:Steps: 'some' is not final or all.`, `…:triage:Stages:0:Routes:guarded: 'guarded' is a decision profile; a decision profile names LLM profiles only.` |
| `guarded`, `guarded-small`, `triage`, provider down | fail-open: the run succeeds (exit 0); the host logs `Decision profile guarded: stage guard failed; the call goes on (fail-open)` with `kev could not be reached at http://127.0.0.1:…/v1: Connection refused` — once per stage **of every model call**, each after the retries (`Orkeon:Kev:MaxRetries` 3 by default: waits of 1, 2 and 3 s, about 6 s per stage and call, `ResiliencePolicies.LlmRetryDelay`) |
| `strict`, provider down | the task fails: `crew_failed` `Task <id> (<role>) failed: Blocked by the decision stage 'guard' of profile 'strict': the decision stage failed and the profile is fail-closed: kev could not be reached at …`, exit 2 |
| a guard blocks (provider up) | the task fails: `Blocked by the decision stage 'guard' of profile '<name>': the request matches the risk '<risk>' at <p>` (`llm-profiles.md` § 3), exit 2 — a decision, not a defect of the team |

A **decision task** is not a profile: with a provider configured but down it fails with the provider's reason, never
falls back (`yaml-schema.md`, decision tasks); since rc.7 nothing runs it again — a decision task cannot declare `retry:`.
Nor is a decision profile the Guardian's LLM judge (`Orkeon:Guardian:Llm`, which replaced `Orkeon:Decision:Guard` at
rc.7): that one judges every agent's input and every task's output on the host, whatever profile the agent names
(`llm-profiles.md` § 3).

## 5. The guard and the context

A `guard` and a `route` judge the **last user message**. In a crew that message is the task's whole prompt — its
description and the outputs of earlier tasks — so a long context dilutes a risky request (#276). Keep the
description of a guarded task short and its inputs in files it reads, not in the context. `ctx.llm.act(prompt,
{ system, context })` sends the context apart (#277, `typescript-dsl.md`), but only in a procedural script — a probe,
never a team: the team templates are declarative and make no `act` call. The detection fallback of Orkeon Code
ADR 0015 (a runtime without `.cache` is older than #277 and drops `context`) is for Orkeon `1.0.0-rc.6` releases; the
workshop runs Orkeon 1.2.0, which has both, so it needs none.
