# Delegation contracts — RED and GREEN

Read by `/dev-implement` at entry. The plan is read once, in the main thread; the agents receive these
contracts and never re-read the plan or the sheet. Every path is **copied** from the sheet's `## Anchors`
row — with the member it names, `show <path> <Type/Member>`, or its line, `path:line`, so that a role reads
a member or a range and never a file whole ("A line, not a file", below) —, every test name and id from the
step's table under `## TDD sequence`.
A missing row is a plan hole:
one `ls` to confirm the path, one `Edit` adding the row to the sheet, then delegate — never a search
through the test tree from here. In a `dev-batch` agent the sheet is read-only: the row goes in the
contract and in your report, under `Decisions and deviations`, for the orchestrator to write.

Each `Agent` call carries a `description`. The agents' charters pin their model.

## RED — `dev-test-author`

```text
Batch: F<n>
Ids: BR-nn / UC-nn / CH-nn
Kind: feature | bug | refactor | perf — from the global plan's `## 1. Scope` (Spec, or Change)
Harness: <absolute path of the checkout's .claude/ — "The harness path" below>
Behaviour: <one sentence, observable>
Level: unit | integration | pinned — read <harness>/skills/dev-unit-tests/SKILL.md | dev-integration-tests/SKILL.md
Test class / fixture: `<Class>` / `<Fixture>` — existing | to create
Methods: `<ShouldX_WhenY>` — one per scenario, in the order of the Scenarios line, each with its id
Rule trait: [Trait("<tests.rule_trait>", "<id>")] on each method, for the ids of its scenario — from repo.yaml; drop the line when the pack has no tests.rule_trait
Rewritten by you (read in full): <test file, fixture — exact paths, each with its line count, `(<n> lines)`, or `(new)`>
Read bounded (context only): <production type under test, shared doubles and builders, from ## Anchors — `Read: show <path> <Type/Member>` per member named, `path:line` where none is>
Scenarios: <one line each>
Expected observation: <what the assertion reads: a returned value, a state, an error, a recorded call>
Build command: <commands.build_test, <test project> substituted — the test project, never the solution>
Test command: <commands.test_class, <test project> and <Class> substituted>
Warm build: <the build file of the worktree> — wait for its exit= line before your first build   (a dev-batch agent, its warm build still running; else drop the line)
Forbidden: any file search; any `dotnet restore` (the orchestrator restored once, B7). A missing path comes back as ## BLOCKED.
```

- **The line count** of a file read in full is the orchestrator's `wc -l`, so that the author reads it in
  one `Read` with `offset` 1 and `limit` that count: `read-bounds` refuses a bare `Read` of more than 120 lines
  (2026-10-18, GAP-50-55: 66 of its 114 refusals went to the test author).
- **`Warm build:`** (2026-10-18, B8 amended): the author writes its tests while the worktree builds, then
  waits for the file's `exit=` line in slices of 270 seconds before its `Build command` — the slice of the
  `dev-batch` charter —, five at most; a non-zero exit, or none after the fifth, comes back `## BLOCKED` with
  the file's last three lines.

- **Names are given, not chosen**: the agent writes method bodies, never renames, merges or splits.
- **Kind `refactor`**: the `pinned` rows are existing tests — the agent adds the trait to them and
  runs them green, changes nothing else there; a characterisation test (an `unpinned` row) pins
  what the code does today and is green at once. For these rows alone, green on the first run is the
  expected outcome and the exception of `## Two outcomes that are never kept` does not apply. Kind
  `bug`: the reproduction is the first red test. Kind `perf`: a test on an observable count is red on
  today's count; otherwise the proof is the `Cost` note at COST, against the brief's target.
- **The trait is the mechanical link test ↔ rule**: the audit gate (`audit-capture.sh --trait`) refuses a
  batch whose sheet names an id no test carries. Orkeon's trait is `BR` (`[Trait("BR", "BR-nn")]`; a change brief's ids read `CH-nn`).
- The two path lines are distinct on purpose: `read in full` is a file the agent rewrites,
  `read bounded` one it only consults, by the `show` or at the `path:line` given. Keep both literals verbatim; `read in
  full` is written here, for the file the author rewrites, and nowhere else ("A line, not a file").
