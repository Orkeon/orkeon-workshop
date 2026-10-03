# references/process — the way of working

| Document | Status | Abstract |
|---|---|---|
| `workflow.md` | present | The loop from need to release: steps, what each reads and writes, the gates, who writes where, how the user intervenes, how the workflow resumes, what is archived. |
| `artefacts.md` | present | Every artefact of the workbook in detail: headings, columns, allowed values, examples. The templates of `.claude/templates/` stay the single source of the shape; this document explains it. |
| `checklists/` | present | One checklist per gate — `need`, `test-plan`, `design`, `tests`, `build`, `run` (the budget gate), `review`, `release`: what must be true before the gate is passed. |
| `context-discipline.md` | present | Why context cost follows the number of turns, bounded reads, grouping independent calls, when to delegate, what the hooks enforce. |

The strings these documents and the scripts share are frozen: `.claude/harness/FROZEN-LITERALS.md`.
