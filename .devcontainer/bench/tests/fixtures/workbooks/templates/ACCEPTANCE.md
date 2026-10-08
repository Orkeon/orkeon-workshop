# {{TEAM_TITLE}} — Acceptance

<!-- Written by /team-test-plan from NEED.md, validated by the user (gate 2) before any design.
     Ids are never renumbered. A criterion that is abandoned stays in its table with Status "dropped (DEC-nnnn)":
     orkeon-bench run leaves such a row out of the report and of the verdict input, and warns about a scenario that still covers it.
     Thresholds live here and nowhere else: tests, reports and analyses cite the id. -->

## Acceptance criteria

<!-- One observable behaviour per row: Given a dataset / When the team runs / Then …
     Level: the LOWEST level that can prove it — L0 static · L1 unit · L2 component · L3 e2e local · L4 e2e remote.
     A criterion required "remote" is never proven by a local run. Status: active | dropped (DEC-nnnn). -->

| Id | Given (dataset) | When | Then | Level | Status |
|---|---|---|---|---|---|
| AC-01 | | the team runs | | L3 | active |

## Indicators

<!-- Always measured, thresholds per team. Direction: ">=" (higher is better) or "<=" (lower is better).
     A local threshold may differ from the remote one: then one row per level. -->

| Id | Measure | Unit | Threshold | Direction | Level |
|---|---|---|---|---|---|
| IND-01 | acceptance criteria passing | % | 100 | >= | L3 |

## Invariants

<!-- True on every run. Take them from references/testing/invariants-catalog.md, with the same id: the four below apply to
     every team, the others (INV-INJECTION, INV-RESUME, INV-INCR, INV-IDEMP, INV-SCHEMA, INV-EMAIL) when the need calls for them.
     Add the team's own as INV-01, INV-02 … Check: the bench check, script or rule that verifies it. -->

| Id | Statement | Check | Level |
|---|---|---|---|
| INV-FS | The team writes only under its rw / rwnd roots | events + snapshot of the roots | L2 |
| INV-SECRETS | No secret or key in the outputs, the logs or the deliverables | pattern scan | L2 |
| INV-TOOLS | Only the declared tools are called | events vs the definition | L2 |
| INV-BUDGET | Tokens and duration stay under the cap | the run manifest | L3 |
