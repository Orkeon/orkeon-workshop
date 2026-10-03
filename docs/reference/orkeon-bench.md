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
`status` and `profile` work from the start; `mounts` and `scaffold` need the team folder's
`mounts.json`.

| Exit code | Meaning |
|---|---|
| `0` | done, and what was checked holds |
| `1` | checked, and it does not hold |
| `2` | bad usage or input: unknown team, missing file, malformed JSON, unknown mount set or profile |
| `3` | not implemented yet |

## `doctor` — is everything in place?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20260930.g24ab0d0
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20260930.g24ab0d0
PASS  orkeon tool catalogue           80 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
WARN  Ollama reachable                http://127.0.0.1:11434/api/tags: ECONNREFUSED (OLLAMA_MODE=off?)
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
Result: OK
```

`stray settings files` fails when Orkeon would find a settings file on its own. An
`appsettings/appsettings.json` or `_shared/appsettings.json` above the teams, in a team folder or in its
`crew/`, or a `crew/appsettings.json`, is read **instead of** the machine's settings for every run that
names no settings file — and Orkeon Studio names none unless an Expert pins one. An `appsettings.json` or
`appsettings.<environment>.json` at the root of a team folder is read **beneath** the settings of every
run started from it, the launchers' and Studio's, `--settings` or not. A team's own settings live in
`settings/<slug>/appsettings.json`. A warning does not fail the result. `--quiet` prints nothing unless a
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
the command names no other.

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
or a folder named `agents`, `tasks`, `appsettings` or `_shared` at its root, and outside the team a
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

`machine` uses what Orkeon would read for a run of the team through its launchers or the bench (Studio
reads its own settings): the `ORKEON_Llm__*` variables, the
team's `settings/<slug>/appsettings.json` (else a settings file next to the crew or in an `appsettings/`
— or legacy `_shared/` — folder above it, else the container's `~/.config/Orkeon/appsettings.json`), and
the appsettings files of the team folder. `stub` is the simulated model, planned for lot 4 (`llm-stub`
answers `not implemented yet` today); other names come from `tests/<slug>/bench.config.json`. Secrets
are never printed — only variable names. A profile is remote unless its base URL is on a local host
(`localhost`, `::1`, `0.0.0.0`, `127.0.0.0/8`, `host.docker.internal`, or a host listed in
`HARNESS_LOCAL_LLM_HOSTS`); a configuration
without a base URL is remote too, since Orkeon then picks a hosted provider itself. The run gate applies
the same rule.

## `report validate <file>` — is a report sound?

Checks a `report.json` against its schema (version 1.0) and the verdict rule — accepted ⇔ every
acceptance criterion passes at its level, every invariant holds, every indicator is in range.

```bash
orkeon-bench report validate workbooks/notes-digest/attempts/ATT-0001/report.json
```

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
this way for Orkeon `main` at 24ab0d0. A tool whose schema reaches the model empty shows `none in the schema`.

## Planned commands

They exist and answer `not implemented yet` with exit code 3:

| Command | Lot | Will |
|---|---|---|
| `datasets build <team> [<set>]` | 4 | materialise a team's synthetic datasets |
| `llm-stub serve --scenario <file>` | 4 | serve the simulated model |
| `run <team> [--level L0…L4]` | 4 | run the test levels and write the report |
| `evaluate`, `capture`, `attempt open/close` | 4 | recompute a report, prepare the reviewer's capture, manage attempts |
| `team rename`, `team remove` | 4 | move or remove the five trees of a team together: its folder, workbook, tests, settings and mount sets |
| `check design` | 3 | check a design against the known pitfalls |
| `estimate`, `release` | 9 | estimate the cost of a remote run; realign the card and launchers, propose the tag |

From lot 4, `doctor` also lists the orphans: a workbook, tests, settings or a mount set left without
`teams/<slug>/` — Studio's Rename, Duplicate and Delete touch the team folder alone.

The files the bench reads (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) and its
architecture are described in its [README](../../.devcontainer/bench/README.md).
