# `orkeon-bench`

*English · [Français](../fr/reference/orkeon-bench.md)*

The harness CLI: the typed, tested logic that skills, hooks and you call instead of shell snippets. It
reads a team of the workshop — `teams/<slug>/`, and its workbook and tests in `workbooks/<slug>/` and
`tests/<slug>/` — and answers in text or, with `--json`, in JSON.

```bash
orkeon-bench --help
orkeon-bench <command> --help
```

`<team>` is a slug looked up under `<workshop>/teams/` (`notes-digest`), or a path to a team folder
(anything containing `/` or starting with `.`). The workshop is `$ORKEON_WORKSHOP` — `/workspace` in the
container. A team exists as soon as its folder, its workbook or its tests do: `/team-init` creates
`workbooks/<slug>/` and `tests/<slug>/`, and the team folder comes with the first build batch, so
`status`, `profile`, `check` and `attempt` work from the start; `mounts`, `scaffold`, `run` and `deploy` need
the team folder and its `mounts.json`.

| Exit code | Meaning |
|---|---|
| `0` | done, and what was checked holds |
| `1` | checked, and it does not hold |
| `2` | bad usage or input: unknown team, missing file, malformed JSON, unknown mount set or profile |
| `130` | asked to stop (Ctrl-C, a time limit) |

