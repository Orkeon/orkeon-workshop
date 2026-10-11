# Delegation contracts — RED and GREEN

Read by `/dev-implement` at entry. The plan is read once, in the main thread; the agents receive these
contracts and never re-read the plan or the sheet. Every path is **copied** from the sheet's `## Anchors`
row, every test name and id from the step's table under `## TDD sequence`. A missing row is a plan hole:
one `ls` to confirm the path, one `Edit` adding the row to the sheet, then delegate — never a search
through the test tree from here.

Each `Agent` call carries a `description`. The agents' charters pin their model.

## RED — `dev-test-author`

```text
Ids: BR-nn / UC-nn / CH-nn
Kind: feature | bug | refactor | perf — from the global plan's `## 1. Scope` (Spec, or Change)
Behaviour: <one sentence, observable>
Level: unit | integration | pinned — read .claude/skills/dev-unit-tests/SKILL.md | dev-integration-tests/SKILL.md
Test class / fixture: `<Class>` / `<Fixture>` — existing | to create
Methods: `<ShouldX_WhenY>` — one per scenario, in the order of the Scenarios line, each with its id
Rule trait: [Trait("<tests.rule_trait>", "<id>")] on each method, for the ids of its scenario — from repo.yaml; drop the line when the pack has no tests.rule_trait
Rewritten by you (read in full): <test file, fixture — exact paths>
Read bounded (context only): <production type under test, shared doubles and builders — exact paths>
Scenarios: <one line each>
Expected observation: <what the assertion reads: a returned value, a state, an error, a recorded call>
Test command: <commands.test narrowed to the test project and class>
Forbidden: any file search. A missing path comes back as ## BLOCKED.
```

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
  `read bounded` one it only consults. Keep both literals verbatim.
- Its report: a table `| Test | Case covered |` and `## DONE` whose `Notes` carry the production diff
  (empty, or the signature stubs it listed) and the expected failure. A test method in the diff but not
  in the table → back to the agent. Stubs it lists go under `Already stubbed` of the GREEN contract.

## GREEN — `dev-implementer`

```text
Ids: BR-nn / UC-nn / CH-nn
Kind: feature | bug | refactor | perf
Behaviour: <one sentence>
Red tests: <exact path + method names>
Out of scope — next behaviour: <guard or branch not to write: it would turn the RED of <X> green>
Already stubbed at RED (body to fill, read in full): <exact paths>
To create from scratch: <exact paths>
Signature ripple — also touched (read in full): <exact path — what changes there, one clause each>
Read bounded (context only): <exact paths>
Elements: <exact names and public signatures from the sheet — declaration only, never a body>
Applied rules: <DDD-/APP-/PERF- ids of the sheet>
Invariants — what they remove: <the branch, loop or read each one makes useless>
Expected access cost: <n reads + n writes through ports, independent of <input>>
Test command: <the same narrowed command as RED>
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

## Two outcomes that are never kept

- **A test green on its first run**: either the behaviour is already covered (the agent deletes its
  test and says which one covers it) or the assertion is too weak (it strengthens it until red).
- **Production code ahead of a red test**: deleted, never kept "for reference".
