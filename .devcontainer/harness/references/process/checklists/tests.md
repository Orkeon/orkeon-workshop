# Checklist — tests red: the tests exist before the team

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at c727c06 (2026-11-01, 1.0.0-rc.6).
> Sources: harness `.claude/rules/team-tests.md`, `.claude/agents/team-test-author.md`, `dataset-synthesizer.md`, `.claude/templates/scenario.json`,
> `dataset-manifest.json`; `references/process/workflow.md` § 4–5; `FROZEN-LITERALS.md` § 4–5; plan § 4.3, § 6.

Exit of `/team-tests`. Validated by **script**: `orkeon-bench check team <slug> --tests` checks the
traceability — every test cites an id `TEAM.md § Acceptance` declares, every active AC and every declared INV
has a test at its level; `orkeon-bench run --level L0` checks that every scenario
parses, has a check for the ids it covers and lies where a run picks it up, and `--level L2` shows the
component scenarios red once the team folder exists. Artefacts:
`tests/<slug>/**` (and `library/datasets/**` for a shared dataset). Boxes common to every gate: [`README.md`](README.md). The
scenario and dataset manifests are the formats of `.claude/templates/scenario.json` and
`dataset-manifest.json`, read by the bench.

## Before the gate

- [ ] `STATUS.md` says `gate_passed: team`.
- [ ] The contracts given to `team-test-author` and `dataset-synthesizer` named the paths, datasets and
  ids; each came back `## DONE` with `- Command: … — exit N`, or `## BLOCKED` and the gap was settled.

## Pass when

**Traceability**

- [ ] Every active AC has at least one test; every declared INV is covered at its level.
- [ ] Every test cites the id it covers — `covers` in a scenario, the title or a comment in a unit
  test — and every cited id exists in `TEAM.md § Acceptance`: no orphan test.
- [ ] Files are named after the criterion (`ac-01-<slug>.scenario.json`, `inv-resume-<slug>.scenario.json`)
  and sit in the folder of their level: `static/` L0, `unit/` L1, `component/` L2, `e2e/` L3 and L4.

**Scenarios and judges**

- [ ] Scenarios are data (template `scenario.json`): `covers`, `level`, `dataset`, the `bindings` of
  every mount point, `checks`, `judges` — no code, no shell.
- [ ] Deterministic checks first (file exists, schema valid, field equal, forbidden text absent, tool
  never called); a judge only where `TEAM.md § Acceptance › Judges` plans one. A "tool never called" check reads the
  events, which show built-in tools only: a custom tool's calls emit no `tool.called`
  (`references/typescript/clean-architecture-ddd.md` § 2).
- [ ] No threshold, model or key in a test: thresholds are cited by id, profiles are named in
  `bench.config.json`, keys by their variable name.
- [ ] Component scenarios carry the reply scripts of the simulated LLM.
- [ ] Each rubric (`tests/<slug>/judges/<name>.md`) has a version, a scale, its criteria and an example
  of 1 and of 5 (`references/testing/llm-judge.md`).

**Datasets**

- [ ] `tests/<slug>/datasets/<name>/` holds one subfolder per mount point, named after it, `expected/`
  for the written roots, a `manifest.json` (template `dataset-manifest.json`) and a `README.md`.
- [ ] The cases of `TEAM.md § Acceptance › Datasets` are there: nominal, edge, language variants, and the adversarial set
  whenever `INV-INJECTION` is declared (`references/testing/synthetic-data.md`).
- [ ] No real personal data, no secret, no real credential; anonymised real data enters
  `library/datasets/` only with a `DEC-nnnn`.

**Unit tests of the planned custom tools**

- [ ] vitest files under `tests/<slug>/unit/`, importing the domain modules the plan's Anchors name
  (`teams/<slug>/crew/tools/<name>/domain.ts`) — never `tool.ts`, which needs `toolBuilder`, absent
  under Node (`references/typescript/clean-architecture-ddd.md`).

**All red, observed**

- [ ] `npx vitest run tests/<slug>/unit` exits non-zero because the modules do not exist yet.
- [ ] The scenarios of L2 and above are red by construction: neither the crew nor `teams/<slug>/` exists
  before the first batch (D35) — `orkeon-bench run <slug> --level L2` then refuses to start (`nothing to
  run`, exit 2); from the first batch on, and at once for an adopted prototype, it runs every component
  scenario on the simulated LLM and reports each one. A team without any component scenario is red at
  L2 (exit 1), not skipped: the level asked for ran nothing. For an adopted
  prototype (D34) the crew exists: the tests that already pass are listed in the journal line.
- [ ] Nothing is written outside `tests/<slug>/` and `library/datasets/` (`guard-phase` keeps Edit and
  Write inside `tests/<slug>/` among the team's trees; elsewhere only the charters hold them, and a
  write through Bash shows in `git status` when the workshop is a git repository).

## Evidence to look at

Active criteria without a test, then cited ids unknown to `TEAM.md` — both print nothing:

```bash
grep -E '^\| *AC-[0-9]{2,} .*\| *active *\| *$' workbooks/<slug>/TEAM.md | grep -oE 'AC-[0-9]{2,}' | sort -u |
  while read -r id; do grep -rqF "$id" tests/<slug>/ || echo "no test covers $id"; done
find tests/<slug> -name '*.scenario.json' -exec jq -r '.covers[]' {} + | sort -u |
  while read -r id; do grep -qE "^\| *$id *\|" workbooks/<slug>/TEAM.md || echo "unknown id $id"; done
```

Then: the `## DONE` reports of the two subagents (command and exit code), one manifest per dataset
(`find tests/<slug>/datasets -maxdepth 2 -name manifest.json`), the rubrics.

## Usual reasons to refuse

- A test that is green before the team exists: it proves nothing (a check on a file the dataset
  already holds, an assertion on the test's own copy of the logic).
- An AC without a test, a test without an id, a scenario covering an id that does not exist.
- A threshold restated in a scenario; a model or a key named in a test.
- A judge where a deterministic check would do; a rubric without its examples of 1 and of 5.
- A dataset without manifest or `expected/`, no adversarial cases for untrusted inputs, real personal data.
- A unit test importing `tool.ts` or the crew.
- A `BLOCKED` answered by an invented path instead of a corrected contract.

## Once passed

`STATUS.md`: `phase: tests`, `gate_passed: tests`, `next_action: /team-build B1`; journal
`- YYYY-MM-DD HH:MM — /team-tests — tests red (<n> tests, all red)`. `tests/<slug>/` may still change
during the build while `gate_passed` is `team` or `tests`; once the last batch is built
(`gate_passed: build`) and from `run` on, `guard-phase` freezes it (D89): a wrong test goes through
`/team-decision`, then `/team-tests`.