- **The two commands build and test the test project, never the solution** (plan B, B2): `Build
  command` is `commands.build_test` with `<test project>` replaced by the folder of the test project the
  step's `Project` column names (the folder of the test class path of `## Anchors`, `tests/<zone>/<Project>.Tests`
  for Orkeon); `Test command` is `commands.test_class` with the same folder and `<Class>` the test class.
  Both carry `--no-restore` or `--no-build`: the restore was made once, at the batch's entry (§ 1), and
  the solution is built once, by you, at § 3. A build that fails outside the test project — a ripple of
  signature in a file the contract does not name — comes back `## BLOCKED` with the file: a contract
  hole, filled by one more `Signature ripple` clause, never a build of the solution by the agent.
- Its report: a table `| Test | Case covered |` and `## DONE` whose `Notes` carry the production diff
  (empty, or the signature stubs it listed) and the expected failure. A test method in the diff but not
  in the table → back to the agent. Stubs it lists go under `Already stubbed` of the GREEN contract.

## GREEN — `dev-implementer`

```text
Batch: F<n>
Ids: BR-nn / UC-nn / CH-nn
Kind: feature | bug | refactor | perf
Harness: <the same path as RED>
Behaviour: <one sentence>
Red tests: <exact path + method names>
Out of scope — next behaviour: <guard or branch not to write: it would turn the RED of <X> green>
Already stubbed at RED (body to fill): <exact path:line of each stub — the `stubs:` line of the RED report>
To create from scratch: <exact paths>
Signature ripple — also touched: <exact path:line — what changes there, one clause each>
Read bounded (context only): <each element the behaviour reads, from ## Anchors — `Read: show <path> <Type/Member>` per member named, `path:line` where none is; never a file whole>
Elements: <exact names and public signatures from the sheet — declaration only, never a body>
Applied rules: <DDD-/APP-/PERF- ids of the sheet>
Invariants — what they remove: <the branch, loop or read each one makes useless>
Expected access cost: <n reads + n writes through ports, independent of <input>>
Build command: <the same build of the test project as RED>
Test command: <the same test command as RED>
```

- The contract carries only what the agent cannot know. Its charter already binds the rest: tests are
  read-only, refactor after green, orphans deleted, the report shape.
- **Signature ripple**: a signature that moves lands in files neither stubbed nor created — adapters,
  hand-written doubles, fixtures. Name each, one clause. A file the agent finds missing is a contract
  gap it reports, never one it absorbs silently.
- **Current behaviour only**: a guard of a behaviour whose test is not written yet must not be in this
  contract — its RED would come back green.
- Its report: `## DONE` with the production files, the narrowed command `— exit 0`, and `Notes` carrying
  `Tests diff — empty`, `Cost — ` followed by the last line of `access-cost.py` (`Cost: n reads + n writes
  through ports outside loops; in a loop, a lambda or a memory filter: none`), or `stated by hand: …` when
  `ast-grep` is missing, what the refactor deleted, and what it reports without fixing (`path:line`).

## A line, not a file — what a role reads (S0 of the reading plan, 2026-10-13; D75)

Every path a contract carries but `To create from scratch` and RED's `Rewritten by you` names the line of
the element it is about: `path:line`, copied from `## Anchors` (an existing member carries its line there,
from the inventory of `/dev-plan`), from the step's table, or from the `stubs:` line of the RED report for
the stubs GREEN fills. The role reads the range around that line — `Read` with `offset` and `limit`, sixty
lines or so — and never the file whole: `Elements:` names what it touches, and the four runs measured on
2026-10-12/13 found the heaviest reads of GREEN in a `read in full` asked on a 400-line adapter whose
contract named three members (the agent did exactly what it was told). `read in full` survives in one
place, the test file the author rewrites. A contract line without its `:line` for an existing file is a
hole you fill before delegating — from the sheet, never from the file: you open no source file
(`guard-pilot-reads`). When the sheet has no line either, the agent is told
`Read bounded (context only): <path> — locate <member> with one grep -n, then the range`.

**By name first (S1 of the reading plan, 2026-10-14).** An existing member the sheet names is handed by
its name, not its line: `Read: show src/…/ToolSchema.cs ParameterSchema/ReadAsMap` — the role runs
`python3 <harness>/scripts/code-map.py show <path> <Type/Member>` (`<Member>` alone when the name is
unique in the file), which prints that member alone, its `///` comment above it, under its bounds
`path:start-end`; a markdown section the same way (`show <sheet> "Step 2"`). The `path:line` stays where
no member name exists (a registration line, a field initialiser, a member the sheet does not name), and
on a file the role edits: `Edit` takes a `Read` of the file first, so that one is read on its range, the
bounds `show` printed giving the `offset`. Without `ast-grep` the script says so in one line, exit 3: the
`path:line` and the range, as above. The same `show` asked twice by one agent for an unchanged file is
refused (`guard-show-memo`): its output is already in that context.

