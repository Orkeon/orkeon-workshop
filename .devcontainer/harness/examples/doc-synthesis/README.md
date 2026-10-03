# Pilot 2 — document synthesis (TypeScript)

**Goal.** Turn a folder of PDF and DOCX documents into one structured note: the sources read, the
facts extracted with their origin, a synthesis whose sections and length are fixed, and a JSON
companion that follows a schema. Scoring and normalisation are done by custom tools, not by the model.

**Mounts.**

| Mount point | Access | Role | Folder of the team |
|---|---|---|---|
| `/workspace` | ro | inputs | `./input` — the documents to read |
| `/output` | rw | deliverables | `./output` — the note and its JSON companion |

**What it will demonstrate.**

- A declarative `.ork.ts` crew (`crew/crew.ork.ts`) and its custom tools: a pure domain
  (`crew/tools/<name>/domain.ts`) tested with vitest, a `toolBuilder` adapter, a strict `pickTools`.
- The built-in document tools (`pdf_reader`, `docx_reader`) doing the I/O the custom tools cannot do.
- A write/review loop with bounded retries (`graph` mode).
- Deliverables with a schema (`INV-SCHEMA`) and a judge with a versioned rubric for the quality of
  the synthesis.
- Promotion of a proven tool to `library/tools/ts/`.

**Status.** Placeholder (lot 0). Built after the YAML pilot has gone through the whole loop.
