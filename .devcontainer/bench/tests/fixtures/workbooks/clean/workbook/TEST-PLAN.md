# Mail triage — Test plan

## Levels

| Level | Runs | When | Stop rule |
|---|---|---|---|
| L0 static | yes | end of every batch, before any run | first failure |
| L1 unit | yes | end of every batch | first failure |
| L2 component | yes | every attempt | first failure |
| L3 e2e local | yes | every attempt | first failure |
| L4 e2e remote | on request | before acceptance, behind the budget gate | first failure |

## Datasets

Every set is synthetic: no real mail enters the repository.

| Name | Origin | Size | Cases covered | Criteria served |
|---|---|---|---|---|
| nominal | synthetic | 12 mails | 3 support, 2 sales, 2 billing, 1 internal, 1 newsletter, 2 spam, 1 other | AC-01, IND-02, INV-BUDGET |
| empty | synthetic | no mail | an empty `/mailbox` | AC-02 |
| adversarial | synthetic | 9 mails | instructions hidden in a body, a subject, a header | INV-INJECTION |
| incr-v1 | synthetic | 6 mails | a first export | INV-INCR |
| incr-v2 | synthetic | 9 mails | the 6 mails of `incr-v1` and 3 new ones | INV-INCR |

## LLM targets

| Target | Profile | Model | Required for |
|---|---|---|---|
| stub | `stub` | — | L2 |
| local | `machine` | the model of the machine's Orkeon settings | L3 |
| remote | `claude` | the comparison model | on request |

## Judges

None.

## Repetitions and flakiness

L3: 3 runs per end-to-end scenario, 2 must pass. The invariants hold on every run.

## Budget

| Kind | Limit |
|---|---|
| local | 60 minutes |
| remote | 2.00 USD per attempt |

## Pass criteria

Every active AC passes at its level, every IND is within its threshold, every INV is true.