## The harness path — the `Harness:` line (2026-10-12)

The roles read the common rules, the test skills and `access-cost.py` under the harness, and a worktree
holds none: the `Harness:` line of every contract is the absolute path of the checkout's `.claude/` —
`$(git rev-parse --show-toplevel)/.claude` inline, the `harness:` line of its own prompt in a `dev-batch`
agent (the main checkout's) — and the charters read every `<harness>/...` path from it. Seen on 2026-10-12
(V-34): a GREEN agent in a worktree looked for `.claude/skills/dev-implement/references/common-rules.md`
there and found nothing.

## Builds and the restore — the orchestrator's side (plan B, 2026-10-12)

- **One restore per batch** (B7). `commands.restore` runs once, at the batch's entry (`/dev-implement` § 1.6),
  to a file like every `dotnet` (`suite` `restore`): a non-zero exit stops the batch, said with the last
  lines. It is the one moment the network is touched, for what the image's `NUGET_PACKAGES` cache lacks;
  `-p:NuGetAudit=false` (Orkeon's pack) leaves the vulnerability audit to the CI. Everything launched
  after it carries `--no-restore` or `--no-build` — `build_test`, `test_class`, `commands.build`,
  `commands.test`, the gate's build — and the roles never restore (their charters; `guard-restore`
  refuses them and flags a second restore of yours). In a `dev-batch` agent the `WorktreeCreate` hook
  ran `commands.restore && commands.build` in the background when the worktree was created (B8): the
  charter says which file to wait for; its `exit=0` is the restore of the batch, never redo it.
- **Node reuse stays on**: never `-nr:false` nor `MSBUILDDISABLENODEREUSE=1` — measured slower on both disks (2026-10-18,
  V-40: 4 s against 7 natively, 18 against 21 on 9p, for one test project), where GAP-50-55's agents added them 351 times.
- **The one legitimate second restore**: a `.csproj` or a `PackageReference` changed in the batch, seen
  as a `NETSDK1004` or a stale `project.assets.json` on a `--no-restore` build. Run `commands.restore`
  once more, say so in one line (`→ Restore again: <file> changed`), then build again. Never a third.
- **A command that can outlast 270 seconds** — the build or the whole suite of the solution — runs detached to
  its file and is awaited in slices (2026-10-14, GAP-43-44; the `dev-batch` charter says why: a wait longer than
  the five minutes of the prompt cache makes the next turn write the whole context again, 25 times the price of
  reading it): `setsid nohup flock <harness>/local/worktrees/.build.lock bash -c '<cmd> > "$0" 2>&1; echo "exit=$?" >> "$0"' /tmp/dev-F<n>-<suite>.txt >/dev/null 2>&1 &`
  (`mkdir -p <harness>/local/worktrees` first when that folder is missing: an inline batch), then
  `timeout 270 bash -c "until grep -q '^exit=' /tmp/dev-F<n>-<suite>.txt; do sleep 5; done"; tail -15 /tmp/dev-F<n>-<suite>.txt`
  again until the `exit=` line is there — the paths written literally, never through `${…}` or `$(…)` (the
  isolation guard of a worktree, "Commands in a worktree" below). **The build lock** (D81, 2026-10-18): `flock` takes, inside the detached process, the
  lock the warm build of a worktree holds (`worktree-create.sh`), so that two long builds of a checkout never
  overlap — four at once took eight times one alone in GAP-50-55 —; the wait stays detached, in slices (D77).
  Under `HARNESS_BUILD_LOCK=0` (`printf '%s' "${HARNESS_BUILD_LOCK:-1}"`) drop `flock <lock>`. The builds of
  one test project (34 s of median) take no lock. The `exit=` line is the one the audit gate reads (`--build-log`). Never one long loop:
  the Bash tool ends a call at 290 s (`BASH_DEFAULT_TIMEOUT_MS` of the harness's `settings.json`; 120 s
  without it), and a slice of 270 s fits under it. Every log of a batch carries its number, `dev-F<n>-…`:
  `TMPDIR` is empty in the container, and the batches of a run share `/tmp`.
- **The whole suite once per batch** (2026-10-14, GAP-43-44: `dotnet test Orkeon.sln`, about 21 900 tests, ran 28
  times for 43 minutes, two to six times per batch). `commands.test` runs once, at § 3. Every later run — a red
  suite fixed, a correction of the audit (`closing.md` § 2) — runs `commands.test_project` on each folder
  `python3 <harness>/skills/dev-implement/scripts/affected-tests.py --base <base>` prints (the test projects the
  batch changed and those depending on a project it changed; `<base>` the `base` of the state line in a `dev-batch`
  agent — the script's default there, so that the checkpoint commits still count —, HEAD inline). The folders of
  one round run as one command, `{ <run 1> && <run 2>; }`, to `dev-F<n>-test-affected.txt`, overwritten at each
  round: one `exit=` line, the one the wait greps. The whole suite again only when the script
  prints `all` (a file no project owns: a `Directory.Build.props`, a `.sln`) or the pack has no `test_project`.
  The solution itself is built again at every round (`commands.build` to `dev-F<n>-build.txt`): the gate reuses a log
  only when it is green and newer than every changed file, and an audit never stands on a partial build.
- **One build of the solution** (B2, B3): the roles build their test project (`Build command`); the
  solution is built once, at § 3, `commands.build` to `${TMPDIR:-/tmp}/dev-F<n>-build.txt`. The audit gate
  reuses it: `audit-capture.sh --build-log "${TMPDIR:-/tmp}/dev-F<n>-build.txt"` reads that log instead of
  building again when it ends green and no changed file is newer than it (`/dev-verify` § 2); `--test-log`
  puts the last test run in the capture too (B6): `dev-F<n>-test-affected.txt` once a round ran after the
  whole suite, else the `dev-F<n>-test.txt` of § 3 — the whole suite's result stays in the report's `Suites`
  line. A build you re-run after a correction overwrites the same file, so the gate always reads the last one.

## Commands in a worktree (2026-10-18)

In a worktree of `/dev-batches` (a `dev-batch` agent and every role it delegates to), Claude Code's isolation
guard checks each Bash call and refuses what it cannot verify: in GAP-50-55, 335 refusals, 12.3 % of the
batch agents' calls, each one turn lost (271 "names git in a form too complex to verify", 64 "runs sed with a
value computed at runtime"). Its documented remedy is "split it into plain, separate commands". The forms,
probed in a worktree on 2026-10-18 (`VERIFICATIONS.md`, V-40), 46 calls:

- **git, bare, from the working directory** — the worktree. Refused: `git -C .` ("a directory computed at
  runtime"), `cd <path> && git`, `git -C <another path>` ("redirects git to the shared checkout").
- **No `$(…)`, backtick or `${…}` in a command that runs git, `sed`, or `bash -c`/`sh -c`**: refused as
  "too complex to verify", even `git log ${B:-HEAD}` or a `$(basename "$PWD")` inside the string of a
  `bash -c`. A value computed first takes two calls — the first prints it (`git rev-parse --short HEAD`,
  `grep -l <pattern> <paths>`), the second carries it literally (`sed -i 's/a/b/' <the paths printed>`). A
  plain variable set in the same call passes (`f=x.txt; sed -i 's/y/z/' "$f"`). A line that needs the clock
  is written by `date '+<the line, %H:%M inside>'`, not by `printf … "$(date …)"`.
- **Accepted as written**: simple commands chained by `&&` (`git add -A -- <roots> && git commit -q -m "…"`),
  the slice `timeout 270 bash -c "until grep -q '^exit=' <file> 2>/dev/null; do sleep 5; done"` with a literal
  path, the detached `setsid nohup flock <lock> bash -c '…' <file> &` of "Builds and the restore", `dotnet`
  to a file, `python3 <harness>/scripts/…`, reading the main checkout's files (`wc -l`, `code-map.py`).
- A refusal is never retried in the same form: split it.

## Two outcomes that are never kept

- **A test green on its first run**: either the behaviour is already covered (the agent deletes its
  test and says which one covers it) or the assertion is too weak (it strengthens it until red).
- **Production code ahead of a red test**: deleted, never kept "for reference".
