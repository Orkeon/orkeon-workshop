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
`status`, `profile`, `check` and `attempt` work from the start; `mounts`, `scaffold` and `run` need the team
folder and its `mounts.json`.

| Exit code | Meaning |
|---|---|
| `0` | done, and what was checked holds |
| `1` | checked, and it does not hold |
| `2` | bad usage or input: unknown team, missing file, malformed JSON, unknown mount set or profile |
| `3` | not implemented yet: a planned command, or the part of `run` a later lot brings |

`run` has two more cases, listed [with it](#run-team---level-l0l2--the-first-test-levels).

## `doctor` — is everything in place?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20261008.gbd3420c
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20261008.gbd3420c
PASS  orkeon tool catalogue           83 tools
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
`--list-tools`, `orkeon doctor`, `orkeon email` and `orkeon mcp serve` started there still read
`appsettings.json`.) A team's own settings live in
`settings/<slug>/appsettings.json`. `sandboxes left by a killed run` warns, and names them, when a
test run that was killed left its temporary folder behind (a run stopped with Ctrl-C removes its own; a
kill nothing can catch does not, and may leave the team's `orkeon` process too): the bench never removes
them itself, and the next `run` warns as well. A warning does not fail the result. `--quiet` prints nothing unless a
check fails (one line per failure, on stderr) — the form for scripts; `--json` gives every check.

## `status <team>` — where is a team?

Reads `workbooks/<slug>/STATUS.md` and reports its phase, last gate passed, track (`full`, or `light`
for a small team), iteration (the number of `ITERATE` verdicts so far), attempt, batch, verdict and next
action; an inconsistent status (a gate ahead of the phase, `accepted` without the `ACCEPTED` verdict…)
comes with warnings. A workbook written before `track` and `iteration` reads as `full` and `0`.

```console
$ orkeon-bench status demo
team: demo (/workspace/teams/demo)
phase: design
gate_passed: design
track: full
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
the `Llm__*` variables. `stub` is the simulated model (`llm-stub serve`, which `run` starts by itself at L2); other names come from `tests/<slug>/bench.config.json`. Secrets
are never printed — only variable names. A profile is remote unless its base URL is on a local host
(`localhost`, `::1`, `0.0.0.0`, `127.0.0.0/8`, `host.docker.internal`, or a host listed in
`HARNESS_LOCAL_LLM_HOSTS`); a configuration
without a base URL is remote too, since Orkeon then picks a hosted provider itself. Every named profile
of the settings (`Llm:Profiles:<id>`) is judged the same way, and the run is remote when one of them is.
The stub and a named bench profile are injected over the default model and over every named profile. The
run gate applies the same rule.

## `report validate <file>` — is a report sound?

Checks a `report.json` against its schema (version 1.0) and the verdict rule — accepted ⇔ every
acceptance criterion passes at its level, every invariant holds, every indicator is in range.

```bash
orkeon-bench report validate workbooks/notes-digest/attempts/ATT-0001/report.json
```

## `check` — are the criteria, the test plan and the design sound on paper?

Two checks read the workbook of a team before you are asked to validate it. They write nothing, cost
nothing, and hold what a script can decide — the shape of the documents — so that your validation is
about their content.

```bash
orkeon-bench check test-plan mail-triage     # before the test-plan approval
orkeon-bench check design mail-triage        # before the design approval
```

`check test-plan` reads `ACCEPTANCE.md`, `TEST-PLAN.md` and `tests/<slug>/bench.config.json` (and the
headings of `NEED.md`): every criterion has an identifier of its own, a dataset the test plan lists, an
outcome and a test level; every indicator a numeric threshold and a direction (`>=` or `<=`); the
invariants every team needs are there; the budget of the plan is the configuration's, and every model
profile the plan names exists in it. `check design` runs the same checks, then reads `DESIGN.md`
and `PLAN.md`: every tool an agent holds exists in the installed Orkeon (`orkeon run --list-tools`), no
agent both reads mail and sends it, a task depends on every task whose result it reads, the mount points
are those of the need, every deliverable lies under a writable mount point, every criterion is covered by
a batch, and every step of the plan names the files it creates.

````console
$ orkeon-bench check design mail-triage
check design: mail-triage — FAIL (2 errors, 1 warning)
  error   DESIGN.md § Agents — agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)
  error   PLAN.md § Batches — `AC-02` is covered by no batch
  warning DESIGN.md § Tasks and DAG — no ```mermaid block: the diagram is drawn from the table
````

An **error** must be fixed before the approval is asked for; a **warning** is fixed or explained; a line
`skipped` names a check that could not be made — the tool names, without `orkeon` — and is then done by
hand. Exit code `0` without an error, `1` with one, `2` when a document the check needs does not exist
yet — the message names the step that writes it. `--json` gives each finding with its code;
`check design --tests` also checks that every test of `tests/<slug>/` cites a criterion and that every
criterion has a test. `/team-test-plan` and `/team-design` run these checks themselves before they hand
you their documents. The codes are listed in the bench's
[README](../../.devcontainer/bench/README.md#checks-of-the-workbook).

## `tools dump` — the real schema of every tool

Records the schema of every tool of `orkeon run --list-tools`, exactly as `orkeon run` sends it to the
model: a throw-away crew whose single agent lists all the tools runs once against a local recorder that
answers `OK` — no model is called, nothing is paid. It prints a Markdown table (required arguments in
bold), or with `--json` the entries as sent. Exit 1 when a listed tool never reached the model.

```console
$ orkeon-bench tools dump | head -n 4
| Tool | Arguments | What it does |
|---|---|---|
| `arcadedb_query` | **`bolt_uri`**, **`database`**, `username`, `password`, **`query`**, `parameters`, `query_language`, `max_results` | Execute Cypher or SQL queries on ArcadeDB via Bolt protocol |
| `cache_search` | **`query`**, `source`, `url_filter`, `top_k`, `min_score` | Semantic search over content previously stored in the RAG cache … |
```

Run it after a change of Orkeon version: § 5 of `references/orkeon/orkeon-reference.md` was generated
this way, and regenerated for Orkeon `main` at bd3420c. A tool whose schema reaches the model empty shows
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
  do not call it: you type `/team-approve remote <usd>` in Claude Code, and a hook calls it with what you
  typed ([Models](../guides/models.md#the-approval-of-paid-runs)). It refuses an amount above the cap
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
`ORKEON_Llm__ApiKey=stub`); `--port` fixes the port, `--log <file>` appends every exchange to a file.
`--scenario` takes a scenario file (its `llm_stub`) or a reply script alone. When it stops it says how
many requests it received and what went wrong — a request no rule answers, a tool call the tool would
refuse, a request dropped mid-way. No model is called, nothing is paid. `llm-stub record` and `replay`
are planned.

## `run <team> --level <L0|L2>` — the first test levels

Runs the test levels in order, up to the one you name, in the team's open attempt:

```console
$ orkeon-bench run notes-digest --level L2
notes-digest: ATT-0001
L0 static: pass
L1 unit: skipped (not run: L1 is not implemented yet (lot 4))
L2 component: pass
verdict input: all_ac_pass=false all_inv_pass=false indicators_in_range=true
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
runs: RUN-20261006-2143-stub
warning: INV-FS not proven: no check of an invariant exists in this version of the bench — all_inv_pass stays false
```

| Level | What runs today |
|---|---|
| L0 static | `mounts.json` and the folders its mount points may reach, the layout of `crew/`, the launchers and the card against `mounts.json`, `bench.config.json`, the settings file the run would read (it must be strict JSON: no comment, no trailing comma, no key written twice — the message names the file and the line), the scenarios (each one parses, has a check for what it claims to prove, and lies where a run picks it up), the generator skill's check script, `orkeon run --validate` |
| L1 unit | nothing yet: reported `skipped` inside an L2 run; `--level L1` itself is refused (exit code 3) |
| L2 component | every `tests/<slug>/component/*.scenario.json`, on the simulated model: the whole crew runs once per scenario, **every** mount point — the read-only ones too — bound to a temporary copy of the scenario's dataset; then the scenario's checks are judged — a file exists, a text is present or absent, a file matches the expected one, a tool was or was not called, an agent received a text, the read-only folders are unchanged. A dataset holds plain files and folders only: a symbolic link in it fails the scenario, and one a run leaves is neither followed nor archived. A team without any scenario is **red** at this level, not skipped |

Each scenario leaves a run under `workbooks/<slug>/runs/RUN-<date>-<time>-stub/` — the event stream, the
logs, every exchange with the simulated model, a snapshot of what was written — and the attempt receives
`report.json` and `REPORT.md`.

**What the report proves.** Above, both levels pass and the team is still not accepted, and `REPORT.md`
says why under "Not run, so not proven:":

```text
- AC-02 — requires L3 (e2e_local), which did not run
- INV-FS — not checked: no check of this invariant exists in this version of the bench, and a green scenario that lists it in `covers` does not prove it
```

A criterion passes only when `ACCEPTANCE.md` declares it at a level the bench ran and a green scenario
of that level covers it; without `ACCEPTANCE.md`, or with a level the bench cannot read, it stays
`not_run`. A row whose status starts with `dropped` is left out of the report and of the three results
above; a scenario that still covers it gets a warning. **No invariant passes yet** and no indicator is measured: each one the team declares, or a
scenario covers, is `not_run`, so `all_inv_pass` and `indicators_in_range` are false as soon as one
exists. A run at L0–L2 can accept only a team whose criteria are all at L2 and that declares neither.

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
outside its model settings.

It needs the team folder and an open attempt (`attempt open`), and stops after a red L0 unless
`--continue`. A scenario that uses a feature the bench does not serve yet — a task run alone, answers to
a person, judges, a schema check — runs and **fails** rather than pass unchecked.

| Exit code of `run` | Meaning |
|---|---|
| `0` | no level is red |
| `1` | a level is red — L2 without a scenario included |
| `2` | bad usage, `--level` or `--profile` given twice, or the attempt was closed while the run was in flight: nothing is then written into it |
| `3` | not served yet: `--level L1`, L3, L4, no `--level`, a `--profile` other than `stub` |
| `130` | asked to stop (Ctrl-C, a time limit): the team's processes are killed, the temporary copy removed, the run kept with `status: interrupted` in its manifest, and no report written |

## Planned commands

They exist and answer `not implemented yet` with exit code 3:

| Command | Lot | Will |
|---|---|---|
| `datasets build <team> [<set>]` | 4 | materialise a team's synthetic datasets |
| `llm-stub record`, `llm-stub replay` | 4 | record a successful local run and replay it without a model |
| `run <team> --level L1`, `L3`, `L4`, `--profile <name>` | 4, 9 | run the unit tests of the tools, a team on a local model, then on a remote one behind the budget gate; check the invariants |
| `evaluate`, `capture` | 4 | recompute a report with the indicators and the judges' grades, prepare the reviewer's capture |
| `team rename`, `team remove` | 4 | move or remove the five trees of a team together: its folder, workbook, tests, settings and mount sets |
| `estimate`, `release` | 9 | estimate the cost of a remote run; realign the card and launchers, propose the tag |

Planned (lot 4): `doctor` will also list the orphans: a workbook, tests, settings or a mount set left without
`teams/<slug>/` — after a team folder moved or removed by hand: in a workshop, Studio's Rename and Delete
take them along.

The files the bench reads (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) and its
architecture are described in its [README](../../.devcontainer/bench/README.md).
