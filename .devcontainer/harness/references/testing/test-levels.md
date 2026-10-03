# Test levels — what each level proves, when it runs, what it costs

> Reference document of the Orkeon harness (the workshop's `references/testing/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: Orkeon `src/tools/Orkeon.Tools.Abstractions/Base/ToolBase.cs` and `ToolParameterValidator.cs`,
> `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `src/core/Orkeon.Application/Crew/Execution/ConversationPolicy.cs`,
> `src/core/Orkeon.Infrastructure/LLMs/LlmProviderFactory.cs` and `Base/OpenAICompatibleProviderBase.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/RunCommand.cs` and `EmailCommand.cs`, `src/constants/Orkeon.Constants.Cli/RunOptionNames.cs`,
> `src/tools/Orkeon.Tools.Email/` (`Dtos/EmailReadingDtos.cs`, `Accounts/EmailAccountRegistry.cs`,
> `DependencyInjection/EmailToolsServiceCollectionExtensions.cs`), `CHANGELOG.md` `[Unreleased]`; harness
> `VERIFICATIONS.md` (V-02, V-04, V-05, V-06 — checked on 1.0.0-rc.4; the code they rely on is unchanged at
> `main` unless said; re-run on the `main` binary `orkeon-workshop:main-probe` on 2026-10-02 with a stub LLM),
> `FROZEN-LITERALS.md` § 3 and § 6, `.claude/templates/` (`scenario.json`, `bench.config.json`,
> `report.schema.json`), `.claude/rules/team-tests.md`, `bench/README.md`, `.claude/hooks/run-gate.sh`;
> the harness plan § 6.1–6.4 and § 7.5.

The summary table and the place of the levels in the loop are in `references/process/workflow.md` § 7.
This document says, level by level, what a green result proves and what it does not, how to run the
level today, and what `orkeon-bench run` (lot 4) will automate. Which level an acceptance criterion is
attached to: `testing/acceptance-criteria.md`. Repetitions, `pass@k` and remote runs:
`testing/local-vs-remote.md`.

## 1. The chain

| Level | Key in `report.json` | Folder of `tests/<slug>/` | LLM | A green level proves | It never proves |
|---|---|---|---|---|---|
| L0 static | `static` | `static/` | none | the definition loads, every tool resolves, keys and layout are right | that anything works at run time |
| L1 unit | `unit` | `unit/` (TS); C# tools in their own project | none | the custom tools compute the right thing | that an agent calls them correctly |
| L2 component | `component` | `component/` | simulated (`stub`) | the wiring: order, context passing, real tool calls, deliverables, state across runs | that a real model makes those calls |
| L3 e2e local | `e2e_local` | `e2e/` | local (`machine`, or a named profile on a local host) | the whole team meets its L3 criteria with a small model | production quality, production cost |
| L4 e2e remote | `e2e_remote` | `e2e/` | remote (a named profile) | the team meets its L4 criteria with the production model | reliability, unless repeated |

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
5. **The verdict** needs every AC `pass` at a level that ran, every INV `pass`, every IND in range
   (`bench/src/domain/verdict.ts`); a report without any AC is never accepted.

## 2. L0 — static

**Proves**: the crew loads with strict tool resolution (an unknown tool name fails the load), the
keys `--validate` lets through silently are right (unknown keys, an `agent:` or a `dependencies:`
entry naming nothing — `orkeon/orkeon-reference.md` § 9), every deliverable lies under a writable
mount point, `mounts.json`, the Studio card and the launchers agree, the TypeScript types check, the
C# compiles, the JSON files parse, no key is written in the team.
**Misses**: everything that happens at run time — a tool argument spelled wrong in a task
description, a prompt that leads nowhere, a schema the model will not follow.

Today, from the workshop root:

```bash
# YAML crew
python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py teams/mail-triage --orkeon "$(command -v orkeon)"
# TypeScript crew: check_team.py, then the types (typings copied into teams/<slug>/typings/ by the skill)
python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py teams/doc-synthesis --orkeon "$(command -v orkeon)"
tsc -p teams/doc-synthesis
# Real load, from the team folder (V-02): prints VALIDATION OK: <path>/crew (agents=N, tasks=M, tools resolved=K)
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
their embedded copy: use it whenever the binary is there.

## 3. L1 — unit

**Proves**: each deterministic tool returns the right result on its edge cases — parsing, a
deduplication key, a business rule, a score. **Misses**: whether the agent calls the tool, with which
arguments, and what it does with the result (L2, L3).

- **TypeScript tools**: the pure domain `crew/tools/<name>/domain.ts` is tested with vitest under
  Node, using no Node API, because the same code runs in Jint (`.claude/rules/orkeon-ts.md`). Tests
  live in `tests/<slug>/unit/`. vitest is **not** installed as a command in the image: `npx vitest run`
  fetches it from `registry.npmjs.org`, which the image firewall allows.
- **C# tools**: their tests stay in their own project (`dotnet test` in the tool folder), with the
  test framework of the Orkeon repository (`csharp/orkeon-guidelines.md`).
- A unit test names the id it serves in its title: `it('INV-INCR: the key is the Message-ID, not the file name', …)`.

## 4. L2 — component, with the simulated LLM

The simulated LLM is an OpenAI-compatible HTTP server on `127.0.0.1:<port>` (never `11434`), selected
with `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1`, `ORKEON_Llm__Model=stub-model`,
`ORKEON_Llm__ApiKey=stub` (V-04). Orkeon then infers its `openai` provider and posts
`/v1/chat/completions` with `model`, `messages`, `tools`, `tool_choice`, `temperature`,
`max_completion_tokens`. The stub answers from a script: a final text, or `tool_calls` that Orkeon
executes with the **real** tool, whose result comes back in the next request as a `role: tool` message.

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
- **Results are cut at 4000 characters** before they reach the model (32 000 for `file_read`), with a
  `[... truncated, N chars omitted …]` note (`AgentDefaults`, `ConversationPolicy.TruncateToolResult`):
  the stub receives the cut result — a 200-row CSV read by `csv_reader` came back as 4086 characters —
  so a scenario can check what the agent really saw.
- **E-mail tools are always listed**, account or not (13 of the 80 tools of `--list-tools` at `main`). A
  call with no account declared fails cleanly (`No e-mail account is configured. Declare one under
  Orkeon:Tools:Email:Accounts …`) and the run goes on; with an account, the call reaches its
  server — the settings a test resolves declare none, or one on a test server of the machine
  (`testing/synthetic-data.md` § 11).
- **The scripted model never corrects itself**: a wrong call stays wrong. L2 proves the wiring the
  script describes, nothing more.

Today the stub is not shipped: lot 0 verified the set-up with a forty-line Python server (V-04), and
`orkeon-bench llm-stub serve --scenario <file>` (with `record` and `replay`: a successful local run,
logged with `--llm-log`, replayed without a model) arrives in lot 4. A hand-made stub works with the
launcher, and the run gate classifies the run as local (`127.0.0.0/8`):

```bash
cd teams/mail-triage
ORKEON_Llm__BaseUrl=http://127.0.0.1:8765/v1 ORKEON_Llm__Model=stub-model ORKEON_Llm__ApiKey=stub \
  TEAM_ENV=nominal ./run.sh --events jsonl > /tmp/mail-triage-l2.jsonl
```

In a scenario (`.claude/templates/scenario.json`, provisional until lot 5), `level` is `component`,
`target.task` names the task isolated as a one-task crew (plan § 6.1) and `llm_stub` the reply script.

## 5. L3 — end to end, local

The whole team on a dataset, with the model of the `machine` profile (or of a named profile whose
`baseUrl` is on a local host). The image configures Ollama for the machine: `qwen3:8b`, a context of
8192 tokens, 600 s per call, one request at a time (`OLLAMA_DEFAULT_MODEL` and `OLLAMA_CONTEXT_LENGTH`
in the image's Dockerfile, the rest in `init-orkeon.sh`; details in `orkeon/llm-profiles.md`).
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
`INV-INJECTION` **for the local model**. **Misses**: the production model's quality, cost and
injection behaviour (L4, `testing/local-vs-remote.md`).

A local model is noisy: each e2e scenario runs `repeat` times and passes on `pass_at` of them
(`bench.config.json`, `levels.e2e_local`); a single green run proves nothing.

Today, by hand: copy the dataset into a mount set (a dataset has one folder per mount point, so it is
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

**Proves**: the L4 criteria and remote thresholds, the real cost of a run, the production model's
behaviour on the adversarial set. **Misses**: reliability, when it ran once.

Today: no `attempt` command (lot 4), no `estimate` (lot 9). The approval is recorded when the user
types `/team-approve remote <usd>`: a `UserPromptSubmit` hook has `orkeon-bench` write the marker in the
open attempt (lot 2, D36); until that hook ships, the marker is written from the shell in the open
attempt, quoting the user's yes — never on Claude's own initiative (`HARNESS.md`, rule 1).

## 7. What runs where, today and planned

| Level | Run today (by hand) | Planned (`orkeon-bench`) |
|---|---|---|
| L0 | check scripts, `./run.sh --validate`, `tsc`, `dotnet build`, `jq`, `grep` | `run --level L0` (lot 4); `check design` (lot 3) |
| L1 | `npx vitest run`, `dotnet test` | `run --level L1` (lot 4) |
| L2 | a hand-made stub + `ORKEON_Llm__*` + `./run.sh` | `llm-stub serve\|record\|replay`, `run --level L2` (lot 4) |
| L3 | `TEAM_ENV=<set> ./run.sh` on a copied dataset, checks by hand | `run --level L3`, `datasets build`, `evaluate` (lot 4) |
| L4 | not before an attempt exists; approval from the shell | `run --level L4 --profile <name>`, `estimate` (lot 9) |

The planned synopsis (plan § 7.5): `orkeon-bench run <team> --level L0..L4 [--profile <name>|stub]
[--repeat n]` binds the roots to the datasets, injects the profile, runs the levels in order, applies
the budget gate, archives the runs under `workbooks/<slug>/runs/RUN-<yyyymmdd>-<hhmm>-<target>/` and
writes `REPORT.md` and `report.json` in the open attempt. Until then, `run` exits `3`.

Always pass `--level`: without it the run reaches L4, and the run gate treats the command as remote
(`--level` accepts `L0`…`L4` or `static`…`e2e_remote`; `FROZEN-LITERALS.md` § 3). Profiles per
level: L0 and L1 call no LLM, L2 the stub, L3 `levels.e2e_local.profile` (default `machine`), L4
`levels.e2e_remote.profile`.

## 8. Which level should have caught it

| Symptom in a run | Level that should catch it | Usual gap category |
|---|---|---|
| `Crew configuration references unknown tool(s): x` | L0 (`--validate`) | `tool` |
| an `agent:` or a `dependencies:` entry that names nothing | L0 (`check_crew.py`; `--validate` lets it through) | `dag` |
| a deduplication key that changes between runs | L1 | `tool` |
| task B does not see the result of task A | L2 | `dag` (missing `dependencies`) |
| a mail processed twice after a restart | L2 (`INV-RESUME`, `INV-INCR`) | `tool`, or `prompt` when the model keeps the registry |
| `Required parameter '<name>' is missing` in a tool result of a real run | L3 (a scripted call cannot reveal it) | `prompt` (the task names the argument wrong) |
| wrong categories, weak drafts | L3 | `prompt` / `model` |
| passes 1 run in 3 | L3 with repetitions | `flaky` or `model` (`testing/local-vs-remote.md` § 6) |
| an instruction found in a mail is obeyed | L3 (adversarial set) | `prompt` (missing guardrail) |

A failure found at a level higher than the one that should have caught it is also a gap of the
tests: add the missing lower-level test through `/team-decision`, then `/team-tests`.
