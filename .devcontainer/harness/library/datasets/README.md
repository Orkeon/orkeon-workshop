# library/datasets — shared datasets

**Purpose.** Synthetic datasets useful to more than one team: a set of mails, a folder of documents,
CSV files with known anomalies, an adversarial set carrying hidden instructions. A team's own
datasets live in its `tests/<slug>/datasets/`; they come here only when shared.

**Shape.** One folder per dataset, the same as in a team:

```
<name>/
├── <root>/…          one subfolder per virtual root the data stands for (workspace/, mailbox/, state/ …)
├── expected/         golden files or oracle descriptions for the written roots
├── manifest.json     name, version, provenance, hash, size, cases covered, ids served
└── README.md         what the set contains, which cases, how it was produced
```

The manifest follows `.claude/templates/dataset-manifest.json`. A scenario binds each virtual root of
a team to one subfolder. Conventions: `.claude/rules/team-tests.md`.

**Promotion rule.** A dataset is promoted at `/team-release` when a second team needs it, with its
manifest complete and its hash recorded. Synthetic data only by default: a real dataset, even
anonymised, never enters the library without a `DEC-nnnn`. No secret, no real credential, no real
personal data. A dataset is versioned, not edited: accepted teams cite the version they ran on.
