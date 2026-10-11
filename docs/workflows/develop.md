# Develop a feature: spec, plan, implement, verify

*English · [Français](../fr/workflows/develop.md)*

This page is for the core developer of a repository: you have a feature to build, and you want it
specified, planned, written test first and audited before you commit it. It runs **in a git checkout
only**: mount the checkout where a workshop would be and name the profile at the first start
(`-e HARNESS_PROFILE=dev`), or switch later with `/workshop-profile dev`. The `dev` profile is refused
in a workshop. At the end, `todo/<code>/` holds the spec, the plan, one sheet per batch and one verdict
per audited batch, and the repository holds the commits you made, one per batch. A bug, a refactor or a
performance change enters the same chain through `/dev-change` instead of `/dev-spec`: a brief made of
evidence replaces the business spec, and everything after it is identical.

```mermaid
flowchart LR
    s["/dev-spec &lt;code&gt;<br/>SPEC-&lt;code&gt;.md"] -->|"stop: you validate"| p["/dev-plan &lt;code&gt;<br/>&lt;CODE&gt;-PLAN.md<br/>one sheet per batch"]
    c["/dev-change &lt;code&gt; bug|refactor|perf<br/>CHANGE-&lt;code&gt;.md"] -->|"stop: you validate"| p
    p -->|"stop: you validate"| b["/dev-implement F&lt;n&gt;<br/>RED · GREEN · COST"]
    b --> v["/dev-verify F&lt;n&gt;<br/>VALID or GAPS"]
    v -->|"GAPS: a correction"| b
    v -->|"VALID — stop: you commit<br/>then /clear"| n(["next batch"])
```

## Before you start

