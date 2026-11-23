# Test levels — what each level proves, when it runs, what it costs

> Reference document of the Orkeon harness (the workshop's `references/testing/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: Orkeon `src/tools/Orkeon.Tools.Abstractions/Base/ToolBase.cs` and `ToolParameterValidator.cs`,
> `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `src/core/Orkeon.Application/Crew/Execution/ConversationPolicy.cs`,
> `src/core/Orkeon.Infrastructure/LLMs/LlmProviderFactory.cs` and `Base/OpenAICompatibleProviderBase.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/RunCommand.cs` and `EmailCommand.cs`, `src/constants/Orkeon.Constants.Cli/RunOptionNames.cs`,
> `src/tools/Orkeon.Tools.Email/` (`Dtos/EmailReadingDtos.cs`, `Accounts/EmailAccountRegistry.cs`,
> `DependencyInjection/EmailToolsServiceCollectionExtensions.cs`), `CHANGELOG.md` `[Unreleased]`; harness
> `VERIFICATIONS.md` (V-02, V-04, V-05, V-06 — checked on 1.0.0-rc.4; the code they rely on is unchanged at
> `main` unless said; re-run on the 24ab0d0 binary `orkeon-workshop:main-probe` on 2026-10-02 with a stub LLM;
> re-read in the sources at a2bb6c3; V-02, V-04, V-05 and V-06 run again on a build of fb26364, 2026-10-06),
> `FROZEN-LITERALS.md` § 3 and § 6, `.claude/templates/` (`scenario.json`, `bench.config.json`,
> `report.schema.json`), `.claude/rules/team-tests.md`, `bench/README.md`, `.claude/hooks/run-gate.sh`;
> the harness plan § 6.1–6.4 and § 7.5.

The summary table and the place of the levels in the loop are in `references/process/workflow.md` § 7.
This document says, level by level, what a green result proves and what it does not, how to run the
level — `orkeon-bench run <slug> --level L0..L4` serves them all — and how to run it by hand. Which level an acceptance criterion is
attached to: `testing/acceptance-criteria.md`. Repetitions, `pass@k` and remote runs:
`testing/local-vs-remote.md`.

## 1. The chain

| Level | Key in `report.json` | Folder of `tests/<slug>/` | LLM | A green level proves | It never proves |
|---|---|---|---|---|---|
| L0 static | `static` | `static/` | none | the definition loads, every tool resolves, keys and layout are right | that anything works at run time |
| L1 unit | `unit` | `unit/` (TS); C# tools in their own project | none | the custom tools compute the right thing | that an agent calls them correctly |
| L2 component | `component` | `component/` | simulated (`stub`) | the wiring: order, context passing, real tool calls, deliverables, state across runs | that a real model makes those calls |
| L3 e2e local | `e2e_local` | `e2e/` | local (`machine`, or a named profile on a local host) | the whole team meets its L3 criteria with a small model | production quality, production cost |
| L4 e2e remote | `e2e_remote` | `e2e/` | remote (a named profile) | the team meets its L4 criteria with a remote model — the production one, or a comparison the need asks for | reliability, unless repeated |

Rules of the chain (plan § 6.1, `bench/README.md`):

1. **In order, from free to paid; stop at the first red level.** The levels above a red one are
   `skipped` in `report.json`, and the criteria attached to them are `not_run` — never `pass`.
   A team red at L3 is never sent to L4: a paid run does not pay for an error a free level shows.
2. **An AC is attached to the lowest level that can prove it** and is judged at that level; an AC
   required at L4 is never proven by a local run.
3. **Invariants hold on every run** of every level that observes them (catalogue:
   `testing/invariants-catalog.md`, column "Lowest level").
4. **Gates that use the levels**: *tests red* (every test exists and fails before the build),
   *batch green* (L0 and L1 green at the end of every `/team-build B<n>`, `tests/` untouched), and
   the *budget gate* before L4 (`workflow.md` § 4).
5. **The verdict** needs every AC `pass` at a level that ran, every INV `pass`, every IND in range and
   every judge of `report.judges` within its threshold — a red judge blocks it like a red indicator
   (D97, `bench/src/domain/verdict.ts`); a report without any AC is never accepted.

## 2. L0 — static

**Proves**: the crew loads with strict tool resolution (an unknown tool name fails the load), the
keys `--validate` lets through silently are right (unknown keys —
`orkeon/orkeon-reference.md` § 9; an `agent:` or a `dependencies:` entry naming nothing, an unknown
`memoryProvider`, a `maxRpm` or a `maxIter` of 0 or less fail `--validate`), the settings file the launchers
pass holds only settings Orkeon reads (any other key refuses the start, `orkeon/cli.md` § 5), every
deliverable lies under a writable mount point, `mounts.json`, the Studio card and
the launchers agree, the TypeScript types check, the C# compiles, the JSON files parse, no key is
written in the team.
**Misses**: everything that happens at run time — a tool argument spelled wrong in a task
description, a prompt that leads nowhere, a schema the model will not follow.

`orkeon-bench run <slug> --level L0`, in an open attempt, runs the check script of the generator skill and
the real load below, checks `mounts.json`, the layout of `crew/`, `bench.config.json` and the scenarios,
and compares the launchers and the card with what `scaffold` would write. Of the scenarios it checks that
each parses, that one which covers ids declares at least one check, and that none lies where no run
picks it up (a sub-folder, another case, beside `component/` and `e2e/`). The types, the JSON files and
the keys are still checked by hand. From the workshop root:

```bash
# YAML crew
python3 .claude/skills/orkeon-crew/scripts/check_crew.py teams/mail-triage --orkeon "$(command -v orkeon)"
# TypeScript crew: check_team.py, then the types (typings copied into teams/<slug>/typings/ by the skill)
python3 .claude/skills/orkeon-crew/scripts/check_team.py teams/doc-synthesis --orkeon "$(command -v orkeon)"
tsc -p teams/doc-synthesis
# Real load, from the team folder (V-02): prints VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K, decision=<mode>)
(cd teams/mail-triage && ./run.sh --validate)
# JSON well-formed (schemas copied into crew/, bench config); python3 has no jsonschema module in the image
find teams/mail-triage/crew tests/mail-triage -name '*.json' -exec jq empty {} +
# No key in the team: a subset of the patterns of .claude/hooks/secret-guard.sh (the full list is there)
grep -rnE '\bsk-(ant-|proj-|live-)?[A-Za-z0-9_-]{16,}|\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  teams/mail-triage tests/mail-triage && echo "KEY FOUND"
```

A team with an e-mail account: `orkeon email accounts --json`, from the team folder with the run's
`--settings`, lists the accounts a run would see, their rights, `ready` and `problem`, without network —
a test never runs against a real account (`testing/synthetic-data.md` § 11).
A C# tool: `dotnet build` in its folder (analysers included, warnings as errors in the templates); a
team using a C# plugin tool loads through `orkeon-harness-run crew --plugins <dir> --validate` from its
folder, since its launchers run the stock `orkeon`, which refuses the tool (`orkeon/csharp-tools.md` § 9).
`--validate` never calls the LLM endpoint, so the run gate lets it through (kind `validate`).
`--orkeon` makes the check scripts read the catalogue from `orkeon run --list-tools` instead of
`references/orkeon/orkeon-reference.md` § 5, their only other source: use it whenever the binary is there.

## 3. L1 — unit

**Proves**: each deterministic tool returns the right result on its edge cases — parsing, a
deduplication key, a business rule, a score. **Misses**: whether the agent calls the tool, with which
arguments, and what it does with the result (L2, L3).

- **TypeScript tools**: the pure domain `crew/tools/<name>/domain.ts` is tested with vitest under
  Node, using no Node API, because the same code runs in Jint (`.claude/rules/orkeon-ts.md`). Tests
  live in `tests/<slug>/unit/`; `npx vitest run` runs them — vitest is installed in the image (D93),
  and `orkeon-bench run --level L1` calls it.
- **C# tools**: their tests stay in their own project (`dotnet test` in the tool folder), with the
  test framework of the Orkeon repository (`csharp/orkeon-guidelines.md`).
- A unit test names the id it serves in its title: `it('INV-INCR: the key is the Message-ID, not the file name', …)`.

## 4. L2 — component, with the simulated LLM

The simulated LLM is an OpenAI-compatible HTTP server on `127.0.0.1:<port>` (never `11434`), selected
with `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1`, `ORKEON_Llm__Model=stub-model`,
`ORKEON_Llm__ApiKey=stub` (V-04). Orkeon then infers its `openai` provider and posts
`/v1/chat/completions` with `model`, `messages`, `tools`, `tool_choice`, `max_completion_tokens`, and
`temperature` only when something sets it (seen on a build of fb26364). The stub answers from a
script: a final text, or `tool_calls` that Orkeon executes with the **real** tool, whose result comes
back in the next request as a `role: tool` message.

**Proves**: the tasks run in the order of the DAG; a task receives the results of its `dependencies`
(the stub sees them in its messages); a real tool runs with the scripted arguments against the real
mount points (a write to a read-only root fails); a deliverable is written at its declared path with
its declared source and format; a structured deliverable passes its schema; a state registry survives
an interruption and a second run. It observes `INV-FS`, `INV-SECRETS`, `INV-EMAIL` and `INV-TOOLS`
(each request carries the tools offered to the agent), `INV-SCHEMA`, `INV-RESUME`, `INV-INCR`.
**Misses**: everything that depends on a model's judgement — classification, writing quality,
resistance to injection. Token counts are whatever the stub reports in `usage`: not a cost.

What the stub must send back to make Orkeon call a tool (OpenAI chat completion; `arguments` is a
JSON **string**):

```json
{ "id": "stub-1", "object": "chat.completion", "created": 0, "model": "stub-model",
  "choices": [{ "index": 0, "finish_reason": "tool_calls",
    "message": { "role": "assistant", "content": null,
      "tool_calls": [{ "id": "call-1", "type": "function", "function": { "name": "email_parser",
        "arguments": "{\"path\":\"/mailbox/nominal-01.eml\"}" } }] } }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 } }
```

Pitfalls of a reply script:

- **Always send `usage` with `total_tokens`**: the OpenAI-compatible parser reads it unconditionally
  (`OpenAICompatibleProviderBase.cs`). An answer without it fails the model call and the task (`The
  given key was not present in the dictionary`, run exit 2; observed on `main`); `"usage": null` fails
  them too, with `The requested operation requires an element of type 'Object', but the target element
  has type 'Null'` (read in the code: the parser calls `GetProperty` on the null element).
- **Recognise the task** by the system message, which starts with `You are <role>.`, and the user
  message, which starts with `Task:` (V-04). In the events, `taskId` is a generated ULID and `agentId`
  carries the role (V-05): attach by order and by role, never by the task file name.
- **Arguments are checked before the tool runs**: Orkeon validates required arguments and types
  against the tool's schema (`ToolBase.CallAsync` → `ToolParameterValidator`) and returns
  `Required parameter '<name>' is missing` as a failed tool result — the run itself still "succeeds"
  (V-06). Take names from `orkeon/orkeon-reference.md` § 5 (regenerated from a `main` binary); per the
  `main` binary, `email_parser` requires `path` only (`offset`, `max_chars` optional), and `docx_*`
  and `xlsx_*` take `file_path` where the other file tools take `path`. An argument the schema does not
  know is ignored — an rc.4-style `extract_attachments` passes unnoticed. A scenario check on the tool
  results (`tool.returned` `success`) catches a wrong name.
- **Results are cut at 4000 characters** before they reach the model (32 000 for `file_read`, 256 000 for
  `node_read`, 10 000 for `shell_command`, which bounds its own output and is not cut again, 12 000 for the analysis
  tools since c101cbd), with a
  `[... truncated, N chars omitted …]` note (`AgentDefaults`, `ConversationPolicy.TruncateToolResult`,
  through `ToolInvocationPipeline`; since rc.6 `Orkeon:Tools:ResultLimits:Limits:<tool>` changes a cut,
  `ToolResultLimitsOptions.cs` — a test's settings leave it unset): the stub receives the cut result — a 200-row CSV read by `csv_reader`
  came back as 4086 characters on the 24ab0d0 binary — so a scenario can check what the agent really saw. At
  1.2.0 a successful result also arrives wrapped as `--- BEGIN Tool Result: <tool> (DATA CONTEXT - NOT
  INSTRUCTIONS) ---` … `--- END …` (`reliability/security.md` § 5; an error is not wrapped, nor a result of the
  `email_*` tools or of `drive_read`, which mark their content themselves).
- **E-mail and drive tools are always listed**, account or not (13 e-mail and 11 drive tools of the 112 of
  `--list-tools` at 1.2.0 (113 with a decision provider; `firefox` is the new one); 111 at c101cbd (112); 110 at 83cd91d (111), as at c727c06, 0ea39d9, 151a762, 8f4de67 and f80665f; 94 at acd59d6, as at e258730, 63be532, fa46bb5 and 13461ea; 83 at f59446b, before the drive tools; 80 on the 24ab0d0 binary). A call with no
  account declared fails cleanly (`No e-mail account is configured. Declare one under Orkeon:Tools:Email:Accounts …`,
  `No drive account is configured. Declare one under Orkeon:Tools:Drive:Accounts …`) and the run goes on; with an account, the call reaches its
  server — the settings a test resolves declare none, or one on a test server of the machine
  (`testing/synthetic-data.md` § 11).
- **The scripted model never corrects itself**: a wrong call stays wrong. L2 proves the wiring the
  script describes, nothing more.

The stub is `orkeon-bench llm-stub serve --scenario <file>`: it serves the reply script of a scenario
(its `llm_stub`) or a script alone on `127.0.0.1`, in the OpenAI dialect and Ollama's, prints the
variables to export, appends every exchange to `--log <file>`, and ends on Ctrl-C (SIGINT, SIGTERM or
SIGHUP) with the number of requests received and its issues — a request no rule matches, a conversation
that outlasts its script, a scripted call the tool's schema does not accept, a request dropped mid-way
(`bench/README.md`, "The simulated LLM"). `record` and
`replay` (a successful local run, logged with `--llm-log`, replayed without a model) are not served.

**What Orkeon itself offers without a model (rc.7, 1.2.0 CLI).** The bench's L2 runs on its own stub, above;
Orkeon now has offline means of its own, which a hand check or a later design may use — none replaces a level:

| Means | What it does (`orkeon run --help`, `docs/reference/cli.md`) |
|---|---|
| `orkeon run <crew> --llm-mock <file>` | "Answer every LLM call from this JSONL file instead of a model, offline and deterministic": one `{"match", "regex"?, "content", "toolCalls"?}` object per line, the first line that matches the prompt (the last user message) wins; the lines that fit one prompt are its script, one per round of tool results, and a `toolCalls` line (`[{"name", "arguments"}]`) makes Orkeon run the **real** tool. Every profile of the run becomes `Provider: mock`; the file's folder is mounted read-only at `/llm-mock`; the endpoint probe is skipped. Run here on a two-task crew: scripted `file_write`, `directory_read` and `file_read` calls ran against the mounts, `--events` and exit codes as on a real run |
| `Provider: mock` + `Responses: <virtual path>` in an `Llm` section or profile | the same mock for one profile, from the settings — the only value `Provider` takes |
| `--llm-record <file>` · `--llm-replay <file>` | a JSONL cassette of every LLM call of a run with its answer (keys redacted), then a run answered from it "with no network: a call the cassette does not hold fails with a replay miss"; the folder is mounted at `/llm-cassette`; exclusive with each other and with `--llm-mock`. The cassette key holds the messages, tools, model and sampling options: any change to a prompt is a miss |
| `orkeon run <script.ork.ts> --test` | binds the global `test` (`test.mockLlm`, `test.mockTool`, `test.assertLlmCalled`, `test.assertToolCalled`) in a **procedural** script; refused on a YAML crew, a crew directory, a declarative script and `--validate` |
| `orkeon eval run --dataset <json> [--crew <file>] [--offline] [--llm-mock …] [--min-score 0.7]` | scores a dataset with Orkeon's evaluators and writes a JSON report (exit 1 under `--min-score`); with `--crew` the crew runs once per case; `eval bench` and `eval compare` exit 1 on a regression; `orkeon eval rag` replaces `orkeon rag eval`. The workshop's verdicts stay the bench's (`bench.config.json`, the scenarios): nothing here reads an `orkeon eval` report |

A scripted answer of the mock is matched on the prompt text, where the bench's stub matches a scenario's
rules and checks `stub-received`: the two scripts are not interchangeable.

`orkeon-bench run <slug> --level L2` does it all for every `tests/<slug>/component/*.scenario.json`: it
starts the stub, binds **every** mount point — the read-only ones too — to a temporary copy of what the
scenario's dataset holds for it, runs the crew, judges the checks, archives the run and writes the
report in the open attempt. The dataset under `tests/` is never handed to a run; a binding to the
dataset itself (`"."`), to `expected/` or written with a backslash is refused; and the content of the
read-only points is compared before and after the run (the `read-only` check).

**A run on the stub cannot reach another model.** The bench does not pass the team's settings file as it
is: it passes, with `--settings`, a generated copy in the temporary folder of the run
(`.orkeon-bench/appsettings.json`) — the file the run would have read (the team's
`settings/<slug>/appsettings.json`, else the one Orkeon resolves from the crew folder, else nothing) with
its whole `Llm` section replaced by the simulated LLM, for the default provider and for every profile;
everything outside `Llm` is kept (mail accounts, tool options, limits). `orkeon` also gets the caller's
environment minus every variable Orkeon reads an `Llm` section from, whatever its case, and minus
`ORKEON_OPENAI_API_KEY`, and a reply script that calls `image_generation` is refused. The run manifest
says which file was generated and from what (`settings`). What the bench does not hold back: the other
real tools a scripted call reaches (`http_api`, web search, the e-mail tools on a declared account), and
a secret a settings file carries outside `Llm` — keep both out of a component scenario.

**What a green L2 proves.** The criteria `TEAM.md § Acceptance` declares at L2 and a green scenario with
a check covers; the invariants the bench checks on the run archive and a covering scenario names; the
indicators a scenario names in `indicators[]`. A criterion the file does not declare is `not_run`
(`testing/invariants-catalog.md`); a team without a component scenario is **red** at L2, not skipped.
The report is that of the attempt's last run (`process/artefacts.md` § 8). By hand, the stub works with the launcher, and the run gate classifies the run as local
(`127.0.0.0/8`):

```bash
orkeon-bench llm-stub serve --scenario tests/mail-triage/component/ac-01-nominal.scenario.json --port 8765 &
cd teams/mail-triage
ORKEON_Llm__BaseUrl=http://127.0.0.1:8765/v1 ORKEON_Llm__Model=stub-model ORKEON_Llm__ApiKey=stub \
  TEAM_ENV=nominal ./run.sh --events jsonl > /tmp/mail-triage-l2.jsonl
```

In a scenario (`.claude/templates/scenario.json`), `level` is `component` and
`llm_stub` the reply script. The bench runs **the whole crew once** per scenario: `target.task`, which
names a task to isolate as a one-task crew (plan § 6.1), is not served yet, and neither are
`human_inputs`, `judges` and a `json-schema` check — a scenario that uses one of them fails rather than
pass unseen. The checks it judges: `file-exists`, `text-present`, `text-absent`, `matches-expected` (JSON
by value, other text line by line, a file that is not text byte for byte), `tool-called` (`outcome`:
`success` by default, `failure` or `any`), `tool-never-called`, `stub-received`, and on the decision
tasks (D96) `decision-chose` (`task`, `question`, `option`, optional `defaulted`) and `task-skipped` (`task`: an agent's role, or a YAML task's file stem, which the bench resolves to the
role of its agent — the events carry no stem; two tasks of one role cannot be told apart); and, for every
scenario, `run`, `stub` and — when the team has a read-only point — `read-only`. A stub run has no
decision model, so every decision answers its fallback: L2 proves the team works on the fallback,
with `decision-chose` on the fallback's option; `decision-answered` is refused in a component
scenario. The events carry no task key: `task` names a decision task by its role, agent or task id,
or by the decision key the `skipReason` of a task it gates quotes.

## 5. L3 — end to end, local

The whole team on a dataset, with the model of the `machine` profile (or of a named profile whose
`baseUrl` is on a local host). The image configures Ollama for the machine: the model named at the container's
creation (`OLLAMA_DEFAULT_MODEL`, `qwen3:8b` in the examples; none named, no settings file), a context of 8192
tokens, 600 s per call, one request at a time (`OLLAMA_CONTEXT_LENGTH` in the image's Dockerfile, the rest in
`init-orkeon.sh`; details in `orkeon/llm-profiles.md`).
**Check first** that the machine profile is local — it is remote as soon as the base URL `orkeon run`
will see is not on a local host, or an `Llm` section has none (`bench/README.md`, "Is a profile remote?"):

```bash
orkeon-bench profile mail-triage machine        # must say: remote: no
```

The run gate judges the model only. A real model with an e-mail account can send a real message: check
`orkeon email accounts --json` as well (§ 2), and run a team that drafts or sends only against a test
server (`testing/synthetic-data.md` § 11).

**Proves**: the L3 criteria (classification, drafts, deliverables built by the model), the judge
scores at their local thresholds, `INV-IDEMP` (double run), `INV-BUDGET` (real tokens and time),
`INV-INJECTION` **for the local model**. **Misses**: a remote model's quality, cost and
injection behaviour (L4, `testing/local-vs-remote.md`).

A local model is noisy: each e2e scenario runs `repeat` times and passes on `pass_at` of them
(`bench.config.json`, `levels.e2e_local`); a single green run proves nothing.

`orkeon-bench run <slug> --level L3` binds every mount point to a temporary copy of the dataset,
runs `repeat` times, evaluates the checks, the invariants and the indicators, and archives the runs.
The `decision` block of `bench.config.json` (top, or the level's own; `null` turns it off) is laid
over the environment of each L3 and L4 run as `ORKEON_Orkeon__Decision__Provider` and the provider's
`BaseUrl`, `Model`, `ApiKeyEnvVar` — `key_env` is a variable name, never a key, and nothing of it is
written to disk (`orkeon-bench profile <slug> machine --level e2e_local` shows it). There a decision
scenario adds `decision-answered` (`task`: the model answered, not the fallback) and the indicators
`decision_defaulted_rate` (the share, 0 to 1, of decisions answered from the fallback) and
`decision_confidence_min`, `not_run` when no run completed a decision task; `run --no-decision`
makes every decision task answer its fallback, to compare the two. By hand: copy the dataset into a mount set (a dataset has one folder per mount point, so it is
one — `testing/synthetic-data.md`), run, compare with `expected/`, reset the writable folders before
the next repetition.

```bash
mkdir -p mounts.nominal/mail-triage
cp -r tests/mail-triage/datasets/nominal/mailbox mounts.nominal/mail-triage/
(cd teams/mail-triage && TEAM_ENV=nominal ./run.sh --events jsonl) > /tmp/mail-triage-l3-run1.jsonl
diff <(jq -S . mounts.nominal/mail-triage/output/classification.json) \
     <(jq -S . tests/mail-triage/datasets/nominal/expected/output/classification.json)
```

The launcher creates a writable folder that the set lacks; a read-only one must exist. Raw runs belong
in `workbooks/<slug>/runs/`, which only `orkeon-bench` writes: keep hand-made runs out of it.

## 6. L4 — end to end, remote

The same scenarios with a named remote profile of `tests/<slug>/bench.config.json`
(`levels.e2e_remote.profile`, `repeat` 1 by default). It is the only paid level: it runs **on
request, before acceptance**, behind the budget gate — an estimate, the cap
(`budget.remote_usd_max`, 2.00 USD per attempt by default, D2), and the user's explicit approval
recorded in the open attempt as `remote-approval.json` (`{by, at, estimated_usd, cap_usd}`). The run
gate refuses any remote run without it (`.claude/hooks/run-gate.sh`; the rule that decides "remote":
`bench/README.md`, "Is a profile remote?"). Never started by a hook, never inside an automatic loop.

**Proves**: the L4 criteria and remote thresholds, the real cost of a run, the remote model's
behaviour on the adversarial set. **Misses**: reliability, when it ran once.

`orkeon-bench run <slug> --level L4 --profile <name>` serves it, behind `orkeon-bench estimate <slug>`
(the mean tokens of the completed local runs of the L3 scenario of the same id, latest attempt, × the
profile's `price`, plus their mean decision calls × `price_per_call` of the L4 decision block; an L4
scenario without one is refused, named, and so are decision calls bound for a remote decision model
with no `price_per_call`) and the approval. An L3 run whose LLM or decision model is remote (a hosted
decision block, a provider active in the machine's settings) is paid too: `orkeon-bench estimate <slug>
--level L3` prices it, its decision calls from the L3 runs or else the latest L2 runs, and refuses a
decision model no block prices (D104). The approval lives in the open attempt (`orkeon-bench attempt open <slug>`): it is recorded when the user
types the line `/team-run` submitted, `/team-approve remote <usd> <slug>`: the hook `team-approve` has `orkeon-bench attempt approve` write the
marker in the open attempt (D19, D36) — never Claude, on its own initiative or from the shell
(`HARNESS.md`, rule 1).

## 7. What runs where

| Level | `orkeon-bench run <slug> --level …` | By hand |
|---|---|---|
| L0 | `mounts.json` and the reach rule, the crew layout, the launchers and the card against `mounts.json`, `bench.config.json`, the settings file the run would read (strict JSON: no comment, no trailing comma, no key written twice), the scenarios, the generator skill's check script, `orkeon run --validate` (which since rc.7 type-checks a `.ork.ts` itself where `tsc` is installed — `VALIDATION FAILED: type errors`, exit 1; a warning without `tsc`), `tsc` / `dotnet build`, the secret scan. Before any test exists, `orkeon-bench check team <slug>` checks `TEAM.md` on paper (the team gate), and with `--tests` that every test cites a declared id and every criterion has a test at its level | `tsc`, `dotnet build`, `jq`, `grep` for secrets |
| L1 | `npx vitest run` in `tests/<slug>/unit/`, `dotnet test` for each C# tool | the same commands |
| L2 | the component scenarios on the simulated LLM: the criteria declared at L2, the invariants, the indicators | `orkeon-bench llm-stub serve` and the launcher |
| L3 | the end-to-end scenarios on `levels.e2e_local.profile`, `repeat` runs, `pass_at`; judges through `/team-run` and `evaluate --judgements` | `TEAM_ENV=<set> ./run.sh` on a copied dataset, checks by hand |
| L4 | the same on `--profile <name>`, after `estimate` and the approval typed by the user, `/team-approve remote <usd>` | never |

`orkeon-bench run <team> --level L0..L4 [--profile <name>|stub] [--repeat n] [--continue]` binds the
roots to the datasets, injects the profile, runs the levels in order, applies the budget gate, archives
the runs under `workbooks/<slug>/runs/RUN-<yyyymmdd>-<hhmm>-<target>/` and writes `REPORT.md` and
`report.json` in the open attempt. It needs the team folder and an open attempt and stops after a red
level unless `--continue`. Exit codes: `0`; `1` a red level; `2` bad usage, `--level` or `--profile`
given twice, or the attempt closed while the run was in flight (nothing is then written into it); `130` asked to stop —
`orkeon` and its process group are killed, the temporary copy removed, the run folder left with a
manifest whose `status` is `interrupted`, and no report written.

Always pass `--level`: without it the run reaches L4, and the run gate treats the command as remote
(`--level` accepts `L0`…`L4` or `static`…`e2e_remote`; `FROZEN-LITERALS.md` § 3). Profiles per
level: L0 and L1 call no LLM, L2 the stub, L3 `levels.e2e_local.profile` (default `machine`), L4
`levels.e2e_remote.profile`.

## 8. Which level should have caught it

| Symptom in a run | Level that should catch it | Usual gap category |
|---|---|---|
| `Crew configuration references unknown tool(s): x` | L0 (`--validate`) | `tool` |
| an `agent:` or a `dependencies:` entry that names nothing | L0 (`--validate`: `A task reference names nothing`; `check_crew.py`) | `dag` |
| a deduplication key that changes between runs | L1 | `tool` |
| task B does not see the result of task A | L2 | `dag` (missing `dependencies`) |
| a task that ends `success: true` with `endedOnIterationCap` or `deliverableMissing` (1.2.0: `cappedTasks`, `missingDeliverables` on `run.finished`) | L2 or L3, by a check on the flag — the exit code stays 0 | `prompt` or `maxIter` sizing |
| a mail processed twice after a restart | L2 (`INV-RESUME`, `INV-INCR`) | `tool`, or `prompt` when the model keeps the registry |
| `Required parameter '<name>' is missing` in a tool result of a real run | L3 (a scripted call cannot reveal it) | `prompt` (the task names the argument wrong) |
| wrong categories, weak drafts | L3 | `prompt` / `model` |
| passes 1 run in 3 | L3 with repetitions | `flaky` or `model` (`testing/local-vs-remote.md` § 6) |
| an instruction found in a mail is obeyed | L3 (adversarial set) | `prompt` (missing guardrail) |

A failure found at a level higher than the one that should have caught it is also a gap of the
tests: add the missing lower-level test through `/team-decision`, then `/team-tests`.
