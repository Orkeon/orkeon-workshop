---
paths:
  - "tests/*/**"
  - "library/datasets/**"
  - "library/examples/tests/*/**"
---

# Tests of a team

The tests exist before the team and decide whether it is accepted. They live in `tests/<slug>/`,
next to `teams/`, never in the team folder, which holds only what Orkeon Studio runs (D29). Levels,
what each proves and
when it runs: `references/process/workflow.md` and `references/testing/test-levels.md`. Standard
invariants and their checks: `references/testing/invariants-catalog.md`. Datasets:
`references/testing/synthetic-data.md`; judges: `references/testing/llm-judge.md`; local and remote
thresholds, repetitions and flakiness: `references/testing/local-vs-remote.md`.

## Every test cites an id

- A scenario lists the ids it proves in `covers` (`AC-xx`, `IND-xx`, `INV-xx`); a unit test names
  them in its title or a comment. No orphan test, no acceptance criterion without a test.
- Files are named after the criterion: `ac-01-<slug>.scenario.json`, `inv-resume-<slug>.scenario.json`.
- Thresholds are written once, in `workbooks/<slug>/ACCEPTANCE.md`. A test refers to the id, it does not
  restate the number.

## Where a test goes

| Folder of `tests/<slug>/` | Level | Content |
|---|---|---|
| `static/` | L0 | expectations of the static checks (tool catalogue, layout) |
| `unit/` | L1 | custom tools: vitest for TypeScript (not in the image yet, plan § 11.1); C# tools keep their tests in their project |
| `component/` | L2 | one task or agent in isolation, simulated LLM: `*.scenario.json` + reply scripts |
| `e2e/` | L3, L4 | the whole team on a dataset: `*.scenario.json` |
| `datasets/<name>/` | — | one subfolder per mount point of the team, `expected/`, `manifest.json`, `README.md` |
| `judges/` | — | versioned rubrics |
| `bench.config.json` | — | LLM profiles, repetitions, budget, retention |

## Scenarios are declarative

- A scenario is data (template `.claude/templates/scenario.json`): dataset, bindings of the virtual
  roots, checks, judges. No code, no shell.
- Deterministic oracles first: file present, schema valid, field equal, forbidden content absent, tool
  never called. A judge only where quality cannot be checked otherwise, with a rubric that fixes
  scale, criteria and an example of 1 and of 5.
- Local models are noisy: an end-to-end criterion is proven by `repeat` runs and `pass_at`, never by
  one run.

## Datasets

- `manifest.json` (template `dataset-manifest.json`): provenance, hash, size, cases covered, ids served.
- Nominal, edge (empty, oversized, encoding, duplicates, missing parts), language variants, and an
  **adversarial** set whenever the team reads untrusted input (`INV-INJECTION`).
- Synthetic by default. No real personal data, no secret; anonymised real data never enters
  `library/datasets/` without a `DEC-nnnn`.

## Cost and keys

- No remote LLM outside L4, and L4 only behind the budget gate. A test never names a model or a key:
  `bench.config.json` names profiles, and a profile names the **environment variable** holding the
  key (`keyEnv`), never the key.

## Frozen during the build

Once `/team-build` has started, `tests/<slug>/` does not change: a test that cannot pass is reported
`BLOCKED`, and a wrong test is corrected through `/team-decision`, then `/team-tests`.
