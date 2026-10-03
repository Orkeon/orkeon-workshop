# library/tools/ts — pure TypeScript tools

**Purpose.** Deterministic tools written for a team's `.ork.ts` crew and worth reusing: scoring,
normalisation, parsing, a business rule. They run inside Orkeon's JavaScript engine (Jint): pure
computation, **no I/O and no Node API**.

**Shape.** One folder per tool:

```
<name>/
├── domain.ts      pure functions — the logic, testable without Orkeon
├── tool.ts        the toolBuilder<TIn, TOut>() adapter: name, description, schema, mapping, access
├── *.test.ts      vitest tests of the domain (run under Node, using no Node API)
└── README.md      what it computes, input and output, origin team and attempt
```

A team imports a tool by relative path from its `crew/tools/index.ts` (the bundler inlines relative
imports) and exposes it through its strict `pickTools(...)`. The import leaves `crew/`: the team folder
is then no longer self-contained, and a copy of it alone no longer builds (plan § 11.1, an open
question). Conventions: `.claude/rules/orkeon-ts.md`.

**Promotion rule.** A tool is promoted when the team that wrote it is `ACCEPTED` and its unit tests
are green. It comes with its tests and its README, keeps its snake_case tool name, and takes no
dependency. A change of behaviour is a new tool or a new version with its own tests — the teams
already accepted keep working.
