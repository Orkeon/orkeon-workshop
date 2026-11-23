# References

Reference documents for designing, building and testing an Orkeon agent team. Deployed by the image
to the workshop's `references/` and kept up to date there; your own documents go in `references/local/`,
which the image never touches.

Every document states the Orkeon version it was established on. When a document and the installed
binary disagree, the binary wins: `orkeon --version`, `orkeon run --list-tools`, `./run.sh --validate`.

Status: **present** = shipped in this folder (every document planned is). The Orkeon column is the
version each document was established on: the released one (D110). The image installs Orkeon 1.3.0:
`orkeon/orkeon-reference.md` and `orkeon/cli.md` were checked on it, the others hold on it, nothing they
state having changed since 1.2.0 (V-63, V-65, V-66).

| Folder | Document | Content | Status | Orkeon |
|---|---|---|---|---|
| `orkeon/` | `orkeon-reference.md` | modes, agents, tasks, tool catalogue, VFS, LLM, pitfalls | present | 1.2.0 |
| | `yaml-schema.md` | the exact YAML keys the loader accepts, what `--validate` checks and lets through | present | 1.2.0 |
| | `typescript-dsl.md` | the `.ork.ts` builders, the declarative shape, `toolBuilder`, common errors | present | 1.2.0 |
| | `studio-layout.md` | the team folder Studio recognises, the card `team.json`, the launchers, the virtual roots and the ones the runner reserves | present | 1.2.0 |
| | `cli.md` | every `orkeon` command and option (`--resume`, `--input`, `--llm-mock`, `orkeon mcp serve`…), exit codes, `--events jsonl` and its event protocol, `--llm-log`, settings resolution order | present | 1.2.0 |
| | `llm-profiles.md` | providers, profiles, `ORKEON_Llm__*`, local models (size, context, speed, `thinking`), remote costs, firewall domains | present | 1.2.0 |
| | `decision-profiles.md` | the ready-made decision profiles (`guarded`, `guarded-small`, `triage`, `strict`), when a team applies one, its settings file, what a run shows | present | 1.2.0 |
| | `csharp-tools.md` · `csharp-crews.md` | writing and loading a C# tool; writing and running a C# crew | present | 1.2.0 |
| | `resume-and-memory.md` | what Orkeon offers natively (crew memory and its providers, session tools, the agent-loop breaker, the `graph:` bounds, a task's `retry:`, one checkpoint per task and `orkeon run --resume`, the run history) and what it does not (no deduplication of the units inside a task, no watermark) | present | 1.2.0 |
| `design/` | `team-patterns.md` | pipeline, fan-out and synthesis, write/review loop, manager, consensus: when, how many agents, cost | present | 1.2.0 |
| | `prompting.md` | writing `role` / `goal` / `backstory` / `description` / `expectedOutput`; virtual paths; anti-patterns | present | 1.2.0 |
| | `tools-selection.md` | LLM or deterministic tool? built-in or custom? pure TypeScript or C#? | present | 1.2.0 |
| | `io-contracts.md` | virtual roots and access modes, bindings per environment, formats, JSON schemas of deliverables, file naming | present | 1.2.0 |
| | `sizing-and-cost.md` | `maxIter` per agent, `llmOverride.maxTokens` per task, the agent and crew `llm` block and named profiles, what `maxRpm` and the host's `RateLimiting` do, cost and duration estimates per task | present | 1.2.0 |
| `reliability/` | `resume-patterns.md` | resuming after an error or a stop: state registry, idempotent tasks, units of work, done markers | present | 1.2.0 |
| | `incremental-patterns.md` | incremental processing: deduplication key, watermark, Orkeon memory vs file registry, purge | present | 1.2.0 |
| | `error-handling.md` | failure per mode, retries, the `graph:` bounds, `human_input` escalation, controlled degradation | present | 1.2.0 |
| | `security.md` | keys, allowed recipients, SSRF, untrusted inputs and prompt injection, secrets in outputs | present | 1.2.0 |
| `testing/` | `invariants-catalog.md` | the standard invariants and indicators, how each is checked | present | 1.2.0 |
| | `test-levels.md` | the five levels, what each proves, when it runs | present | 1.2.0 |
| | `synthetic-data.md` | producing synthetic datasets, variants, edge cases, adversarial sets, manifests | present | 1.2.0 |
| | `acceptance-criteria.md` | writing AC (Given/When/Then on a dataset), IND (measure, threshold), INV (always true) | present | 1.2.0 |
| | `llm-judge.md` | rubrics, calibration on reference outputs, biases, logging | present | 1.2.0 |
| | `local-vs-remote.md` | comparability, differentiated thresholds, repetitions and `pass@k`, flakiness | present | 1.2.0 |
| `csharp/` | `orkeon-guidelines.md` | dated extract of the conventions of the Orkeon repository | present | 1.2.0 |
| `typescript/` | `clean-architecture-ddd.md` | layers, dependency rules, where each thing goes | present | 1.2.0 |
| `process/` | `workflow.md` | the loop, the steps, the gates, the artefacts, who writes where | present | 1.2.0 |
| | `artefacts.md` · `checklists/` · `context-discipline.md` | formats in detail; the checklist of each gate; reading and delegation discipline | present | 1.2.0 |
| | `hand-over.md` | a command handed to the user: when, where it is typed, one line per step, what must not reach the model (D47) | present | 1.2.0 |

Who reads what: the generator skill (`orkeon-crew --format yaml|ts`) reads
`orkeon/orkeon-reference.md`, `orkeon/studio-layout.md` and their format's schema (`yaml-schema.md` or
`typescript-dsl.md`) before any design; the rules of `.claude/rules/` cite these documents instead of
repeating them; the harness entry point (`.claude/harness/HARNESS.md`) points at `process/workflow.md`.
