# Checklist — the run: budget gate and a report fit for review

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: harness `references/process/workflow.md` § 4–5, § 7, § 11; `FROZEN-LITERALS.md` § 3; `.claude/hooks/run-gate.sh`;
> `.claude/harness/README.md` (the guards); `.claude/templates/bench.config.json`, `REPORT.md`, `report.schema.json`; `HARNESS.md` (rules of engagement); plan § 4.3, § 6.4.

Exit of `/team-run`. Two things are checked: the **budget gate** before any remote target (validated by
**the user**, enforced by `run-gate`), then a **report the review can use** (written by the bench).
`orkeon-bench run <slug> --level <L0|L2>` runs the static checks and the component scenarios on the
simulated LLM, in an open attempt (`orkeon-bench attempt open <slug>`); L1, L3, L4 and any profile but
`stub` are planned (lot 4, lot 9 for the remote level; it exits `3` for them today). A run made by hand is
exploration — it writes no report, archives nothing in `runs/` and passes no gate. Boxes common to every gate: [`README.md`](README.md).

## Before the run

- [ ] `STATUS.md` says `gate_passed: build` (or, after an `ITERATE`, the corrections are batch green);
  an attempt is open.
- [ ] `tests/<slug>/bench.config.json` is the one validated at gate 2, and `teams/<slug>/mounts.json`
  matches the `## Mounts` of `DESIGN.md` validated at gate 3 — or the change has its `DEC-nnnn`.

## Budget gate — before any remote target

- [ ] Every target of the run is classified: `orkeon-bench profile <slug> <name> --json` gives `remote`
  and `remote_reason` (`local-host`, `remote-host`, `unreadable-base-url`, `no-base-url`,
  `not-configured`). `stub` is never remote; `machine` is remote as soon as what Orkeon will read —
  variables, the team's own settings files, the user's — points at a remote host, or holds an `Llm`
  section without a base URL (`FROZEN-LITERALS.md` § 3, "the remote rule").
- [ ] An estimate exists — expected tokens × price, in USD, with how it was computed
  (`orkeon-bench estimate` is planned, lot 9).
- [ ] The estimate fits under `budget.remote_usd_max`, the cap per attempt — what the attempt already
  spent counts against it.
- [ ] The user approved that estimate and that cap explicitly, by typing `/team-approve remote <usd>`.
  The approval sits in the open attempt — `remote-approval.json` or `remote_approval` in its manifest,
  `{by, at, estimated_usd, cap_usd}`, `by` non-empty, `estimated_usd <= cap_usd`: the hook
  `team-approve` has `orkeon-bench attempt approve` write it from the line the user typed (D19, D36) —
  never Claude, on its own initiative or from the shell.
- [ ] `run-gate` let the run through: `.claude/run-log.tsv` shows `allow` with the kind `remote`.

## A report fit for review

- [ ] Levels ran in order and stopped at the first red one; L2 on the `stub` profile; L3 on
  `levels.e2e_local.profile` with `repeat` runs and `pass_at`; L4 only behind the gate above.
- [ ] `REPORT.md` and `report.json` are in the open attempt, written by the bench, untouched by hand.
  They are the report of the **last** run of the attempt: `REPORT.md` says what was asked for
  (`Asked for: --level …`), what it replaces and, under `Not run, so not proven:`, what the run did not
  reach; a run to a lower level than the one before replaces its report — run again to the level the
  review needs.
- [ ] `orkeon-bench report validate workbooks/<slug>/attempts/ATT-nnnn/report.json` exits 0 (schema 1.0,
  and `verdict_input` agrees with the content).
- [ ] An AC attached to a level that did not run is `not_run`, never `pass`; so is an AC that
  `ACCEPTANCE.md` does not declare, or declares at a level the bench cannot read; `## What fails` opens
  `REPORT.md`. Today the bench proves no invariant and measures no indicator: each one declared or
  covered is `not_run` (an invariant is `fail` when a scenario that covers it failed), so
  `all_inv_pass` and `indicators_in_range` are false as soon as one exists — observe them by hand
  (`references/testing/invariants-catalog.md`) until their checks ship.
- [ ] Every run is archived under `workbooks/<slug>/runs/RUN-<yyyymmdd>-<hhmm>-<target>/`
  (`events.jsonl`, `stderr.log`, `stub-exchanges.jsonl` on the simulated LLM, `output-snapshot/`, `manifest.json`) and listed in the attempt's `runs`;
  none of the runs the report cites has `status: interrupted` in its manifest (a run that was stopped
  proves nothing, and leaves no report).
- [ ] Judgements, when the plan has judges, come from the `judge` subagent and carry the rubric
  version; they reach the report through `orkeon-bench evaluate --judgements` (planned, lot 4).
- [ ] Cost and duration are under the local minutes and the remote cap (`INV-BUDGET`).

## Evidence to look at

| Evidence | How |
|---|---|
| target | `orkeon-bench profile <slug> <name> --json` |
| approval | `jq .remote_approval workbooks/<slug>/attempts/ATT-nnnn/manifest.json`, or `remote-approval.json` |
| gate decisions | the last lines of `.claude/run-log.tsv` (`decision`, `kind`, `team`, `command`; credentials `<redacted>`) |
| report | `orkeon-bench report validate …/report.json`, then `## What fails` of `REPORT.md` |
| runs | `jq .runs …/manifest.json` against the folders under `runs/` |
| anomalies | the summary of `run-analyst`, which greps `events.jsonl` by event kind and never reads it whole |

## Usual reasons to refuse

- A remote target with no estimate, no cap or no explicit yes; an approval written without the user.
- The `machine` profile assumed local while a layer Orkeon reads — a variable, the team's own settings
  files, the user's — points elsewhere.
- A report missing, invalid, or edited by hand; an AC `pass` at a level that did not run.
- A level skipped outside the stop rule; one local run where `repeat` asks for several.
- Runs copied into `runs/` by hand, or a run outside the bench presented as evidence.
- Cost over the cap: stop, report, and let the user decide.

## Once passed

`STATUS.md`: `phase: run`, `next_action: /team-review`. Journal lines, for instance
`- YYYY-MM-DD HH:MM — /team-run — budget approved (0.80 USD, cap 2.00 USD)` and
`- YYYY-MM-DD HH:MM — /team-run — report ATT-0002 (first red level: e2e_local)`.
