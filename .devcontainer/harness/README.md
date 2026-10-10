# Orkeon harness

Everything the `orkeon-workshop` image deploys into a workshop so that Claude Code can design, build,
test, evaluate, fix and release **Orkeon agent teams** (YAML, TypeScript, C#) and Orkeon tools in C#.
Plain files — Markdown, JSON, bash — plus the evals that check them. Orkeon targeted: `main`, which the
image builds from the sources (references established at ce9ec1f). State: the mechanics and the
references are in place and tested (lots 0 and 1); the first `team-*` skills — `team-init`, `team-need`,
`team-decision`, `team-status` — and the approvals the user types (`/team-approve`) exist (lot 2), and
so do `team-test-plan` and `team-design`, with the bench's checks of gates 2 and 3 (lot 3, whose exit
criterion is not met yet: the pilot's criteria and test plan wait for the project owner's approval, and
its design follows it), and `team-tests`, which has the two test subagents write the tests before the
team (lot 5, delivered on 2026-10-10; its exit criterion waits for the pilot's design); `deploy` packs a
team into an archive for another workshop (D45). The other skills arrive in lots 6 to 9. Since lot 11
(D48–D55, `docs/profiles-design.md`) the harness is a set of **packs** composed into **profiles**: a
workshop that chooses none runs `user`, the harness this page describes, unchanged; the other profiles
serve whoever contributes to a repository, develops it, releases it or keeps its documentation true, in a
workshop or in a git checkout of the repository.

## What is here

| Folder | Content | Lands in the workshop (`/workspace`) as |
|---|---|---|
| `HARNESS.md` | the harness entry point: what the workshop is, the process, the rules of engagement | `.claude/harness/HARNESS.md` |
| `claude/` | `settings.json`, skills, agents, rules, hooks, lib, templates | `.claude/` |
| `claude/CLAUDE.workshop.md` | the workshop's own `CLAUDE.md`: one line importing `@.claude/harness/HARNESS.md`, then local notes | `CLAUDE.md` — created once |
| `claude/gitignore.workshop` | what git should not carry: runs, the mount sets, build output, local settings, keys | `.gitignore` — created once |
| `claude/gitattributes.workshop` | one rule, `* -text`: git stores and checks out every file byte for byte, so that a Git that converts line endings (Git for Windows, by default) does not hand the container its scripts in CRLF (D44) | `.gitattributes` — created once |
| `claude/settings.local.seed.json` | local settings: no permission prompt | `.claude/settings.local.json` — created once |
| `claude/devcontainer.workshop.json` | the VS Code configuration of the workshop: open the folder, Reopen in Container | `.devcontainer/devcontainer.json` — created once |
| `claude/settings-readme.workshop.md` | what a team's settings file `settings/<slug>/appsettings.json` does and must hold (D33) | `settings/README.md` — created once |
| `references/` | reference documents (`README.md` is the index) | `references/` |
| `library/` | the README of each shelf of reusable bricks | `library/` — created once |
| `examples/` | the three pilot teams, built in lots 2–8: their READMEs and, for `mail-triage`, its workbook and its tests folder | `library/examples/` |
| `evals/` | the runner and the cases | `.claude/evals/` |
| `profiles/` | the definitions of the profiles and of the packs (`packs/<pack>.yaml`: the spaces a pack fits, the files it owns, the switches it turns on), read by `/workshop-profile` and `sync-harness.sh` — [its README](./profiles/README.md) is the reference | `.claude/harness/profiles/` |
| `packs/` | the files of every pack but `core` and `workshop`: `contrib`, `dev`, `quality`, `release`, `docs-audit`, `usage`, `source`, and the repository packs `repo-orkeon`, `repo-orkeon-workshop` | when the profile holds the pack: `packs/<pack>/claude/**` in `.claude/`, the rest in `.claude/harness/packs/<pack>/` |
| `README.md`, `THIRD-PARTY.md`, `FROZEN-LITERALS.md`, `VERIFICATIONS.md` | this file, the licence of what was adapted, the frozen strings, the record of what was checked on the installed Orkeon | `.claude/harness/` |

The entry point is deliberately **not** `.claude/CLAUDE.md`: that path is a project-memory location
Claude Code loads by itself, and the import from the workshop's `CLAUDE.md` would load it a second time.

`plan § x.y` and `D<n>` in these files (hook headers, agent charters, comments) refer to the design
document of the harness repository, the Orkeon Workshop plan (`docs/orkeon-workshop-plan.md`) —
versioned with the repository, not deployed into the workshop. They never mean a team's
`workbooks/<slug>/PLAN.md`.

## How it is deployed

The Dockerfile copies this folder to `/usr/local/share/claude-harness/`, runs the evals there (the
image does not build if a case fails) and writes a manifest. At container start `sync-harness.sh`
brings the workshop (`ORKEON_WORKSHOP`, default `/workspace`) in step with it — when it is one: a
folder the harness was deployed into, one holding `teams/`, or an empty one. It leaves anything else
alone (a source project mounted on `/workspace`) and says so; `sync-harness.sh --adopt` makes such a
folder a workshop, once. `HARNESS_SYNC=off`, set on the container, turns the synchronisation off. At
each start it also warns about a settings file Orkeon would read on its own for every run that names
none (an `appsettings/` or `_shared/` folder in the workshop or in `teams/`). And at each start it puts
every script of `.claude/` — every `*.sh` and `*.py` there, `.claude/local/` and the worktrees Claude
Code keeps there aside — in LF and makes it executable, as the image does to its own harness when it is
built; `.claude/` alone, so that a start stays short. It warns when a team's launcher
`teams/<slug>/run.sh` or its status file `workbooks/<slug>/STATUS.md` is in CRLF: the sign of a workshop
checked out by a Git that converts line endings, whose own files it does not rewrite (D44).

**Profiles** (lot 11). The synchronisation deploys the packs of the folder's profile that fit it — the
profile of `.claude/local/profile`, else the container variable `HARNESS_PROFILE`, else `user` (`core`
and `workshop`: every file outside `packs/`). `workshop-profile.py --resolve` names the space and the
packs and filters the image manifest, so a file a new profile leaves out is removed like a file the image
no longer ships. A folder is a **source** space when it is the top of a git work tree that is not a
workshop and its profile fits one (`dev`, `release`, `docs`, `contrib`, `all`, `custom`); recorded in
`.claude/.harness-space`. There nothing is seeded and no workshop skeleton is made; a deployment that would
write one file git tracks is refused whole; the deployed files, `.claude/local/`, `.claude/.harness-*`,
`.claude/settings.local.json` and `todo/` are listed in a block of `.git/info/exclude`, rewritten at every
start; and the hooks made for a workshop (`run-gate`, `guard-phase`, `team-approve`, `status-check`,
`session-doctor`, `workshop-language`) exit at once. The profile is switched with `/workshop-profile`, or
the `workshop-profile` command of the image in a folder that has no harness yet.

- **managed** files (`claude/**`, `references/**`, `examples/**`, `evals/**`, the top-level documents
  above): the image is authoritative. A file edited locally is saved under
  `.claude/harness-backup/<stamp>/` before being replaced; a file the image no longer ships is removed;
  a file that differs from the image's by its line endings only — a checkout converted them to CRLF,
  and bash refuses such a hook (`set: pipefail: invalid option name`) — is put back as shipped, with
  no backup, at a start where the image has not changed too as soon as one hook is in CRLF (D44). A
  file is written beside its target, then renamed over it: a workshop cloned from the Windows host shows
  in the container as another user's files, which cannot be rewritten in place with their times.
- **seeded** files (`CLAUDE.md`, `.gitignore`, `.gitattributes`, `settings.local.json`,
  `.devcontainer/devcontainer.json`, `settings/README.md`, `library/**`): created when absent, never
  touched again.
- never touched: `teams/`, `workbooks/`, `tests/`, `settings/` (the teams' own Orkeon settings, D33), the
  mount sets `mounts.<name>/`, `.claude/local/`, `references/local/`, whatever you add to `library/`.

Hook commands are written `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh"`: the workshop is the
project Claude Code opens.

## The guards

| Hook | Event | What it does | Tune with |
|---|---|---|---|
| `run-gate.sh` | PreToolUse `Bash` | Classifies every `orkeon run`, `orkeon-harness-run`, `./run.sh`, `run.cmd` and `orkeon-bench run` of a command — all of them, not just the first — as `validate`, `stub`, `machine`, `local` or `remote`. Remote is decided by the rule the bench applies (`llmTarget`, shown by `orkeon-bench profile --json`): a named profile on its own `baseUrl`, whether given by `--profile` or taken by `orkeon-bench run` from the level it reaches (`levels.e2e_remote.profile` for `--level L4`); the `machine` profile on every configuration layer Orkeon reads for the run, in its order — the `ORKEON_Llm*` variables of the command and of the environment, the settings file it resolves for the crew, the `Llm*` variables — the default provider and every named profile `Llm:Profiles:<id>` judged, an `Llm` section without a base URL counting as remote. A remote run is denied unless the team's open attempt holds an approval. Every run is logged to `.claude/run-log.tsv` | `HARNESS_LOCAL_LLM_HOSTS`, `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` |
| `bash-dispatch.sh` | PreToolUse `Bash` | One parse, then the modules of `lib/` in order: `guard-user-gate` (denies a command that writes `gate_passed` into a `STATUS.md` — `sed -i`, a redirect, a one-liner: gates 1–3 are the `team-approve` hook's, D36; reading stays free), `guard-git` (off by default), `guard-cat-bounds`, `guard-diff-bounds`, `rewrite-rtk`; `batching-nudge` advises on top. The answer of rtk is passed through untouched: rtk approves a rewritten command only when the user's own allow rules cover it, and leaves it alone under a deny rule | `HARNESS_GUARD_GIT`, `HARNESS_READ_BOUNDS_*`, `HARNESS_BOUNDS_FLAT_PCT`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_BATCHING_*`, `HARNESS_RTK_BIN` |
| `read-bounds.sh` | PreToolUse `Read` | Denies an unbounded Read past 120 lines or 8 kB, with the outline of the file (40 lines); the identical Read re-issued passes. Always read whole: the instruction files — skills, agent charters, rules, `CLAUDE.md`, `HARNESS.md`, references, templates — binary files, and a flat file whose outline weighs a third of it. Every Read that goes through feeds `lib/delegation-nudge.sh`, which advises delegating once the main thread has read six source or definition files itself, then at each doubling; `delegation-guard` restarts the count at each spawn | `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT`, `HARNESS_DELEGATION_NUDGE_THRESHOLD` |
| `delegation-guard.sh` | PreToolUse `Agent` | Requires a description and an explicit model (or a charter that pins one); appends the `DONE` / `BLOCKED` report contract to the prompt, with a line cap on the final message (20; twice for a plan, a run summary or judgements; six times for a review); restarts the count of the delegation nudge | `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` |
| `secret-guard.sh` | PreToolUse `Edit\|Write\|MultiEdit\|NotebookEdit` | Denies writing a key pattern under `teams/`, `workbooks/`, `tests/`, `settings/`, a mount set `mounts.<name>/`, `library/`, `references/`, `.claude/` (where the scripts handed to the user live, `.claude/local/scripts/`, D47); never echoes the secret | `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` |
| `make-executable.sh` | PostToolUse `Edit\|Write\|MultiEdit` | Gives a script Claude has just written or edited its executable bit when it lacks it — a `*.sh`, or a `*.py` whose first bytes are `#!`, inside the workshop, `workbooks/*/runs/`, `node_modules/`, `.git/` and `.claude/harness-backup/` aside; nothing else is touched, and never a byte of the file. A script written in CRLF is said to the model through `additionalContext` (`make-executable:`), so that it writes it again in LF. Silent otherwise, on a mount that keeps no mode included: the line handed to the user is `bash <path>` for that reason (`HARNESS.md` rule 10, D47) | `HARNESS_MAKE_EXECUTABLE` |
| `guard-phase.sh` | PreToolUse `Edit\|Write\|MultiEdit\|NotebookEdit` | Role × phase × folder, for the four folders of a team — `teams/<slug>/`, `workbooks/<slug>/`, `tests/<slug>/`, `settings/<slug>/` (the last two count once the team folder or its workbook exists). No subagent writes a settings file: `settings/<x>/` of any team, a settings file of a team folder (`appsettings*.json` at its root or in `crew/`, `appsettings/`, `_shared/`), an `appsettings/appsettings.json` or `_shared/appsettings.json` anywhere in the workshop (D40); the main thread may, and the checks flag such files. In a team whose `STATUS.md` has a phase, `crew/` (and the `src/` of a C# tool folder) is written only in phase `build` and `tests/<slug>/` never during it (a team without a `STATUS.md` phase — a prototype — is not held); `runs/` never. A closed attempt is read-only for everyone; in an open one, Edit and Write reach `ANALYSIS.md` and `FIX-PLAN.md` only, from the main thread only — the rest of an attempt is `orkeon-bench`'s. In `STATUS.md`, no write raises `gate_passed` while a user gate (`need`, `test-plan`, `design`) is not passed: those are `team-approve`'s (D36); lowering it and the later gates stay with the skills. Each subagent is held, within the four folders of its team, to its write scope; `team-reviewer`, `run-analyst` and `judge` write nothing there. Paths are normalised (`..`) and folder names compared without regard to case | — |
| `subagent-report-shape.sh` | SubagentStop | Sends back a `## DONE` / `## BLOCKED` report missing a required line or the exit code of its command, and a review of `team-reviewer` missing its verdict, its gap table or (on `ITERATE`) its fix table; shape only, once | — |
| `team-approve.sh` | UserPromptExpansion (command `team-approve`), UserPromptSubmit | Records the approval the user types, before the model reads it (D36): `/team-approve need\|test-plan\|design [<slug>]` writes `gate_passed`, `next_action`, `updated_at` (and `phase` on the light track) and one journal line in `workbooks/<slug>/STATUS.md` (a pilot's in `library/examples/workbooks/<slug>/`, only when the line names it), for a team that waits for that gate, whose artefacts exist, are no longer their raw template and carry no `> To revise — DEC-nnnn` line, and whose step has submitted the gate (`next_action: /team-approve <gate> …`; a paused interview is not approved) — on the light track `/team-approve need`, taken in phase `need` or `test-plan` while no gate is passed; `/team-approve remote <usd> [<slug>]` calls `orkeon-bench attempt approve`, which alone writes `remote-approval.json` in the open attempt (D19) — after checking that `STATUS.md` can take the journal line, so that a marker is never written behind a refusal. Recorded: `additionalContext` for the model, `systemMessage` for the user. Refused: the prompt is blocked with the reason, nothing is written. The line reaches the hook once per event, with one `prompt_id`, and is recorded once. Any other prompt: silent | `HARNESS_TEAM_APPROVE`, `HARNESS_TEAM_APPROVE_BENCH_TIMEOUT` |
| `status-check.sh` | Stop | After a `team-*` skill, blocks once if no `workbooks/<slug>/STATUS.md` (or `workbook/STATUS.md` of a C# tool) was written since — by Edit or Write, by a Bash command that writes it, or by the script of `/team-init`. `team-status` (it only reads) and `team-approve` (its hook has already written) are exempt | `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` |
| `session-cleanup.sh` | SessionStart | Drops the session's escape-hatch files in `/tmp`, purges those older than two days | — |
| `session-doctor.sh` | SessionStart | Runs `orkeon-bench doctor -q` and hands its failing checks (one line each, on stderr) to the model through `additionalContext`, so that the session says what is broken before building on it. Silent when every check passes, without `orkeon-bench`, when the doctor does not answer in time, and after a compaction | `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` |
| `workshop-profile.sh` | SessionStart | When the folder runs a profile other than `user`, one line of `additionalContext`, `workshop-profile: <profile> (<packs>) — /workshop-profile to change`, the packs read from `workshop-profile.py --resolve`. Runs for `startup` and `clear` only. Silent on `user`, so a workshop that never chose a profile starts as before; a `.claude/local/profile` that does not hold a profile name is said in one line and `user` applies, its content never repeated | `HARNESS_WORKSHOP_PROFILE` |
| `dev-batch-guard.sh` | UserPromptSubmit, PreToolUse `Skill` | One `/dev-implement` batch per session: refuses the launch of a second batch when the transcript already holds the closing line of one (`→ Batch F<n> complete — manual validation required.`, assistant text only). Lets through a correction (`— correction:`), any other prompt or skill, and the identical launch issued a second time. Adapted from `claude-code-toolkit` | `HARNESS_DEV_BATCH_GUARD` (`0` by default, `1` with the `dev` pack) |
| `context-log.sh` | InstructionsLoaded | Appends one tab-separated line per instruction file that enters the context — time, load reason, memory type, bytes, ≈ tokens, path, session, agent — to `.claude/local/context.log`, which keeps at most 256 KiB; `/token-usage` reads it. Observes only. Adapted from `claude-code-toolkit` | `HARNESS_CONTEXT_LOG` (`0` by default, `1` with the `usage` pack) |
| `clear-nudge.sh` | UserPromptSubmit | Reads the `usage` of the last assistant message of the main chain: one line of `additionalContext` (`clear-nudge:`) each time the context the next turn replays crosses a step of 150 000 tokens, once per step and session (`.claude/local/clear-nudge.tsv`). Advisory. Adapted from `claude-code-toolkit` | `HARNESS_CLEAR_NUDGE` (`0` by default, `1` with the `usage` pack) |
| `workshop-language.sh` | SessionStart | When the workshop names its language (`.claude/local/language`, one line, a language tag, written by `/workshop-language`; D41), tells the session through `additionalContext` to talk in it whatever the user types and to write the prose of the workbook in it, and points at `.claude/rules/workbook.md` § "Tone and language" for what stays in English. Runs for every source, a compaction included. Silent without the file or with an empty one; anything else there — a value that is not a tag, a folder, a symbolic link, which is never followed — is said and ignored, and never repeated: only a tag reaches the context | `HARNESS_WORKSHOP_LANGUAGE` (`0` stops the reminder; the file and the rule still stand) |

House rules for a hook: exit 0 on empty or invalid input and when a dependency (`jq`, `python3`,
`rtk`) is missing; every threshold is an environment variable; every refusal says why and what to
do instead; messages in English; a message meant for the model goes through the JSON of the hook,
never bare stdout. `lib/team-common.sh` holds what the team-aware hooks and the script of `/team-init` share (team root,
a key of `STATUS.md`, the rank of a gate, open attempt), `lib/bounds-common.sh` what the two read
guards share.

Switches go in `.claude/settings.local.json` (`env`), which the image never overwrites; `/workshop-profile`
writes there only the switches of its packs and the visibility of the harness's skills (`skillOverrides`),
the keys it records in `.claude/local/profile.owned.json`. `settings.json`
sets the defaults and two families of `permissions.deny`: no Read under `node_modules`, `bin`, `obj`,
`.git`; no Edit — which covers every file-editing tool — under `workbooks/*/runs/**`, written
by `orkeon-bench` alone. Attempt folders are not under a permission rule: who may write what in
them depends on whether the attempt is open, which only `guard-phase` can tell. Hooks apply in
every permission mode, which is why `workshop` can start Claude Code with
`--dangerously-skip-permissions` (D42): that option, not the `defaultMode` of the seed, is what puts
a session in bypass mode — Claude Code never takes it from a project's settings (V-19).

### What the guards are not

- `make-executable` sets a mode; it does not make a script run. A workshop mounted from Windows keeps
  no mode (D44), and a `chmod` there fails without a word: the script is handed as `bash <path>`, which
  needs none, and the hook's bit serves whoever runs the script by its name on a mount that keeps it.
- `run-gate` is a tripwire against an unapproved or looping paid run, not a proof of who approved: it
  cannot tell who wrote the marker, and it does not see a run started from inside another program
  (a `dotnet run` host, a script that calls `orkeon`). Commands the user types with `!` are not hooked.
  The marker is written by `orkeon-bench attempt approve`, which `team-approve` calls on the line the
  user types — never by Claude, on its own initiative or from the shell.
- `team-approve` is a trace Claude cannot fill in by mistake, not a proof against a determined agent:
  it records a line the user typed, `guard-phase` refuses the Edit or Write that would raise
  `gate_passed` or touch the marker, and `guard-user-gate` refuses the shell command that names the key
  and writes a `STATUS.md` — but a script that writes the file without naming the key, a `mv` of a
  prepared file, or a nested session that submits the line itself, pass. It checks that the team waits
  for the gate and that the artefacts exist, not that they are good. When the hook does not run (hooks
  disabled, `python3` missing, `HARNESS_TEAM_APPROVE=0`), nothing is recorded, and the skill
  `team-approve` says so.
- Remote or local is one rule with two implementations, `run-gate.sh` and `llmTarget` of the bench
  (`FROZEN-LITERALS.md` § 3; the eval file `bench-contract` compares them). Local hosts are
  `localhost`, `::1`, `127.0.0.0/8`, `0.0.0.0`, `host.docker.internal` and the hosts named in
  `HARNESS_LOCAL_LLM_HOSTS` (a GPU box of the LAN). The `machine` profile is a remote run as soon as
  the base URL Orkeon will use leaves those hosts, or when an `Llm` section exists without a base URL:
  Orkeon then infers the provider and calls its endpoint (it reads no `Provider` key). What Orkeon
  will see is read in its own order — `ORKEON_Llm__*` variables of the command or the environment, the
  settings file of the run (the team's `settings/<slug>/appsettings.json`, which the launchers pass with
  `--settings`, D33; else `crew/appsettings.json`, an `appsettings/appsettings.json` — or a legacy
  `_shared/appsettings.json` — above it, else the user's file), then `Llm__*` variables — and the
  default provider is judged with every named profile `Llm:Profiles:<id>`, which any agent may name: the
  run is remote when one of them is. `HARNESS_RUN_GATE_READ_SETTINGS=0` stops the gate from reading files.
- The gate reads a base URL literally: an exotic spelling of a local host (`127.1`), a backslash or
  a shell variable in the value make the run remote. It refuses more than the bench, never less.
- The run log keeps every command line, with the value of an inline credential and the credentials
  of a URL replaced by `<redacted>`.
- `guard-phase` sees Edit and Write, not Bash: what `orkeon-bench` writes in an attempt, or a shell
  redirect, does not go through it.
- `guard-phase` reads `phase` only to freeze the folders. It denies a write in `crew/` outside the
  build phase and names `/team-decision`; until `/team-build` ships (lot 6), the user moves the phase to
  `build` in `STATUS.md` by hand. With the rest of D36 (lot 6), it will read `gate_passed` before a
  write in `crew/`, keep `tests/<slug>/` frozen from the first build until `ACCEPTED`, and leave the
  `crew/` of an adopted prototype writable before its first build.
- `status-check` only knows the `team-*` skills, and only that `STATUS.md` was written, not what it says.
- `session-doctor` reports what `orkeon-bench doctor -q` prints, and nothing when the doctor takes more
  than `HARNESS_SESSION_DOCTOR_TIMEOUT` seconds (20; whole seconds, 1 or more).
- Not shipped yet: `post-run-archive.sh` (lot 7).

## The evals

```bash
bash .devcontainer/harness/evals/run.sh                 # in this repository
bash /usr/local/share/claude-harness/evals/run.sh       # in the image (run at build)
bash /workspace/.claude/evals/run.sh                    # in a workshop
bash evals/run.sh -v evals/cases/run-gate.json          # one file, with the hook output
```

The runner finds the hooks from its own location (`../claude/hooks` or `../hooks`), drops every
`HARNESS_*` and `ORKEON_Llm__*` variable of the caller, gives each case file its own fixtures folder
and removes everything when it ends. It needs `bash`, `jq`, `python3`, `git` and the base utilities;
`rtk` and `orkeon-bench` are used when present. It prints `PASS` / `FAIL <name> — <gaps>` per case,
then the total, and exits non-zero on any failure. A case that cannot run where it is (PyYAML,
`orkeon-bench` or the installed `orkeon` missing) prints `ok (skipped: <why>)`: it is listed as `SKIP`,
counted as passed and numbered apart in the total; with `HARNESS_EVALS_STRICT=1`, which the image build
sets, a skip is a failure.

A case is JSON: `fixtures` (files generated for the case file), then `hook` + `input` (a payload on
stdin) or `cmd`, optional `pre` payloads and `env`, and `expect` — `decision`, `reason`, `command`,
`prompt`, `context`, `exit`, `stdout`… matched by substring. `{{FIX}}`, `{{CLAUDE}}`, `{{ROOT}}` and
`{{SID}}` are expanded everywhere. The header of `evals/run.sh` is the reference.

Policy: **a defect found in use becomes a case; a hook or script change without a case is not
finished.** An eval proves what a script emits, not what the model does with it: of a skill, the
`layout` cases pin the sentences its protocol rests on (one question for one decision in `/team-need`,
the routing table of `/team-decision`…), and `team-init` runs its script. The behaviour of the skills is
checked on the pilot teams of `examples/`, as lots 2 to 8 build them — `mail-triage` first, whose need
is written and approved (gate 1).

### Probes to replay in a live session

An eval never proves that Claude Code applies what a hook emits. After a rebuild or a Claude Code
update, replay these once in the workshop:

| Mechanism | Probe | Expected |
|---|---|---|
| `delegation-guard` (`updatedInput.prompt`) | spawn any subagent, then open its transcript | the `--- Report contract (delegation-guard) ---` block ends the prompt it received |
| `subagent-report-shape` (SubagentStop block) | ask a subagent to end with `## DONE` and no `- Command:` line | it re-emits a complete report by itself |
| `guard-phase`, `secret-guard` (PreToolUse deny) | write a file under `tests/<slug>/` while `workbooks/<slug>/STATUS.md` says `phase: build`; write a fake `sk-…` key under `teams/` | both refused, the reason shown |
| `run-gate` (PreToolUse deny, log) | `./run.sh --validate`, then `ORKEON_Llm__BaseUrl=https://api.example.com/v1 ./run.sh` in a team without approval | the first runs, the second is refused; two lines in `.claude/run-log.tsv` |
| `guard-phase` on attempts | in the main thread, `Write` `ANALYSIS.md` then `REPORT.md` in an open attempt; ask a subagent to write `ANALYSIS.md` | the first is written, the two others refused |
| `status-check` (Stop block) | run a `team-*` skill and stop without touching `STATUS.md` | one reminder, then the session stops |
| `team-approve` (UserPromptExpansion block, then both prompt events) | `/team-init demo`, then `/team-approve need`; write a `workbooks/demo/NEED.md`, then `/team-approve need` again | the first approval is refused (`UserPromptExpansion operation blocked by hook: team-approve: nothing recorded — …`), the second recorded once: `gate_passed: need` and one `/team-approve` journal line in `STATUS.md`, and Claude says so |
| `guard-phase` on a user gate (PreToolUse deny) | ask Claude to edit `gate_passed: need` into `gate_passed: test-plan` in that `STATUS.md` | refused, the reason naming `/team-approve test-plan`; the file unchanged |
| the resume | `/team-status demo` in a new session | the phase, the gate passed and the next action, read back from the files |
| `session-doctor` (SessionStart `additionalContext`) | start a session where `orkeon-bench doctor` fails a check, and ask what `session-doctor:` reported | the failing lines of the doctor, quoted |
| `workshop-language` (SessionStart `additionalContext`) | `/workshop-language fr`, then a new session where you type only `/team-status` | the answer comes in French; `/team-need` on a new team then writes the prose of `NEED.md` in French under the template's English headings |
| `rewrite-rtk` (`updatedInput.command`) | `grep -rn foo .`, then a command under an `ask` rule | the first runs as `rtk grep …`; the second is rewritten and still asks |
| `permissions.deny` | `Write` a file under `workbooks/<slug>/runs/` | refused by the permission rule, whatever the hooks say |
| rules by path | read `teams/<slug>/crew/agents/x.yaml` | `rules/orkeon-yaml.md` is loaded (`/memory`) |
| `CLAUDE.md` import | `/memory` at session start | `CLAUDE.md` and `.claude/harness/HARNESS.md` appear once each; no `.claude/CLAUDE.md` |

**Replayed so far** (`VERIFICATIONS.md`, V-17): the four rows on `team-approve`, the user gate, the
resume and `session-doctor`, and a three-turn interview of `/team-need` resumed in a new session, on
2026-10-06 with Claude Code 2.1.292, in headless sessions (`claude -p`) on a scratch workshop with this
harness deployed. **Still to replay**, never run in a live session: every other row; and the interview
of `/team-need` in an interactive session, where its questions go through AskUserQuestion — headless,
they came as text.

## Changing something

| Change | Goes in |
|---|---|
| a convention for a file type | the rule in `claude/rules/` — single source, cited elsewhere |
| the shape of a workbook artefact | the template in `claude/templates/`, and `FROZEN-LITERALS.md` if a script reads it |
| a string one script emits and another parses | `FROZEN-LITERALS.md`, the emitter, the parser and their eval, in the same edit |
| event, matcher, hook order, defaults | `claude/settings.json` |
| what Claude must know at every session | `HARNESS.md` — keep it to a screen per section |
| a reference on Orkeon, design, testing | `references/`, with the Orkeon version it was established on |

Everything shipped is in English. `THIRD-PARTY.md` lists what was adapted from
`claude-code-toolkit` and under which licence.
