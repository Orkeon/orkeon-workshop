# Local and remote runs — comparability, thresholds, repetitions, flakiness, cost

> Reference document of the Orkeon harness (the workshop's `references/testing/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: Orkeon `src/core/Orkeon.Domain/SharedKernel/ValueObjects/LlmConfig.cs`,
> `src/core/Orkeon.Domain/Constants/Resilience/ResilienceDefaults.cs`, `src/core/Orkeon.Domain/Constants/Llm/LlmDefaults.cs`,
> `src/core/Orkeon.Infrastructure/LLMs/LlmProviderFactory.cs`, `MeteredLlmProvider.cs` and `Profiles/LlmSettings.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs` (`ElectLlmProfile`),
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/RunEvents.cs`, `src/tools/Orkeon.Tools.Email/Security/EmailContentScreen.cs`,
> `CHANGELOG.md` `[Unreleased]` (STUDIO-29, STUDIO-42, GAP-17, GAP-36), and a stub-driven run on the binary of main at 24ab0d0
> `orkeon-workshop:main-probe` (2026-10-02); harness `bench/README.md` ("Is a profile remote?"), `bench/src/domain/bench-config.ts`,
> `bench/src/domain/verdict.ts`, `bench/src/domain/llm-target.ts`, `.claude/hooks/run-gate.sh`, `FROZEN-LITERALS.md` § 3, `.claude/templates/`
> (`bench.config.json`, `ACCEPTANCE.md`, `REPORT.md`, `report.schema.json`); the image's `Dockerfile` and
> `init-orkeon.sh`, the user guide `docs/guides/models.md`; the harness plan § 6.4, § 6.5, § 11.1 and decisions D2, D20.

Throughout, "LLM" is the model the **team under test** calls through Orkeon — never the model of Claude
Code. Two levels run the whole team on a dataset: **L3** with a local model, **L4** with a remote one
(`testing/test-levels.md`). This document says how to compare them, how to set their thresholds, how many
times to run them, how to tell noise from a defect, and how to keep L4 affordable.

## 1. Local or remote — who decides

- A team is run with a **profile** of `tests/<slug>/bench.config.json`: `machine` (the machine's Orkeon
  settings, nothing injected), `stub` (the simulated LLM), or a named profile (`baseUrl`, `model`, `keyEnv`,
  `timeoutSeconds`). The variables each one injects: `bench/README.md`, section `tests/<slug>/bench.config.json`.
- Whether a profile is **remote** is one rule with two implementations — the bench's `llmTarget` and the
  run gate — written once in `bench/README.md`, section "Is a profile remote?" (and `FROZEN-LITERALS.md`
  § 3). Do not reason about it: ask, before any run,

  ```bash
  orkeon-bench profile mail-triage machine --json   # "remote": false, "base_url_host", "remote_reason"
  orkeon-bench profile mail-triage claude --json
  ```

- L3 is local **only while its profile is**. The `machine` profile is judged on the base URL a launcher
  run would see, through every configuration layer `orkeon run` reads; it is remote as soon as that host
  is not local, or when an `Llm` section has no base URL at all (`no-base-url`: Orkeon then calls the
  endpoint of the provider it infers) — and the run gate then treats an "L3" run as a paid one (D20,
  D32). A model server on the LAN is declared local through `HARNESS_LOCAL_LLM_HOSTS` (hosts only — same
  section of `bench/README.md`).
- The verdict covers the `Llm` section — the default profile — only. Orkeon also runs a crew's agents and
  tasks on the named profiles of its settings (`Llm:Profiles:<id>`, `llm: { profile: <id> }`,
  `orkeon/llm-profiles.md` § 3), which neither `orkeon-bench profile` nor the run gate judges: an L3 whose
  crew names a remote profile is a paid run the gate lets through, and so is an L2. Keep every profile of a
  team's settings local, and the remote target in a named bench profile.

## 2. What differs between a local and a remote run

| Aspect | Local (the image's defaults) | Remote | Effect on results |
|---|---|---|---|
| Model | `qwen3:8b` (`OLLAMA_DEFAULT_MODEL`) | the production model of the named profile | classification, instruction following and tool calling differ in quality |
| Context | 8192 tokens (`OLLAMA_CONTEXT_LENGTH`) | the provider's window | long inputs are cut locally; a team that fits remotely can fail locally |
| Time per call | 600 s (`Llm.TimeoutSeconds`, set by `init-orkeon.sh`; Orkeon's own default is 30 s, `LlmDefaults.DefaultTimeoutSeconds`) | the profile's `timeoutSeconds` (600 by default) | a stalled local call costs up to 600 s, twice when re-sent |
| Concurrency | one request at a time (`RateLimiting.MaxConcurrentRequests: 1`) | the provider's rate limits | a `parallel` crew is serialised locally |
| Thinking | `qwen3` thinks before answering; `ORKEON_Llm__Thinking__Enabled=false` turns it off for one run | provider-specific | tokens and time multiply |
| Provider dialect | Ollama, inferred from the base URL the image writes (`http://localhost:11434`, `init-orkeon.sh`) — Orkeon `main` reads no provider key | the provider's | tool calls and structured outputs travel differently |
| Cost | machine time, bounded by `budget.local_minutes_max` | tokens × price, capped by `budget.remote_usd_max` | — |

Both sides share Orkeon's resilience: a call that hits `Llm:TimeoutSeconds` is re-sent once
(`ResilienceDefaults.LlmTimeoutRetries`), and transient failures are retried up to `Llm:MaxRetries` (10 by
default, `LlmDefaults`); since ce9ec1f (LLM-12) a streamed call runs whole under `Llm:TimeoutSeconds`
and, when set, under `Llm:StreamIdleSeconds` between two chunks (120 in the image's machine file, D46):
it fails naming the setting instead of hanging. A failure that reaches a report is therefore rarely a passing network hiccup.

## 3. Keeping the two comparable

A local and a remote result say something together only when **everything but the profile is the same**:
the attempt (its design snapshot), the dataset version and `sha256` (its manifest), the scenarios and their
checks, the Orkeon version, the rubric version and the judge's model. `REPORT.md` shows the two side by side
per scenario (`## Local and remote`), from the same `report.json`.

Compare rates, not runs: L3 is judged on `pass_at` of `repeat` runs, L4 usually on one. A scenario green
at L4 and red at L3 says the local model is too weak for it, not that the team is right; the reverse says
the production model fails where a small one succeeds — read the events before blaming the provider.

**What a local run never proves**

- the production model's quality — the L4 thresholds exist for that;
- its cost — only L4 measures `usd`, and only an estimate precedes it;
- its behaviour on the adversarial set: `INV-INJECTION` at L3 covers the local model only; when production
  runs on a remote model — or when the need asks for a remote comparison, as the pilot's does —, run the
  adversarial set at L4 too, through an AC attached to L4 (`testing/acceptance-criteria.md` § 9);
- provider-specific failures: rate limits, structured-output handling, authentication.

The screening of e-mail reads is deterministic (`EmailContentScreen`: pattern heuristics, no model): a
message gets the same verdict at L3 and L4, and only the model's reaction to it differs.

**What a remote run does not prove either**: reliability, when it ran once; anything the free levels did
not already establish — wiring is proven at L2, not paid for at L4.

## 4. Differentiated thresholds

- Thresholds live in `workbooks/<slug>/ACCEPTANCE.md`. When the local threshold differs from the remote
  one, write **one row per level, each with its own id** (template: "then one row per level"):

  | Id | Measure | Unit | Threshold | Direction | Level |
  |---|---|---|---|---|---|
  | IND-02 | mails of `nominal` whose `category` equals `expected/`, median of the runs | % | 80 | >= | L3 |
  | IND-03 | the same measure, remote comparison model, one run | % | 95 | >= | L4 |
  | IND-06 | wall time of a first run on `volume` (50 new mails), median of the runs | s | 900 | <= | L3 |

- **The L3 threshold catches regressions and design defects for free**: set it where the local model passes
  reliably on a correct team, not at the production bar. Quality measures are usually lower at L3,
  durations looser, cost measured at L4 only.
- **An AC has one level.** An AC at L4 is never satisfied by an L3 pass. An indicator whose level did not
  run is absent from `report.json`, and the verdict treats an absent indicator as in range
  (`bench/src/domain/verdict.ts`): when a remote threshold matters, attach an AC to L4 as well, so that
  acceptance needs L4 to have run.
- A threshold changes through `/team-decision` (back to step 2), never to make a run pass.

## 5. Repetitions and `pass@k`

In the harness, `levels.<level>.repeat` is **n**, the number of runs of each end-to-end scenario, and
`pass_at` is **k**: a scenario passes when **at least k of its n runs** pass all their checks (`pass_at`
cannot exceed `repeat` — `bench/src/domain/bench-config.ts`). `report.json` carries `levels.e2e_local.runs`
and `pass_at_k` as `"k/n"`. This is not the `pass@k` of code-generation papers (at least one success among
k samples): it is a stricter k-of-n rule.

What a k-of-n rule lets through, for a team whose single run succeeds with probability p:

| Rule | p = 0.5 | p = 0.7 | p = 0.8 | p = 0.9 | p = 0.95 |
|---|---|---|---|---|---|
| 1 of 1 | 0.50 | 0.70 | 0.80 | 0.90 | 0.95 |
| 2 of 3 | 0.50 | 0.78 | 0.90 | 0.97 | 0.99 |
| 3 of 3 | 0.12 | 0.34 | 0.51 | 0.73 | 0.86 |
| 4 of 5 | 0.19 | 0.53 | 0.74 | 0.92 | 0.98 |
| 8 of 10 | 0.05 | 0.38 | 0.68 | 0.93 | 0.99 |

- **2 of 3** (the template's default) passes a coin-flip team half the time: it filters out a broken team,
  it does not prove reliability. A team meant to run unattended needs a stricter rule (4 of 5, 8 of 10) on
  a small dataset — written in `TEST-PLAN.md`, `## Repetitions and flakiness`.
- **At L4, `repeat: 1`** shows that the production model can, not that it always does. Repeat remotely
  only when the need asks for remote reliability, and price it (§ 8).
- **Invariants hold on every run**: one violation in one repetition fails the invariant; k-of-n never
  applies to them.
- **Indicators** are aggregated over the runs as their Measure says (median of the runs, worst run).
- Repetitions cost n × scenarios × run time locally — keep the L3 dataset small and the local budget
  (`budget.local_minutes_max`, 60 minutes per attempt by default) in view.

## 6. Flakiness or defect

`flaky` is a gap category of the review (`references/process/workflow.md` § 5): model variance on a correct
team. Everything else is a defect, and calling a defect flaky hides it.

| Observation | Reading | Usual category |
|---|---|---|
| a red at L0, L1 or L2 on some runs only | **defect**: these levels are deterministic (the stub is scripted) — a clock, an ordering, a random value, a folder shared between runs | `tool`, `dag`, or the test itself |
| the same check fails in every run | defect | `prompt`, `tool`, `dag`, `data` |
| an invariant violated in any run | defect, never flaky | the invariant's |
| the same case fails in most runs | defect tied to that input or to the prompt | `data`, `prompt` |
| failures only on long inputs, or with timeouts | sizing: the context or the time limit | `model` |
| different checks fail in different runs, each passing elsewhere, no invariant involved | flaky | `flaky` |

A `flaky` gap needs its evidence like any other: the run ids of passing and failing repetitions on the same
inputs, and the events where they diverge (`run-analyst` summarises a run). Reduce the variance rather than
the bar: move parsing and rules into deterministic tools, give the deliverable a schema
(`structured_output`), set a low `temperature` (Orkeon sends none unless the settings, an agent's `llm:` or a
task's `llmOverride:` sets one — the model's own default then applies), split long tasks,
turn `thinking` off for a local model that wanders, raise n. Lowering k is a change of threshold: a decision.

## 7. The remote rule and the run gate

The rule is in `bench/README.md`, "Is a profile remote?"; the hook that enforces it is
`.claude/hooks/run-gate.sh` (D20). In short, for what a test author needs to know:

- It watches `orkeon run`, `orkeon-harness-run`, `./run.sh`, `run.cmd` and `orkeon-bench run`, inside
  compound commands too, and classifies each run: `validate` (`--validate`, `--list-tools`, levels L0–L1),
  `stub` (`--profile stub`, level L2), `machine` and `local` (allowed while local), `remote`.
- A remote run is allowed only with an approval in the team's **open** attempt —
  `workbooks/<slug>/attempts/ATT-nnnn/remote-approval.json`, or `remote_approval` in its `manifest.json`:
  `{by, at, estimated_usd, cap_usd}`, `by` non-empty, `estimated_usd <= cap_usd`. An approval in a closed
  attempt does not count. A refusal names its reason in the bench's words (`remote-host: <host>`,
  `no-base-url`…), and every decision lands in `.claude/run-log.tsv`.
- Where its two implementations could disagree, the gate fails closed: it may refuse what the bench calls
  local, never the reverse. Both read only the `Llm` section and not `--llm-profile`: a remote
  `Llm:Profiles` entry is not seen (§ 1).
- `orkeon-bench run` without `--level` reaches L4, so the gate counts it as remote: always pass `--level`.
- It launches nothing. The approval is the user's: state the estimate and the cap, and wait for the
  user to type `/team-approve remote <usd>` — the hook `team-approve` then has `orkeon-bench` write the
  marker in the open attempt (D19, D36); never Claude, on its own initiative or from the shell
  (`HARNESS.md`, rule 1).
  `orkeon-bench estimate` (lot 9) adds the estimate.

## 8. Keeping cost under control

1. **Free levels first.** L4 runs on an attempt whose L0–L3 are green; a red level stops the chain.
2. **Only what L4 must prove.** The scenarios behind the AC and IND attached to L4, on the smallest dataset
   that serves them — often a subset of `nominal` plus the adversarial set.
3. **One run by default** (`levels.e2e_remote.repeat: 1`).
4. **Estimate before asking**: tokens in and out per scenario from the local runs × the remote price
   (`orkeon/llm-profiles.md`) × `repeat` × scenarios, with a margin — tokenizers, iteration counts and
   thinking differ between models, so local counts are a rough guide. On `main` every `cost.updated` carries
   the run's cumulative `tokens`, `promptTokens` and `completionTokens`, with `model`, `provider` and
   `operation` (`agent`, `manager`, `planning`…), and counts every model call of the run, retries included
   (observed on the `main` binary: `"promptTokens":280,"completionTokens":140,"provider":"OpenAI","operation":"agent"`);
   an estimated count is marked `estimatedTokens` and never priced. A price reaches the stream only when
   the vendor bills in its answer (`cost`, `currency`, `costSource: "vendor"` — OpenRouter); otherwise the
   estimate is tokens × the rate written in the test plan. Compare it with the cap,
   `budget.remote_usd_max` (2.00 USD per attempt by default, D2).
5. **Cap the run itself**: `INV-BUDGET` checks tokens and duration against the caps; `maxIter` and
   `maxTokens` are sized in the design (`design/sizing-and-cost.md`).
6. **Never in a loop**: the build → run → review loop runs `stub` and local profiles; each attempt that
   needs L4 asks again, and the approval of a closed attempt is spent.
7. **Report what was spent**: `levels.e2e_remote.usd` and `cost.usd_estimated` in `report.json` — compare
   with the estimate and correct the next one.

Planned: `orkeon-bench run --level L4` with the remote level, `orkeon-bench estimate <team> --llm remote`,
and the local/remote comparison in the report (lot 9). Until then L4 is exceptional and manual.
