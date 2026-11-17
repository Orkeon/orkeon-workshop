# Reply scripts of the stub

The simulated LLM of the component scenarios: one rule per agent role, and for the sorter one per task. A rule answers by turn — the number of answers already in the request —, so a step of a sequence gets the same answers as the step before it. Written by `datasets/generate.py`: change the generator, not these files.

- `nominal.json`: A first run on nominal: the reader parses the twelve mails, the sorter answers the twelve records of expected/ — mail-12 placed as other / medium (R-09) —, the drafter writes the five drafts, the registry gets the twelve names.
- `empty.json`: A run on an empty mailbox: nothing pending, a classification file with no record, an empty registry.
- `registry-decides.json`: incr-v1 with the registry of a first run and /output emptied by hand (AC-11): every file is in the registry, nothing is pending, no record and no draft.
- `second-export.json`: incr-v2 after a run on incr-v1 (INV-INCR): three new mails parsed, their records merged after the six earlier ones, left as they are.
