# references/design — designing a team

Established on Orkeon `main` at 80fdefe, the version the image builds. They build on the engine facts
of `references/orkeon/orkeon-reference.md` (§ 2 modes, § 3 agents, § 4 tasks, § 9 pitfalls), and every
sketch they show passes `--validate` and `check_crew.py`.

| Document | Abstract |
|---|---|
| `team-patterns.md` | The shapes a team takes: pipeline, fan-out then synthesis, write/review loop (`graph`), manager (`hierarchical`), consensus. For each: when to choose it, how many agents, what it costs, how it fails. |
| `prompting.md` | Writing `role`, `goal`, `backstory`, `description` and `expectedOutput` so that a local model follows them; spelling virtual paths in full; the anti-patterns that make an agent wander. |
| `tools-selection.md` | Deciding where the work goes: the LLM or a deterministic tool, a built-in tool or a custom one, pure TypeScript (no I/O, runs in Jint) or C#. With the questions that settle each choice. |
| `io-contracts.md` | Input and output contracts: virtual roots and access modes, bindings per environment (`mounts.json`), formats, JSON schemas of deliverables, `structured_output`, file naming. |
| `sizing-and-cost.md` | Sizing `maxIter` per agent, `llmOverride.maxTokens` per task, the agent and crew `llm` block and named profiles, what `maxRpm` and the host's `RateLimiting` do; estimating the cost and the duration of a task and of a run, locally and remotely. |