- **The space**: the git checkout of the repository, mounted at `/workspace` (or `ORKEON_WORKSHOP`), as
  [In a source checkout](../reference/harness.md#in-a-source-checkout) describes. The harness lands in
  the checkout's `.claude/`, listed in `.git/info/exclude`; `todo/` is excluded from git the same way.
  `todo/` is the default **work folder**: a repository pack may name a folder of the repository instead
  (Orkeon: `backstage/tasks/`, where its tasks and backlog live), the session's first line says which,
  and `todo/` on this page then reads as that folder — git sees it, you commit it (D69).
- **The profile**: `dev` — the packs `core`, `source`, `dev`, `quality` and `usage`
  ([Profiles and packs](../reference/harness.md#profiles-and-packs)). The pack sets the switch
  `HARNESS_DEV_BATCH_GUARD` to `1`, which turns the `dev-batch-guard` hook on: one `/dev-implement` batch
  per session.
- **The repository's values**: in a checkout of Orkeon (`origin` on `Orkeon/orkeon`) the repository pack
  `repo-orkeon` joins the profile. It brings the layer rules `orkeon-domain.md`,
  `orkeon-application.md` and `orkeon-tests.md`, loaded when a file of that layer is read, and
  `repo.yaml`: the layout (where the domain, application, infrastructure and test projects live) and the
  build and test commands the skills run. In any other repository the skills ask for a missing value
  once, naming the key.
- **Docker**, when a batch touches an adapter: an integration test runs against the real dependency in a
  container. Without Docker the test is written and reported as not run.
- **The product's CLI**, in a checkout of Orkeon: `orkeon` on the PATH is the build the image carries at
  its own commit, not this code. A command that runs it is refused, and the refusal quotes the command
  of the checkout, from `repo.yaml` (`dotnet run --project src/scripting/Orkeon.Scripting.Cli -- …`,
  typed from the top of the checkout).

## Step 1 — `/dev-spec`: the business spec

```text
/dev-spec <code> [the feature, or the path of a brief]
```

`<code>` is a short kebab-case slug; the folder is `todo/<code>/`. Claude reads the brief, has one
`Explore` subagent list what the code already answers, then asks you what it cannot: **one decision per
question**, the recommended answer first; the scope is challenged only when an answer would cut it, in
three questions at most. It then writes `todo/<code>/SPEC-<code>.md`: use cases `UC-nn`, business rules
`BR-nn` with their origin and severity, data, states, what is out of scope, assumptions and open
questions. Nothing technical: no type, file, table or framework. An existing spec is revised, never
written over; it is written in English unless you ask otherwise.

The `adversarial-reviewer` subagent then tries to refute the spec, read-only: it returns closed
questions ranked `Blocking` or `Major`, or `CLEAR`. Every `Blocking` question is put to you, one at a
time, and its answer written into the spec; `Major` ones stay as open questions or assumptions. The
reviewer keeps a memory of the repository under `.claude/agent-memory/adversarial-reviewer/` — the holes a
spec or a plan of this repository tends to leave, which questions were answered and how, the paths that
exist and the ones that were guessed before — and the `memory-scope` hook lets it write there and nowhere
else.

**Stop: you validate.** Claude shows the use cases and rules, the open questions and their severity,
then stops. `/dev-plan` refuses to start while a `Blocking` open question remains.

## Step 1, for a change — `/dev-change`: the brief of a bug, a refactor or a performance change

```text
/dev-change <code> bug|refactor|perf [the brief, an issue, or contrib/<slug>/RECORD.md]
```

What has no business spec to write takes this entry: a behaviour the product already promises and
breaks (`bug`), the same behaviour in a better shape (`refactor`), the same behaviour at a lower cost
(`perf`). Claude establishes the facts before writing: a bug is **reproduced by running** the origin's
reproduction or the command of the brief (a bug that does not show stops here); a perf change is
**measured** first (the number before, how it was read, the `Cost:` line of the access-cost script); an
`Explore` subagent lists the code path, the tests that already pin the behaviours of the area and the
call sites. Then one decision per question, for what the code cannot answer.

The brief, `todo/<code>/CHANGE-<code>.md`, holds the origin, the evidence, acceptance criteria `CH-nn`
(each with its proof: the reproduction turned green, a number, "nothing observable changes"), a table of
**what must not change** with the test that pins each behaviour — or `unpinned`, which the plan turns into
a characterisation test written first —, the scope and the technical constraints. No design: where the
fix lands is `/dev-plan`'s. A fact that turns out to be a new promise sends you to `/dev-spec`. The
`adversarial-reviewer` refutes the brief as it refutes a spec.

**Stop: you validate.** Then `/dev-plan <code>` reads the brief as it reads a spec; the `CH-nn` ids are
traced, tested and carried as traits like `BR-nn`. For a refactor, the tests that pin the behaviour are
named in the sheet as `pinned`, green before the change and after it; for a bug, the reproduction is
the first red test; for a perf change, the measurement after is the sheet's access-cost target.

## Step 2 — `/dev-plan`: the plan and its batches

```text
/dev-plan <code>
```

Claude first lists the open `Blocking` questions of the spec or the brief; one left, it stops and sends
you back to `/dev-spec <code>` or `/dev-change <code>`. Then it reads the spec, the design rules (`DDD-`, `APP-` and `PERF-` ids every plan
classifies as applied or non-applicable with a reason) and the repository's layout and commands from
`repo.yaml`, asking once for what is missing and writing the answer on the `Commands` and `Layout`
lines of the plan. One `Explore` subagent inventories the reusable types, the use cases that own a
similar act and the test anchors.

It writes two levels under `todo/<code>/`: the global plan `<CODE>-PLAN.md` (the batches, their order,
the traceability of every `BR-nn` and `UC-nn` to a code owner) and one sheet `<CODE>-PLAN-F<n>.md` per
batch (its design decisions, the TDD sequence with a named test per behaviour, the exact paths
`/dev-implement` will copy). Batches are functional and sequential by default. The
`adversarial-reviewer` refutes the plan: a `Blocking` row is fixed or asked of you, a `Major` row fixed
or kept with its reason under the sheet's `## Decisions`. It reads and extends the same memory of the
repository as in step 1, `.claude/agent-memory/adversarial-reviewer/`, the one place the `memory-scope`
hook lets it write.

**Stop: you validate.** Claude summarises the batches, the ids traced and how each review row was
settled, then ends with the next command:

```text
→ Manual plan validation required. Once validated: /dev-implement F1 todo/<code>/<CODE>-PLAN.md
```

## Step 3 — `/dev-implement`: one batch, test first

```text
/dev-implement F<n> todo/<code>/<CODE>-PLAN.md
```

Claude orchestrates and judges; two subagents write. Per behaviour of the sheet, strictly in this order:

1. **RED** — `dev-test-author` writes the tests named by the sheet, with the paths copied from its
   anchors, and runs them: they must fail on their assertion. Each test carries the repository's rule
   trait for the ids it proves (`[Trait("BR", "BR-nn")]` for Orkeon, from `repo.yaml`): the audit gate
   of step 4 refuses a batch whose sheet names an id no test carries.
2. **GREEN + REFACTOR** — `dev-implementer` writes the least production code that turns them green,
   then refactors; test files are read-only to it.
3. **COST** — the number of IO calls of the behaviour must be bounded and independent of the input
   size, as the sheet planned. It is measured, not stated: `access-cost.py` lists, from the syntax tree
   (`ast-grep`), every call awaited through a port and whether it sits in a loop or a lambda over the
   input or filters in memory what the port could filter; the implementer copies its last line into its
   report, and Claude checks it against the sheet. A flagged cost goes back to `/dev-plan`, never patched.

Each step observed is ticked on the sheet (`TDD: RED [x] GREEN [x] COST [x]`). A question that changes
the scope, an id or a design decision stops the batch; one that changes none is written under the
sheet's `## Assumptions` as `Hn`. Then the whole build and test suites run once, the sheet and the
global plan are marked done with the date, and the audit of step 4 runs in fast mode.

**One batch per session.** The `dev-batch-guard` hook refuses a second `/dev-implement` in the same
session and says to run `/clear` first; a correction of a closed batch passes.

**A compaction during a batch** is covered by the `dev-compact` hook, on with the `dev` pack (it sets
`HARNESS_DEV_COMPACT` to `1`). Before the context is compacted, the hook writes
`todo/<code>/<CODE>-STATE-F<n>.md`: the steps of the sheet with their `TDD:` line and the first open one,
the progress lines the batch printed, the delegations made, and `git status --short`. The session that
resumes after the compaction is told to read it first and never to relaunch a delegation it lists. The
file is rewritten at every compaction.

On `VALID`, Claude prints a summary of the batch and hands the commit over as a script written from the
files the batch touched (D47). Its message follows the shape `repo.yaml` gives, for Orkeon
`type(scope): summary`. You type it in Claude Code with `!` in front, or in a terminal of the container:

```bash
bash .claude/local/scripts/commit-F<n>.sh
```

When it worked, git prints the new commit's short hash and its message. If you are on the default
branch and the repository names a branch pattern, Claude says so before the script: you create the
branch first. The session ends on the closing line, printed once:

```text
→ Batch F<n> complete — manual validation required. Run /clear before the next batch.
```

## Step 4 — `/dev-verify`: the audit, on its own

```text
/dev-verify F<n> [todo/<code>/<CODE>-PLAN.md] [full | resume]
```

`/dev-implement` runs this at its close; you also run it on its own, for instance after a correction.
A script, `audit-capture.sh`, is the **gate**: it fails on a `TDD:` line still open, a design id neither
applied nor non-applicable, a file changed outside the production and test roots and absent from the
sheet, an id of the sheet's TDD sequence that no test carries as its rule trait, or whitespace errors.
Red, nothing is audited until you fix what it lists. Green, it writes a capture (status, changed files,
the batch diff, the build's exit code, the access cost of the changed production files with every port
call in a loop flagged, the rule traits found) that the `dev-auditor` subagent opens once, read-only and
in its own context. The auditor walks the diff hunk by hunk along nine axes,
from correctness to scope, runs the narrowest test commands that prove the batch, and answers `VALID`
or `GAPS`. `full` adds the whole fast suite; `resume` re-audits after a correction, from the previous
gap table and the diff since. The auditor keeps a memory of the repository under
`.claude/agent-memory/dev-auditor/` — the layout and the test commands that answer, the gap categories
that keep coming back and the rule `/dev-learn` made of them, a false positive and why it was one — and
the `memory-scope` hook lets it write there and nowhere else.

Claude writes `todo/<code>/<CODE>-VERIFY-F<n>.md`: the verdict, a table of gaps (severity, axis, gap,
evidence, expected fix) and the validations run. `GAPS` as soon as one `Blocking` or `Major` row stands;
`VALID` lists its minors for you to decide. Run on its own:

- `VALID`: the commit is handed over as in step 3, and the closing line printed;
- `GAPS`: the correction is yours to launch, from the first gap:

```text
/dev-implement F<n> — correction: <the finding>
```

A correction reopens the closed batch under a `Correction Cn` line of its step and runs the RED, GREEN
and COST loop for it; a finding that changes the scope, an id or a design decision is routed to
`/dev-spec` or `/dev-plan` instead. Two audit rounds still in `GAPS` at a batch's close: Claude stops
and hands you the blocking gaps.

## Alongside the chain: `/dev-unit-tests`, `/dev-integration-tests`

The two test skills are the guides `dev-test-author` reads for the level a RED asks; you also run
them alone, for a test outside a batch.

| Skill | What it writes |
|---|---|
| `/dev-unit-tests <type or use case> [scenario] [id]` | a unit test in the test project mirroring the production one, extending the existing test class, on hand-written doubles; red first on its assertion, then green on exit `0` |
| `/dev-integration-tests <adapter> [scenario] [id]` | an integration test of an adapter against the real dependency (for Orkeon Testcontainers, `[Trait("Category", "Integration")]`), kept out of the fast suite; without Docker it is written and reported as not run |

Both end with the test, the command and its exit code. The production code then goes through
`/dev-implement` when a plan exists.

## Between batches: `/dev-learn`

```text
/dev-learn [axis]
```

Run after `/clear`, never during a batch, one axis at a time. Claude reads the untreated `Blocking` and
`Major` gaps of every verdict file (`todo/*/*-VERIFY-F*.md`) and groups them into motifs, kept only when
they recur over three batches or more and a line or a check would have caught them before the audit.
Each motif gets the narrowest destination: the repository's own guidance or check, written in the
checkout; or a harness file, never edited in place since the next synchronisation rewrites it — Claude
prints an exact patch for the orkeon-workshop repository, for you to apply there. Nothing is written
before you accept each proposal; a refused motif is never proposed again. `/dev-implement` reminds you
of the backlog at a batch's close when two batches or more are waiting.

## What is on disk afterwards

```text
<checkout>/
├── todo/<code>/                     excluded from git (or the repository's own work folder, D69)
│   ├── SPEC-<code>.md               the business spec — or CHANGE-<code>.md, the brief of a change
│   ├── <CODE>-PLAN.md               the global plan: batches, order, traceability
│   ├── <CODE>-PLAN-F1.md            one sheet per batch, ticked and dated when done
│   ├── <CODE>-PLAN-F2.md
│   ├── <CODE>-VERIFY-F1.md          one verdict per audited batch (a dated section per resume)
│   └── <CODE>-STATE-F1.md           the state of an open batch, written only when a compaction happened during it
├── .claude/agent-memory/            the agents' memory, listed in .git/info/exclude like todo/
│   ├── dev-auditor/
│   └── adversarial-reviewer/
└── .claude/local/
    ├── scripts/commit-F1.sh         the commit handed over, one per batch
    └── dev-learn-state.json         what /dev-learn treated and what you refused
```

## Where this piece connects

- **Before**: an issue filed by a contributor ([Contribute](./contribute.md)) is often the brief you give
  `/dev-spec`.
- **After**: the batches you committed and pushed go to review as a pull request; a contributor's
  `/contrib-pr` walks the repository's checklist for it ([Contribute](./contribute.md)). A merged feature
  then goes into a version ([Release a version](./release.md)).
- **Measured**: `/quality-report` runs the repository's build, tests, coverage and Sonar on the result
  ([Release a version](./release.md)).
- **Documented**: `/docs-audit` confronts the pages the feature changed with the code
  ([Keep the docs true](./keep-docs-true.md)).
- **The whole picture**: [Workflows](./overview.md).

Next: [Release a version](./release.md).
