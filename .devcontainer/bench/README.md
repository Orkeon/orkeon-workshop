# orkeon-bench

The bench CLI of the Orkeon harness: the typed, tested logic that skills, hooks and CI call
instead of shell snippets (plan § 7.5). It reads a team of the workshop — its folder
`teams/<slug>/`, and its workbook and tests next to `teams/`, in `workbooks/<slug>/` and
`tests/<slug>/` (D29) — and answers in text or JSON.

**State: lot 1.** Seven commands are real; the others exist as stubs that exit 3.
References established on Orkeon main at 24ab0d0 (`1.0.0-rc.4.src.20260930.g24ab0d0`, D32). `plan § x.y` here and in the sources refers to the
design document of the harness, the
[Orkeon Workshop plan](../../docs/orkeon-workshop-plan.md).

## Commands

| Command | Does | Exit |
|---|---|---|
| `orkeon-bench --version` | prints the bench version | 0 |
| `orkeon-bench doctor [--json \| --quiet]` | checks `orkeon --version`, `orkeon run --list-tools` (80 names on `main` at 24ab0d0, without configuration), `esbuild`, `python3 -c "import yaml"`, Ollama at `http://127.0.0.1:11434/api/tags` (warning only), one request at a time for a local model (a `RateLimiting.MaxConcurrentRequests` in the user's settings when their base URL is local — a failure when absent, 0 or below, which Orkeon reads as unlimited; a limit set by hand is kept; a limit of 1 without `QueueLimit` warns), the typings `/usr/local/share/orkeon/typings/orkeon.d.ts`, the workshop layout; no stray settings file (check `stray-settings`, a failure): an `appsettings/appsettings.json` or `_shared/appsettings.json` above the teams, in a team folder or in its `crew/`, or a `crew/appsettings.json`, which Orkeon reads **instead of** the machine's settings for every run that names no settings file (Orkeon Studio names none unless an Expert pins one); an `appsettings.json` or `appsettings.<environment>.json` at the root of a team folder, which Orkeon reads **beneath** the settings of every run started from it | 0 no check failed (warnings allowed), 1 a check failed |
| `orkeon-bench status <team> [--json]` | reads `workbooks/<slug>/STATUS.md` (front matter + log) and reports inconsistencies as warnings | 0 |
| `orkeon-bench mounts <team> [--env <name>] [--json]` | prints the mount arguments of `orkeon run` derived from `mounts.json`: the team's own folders, or with `--env <name>` the mount set `mounts.<name>/<slug>/`; the same refusals and warnings as `scaffold` | 0 |
| `orkeon-bench scaffold <team> [--json]` | writes, from `mounts.json`, the launchers `run.sh` (mode 0755) and `run.cmd` (CRLF) — which also pass the team's settings file `settings/<slug>/appsettings.json` with `--settings` when it exists (D33) — the `mounts` of `studio-team.json` (its other keys kept; the card is created when missing), the folders of the mount points inside the team, each with a `.gitkeep`, and the team's `.gitignore` (the content of those folders stays out of git); refuses a mount point its agents must never reach and warns about any other folder outside the team ([the mount reach rule](#the-mount-reach-rule), D40) | 0 |
| `orkeon-bench report validate <file> [--json]` | checks a `report.json` against schema 1.0 and the verdict rule | 0 valid, 1 invalid |
| `orkeon-bench profile <team> <name> [--json]` | shows the `ORKEON_Llm__*` variables a profile would inject — names only, secrets redacted — and whether the profile is remote | 0 |
| `orkeon-bench tools dump [--json]` | records the schema of every tool of `orkeon run --list-tools` as `orkeon run` sends it to the model: a throw-away crew whose agent lists them all runs once against a local recorder (no model is called); prints a Markdown table, or the entries as sent | 0, 1 when a listed tool never reached the model |
| `datasets`, `llm-stub`, `run`, `evaluate`, `capture`, `attempt`, `team` | stubs: `not implemented yet (lot 4)` on stderr; `team rename\|remove` will move or remove the five trees of a team together — its folder, workbook, tests, settings and mount sets — and `doctor` will list the orphans, what remains of a team without `teams/<slug>/` (D39) | 3 |
| `estimate`, `release` | stubs: `not implemented yet (lot 9)` | 3 |
| `check design` | stub: `not implemented yet (lot 3)` | 3 |

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
point refused), a write that fails, or for `tools dump` an `orkeon` missing or failing · `3` not
implemented yet. Errors go to stderr; `--json` output is always snake_case, like `report.json`.

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

> A mount point may not use: the team folder itself; `crew/`, or a folder named `agents`, `tasks`,
> `appsettings` or `_shared` at the root of the team; outside the team, a folder that holds the team
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
| named | `ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model`, `ORKEON_Llm__TimeoutSeconds`, `ORKEON_Llm__ApiKey` (read from `keyEnv` at run time) |
| `stub` | `ORKEON_Llm__BaseUrl=http://127.0.0.1:<port>/v1` (port chosen when the stub server starts, never 11434), `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub` |

#### Is a profile remote?

`profile <team> <name> --json` carries `remote` (boolean), `base_url_host` and `remote_reason`.
The rule is one domain function, `llmTarget` in `src/domain/llm-target.ts`, fed for the machine
profile by `src/domain/orkeon-configuration.ts`. The run gate of the harness (`run-gate.sh`)
mirrors both and is cross-checked against this command, because a remote target needs an
estimate, a cap and an explicit approval before any run: change the two together. Checked on
Orkeon `main` at 24ab0d0 (D32): Orkeon reads no provider key — it infers the provider from the
base URL, then the model name, then the key — and runs its offline echo provider only when no
`Llm` section exists.

1. A base URL decides alone: the profile is remote unless its host is **local**
   (`remote_reason`: `local-host` or `remote-host`). A base URL that cannot be read is remote
   (`unreadable-base-url`).
2. No base URL, but an `Llm` section: Orkeon calls the endpoint of the provider it infers —
   OpenAI's when nothing matches, and `qwen3:8b` alone goes to a hosted Qwen — so the profile is
   remote (`no-base-url`).
3. No `Llm` section anywhere: the echo provider; `remote` is false, `base_url_host` null
   (`not-configured`).

A host is local when it is `localhost`, `::1`, `0.0.0.0`, any address of `127.0.0.0/8`,
`host.docker.internal` (a model served by the host machine, such as Ollama in host mode), or
listed in `HARNESS_LOCAL_LLM_HOSTS` — host names or IP addresses separated by commas or spaces,
case-insensitive, for a model server on the LAN. Hosts only: no scheme, no port. The host of a
base URL is what a URL parser reads (lowercase, IPv6 without brackets).

| Profile | Judged on |
|---|---|
| named | its own `baseUrl` (rule 1), whatever the machine is set to |
| `stub` | never remote; `base_url_host` is `127.0.0.1` |
| `machine` | what a launcher run of the team would read, highest layer first: the `ORKEON_Llm__*` variables; the settings file of the run — the team's `settings/<slug>/appsettings.json` when it exists (the launchers pass it with `--settings`, D33), else the one Orkeon resolves for `<team>/crew`: `crew/appsettings.json`, else the first `appsettings/appsettings.json` or legacy `_shared/appsettings.json` walking up, else `$XDG_CONFIG_HOME/Orkeon/appsettings.json` (default `~/.config/Orkeon/appsettings.json`); the `Llm__*` variables; `appsettings.<DOTNET_ENVIRONMENT, else Production>.json` and `appsettings.json` of the team folder; the `DOTNET_Llm__*` variables. The base URL comes from the highest layer that sets one, the section exists when any layer creates it (rules 1–3) |

For `machine`, the JSON also names `machine.settings_file`, `machine.base_url_source` and
`machine.configured_by`, and a layer that sets `Llm:Provider` gets a warning: Orkeon ignores it.
A settings file that is not strict JSON — comments included, which Orkeon accepts — is an error.

### `report.json`

Schema `1.0`, exactly as plan § 5.7; the top-level keys are fixed (an unknown one is an error).
The verdict rule lives in `src/domain/verdict.ts`:

> ACCEPTED ⇔ every AC passes at its level ∧ every INV passes ∧ every IND is in range.

An AC passes at its level when its status is `pass` **and** the level it names was not skipped. A
report without any AC is never accepted. `report validate` fails when `verdict_input` disagrees
with what the content implies.

## Architecture

Clean Architecture with a DDD domain (plan § 9.1). Dependencies point inwards:

```
domain  ←  application  ←  infrastructure
                        ←  interface   (composition root: also wires infrastructure)
```

| Layer | Holds | May import |
|---|---|---|
| `src/domain/` | value objects, schemas and rules: `TeamRef`, `Status`, `MountDeclaration` / `MountBinding` / `MountSet`, `Profile`, `BenchConfig`, `Report`, the verdict rule, the remote rule (`llmTarget`), the mount reach rule (`judgeMountReach`), the crew layout (`crewKindOf`), the id families | itself and `zod` — no `node:*`, no other package |
| `src/application/` | use cases (`ReadStatus`, `ResolveMounts`, `ResolveProfile`, `ScaffoldTeam`, `ValidateReport`, `Doctor`, `DumpTools`, `LocateTeam`) and the **ports** they need, in `src/application/ports/` (`FileSystem`, `ProcessRunner`, `HttpProbe`, `Clock`, `Environment`, `LlmRecorder`) | domain, `zod`, `yaml` — no `node:*` |
| `src/infrastructure/` | Node adapters of the ports, gathered in `node-adapters.ts` (`NodeFileSystem`, `NodeProcessRunner`, `NodeHttpProbe`, `SystemClock`, `ProcessEnvironment`, `NodeLlmRecorder`) | domain, application, `node:*` |
| `src/interface/` | the commander CLI: arguments → use case → text or JSON | everything, plus `commander` |

Rules:

1. **No logic in `interface/`.** A command parses its arguments, calls one use case and formats
   the result (`toText`, `toJson`). A decision, a computation or a parsing rule belongs to the
   domain or to a use case.
2. **No `console` outside `interface/`**, and commands write through `Output`. `process` is
   touched in two places only: `ProcessEnvironment` (variables, home, working directory) and
   `interface/` (stdout, stderr, exit code).
3. **The domain is pure**: no I/O, no clock, no environment. Paths are handled by
   `domain/paths.ts`, not `node:path`.
4. **A secret never leaves memory**: the key of a named profile is read from the environment by
   `ResolveProfile` and lives only in the returned map; commands print names.
5. **Frozen literals stay in one place** (`ID_PATTERNS`, `LLM_VARIABLES`, `RESERVED_VIRTUAL_ROOTS`,
   `RESERVED_TEAM_FOLDERS`, `PHASES`, `LEVELS`, `EXIT`, the stub settings): change the emitter and its
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
   `process-failed`) or `DomainError`.
4. **Test it with fakes** from `tests/fakes/` (`InMemoryFileSystem`, `FakeProcessRunner`,
   `FakeHttpProbe`, `FakeEnvironment`, `FixedClock`, `FakeLlmRecorder`; `RecordingOutput` for the
   commands); add a fake for a new port. Coverage of `domain/` and `application/` must stay ≥ 80 % of lines.
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
stand-in `orkeon` that prints its arguments.

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
