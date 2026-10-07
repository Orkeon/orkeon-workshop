---
paths:
  - "**/*.md"
---

# Markdown files — produced vs. instruction

Adapted from claude-code-toolkit `rules/markdown-output.md` (MIT, see `.claude/harness/THIRD-PARTY.md`).

Two families, and one exception that overrides both.

- **Produced files** — the workbook of a team (`NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`,
  `DESIGN.md`, `PLAN.md`, `STATUS.md`, decisions, reports, analyses), team and library READMEs,
  summaries returned to the user. Deliverables someone proofreads.
- **Instruction files** — `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, `CLAUDE.md`,
  `.claude/harness/HARNESS.md`, `references/`. Prompts and references, not deliverables.
- **Overrides both: emitted literals stay verbatim.** A string that a script emits and another
  parses — a report label, a verdict, a heading of a template, a front-matter key, an id prefix — is
  quoted exactly as `.claude/harness/FROZEN-LITERALS.md` lists it. Reword one and you reword its
  parser, its template and its eval in the same change.

Template blocks (the files of `.claude/templates/`, the report blocks of the agent charters) are
produced text: copied verbatim, filled in, never restyled.

## Language

English for both families — every file written to disk — and the conversation in the user's language,
unless the workshop names its language (`/workshop-language`, D41): the conversation and the prose of
the workbook are then in it, the structure the templates give staying in English.
`.claude/rules/workbook.md` § "Tone and language" has the rule.

## Writing

- Factual and short: what is wrong first, no celebration, no restating of the request.
- A fact lives in one file; elsewhere, cite the file or the id.
- Paths, ids, commands and error messages verbatim, in backticks. Virtual paths (`/mailbox/…`) and
  physical paths (`/workspace/teams/…`) are never mixed up: say which one it is when both appear.
- Tables for anything a script or a reviewer scans by column; prose for reasoning.
- No secret, no key, no token in any Markdown file, even as an example: write the name of the variable.
