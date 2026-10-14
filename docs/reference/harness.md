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
after a `/`. The `team-*` skills, `deploy`, `workshop-language` and `workshop-profile` run only when you
type them.

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
| `team-build` | planned | the team, batch by batch |
| `team-run`, `team-review` | planned | an attempt and its report; the review and its verdict |
| `orkeon-tool-csharp`, `orkeon-crew-csharp` | planned | C# tools and teams |
| `team-release` | planned | README, card and launchers realigned, a tag proposed |

## Subagents

The main session delegates work to subagents with a compact contract, and judges what comes back.

| Subagent | Does | Writes |
|---|---|---|
| `team-test-author` | the tests of a team, before the team exists | `tests/<slug>/`, never `crew/` |
| `team-implementer` | one batch of a team, so that its tests pass | `crew/`, custom tools — never a test |
| `dataset-synthesizer` | synthetic datasets: nominal, edge, language and adversarial cases | datasets |
| `team-reviewer` | audits an attempt: what was delivered, then its conformance to the plan; returns the verdict | its memory only, `.claude/agent-memory/team-reviewer/` |
| `run-analyst` | summarises one run: chronology, tool calls, errors, tokens, cost | nothing |
| `judge` | scores outputs against a versioned rubric | nothing |

The packs bring their own subagents: `dev-test-author`, `dev-implementer`, `dev-auditor` (the judged
pass of an audit, from the mechanical table the gate writes into its capture, D72, D80), `adversarial-reviewer` and
`dev-batch` (the context one batch runs in, in its own worktree, for `/dev-batches`, D70) with the `dev` pack, and the three the forked skills run in — `ws-runner`
(`repo-orkeon-workshop`, read-only), `contrib-validator` (`contrib`) and `quality-runner` (`quality`).
Like `team-reviewer`, `dev-auditor` and `adversarial-reviewer` keep a memory of the repository under
`.claude/agent-memory/<agent>/`: what saves the next audit a search, in a few dated lines — never a verdict,
a gap table, code or a secret.

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
| `memory-scope` | every file write by a subagent | a write by an agent whose charter has neither Write nor Edit outside its memory folder, `.claude/agent-memory/<agent>/`: the memory is the one place it writes, a finding goes in its report |
| `make-executable` | every file write, afterwards | nothing refused: a script Claude has just written (`*.sh`, or `*.py` with a shebang) gets its executable bit at once; one written with Windows line endings is pointed out to Claude, which writes it again |
| `delegation-guard` | every subagent launch | a delegation without a description or an explicit model; appends the report contract; with the `dev` pack, a generic agent told to implement a batch or the plan of the dev chain — a batch runs in a `dev-batch` agent (D75) |
| `subagent-report-shape` | the end of a subagent | sends back a report missing its required lines |
| `status-check` | the end of a turn | after a `team-*` skill, reminds once to update `STATUS.md` (`team-status` and `team-approve` are exempt) |
| `read-bounds` | every file read | an unbounded read of a large file, with its outline instead — for a C# or TypeScript file, a markdown file or an audit capture, the ready-to-copy commands that show one member or section by name (below) —; the whole read wanted on purpose is `offset` 1 with a `limit` covering the file, never the same Read again; with the `dev` pack, every source or test file to the pilot of a batch (D75) |
| `bash-dispatch` | every shell command | no approval written through the shell (`gate_passed` in a `STATUS.md`), bounded `cat` and `diff` (a dump wanted whole is said with `HARNESS_FORCE_READ=1` in front of the command, never by repeating it; a C#, TypeScript, markdown or audit-capture file's refusal hands the `show` commands of its members or sections, another code file's names `ast-grep outline` and `rtk read -m 40` before any range), a `show` the same agent was already served for an unchanged file (it is in its context), a recursive `grep` or `rg` of more than four patterns sent back as its `-l` form, no source or test file to the pilot of a batch (`dev` pack, D75), token-saving rewrites through `rtk`, an optional git guard; in a checkout whose repository pack names them, an integration suite run whole (`dotnet test` on `Orkeon.sln` with `Category=Integration` or `Slow` and no narrowing: one project or `FullyQualifiedName~` instead), and the image's own `orkeon` in a checkout of Orkeon (the checkout's CLI runs from its sources: `dotnet run --project src/scripting/Orkeon.Scripting.Cli -- …`, quoted by the refusal) |
| `session-cleanup` | session start | removes the session's temporary files |
| `session-doctor` | session start | in a workshop, runs `orkeon-bench doctor` quietly and tells Claude which checks fail, so that it says so before building on them; in a git checkout, checks the harness itself — the binaries its hooks need (`jq`, `git`, `python3`, PyYAML, `ast-grep` with the `dev` pack), the hooks registered, every `repo.yaml` readable, the block of `.git/info/exclude`, the auditors' memory folder writable; silent when all is well |
| `workshop-language` | session start | when the workshop names its language (`.claude/local/language`), tells Claude to talk in it and to write the workbooks' text in it; silent otherwise |
| `workshop-profile` | session start | when the folder runs a profile other than `user`, tells Claude which profile and which packs, in one line; silent on `user` |
| `dev-batch-guard` | the line you type, every skill launch | a second inline `/dev-implement` batch in the same context — `/dev-batches` runs several, each in its own agent; `/clear` first for one more here; a correction of a closed batch passes, and so does the identical launch issued again. Inside a subagent it reads that agent's own transcript, never the main conversation's (D70). Off unless the `dev` pack is active |
| `worktree-create` | every worktree Claude Code creates — `claude --worktree`, a subagent in its own worktree such as `dev-batch`, a background session | nothing refused: creates it itself under `.claude/worktrees/<name>`, from the branch you are on (never the default branch), on `<prefix>/<name>` when the repository pack names a branch pattern (`feature/<name>` for Orkeon), and links the repository's shared untracked folders (`repo.yaml` `layout.shared`, `packages` for Orkeon; your `HARNESS_WORKTREE_SHARED`) to the main checkout's, so that one restore serves every worktree; a folder git tracks is refused and nothing is created (D70) |
| `worktree-remove` | the removal of a worktree the hook above created | a removal that would lose work: uncommitted files, or commits no other branch holds; otherwise removes the links, the worktree and its branch |
| `dev-compact` | the compaction of the context, and the session start that follows it | nothing refused: before the compaction, writes the state of an open `/dev-implement` batch — the sheet's open steps, the cycles closed, the delegations made, the working tree — to `todo/<code>/<CODE>-STATE-F<n>.md`, or during `/dev-batches` the state of each batch — its launches, what its agent returned, the relayed block, merged or not — to `todo/<code>/<CODE>-BATCHES-STATE.md`; after it, tells Claude to read that file first and resume at the first open step, never relaunching a batch it lists as running or merged. Off unless the `dev` pack is active |
| `context-log` | every instruction file that enters the context | nothing refused: one line per `CLAUDE.md`, rule or import loaded, with its size, in `.claude/local/context.log`. Off unless the `usage` pack is active |
| `clear-nudge` | the line you type; a delegation made inside a subagent | nothing refused: one line when the context the next turn replays crosses 150 000 tokens, then 300 000…, suggesting `/clear`; inside a `dev-batch` agent, read on the agent's own transcript, the figure to report. Off unless the `usage` pack is active |

**Reading a file by name.** `.claude/scripts/code-map.py`, around `ast-grep` (installed by the image), reads
one file at a time, no index: `outline <file>` is its map — the types and members of a C# or TypeScript
file, two levels of sections of a markdown file, the sections and the `diff/<file>` entries of an audit
capture —, each with its lines and its size in tokens; `show <file> <address>` prints one of them under
its bounds `path:start-end`, a C# member with its `///` comment, a section with its sub-sections:

```bash
python3 .claude/scripts/code-map.py show src/Tools/ToolSchema.cs ParameterSchema/ReadAsMap
python3 .claude/scripts/code-map.py show todo/apt/APT-PLAN-F2.md "Step 2"
```

An address matches exactly, then as a prefix, then as a substring; more than five matches come back as
their list. The roles of the `dev` chain read the members their contract names this way, and
`dev-auditor` the capture of a batch. Its limits are printed when they apply: two outline levels, an
underlined heading opens no section, inline markdown is not parsed. Without `ast-grep` it says so and the
refusals keep their line outline.

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
| `orkeon-yaml` | `teams/*/crew/**/*.yaml` and `*.yml`, `library/agents/**/*.yaml`, `library/examples/teams/*/crew/**/*.yaml` |
| `orkeon-ts` | `teams/*/crew/**/*.ts`, `library/tools/ts/**`, `library/examples/teams/*/crew/**/*.ts` |
| `orkeon-csharp` | `library/tools/csharp/**`, `teams/*/crew/**/*.cs` and `*.csproj`, `library/examples/teams/*/crew/**/*.cs` |
| `team-tests` | `tests/*/**`, `library/datasets/**`, `library/examples/tests/*/**` |
| `workbook` | `workbooks/*/**`, `library/tools/csharp/*/workbook/**`, `library/examples/workbooks/*/**` |
| `markdown-output` | every Markdown file (`**/*.md`) |
| `bench-ts` | the sources of `orkeon-bench` (`.devcontainer/bench/**`, `bench/**`) |

## Templates and references

- `.claude/templates/` holds the shape of every working document: `NEED.md`, `ACCEPTANCE.md`,
  `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md`, `STATUS.md`, `DECISION.md`, `REPORT.md`, `ANALYSIS.md`,
  `FIX-PLAN.md`, the attempt manifest, `report.schema.json`, `bench.config.json`, `scenario.json`, the
  dataset manifest, and the generic `mounts.json`.
- `references/` holds the documents Claude reads before acting: Orkeon (`orkeon/`: the reference, the
  CLI — its commands, exit codes and event protocol (`cli.md`) —, the YAML schema, the TypeScript
  language, the Studio layout, models, resume and memory, C#), the method (`process/`: the workflow, the
  artefacts, a checklist per gate), designing a team (`design/`), keeping it up (`reliability/`), testing
  (`testing/`), the conventions of the Orkeon repository (`csharp/`) and Clean Architecture for TypeScript
  (`typescript/`); yours go in `references/local/`. `references/README.md` indexes them.

## Profiles and packs

The harness is cut into **packs** — skills, subagents, rules and the switches that turn some hooks on —
and a **profile** is a list of packs. The profile decides what is deployed into the folder Claude Code
works in, its **space**: a workshop, or the git checkout of a repository (a **source** space). A folder
runs `user` unless you choose another profile, and a workshop on `user` gets the harness this page
describes, exactly as before profiles existed. What each profile is for, step by step, is in the
[workflow pages](../workflows/overview.md); this section is the mechanics.

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
Code (`/exit`, then `workshop`, or `claude` in a checkout) to load the skills, subagents and rules of the
profile. These files are the
switch's: do not edit them by hand. A profile of your own is a file `.claude/local/profiles/<name>.yaml`,
in the format of the [profiles README](../../.devcontainer/harness/profiles/README.md).

### In a source checkout

Mount the checkout where a workshop would be (`/workspace`, or `ORKEON_WORKSHOP`) and choose a profile
made for it: `dev`, `release`, `docs`, `contrib`, `all` or a `custom` one. There the harness:

- **writes nothing git tracks**: a deployment that would write one tracked file is refused whole, and
  names the file;
- **keeps `git status` clean**: what it deployed, `.claude/local/`, `.claude/.harness-*`,
  `.claude/settings.local.json`, `.claude/agent-memory/` and `todo/` are listed in a block of `.git/info/exclude`, rewritten at every start — the repository's own
  `.gitignore` is not touched;
- **deploys no workshop**: no `CLAUDE.md`, no `teams/` or `workbooks/`, no `team-*` skill; the hooks made
  for a workshop (`run-gate`, `guard-phase`, `team-approve`, `status-check`, `workshop-language`) stay
  silent, `session-doctor` checks the harness of the checkout instead of a team, and the repository's
  own `CLAUDE.md` and conventions rule its code;
- **runs the product from its sources**: in a checkout of Orkeon, `orkeon` on the PATH is the build the
  image carries at its own commit; a command that runs it is refused, and the refusal quotes the
  checkout's command from `repo.yaml` (`dotnet run --project src/scripting/Orkeon.Scripting.Cli -- …`);
- **writes the work under the work folder**: a spec, a plan, an audit, a quality report, a release record,
  the body of an issue or a pull request go in `<work>/<code>/`. `<work>` is `todo/` at the root of the
  checkout, kept out of git, unless the repository pack names a folder of the repository (`repo.yaml`
  `layout.work` and the switch `HARNESS_WORK_DIR`, the same value; for Orkeon `backstage/tasks/`, where
  its tasks and backlog live): that folder is the repository's own, git sees it and you commit it. You
  may name one yourself in `.claude/settings.local.json`. The session's first line says which applies;
  a folder named but absent from the checkout — a submodule not checked out — falls back to `todo/`,
  and the line says so; in a linked git worktree without it, the main worktree's folder applies, named
  as an absolute path (D69). Before its first write under a folder the repository named, Claude reads
  that folder's `CLAUDE.md` (or its submodule's), since Claude Code loads a nested `CLAUDE.md` only at
  the first read or write in it. `todo/` in this page and in the workflow pages is that default;
