# library/schemas — JSON schemas of deliverables

**Purpose.** The schemas that give a deliverable its contract: a classification, a structured note,
a report. A schema shared here lets two teams produce the same shape, and lets the bench validate it
(`INV-SCHEMA`).

**Shape.** One file per schema, `<name>.schema.json` (JSON Schema, with `title`, `description` and a
`$comment` giving the origin team, the attempt and the version). A breaking change is a new file
(`<name>-2.schema.json`), never an edit: accepted teams keep validating against what they shipped.

A team **copies** the schema it uses into its `crew/` folder, because the runner reads it there
(`schemaPath: /crew/<file>` in YAML, `/script/<file>` in TypeScript), and notes in its `DESIGN.md`
which library schema and version it copied. The library file stays the master copy.

**Promotion rule.** A schema is promoted when an accepted team produced deliverables that validate
against it on every scenario, and a second use is in sight. A schema nobody validates against is
removed.
