---
paths:
  - ".devcontainer/bench/**"
  - "bench/**"
---

# orkeon-bench — Clean Architecture and DDD

`orkeon-bench` is the CLI the skills and hooks call for everything that is logic: verdicts, events,
cost, archiving, the simulated LLM. The dependency rules are enforced, not advised:
`.dependency-cruiser.cjs` (`npm run test:arch`) and `tests/arch/dependency-direction.test.ts`.
Change a rule there and here in the same edit.

## Layers

```
src/domain          entities, value objects, the rules that make a verdict — pure
src/application     use cases, orchestrating the domain through ports
src/infrastructure  adapters: Orkeon CLI, events.jsonl, settings, file system, stub LLM, price table
src/interface       the CLI: arguments -> use case -> JSON or text
```

Dependencies point inwards only: `domain` ← `application` ← `infrastructure` | `interface`.

- `domain` imports nothing from the other layers, no `node:` builtin, and no package but `zod`.
- `application` imports `domain` only, no `node:` builtin, no package but `zod` and `yaml`. It reaches
  the outside world through **ports** (`src/application/ports/`): file system, process runner,
  clock, environment, settings.
- `infrastructure` implements the ports; it never imports `interface`.
- `interface` wires everything and holds **no logic**: parse arguments, call one use case, print.
  A condition on domain data in a command is a use case that has not been written yet.
- No circular dependency.

## Domain

- The concepts of the process are types: Team, Attempt, Run, Dataset, Criterion, Indicator,
  Invariant, Verdict, Report. Invariants of the domain are enforced at construction (an id never
  changes, a closed attempt is immutable).
- A shape the bench reads or writes (`STATUS.md` front matter, `mounts.json`, `bench.config.json`,
  `report.json`, the id patterns) is a **frozen literal**: `harness/FROZEN-LITERALS.md` lists who
  emits and who parses it. Changing one means changing the template, the hook and the eval in the
  same edit.
- No clock, no environment, no path of the machine in the domain: they arrive as arguments.

## Tests

- vitest. Domain and application with hand-written doubles (`tests/fakes/`), never a mocking library.
- Adapters on fixtures (`tests/fixtures/`): real `events.jsonl`, a team folder, reports.
- One end-to-end test of the CLI per command. Coverage of `domain` and `application` stays at or
  above 80 %.
- A secret never reaches an output: a variable carrying a key is listed in `secretNames` and printed
  redacted.

## Output

Every command has `--json`; the JSON is the contract the skills read, the text is for people.
Exit codes come from `src/interface/exit-codes.ts`. Messages in English.
