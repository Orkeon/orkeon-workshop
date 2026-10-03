# references/testing — proving a team

| Document | Status | Abstract |
|---|---|---|
| `invariants-catalog.md` | present | The standard invariants (`INV-FS`, `INV-SECRETS`, `INV-EMAIL`, `INV-TOOLS`, `INV-SCHEMA`, `INV-IDEMP`, `INV-RESUME`, `INV-INCR`, `INV-BUDGET`, `INV-INJECTION`) and the standard indicators: statement, when it applies, how the bench checks it. |
| `test-levels.md` | present | The five levels — static, unit, component with a simulated LLM, end-to-end local, end-to-end remote: what each proves, what it costs, when it runs. |
| `synthetic-data.md` | present | Producing datasets: files, `.eml`, CSV, PDF, folder trees; variants and edge cases; adversarial sets; the manifest. |
| `acceptance-criteria.md` | present | Writing acceptance criteria (Given a dataset / When / Then), indicators (measure, unit, threshold, direction) and invariants (always true), and attaching each to the lowest level that proves it. |
| `llm-judge.md` | present | Rubrics, calibration on reference outputs, the biases of a model judging a model, what is logged with each judgement. |
| `local-vs-remote.md` | present | Comparing a local and a remote model: differentiated thresholds, repetitions and `pass@k`, flakiness, what a local run never proves. |

The summary of the levels and of the process that uses them is in `references/process/workflow.md`.
