# references/typescript — TypeScript in the harness

Reference document (lot 1). Two kinds of TypeScript live in the harness and follow the same split:
the `orkeon-bench` CLI (rule `.claude/rules/bench-ts.md`) and the custom tools of a team
(rule `.claude/rules/orkeon-ts.md`).

| Document | Abstract |
|---|---|
| `clean-architecture-ddd.md` | The layers (domain, application, infrastructure, interface) and the direction of dependencies; what goes where, with examples from `orkeon-bench`; how the same split applies to a team's custom tool (`domain.ts` pure and testable under Node, `tool.ts` the `toolBuilder` adapter) and why the domain of a tool must not use any Node API. |
