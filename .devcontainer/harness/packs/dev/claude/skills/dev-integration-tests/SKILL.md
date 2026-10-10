---
name: dev-integration-tests
description: Writes or extends an integration test of an adapter (storage, network, process) against the real dependency - a container, a local server - in the integration category of the repository, kept out of the fast suite. Also the guide dev-test-author reads for an integration level.
argument-hint: "<adapter or operation under test> [scenario] [id]"
disable-model-invocation: true
---

# /dev-integration-tests — an adapter against the real thing

Run on its own, or read by `dev-test-author` when a RED contract says `Level: integration`. A unit test
on a double proves nothing about a query, a mapping, a protocol or a constraint of the real dependency:
that is what this test is for. A business rule stays in a unit test.

Arguments: $ARGUMENTS

## 1. Where and how it runs

1. Conventions: the repository's test rules (`.claude/rules/*.md`, loaded when a test file is read —
   for Orkeon `orkeon-tests.md`), then the integration tests next to the one you write. Repository
   values: `.claude/harness/packs/repo-*/references/repo.yaml` — `layout.tests` and
   `commands.test_integration`. A key that is absent is asked once, naming the key.
2. The test lives in the test project that mirrors the adapter's project, in its integration folder when
   it has one; **extend** the existing test class of that adapter before creating one.
3. **Category**: the test carries the repository's integration marker (for Orkeon
   `[Trait("Category", "Integration")]`), so the fast suite leaves it out and the integration command
   selects it. A test that takes minutes carries the slow marker instead, when the repository has one.
4. **The real dependency**: a container through the library the repository already uses
   (Testcontainers for .NET in Orkeon), a local server on a loopback port the repository's helpers
   give, a temporary folder. Never a shared database, never an in-memory stand-in of the dependency
   under test. Container start-up is bounded; when the dependency cannot start (no Docker), the test is
   **skipped with its reason** the way the sibling tests do it — never green, never failed.

## 2. What it proves

- Arrange, act, assert on the dependency: seed its state directly (never through the adapter under
  test), call the adapter, then read the state back — through a fresh connection or a re-read when the
  adapter could cache.
- Cover what only the real thing shows: the round trip of every mapped field, a filter or a page pushed
  to the dependency, a constraint and the domain error the adapter translates it into, an error of the
  dependency surfaced as the adapter's own.
- Each test independent: its own container, schema, database or folder, released after the test.

## 3. Run

1. Docker present? `docker info >/dev/null 2>&1; echo $?`. Absent: the test is written, reported as
   **not run** with that reason — never claimed red or green.
2. The narrowest form of `commands.test_integration`: the one project, filtered on the class. Never the
   whole integration suite to prove one test.
3. Red first on the assertion; green only on exit `0`; a skip is reported as a skip.

Run on its own, end with the test written, the command, its exit code, and whether it ran or skipped.