`run` details its own cases [with it](#run-team---level-ln--the-test-levels).

## `doctor` — is everything in place?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.6.src.20261101.gc727c06
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.6.src.20261101.gc727c06
PASS  orkeon tool catalogue           94 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
WARN  Ollama reachable                http://127.0.0.1:11434/api/tags: ECONNREFUSED (OLLAMA_MODE=off?)
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
PASS  sandboxes left by a killed run  none
Result: OK
```

`stray settings files` fails when Orkeon would find a settings file on its own. An
`appsettings/appsettings.json` or `_shared/appsettings.json` above the teams, in a team folder or in its
`crew/`, or a `crew/appsettings.json`, is read **instead of** the machine's settings for every run that
names no settings file — and Orkeon Studio names none for a team without a settings file of its own,
unless an Expert pins one. (Since Orkeon `main` at
a2bb6c3, a run of the team no longer reads the `appsettings*.json` at the root of its folder; only
`--list-tools`, `orkeon doctor`, `orkeon email`, `orkeon drive` and `orkeon mcp serve` started there still read
`appsettings.json`.) A team's own settings live in
`settings/<slug>/appsettings.json`. `sandboxes left by a killed run` warns, and names them, when a
test run that was killed left its temporary folder behind (a run stopped with Ctrl-C removes its own; a
kill nothing can catch does not, and may leave the team's `orkeon` process too): the bench never removes
them itself, and the next `run` warns as well. A warning does not fail the result. `--quiet` prints nothing unless a
check fails (one line per failure, on stderr) — the form for scripts; `--json` gives every check.

## `status <team>` — where is a team?

Reads `workbooks/<slug>/STATUS.md` and reports its phase (`spec`, `tests`, `build`, `run`, `review`,
`accepted`, `published`), last gate passed (`team`, `tests`, `build`, `review`, or none), iteration (the
number of `ITERATE` verdicts so far), attempt, batch, verdict and next action; an inconsistent status (a
gate ahead of the phase, `accepted` without the `ACCEPTED` verdict…) comes with warnings.

```console
$ orkeon-bench status demo
team: demo (/workspace/teams/demo)
phase: tests
gate_passed: team
iteration: 0
…
```

## `mounts <team> [--env <set>]` — which folders will a run bind?

Prints the mount arguments of `orkeon run`, from `mounts.json`: the team's own folders, or with
`--env <set>` the mount set `mounts.<set>/<slug>/`.

```console
$ orkeon-bench mounts notes-digest
--mount /workspace/teams/notes-digest/notes:/notes:ro /workspace/teams/notes-digest/reports:/reports:rw
$ orkeon-bench mounts notes-digest --env test
--mount /workspace/mounts.test/notes-digest/notes:/notes:ro /workspace/mounts.test/notes-digest/reports:/reports:rw --allow-external-mounts
```

It refuses the same folders as `scaffold` (below), and prints its warnings on stderr as `warning: …`.
Every binding goes under **one** `--mount` flag, so put the target before it, and run the line from the
team folder, against which `orkeon run` decides what is external:
`cd teams/notes-digest && orkeon run crew $(orkeon-bench mounts notes-digest)`. A path holding a `;` or a
`:` other than a drive letter's is quoted, as Orkeon's mount syntax needs (`"/srv/a:b":/notes:ro`).
`--json` adds the folder of the set and the `mounts` of the Studio card.

## `scaffold <team>` — write what follows from `mounts.json`

Writes the launchers `run.sh` (executable) and `run.cmd` (Windows line endings), the `mounts` of
`studio-team.json` (its other keys kept; the card is created if missing), the folders of the mount
points inside the team with a `.gitkeep` in each, and the team's `.gitignore`, which keeps what the team
reads and writes out of git. Run it again after any change of `mounts.json`. The launchers also pass the team's
own settings file, `settings/<slug>/appsettings.json` of the workshop, with `--settings` when it exists and
the command names no other. Studio leaves these launchers as they are — it launches the team from its
card — but its **Change the folders** rewrites the `mounts` of the card: put the change in `mounts.json`
and run `scaffold` again.

```console
$ orkeon-bench scaffold notes-digest
notes-digest: yaml crew, launchers start crew
wrote run.sh, run.cmd, studio-team.json, .gitignore
mounts: ./notes:/notes:ro ./reports:/reports:rw
created notes/ reports/
```

It reads `crew/` as `orkeon run` does: `config.yaml` beside an `agents/` or `tasks/` folder is a YAML
crew, whose folder the launchers start; `crew.ork.ts` is a TypeScript crew, whose script they start. It refuses a
`crew/` holding neither, and a YAML crew beside a `*.ork.ts` or `*.ork.js` file, which `orkeon run`
refuses as ambiguous.

It also refuses a mount point whose folder its agents must never reach: the team folder itself, `crew/`
or a folder named `appsettings` or `_shared` at its root, and outside the team a
folder that holds, or lies inside, what the workshop, the home folder or another team keeps — the full
rule is in [Mount points](../concepts/mount-points.md#what-a-mount-point-may-not-open). A `/plugins`
mount point must be read-only. Any other folder outside the team passes with a warning on stderr: Studio
launches the team only once that folder is declared, spelled exactly, in its Authorized folders.

```console
$ orkeon-bench scaffold notes-digest        # with "default": "." in mounts.json
error: mounts.json: /notes is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as ./notes
```

## `profile <team> <name>` — what would a profile inject, and is it remote?

```console
$ orkeon-bench profile notes-digest machine
profile: machine (machine)
  settings file: /home/node/.config/Orkeon/appsettings.json
  base URL from: /home/node/.config/Orkeon/appsettings.json
  Llm section from: /home/node/.config/Orkeon/appsettings.json
remote: no (localhost: local host)
variables to inject: none (machine settings apply)
```

With a named profile in the settings (`Llm:Profiles:claude` with a remote `BaseUrl`), the run counts as
remote even though the default model is local, since any agent of the crew may name the profile:

```console
  named profile claude: api.anthropic.com: host is not local, remote
remote: yes (api.anthropic.com: host is not local, named profile claude)
warning: the named profile Llm:Profiles:claude is remote (api.anthropic.com): any agent of the crew may name it, so the run counts as remote
```

`machine` uses what Orkeon would read for a run of the team through its launchers or the bench (Studio
passes the team's settings file too, else reads its own): the `ORKEON_Llm__*` variables, the
team's `settings/<slug>/appsettings.json` (else a settings file next to the crew or in an `appsettings/`
— or legacy `_shared/` — folder above it, else the container's `~/.config/Orkeon/appsettings.json`), then
the `Llm__*` variables. `stub` is the simulated model (`llm-stub serve`, which `run` starts by itself at L2); other names come from `tests/<slug>/bench.config.json`, where a remote profile also carries its `price` (`input_per_million`, `output_per_million`) for `estimate` and the cost of an L4 run. Secrets
are never printed — only variable names. A profile is remote unless its base URL is on a local host
(`localhost`, `::1`, `0.0.0.0`, `127.0.0.0/8`, `host.docker.internal`, or a host listed in
`HARNESS_LOCAL_LLM_HOSTS`); a configuration
without a base URL is remote too, since Orkeon then picks a hosted provider itself. Every named profile
of the settings (`Llm:Profiles:<id>`) is judged the same way, and the run is remote when one of them is.
The stub and a named bench profile are injected over the default model and over every named profile. A
run that would call a decision provider — TypeSafe, Liquid or Kev, named by `Orkeon:Decision:Provider`, or
TypeSafe or Liquid deduced from its section in any layer or its `TYPESAFE_API_KEY` or `LIQUID_API_KEY`
variable — is remote too unless that provider's `BaseUrl` is on a local host, and so is a configuration
Orkeon would refuse (`remote_reason`: `decision-model`, with `decision_model` in the JSON): its decision tasks, its
`system_one_decide` tool and its input guard call it, and `--no-decision` stops only the decision tasks.
A named bench profile keeps the machine's decision model unless `bench.config.json` states a `decision`
block for the level (see `run`); the stub run carries none. `--level <level>` judges the profile with that
level's block (`decision_block` and `decision_variables` in the JSON: `key_env` is a variable name, never a
key). The run gate applies the same rule.

## `report validate <file>` — is a report sound?

Checks a `report.json` against its schema (version 1.0) and the verdict rule — accepted ⇔ every
acceptance criterion passes at its level, every invariant holds, every indicator is in range.

```bash
orkeon-bench report validate workbooks/notes-digest/attempts/ATT-0001/report.json
```

## `check team <team> [--tests]` — is `TEAM.md` sound on paper?

One check reads the workbook of a team before you are asked to validate it. It writes nothing, costs
nothing, and holds what a script can decide — the shape of the document — so that your validation is
about its content.

```bash
orkeon-bench check team mail-triage            # before /team-approve team
orkeon-bench check team mail-triage --tests    # after /team-tests: the traceability of the tests
```

It reads `workbooks/<slug>/TEAM.md` and `tests/<slug>/bench.config.json`: the four sections `## Need`,
`## Acceptance`, `## Design`, `## Plan` and their headings, in order; every criterion has an identifier
of its own, a dataset the acceptance lists, an outcome and a test level; every indicator a numeric
threshold and a direction (`>=` or `<=`); the invariants every team needs are there; the budget is the
configuration's, and every model profile named exists in it; every tool an agent holds exists in the
installed Orkeon (`orkeon run --list-tools`), no agent both reads mail and sends it, a task depends on
every task whose result it reads, every deliverable lies under a writable mount point, every criterion is
covered by a batch, every batch has its sheet (`### B<n>`, its parts in order, its steps and their
anchors — the files each step creates). With `--tests`, it also checks that every test of `tests/<slug>/`
cites a declared id, that every active criterion and every invariant has a test at its level, and that
the scenarios parse.

````console
$ orkeon-bench check team mail-triage
check team: mail-triage — FAIL (2 errors, 1 warning)
  error   TEAM.md § Design § Agents — agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `### Tools`)
  error   TEAM.md § Plan § Batches — `AC-02` is covered by no batch
  warning TEAM.md § Design § Tasks and DAG — no ```mermaid block: the diagram is drawn from the table
````

An **error** must be fixed before the approval is asked for; a **warning** is fixed or explained; a line
`skipped` names a check that could not be made — the tool names, without `orkeon` — and is then done by
hand. Exit code `0` without an error, `1` with one, `2` when `TEAM.md` does not exist yet (`TEAM.md not
found: <path> — /team-init writes it`). `--json` gives each finding with its code. `/team-spec` and
`/team-tests` run this check themselves before they hand over. The codes are listed in the bench's
[README](../../.devcontainer/bench/README.md#checks-of-the-workbook).

## `deploy <team>` — the team as an archive, for another workshop

```bash
orkeon-bench deploy notes-digest --with-settings              # deployments/notes-digest-20261010.zip
orkeon-bench deploy notes-digest --without-settings --format tar.gz
```

Writes `deployments/<slug>-<yyyymmdd>.zip` (UTC; `-2`, `-3`… for a second archive of the day) at the
root of the workshop — or `.tar.gz` with `--format tar.gz`, or in another folder with `--into <folder>`.
The archive holds the team **as Orkeon Studio runs it**, under `teams/<slug>/`: `crew/`, `mounts.json`,
the card, the launchers, the README, `tsconfig.json` and `typings/` for a TypeScript crew, and the
folder of every mount point reduced to its `.gitkeep` — the data a team reads, writes and keeps stays
in the workshop, like `node_modules/`, `bin/` and `obj/`. When the team has its own settings file,
`settings/<slug>/appsettings.json`, you say whether it goes in: `--with-settings` lays it beside the team,
`--without-settings` leaves it out, and without either the command stops and asks. The archive unpacks
at the root of a workshop (`~/Orkeon`, `%USERPROFILE%\Orkeon`): the team lands in Studio's catalogue and
its launchers find their settings two levels up, exactly as here; `run.sh` comes out executable from
`unzip` and from every Unix unpacker of a `.tar.gz`. The archive's comment — the zip's, or a pax header
of the tar — says what it holds: team, date, Orkeon and bench versions, whether the settings are in.

```console
$ orkeon-bench deploy notes-digest --with-settings
notes-digest: /workspace/deployments/notes-digest-20261010.zip (12 files, 6.8 KB)
settings: included (settings/notes-digest/appsettings.json)
left out: the data of notes/ (14), reports/ (3)
unzip it at the root of a workshop (~/Orkeon): teams/notes-digest/ lands in Studio's catalogue, and its launchers find the settings beside it
```

Refused, with exit code `2` and nothing written: a team folder holding a settings file Orkeon would read
(`appsettings*.json` at its root or in `crew/`, an `appsettings/` or `_shared/` folder) or a `.env`; a
settings file that holds a secret — a key, a password, a token with a value — since a deployment never
carries one: name the variable that holds it (`ApiKeyEnvVar`) instead. A missing launcher or card is a
warning: run `scaffold` first. `/deploy` runs this command after `./run.sh --validate`, and puts the one
question — the settings — to you.

## `tools dump` — the real schema of every tool

Records the schema of every tool of `orkeon run --list-tools`, exactly as `orkeon run` sends it to the
model: a throw-away crew whose single agent lists all the tools runs once against a local recorder that
answers `OK` — no model is called, nothing is paid. It prints a Markdown table (required arguments in
bold), or with `--json` the entries as sent. Exit 1 when a listed tool never reached the model.

Orkeon lists the `email_*` and `drive_*` tools to an agent only with a ready account, so the throw-away
run declares a probe mailbox and a probe OneDrive account of its own — unreachable local endpoints, a
placeholder token file in the run's temporary folder, removed with it — and drops the caller's
`Orkeon__Tools__Email__*` and `Orkeon__Tools__Drive__*` variables: no account is contacted. The decision
variables are dropped too, so `system_one_decide`, registered only beside an active decision provider, is
not listed — 110 tools at Orkeon c727c06.

```console
$ orkeon-bench tools dump | head -n 4
| Tool | Arguments | What it does |
|---|---|---|
| `arcadedb_query` | **`bolt_uri`**, **`database`**, `username`, `password`, **`query`**, `parameters`, `query_language`, `max_results` | Execute Cypher or SQL queries on ArcadeDB via Bolt protocol |
| `cache_search` | **`query`**, `source`, `url_filter`, `top_k`, `min_score` | Semantic search over content previously stored in the RAG cache … |
```

Run it after a change of Orkeon version: § 5 of `references/orkeon/orkeon-reference.md` was generated
this way, regenerated for Orkeon `main` at ce9ec1f, kept at c39c5fa, which changes no source file, at ad6dc63, which changes the schema of five event-bus tools but no name, description or argument, at 5668c54, which changes no tool, at f59446b, which changes none either, at 13461ea, which adds the eleven `drive_*` tools, at 63be532, which changes none, at e258730, which changes none either (only the access the web and RAG tools declare to the scripting permission gate), and at acd59d6, which changes none (a new verb, `orkeon quickstart`, nothing under `src/tools/`) — their rows are written from the sources until the dump is regenerated (the image build compares it with `orkeon run --list-tools`). A tool whose schema reaches the model empty shows
`none in the schema`.

## `attempt` — open, close, and the approval of a paid run

An **attempt** is one try at making the team pass: `workbooks/<slug>/attempts/ATT-nnnn/`, which only the
bench writes. It holds a manifest, a snapshot of the design (`crew/` and `mounts.json`), the report of its
last run and, when you approved one, the approval of a paid run.

```console
$ orkeon-bench attempt open notes-digest
notes-digest: opened ATT-0001 (/workspace/workbooks/notes-digest/attempts/ATT-0001)
$ orkeon-bench attempt close notes-digest --verdict ITERATE
notes-digest: closed ATT-0001 (ITERATE)
```

- `attempt open <team> [--by <skill>]` needs the workbook, not the team folder: it can open before the
  first build. The snapshot of the design is taken when the attempt opens and again at **every** `run`,
  so it is always the design the last run measured. One attempt is open at a time: of two `attempt open`
  started together, one opens it and the other is told so.
- `attempt close <team> [--verdict ACCEPTED|ITERATE|BLOCKED]` closes it; a closed attempt never changes.
  `--verdict ACCEPTED` is refused unless the attempt holds a report that accepts:

  ```console
  $ orkeon-bench attempt close notes-digest --verdict ACCEPTED
  error: ATT-0001 cannot be closed ACCEPTED: its report does not accept — all_ac_pass=false all_inv_pass=false indicators_in_range=true
  ```

  It also closes, as abandoned, an attempt folder left without a manifest by an interrupted command, and
  one whose manifest cannot be read (the unreadable file is kept as `manifest.broken.json`). A plain
  file named `ATT-nnnn` in `attempts/` stops every command, which says so: move it away.
- `attempt approve <team> --usd <amount>` writes the approval of a paid run, `remote-approval.json`. You
  do not call it: you type `/team-approve remote <slug> <usd>` in Claude Code, after `/team-run` priced
  the run with `estimate`, and a hook calls it with what you typed ([Models](../guides/models.md#the-approval-of-paid-runs)). It refuses an amount above the cap
  `budget.remote_usd_max` of `tests/<slug>/bench.config.json`, and a team without a stated cap:

```console
$ orkeon-bench attempt approve notes-digest --usd 5
error: 5 USD is above the cap of 2 USD (budget.remote_usd_max of bench.config.json): raise the cap with a decision first, or approve a lower amount
```

## `llm-stub serve` — the simulated model

```bash
orkeon-bench llm-stub serve --scenario tests/notes-digest/component/ac-01-digest-written.scenario.json
```

Serves a **reply script** on `127.0.0.1` until Ctrl-C: for each agent, the answers the "model" gives in
order — a final text, or tool calls, which `orkeon run` then executes with the **real** tools. It prints
where it listens and the three variables to export (`ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model=stub-model`,
`ORKEON_Llm__ApiKey=stub`); `--port` fixes the port (any but 11434, Ollama's), `--log <file>` appends every
exchange to a file.
`--scenario` takes a scenario file (its `llm_stub`) or a reply script alone. When it stops it says how
many requests it received and what went wrong — a request no rule answers, a tool call the tool would
refuse, a request dropped mid-way. No model is called, nothing is paid.

## `run <team> [--level L<n>]` — the test levels

Runs the test levels in order, in the team's open attempt, up to the level you name — or, without
`--level`, up to the highest one `tests/<slug>/bench.config.json` declares (`e2e_remote` → L4,
`e2e_local` → L3, else L2). It stops at the first red level.

```console
$ orkeon-bench run notes-digest --level L3
notes-digest: ATT-0001
L0 static: pass
L1 unit: skipped (skipped: no tests/notes-digest/unit folder)
L2 component: pass
L3 e2e local: pass (pass@k 2/3)
verdict input: all_ac_pass=true all_inv_pass=true indicators_in_range=true
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
runs: RUN-20261030-1843-stub RUN-20261030-1851-machine …
```

| Level | What runs |
|---|---|
| L0 static | `mounts.json` and the folders its mount points may reach, the layout of `crew/`, the launchers and the card against `mounts.json`, `bench.config.json`, the settings file the run would read (it must be strict JSON: no comment, no trailing comma, no key written twice — the message names the file and the line), the scenarios (each one parses, has a check for what it claims to prove, and lies where a run picks it up), the generator skill's check script, `orkeon run --validate` |
| L1 unit | `npx vitest run tests/<slug>/unit --reporter json` from the workshop root (vitest is in the image); `skipped` when the team has no `tests/<slug>/unit/` folder, with a warning when `vitest` cannot be found |
| L2 component | every `tests/<slug>/component/*.scenario.json`, on the simulated model: the whole crew runs once per scenario, **every** mount point — the read-only ones too — bound to a temporary copy of the scenario's dataset; then the scenario's checks are judged — a file exists, a text is present or absent, a file matches the expected one, a JSON file matches a schema, a tool was or was not called, an agent received a text, the read-only folders are unchanged. A dataset holds plain files and folders only: a symbolic link in it fails the scenario, and one a run leaves is neither followed nor archived. A team without any scenario is **red** at this level, not skipped |
| L3 end to end, local | every `tests/<slug>/e2e/*.scenario.json` of level `L3`, on the profile of `levels.e2e_local` (`machine` by default, or `--profile <name>`), each repeated `repeat` times; the level passes when at least `pass_at` runs of each scenario pass, and the report records `pass_at_k` as `k/n`. A scenario with a `sequence` runs its steps in the same sandbox, kills the team after the task it names and starts it again, then judges its checks |
| L4 end to end, remote | the `L4` scenarios on the profile of `levels.e2e_remote`; refused without `remote-approval.json` in the open attempt (`remote level needs an approval: run orkeon-bench attempt approve <team> first`); the cost is read from the `cost.updated` events of each run and priced with `profiles.<name>.price` (`input_per_million`, `output_per_million`), printed as `cost: <usd> USD (cap <cap>)` and kept in the report |

Each scenario leaves a run under `workbooks/<slug>/runs/RUN-<date>-<time>-<profile>/` — the event stream,
the logs, the exchanges with the model, a snapshot of what was written, a manifest with its tokens, cost,
iteration and steps — and the attempt receives `report.json` and `REPORT.md`.

**The decision model of a level (D96).** `tests/<slug>/bench.config.json` may take a `decision` block, at
the top — for L3 and L4 — or under `levels.e2e_local` or `levels.e2e_remote`, which overrides it; `null`
at a level injects nothing there. L0, L1 and L2 never take one.

```json
"decision": { "provider": "kev", "base_url": "http://127.0.0.1:8009/v1", "model": "kev-latest", "key_env": "KEV_API_KEY", "price_per_call": 0.002 }
```

`provider` is `typesafe`, `liquid` or `kev`; `base_url`, `model`, `key_env` and `price_per_call` (USD, for
`estimate`) are optional, and any other key is refused. `key_env` is the **name** of the variable that
holds the key: a value that looks like a key is refused, as `keyEnv` of profiles is. The bench injects
`ORKEON_Orkeon__Decision__Provider` and `ORKEON_Orkeon__<TypeSafe|Liquid|Kev>__BaseUrl`, `__Model` and
`__ApiKeyEnvVar` into the environment of each run of the level — never into a file, never into a run on
the simulated model — and the run is remote when the injected provider's endpoint is not local. `run
--no-decision` passes `--no-decision` to every `orkeon run`: the decision tasks answer from their
fallback, while `system_one_decide` and the input guard still call the decision model. The manifest of
each run records its `decision_calls`.

Three checks read the decision tasks from the event stream: `decision-answered` (`task`) — the decision
model answered, not the fallback (`defaulted`); `decision-chose` (`task`, `question`, `option`); and
`task-skipped` (`task`) — a task its condition left out. The events carry no task key, so `task` names a
decision task by its role, agent or task id, or by the key that the `skipReason` of a task it gates
quotes. `decision-answered` is refused in an L2 scenario: on the simulated model a decision always
answers from its fallback, which `decision-chose` checks.

**What the report proves.** A criterion passes when `TEAM.md` declares it at a level the bench ran and a
green scenario of that level covers it; otherwise it stays `not_run`, and `REPORT.md` says why under
"Not run, so not proven:". A row whose status starts with `dropped` is left out of the report; a scenario
that still covers it gets a warning. An **invariant** is evaluated by the bench from the runs that cover
it — `INV-FS` from the digests of the read-only folders, `INV-SECRETS` from the outputs and events,
`INV-TOOLS` from the tool calls against the crew's declarations, `INV-SCHEMA` from the schema checks,
`INV-EMAIL` from the absence of `email_send`, `INV-BUDGET` from the tokens and cost, `INV-INJECTION` from
the adversarial datasets, `INV-IDEMP`, `INV-RESUME` and `INV-INCR` from the scenarios with a `sequence`;
one that no scenario covers is `not run: no scenario covers this invariant`. An **indicator** is the mean
of the measure the scenarios declare for it (`duration_seconds`, `tokens_total`, `usd`, `tool_calls`,
`human_inputs`, `pass_rate`, `decision_defaulted_rate` — the share, 0 to 1, of decision tasks answered
from their fallback —, `decision_confidence_min` — the lowest confidence of their answers —, or
`judge:J-<n>`, filled by `evaluate`), against the threshold of the acceptance table; the two decision
measures count only the runs that completed a decision task, and are `not_run` without one. The report's
`cost` then adds `decision_tasks`, `decision_defaulted` and `decision_confidence_min`, and `REPORT.md` a
line for them. **A judge out of range blocks the verdict (D97):** `indicators_in_range` is true only when
every indicator and every judge of `report.judges` is within its threshold.

**The report of an attempt is that of its last run.** A later run replaces it, whatever level it
reaches: `REPORT.md` says what was asked for and what it replaces, and the bench warns when a lower run
replaces a higher one —

```console
$ orkeon-bench run notes-digest --level L0
…
warning: this run reached L0 and replaces the report of 2026-10-06T21:43:44.176Z, which reached L2: the report of an attempt is that of its last run — its evidence stays in /workspace/workbooks/notes-digest/runs/RUN-20261006-2143-stub
```

**A run on the simulated model cannot reach another model.** The bench does not hand Orkeon the team's
settings file as it is: it generates a copy in the temporary folder of the run and passes that one — the
file the run would have read (the team's `settings/<slug>/appsettings.json`, else the machine's), with
its model settings replaced by the simulated model for the default and for every named profile, and
everything else kept (a mailbox, tool options, limits). It also removes from the run's environment every
variable Orkeon reads its model settings from. It does not hold back the other real tools a script calls
(an HTTP call, a web search, a mailbox the team's settings declare) nor a secret a settings file carries
outside its model settings. A run on a named profile injects that profile's variables the same way, the
key read from the environment variable `keyEnv` names, never from a file.

It needs the team folder and an open attempt (`attempt open`), and stops after a red L0 unless
`--continue`. A scenario that targets one task alone, or answers to a person, is not served: it runs and
**fails** rather than pass unchecked.

| Exit code of `run` | Meaning |
|---|---|
| `0` | no level is red |
| `1` | a level is red — L2 without a scenario included |
| `2` | bad usage, `--level` or `--profile` given twice, a remote level without approval, or the attempt was closed while the run was in flight: nothing is then written into it |
| `130` | asked to stop (Ctrl-C, a time limit): the team's processes are killed, the temporary copy removed, the run kept with `status: interrupted` in its manifest, and no report written |

## `evaluate <team> --judgements <file>` — the judges' scores into the report

`/team-run` has a Claude subagent grade each output a scenario names a judge for, against the rubric of
`tests/<slug>/judges/`, and assembles the scores in a file
(`{"judgements": [{judge, rubric_version, output, score, justification, quotes}]}`). `evaluate` copies
it into the open attempt as `judgements.json`, fills `report.judges` and the indicators of the form
`judge:J-<n>`, and rewrites `report.json` and `REPORT.md`:

```console
$ orkeon-bench evaluate notes-digest --judgements /tmp/notes-digest-judgements.json
notes-digest: ATT-0001
judges: J-1=0.82 (>= 0.7) pass
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
```

Successive calls add up, judge by judge: a judge the file grades replaces its earlier grades, the others
the report already holds stay, in `judgements.json` and `report.judges` alike. A run that rewrites the
report starts it with no judge, and the grades of the report it replaced go with it. A judge whose
threshold is an indicator's id (`IND-<n>`) takes that indicator's direction too: under `<=` it passes at
or below the threshold (`J-3=0.5 (<= 1)`). Exit `1` when a judge of the merged set is out of range — `indicators_in_range` is then false, and the
verdict blocked (D97);
`--json` gives each judge's score, threshold, direction and status and the verdict input.

## `estimate <team> [--profile <name>]` — what would a remote run cost?

Before any paid run, prices the L4 scenarios on a remote profile, with the profile's `price`, times
`repeat`, times a safety factor of 1.3. An L4 scenario runs the L3 scenario of the same id on the remote
profile: it is priced from the mean tokens of that L3 scenario's runs on the local profile
(`runs/RUN-*-<local profile>/`), counting only the completed ones (`pass` or `fail`, tokens counted) of
the latest attempt they belong to:

```console
$ orkeon-bench estimate notes-digest
estimate: 0.84 USD for 4 scenario(s) × 1 on claude (claude-sonnet-5-5) — cap 2 USD
```

Exit `1` above the cap `budget.remote_usd_max`; `2` without that cap written in `bench.config.json` (as
`attempt approve`, no default stands in for it), without a local run to price from (`no local e2e run
archived yet: run orkeon-bench run <team> --level L3 first`), with an L4 scenario no completed L3 run of
the same id prices (named, never guessed from the others), or a profile without a `price`.

The decision model is priced too (D96): the mean decision calls per pass of the local runs — their
decision tasks, answered or defaulted, and their `system_one_decide` calls, from `decision_calls` of the
manifest or else the events; the input guard's are not seen — times `price_per_call` of the L4 level's
`decision` block (`decision_calls`, `decision_price_per_call` and `decision_usd` in the JSON). Exit `2` when
those calls would reach a remote decision model and no `price_per_call` is stated; a local one costs
nothing. `/team-run`
puts the amount in `next_action: /team-approve remote <slug> <usd>`, and your line records the approval.

## `capture <team>` — what the reviewer reads

Writes `attempts/ATT-nnnn/capture.md` in the open attempt: the status, the diff of `crew/` against the
design snapshot of the previous attempt (capped at 1200 lines), `REPORT.md`, the errors and failed tasks
of the runs the report cites, and the first and last twenty lines of their `stderr`. `/team-review` hands
that file to the `team-reviewer` subagent instead of the archive.

## `release <team>` — the accepted team made durable

Refuses without a closed attempt with `verdict: ACCEPTED`, or when `crew/` or `mounts.json` differs from
the design snapshot of that attempt. Then runs `scaffold` again, keeps `retention.runs_keep` runs plus
those a report cites (its scenarios' runs and those of the report it replaced) or an attempt manifest
lists, moves the others to `archive/runs/<slug>/`, and prints the version and the tag command, which
stays yours to type:

```console
$ orkeon-bench release notes-digest
notes-digest: release v1 ready
runs kept: RUN-20261030-1851-machine …
runs archived: 6 → archive/runs/notes-digest/
tag: git tag team/notes-digest/v1 && git push origin team/notes-digest/v1
```

Exit `1`, with nothing moved or written, when a `report.json` of an attempt cannot be read: the runs it
cites cannot be told from the others. Each such report is named; repair or remove it
(`report validate <file>`), then release again.

The files the bench reads (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) and its
architecture are described in its [README](../../.devcontainer/bench/README.md).
