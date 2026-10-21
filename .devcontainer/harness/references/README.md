# References

Reference documents for designing, building and testing an Orkeon agent team. Deployed by the image
to the workshop's `references/` and kept up to date there; your own documents go in `references/local/`,
which the image never touches.

Every document states the Orkeon version it was established on. When a document and the installed
binary disagree, the binary wins: `orkeon --version`, `orkeon run --list-tools`, `./run.sh --validate`.

Status: **present** = shipped in this folder (every document planned is). The Orkeon column is the
version each document was established on: the one the image builds (D32).

| Folder | Document | Content | Status | Orkeon |
|---|---|---|---|---|
| `orkeon/` | `orkeon-reference.md` | modes, agents, tasks, tool catalogue, VFS, LLM, pitfalls | present | `main` acd59d6 |
| | `yaml-schema.md` | the exact YAML keys the loader accepts, what `--validate` checks and lets through | present | `main` acd59d6 |
| | `typescript-dsl.md` | the `.ork.ts` builders, the declarative shape, `toolBuilder`, common errors | present | `main` acd59d6 |
| | `studio-layout.md` | the team folder Studio recognises, the card, the launchers, the virtual roots | present | `main` acd59d6 |
| | `cli.md` | every `orkeon` command and option, exit codes, `--events jsonl` and its event protocol, `--llm-log`, settings resolution order | present | `main` acd59d6 |
| | `llm-profiles.md` | providers, profiles, `ORKEON_Llm__*`, local models (size, context, speed, `thinking`), remote costs, firewall domains | present | `main` acd59d6 |
| | `csharp-tools.md` · `csharp-crews.md` | writing and loading a C# tool; writing and running a C# crew | present | `main` acd59d6 |
| | `resume-and-memory.md` | what Orkeon offers natively (crew memory and its providers, session tools, the agent-loop breaker, `graphConfig`, retries) and what it does not (no `--resume`, no deduplication, no watermark) | present | `main` acd59d6 |
| `design/` | `team-patterns.md` | pipeline, fan-out and synthesis, write/review loop, manager, consensus: when, how many agents, cost | present | `main` acd59d6 |
| | `prompting.md` | writing `role` / `goal` / `backstory` / `description` / `expectedOutput`; virtual paths; anti-patterns | present | `main` acd59d6 |
| | `tools-selection.md` | LLM or deterministic tool? built-in or custom? pure TypeScript or C#? | present | `main` acd59d6 |
| | `io-contracts.md` | virtual roots and access modes, bindings per environment, formats, JSON schemas of deliverables, file naming | present | `main` acd59d6 |
| | `sizing-and-cost.md` | `maxIter` per agent, `llmOverride.maxTokens` per task, the agent and crew `llm` block and named profiles, what `maxRpm` and the host's `RateLimiting` do, cost and duration estimates per task | present | `main` acd59d6 |
| `reliability/` | `resume-patterns.md` | resuming after an error or a stop: state registry, idempotent tasks, units of work, done markers | present | `main` acd59d6 |
| | `incremental-patterns.md` | incremental processing: deduplication key, watermark, Orkeon memory vs file registry, purge | present | `main` acd59d6 |
| | `error-handling.md` | failure per mode, retries, `graphConfig`, `human_input` escalation, controlled degradation | present | `main` acd59d6 |
| | `security.md` | keys, allowed recipients, SSRF, untrusted inputs and prompt injection, secrets in outputs | present | `main` acd59d6 |
| `testing/` | `invariants-catalog.md` | the standard invariants and indicators, how each is checked | present | `main` acd59d6 |
| | `test-levels.md` | the five levels, what each proves, when it runs | present | `main` acd59d6 |
| | `synthetic-data.md` | producing synthetic datasets, variants, edge cases, adversarial sets, manifests | present | `main` acd59d6 |
| | `acceptance-criteria.md` | writing AC (Given/When/Then on a dataset), IND (measure, threshold), INV (always true) | present | `main` acd59d6 |
| | `llm-judge.md` | rubrics, calibration on reference outputs, biases, logging | present | `main` acd59d6 |
| | `local-vs-remote.md` | comparability, differentiated thresholds, repetitions and `pass@k`, flakiness | present | `main` acd59d6 |
| `csharp/` | `orkeon-guidelines.md` | dated extract of the conventions of the Orkeon repository | present | `main` acd59d6 |
| `typescript/` | `clean-architecture-ddd.md` | layers, dependency rules, where each thing goes | present | `main` acd59d6 |
| `process/` | `workflow.md` | the loop, the steps, the gates, the artefacts, who writes where | present | `main` acd59d6 |
| | `artefacts.md` · `checklists/` · `context-discipline.md` | formats in detail; the checklist of each gate; reading and delegation discipline | present | `main` acd59d6 |
| | `hand-over.md` | a command handed to the user: when, where it is typed, one line per step, what must not reach the model (D47) | present | `main` acd59d6 |

Who reads what: the generator skills (`orkeon-crew-yaml`, `orkeon-crew-typescript`) read
`orkeon/orkeon-reference.md`, `orkeon/studio-layout.md` and their format's schema (`yaml-schema.md` or
`typescript-dsl.md`) before any design; the rules of `.claude/rules/` cite these documents instead of
repeating them; the harness entry point (`.claude/harness/HARNESS.md`) points at `process/workflow.md`.
