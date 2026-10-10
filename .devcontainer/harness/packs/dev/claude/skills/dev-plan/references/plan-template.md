# Plan template and self-check

Two levels in `todo/<code>/`: the **global plan** `<CODE>-PLAN.md` (what, why, order — under two minutes
of reading) and one **batch sheet** `<CODE>-PLAN-F<n>.md` per batch (what and how, for that batch alone).
A fact belongs to exactly one of them: element lists, decisions, test names, applied ids and paths live in
the sheet only. `/dev-implement` and `/dev-verify` parse the headings and lines below: keep them verbatim.

## Global plan

```markdown
# <CODE>-PLAN — <Feature>

> From `todo/<code>/SPEC-<code>.md`. Sheets: `<CODE>-PLAN-F1.md`, `<CODE>-PLAN-F2.md`…

## 0. Summary

| Batch | Intent | Ids | Depends on | Execution | Reason |
|-------|--------|-----|------------|-----------|--------|
| F1 | <one sentence> | BR-01, BR-03 / UC-01 | — | sequential | foundation |
| F2 | <one sentence> | BR-04 / UC-02 | F1 | sequential | <concrete reason> |

### Batch F1 — <Name> — open
- [ ] 1. <business behaviour>
- [ ] 2. Build and tests — scope: <suites, filters>

## 1. Scope

- **Spec**: `todo/<code>/SPEC-<code>.md`
- **Layers**: <the production projects touched>
- **Reuse**: <existing elements from the inventory, `path:line`>
- **Out of scope**: <what is not done here, and where it is decided>
- **Assumptions**: <settled with the user, dated> / <to validate, and why they do not block>
- **Commands**: build `<cmd>` · test `<cmd>` · test_integration `<cmd>` — from `repo.yaml`, or asked
- **Layout**: <production and test roots> — from `repo.yaml`, or asked
- **Non-applicable rules**: DDD-07: N/A — <reason>; APP-03: N/A — <reason>; …

## 2. Traceability

| Id | Code owner(s) | Batch |
|----|---------------|-------|
| BR-01 — <statement> | `<Type>.<Method>()` + `<Error>` | F1 |

## 3. Design

| Ids | Owning aggregate | Invariant and what it removes | Consistency | Batch |
|-----|------------------|-------------------------------|-------------|-------|
```

## Batch sheet

```markdown
# <CODE>-PLAN-F1 — <Batch name>

> Batch F1 of `<CODE>-PLAN.md`. Spec: `todo/<code>/SPEC-<code>.md`.

## Intent
<one sentence>. **Ids**: BR-01, BR-03 / UC-01

## Design
| Point | Decision |
|-------|----------|
| Applied rules | DDD-01, DDD-02, DDD-03, APP-01, PERF-01 |
| Owning aggregate | `<Aggregate>`; the use case only orchestrates |
| Invariants | BR-nn; removes <the branch, loop or read it makes useless> |
| Consistency | one command changes and saves `<Aggregate>` |
| Events | `<PastFact>`, payload <fields> / N/A — <reason> |
| Access cost | <n reads + n writes, independent of the input> |

## Decisions
<non-obvious choices and reuses, dated; deleted when empty>

## TDD sequence
Every test below is written and red before any production line of its step. Order inside a step:
success first (it fixes the signatures), refusals next, integration last.
Declarative artefacts written without a prior red test: <list, or none> — covered by the test of the
behaviour they serve (pure declarations: a DTO, a registration, a configuration entry; never a branch).

### Step 1 — <exact title of the global plan step>
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `<ShouldX_WhenY>` | unit | `<test project>` | BR-01 |
| 2 | `<ShouldRefuseX_WhenY>` | unit | `<test project>` | BR-03 |
| 3 | `<ShouldPersistX_WhenY>` | integration | `<test project>` | BR-01 |

<at most two lines: what merges into one cycle; which test needs Docker>

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 2 — Build and tests
No new test: the scopes of `## Test policy and scopes`.

## Test policy and scopes
**Fast suite**: <command and scope>. **Integration**: <filter, or none and why>. **Not run**: <suite — reason>.

## Code elements
Signatures and pseudo-code bullets per element (Domain, then Application, then adapters). Declaration
only: name, parameters, return type, the rule it enforces. Never a body.

## Anchors
`/dev-implement` copies these paths into its delegations and searches for nothing. One row per step (a
step whose tests land in two files splits into `1 — <title> (integration)`). Column 3 lists the shared
doubles and builders to extend, with the member to add; column 4 is the only production files the
implementer may touch. A path that cannot be copied is a plan hole.

| Step | Test class / fixture | Shared doubles and builders | Production filled or created |
|------|----------------------|-----------------------------|------------------------------|
| 1 — <title> | `<test path>` — to create; `<fixture>` — existing | `<double path>` (`<member>` to add) | `<production path>` — `<member>` |
| 2 — Build and tests | — | — | — |

## Assumptions
| # | Assumption | To be validated by |
|---|------------|--------------------|
```

The `## Assumptions` table is empty when the plan is written; `/dev-implement` fills it (`Hn`).

## Rules for steps

- A step is an end-to-end business behaviour, not a layer, not a file. A guard, refusal or uniqueness
  check on a method another step already holds is one more row of that step's table, not a step.
- Two to five behaviour steps per batch, plus the last step, `Build and tests`, which names its scope
  (whole suites, filters, suites not run and why). Over eight: split the batch.
- Every step names at least one test, `ShouldX_WhenY` unless the repository's test rules say
  otherwise, with its ids and target project. A behaviour that cannot be named is a mechanism
  ("scan", "map", "convert"): name the behaviour it serves.
- An element in the adapter layer (storage, network, process) carries an integration test, or a written
  waiver with its reason (a registration, an adapter of an already-doubled service).
- `TDD: RED [ ] GREEN [ ] COST [ ]` under every behaviour step; none under `Build and tests`.

## Self-check

- Every `DDD-`, `APP-`, `PERF-` id is on one sheet's `Applied rules` row or on `Non-applicable rules`
  with a reason that holds.
- Every `BR-nn` and `UC-nn` of the spec has a code owner and at least one named test.
- The global plan holds no element table, test name, decision, applied id or path.
- Every step has its `### Step N` table and its `## Anchors` row; existing paths come from the
  inventory, never guessed; no row spans two steps.
- Sheet sections in the fixed order; `## Assumptions` present and empty.
- Nothing planned for flexibility the spec does not express; no new element where an existing one
  covers 80 % of the need — each "new" says why the existing one falls short.
- Every batch is `sequential` or `parallelisable with` one named batch, with the reason.
