---
paths:
  - "src/core/Orkeon.Application/**"
  - "src/core/Orkeon.Infrastructure/**"
---

# Orkeon.Application and Orkeon.Infrastructure — ports and adapters

Read with the design ids of `/dev-plan` (`APP-nn`, `PERF-01`). Facts below are from Orkeon's `CLAUDE.md`,
`CONTRIBUTING.md` and the project files.

## Who holds what

| Application (middle) | Infrastructure (outer) |
|---|---|
| use cases, orchestration, application rules | adapters: LLM providers, memory stores, file system, HTTP clients, persistence |
| ports — the interfaces it calls (`Interfaces/`, services) | implementations of those ports |
| DTOs, commands, contracts | orchestration strategies (`Crew/Strategies/`, `Consensus/`), external integrations |
| no database access, no external API call, no framework-specific code | framework-specific code, database contexts and repositories |

Moving code outward: the interface stays in Application, the implementation goes to Infrastructure, the
DTO stays in Application, the external dependency lives in Infrastructure only (APP-02, APP-04).

## Dependencies

- Application references `Orkeon.Domain`, `Orkeon.Analysis.Abstractions` (ADR-003),
  `Orkeon.Rag.Abstractions` (ADR-006) and `Orkeon.Constants.Protocol`. Infrastructure's couplings to
  `Orkeon.Tools.Abstractions` and `Orkeon.Analysis` are ADR-002 and ADR-003. A new cross-layer reference
  needs an ADR in `docs/adr/`.
- **No `System.IO`**: inject `IFileSystemService`, work in virtual paths. The `Orkeon.Compliance.Vfs`
  analyzer fails the build otherwise. Exceptions: the VFS implementation (`FileSystem/`), bootstrap
  code that provisions mounts before DI (an inline `// EXCEPTION-BOOTSTRAP`), system probing (an inline
  `// OUT-OF-SCOPE`) — `docs/architecture/vfs-compliance.md`.
- `Orkeon.Domain.Task` collides with `System.Threading.Tasks.Task`: in a file that imports both, every
  `Task` is written `System.Threading.Tasks.Task`.

## DTOs (Application)

`sealed record` with `{ get; init; }`; `required` for required fields (never `[Required]`); collections
`ImmutableList<T>`, `ImmutableDictionary<K,V>`; suffixes `*Dto` (read and transfer), `*Request` (input a
port takes), `*Command` (a CQRS command), `*Response` (through `ApiResponse<T>`);
`[JsonPropertyName("snake_case")]` on API-exposed DTOs; business validation through
`ICommandValidator<T>`, no data annotations; enums in `*Enums.cs` of the DTO folder; one DTO per concept.

## Adapters (Infrastructure)

- Simple HTTP-based implementations, direct service calls, `async`/`await`, dependency injection for
  every external service, and an adapter that can be tested (a port it implements, a double for it).
- An LLM provider extends `HttpLlmProviderBase` (or `OpenAICompatibleProviderBase`) and declares its
  `LlmProviderCapabilities`. An option declared on a provider that cannot honour it produces a structured
  warning — never a silent drop.
- An adapter translates the dependency's failures into the errors the port promises (APP-03); a bound
  lives with its owner (APP-05); IO calls stay bounded, never one per input element (PERF-01).
- Every adapter change carries an integration test, or a written waiver in the sheet (the
  `orkeon-tests` rule says how).

## The public surface, build and comments

Both projects carry `PublicAPI.*.txt`: a new public type or member goes into `PublicAPI.Unshipped.txt`
(`RS0016` is an error); editing `PublicAPI.Shipped.txt` is a breaking change. Public APIs carry XML
documentation. CI builds with `-warnaserror`. Comments are English with no accented letter
(`scripts/check-comment-accents.py`).
