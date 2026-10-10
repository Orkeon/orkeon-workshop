---
paths:
  - "tests/**/Orkeon.*.Tests/**"
  - "tests/shared/**"
---

# Orkeon tests

Facts below are from Orkeon's `CLAUDE.md`, `CONTRIBUTING.md`, `global.json` and its test projects.

## Where a test goes

- The test tree mirrors the source tree: `src/<zone>/Orkeon.X` is tested by
  `tests/<zone>/Orkeon.X.Tests` (`src/core/Orkeon.Domain` → `tests/core/Orkeon.Domain.Tests`), and the
  namespace mirrors the folder (`Orkeon.Application.Tests.Agent` for `Orkeon.Application.Agent`).
- Extend the test class of the type before creating one. A new class is named `<Type>Tests`, in a file
  of the same name.
- Domain types are tested directly in `Orkeon.Domain.Tests` when the behaviour is theirs; a use case in
  `Orkeon.Application.Tests`; an adapter or a strategy in `Orkeon.Infrastructure.Tests`.

## Framework

- **xUnit v3 on Microsoft.Testing.Platform** (opted in by `global.json`). Native xUnit assertions only:
  no FluentAssertions, Shouldly or Verify.
- **No mocking library** (no Moq, NSubstitute, FakeItEasy), by design. A double is a plain class
  implementing the production interface, prefixed `Mock`, `Fake` or `Stub` and named after the interface
  (`MockTaskRepository : ITaskRepository`), in the `Doubles/` (or `Fakes/`) folder of the test project
  that uses it, exposing plain fields and properties to configure answers and inspect calls. Reference:
  `tests/core/Orkeon.Infrastructure.Tests/Doubles/MockTaskRepository.cs`.
- Reuse before writing: `tests/shared/Orkeon.Tests.Shared` holds shared doubles (`Doubles/`), file system
  fakes (`FileSystem/` — `FakeFileSystemService`, `DiskBackedFileSystemService`), test constants and
  helpers. A double grows the member it lacks; no parallel copy in another project.
- Names: follow the class you extend. A new class follows `CONTRIBUTING.md`: `ShouldX_WhenY`, with
  Arrange, Act, Assert.

## Categories

- A test that needs Docker, a network service or minutes of runtime carries
  `[Trait("Category", "Integration")]` or `[Trait("Category", "Slow")]` (on the class when every test of
  it does). CI's fast suite runs `--filter "Category!=Integration&Category!=Slow"`; the nightly
  `integration.yml` runs the two categories.
- Integration tests use Testcontainers. Container start-up is bounded (a cancellation token of a few
  minutes), and a test whose container could not start is skipped with its reason
  (`Assert.SkipWhen(!started, reason)`), as `tests/tools/Orkeon.Tools.Data.Tests/Integration/` does.

## Tests hold under load

Several passes run at once on one machine: a test server takes its port through `LoopbackPorts` and
listens on `LoopbackPorts.Host`; an `HttpListener` is never `Close()`d after `Stop()`; a span test reads
an `ActivityRecorder` filtered on its own trace or tag; a delay a test must not reach is a hang guard
(`Polling.DefaultTimeout`), and no unit test bounds a duration — a timestamp is checked between two
readings of the clock. Tests may use the real disk through `DiskBackedFileSystemService`; the VFS
analyzer exempts tests.

## Running

- Build first, then `dotnet test <project>.csproj --no-build`; narrow with
  `--filter "FullyQualifiedName~<ClassName>"` on the one project that holds the test.
- A `--filter` that matches **no** test in a module exits `8` — an error, not an empty success: never
  narrow a solution-wide run by excluding a project. VSTest-only flags (`--collect`, `--logger`,
  `--blame`) are rejected.
- Integration locally (Docker required):
  `dotnet test Orkeon.sln --no-build --filter "Category=Integration|Category=Slow" -- --ignore-exit-code 8`.

Comments are English with no accented letter (`scripts/check-comment-accents.py`).
