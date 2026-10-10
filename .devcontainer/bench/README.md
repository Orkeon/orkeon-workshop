# orkeon-bench

The bench CLI of the Orkeon harness: the typed, tested logic that skills, hooks and CI call
instead of shell snippets (plan § 7.5). It reads a team of the workshop — its folder
`teams/<slug>/`, and its workbook and tests next to `teams/`, in `workbooks/<slug>/` and
`tests/<slug>/` (D29) — and answers in text or JSON.

**State: lot 3 and the beginning of lot 4.** Eleven commands are real — `attempt`, `llm-stub serve` and
`run` up to L2 with the simulated LLM came with lot 4, `check test-plan` and `check design` with lot 3;
the others exist as stubs that exit 3.
References established on Orkeon main at ce9ec1f (`1.0.0-rc.4.src.20261009.gce9ec1f`, D32). `plan § x.y` here and in the sources refers to the
design document of the harness, the
[Orkeon Workshop plan](../../docs/orkeon-workshop-plan.md).

## Commands

| Command | Does | Exit |
|---|---|---|
| `orkeon-bench --version` | prints the bench version | 0 |
| `orkeon-bench doctor [--json \| --quiet]` | checks `orkeon --version`, `orkeon run --list-tools` (83 names on `main` at ce9ec1f, without configuration), `esbuild`, `python3 -c "import yaml"`, Ollama at `http://127.0.0.1:11434/api/tags` (warning only), one request at a time for a local model (a `RateLimiting.MaxConcurrentRequests` in the user's settings when their base URL is local — a failure when absent, 0 or below, which Orkeon reads as unlimited; a limit set by hand is kept; a limit of 1 without `QueueLimit` warns), the typings `/usr/local/share/orkeon/typings/orkeon.d.ts`, the workshop layout, the sandboxes a killed `run` left under the temporary folder (check `leftover-sandboxes`, a warning that names them); no stray settings file (check `stray-settings`, a failure): an `appsettings/appsettings.json` or `_shared/appsettings.json` above the teams, in a team folder or in its `crew/`, or a `crew/appsettings.json`, which Orkeon reads **instead of** the machine's settings for every run that names no settings file (Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one); a folder of that name does not count, and the `appsettings*.json` at the root of a team folder are no longer read (Orkeon `main` at a2bb6c3) | 0 no check failed (warnings allowed), 1 a check failed |
| `orkeon-bench status <team> [--json]` | reads `workbooks/<slug>/STATUS.md` (front matter + log) and reports inconsistencies as warnings | 0 |
| `orkeon-bench mounts <team> [--env <name>] [--json]` | prints the mount arguments of `orkeon run` derived from `mounts.json`: the team's own folders, or with `--env <name>` the mount set `mounts.<name>/<slug>/`; the same refusals and warnings as `scaffold` | 0 |
| `orkeon-bench scaffold <team> [--json]` | writes, from `mounts.json`, the launchers `run.sh` (mode 0755) and `run.cmd` (CRLF) — which also pass the team's settings file `settings/<slug>/appsettings.json` with `--settings` when it exists (D33) — the `mounts` of `studio-team.json` (its other keys kept; the card is created when missing), the folders of the mount points inside the team, each with a `.gitkeep`, and the team's `.gitignore` (the content of those folders stays out of git); refuses a mount point its agents must never reach and warns about any other folder outside the team ([the mount reach rule](#the-mount-reach-rule), D40) | 0 |
| `orkeon-bench report validate <file> [--json]` | checks a `report.json` against schema 1.0 and the verdict rule | 0 valid, 1 invalid |
| `orkeon-bench profile <team> <name> [--json]` | shows the `ORKEON_Llm__*` variables a profile would inject — names only, secrets redacted — and whether the profile is remote | 0 |
| `orkeon-bench tools dump [--json]` | records the schema of every tool of `orkeon run --list-tools` as `orkeon run` sends it to the model: a throw-away crew whose agent lists them all runs once against a local recorder (no model is called); prints a Markdown table, or the entries as sent | 0, 1 when a listed tool never reached the model |
| `orkeon-bench check test-plan <team> [--json]` | gate 2, reading only: `workbooks/<slug>/ACCEPTANCE.md`, `TEST-PLAN.md` and `tests/<slug>/bench.config.json` — contractual headings, ids, rows, levels, the datasets a criterion names, the catalogue invariants, judges, the budget and the profiles against the configuration ([Checks of the workbook](#checks-of-the-workbook)) | 0 no error, 1 an error, 2 a document of the workbook missing |
| `orkeon-bench check design <team> [--tests] [--json]` | gate 3: everything `check test-plan` checks, then `DESIGN.md` and `PLAN.md` — tool names against `orkeon run --list-tools`, tasks and their dependencies, mount points against the need's, deliverables, batches, coverage of the criteria, sheets and anchors; `--tests` adds the ids ↔ tests traceability of `tests/<slug>/` | 0 no error, 1 an error, 2 a document of the workbook missing |
| `orkeon-bench attempt open <team> [--by <skill>] [--json]` | opens the next attempt of the team, `workbooks/<slug>/attempts/ATT-nnnn/`: its `manifest.json` (`closed_at: null`), written before anything else, then `design-snapshot/` — a copy of `crew/` and of `mounts.json` ([Attempts](#attempts)); one attempt is open at a time, and of two commands started together one opens it. `--by` is one short line | 0 |
| `orkeon-bench attempt close <team> [--verdict ACCEPTED\|ITERATE\|BLOCKED] [--json]` | closes the open attempt (`closed_at`, and the verdict when given); a closed attempt is immutable. `ACCEPTED` is refused unless the attempt holds a `report.json` whose verdict input accepts. An attempt folder left without a manifest is closed as abandoned | 0 |
| `orkeon-bench attempt approve <team> --usd <amount> [--json]` | records the user's approval of a remote run in the open attempt — `remote-approval.json`, the marker the run gate reads, and `remote_approval` of the manifest; the bench alone writes it (D19, D36). Refuses, writing nothing: no open attempt, no `budget.remote_usd_max` stated in `bench.config.json`, an amount that is no number of 0 or more, an amount above the cap | 0 |
| `orkeon-bench llm-stub serve --scenario <file> [--port <n>] [--log <file>] [--json]` | serves the simulated LLM in the foreground until SIGINT, SIGTERM or SIGHUP: the reply script of a scenario, or a reply script alone, answered in the OpenAI and the Ollama dialects ([The simulated LLM](#the-simulated-llm)); `--log` appends to the file | 0, 1 when a request met no scripted reply, a scripted call the request could not take, or was dropped |
| `orkeon-bench run <team> --level <L0\|L2> [--profile stub] [--continue] [--json]` | runs the test levels in order, up to `--level`, and writes `report.json` and `REPORT.md` into the open attempt, in place of the report of an earlier run: L0 static, then L2 component — each scenario of `tests/<slug>/component/` run once against the simulated LLM and archived under `workbooks/<slug>/runs/` ([`run`](#run-scenarios-runs-and-the-report)). L1 is reported `skipped`; stops at the first red level unless `--continue` | 0 no level red, 1 a level red — L2 asked for with no scenario included —, 2 the attempt was closed while the run was in flight, or an option is given twice, 3 for `--level L1`, `L3`, `L4`, no `--level`, or a profile other than `stub`, 130 asked to stop |
| `orkeon-bench deploy <team> [--with-settings \| --without-settings] [--format zip\|tar.gz] [--into <folder>] [--json]` | writes `<workshop>/deployments/<slug>-<yyyymmdd>.zip` (UTC; `-2`… the same day), or `.tar.gz`: the team folder as Studio runs it under `teams/<slug>/` — every mount point folder reduced to its `.gitkeep`, no dependencies or build output, no symbolic link, `*.sh` stored executable — and, with `--with-settings`, `settings/<slug>/appsettings.json` beside it, laid out to unpack at the root of a workshop ([Deployments](#deployments)); the archive's comment (the zip's, or a pax global header) is one JSON object naming the team, the date, the Orkeon and bench versions, the settings outcome and the file count. Refuses a settings file in the team folder, a `.env`, a settings file holding a secret, and, when the team has a settings file, a call that says neither flag (D45) | 0, 2 refused |
| `llm-stub record`, `llm-stub replay` | stubs: `not implemented yet (lot 4)` | 3 |
| `datasets`, `evaluate`, `capture`, `team` | stubs: `not implemented yet (lot 4)` on stderr; `team rename\|remove` will move or remove the five trees of a team together — its folder, workbook, tests, settings and mount sets — and `doctor` will list the orphans, what remains of a team without `teams/<slug>/` (D39) | 3 |
| `estimate`, `release` | stubs: `not implemented yet (lot 9)` | 3 |

`<team>` is a slug looked up under `<workshop>/teams/`, or a path to a team folder (anything
containing `/` or starting with `.`). The workshop root is `$ORKEON_WORKSHOP` (`/workspace` in the
image), else `~/Orkeon`. What goes with a team — its workbook, its tests, its settings
(`settings/<slug>/appsettings.json`, D33), its mount sets — is found two levels above its folder,
under its slug. A team exists as soon as its folder, its workbook or its tests do: `/team-init`
creates `workbooks/<slug>/` and `tests/<slug>/`, the first build batch `teams/<slug>/` (D35). So
`status` and `profile` answer from the start, while `mounts` and `scaffold` need the `mounts.json` of
the team folder and say when that folder does not exist yet.

Exit codes: `0` done (and what was checked holds) · `1` checked and it does not hold · `2` bad
usage or input (unknown team, missing file, malformed JSON, unknown environment or profile, a mount
point refused, an attempt that cannot be opened, closed or approved in), a write that fails, or for
`tools dump` and `run` an `orkeon` missing or failing · `3` not implemented yet — a planned command, or
the part of `run` that belongs to a later lot (`orkeon-bench run: not implemented yet (lot 4): level L3:
…`) · `130` for a `run` asked to stop (SIGINT, SIGTERM, SIGHUP), once it has stopped what it started. Errors go to stderr; `--json` output is always snake_case, like `report.json`.

`doctor --quiet` (`-q`) is the form for a hook: the exit code only. It prints nothing when every
check passes or merely warns, and one line per **failing** check on stderr otherwise
(`FAIL pyyaml: python3 -c import yaml exited 1: ModuleNotFoundError: No module named 'yaml'`).
The checks run concurrently; the Ollama probe gives up after 1.5 s and a command after 20 s.

```console
$ orkeon-bench mounts demo
--mount /workspace/teams/demo/input:/workspace:ro /workspace/teams/demo/output:/output:rw /workspace/teams/demo/state:/state:rw
$ orkeon-bench mounts demo --env test
--mount /workspace/mounts.test/demo/workspace:/workspace:ro /workspace/mounts.test/demo/output:/output:rw /workspace/mounts.test/demo/state:/state:rw --allow-external-mounts
$ cd /workspace/teams/demo && orkeon run crew $(orkeon-bench mounts demo)
```

Every binding goes under **one** `--mount` flag; `--allow-external-mounts` is appended as soon as
one physical path lies outside the team folder (the working directory of the launchers): always
for a mount set. The
flag is variadic: put the target (`crew`) **before** the mount arguments, or it is read as one
more binding. Physical paths are printed absolute, but `orkeon run` decides what is external against
its working directory, as the bench does against the team folder: run the line from the team folder,
as the launchers do. A physical path that Orkeon's mount grammar would split — one holding a `;`, a
`"` or a `:` other than a drive letter's, or ending with a backslash — is quoted
(`"/srv/a:b":/notes:ro`), in the line as in the card. With
`--json` the same resolution also carries `set_folder` (the folder of the mount set, or `null`) and
`studio_mounts`, the `mounts[]` of `studio-team.json` (`./input:/workspace:ro`: a path starting with
`./` is relative to the team folder).

`scaffold` is what the generator skills call once `mounts.json` and the crew exist, and what to run
again after any change of `mounts.json`: the launchers then bind every mount point, and with
`TEAM_ENV=<name>` the mount set `mounts.<name>/<slug>/` instead of the team's own folders (a
read-only folder must exist, a writable one is created). It reads `crew/` as `orkeon run` reads a
crew folder: a YAML crew is `config.yaml` (or `crew.yaml`) beside `agents/` or `tasks/`, or the flat
`crew.yaml` + `agents.yaml` + `tasks.yaml`, and the launchers start the folder; a TypeScript crew is
`crew.ork.ts`, and they start the script. It refuses a folder holding neither (a single-file
`config.yaml` included, which `orkeon run` does not take as a crew folder), `agents/` or `tasks/`
without `config.yaml` or `crew.yaml`, and a YAML layout beside any `*.ork.ts` or `*.ork.js`, which
`orkeon run` refuses as ambiguous. A mount folder inside another (`./data/state` in `./data`) is
created and kept like the others: the `.gitignore` takes it back after excluding the content of the
outer one.

### The mount reach rule

`mounts`, `scaffold` and the static checks judge the folders of the team's own mount set (the
`default` of each point; the folders of a named set lie outside the team by construction) with one
rule, D40:

> A mount point may not use: the team folder itself; `crew/`, or a folder named `appsettings` or
> `_shared` at the root of the team (a folder named `agents` or `tasks` is free: Orkeon Studio and
> `orkeon run` read `crew/` first since `main` at fb26364); outside the team, a folder that holds the team
> folder, the workshop or the home folder, or that is or lies inside the workshop's `settings/`,
> `workbooks/`, `tests/`, `.claude/`, `library/`, `references/`, `.devcontainer/` or `.git/`, an
> `appsettings/` or `_shared/` folder above the team, a hidden folder of the home folder
> (`~/.config`, `~/.claude`, `~/.ssh`…), the user's `AppData`, `/proc`, or another team's folder or
> mount set. A `/plugins` mount point is read-only. Any other folder outside the team passes with a
> warning: Orkeon Studio launches the team only when that folder is declared, spelled exactly, in its
> Authorized folders. The Windows spellings of these folders (`C:\Users\<you>\Orkeon\settings`,
> `C:\Users\<you>\.claude`, `C:\Users\<you>\AppData\…`) are refused the same way. Paths are judged as
> written: a symbolic link is not followed, and a folder name ending with a dot or a space is refused, since
> Windows drops them (`./crew.` is `crew/` there).

"The workshop" is the team's, two levels above its folder, and `$ORKEON_WORKSHOP` when it is
another; `$XDG_CONFIG_HOME/Orkeon`, when `XDG_CONFIG_HOME` is set, is refused like the home folder's
hidden folders. Names are compared ignoring case, as a Windows host folder is. A refusal is an error
(exit 2) naming the point, the folder and what it would expose; a warning goes to stderr as
`warning: …`. The rule is `judgeMountReach` in `src/domain/mounts/mount-reach.ts`; the static checks
of the generator skills (`check_crew.py`, `check_team.py`) and the C# runner and crew host
(`MountsFile.cs`) implement it with the same messages: change them together.

## Files the bench reads

### `mounts.json` (team root)

```json
{
  "version": 1,
  "mounts": [
    { "root": "/mailbox", "access": "ro", "role": "mailbox", "default": "./mailbox" },
    { "root": "/state", "access": "rw", "role": "state", "default": "./state" },
    { "root": "/output", "access": "rw", "role": "deliverables", "default": "./output" }
  ]
}
```

- `mounts[]` — the mount points of the team, free in name and number (D27), in the order they are
  passed to Orkeon. `root`: one lowercase segment (`/mailbox`); `access`: `ro` | `rw` | `rwnd`;
  `role`: a kebab-case word (`inputs`, `deliverables`, `state`, `archive`, `mailbox`,
  `reference`…); `default`: the folder of the point when the team runs on its own folders,
  relative to the team folder or absolute; `description`: optional.
- Mount sets (D28) are folders, not entries of the file: `--env <name>` binds the point `/x` to
  `mounts.<name>/<slug>/x`, two levels above the team folder; a set without a folder for the team
  is `unknown environment "<name>": <folder> does not exist (known: default, …)`.
- Rejected: the roots reserved to the runner (`/crew`, `/script`, `/llm-logs`, `/sandbox`,
  `/credentials`), a `/plugins` point that is not `ro` (where `orkeon-harness-run` loads plugins
  from when no `--plugins` names a folder), a duplicate root, an empty list, the `environments` key
  of the first format (with what replaced it), and a physical path starting with `~`, `$` or `%`
  (nothing expands them: it would silently bind a folder of that name). The folders themselves are
  judged by [the mount reach rule](#the-mount-reach-rule).
- A binding whose physical path is not under the team folder is `external`. A path of the
  Windows host (`C:\Shares\inbox`, `\\nas\share`) is kept verbatim and is always external.

### `workbooks/<slug>/STATUS.md`

YAML front matter, then a log of `- ` bullets:

```markdown
---
phase: build            # need | test-plan | design | tests | build | run | review | accepted | published
gate_passed: design     # the last phase whose exit gate was passed, or null
track: full             # full | light: the track chosen at /team-init (D37)
iteration: 0            # 0 at /team-init, +1 at each ITERATE verdict (D38)
attempt: ATT-0002       # or null
batch: B1               # the plan batch being built: B1, B2…, or null
verdict: null           # ACCEPTED | ITERATE | BLOCKED | null
next_action: /team-build B1
updated_at: 2026-09-30T19:12:00Z
---

- 2026-09-30 19:12 — /team-build — B1 opened
```

`phase`, `next_action` and `updated_at` are required; `track` and `iteration` default to `full` and
`0` (a workbook written before them), the other keys to `null`; any other value is refused. A batch
id matches `^B[1-9][0-9]*$` — no dash, no leading zero; anything else is refused. The `L` prefix
is reserved for the test levels `L0`–`L4` and is never a batch. A readable but inconsistent
status (gate ahead of the phase, `accepted` without the `ACCEPTED` verdict, `build` or later
without an attempt) is reported as warnings, never refused. After an `ITERATE` verdict the team is
back in phase `build` with `gate_passed: tests` and `iteration` one higher: consistent, no warning.

### `tests/<slug>/bench.config.json`

As in plan § 6.5. `machine` (`{ "source": "orkeon-settings" }`) and `stub` always exist, even
without the file; `stub` cannot be declared. A named profile carries `baseUrl`, `model`, `keyEnv`
(the **name** of the variable holding the key, never the key) and `timeoutSeconds` (default 600).
Levels: `static` (L0), `unit` (L1), `component` (L2), `e2e_local` (L3), `e2e_remote` (L4), each
`{ profile, repeat, pass_at }`.

| Profile | Variables injected |
|---|---|
| `machine` | none: Orkeon's own configuration applies (see *Is a profile remote?*) |
| named | `ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model`, `ORKEON_Llm__TimeoutSeconds`, `ORKEON_Llm__ApiKey` (read from `keyEnv` at run time), `ORKEON_Llm__ApiKeyEnvVar` blank |
| `stub` | `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1` (port chosen when the stub server starts, never 11434), `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub`, `ORKEON_Llm__ApiKeyEnvVar` blank |

The stub and a named profile inject the same keys for every named profile of Orkeon's settings
the run reads, `ORKEON_Llm__Profiles__<id>__*` (`orkeon_profiles` in the JSON), since any agent
may name one: every call goes to the profile's endpoint. `ApiKeyEnvVar` is injected blank, which
Orkeon reads as absent, so a key a settings file points to never reaches that endpoint.

#### Is a profile remote?

`profile <team> <name> --json` carries `remote` (boolean), `base_url_host` and `remote_reason`.
The rule is one domain function, `llmTarget` in `src/domain/llm-target.ts` (`machineTarget` over
the default and the named profiles), fed for the machine profile by
`src/domain/orkeon-configuration.ts`. The run gate of the harness (`run-gate.sh`) mirrors both
and is cross-checked against this command, because a remote target needs an estimate, a cap and
an explicit approval before any run: change the two together. Checked on Orkeon `main` at
ce9ec1f (D32): Orkeon reads no provider key — it infers the provider from the base URL, then the
model name, then the key; it has a default provider, the `Llm` section, when a key of it besides
`Profiles` holds a non-blank value, else its offline echo provider; and every named profile
`Llm:Profiles:<id>` is a provider of its own, which any agent may name (`llm: { profile: … }`,
`.withProfile(…)`, `--llm-profile`, the RAG's `Orkeon:Rag:LlmProfile`).

1. A base URL decides alone: the provider is remote unless its host is **local**
   (`remote_reason`: `local-host` or `remote-host`). A base URL that cannot be read is remote
   (`unreadable-base-url`).
2. No base URL, but a default provider (or a named profile, which needs no value to exist):
   Orkeon calls the endpoint of the provider it infers — OpenAI's when nothing matches, and
   `qwen3:8b` alone goes to a hosted Qwen — so it is remote (`no-base-url`).
3. No default provider: the echo provider; `remote` is false, `base_url_host` null
   (`not-configured`).

The machine profile is remote when the default or any named profile is — fail-closed: which
profiles a crew names is not read, since a script may compute the name. `remote_profile` names the
profile that made it remote (null for the default), and `providers` lists every provider judged.

A host is local when it is `localhost`, `::1`, `0.0.0.0`, any address of `127.0.0.0/8`,
`host.docker.internal` (a model served by the host machine, such as Ollama in host mode), or
listed in `HARNESS_LOCAL_LLM_HOSTS` — host names or IP addresses separated by commas or spaces,
case-insensitive, for a model server on the LAN. Hosts only: no scheme, no port. The host of a
base URL is what a URL parser reads (lowercase, IPv6 without brackets).

| Profile | Judged on |
|---|---|
| named | its own `baseUrl` (rule 1), whatever the machine is set to |
| `stub` | never remote; `base_url_host` is `127.0.0.1` |
| `machine` | what a launcher run of the team would read, highest layer first: the `ORKEON_Llm__*` variables; the settings file of the run — the team's `settings/<slug>/appsettings.json` when it exists (the launchers pass it with `--settings`, D33), else the one Orkeon resolves for `<team>/crew`: `crew/appsettings.json`, else the first `appsettings/appsettings.json` or legacy `_shared/appsettings.json` walking up, else `$XDG_CONFIG_HOME/Orkeon/appsettings.json` (default `~/.config/Orkeon/appsettings.json`); the `Llm__*` variables (the working directory's appsettings files and the `DOTNET_Llm__*` variables are no longer read). The base URL of each provider comes from the highest layer that sets one; the default exists when any layer gives it a value, a named profile when any layer names it (rules 1–3) |

For `machine`, the JSON also names `machine.settings_file`, `machine.base_url_source`,
`machine.configured_by` and `machine.profiles` (each with its `base_url_source` and `defined_by`),
a layer that sets `Llm:Provider` gets a warning — Orkeon refuses to start on it — and so does a remote named
profile.
A settings file that is not strict JSON is an error, although Orkeon reads it: a comment, a trailing
comma, a key written twice in one object (Orkeon merges the two, `JSON.parse` and `jq` keep the last).
The message names the file, the line and what was found there (`strictJsonOffence` in
`src/domain/strict-json.ts`); `run` finds it at L0, check `settings`.

### Checks of the workbook

`check test-plan <team>` (gate 2) and `check design <team> [--tests]` (gate 3, which runs the checks of
gate 2 first) read the workbook of a team and write nothing. They hold the **shape** of the artefacts —
what a script can decide — and leave the content to the checklists of
`references/process/checklists/`: a reason, a size, whether a Then is observable. The rules are pure
functions of `src/domain/workbook/`, one module per artefact; `CheckWorkbook` reads the files, the track
of `STATUS.md` and, for `check design`, the tool catalogue of the installed Orkeon
(`orkeon run --list-tools`).

Exit `0` without an error (warnings allowed), `1` with one, `2` when the team is unknown or a document
of the workbook the check needs is missing — `NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`, and for
`check design` `DESIGN.md` and `PLAN.md`; the message names the step that writes it. A missing
`tests/<slug>/bench.config.json` is a finding (`config-missing`), not exit `2`. Text output, errors first:

````console
$ orkeon-bench check design mail-triage
check design: mail-triage — FAIL (2 errors, 1 warning)
  error   DESIGN.md § Agents — agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)
  error   PLAN.md § Batches — `AC-02` is covered by no batch
  warning DESIGN.md § Tasks and DAG — no ```mermaid block: the diagram is drawn from the table
````

`--json` carries `team`, `check` (`test-plan` | `design`), `status` (`pass` | `fail`), `errors`,
`warnings`, `findings[]` of `{severity, code, artefact, section, message}`, `skipped[]` of
`{check, reason}` — a check that could not be made and is done by hand: `tool-catalogue` without a
usable `orkeon`, `light-track` without a readable `STATUS.md`; it changes no exit code —, `ids`
(`acceptance`, `indicators`, `invariants`, `dropped`) and `tests` (`null`, or with `--tests`
`{files, uncovered, orphans}`). The codes are frozen literals (`FINDING_CODES`, `finding.ts`), printed
in this order after the severity:

| Artefact | Codes — errors unless marked *(w)*, a warning |
|---|---|
| every artefact | `headings` (the `## ` headings of the template, same text and order — `WORKBOOK_HEADINGS`, `headings.ts`), `placeholder` (a `{{…}}` of the template left), `to-revise` (a `> To revise — DEC-nnnn` line left, whatever its spacing or its dash), `empty-section` (a section with nothing to say holds `None.`); `need-tbd` *(w)*, a `TBD` left in `NEED.md` at gate 3. `NEED.md` is read for its headings, placeholders and `## Mounts` only |
| `ACCEPTANCE.md` | `id-malformed`, `id-duplicate`, `ac-none` (no active criterion), `ac-incomplete` (an empty Given, When or Then), `level` (a cell naming no single level), `ac-status` (`active` or `dropped (DEC-nnnn)`, read by what the cell opens with — as is whether the row is dropped), `ac-dataset` (at L2 and above, Given holds back-ticked names and none is a dataset of `## Datasets`), `ac-no-dataset` *(w)* (at L2 and above, Given names none), `ind-incomplete` (measure, unit, a numeric threshold, `>=` or `<=`), `inv-incomplete` (statement, check), `inv-unknown` (an `INV-<NAME>` outside the catalogue), `inv-always` (`INV-FS`, `INV-SECRETS`, `INV-TOOLS`, `INV-BUDGET` apply to every team), `inv-level` (a catalogue invariant below its lowest level) |
| `TEST-PLAN.md` | `dataset-incomplete` (name, origin `synthetic` \| `provided` \| `anonymized`, no duplicate), `dataset-unknown-id`, `dataset-unused` *(w)*, `adversarial-missing` (`INV-INJECTION` declared and served by no dataset), `judge-incomplete` (`J-nn`, rubric, scale, a threshold that is a number or declared `IND-nn` ids), `id-duplicate` for a `J-nn` written twice, `target-profile` (a profile that is neither `stub`, `machine` nor one of the configuration), `budget` (a `local` and a `remote` row — the first word of `Kind` — with a number: the one before `minutes` or `USD` when there is one, the last of them when there are several; a decimal comma is a decimal point) |
| `bench.config.json` | `config-missing`, `config-invalid` (strict JSON, the schema), `config-budget` (the two numbers of `## Budget`; a limit the file does not state is the bench's default), `config-placeholder` (a `<…>` left in the `model` or the `baseUrl` of a profile a level names), `config-remote` / `config-local` (an id at L4 / L3 and no `levels.e2e_remote` / `levels.e2e_local`) |
| `DESIGN.md` | `process` (no mode named; the mode is the first one in back-ticks that the words before it do not dismiss — `not`, `pas de` —, else the first mode word), `process-manager` (`hierarchical` without an agent as manager), `process-failure` *(w)* (any mode but `sequential`: an active criterion must say what a failed task leaves), `agents-count` (none; *(w)* for 1 or more than 5), `agent-incomplete` (id, role, justification, an integer `maxIter` of 1 or more), `unknown-tool` (neither in the catalogue nor declared custom), `mail-read-send` (one agent reads mail and holds `email_send` — by its `Tools` cell or by a `Used by` of `## Tools`), `mail-send` *(w)*, `tool-incomplete`, `tool-shadow` *(w)* (a custom tool named like a catalogue one), `task-incomplete`, `task-cycle`, `task-reads` (a task reads a result it does not depend on: a task id found in a back-ticked span of `Reads`, or beside the spans when it is shaped like an identifier (`parse_mails`), or as a whole word when the cell has no back-tick), `diagram` *(w)*, `mounts` (no mount point at all; a root that is not virtual, reserved, declared twice, an unknown access, an empty folder, `/plugins` not `ro`), `mounts-need` (not the mount points and accesses of `NEED.md`), `deliverable` (a path of the table or of a task's `Deliverable` cell that is not under an `rw` / `rwnd` mount point; no source, `structured_output` or JSON without a schema), `deliverable-orphan` *(w)* (a path of the table no task carries, or of a task the table does not list), `resume` (the section says there is none — `None.`, `N/A`, `Not applicable.` — while `INV-RESUME`, `INV-INCR` or `INV-IDEMP` is declared), `risks` |
| `PLAN.md` | `batch-id` (`B<n>`, never `L<n>`), `batch-incomplete`, `batch-unknown-id`, `coverage` (an active AC or a declared INV no batch covers), `light-track` (more than the single batch `B1`), `sheet` (one `### B<n>` per batch, its five `#### ` parts in order), `steps` (a step — a numbered line at the indent of the first one of its part; a line indented more is a detail — without its three proof ticks on that line, or a step number written twice), `anchors` (a step without a row — `Step` is read by its leading numbers, `1, 2` or `1–3` —, a row without a file — the files are what stands outside brackets —, a path under `tests/` or `workbooks/` anywhere in the cell), `anchors-path` *(w)*, `anchors-tests` *(w)*, `assumptions` |
| `tests/<slug>/` (`--tests`) | `tests-none`, `test-orphan` (a test citing no id), `test-unknown-id` (an id the criteria do not declare, or have dropped), `test-unreadable` (a scenario that is not JSON, whose `covers` is no list or whose `level` is not one of `static`, `unit`, `component`, `e2e_local`, `e2e_remote`; a file that cannot be read), `untested` (an active AC or a declared INV without a test), `test-level` (an id cited only by tests of another level; a scenario whose `level` its folder does not serve). A test is a `*.scenario.json` (its ids are its `covers`), a `*.test.*` or `*.spec.*` file of `unit/`, or a file of `static/` that cites an id, in its text or by its name (`ac-03-…`) — a note that cites none is no test, a `README.md` never is. Not read: `datasets/`, `judges/`, `node_modules/`, `dist/`, `build/`, `bin/`, `obj/`, `coverage/`, `__pycache__/`, hidden files, and a folder reached through a symbolic link |

How an artefact is read — an error blocks a gate, so a remark written beside a right value is never
one; and a remark may hide a word nobody knows, never a known name, a virtual path or a wrong value:

- **Comments and code.** Fenced blocks are set aside first; HTML comments are removed outside them and
  outside inline code; a `<!--` that is never closed is plain text.
- **Tables.** Columns are found by their header, whatever its case, its emphasis and what it adds in
  brackets (`Level (lowest)`); a row without its closing `|` is a row; a row whose cells are all empty is
  ignored. In a section, a rule reads the tables that carry its key column and at least one other of its
  columns (`Id` with `Given` or `Then` for the criteria, `Tool` with `Kind`…). A table without the key
  column is the author's own, and ignored. A table with the key column alone — `| Id | Why this
  threshold |` — is not read either. Where reading it matters — the criteria, indicators and invariants,
  the agents, the tasks, the tools, the mount points, and the virtual paths of the deliverables — it may
  repeat what a read table declares, and a name it alone holds is an error under the section's code
  ("stands in a table that is not the template's"); elsewhere (datasets, judges, budget, risks, batches,
  anchors, assumptions) it is the author's own.
- **A cell that holds one value** — an id, a profile, an origin, a source, an agent, an access, a
  status — is read by the back-ticked span it opens with, else by what it opens with; what follows is a
  remark (`ro (lecture seule)` is `ro`, `` `claude` (named profile) `` is `claude`, `AC-01 (R-01)` is
  `AC-01`). A span further in the cell belongs to the remark and rescues nothing:
  `` openai (like `claude`) `` is `openai`. The fixed words themselves are those of the templates
  (`active`, `todo`, `synthetic`, `ro`…): `Active` or `read-only` are not them.
- **A cell that lists names** — an agent's `Tools`, `Dependencies`, `Used by`. With back-ticks (a span
  outside brackets): the back-ticked spans, and besides them any word that is a known name of that kind,
  or that has the shape of an identifier with a separator (`email_parse`); a virtual path names nothing.
  Without back-ticks: split on `,` `;` `/` `→` `<br>` and blanks, the connectors (`and`, `&`, `+`, `et`,
  `ou`, `or`) dropped. In both, what stands in brackets names only the known names it holds. So
  `` `file_read` (read only) `` names one tool, and `file_read (email_send as a last resort)` two.
- **Empty** is `—`, `-`, `n/a`, `none`, `None.`, `aucun`, `aucune`, alone, with a reason in brackets
  (`— (no schema yet)`) or followed by `:` and a sentence (`None: the task only reads`); in a cell that
  lists names, by its first word — a known name after it still counts.
- **Ids in a cell**: every `AC-`/`IND-`/`INV-` id found counts, and a range (`IND-02…IND-07`) names its
  two ends only — except the `Step` of an anchor, where `1–3` is steps 1, 2 and 3.
- **Paths**: the deliverables of a `Path` cell or of a task's `Deliverable` cell are its virtual paths
  outside brackets, back-ticked or not, each judged; a path in brackets is a remark (`(one per mail of
  `/mailbox`)`) unless the cell has no path outside them; an empty cell names none. The mount point of a
  path is its first segment; emphasis around a path is ignored, a `*` inside it kept.
- **`bench.config.json`** is never quoted: a finding names a profile and a key, a syntax error its line
  and column.

`orkeon-bench run` reads `ACCEPTANCE.md` with the same reader (`parseAcceptance`,
`src/domain/acceptance.ts`, is `readAcceptance` of `src/domain/workbook/acceptance-rules.ts`): only the
tables of `## Acceptance criteria`, `## Indicators` and `## Invariants` that carry the template's columns
declare ids, so what passes gate 2 is what a run then reports on — and a file without those three
headings declares nothing.

Known limits, left as they are: a plain task id written beside a back-ticked path in `Reads`
(`the result of classify; `` `/output/x.json` ``) is a remark — ids are written in back-ticks; a right
value followed by a remark that names another (`ro, then rw`) is read as the first; `orkeon run
--list-tools` is given 20 seconds, after which the tool names are reported as not checked.

### Attempts

`workbooks/<slug>/attempts/ATT-nnnn/` (plan § 4.6, § 5.7), written by the bench alone:

| File | Written by | Content |
|---|---|---|
| `manifest.json` | `attempt open`, `close`, `approve`, `run` | `attempt`, `opened_at`, `closed_at` (`null` while open — what the hooks read), `opened_by`, `design_snapshot` (`"design-snapshot/"`, or `null` until there is a crew), `orkeon_version` (`unknown` until `orkeon --version` answered), `runs` (the `RUN-…` ids, in order), `remote_approval`, `verdict`; a key the bench does not know is kept |
| `design-snapshot/` | `attempt open`, then **every `run`** | a copy of `teams/<slug>/crew/` — the definition and the custom tools it holds — and of `mounts.json`: the design the last run measured. Each run manifest carries the digest of the crew it ran (`crew.sha256`) |
| `remote-approval.json` | `attempt approve` | `{by: "user", at, estimated_usd, cap_usd, source}`: `estimated_usd` is the amount the user typed, `cap_usd` the `budget.remote_usd_max` the file states, `source` the `/team-approve remote <usd>` it comes from |
| `report.json`, `REPORT.md` | `run` | the report of the **last** run of the attempt, and its readable view |

- **Opening.** An attempt opens as soon as the workbook exists — before the team folder does (D35): the
  build it records is what creates the crew. The folder is created by a call that fails when it exists
  and its manifest is written at once, before the snapshot and before `orkeon --version`: an attempt
  folder never stands without a manifest, and of two `attempt open` started together one opens the
  attempt while the other is told it is open. `--by` is one short line (letters, digits, spaces and
  `. _ / @ -`, 64 characters at most).
- **The open attempt** is the highest `ATT-nnnn` whose manifest has `closed_at` null, as for the hooks
  (`harness_open_attempt`). The hooks also count an attempt folder **without** a manifest as open — left
  by an interrupted `attempt open`, or made by hand: every command stops on it and names the way out,
  `orkeon-bench attempt close <team>`, which closes it as abandoned (no verdict). The same goes for an
  attempt whose `manifest.json` cannot be read — not JSON, not the shape of a manifest: `attempt close`
  abandons it and keeps the unreadable file beside the new manifest, as `manifest.broken.json`. A
  plain **file** named `ATT-nnnn` in `attempts/` stops every command with what it is — only the bench
  creates attempts, as folders: move it away.
- **Closing.** `--verdict ACCEPTED` is refused unless the attempt holds a `report.json` that
  `report validate` accepts as valid and whose verdict input accepts; `ITERATE` and `BLOCKED` need no
  report.
- **Several commands at once.** Every command that reads and changes the attempts of a team does so
  under `attempts/.lock` (a file held for milliseconds, naming its holder; one left by a command that
  died is taken over, by one waiter at a time — `attempts/.lock.takeover` for that instant, itself
  cleared at once when the waiter that held it is gone). A command waits 10 s at most, for the lock or
  for a take-over in progress, then names the file and who holds it (exit 2).
  A manifest is changed as it stands, never written back from an earlier read: an approval recorded
  while a run is in flight is kept, two runs each add their runs, and a run that ends in an attempt
  closed meanwhile writes nothing into it and exits 2, naming the run folders it leaves. Every file a
  hook reads is replaced in one step (written beside itself, then renamed): a reader never finds it
  empty or half written. Where the rename is refused because another program holds the file — a disk
  of a Windows host — it is tried again, then the file is written in place.
- Tools of `library/tools/` that a crew imports are not in the snapshot.

### The simulated LLM

`llm-stub serve`, and `run` at L2, answer `orkeon run` from a **reply script** (plan § 6.3) on
`127.0.0.1` and a port the system picks (never 11434):

```json
{
  "schema_version": "1.0",
  "replies": [
    { "match": { "role": "Reader", "task": "Read the note" },
      "turns": [
        { "tool_calls": [ { "name": "file_read", "arguments": { "path": "/notes/a.md" } } ] },
        { "content": "- The launch is on Tuesday." }
      ] },
    { "match": { "role": "Writer" }, "turns": [ { "content": "# Digest\n" } ] }
  ],
  "fallback": { "content": "OK" }
}
```

- A **rule** answers the requests of one conversation. `match.role` is the agent's role, read from
  the system message (`You are <role>.`); `match.task` a text the prompt of the task holds; both must
  hold, and a rule without either answers everything. Rules are tried in order.
- **Turns** are the model's answers, in order: the turn sent is the number of answers the request
  already carries, so the stub keeps no state and a retried call gets the same turn. A `tool_calls`
  turn makes `orkeon run` execute the **real** tool with those arguments; the last turn is a final
  text.
- An **issue** is recorded, and fails a scenario, when a request matches no rule (unless the script
  has a `fallback`), when a conversation outlasts its script (the last turn is sent again), when a
  scripted call names a tool the request does not offer, lacks a required argument or passes one
  the tool's schema does not know — the call is still sent as written: the simulated model never
  corrects itself —, and when a client drops its request before the stub could read it (the stub
  keeps the exchange, answers nobody, and goes on serving).
- Both dialects are served, as Orkeon speaks them on a build of fb26364: OpenAI's
  `POST /v1/chat/completions` (what `127.0.0.1` gets), and Ollama's `POST /api/chat` and
  `POST /api/generate` (what a `localhost` base URL gets; `generate` carries no tool). Every answer
  carries token counts — about four characters per token, not a cost. A `GET` lists `stub-model`.

`--scenario` takes a scenario (`*.scenario.json`: its `llm_stub`, inline or the name of a file next to
it) or a reply script. `serve` prints where it listens and the variables to export
(`ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub`), **appends** each
exchange to `--log <file>` as JSON lines (what the file holds is kept), and ends on SIGINT, SIGTERM or
SIGHUP with the number of requests received and the issues. `tools dump` records against the same
server, with a script that answers `OK` to everything.

**A run on the simulated LLM cannot reach another model.** `run` hands `orkeon` a settings file of
its own, generated in the sandbox and passed with `--settings`: the file the run would have read —
the team's `settings/<slug>/appsettings.json`, else the one Orkeon resolves from the crew folder, the
machine's as a rule, else none — with its whole `Llm` section replaced by one that points the default
provider **and every named profile** at the stub (`stubSettings` in
`src/domain/orkeon-configuration.ts`). Nothing else of the file changes: mail accounts, tool options
and rate limits are what the team set; no key of the original `Llm` is kept — no endpoint, no key, no
name of a variable that holds one. `--settings` ends Orkeon's resolution chain, which is why the
generated file is made from the file that chain would have picked. The profiles are those of every
layer, the ones variables declare included. A file, not variables: a profile is
`ORKEON_Llm__Profiles__<id>__BaseUrl` as a variable, and a `/bin/sh` wrapper between the bench and
Orkeon drops a variable whose name is no identifier — a profile `fast-remote`, `gpt.4` or
`my profile` would then keep the endpoint and the key of the original file. The run manifest names
the generated file and what it was made from (`settings`); the file goes with the sandbox.

The environment of the run, and of `tools dump`, is the caller's without any variable Orkeon reads
into its `Llm` section, whatever its case and its layer (`ORKEON_Llm__BaseUrl`, `ORKEON_LLM__BASEURL`,
`Llm__ApiKey`, `ORKEON_LLM__PROFILES__PAID__APIKEY`… — `isLlmVariable`), then the stub's variables.
`ORKEON_OPENAI_API_KEY`, which `image_generation` hands to a paid model of its own, is dropped as
well, and a scenario whose reply script calls `image_generation` is refused. `Orkeon:Embeddings`
carries no base URL and no key at ce9ec1f: its `ollama` branch reaches `localhost:11434` only, its
`openai` branch needs a generator no shipped runner registers and throws at first use (read in the
sources). What the bench does not hold back: the other real tools a script calls (`http_api`, web
search, the e-mail tools on an account the settings declare), a secret a settings file carries
outside `Llm`, and a path a settings file writes relative to itself (`CredentialsDirectory`), which
then resolves in the sandbox.

### `run`: scenarios, runs and the report

`orkeon-bench run <team> --level L2` needs the team folder and an open attempt. This version runs:

| Level | What runs | Status in the report |
|---|---|---|
| L0 static | `mounts` (`mounts.json` and the reach rule), `crew-layout`, `launchers` (`run.sh`, `run.cmd` and the card's `mounts` are what `scaffold` would write), `bench-config`, `settings` (the settings file a run of the team reads — its own, else the one Orkeon resolves, the machine's as a rule — is strict JSON: no comment, no trailing comma, no key written twice), `scenarios` (every `*.scenario.json` of `component/` and `e2e/` parses, and no file that looks like a scenario lies where no run picks it up — a sub-folder, another case, beside the two folders), `check-script` (the generator skill's `check_crew.py` / `check_team.py` of the workshop, with `--orkeon orkeon`), `orkeon-validate` (`orkeon run <target> --validate` from the team folder, on its own folders) | `pass` · `fail`; a check whose tool is absent is `skipped` and warned about. Not run: `tsc` (a `skipped` check on a TypeScript crew), `dotnet build`, the scan for secrets |
| L1 unit | nothing | `skipped`, with a warning when `tests/<slug>/unit/` holds entries; `--level L1` itself is refused (exit 3): a run asked for a level that runs nothing would prove nothing |
| L2 component | every `tests/<slug>/component/*.scenario.json`, in name order | `pass` · `fail` — **`fail` when there is no scenario**: the level asked for ran nothing; `skipped` when L0 is red without `--continue` |
| L3, L4 | refused before anything starts (exit 3), as is a `--profile` other than `stub` | `skipped` |

`--level` and `--profile` are given once: twice, the run gate — which reads the command before it
runs — and the bench could each keep another value (exit 2).

A **scenario** follows `.claude/templates/scenario.json` (provisional until lot 5). What this version
reads: `id`, `title`, `covers`, `level` (`component` here), `dataset`, `bindings`, `llm_stub`, `checks`,
`timeout_seconds` (300 by default). **A scenario that covers ids declares at least one check**: it
proves an id by a check, never by running (refused at L0, and never a pass). It runs **the whole crew
once**, from the team folder, as
`orkeon run <target> --events jsonl --settings <sandbox>/.orkeon-bench/appsettings.json --mount … --allow-external-mounts`,
in the environment described under [The simulated LLM](#the-simulated-llm), its standard input closed
(a question to a person is refused, not waited for), in a process group of its own.

- **Mount points.** `dataset` is a folder of `tests/<slug>/datasets/`, else of `library/datasets/`.
  Each point of `mounts.json` starts from the folder `bindings` names in the dataset, from the folder
  named after the point when `bindings` does not mention it and the dataset has one, from an empty
  folder for `null` or when there is none. **Every point is bound to a copy in a temporary folder**,
  the read-only ones too: the dataset under `tests/` is never handed to a run, and the copy is removed
  whatever happens. A binding to the dataset itself (`"."`) or to `expected/` is refused: the team
  must not read what it is expected to produce. Paths are written with `/`, without `..`. **A dataset
  that holds a symbolic link is refused**, each link named: the team could read or write through it
  what lies outside its mount points. No link is followed afterwards either: one a run left in a
  mount point is not archived (the run manifest lists it, `links_not_archived`), and to a check what
  lies behind it does not exist.
- **Checks.** Every scenario gets `run` (exit 0, a successful `run.finished`, no `error` event; it
  says when the bench stopped the run itself — out of time, or more than 8 MB printed), `stub` (no
  issue, and at least one request) and, when the team has a read-only point, `read-only` (its content
  is the same after the run as before, by digest). Its own: `file-exists`, `text-present` and
  `text-absent` (`pattern` is a regular expression, case ignored), `matches-expected` (`expected` is a
  path in the dataset; two JSON documents compare by value, any other text line by line, line ends and
  trailing blank lines aside; **a file that is not text — not valid UTF-8, or holding a NUL — byte for
  byte**), `tool-called` (`outcome`: `success` by default — a call `tool.returned` reports as
  succeeded —, `failure`, or `any`) and `tool-never-called` (from the events; a delegation counts as
  `delegate_work_to_coworker`), `stub-received` (`role`, `pattern`: a request of that agent held the
  text — "task B received the output of A"). Paths are virtual (`/output/report.md`).
- **Not done yet — each fails the scenario rather than pass unseen**: `target.task` (isolating one
  task), `human_inputs`, `judges`, a `json-schema` check.

Each scenario that passed its set-up leaves a **run**, `workbooks/<slug>/runs/RUN-<yyyymmdd>-<hhmm>-stub/`
(`-stub-2`, `-stub-3`… within the same minute; the name is taken by creating the folder, so two runs
started together never share one): `events.jsonl` (the event stream), `stderr.log` (under `--events`
the logs and the crew's output go there), `stub-exchanges.jsonl` (every request and its answer),
`output-snapshot/<point>/` (the written points as the run left them — what the checks are judged
on) and `manifest.json` (scenario, dataset and its version, `crew.sha256`, `settings`, command, exit code,
`stopped` — `timeout`, `output-limit`, `cancelled` or `null` —, tokens, tool calls, `status`: `pass`,
`fail` or `interrupted`). A scenario that cannot be set up (no reply script, unknown dataset or mount
point, a bench configuration that does not parse…) fails with a `setup` check and leaves **no** run
folder.

**Stopping a run.** A scenario out of time is killed with its whole process group — what a launcher
or a wrapper started goes with it. On SIGINT, SIGTERM or SIGHUP (the 120 s limit of a tool call ends
this way) the bench stops `orkeon` and its group, stops the stub, removes the temporary folder, leaves
the run folder with a manifest whose `status` is `interrupted`, lists the runs in the attempt, writes
no report and exits 130. Nothing can catch a SIGKILL: the `orkeon` the run started, which leads a
group of its own, and the sandbox `orkeon-bench-run-*` under the temporary folder then stay. The
next `run` warns about them and `doctor` lists them — a sandbox whose creator (recorded in its
`.owner`) is gone, or one older than 15 minutes with no creator to tell —, and neither removes
them: that `orkeon` may still be writing there.

The **report** goes into the open attempt. **The report of an attempt is that of its last run**: a
later run replaces it, whatever level it reaches. `REPORT.md` says so, `metadata.requested_level` and
`metadata.replaces` (`date`, `reached`, `runs`) record it, and a run that replaces a report which
reached a higher level warns on stderr and names the run folders that still hold its evidence.
Nothing in a report passes by default:

- `levels.static.checks[]` and `levels.component.scenarios[]` hold the results above (`id`, `status`,
  `detail`; for a scenario also `covers`, `run`, `checks[]`, tokens, tool calls); each level has a `note`
  saying why it did not run.
- `acceptance`: the active criteria of `workbooks/<slug>/ACCEPTANCE.md` (table rows `AC-nn`, columns
  `Level` and `Status`) and those the scenarios of `component/` and `e2e/` cover. A criterion **passes
  only when `ACCEPTANCE.md` declares it at a level the bench can read and a green scenario of that
  level covers it**: one required at L3 stays `not_run` after an L2 run, whatever covers it; a failed
  scenario that covers it fails it. The `Level` cell is read as the template writes it — `L3`,
  `L3 e2e local`, `e2e_local`; a cell that names no level, or two (`L3 / L4`), is unreadable. A
  criterion `ACCEPTANCE.md` does not declare, one whose level is unreadable, and every criterion when
  there is no `ACCEPTANCE.md`, are `not_run`, with a warning: `all_ac_pass` is never true without a
  declared criterion. A row whose status starts with `dropped` is known and given up: its id is left
  out of the report — criterion, invariant or indicator —, and a scenario that still covers it gets a
  warning, not a verdict.
- `invariants`: every invariant `ACCEPTANCE.md` declares or a scenario covers. **None passes**: no
  invariant has a check of its own in this version (plan § 6.7), and a green scenario that lists one
  in `covers` does not prove it — `not_run` (`fail`, with the scenario, its run and its failed checks
  as `violations`, when a scenario that covers it failed). `all_inv_pass` is false as soon as one is
  listed.
- `indicators`: every indicator `ACCEPTANCE.md` declares or a scenario covers, `not_run`, `value: null`
  and the declared `threshold` (`null` when the cell is no number): they come with `evaluate`, and
  `indicators_in_range` is false until then. `judges` stays empty.
- `cost`: the tokens the stub reported, the wall time, the tool calls and human inputs of the events.

So a run of L0 to L2 yields an accepting verdict input only when every declared criterion is at L2
with a scenario and a check, and no invariant or indicator is declared.

### `report.json`

Schema `1.0`, as plan § 5.7; the top-level keys are fixed (an unknown one is an error). Beyond the
plan's example, an invariant and an indicator may be `not_run` — the run did not check or compute
them — and a `not_run` indicator has `value: null` (its `threshold` is `null` when none is declared):
`.claude/templates/report.schema.json` must allow the same (`src/domain/report.ts` is the parser).
The verdict rule lives in `src/domain/verdict.ts`:

> ACCEPTED ⇔ every AC passes at its level ∧ every INV passes ∧ every IND is in range.

An AC passes at its level when its status is `pass` **and** the level it names was not skipped. A
report without any AC is never accepted; an invariant or an indicator that is `not_run` is neither
proven nor in range. `report validate` fails when `verdict_input` disagrees
with what the content implies.

## Deployments

`deploy` (D45) ships **one team as Orkeon Studio runs it**, laid out as in a workshop so that the archive
unpacks at the root of another one: `teams/<slug>/**`, with the folder of every mount point reduced to its
`.gitkeep` — the data a team reads, writes and keeps is the workshop's, the same line the team's
`.gitignore` draws —, without `node_modules/`, `bin/`, `obj/`, `obj-linux/`, `*.tmp` or any symbolic link;
and `settings/<slug>/appsettings.json` only on `--with-settings`. The workbook and the tests never travel.
File modes are the archive's, not the disk's: `*.sh` executable (`0755`), everything else `0644` — a
workshop mounted from Windows shows no reliable mode. A zip (`domain/deployment/zip-format.ts`: ustar-free
PKWARE layout, raw deflate or stored, Unix modes in the external attributes, UTF-8 names, no zip64) is the
default; `--format tar.gz` writes a POSIX ustar (`tar-format.ts`), gzipped, that every Unix unpacker
restores with its modes, opening with a pax global header whose `comment` record carries the same JSON as
the zip's comment. Every entry is dated at the deployment instant. The name is
`<slug>-<yyyymmdd>.<format>` in UTC, numbered `-2`, `-3`… when taken.

Refused, exit `2`, nothing written: `appsettings*.json` at the team root or in `crew/`, an `appsettings/`
or `_shared/` folder (a settings file Orkeon reads from there, D40), a `.env`; with `--with-settings`, a
settings file holding a secret — a key whose last segment ends with `ApiKey`, `Password`, `Secret` or
`Token` and holds a value, or any value under `Secrets:` — and a team without a settings file; without a
flag, a team that has one. A missing launcher, card, `.gitignore` or README is a warning.

## Architecture

Clean Architecture with a DDD domain (plan § 9.1). Dependencies point inwards:

```
domain  ←  application  ←  infrastructure
                        ←  interface   (composition root: also wires infrastructure)
```

| Layer | Holds | May import |
|---|---|---|
| `src/domain/` | value objects, schemas and rules: `TeamRef`, `Status`, `MountDeclaration` / `MountBinding` / `MountSet`, `Profile`, `BenchConfig`, `Report`, the verdict rule, the remote rule (`llmTarget`), the mount reach rule (`judgeMountReach`), the crew layout (`crewKindOf`), the id families; the attempt manifest and the approval rule (`attempt.ts`), the reply script and the rule that answers a request (`llm-stub.ts`), the scenario and its checks (`scenario.ts`, `scenario-checks.ts`), the event stream (`run-events.ts`), the declared ids (`acceptance.ts`), the report of a run (`run-report.ts`); the workbook as the gates read it (`workbook/`: the Markdown reader, the contractual headings, the findings and one rule set per artefact) | itself and `zod` — no `node:*`, no other package |
| `src/application/` | use cases (`ReadStatus`, `ResolveMounts`, `ResolveProfile`, `ScaffoldTeam`, `ValidateReport`, `Doctor`, `DumpTools`, `LocateTeam`, `OpenAttempt`, `CloseAttempt`, `ApproveRemote`, `ServeLlmStub`, `CheckWorkbook`, `RunTestLevels` with its `StaticLevel` and `ScenarioRunner` in `runs/`) and the **ports** they need, in `src/application/ports/` (`FileSystem`, `ProcessRunner`, `HttpProbe`, `Clock`, `Environment`, `LlmRecorder`, `LlmStubServer`, `ShutdownSignal`) | domain, `zod`, `yaml` — no `node:*` |
| `src/infrastructure/` | Node adapters of the ports, gathered in `node-adapters.ts` (`NodeFileSystem`, `NodeProcessRunner`, `NodeHttpProbe`, `SystemClock`, `ProcessEnvironment`, `NodeLlmStub` — the one HTTP server of the simulated LLM — and `NodeLlmRecorder` on top of it, `ProcessShutdownSignal`) | domain, application, `node:*` |
| `src/interface/` | the commander CLI: arguments → use case → text or JSON | everything, plus `commander` |

Rules:

1. **No logic in `interface/`.** A command parses its arguments, calls one use case and formats
   the result (`toText`, `toJson`). A decision, a computation or a parsing rule belongs to the
   domain or to a use case.
2. **No `console` outside `interface/`**, and commands write through `Output`. `process` is
   touched by the Node adapters — `ProcessEnvironment` (variables, home, working directory),
   `ProcessShutdownSignal` (the signals that ask to stop), `NodeProcessRunner` (stopping a process
   group), `NodeFileSystem` (the pid in a lock and in a temporary name) — and by `interface/` (stdout,
   stderr, exit code).
3. **The domain is pure**: no I/O, no clock, no environment. Paths are handled by
   `domain/paths.ts`, not `node:path`.
4. **A secret never leaves memory**: the key of a named profile is read from the environment by
   `ResolveProfile` and lives only in the returned map; commands print names.
5. **Frozen literals stay in one place** (`ID_PATTERNS`, `LLM_VARIABLES`, `RESERVED_VIRTUAL_ROOTS`,
   `RESERVED_TEAM_FOLDERS`, `PHASES`, `LEVELS`, `EXIT`, `WORKBOOK_HEADINGS`, `FINDING_CODES`, the stub settings): change the emitter and its
   readers together.
6. One concept per file, small files, names from the plan's vocabulary (workshop, workbook,
   mounts, attempt, run).

The rules are enforced twice: `npm run test:arch` (dependency-cruiser, `.dependency-cruiser.cjs`)
and `tests/arch/dependency-direction.test.ts` (runs the same configuration, plus an import scan
and the `console` rule), so `npm test` fails on a violation.

### Adding a use case

1. **Domain first.** Add or extend the entity or value object under `src/domain/` with its rule
   as a pure function, and test it in `tests/domain/` (no fake needed).
2. **Port, if the outside world is involved.** Add an interface under `src/application/ports/`
   (and export it from `ports/index.ts`). Name it after what the use case needs, not after the
   technology.
3. **Use case.** One class under `src/application/use-cases/` with the ports in its constructor
   and one `execute()` method returning a plain result. Expected failures throw
   `ApplicationError` (`team-not-found`, `file-not-found`, `invalid-input`, `write-failed`,
   `process-failed`; `not-implemented` for a request a later lot will serve, which exits 3;
   `interrupted` — an `InterruptedError` — for a command asked to stop, which exits 130) or
   `DomainError`.
4. **Test it with fakes** from `tests/fakes/` (`InMemoryFileSystem`, `FakeProcessRunner`,
   `FakeHttpProbe`, `FakeEnvironment`, `FixedClock`, `FakeLlmRecorder`, `FakeLlmStub`,
   `FakeShutdownSignal`; `RecordingOutput` for the commands); add a fake for a new port. Coverage of `domain/` and `application/` must stay ≥ 80 % of lines.
5. **Adapter.** Implement a new port under `src/infrastructure/`, add it to `Adapters` in
   `node-adapters.ts`, and test it against the real thing in `tests/infrastructure/` (temp
   directory, local HTTP server).
6. **Command.** Register it in `src/interface/commands/<name>.ts` with `session.run(...)`,
   add the use case to `Services` (`services.ts`), wire it in `program.ts`, and return an `EXIT`
   code. To implement a stub, remove its entry from `PLANNED_COMMANDS` in
   `commands/not-implemented.ts`.
7. **Prove the wiring**: a case in `tests/interface/program.test.ts` (fakes, exact output) and,
   for a command scripts depend on, one in `tests/e2e/cli.test.ts` (the built binary).

## Development

```bash
npm ci            # install exactly what package-lock.json pins
npm run build     # tsc → dist/
npm test          # builds, then vitest with v8 coverage (thresholds on domain/ and application/)
npm run test:arch # dependency-cruiser only
npm run lint      # type-check src + tests, then test:arch
npm run ci        # npm ci && npm run build && npm test
```

Node ≥ 20 (the image has Node 24). ESM, TypeScript `strict` + `noUncheckedIndexedAccess`,
target `es2022`, module `NodeNext` — relative imports carry the `.js` extension.

Tests need no TTY, no network beyond connections to `127.0.0.1` and no writable home. The tests
write only under the system temp directory (vitest itself keeps its cache in
`node_modules/.vite` and its coverage scratch in `coverage/`). The end-to-end tests run
`bin/orkeon-bench` from `dist/` on a copy of `tests/fixtures/workshop/` (a small workshop:
`teams/demo/`, `workbooks/demo/`, `tests/demo/`), with stand-in executables on `PATH` for `doctor`,
so they never call the machine's `orkeon`; they also run the `run.sh` that `scaffold` writes, with a
stand-in `orkeon` that prints its arguments, and `attempt` → `run --level L2` → `report validate` with
a stand-in `orkeon` that asks the real stub server once and writes its answer under `/output` — two
`attempt open` started together and a run stopped by SIGTERM included.
`tests/fixtures/runs/*.events.jsonl` are event streams recorded from `orkeon run` on a build of fb26364.
`tests/fixtures/scenarios/template.scenario.json` is a copy of the harness template
`.claude/templates/scenario.json`: change both together.

The suite takes about 10 s on a local disk (the image build). On a bind-mounted workspace under
load, starting a Node process takes seconds and dependency-cruiser close to a minute, so the
suite can take a few minutes; the timeouts in `vitest.config.ts` are generous for that reason.

Runtime dependencies: `commander` (CLI), `zod` (schemas), `yaml` (STATUS.md front matter).
Development: `typescript`, `vitest`, `@vitest/coverage-v8`, `dependency-cruiser`, `@types/node`.
The versions are the latest that still run on Node 20.

### Installed in the image

```dockerfile
COPY bench/ /usr/local/share/orkeon-bench/
RUN cd /usr/local/share/orkeon-bench && \
  find . -type f \( -name '*.sh' -o -name '*.json' -o -name '*.ts' -o -name '*.md' -o -name '*.cjs' -o -path './bin/*' \) -not -path './node_modules/*' -exec dos2unix -q {} + 2>/dev/null || true; \
  npm ci --no-audit --no-fund && npm run build && npm test && npm prune --omit=dev && \
  chmod +x bin/orkeon-bench && ln -sf /usr/local/share/orkeon-bench/bin/orkeon-bench /usr/local/bin/orkeon-bench && \
  orkeon-bench --version
```

`dos2unix` comes first: sources checked out on Windows may carry CRLF line endings, which the
launcher `bin/orkeon-bench` and the tests do not survive.

`bin/orkeon-bench` resolves `dist/` from its real path, so the symlink works; after
`npm prune --omit=dev` only `commander`, `yaml` and `zod` remain in `node_modules/`.
