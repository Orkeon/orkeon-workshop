---
paths:
  - "teams/*/crew/**/*.ts"
  - "library/tools/ts/**"
  - "library/examples/teams/*/crew/**/*.ts"
---

# Orkeon crew and custom tools in TypeScript

Source of truth: `references/orkeon/typescript-dsl.md` (builders, runtime, common errors),
`references/orkeon/orkeon-reference.md` (modes, tool catalogue, pitfalls § 9). Orkeon `main` at
77ac8a9. Custom tools, layered: `references/typescript/clean-architecture-ddd.md`. Designing the team and
holding it up: the `design/`, `reliability/` and `orkeon/llm-profiles.md` references the YAML rule names.

## The crew file

- One entry point, `crew/crew.ork.ts` — the only file carrying the `.ork.ts` suffix. Helper modules
  are `*.ts` files under `crew/tools/`, imported with a relative path and an explicit `.ts` extension.
- **Declarative shape**: the last line is `globalThis.crew = crew;`. Never `crew.run()`, `.body()`,
  `.withState()`, `.onError()`, `.budget()`, `.onCrew*()`, `.onAgent*()`: ignored or fatal under
  `--validate` and Studio.
- Builders are global (`agentBuilder`, `taskBuilder`, `crewBuilder`, `toolBuilder`): no import for
  them, no `/// <reference orkeon-script=…>` directive (`tsc` rejects it).
- `.llm(cfg)` is applied to every call of the agent and takes an `LlmConfig` only:
  `llm.default_.with({ temperature: 0.2 })` to tune the run's own model; never a string, an object
  literal or a vendor factory (`llm.openai(…)` is gone). No `llm.model(…)`, `llm.profile(…)` or
  `.withProfile(…)` without a decision (`DEC-…`): a profile must be defined in the team's settings file
  (`Llm:Profiles:<id>`) — and in Studio's settings for a team Studio launches without that file —, and a
  remote one makes every run of the team remote for
  the run gate (`typescript-dsl.md`; `check_team.py`). `.allowDelegation(false)` written explicitly;
  `.maxIterations(n)` sized to the agent; `.maxRpm(n)`, on an agent or the crew, only when the design asks
  for one (the request of too many waits; 0 or less fails the load).
- Built-in tools by catalogue name in `.tools([...])`; custom tools as instances in
  `.withAutonomousTools(pickTools(...))`. Never the coworker tools.
- A task's `.tools([...])` adds built-in tools to its agent for that task only; `.withTaskTool` is gone
  from the DSL.
- `.withContext(t)` for **every** task whose result is read; a task is declared after the ones it
  references. `.deliverable({ path, source, format })` with `source` always given;
  `hierarchical` requires `.manager(agent)`.
- Guardrails, `graphConfig`, `memoryProvider` do not exist in the DSL: a team that needs them is a YAML
  team.

## The runtime is Jint, not Node

No `fs`, `fetch`, `process`, `require`, `setTimeout`, `Buffer`, **no `console`**, no DOM. A tool does
computation only; every file or network access goes through the agents' built-in tools.

## Custom tools (plan § 9.2)

```
crew/tools/<name>/domain.ts   pure functions: parsing, scoring, business rule — no Orkeon, no Node API
crew/tools/<name>/tool.ts     the toolBuilder adapter: name, description, schema, mapping to the domain, access
crew/tools/index.ts           pickTools(...names): throws on an unknown name
```

- `toolBuilder<TIn, TOut>()` always carries its two generics; `name` in snake_case, unique, different
  from every built-in tool; `description` says when the model should call it.
- `execute` is deterministic and free of I/O. If it needs a file, the agent reads it and passes the
  content; if it needs more than that, it is a C# tool.
- The domain is unit-tested with vitest under Node **without using a Node API**: the same code runs
  in Jint. The tests live in `tests/<slug>/unit/` (D29), or beside the tool once promoted. vitest is
  not in the image yet (only Stryker's vitest runner is, plan § 11.1): a unit test that cannot be run
  is reported, never skipped silently.
- A tool proven by an accepted team is promoted to `library/tools/ts/<name>/` (domain + adapter +
  tests + README) and imported from there by the next teams, by relative path. esbuild follows that
  import out of `crew/`, so the team folder is no longer self-contained: a copy of it alone no longer
  builds (plan § 11.1, an open question).

## Before saying it is done

`python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py <team>`, `tsc -p <team>`, then
`./run.sh --validate` from the team folder.
