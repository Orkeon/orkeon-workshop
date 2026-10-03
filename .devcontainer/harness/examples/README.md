# Examples — the pilot teams

Three pilots drive the construction of the harness and end as its worked examples. The image deploys
this folder to the workshop's `library/examples/` and keeps it up to date; it is **outside** `teams/`, so
Studio does not list these folders. Once built, each pilot is laid out as a small workshop —
`teams/<name>/`, `workbooks/<name>/`, `tests/<name>/` (and its mount sets `mounts.<set>/<name>/`)
under `library/examples/` — the same rule as a team of the workshop (D29); to try one, copy those
folders next to yours.

| Pilot | Format | What it exercises | First lot |
|---|---|---|---|
| `mail-triage/` | YAML | `.eml` files read with `email_parser`, several mounts, incremental processing, resume, an adversarial dataset | lot 2 |
| `doc-synthesis/` | TypeScript | custom tools, deliverables with a schema, judges, the write/review loop | lot 5 |
| `csharp-tool-extractor/` | C# | a deterministic C# tool, the VFS analyzer, exposure to a team through a plugin | lot 8 |

For now each folder holds its `README.md` only: the goal, the mount points, what it will demonstrate.
The content — the team, its workbook, its tests — arrives with the lots that build the corresponding steps,
the YAML pilot first (the full loop with a simulated then a local LLM), C# and remote afterwards.

Once complete, the pilots are replayed end to end by the harness evals: with the simulated LLM
(fast, at every image build) and with the local model (nightly), with expectations on the artefacts
produced — sections present, ids traced, verdicts.
