# The harness

*English · [Français](../fr/reference/harness.md)*

The harness is what makes Claude Code work the workshop's way. The image deploys it into the workshop's
`.claude/`, `references/` and `library/examples/` at each start. Every session loads `CLAUDE.md`, which
imports the entry point `.claude/harness/HARNESS.md`: the layout, the method and the rules of
engagement, on a few screens.

## Skills

A skill is a packaged procedure Claude follows when your request matches it, or when you type its name
after a `/`. The `team-*` skills run only when you type them.

| Skill | State | What it does |
|---|---|---|
| `orkeon-tour` | available | an interactive guided tour of the workshop, in plain words, adapted to your level |
| `orkeon-crew-yaml` | available | designs, writes and checks a YAML team ([guide](../guides/yaml-team.md)) |
| `orkeon-crew-typescript` | available | the same for a TypeScript team with custom tools ([guide](../guides/typescript-team.md)) |
| `orkeon-update` | available | updates Orkeon and Ollama in the container ([Updating](../guides/updating.md)) |
| `clean-restore` | available | cleans `bin/` and `obj/` of a .NET project and restores its packages |
| `team-init` | available | opens the record of a team: its workbook (`STATUS.md`, a first decision) and its tests folder — `--adopt` for an existing prototype, `--light` for the light track |
| `team-need` | available | the interview that writes `NEED.md`, one question for one decision; resumes where it stopped |
| `team-decision` | available | records a change as a dated decision, marks what must be revised, and sends the team back to the step the change reopens |
| `team-status` | available | tells where a team is and what comes next — one line per team without a name; realigns `STATUS.md` when the files say otherwise |
| `team-approve` | available | the line you type at a gate (`need`, `test-plan`, `design`, `remote <usd>`); its hook records it, the skill only reports |
| `workshop-language` | available | shows or sets the language of the workshop (`/workshop-language fr`): the conversation and the text of the workbooks; `default` goes back to following your messages, with files in English |
| `team-test-plan`, `team-design` | planned, lot 3 | criteria, indicators and invariants; the design and its plan |
| `team-tests` | planned, lot 5 | datasets, scenarios and judges, written before the team |
| `team-build` | planned, lot 6 | the team, batch by batch |
| `team-run`, `team-review` | planned, lot 7 | an attempt and its report; the review and its verdict |
| `orkeon-tool-csharp`, `orkeon-crew-csharp` | planned, lot 8 | C# tools and teams |
| `team-release` | planned, lot 9 | README, card and launchers realigned, a tag proposed |

## Subagents

The main session delegates work to subagents with a compact contract, and judges what comes back.

| Subagent | Does | Writes |
|---|---|---|
| `team-test-author` | the tests of a team, before the team exists | `tests/<slug>/`, never `crew/` |
| `team-implementer` | one batch of a team, so that its tests pass | `crew/`, custom tools — never a test |
| `dataset-synthesizer` | synthetic datasets: nominal, edge, language and adversarial cases | datasets |
| `team-reviewer` | audits an attempt: what was delivered, then its conformance to the plan; returns the verdict | nothing |
| `run-analyst` | summarises one run: chronology, tool calls, errors, tokens, cost | nothing |
| `judge` | scores outputs against a versioned rubric | nothing |

## Hooks: the guards

