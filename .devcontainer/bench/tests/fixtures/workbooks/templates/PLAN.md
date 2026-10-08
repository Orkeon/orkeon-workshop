# {{TEAM_TITLE}} — Plan

<!-- Written by /team-design after DESIGN.md. Batches in order; one sheet per batch.
     Batches are B1, B2, … (L is reserved for the test levels L0–L4).
     Typical split: B1 deterministic tools · B2 agents and tasks skeleton · B3 deliverables and schemas · B4 resume and incremental · B5 hardening.
     A proof tick is set only on an observed result (command and exit code): TESTS ✅ · BUILD ✅ · L0/L1 ✅. -->

## Batches

<!-- Status: todo | in progress | done (ATT-nnnn). -->

| Batch | Scope | AC/INV covered | Tests that must pass | Expected cost | Status |
|---|---|---|---|---|---|
| B1 | | | | | todo |

### B1

<!-- The sheet of the batch, sections in this fixed order. The implementer receives it as its contract. -->

#### Intent

<!-- What exists at the end of the batch that did not exist before, in two lines. -->

#### Design decisions

<!-- The decisions of DESIGN.md this batch applies, and the ones it settles itself. -->

#### Steps

<!-- One line per step, each with its proof ticks. Untick = not observed yet. -->

1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ —

#### Anchors

<!-- Every file the implementer creates or edits, and the tests that observe it. A missing path is a gap of the plan, not a search to run. -->

| Step | Files to create or edit | Tests that observe it |
|---|---|---|
| 1 | | |

#### Assumptions

| Id | Assumption | To be validated by |
|---|---|---|
| H1 | | |

<!-- A fix coming from FIX-PLAN.md is appended under the sheet, with its own ticks, without erasing earlier proofs:

#### Correction C1 — F-1

1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ —
-->

## Order and dependencies

<!-- Which batch needs which; which ones touch disjoint files and may be built in parallel (merge and checks stay serial). -->
