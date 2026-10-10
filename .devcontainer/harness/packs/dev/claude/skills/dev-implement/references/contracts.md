# Delegation contracts — RED and GREEN

Read by `/dev-implement` at entry. The plan is read once, in the main thread; the agents receive these
contracts and never re-read the plan or the sheet. Every path is **copied** from the sheet's `## Anchors`
row, every test name and id from the step's table under `## TDD sequence`. A missing row is a plan hole:
one `ls` to confirm the path, one `Edit` adding the row to the sheet, then delegate — never a search
through the test tree from here.

Each `Agent` call carries a `description`. The agents' charters pin their model.

## RED — `dev-test-author`

```text
Ids: BR-nn / UC-nn
Behaviour: <one sentence, observable>
Level: unit | integration — read .claude/skills/dev-unit-tests/SKILL.md | dev-integration-tests/SKILL.md
Test class / fixture: `<Class>` / `<Fixture>` — existing | to create
Methods: `<ShouldX_WhenY>` — one per scenario, in the order of the Scenarios line, each with its id
Rewritten by you (read in full): <test file, fixture — exact paths>
Read bounded (context only): <production type under test, shared doubles and builders — exact paths>
Scenarios: <one line each>
Expected observation: <what the assertion reads: a returned value, a state, an error, a recorded call>
Test command: <commands.test narrowed to the test project and class>
Forbidden: any file search. A missing path comes back as ## BLOCKED.
```

- **Names are given, not chosen**: the agent writes method bodies, never renames, merges or splits.
- The two path lines are distinct on purpose: `read in full` is a file the agent rewrites,
  `read bounded` one it only consults. Keep both literals verbatim.
- Its report: a table `| Test | Case covered |` and `## DONE` whose `Notes` carry the production diff
  (empty, or the signature stubs it listed) and the expected failure. A test method in the diff but not
  in the table → back to the agent. Stubs it lists go under `Already stubbed` of the GREEN contract.

## GREEN — `dev-implementer`

```text
Ids: BR-nn / UC-nn
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
  `Tests diff: empty`, `Cost: <n reads, n writes> — independent of <input>`, what the refactor deleted,
  and what it reports without fixing (`path:line`).

## Two outcomes that are never kept

- **A test green on its first run**: either the behaviour is already covered (the agent deletes its
  test and says which one covers it) or the assertion is too weak (it strengthens it until red).
- **Production code ahead of a red test**: deleted, never kept "for reference".