- **commits and pushes what a workflow produced** (D71): the files a batch touched, with a message in the
  repository's shape (`contrib.commit`), on a branch named as the repository names them, then
  `git push` (`/dev-batches` differs, D79: its agents commit and never push, the conversation merges each
  valid batch into your branch and pushes that branch once); with the identity git already has — its configuration or `workshop --git-identity` — and
  when it has none it stops before the commit and gives you that command or the two `git config` lines;
  a pull request is opened, from `/dev-implement`, `/dev-verify`, `/dev-batches` and `/contrib-pr`
  alike, after `gh auth status` and after asking you once (`HARNESS_PR_AUTO=1` opens it without
  asking), against the repository's default branch — one for the whole run of `/dev-batches`. A tag, a release, an issue, a comment on a
  pull request and the merge of a branch stay yours: Claude prepares them and gives you the command;
- **gives a worktree what it needs** (D70): a worktree Claude Code asks for — `claude --worktree`, the
  `dev-batch` agents of `/dev-batches` — is created by the harness under `.claude/worktrees/<name>`,
  from the branch you are on, with the repository's shared untracked folders (`layout.shared`,
  `packages` for Orkeon) linked to the main checkout's rather than filled again; `bash
  .claude/scripts/worktree-create.sh --link <worktree>` does the same for a worktree you made by hand,
  `--remove <worktree>` takes one down with its branch once its work is committed or merged (`/dev-batches`
  does it in the background, `--background`, right after merging a batch), `--space` lists the free
  space, the size of a built worktree (`layout.worktree_gb`) and each worktree, merged or not;
- **makes git accept the folder**: a checkout mounted from Windows belongs to root inside the container,
  and git run as `node` refuses it ("dubious ownership"); the synchronisation adds that one folder to
  git's `safe.directory` at the first start, and says so in a `[harness] git:` line.

### The skills of the packs

Each runs only when you type it, except `/token-usage`, which Claude may also use when you ask what a
session cost.

| Pack | Skills | What they do |
|---|---|---|
| `contrib` | `/contrib-issue`, `/contrib-validate`, `/contrib-pr` | record a failure reproduced in a workshop (`contrib/<slug>/RECORD.md`) and draft its issue on the repository's template; validate a proposed fix — Orkeon built from the pull request's branch, the reproduction run again; prepare a pull request from a checkout: the contribution checklist, the build and the tests, `todo/pr-<slug>/PR.md`; `/contrib-validate` runs in a forked subagent of the pack, `contrib-validator`: the build and the reproduction stay there, the conversation gets the report |
| `dev` | `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-batches`, `/dev-verify`, `/dev-learn`, `/dev-unit-tests`, `/dev-integration-tests` | a testable spec — or, for a bug, a refactor or a performance change, a brief made of evidence (a reproduction that ran, a measurement, what must not change) —, then a plan cut into batches, each challenged by the `adversarial-reviewer` subagent; one batch per context under strict TDD (`dev-test-author` writes the failing tests, `dev-implementer` makes them pass), inline with `/dev-implement` or several at once with `/dev-batches`, each in a `dev-batch` agent in its own worktree, the conversation orchestrating and writing the sheets (D70); each batch committed and pushed on its branch (D71) — or, with `/dev-batches`, committed locally and merged into your branch, pushed once with one pull request (D79); a read-only audit of each batch by `dev-auditor`; the two auditors keep a memory of the repository under `.claude/agent-memory/`; the gaps audits keep finding turned into rules; unit and integration tests in the repository's conventions |
| `quality` | `/quality-report` | the repository's build, tests, coverage and Sonar (when a server is reachable) in one checked report, `todo/quality-<date>/`; runs in a forked subagent of the pack, `quality-runner`: the commands' output stays there, the conversation gets the report |
| `release` | `/release-prepare`, `/release-evidence`, `/release-verify` | a version checked ready to tag, its notes drafted; the install evidence of a candidate; what was published, checked channel by channel — all in `todo/release-<version>/`, the tag command handed to you |
| `docs-audit` | `/docs-audit` | the documentation against the code, in a separate subagent: the repository's doc checks, links and anchors, each claim of the changed pages; `todo/docs-audit-<date>/REPORT.md`, nothing fixed |
| `usage` | `/token-usage` | what a session cost and what filled its context, read with `cc-usage`, a command of the image; turns on the `context-log` and `clear-nudge` hooks |
| `repo-orkeon-workshop` | `/ws-check`, `/ws-docs`, `/ws-image`, `/ws-migrate` | for this project's checkout: its checks, its bilingual documentation, the image build and the CI runs that follow a push, the migration to Orkeon's latest `main`; the four run in a forked subagent of the pack, `ws-runner`, read-only: the commands' output stays there, the conversation gets the report; and its rules for the bench, the docs and the hooks |
| `repo-orkeon` | — | for Orkeon's checkout: its layout rules, and the commands, checklists and channels the generic skills read |

## Evals

The evals check that the hooks and scripts do exactly what the rest of the harness expects. They run at
every image build, and you can run them in the workshop:

```bash
bash /workspace/.claude/evals/run.sh
```

It prints `PASS`, `FAIL` or `SKIP` for each case, then the total (`… passed, 0 failed`, with the skipped
cases counted apart — a case skips, and says why, when a tool it needs, such as `orkeon-bench`, is
missing), and exits non-zero
on any failure; with `HARNESS_EVALS_STRICT=1`, as at the image build, a skipped case fails too. Every hook
case is timed: a hook whose median over its cases is above `HARNESS_EVALS_LATENCY_MS` (1000 ms) fails the
run, and the slowest hook is printed before the total.

## Switches

Hooks are tuned with `HARNESS_*` variables in the `env` section of `.claude/settings.local.json`, which
the image never overwrites; `/workshop-profile` writes there only the switches of its packs:

| Switch | Effect |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | more hosts counted as local by the run gate and the bench (a GPU box of your network) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | whether the run gate reads Orkeon's settings files, which file replaces `~/.config/Orkeon/appsettings.json` for it; where it logs |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | turn the key guard off, change its folders, allow a pattern, add patterns |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | the `STATUS.md` reminder |
| `HARNESS_TEAM_APPROVE`, `HARNESS_TEAM_APPROVE_BENCH_TIMEOUT` | `0` stops the recording of your `/team-approve …` lines: nothing is approved then, and Claude says so; how long the recording of a paid run through `orkeon-bench` may take, in seconds (20) |
| `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` | turn the start-up doctor off; how long it may take, in seconds (20) |
| `HARNESS_WORKSHOP_LANGUAGE` | `0` stops the reminder of the workshop's language at session start |
| `HARNESS_WORKSHOP_PROFILE` | `0` stops the line that names the profile at session start |
| `HARNESS_MAKE_EXECUTABLE` | `0` no longer gives a script Claude writes its executable bit |
| `HARNESS_MEMORY_SCOPE` | `0` lets an agent whose charter has neither Write nor Edit write outside its memory folder, `.claude/agent-memory/<agent>/` |
| `HARNESS_DEV_BATCH_GUARD` | `1` refuses a second inline `/dev-implement` batch in one context, and a generic agent told to implement a batch or the plan; the `dev` pack sets it |
| `HARNESS_PILOT_GUARD` | `1` refuses the pilot of a batch — a `dev-batch` agent, or the main conversation while a `/dev-implement` batch is open in it — every source or test file, through the shell or Read; the `dev` pack sets it (D75) |
| `HARNESS_GREP_PATTERNS_MAX` | above how many patterns a recursive `grep` or `rg` is sent back as its `-l` form (4); `0` turns it off (D75) |
| `HARNESS_DEV_BATCHES_MAX` | how many `dev-batch` agents `/dev-batches` runs at once (4), the other batches queued in the plan's order (D70) |
| `HARNESS_DEV_BATCH_MODEL` | the model of the `dev-batch` agents `/dev-batches` launches: empty (the default) keeps the charter's `opus`, `sonnet` tries a cheaper one; the roles a batch delegates to keep their models and the audit stays on Opus (D75) |
| `BASH_DEFAULT_TIMEOUT_MS` | Claude Code's own setting, which the harness sets: how long one Bash call may run before it is ended, `290000` ms (Claude Code's default is 120 000), so that the waits of the dev chain and the `ws-*` skills, in slices of 270 seconds, fit in one call |
| `HARNESS_WORKTREE_SHARED` | more untracked folders a worktree the harness creates links to the main checkout's, `:`-separated, beyond those the repository pack names (`repo.yaml` `layout.shared`); a folder git tracks is refused (D70) |
| `HARNESS_PR_AUTO` | `1` lets the harness open a pull request without asking you first; `0` asks once (D71) |
| `HARNESS_DEV_COMPACT` | `1` writes the state of an open `/dev-implement` batch at each compaction of the context, `todo/<code>/<CODE>-STATE-F<n>.md` (`<CODE>-BATCHES-STATE.md` during `/dev-batches`); the `dev` pack sets it |
| `HARNESS_INTEGRATION_PROJECTS`, `HARNESS_INTEGRATION_CATEGORIES` | the targets whose integration suite never runs whole (a test project, or a solution), and the categories that make a solution-wide run one; empty, the guard is off; the repository pack sets them (`Orkeon.sln`; `Integration Slow`) |
| `HARNESS_WORK_DIR` | the work folder of a checkout, relative to its root, instead of `todo/`: where the packs' skills write the artefacts of a workflow; empty, or a folder absent from the checkout, `todo/` applies; the repository pack sets it (`backstage/tasks` for Orkeon), or you do (D69) |
| `HARNESS_GUARD_RESTORE` | `0` turns off the guard of the one restore per batch: a role subagent of the dev chain (`dev-test-author`, `dev-implementer`, `dev-auditor`) is refused a `dotnet restore`, and a `dotnet build` or `dotnet test` without `--no-restore` / `--no-build` on a project already restored; in your session or a `dev-batch` agent a second restore is only pointed out (plan B, 2026-10-12) |
| `HARNESS_SHOW_MEMO` | `1` refuses a `show` the same agent was already served for an unchanged file — its output is in that agent's context, and `HARNESS_FORCE_READ=1` in front of the command shows it again; `0` turns this off |
| `HARNESS_AST_GREP_BIN` | the `ast-grep` binary `code-map.py` and the read refusals use (`ast-grep`; `/usr/bin/sg` is another tool) |
| `HARNESS_SOURCE_CLI_NAMES`, `HARNESS_SOURCE_CLI` | the commands the image installs for the product, refused in a checkout of that product, and the command that runs the checkout's own build instead; empty, the guard is off; the repository pack sets them (`orkeon`; `dotnet run --project src/scripting/Orkeon.Scripting.Cli --`) |
| `HARNESS_CONTEXT_LOG`, `HARNESS_CLEAR_NUDGE` | `1` turns on the log of the instruction files loaded and the `/clear` suggestion; the `usage` pack sets both |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | the read limits: the lines and bytes of a whole read, the lines of a diff, the length of the outline given instead, and the size of an outline, as a share of the file, from which the file counts as flat (an outline would not help) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | after how many files read directly the main thread is reminded to delegate (6; then at each doubling) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | the subagents' report length; the model of exploration subagents |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_WINDOW`, `HARNESS_BATCHING_SAMPLE`, `HARNESS_BATCHING_COOLDOWN`, `HARNESS_RTK_BIN` | the shell modules: `1` refuses every git command that changes something, Claude hands you the command instead (`0`); the batching nudge — how many consecutive turns with a single tool call before it fires (6), one call in how many it inspects (3), how many turns with tool calls before it fires again (6); the `rtk` binary the rewrites use (`rtk`) |

For the container itself: `HARNESS_SYNC=off` stops the synchronisation at start, and `HARNESS_PROFILE`
names the first profile of a folder ([configuration](./configuration.md)).

Next: [Troubleshooting](./troubleshooting.md).
