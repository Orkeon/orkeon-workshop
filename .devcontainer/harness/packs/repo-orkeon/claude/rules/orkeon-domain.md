---
paths:
  - "src/core/Orkeon.Domain/**"
---

# Orkeon.Domain — the inner layer

Read with the design ids of `/dev-plan` (`DDD-nn`): this rule says how Orkeon writes them. Facts below are
from Orkeon's `CLAUDE.md`, `CONTRIBUTING.md` and the project files; check a doubt there, not here.

## Dependencies

- The only runtime project reference is `Orkeon.Constants.Llm`, a zero-dependency satellite of
  constants (ADR-009); `Orkeon.Generators` is referenced as a compile-time source generator only
  (`OutputItemType="Analyzer"`, no assembly). Packages: logging and dependency-injection
  abstractions, `Ulid`. No HTTP, storage, JSON framework, Application or Infrastructure type
  (DDD-10). A new reference needs an ADR in `docs/adr/`.
- **No `System.IO`**: files go through `IFileSystemService` and virtual paths (`/workspace/...`,
  `/output/...`). The `Orkeon.Compliance.Vfs` analyzer fails the build otherwise. Only the VFS itself,
  `FileSystem/`, is exempt.
- `Orkeon.Domain.Task` shadows `System.Threading.Tasks.Task`: in a file that imports both namespaces,
  write `System.Threading.Tasks.Task` in full.

## Building blocks — `Orkeon.Domain.Common`

| Concept | Base | Note |
|---|---|---|
| Aggregate root | `AggregateRoot<TEntityId>` | an `Entity<TEntityId>` that is `IHasDomainEvents` |
| Entity | `Entity<TEntityId>` | |
| Identifier | a `TypedId` (`Ulid`-backed) | two ids of different types are never equal; never a raw `string` or `Ulid` |
| Value object | `ValueObjectRecord` | immutable record, validated on creation (DDD-04) |
| Repository port | `IRepository<TAggregate, TId>` | one per aggregate root (APP-03) |
| Error | a type deriving from `DomainException` (`Orkeon.Domain.Exceptions`) | named after the concept (`TaskException`) |

Culture-invariant formatting and parsing go through `Inv`. Before creating a type, look for the existing
one in the concept's folder: a second type with the shape of an existing one is a rename, not a copy.

## Rules

- State changes through a business method that checks its invariant (DDD-02, DDD-03): no public setter
  driven from Application.
- Aggregates reference each other by typed id, never by navigation (DDD-05).
- Logic lives on the object owning the data (DDD-09); a domain service only when no object owns it,
  stateless and with no IO.
- Absence is modelled (DDD-11): an empty `IReadOnlyList<T>` or immutable collection, a null object;
  `null` only for a genuinely optional scalar. Nullable reference types are enabled
  (`src/Directory.Build.props`), and a warning fails the CI build.
- A domain event is a past fact, a `sealed record` deriving from `DomainEvent`
  (`Orkeon.Domain.SharedKernel.Events`), named `<Concept><PastAction>Event` (`TaskCompletedEvent`), grouped
  in the concept's `Events/<Concept>Events.cs` (DDD-07).

## Layout and naming

One folder per concept (`Agent/`, `Crew/`, `Task/`, `Memory/`, …), with `ValueObjects/` and `Events/`
subfolders where the concept has them; the closest sibling decides where a new file goes. Interfaces
start with `I`; public members are PascalCase, private fields camelCase (`_logger`).

## The public surface

`Orkeon.Domain` carries `PublicAPI.Shipped.txt` and `PublicAPI.Unshipped.txt`. A new
public type or member is declared in `PublicAPI.Unshipped.txt` (`RS0016` is an error); editing or
removing a line of `PublicAPI.Shipped.txt` is a breaking change (major version, `*REMOVED*` entry,
CHANGELOG). Public APIs carry XML documentation. Prefer `internal` when nothing outside needs the type:
`InternalsVisibleTo` already opens it to Application, Infrastructure and their tests.

## Build and comments

CI builds with `-warnaserror`: zero warnings. Comments are English and carry no accented letter
(`scripts/check-comment-accents.py`): translate a quoted UI label, never strip its accents.
