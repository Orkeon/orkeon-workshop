---
paths:
  - "tests/*/**"
  - "library/datasets/**"
  - "library/examples/tests/*/**"
---

# Tests of a team

The tests exist before the team and decide whether it is accepted. They live in `tests/<slug>/`,
next to `teams/`, never in the team folder, which holds only what Orkeon Studio runs (D29). Levels,
what each proves and when it runs: `references/testing/test-levels.md`. Standard invariants and
their checks: `references/testing/invariants-catalog.md`. Datasets:
`references/testing/synthetic-data.md`; judges: `references/testing/llm-judge.md`; local and remote
thresholds, repetitions and flakiness: `references/testing/local-vs-remote.md`.

## Every test cites an id

- A scenario lists the ids it proves in `covers` (`AC-xx`, `IND-xx`, `INV-xx`); a unit test names
  them in its title or a comment. No orphan test, no acceptance criterion without a test.
- A scenario that covers ids declares at least one check: an id is proven by a check, never by the
  run alone (`orkeon-bench run` refuses the scenario at L0).
- A scenario lies directly in `component/` or `e2e/`, as `<name>.scenario.json` in lower case: one in
  a sub-folder or beside the two folders is picked up by no run, and fails the static checks.
- Files are named after the criterion: `ac-01-<slug>.scenario.json`, `inv-resume-<slug>.scenario.json`.
- Thresholds are written once, in `workbooks/<slug>/TEAM.md` `§ Acceptance`. A test refers to the id,
  it does not restate the number.

## Where a test goes

| Folder of `tests/<slug>/` | Level | Content |
|---|---|---|
| `static/` | L0 | expectations of the static checks (tool catalogue, layout) |
| `unit/` | L1 | custom tools: vitest for TypeScript (`npx vitest run`, in the image from the v2 build); C# tools keep their tests in their project |
| `component/` | L2 | one task or agent in isolation, simulated LLM: `*.scenario.json` + reply scripts |
| `e2e/` | L3, L4 | the whole team on a dataset: `*.scenario.json` |
| `datasets/<name>/` | — | one subfolder per mount point of the team, `expected/`, `manifest.json`, `README.md` |
| `judges/` | — | versioned rubrics |
| `bench.config.json` | — | LLM profiles (with their `price` for L4), repetitions, budget, retention |

## Scenarios are declarative

- A scenario is data (template `.claude/templates/scenario.json`): a `dataset` **or** a `sequence`,
  bindings of the virtual roots, checks, `indicators`, `judges`. No code, no shell.
- `sequence[]` (`{dataset, kill_after_task?, keep_state: true}`) runs several steps on one kept
  state point (`/registry` in the pilot team): it is how `INV-RESUME`, `INV-INCR` and `INV-IDEMP` are proven. An invariant without a
  scenario stays `not_run` in the report.
- `indicators[]` (`{id, measure}`) names the indicators the bench measures on the scenario:
  `duration_seconds`, `tokens_total`, `usd`, `tool_calls`, `human_inputs`, `pass_rate`,
  `decision_defaulted_rate` (a share, 0 to 1), `decision_confidence_min` or `judge:J-nn`. A judge out of
  range blocks the verdict like a red indicator (D97).
- Deterministic oracles first: file present, schema valid, field equal, forbidden content absent, tool
  never called. A judge only where quality cannot be checked otherwise, with a rubric that fixes
  scale, criteria and an example of 1 and of 5. The bench runs no judge: `/team-run` grades with the
  `judge` agent and hands `judgements.json` to `orkeon-bench evaluate --judgements`.
- Local models are noisy: an end-to-end criterion is proven by `repeat` runs and `pass_at`, never by
  one run.

## Datasets

- `manifest.json` (template `dataset-manifest.json`): provenance, hash, size, cases covered, ids served.
- Nominal, edge (empty, oversized, encoding, duplicates, missing parts), language variants, and an
  **adversarial** set whenever the team reads untrusted input (`INV-INJECTION`).
- Synthetic by default. No real personal data, no secret; anonymised real data never enters
  `library/datasets/` without a `DEC-nnnn`.
- Plain files and folders only: a symbolic link in a dataset fails the set-up of every scenario that
  uses it (`references/testing/synthetic-data.md` § 1).

## Cost and keys

- No remote LLM outside L4, and L4 only behind the budget gate: `orkeon-bench estimate`, then the
  user's `/team-approve remote <usd> <slug>`. A test never names a model or a key:
  `bench.config.json` names profiles, and a profile names the **environment variable** holding the
  key (`keyEnv`), never the key.

## Frozen once the team is built

`tests/<slug>/` is written in phase `tests` and may still change during a build while
`gate_passed` is `team` or `tests` (an `ITERATE` reopens it). Once the last batch is built
(`gate_passed: build`) and in the phases `run`, `review`, `accepted` and `published`, it does not
change: a test that cannot pass is reported `BLOCKED`, and a wrong test or threshold is corrected
through `/team-decision`, then `/team-tests` (D89).
