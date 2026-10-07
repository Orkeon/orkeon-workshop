# {{TEAM_TITLE}} — Report {{ATTEMPT}}

<!-- The readable view of report.json, written by orkeon-bench run into attempts/ATT-nnnn/. Never edited by hand.
     Tone: factual, what fails first, no celebration. Every number comes from report.json; nothing is stated here that is not there. -->

- Date: {{DATE}}
- Orkeon: {{ORKEON_VERSION}} · bench: {{BENCH_VERSION}}
- Runs: {{RUN_IDS}}
- Asked for: {{REQUESTED_LEVEL}}

<!-- "Asked for: --level L2. The report of an attempt is that of its last run: this one replaces any earlier report of ATT-nnnn."
     When it replaces a report, one more bullet: "- Replaces: the report of <date>, which reached <level> (its evidence stays in runs/RUN-…)". -->

## What fails

<!-- First section, always. One line per failing AC, IND or INV: id — observed — evidence (run, scenario). "Nothing." when all pass.
     Then, when something was not run, the line "Not run, so not proven:" and one bullet per AC, IND or INV that is not_run, with the reason. -->

## Levels

<!-- Status: pass | fail | skipped. Execution stops at the first red level. -->

| Level | Status | Detail | Duration (s) |
|---|---|---|---|
| static | | | |
| unit | | | |
| component | | | |
| e2e_local | | | |
| e2e_remote | | | |

## Acceptance criteria

<!-- Status: pass | fail | not_run. A criterion required at a level that did not run is not_run, never pass. -->

| Id | Status | Level | Evidence |
|---|---|---|---|
| | | | |

## Indicators

| Id | Value | Threshold | Status |
|---|---|---|---|
| | | | |

## Invariants

| Id | Status | Violations |
|---|---|---|
| | | |

## Judges

| Id | Rubric version | Judge model | Score | Threshold |
|---|---|---|---|---|
| | | | | |

## Local and remote

<!-- Side by side per scenario, when both ran. -->

| Scenario | Local | Remote |
|---|---|---|
| | | |

## Cost

| Tokens in | Tokens out | Estimated USD | Wall time (s) | Tool calls | Retries | Human inputs |
|---|---|---|---|---|---|---|
| | | | | | | |

## Verdict input

<!-- The three booleans of report.json. The verdict itself belongs to /team-review. -->

| all_ac_pass | all_inv_pass | indicators_in_range |
|---|---|---|
| | | |
