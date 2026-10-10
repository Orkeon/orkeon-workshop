# The harness

*English · [Français](../fr/reference/harness.md)*

The harness is what makes Claude Code work the workshop's way. The image deploys it into the workshop's
`.claude/`, `references/` and `library/examples/` at each start. Every session loads `CLAUDE.md`, which
imports the entry point `.claude/harness/HARNESS.md`: the layout, the method and the rules of
engagement, on a few screens. That is the `user` profile, which a workshop runs unless you choose another:
the other [profiles](#profiles-and-packs) add packs of skills for contributing to a repository, developing
it, releasing it or keeping its documentation true, and can deploy into a git checkout instead of a workshop.

## Skills

A skill is a packaged procedure Claude follows when your request matches it, or when you type its name
after a `/`. The `team-*` skills, `workshop-language` and `workshop-profile` run only when you type them.

| Skill | State | What it does |
|---|---|---|
| `workshop-language` | available | shows or sets the language of the workshop (`/workshop-language fr`): the conversation and the text of the workbooks; `default` goes back to following your messages, with files in English |
| `workshop-profile` | available | shows, lists or switches the [profile](#profiles-and-packs) of the folder: which packs of the harness it deploys (`/workshop-profile --list`, `/workshop-profile dev`); also a command of the container, `workshop-profile` |
| `orkeon-tour` | available | an interactive guided tour of the workshop, in plain words, adapted to your level |
| `orkeon-crew-yaml` | available | designs, writes and checks a YAML team ([guide](../guides/yaml-team.md)) |
| `orkeon-crew-typescript` | available | the same for a TypeScript team with custom tools ([guide](../guides/typescript-team.md)) |
| `orkeon-update` | available | updates Orkeon and Ollama in the container ([Updating](../guides/updating.md)) |
| `clean-restore` | available | cleans `bin/` and `obj/` of a .NET project and restores its packages |
| `team-init` | available | opens the record of a team: its workbook (`STATUS.md`, a first decision) and its tests folder — `--adopt` for an existing prototype, `--light` for the light track |
| `team-need` | available | the interview that writes `NEED.md`, one question for one decision; resumes where it stopped |
| `team-test-plan` | available | from the need, writes `ACCEPTANCE.md` (criteria, indicators, invariants) and `TEST-PLAN.md` (levels, datasets, models, budget), then `tests/<slug>/bench.config.json`; asks you the thresholds and the budget, one question at a time; has `orkeon-bench check test-plan` check the three files before handing them to you |
| `team-design` | available | from the need, the criteria and the test plan, writes `DESIGN.md` (format, agents, tasks, tools, mount points, deliverables) and `PLAN.md` (batches, each with the files to create); nothing of the team is written yet; has `orkeon-bench check design` check both against the known pitfalls before handing them to you |
| `team-decision` | available | records a change as a dated decision, marks what must be revised, and sends the team back to the step the change reopens |
| `team-status` | available | tells where a team is and what comes next — one line per team without a name; realigns `STATUS.md` when the files say otherwise |
| `team-approve` | available | the line you type at a gate (`need`, `test-plan`, `design`, `remote <usd>`); its hook records it, the skill only reports |
| `deploy` | available | packs a team into `deployments/<slug>-<date>.zip` (or `.tar.gz`) to install in another workshop: the team folder as Studio runs it, without the data of its mount points, and its settings file if you say so — the one question it asks; never a key ([`orkeon-bench deploy`](./orkeon-bench.md#deploy-team--the-team-as-an-archive-for-another-workshop)) |
| `team-tests` | available | from the criteria, the test plan, the design and the plan, has the two test subagents write the datasets, the scenarios, the judge rubrics and the unit tests of the planned custom tools in `tests/<slug>/`, each citing the criterion it proves; has `orkeon-bench check design --tests` check the traceability, then records the tests-red gate itself: every test exists, cites an id, and fails, since the team does not exist yet |
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
| `secret-guard` | every file write | a key pattern under `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/`, `.claude/` |
| `make-executable` | every file write, afterwards | nothing refused: a script Claude has just written (`*.sh`, or `*.py` with a shebang) gets its executable bit at once; one written with Windows line endings is pointed out to Claude, which writes it again |
| `delegation-guard` | every subagent launch | a delegation without a description or an explicit model; appends the report contract |
| `subagent-report-shape` | the end of a subagent | sends back a report missing its required lines |
| `status-check` | the end of a turn | after a `team-*` skill, reminds once to update `STATUS.md` (`team-status` and `team-approve` are exempt) |
| `read-bounds` | every file read | an unbounded read of a large file, with its outline instead |
| `bash-dispatch` | every shell command | no approval written through the shell (`gate_passed` in a `STATUS.md`), bounded `cat` and `diff`, token-saving rewrites through `rtk`, an optional git guard |
| `session-cleanup` | session start | removes the session's temporary files |
| `session-doctor` | session start | runs `orkeon-bench doctor` quietly and tells Claude which checks fail, so that it says so before building on them; silent when all is well |
| `workshop-language` | session start | when the workshop names its language (`.claude/local/language`), tells Claude to talk in it and to write the workbooks' text in it; silent otherwise |
| `workshop-profile` | session start | when the folder runs a profile other than `user`, tells Claude which profile and which packs, in one line; silent on `user` |
| `dev-batch-guard` | the line you type, every skill launch | a second `/dev-implement` batch in the same session — `/clear` first; a correction of a closed batch passes, and so does the identical launch issued again. Off unless the `dev` pack is active |
| `context-log` | every instruction file that enters the context | nothing refused: one line per `CLAUDE.md`, rule or import loaded, with its size, in `.claude/local/context.log`. Off unless the `usage` pack is active |
| `clear-nudge` | the line you type | nothing refused: one line when the context the next turn replays crosses 150 000 tokens, then 300 000…, suggesting `/clear`. Off unless the `usage` pack is active |

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

## Profiles and packs

The harness is cut into **packs** — skills, subagents, rules and the switches that turn some hooks on —
and a **profile** is a list of packs. The profile decides what is deployed into the folder Claude Code
works in, its **space**: a workshop, or the git checkout of a repository (a **source** space). A folder
runs `user` unless you choose another profile, and a workshop on `user` gets the harness this page
describes, exactly as before profiles existed.

| Profile | Packs | Workshop | Source checkout | For |
|---|---|:-:|:-:|---|
| `user` | core, workshop | ✓ | — | whoever builds Orkeon teams in a workshop: the harness above |
| `contrib` | core, workshop, source, contrib, usage | ✓ | ✓ | an outside contributor: reproduces a failure in a workshop and files the issue, validates a fix; prepares a pull request in a checkout |
| `dev` | core, source, dev, quality, usage | — | ✓ | a core developer of the repository |
| `release` | core, source, quality, release, docs-audit | — | ✓ | whoever releases it |
| `docs` | core, source, docs-audit | — | ✓ | whoever keeps its documentation true to the code |
| `all` | every pack | ✓ | ✓ | the maintainer who does a bit of everything |
| `custom:<pack>,<pack>` | the packs you name, and core | ✓ | ✓ | anything else |

- `core` is in every profile: every hook, `settings.json`, `/workshop-profile` and the evals. `workshop`
  is the workshop's harness; `source` is one rule for a checkout.
- A pack that does not fit the space is left out: `contrib` in a checkout has no `workshop` pack, `all` in
  a workshop has no `dev`. A profile not made for the space — `dev` in a workshop, `user` in a checkout —
  is refused, with the profiles that fit.
- In a checkout, a **repository pack** joins a profile that holds `contrib`, `dev`, `quality`, `release`
  or `docs-audit` when the `origin` remote is its repository: `repo-orkeon` for Orkeon itself,
  `repo-orkeon-workshop` for this project. It holds what is specific to that repository — its commands,
  checklists, layout rules — which the generic skills read instead of assuming it; in any other
  repository they ask for what they miss.

### Choosing a profile

- **At the first start of a container**: `-e HARNESS_PROFILE=dev` on `docker run`
  ([variables](./configuration.md#variables-of-the-image)). It applies only to a folder that has no
  profile yet.
- **Any time after**: `/workshop-profile` in Claude Code, or `workshop-profile` in a terminal of the
  container — the way in for a checkout that has no harness yet.

```bash
workshop-profile --list              # the profiles, and which fit this folder
workshop-profile                     # the active profile, its packs and switches (--show)
workshop-profile dev --dry-run       # what a switch would write, writing nothing
workshop-profile dev                 # switches, then synchronises the harness
workshop-profile custom:contrib,usage
```

A switch writes `.claude/local/profile` (one line), only the keys it owns in `.claude/settings.local.json`
— the `HARNESS_*` switches of its packs and the visibility of the harness's skills (`skillOverrides`) —
and `.claude/local/profile.owned.json`, the record of those keys, so that the next switch undoes exactly
them; then it deploys the packs. The switches apply at once; when files changed, it says to restart Claude
Code (`/exit`, then `claude`) to load the skills, subagents and rules of the profile. These files are the
switch's: do not edit them by hand. A profile of your own is a file `.claude/local/profiles/<name>.yaml`,
in the format of the [profiles README](../../.devcontainer/harness/profiles/README.md).

### In a source checkout

Mount the checkout where a workshop would be (`/workspace`, or `ORKEON_WORKSHOP`) and choose a profile
made for it: `dev`, `release`, `docs`, `contrib`, `all` or a `custom` one. There the harness:

- **writes nothing git tracks**: a deployment that would write one tracked file is refused whole, and
  names the file;
- **keeps `git status` clean**: what it deployed, `.claude/local/`, `.claude/settings.local.json` and
  `todo/` are listed in a block of `.git/info/exclude`, rewritten at every start — the repository's own
  `.gitignore` is not touched;
- **deploys no workshop**: no `CLAUDE.md`, no `teams/` or `workbooks/`, no `team-*` skill; the hooks made
  for a workshop (`run-gate`, `guard-phase`, `team-approve`, `status-check`, `session-doctor`,
  `workshop-language`) stay silent, and the repository's own `CLAUDE.md` and conventions rule its code;
- **writes the work under `todo/`**: a spec, a plan, an audit, a quality report, a release record, the
  body of an issue or a pull request go in `todo/<code>/`;
- **hands you the commands**: Claude does not commit, push, tag, file an issue or open a pull request; it
  prepares the message or the body and gives you the command to type.

### The skills of the packs

Each runs only when you type it, except `/token-usage`, which Claude may also use when you ask what a
session cost.

| Pack | Skills | What they do |
|---|---|---|
| `contrib` | `/contrib-issue`, `/contrib-validate`, `/contrib-pr` | record a failure reproduced in a workshop (`contrib/<slug>/RECORD.md`) and draft its issue on the repository's template; validate a proposed fix — Orkeon built from the pull request's branch, the reproduction run again; prepare a pull request from a checkout: the contribution checklist, the build and the tests, `todo/pr-<slug>/PR.md` |
| `dev` | `/dev-spec`, `/dev-plan`, `/dev-implement`, `/dev-verify`, `/dev-learn`, `/dev-unit-tests`, `/dev-integration-tests` | a testable spec, then a plan cut into batches, each challenged by the `adversarial-reviewer` subagent; one batch per session under strict TDD (`dev-test-author` writes the failing tests, `dev-implementer` makes them pass); a read-only audit of each batch by `dev-auditor`; the gaps audits keep finding turned into rules; unit and integration tests in the repository's conventions |
| `quality` | `/quality-report` | the repository's build, tests, coverage and Sonar (when a server is reachable) in one checked report, `todo/quality-<date>/` |
| `release` | `/release-prepare`, `/release-evidence`, `/release-verify` | a version checked ready to tag, its notes drafted; the install evidence of a candidate; what was published, checked channel by channel — all in `todo/release-<version>/`, the tag command handed to you |
| `docs-audit` | `/docs-audit` | the documentation against the code, in a separate subagent: the repository's doc checks, links and anchors, each claim of the changed pages; `todo/docs-audit-<date>/REPORT.md`, nothing fixed |
| `usage` | `/token-usage` | what a session cost and what filled its context, read with `cc-usage`, a command of the image; turns on the `context-log` and `clear-nudge` hooks |
| `repo-orkeon-workshop` | `/ws-check`, `/ws-docs`, `/ws-image`, `/ws-migrate` | for this project's checkout: its checks, its bilingual documentation, the image build and the CI runs that follow a push, the migration to Orkeon's latest `main` |
| `repo-orkeon` | — | for Orkeon's checkout: its layout rules, and the commands, checklists and channels the generic skills read |

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
the image never overwrites; `/workshop-profile` writes there only the switches of its packs:

| Switch | Effect |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | more hosts counted as local by the run gate and the bench (a GPU box of your network) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | whether the run gate reads Orkeon's settings files, which file replaces `~/.config/Orkeon/appsettings.json` for it; where it logs |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | turn the key guard off, change its folders, allow a pattern, add patterns |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | the `STATUS.md` reminder |
| `HARNESS_TEAM_APPROVE` | `0` stops the recording of your `/team-approve …` lines: nothing is approved then, and Claude says so |
| `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` | turn the start-up doctor off; how long it may take, in seconds (20) |
| `HARNESS_WORKSHOP_LANGUAGE` | `0` stops the reminder of the workshop's language at session start |
| `HARNESS_WORKSHOP_PROFILE` | `0` stops the line that names the profile at session start |
| `HARNESS_DEV_BATCH_GUARD` | `1` refuses a second `/dev-implement` batch in one session; the `dev` pack sets it |
| `HARNESS_CONTEXT_LOG`, `HARNESS_CLEAR_NUDGE` | `1` turns on the log of the instruction files loaded and the `/clear` suggestion; the `usage` pack sets both |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | the read limits: the lines and bytes of a whole read, the lines of a diff, the length of the outline given instead, and the size of an outline, as a share of the file, from which the file counts as flat (an outline would not help) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | after how many files read directly the main thread is reminded to delegate (6; then at each doubling) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | the subagents' report length; the model of exploration subagents |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_*`, `HARNESS_RTK_BIN` | the shell modules |

For the container itself: `HARNESS_SYNC=off` stops the synchronisation at start, and `HARNESS_PROFILE`
names the first profile of a folder ([configuration](./configuration.md)).

Next: [Troubleshooting](./troubleshooting.md).
