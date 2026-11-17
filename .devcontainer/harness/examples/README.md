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

Each pilot has its `README.md`: the goal, the mount points, what it will demonstrate. The content — the
team, its workbook, its tests — arrives with the lots that build the corresponding steps, the YAML
pilot first (the full loop with a simulated then a local LLM), C# and remote afterwards.

Today `mail-triage` holds its three folders. `workbooks/mail-triage/` holds its `STATUS.md` (phase `spec`,
no gate passed), `decisions/DEC-0001-creation.md` and `TEAM.md`, whose need and acceptance were validated under
method v1 (the project owner typed `/team-approve need mail-triage` on 2026-10-07 — a gate is passed by the user
typing that line, never by the harness) and whose design and plan `/team-spec` wrote. `teams/mail-triage/` holds
the YAML crew of the design (three agents, four tasks and the decision gate `any_draftable`), its schemas, its
launchers and its Studio card; `tests/mail-triage/` holds the static notes, seven component scenarios on the
simulated LLM, the end-to-end scenarios of the local and remote levels, the judges' rubrics and seven synthetic
datasets, written by `datasets/generate.py`. Both were written ahead of the gate, as the worked example: the
one gate of v2, `/team-approve team mail-triage`, is still the user's, and `STATUS.md` says so. The team runs
green at L0 to L2 with no decision model; L3 and L4 have not run. The two other pilots hold their README only.

Once complete, the pilots are replayed end to end by the harness evals: with the simulated LLM
(fast, at every image build) and with the local model (nightly), with expectations on the artefacts
produced — sections present, ids traced, verdicts.
