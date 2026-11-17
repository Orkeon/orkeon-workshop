# J-03 — urgency, v1

A deterministic count, graded as a judge so that the median of the runs is reported: the share, 0 to 100,
of the records of `/output/classification.json` on `nominal` whose `urgency` equals the one of the same
`file` in `datasets/nominal/expected/classification.json` (R-03: `low` for newsletter and spam, `high` for
an outage, a blocked customer or a deadline within two days, else `medium`). A record missing counts as a
miss. IND-09 (L3, threshold 75).

| Score | Meaning |
|---|---|
| 100 | the twelve urgencies equal `expected/` |
| 50 | six of twelve |
| 0 | none, or no classification file |

Example: `mail-07.eml` (a deadline the next day) answered `medium` instead of `high`, the rest right → 91.7.
