---
name: dev-unit-tests
description: Writes or extends a unit test in the conventions of the repository - the test project mirroring the production one, its fixtures and hand-written doubles - observing a behaviour through its public surface. Also the guide dev-test-author reads for a unit level.
argument-hint: "<type or use case under test> [scenario] [id]"
disable-model-invocation: true
---

# /dev-unit-tests — a unit test, in the repository's conventions

Run on its own, or read by `dev-test-author` when a RED contract says `Level: unit`. A unit test runs
in memory: no network, no container, no shared state, no real clock bound. What it proves is a
behaviour, observed through the public surface of what is tested.

Arguments: $ARGUMENTS

## 1. Where the test goes

1. The conventions come from the repository: its test rules (`.claude/rules/*.md`, loaded when a test
   file is read — for Orkeon `orkeon-tests.md`), then the test class next to the one you write.
   Repository values: `.claude/harness/packs/repo-*/references/repo.yaml` — `layout.tests` (where the
   test projects live) and `commands.test`. A key that is absent is asked once, naming the key.
2. The test project **mirrors** the production project of the type under test; the folder and the
   namespace mirror its folder. Find the existing test class of that type or use case: **extend it**
   before creating one. A contract that names the paths (from `/dev-implement`) is followed as given —
   no search.
3. Doubles: reuse the hand-written double that already exists for the port (in the project's doubles
   folder, or the repository's shared test library), extended with the member you need. A new double
   is a plain class implementing the port, named and placed as the repository's rules say. No mocking
   library unless the repository already uses one.

## 2. What the test observes

- One behaviour, tied to its id when there is one. Name it as the class you extend names its tests;
  in a new class, as the repository's rules say (`ShouldX_WhenY` by default).
- Observe the outcome a caller sees: a returned value, a state exposed by the public API, an error
  raised, a fact recorded by a double of an outgoing port. A call recorded on a double proves a
  behaviour only when the behaviour *is* that call (a message sent, a write requested).
- Arrange data in a fixture or a builder when it is more than a value or two; a repeated scenario
  with different data is a theory fed by the fixture, not copies of a test.
- Never a test of a private member, a timing bound, or the test's own copy of the logic.

## 3. Red, then green

1. Run the narrowest form of `commands.test`: the one test project, filtered on the class. A filter
   that matches no test can be an error, not an empty success — check the exit code.
2. **Red first**, on its assertion: a compile error is not a red test. When the type or member does not
   exist yet, a signature stub (declaration, body that throws) makes the failure observable — listed,
   never more than that.
3. A test green on its first run proves nothing: the behaviour is already covered (delete yours, name
   the one that covers it) or the assertion is too weak (strengthen it until red).
4. Green only on exit `0`. Say which tests ran, and which were not run.

Run on its own, end with the test written, the command and its exit code, and the next step: the
production code goes through `/dev-implement` when a plan exists, otherwise it is yours to write.
