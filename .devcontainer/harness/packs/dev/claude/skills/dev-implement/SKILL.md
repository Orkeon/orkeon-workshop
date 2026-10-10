---
name: dev-implement
description: Step 3 of the dev chain - implements one batch of a validated plan under strict TDD, behaviour by behaviour (dev-test-author writes the red tests, dev-implementer turns them green), then has dev-auditor verify it. One batch per session.
argument-hint: "F<n> [todo/<code>/<CODE>-PLAN.md] | F<n> — correction: <finding>"
disable-model-invocation: true
---

# /dev-implement — one batch, test first

Step 3 of the dev chain. You orchestrate and judge; two subagents write: `dev-test-author` the red
tests, `dev-implementer` the production code. Per behaviour: **RED → GREEN → REFACTOR → COST**, strictly
in that order. You never write a test or a production line yourself, except the declarative artefacts
the sheet lists. Nothing is committed: the commit is handed to the user at the end.

Arguments: $ARGUMENTS

## 1. Entry

1. **One batch per session.** A batch already closed in this session (`→ Batch F<n> complete` printed)
   and no `— correction:` in the argument → stop, read nothing, print `→ Batch F<n> already closed in this session. Run
   /clear, then /dev-implement F<m>.` The `dev-batch-guard` hook enforces it; an identical relaunch
   passes it, for a false positive only.
2. The plan: the path in the argument (as text — an `@` mention attaches it to every turn), else
   `ls todo/*/*-PLAN.md`, several → ask. No plan → stop and name `/dev-plan`.
3. In **one message**: the global plan **by section** (`grep -n "^## \|^### "`, then `## 0. Summary`,
   `### Batch F<n>` and `## 1. Scope`), the sheet `<CODE>-PLAN-F<n>.md` whole, and
   `references/contracts.md`. Commands and layout come from the `Commands` and `Layout` lines of
   `## 1. Scope`; absent there, from `.claude/harness/packs/repo-*/references/repo.yaml`; absent
   there too, ask once and write them on those lines.
4. Steps whose line reads `TDD: RED [x] GREEN [x] COST [x]` are done: resume at the first open one.
5. `— correction: <finding>` in the argument: a finding that changes scope, an id or a design decision
   → stop, route to `/dev-spec` or `/dev-plan`. Otherwise add under the step concerned
   `Correction Cn — <finding>` with its own `TDD: RED [ ] GREEN [ ] COST [ ]` line, keep the earlier
   evidence, and run the loop for it.

## 2. The loop, per behaviour

- **Group first.** Steps on the same use case and the same domain method are one cycle; a guard or a
  refusal is one more scenario of that cycle. Announce the mapping (steps 1-2 → behaviour A) before
  the first RED. Inside a cycle every scenario is red before any production code.
- **RED** — delegate to `dev-test-author` with the RED contract of `references/contracts.md`, paths
  copied from `## Anchors`, test names and ids from the step's table. Behaviours whose test files are
  disjoint may have their REDs in one message. Check its report: production diff empty or stubs only,
  the command's exit non-zero. Relay its table at once, adding the ids:
  `### RED — <behaviour> (exit N)` then `| Test | Ids | Case covered |`.
- **GREEN + REFACTOR** — delegate to `dev-implementer` with the GREEN contract. GREENs never run in
  parallel. Check its report: exit 0, tests diff empty.
- **COST** — its `Cost` note must hold against the sheet's access cost: no IO call inside a loop over
  the input, counts as planned. A flagged cost is a design defect: back to `/dev-plan`, never patched.
- **Tick** the step once all three are observed: one `Edit` turning its line into
  `TDD: RED [x] GREEN [x] COST [x]`. Never tick what was not observed.
- Between cycles, one line: `→ Cycle n/N closed — <behaviour>`. No recap of the batch, no table already
  relayed: every reply is paid again on every later turn.
- A report that misses something goes back to the **same** agent (`SendMessage`, fewer than three
  turns). Never relaunch an agent with the same instruction; never do its work in its place.
- **Mid-batch ambiguity**: a question that changes scope, an id or a design decision stops the batch.
  One that changes none is settled and written under the sheet's `## Assumptions`:
  `Hn — <what is assumed> — to be validated by <who>`.

## 3. Whole suites, once

Run `commands.build` and `commands.test` (and `commands.test_integration`, filtered as the sheet's
`## Test policy and scopes` says, when an adapter changed) — output to a file, never to the context:
`<cmd> > "${TMPDIR:-/tmp}/dev-<suite>.txt" 2>&1; echo "exit=$?"; tail -15 "${TMPDIR:-/tmp}/dev-<suite>.txt"`. Fix until
green, through the agents.

## 4. Close

Read `references/closing.md` and follow it: the sheet closed, the audit through `/dev-verify`'s procedure,
then the summary and the commit handed over. It ends with the closing line
`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.` — printed once,
for a `VALID` verdict only. Then stop: never start, delegate or suggest the next batch.
