# {{TEAM_TITLE}} — Test plan

<!-- Written by /team-test-plan together with ACCEPTANCE.md, validated by the user (gate 2).
     It says how we will know the team is right; the values it sets feed tests/<slug>/bench.config.json. -->

## Levels

<!-- Which levels run, in which order, and the stop rule (default: stop at the first red level).
     L0 static · L1 unit · L2 component (simulated LLM) · L3 end-to-end local · L4 end-to-end remote. -->

| Level | Runs | When | Stop rule |
|---|---|---|---|
| L0 static | yes | end of every batch, before any run | first failure |
| L1 unit | yes | end of every batch | first failure |
| L2 component | yes | every attempt | first failure |
| L3 e2e local | yes | every attempt | first failure |
| L4 e2e remote | on request | before acceptance, behind the budget gate | first failure |

## Datasets

<!-- Origin: synthetic | provided | anonymized. One dataset folder holds one subfolder per virtual root.
     Say explicitly what cannot be tested here (a root bound to a share that is not mounted in the container). -->

| Name | Origin | Size | Cases covered | Criteria served |
|---|---|---|---|---|
| nominal | synthetic | | | AC-01 |
| adversarial | synthetic | | instructions hidden in an input | INV-INJECTION |

## LLM targets

<!-- "LLM" is the model the TESTED TEAM calls, never the model of the harness.
     stub: simulated LLM (free). local: the machine profile (Ollama on this machine; `orkeon-bench profile <team> machine`
     says whether it is remote). remote: a named profile — which one, and when it is required. -->

| Target | Profile | Model | Required for |
|---|---|---|---|
| stub | `stub` | — | L2 |
| local | `machine` | | L3 |
| remote | | | L4, on request |

## Judges

<!-- Only where quality cannot be checked by a deterministic oracle. Rubrics live in tests/<slug>/judges/, versioned, calibrated once on reference outputs. -->

| Id | Rubric | Scale | Threshold | Applies to |
|---|---|---|---|---|
| J-01 | | 1–5 | | |

## Repetitions and flakiness

<!-- A local model is noisy: n runs per end-to-end scenario and the pass@k that counts as a pass. -->

## Budget

<!-- Local: minutes. Remote: cap in USD per attempt (default 2.00). A remote run needs an estimate and the user's explicit approval. -->

| Kind | Limit |
|---|---|
| local | 60 minutes |
| remote | 2.00 USD per attempt |

## Pass criteria

<!-- What makes the whole plan pass: every AC at its required level, every IND within its threshold, every INV true. -->
