# Mail triage — Plan

## Batches

| Batch | Scope | AC/INV covered | Tests that must pass | Expected cost | Status |
|---|---|---|---|---|---|
| L1 | the registry tool, the team folder and the crew skeleton | AC-03, INV-TOOLS, INV-INCR | `static/ac-03-mail-tools.txt`, `unit/registry-update.test.js` | 15 minutes, no model | todo |
| B2 | the three agents, their tasks and the deliverables | AC-01, INV-FS, INV-SECRETS, INV-BUDGET, INV-INJECTION, INV-01 | every scenario of `component/` and `e2e/` | 40 minutes of local model | todo |

### L1

#### Intent

The team folder exists with its mount points and a crew that loads; `registry_update` adds keys to a
registry and its unit tests pass.

#### Design decisions

The registry is a sorted list of file names (DESIGN.md, resume strategy); the tool is pure TypeScript.

#### Steps

1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write `mounts.json` and the crew skeleton, then scaffold the team
2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write the domain of `registry_update` and its tool wrapper

#### Anchors

| Step | Files to create or edit | Tests that observe it |
|---|---|---|
| 1 | `teams/mail-triage/mounts.json`, `teams/mail-triage/crew/crew.ork.ts` | `static/ac-03-mail-tools.txt` |
| 2 | `teams/mail-triage/crew/tools/registry-update/domain.ts`, `teams/mail-triage/crew/tools/registry-update/tool.ts` | `unit/registry-update.test.js` |

#### Assumptions

None.

### B2

#### Intent

A run on a mailbox writes the classification file and the drafts, and records each mail in the registry.

#### Design decisions

None.

#### Steps

1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — declare the three agents with their tools and `maxIter`
2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — declare the three tasks, their dependencies and the two deliverables

#### Anchors

| Step | Files to create or edit | Tests that observe it |
|---|---|---|
| 1 | `teams/mail-triage/crew/crew.ork.ts` | `component/ac-02-empty-mailbox.scenario.json` |
| 2 | `teams/mail-triage/crew/crew.ork.ts`, `library/schemas/mail-classification.schema.json` | `component/inv-incr-second-run.scenario.json`, `e2e/ac-01-nominal.scenario.json`, `e2e/inv-injection-adversarial.scenario.json` |

#### Assumptions

| Id | Assumption | To be validated by |
|---|---|---|
| H1 | The local model holds five parsed mails in its context | the first local run (L3) |

## Order and dependencies

B2 needs B1: the agents use the registry tool, and the team folder is created by B1. Both touch
`crew.ork.ts`: they are built one after the other.
