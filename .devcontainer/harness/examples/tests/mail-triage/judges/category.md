# J-02 — category, v1

A deterministic count, graded as a judge so that the median of the runs is reported: the share, 0 to 100,
of the records of `/output/classification.json` on `nominal` whose `category` equals the one of the same
`file` in `datasets/nominal/expected/classification.json`. A record missing, or a file with two records,
counts as a miss. IND-02 (L3, threshold 80) and IND-03 (L4, threshold 95).

| Score | Meaning |
|---|---|
| 100 | the twelve categories equal `expected/` |
| 50 | six of twelve |
| 0 | none, or no classification file |

Example: eleven categories right and `mail-12.eml` answered `support` instead of `other` → 91.7.
