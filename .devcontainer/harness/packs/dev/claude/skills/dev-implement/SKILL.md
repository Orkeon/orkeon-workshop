---
name: dev-implement
description: Step 3 of the dev chain - implements one batch of a validated plan under strict TDD, behaviour by behaviour (dev-test-author writes the red tests, dev-implementer turns them green), then has dev-auditor verify it and commits the batch. One batch per context; several at once through /dev-batches.
argument-hint: "F<n> [<work>/<code>/<CODE>-PLAN.md] | F<n> — correction: <finding>"
disable-model-invocation: true
---

# /dev-implement — one batch, test first

Step 3 of the dev chain. You orchestrate and judge; two subagents write: `dev-test-author` the red tests,
`dev-implementer` the production code. Per behaviour: **RED → GREEN → REFACTOR → COST**, in that order. You never
write a test or a production line yourself, except the declarative artefacts the sheet lists.
**You open no source or test file**: the contracts carry `path:line` copied from `## Anchors` and the step's table;
a path you doubt gets one `ls`, never a `cat`, a `Read` or a `grep`. You read this skill, `references/contracts.md`, `references/closing.md`,
the plan and the sheet by section (§ 1.3) — nothing else, here or in a `dev-batch` agent (D70). The batch is
committed and pushed at the end, by you (D71), never before.

Arguments: $ARGUMENTS

## 1. Entry

1. **One batch per context** (D70). A batch already closed here (`→ Batch F<n> complete` printed) and no
   `— correction:` in the argument → stop, read nothing, print `→ Batch F<n> already closed in this context. Several
   batches: /dev-batches F<m> [F<o>…]; one more here: /clear, then /dev-implement F<m>.` (`dev-batch-guard` enforces it.)
2. The plan: the path in the argument (as text — an `@` mention attaches it to every turn), else `ls <work>/*/*-PLAN.md`,
   several → ask. No plan → stop and name `/dev-plan`.
3. In **one message**: the global plan **by section** (`grep -n "^## \|^### "`, then `## 0. Summary`, `### Batch F<n>`,
   `## 1. Scope`); the sheet `<CODE>-PLAN-F<n>.md` **by section** too — its map first (`grep -n "^## \|^### \|^TDD:" <sheet>`),
   then, as ranges of that map (`sed -n 'A,Bp'`), `## Intent`, `## Design`, `## Code elements`, `## Anchors` and the
   preamble of `## TDD sequence` (down to its first `### Step`); and `references/contracts.md`. A step's section is
   read at the start of its cycle (§ 2), `## Assumptions` and `## Decisions` at the close (§ 4): never the sheet whole.
   Commands and layout: the `Commands` and `Layout` lines of `## 1. Scope`; absent, `.claude/harness/packs/repo-*/references/repo.yaml`;
   absent too, ask once and write them on those lines.
4. Steps whose `TDD:` line (in the map) reads `TDD: RED [x] GREEN [x] COST [x]` are done: resume at the first open one.
5. `— correction: <finding>`: a finding that changes scope, an id or a design decision → stop, route to `/dev-spec`,
   `/dev-change` or `/dev-plan`. Otherwise add under the step `Correction Cn — <finding>` with its own
   `TDD: RED [ ] GREEN [ ] COST [ ]` line, keep the earlier evidence, run the loop for it.
6. **One restore per batch** (B7): before the first RED, `commands.restore` once, to a file (§ 3's rule, suite `restore`),
   as `contracts.md` "Builds and the restore" says; in a `dev-batch` agent the worktree's warm build is that restore. Nothing after it restores.

## 2. The loop, per behaviour

- **Group first.** Steps on the same use case and the same domain method are one cycle; a guard or a refusal is
  one more scenario of it — the step titles of the map and the rows of `## Anchors` say which steps share a test
  class and a production file. Announce the mapping (steps 1-2 → behaviour A) before the first RED. Inside a cycle
  every scenario is red before any production code.
- **The step's section, once.** At the start of a cycle, read the sections of its steps only —
  `sed -n '/^### Step <n> /,/^##/p' <sheet>` (the next heading closes the range) — never again after: the tables
  and `TDD:` lines you need are then in your context. Nothing else of the sheet is re-read.
- **RED** — delegate to `dev-test-author` with the RED contract of `references/contracts.md`: paths from `## Anchors`,
  test names and ids from the step's table, `Build command` and `Test command` on the test project (B1, B2).
  Behaviours whose test files are disjoint (`## Anchors`) have their REDs in one message, one agent each (B4). Check
  its report: production diff empty or stubs only, exit non-zero — except the `pinned` and characterisation rows of a
  `refactor`, green by construction (`contracts.md`, "Kind"). Relay its table at once, adding the ids:
  `### RED — <behaviour> (exit N)` then `| Test | Ids | Case covered |`.
- **GREEN + REFACTOR** — delegate to `dev-implementer` with the GREEN contract. GREENs never run in parallel.
  Check its report: exit 0, tests diff empty.
- **Anything `dotnet` you run yourself** goes to a file, as § 3 says (`exit=`, `tail -15`): never a build or test output here.
- **COST** — its `Cost` note is the last line of `access-cost.py` (`Cost: n reads + n writes through ports outside
  loops; in a loop, a lambda or a memory filter: none`), or `stated by hand` when `ast-grep` is missing; it must hold
  against the sheet's access cost: counts as planned, nothing flagged. A flagged cost is a design defect: back to
  `/dev-plan`, never patched.
- **Tick** the step once all three are observed: one `Edit` turning its line into `TDD: RED [x] GREEN [x] COST [x]`.
  Never tick what was not observed. (In a `dev-batch` agent the sheet is read-only: the tick and its evidence go in
  the report, the orchestrator writes it.)
- Between cycles, one line: `→ Cycle n/N closed — <behaviour>`. No recap, no table already relayed: every reply is paid again.
- A report that misses something goes back to the **same** agent (`SendMessage`, fewer than three turns).
  Never relaunch an agent with the same instruction; never do its work in its place.
- **An agent is awaited, never polled**: no `ps`, no `sleep`, no wait script, no reading of its files
  while it runs; the `Agent` call returns with its report, and nothing else happens here until it does.
- **Mid-batch ambiguity**: a question that changes scope, an id or a design decision stops the batch; one
  that changes none is settled under the sheet's `## Assumptions`: `Hn — <what is assumed> — to be validated by <who>`.

## 3. Whole suites, once

Run `commands.build` and `commands.test` (and `commands.test_integration`, filtered as the sheet's `## Test policy
and scopes` says, when an adapter changed) — output to a file, never to the context:
`<cmd> > "${TMPDIR:-/tmp}/dev-<suite>.txt" 2>&1; echo "exit=$?"; tail -15 "${TMPDIR:-/tmp}/dev-<suite>.txt"`. Fix until
green, through the agents. The one build of the solution in the batch, with `--no-restore` (`contracts.md`, "Builds and
the restore": the one case of a second restore, and the two files the audit gate reuses — `--build-log`, `--test-log`).

## 4. Close

Read `references/closing.md` and follow it: the sheet closed, the audit through `/dev-verify`'s procedure, then the
summary, the commit and the push, then the pull request offered once (D71). It ends with the closing line
`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.` — printed once, for a `VALID` verdict only. Then stop: never start, delegate or suggest the next batch.