Hooks run on Claude Code's events and enforce part of the method **whatever the permission mode** — and
`workshop` starts Claude Code with `--dangerously-skip-permissions`, on a workshop whose seeded
`.claude/settings.local.json` allows every command and edit, so the hooks are the guards; to be asked
again, see [The workshop](../concepts/workshop.md#what-belongs-to-whom). A refusal always says why and what to do instead.

| Hook | Watches | Refuses or does |
|---|---|---|
| `run-gate` | every `orkeon run`, `orkeon-harness-run`, `./run.sh`, `orkeon-bench run` | a run on a remote model without a recorded approval; logs every run to `.claude/run-log.tsv` |
| `guard-phase` | every file write | writes in the wrong folder for the phase: `crew/` only during a build, `tests/<slug>/` never during it, `runs/` never, a closed attempt never; a gate of yours (`need`, `test-plan`, `design`) written into `STATUS.md`; each subagent kept to its scope, and none writes a team's settings `settings/<slug>/` |
| `team-approve` | the line you type, `/team-approve …` | records your approval before Claude reads it: a gate in `STATUS.md`, a paid run in the open attempt (through `orkeon-bench`); refuses, with the reason, an approval for a team that does not wait for that gate, whose document is missing, or whose step has not submitted it yet (an interview that is paused, for instance) |
| `secret-guard` | every file write | a key pattern under `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/` |
| `delegation-guard` | every subagent launch | a delegation without a description or an explicit model; appends the report contract |
| `subagent-report-shape` | the end of a subagent | sends back a report missing its required lines |
| `status-check` | the end of a turn | after a `team-*` skill, reminds once to update `STATUS.md` (`team-status` and `team-approve` are exempt) |
| `read-bounds` | every file read | an unbounded read of a large file, with its outline instead |
| `bash-dispatch` | every shell command | no approval written through the shell (`gate_passed` in a `STATUS.md`), bounded `cat` and `diff`, token-saving rewrites through `rtk`, an optional git guard |
| `session-cleanup` | session start | removes the session's temporary files |
| `session-doctor` | session start | runs `orkeon-bench doctor` quietly and tells Claude which checks fail, so that it says so before building on them; silent when all is well |
| `workshop-language` | session start | when the workshop names its language (`.claude/local/language`), tells Claude to talk in it and to write the workbooks' text in it; silent otherwise |

Their exact behaviour, limits and tuning are in the [harness README](../../.devcontainer/harness/README.md).

The checks of a team (`check_crew.py`, `check_team.py`, and `orkeon-bench scaffold` for the mount points)
add what the hooks cannot see: a mount point bound to a folder its agents must never reach, a secret or a
machine-wide setting in a team settings file, a settings file Orkeon would find on its own above the crews,
`shell_command` given to an agent; and, in the image, the team as Orkeon Studio reads it, through
`orkeon-studio-check`:

```bash
orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]
```

Without an argument it checks every team of the workshop; `--authorized` takes a copy of Studio's settings
(`%APPDATA%\Orkeon\appsettings.json`), whose Authorized folders it reads as Studio does — without it, any
folder outside a team is reported as refused. Exit code 0 when every team passes, 1 when one fails, 2 on a
usage error. In the container it compares paths with their case, where Studio on Windows ignores it, and
it cannot see Windows' Hidden and System attributes.

## Rules

A rule holds the conventions of one kind of file, loaded only when such a file is read or edited.

| Rule | Loaded for |
|---|---|
| `orkeon-yaml` | YAML crews (`teams/*/crew/**/*.yaml`), library agents |
| `orkeon-ts` | TypeScript crews and tools |
| `orkeon-csharp` | C# tools and crews |
| `team-tests` | `tests/<slug>/`, `library/datasets/` |
| `workbook` | `workbooks/<slug>/` |
| `markdown-output` | every Markdown file |
| `bench-ts` | the sources of `orkeon-bench` |

## Templates and references

- `.claude/templates/` holds the shape of every working document: `NEED.md`, `ACCEPTANCE.md`,
  `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md`, `STATUS.md`, `DECISION.md`, `REPORT.md`, `ANALYSIS.md`,
  `FIX-PLAN.md`, the attempt manifest, `report.schema.json`, `bench.config.json`, `scenario.json`, the
  dataset manifest, and the generic `mounts.json`.
- `references/` holds the documents Claude reads before acting: Orkeon (`orkeon/`: the reference, the
  YAML schema, the TypeScript language, the Studio layout, models, resume and memory, C#), the method
  (`process/`: the workflow, the artefacts, a checklist per gate), designing a team (`design/`), keeping
  it up (`reliability/`), testing (`testing/`); yours go in `references/local/`. `references/README.md`
  indexes them.

## Evals

The evals check that the hooks and scripts do exactly what the rest of the harness expects. They run at
every image build, and you can run them in the workshop:

```bash
bash /workspace/.claude/evals/run.sh
```

It prints `PASS` or `FAIL` for each case, then the total (`… passed, 0 failed`, with the skipped cases
counted apart — a case skips when a tool it needs, such as `orkeon-bench`, is missing), and exits non-zero
on any failure; with `HARNESS_EVALS_STRICT=1`, as at the image build, a skipped case fails too.

## Switches

Hooks are tuned with `HARNESS_*` variables in the `env` section of `.claude/settings.local.json`, which
the image never overwrites:

| Switch | Effect |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | more hosts counted as local by the run gate and the bench (a GPU box of your network) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | whether the run gate reads Orkeon's settings files, which file replaces `~/.config/Orkeon/appsettings.json` for it; where it logs |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | turn the key guard off, change its folders, allow a pattern, add patterns |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | the `STATUS.md` reminder |
| `HARNESS_TEAM_APPROVE` | `0` stops the recording of your `/team-approve …` lines: nothing is approved then, and Claude says so |
| `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` | turn the start-up doctor off; how long it may take, in seconds (20) |
| `HARNESS_WORKSHOP_LANGUAGE` | `0` stops the reminder of the workshop's language at session start |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | the read limits: the lines and bytes of a whole read, the lines of a diff, the length of the outline given instead, and the size of an outline, as a share of the file, from which the file counts as flat (an outline would not help) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | after how many files read directly the main thread is reminded to delegate (6; then at each doubling) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | the subagents' report length; the model of exploration subagents |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_*`, `HARNESS_RTK_BIN` | the shell modules |

For the container itself: `HARNESS_SYNC=off` stops the synchronisation at start
([configuration](./configuration.md)).

Next: [Troubleshooting](./troubleshooting.md).
