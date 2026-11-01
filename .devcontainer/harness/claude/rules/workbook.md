---
paths:
  - "workbooks/*/**"
  - "library/tools/csharp/*/workbook/**"
  - "library/examples/workbooks/*/**"
---

# The workbook of a team

`workbooks/<slug>/` holds the why and the where-are-we of a team: next to `teams/`, never in the team
folder, which holds only what Orkeon Studio runs (D29); a C# tool keeps its `workbook/` in its folder.
Scripts, hooks and `orkeon-bench` parse these files: their shape is a contract. The templates in
`.claude/templates/` are the single source of that shape; the frozen strings are listed in
`.claude/harness/FROZEN-LITERALS.md`. The formats in detail: `references/process/artefacts.md`;
criteria, indicators and invariants: `references/testing/acceptance-criteria.md`; what each gate
checks: `references/process/checklists/` (`spec.md`, `tests.md`, `build.md`, `run.md`, `review.md`,
`release.md`).

## One upstream artefact: `TEAM.md` (D89)

- `TEAM.md` holds the four sections `## Need`, `## Acceptance`, `## Design`, `## Plan`, in that order,
  each with the `###` headings of the template. It is written by `/team-spec`, checked by
  `orkeon-bench check team <slug>`, validated **once** by the user: `/team-approve team <slug>`.
- Keep the headings of the template: same text, same level, same order. Add content under them,
  never a renamed or reordered section. An empty section says `None.` rather than disappearing.
- Ids are stable and never renumbered: `R-xx`, `AC-xx`, `IND-xx`, `INV-xx` (or `INV-<NAME>` from the
  catalogue), `J-xx`, `DEC-nnnn`, `ATT-nnnn`, `RUN-<yyyymmdd>-<hhmm>-<target>`, batches `B1`,
  `B2`…, fixes `F-n`, assumptions `Hn`, corrections `Cn`. A batch is never written `L…`: `L0`…`L4`
  are the test levels.
- A criterion that is abandoned stays in its table with `Status: dropped (DEC-nnnn)`.
- One fact, one place: the need in `§ Need`, thresholds in `§ Acceptance`, the team in `§ Design`,
  the batches in `§ Plan`. Everything else cites the id. The mount points of the team are the rows of
  `§ Need › Mounts`, settled in `§ Design › Mounts`; the rule they obey is
  `references/orkeon/studio-layout.md#mount-points`, cited, never copied.
- After the team gate, only `## Plan` moves: the proof ticks of a build, a `#### Correction Cn — F-m`
  sheet after a review. A change of the need, the acceptance or the design goes through
  `/team-decision`, which sets the phase back to `spec` and marks the file `> To revise — DEC-nnnn`;
  `guard-phase` refuses an edit above `## Plan` in any other phase.

## STATUS.md

The YAML front matter is read by `orkeon-bench status` and by the hooks. Exactly these keys:

| Key | Value |
|---|---|
| `phase` | `spec` \| `tests` \| `build` \| `run` \| `review` \| `accepted` \| `published` |
| `gate_passed` | the last gate passed: `team` (the user), `tests`, `build`, `review` — or `null` before the first; after `ITERATE`, `tests` again (D38) |
| `iteration` | a non-negative integer: `0` at `/team-init`, +1 at each `ITERATE` (D38); absent reads as `0` |
| `attempt` | `ATT-nnnn` or `null` |
| `batch` | `B1`, `B2`… or `null` |
| `verdict` | `ACCEPTED` \| `ITERATE` \| `BLOCKED` or `null` |
| `next_action` | the command to run next, never empty; `/team-approve team <slug>` once `/team-spec` has submitted the gate — the hook records no approval before |
| `updated_at` | ISO 8601 with offset, e.g. `2026-09-30T19:12:00Z` |

Phases in order: `spec` → `tests` → `build` → `run` → `review` → `accepted` → `published`. The team
gate passes on the user's word only: the user types `/team-approve team <slug>`, and the hook
`team-approve` writes `phase: tests`, `gate_passed: team`, `next_action` and the journal line from
that line (D36, D89). Never raise `gate_passed` from `null` with Edit or Write — `guard-phase`
refuses it; lowering it (`/team-decision` goes back a step) and the later gates (`tests`, `build`,
`review`) stay with the skills. After `ITERATE`: `phase: build`, `gate_passed: tests`, `iteration` +1.

Below it, the journal: one bullet per event, `- YYYY-MM-DD HH:MM — /team-<skill> — <outcome>`.
Every `- ` line of the body is read as a journal entry: no other list in this file. Every `team-*`
skill ends by updating both the front matter and the journal.

## Decisions

One file per change, `decisions/DEC-nnnn-<slug>.md`, written when the change is decided, never
rewritten afterwards except its `## Status`: a decision that is replaced gets `superseded by DEC-mmmm` there.

## Attempts and runs

- `runs/RUN-…/` is written by `orkeon-bench` alone. So are the attempt folders and, inside them,
  `manifest.json`, `REPORT.md`, `report.json`, `judgements.json`, `capture.md`, `remote-approval.json`
  and `design-snapshot/`: never with Edit or Write.
- In an **open** attempt, `ANALYSIS.md` and `FIX-PLAN.md` are written by the main thread — the
  `/team-review` skill, from the review `team-reviewer` returns. A subagent never writes them.
- A **closed** attempt (`closed_at` set in `manifest.json`) is immutable, for everyone.
- `ANALYSIS.md` opens with `## Verdict — ACCEPTED`, `## Verdict — ITERATE` or `## Verdict — BLOCKED`;
  it stays under 2 kB when accepted, 4 kB otherwise. Every gap has a severity, an id, a category and
  an evidence; no evidence, no gap.

## Tone and language

**Language.** English, unless the workshop names its language (D41): `.claude/local/language` holds a
language tag (`fr`, `pt-BR`), set by `/workshop-language` and recalled by a hook at the start of each
session. Then:

- **in that language**: the conversation with the user, whatever the language of their messages, and
  the prose of the workbook — what is written under the headings of `TEAM.md`, of a decision, of the
  analysis and the fix plan of an attempt, and the text after the colon of a `> To revise — DEC-nnnn: …`
  line;
- **as the templates give them, in English**, because scripts, hooks, evals and the references read
  them: the headings and their order, the front-matter keys and values, the ids (`R-01`, `AC-01`, `H1`,
  `DEC-0001`, `ATT-0001`, `B1`), the table headers, every journal line of `STATUS.md`, the
  `> To revise — DEC-nnnn:` prefix, the `## DONE` / `## BLOCKED` reports of the subagents, file names,
  virtual paths and code — and every fixed word: `TBD`, `None.`, the verdicts (`ACCEPTED`, `ITERATE`,
  `BLOCKED`), the severities, any value a template's comment enumerates with `|` (`active`,
  `dropped (DEC-nnnn)`, `todo`, `in progress`, `done (ATT-nnnn)`, `ro`, `rw`, `rwnd`, `stub`, `local`,
  `remote`, the status of a decision…), the labels a template writes before a colon (`- Date:`,
  `- Requested by:`, `- Phase:`), the proof ticks (`TESTS ✅ · BUILD ✅`), and what a template or a
  script pre-fills (a row a template gives, the `DEC-0001` that `/team-init` writes). A number a
  script reads — a threshold — is written with a decimal point and no unit (`99.5`, not `99,5` nor
  `95 %`);
- **what is already written keeps its language**: revise an artefact in the language it is in, and
  translate one only when the user asks for it;
- **not this setting**: the language a team's agents write in — their prompts, their deliverables — is
  a constraint of that team's need.

Without that file the conversation follows the language of the user's messages and every file is in
English. The messages of the hooks are English in both cases: report them in the user's language —
which, wherever a skill says "in the user's language", is the workshop's language when one is set.

**Tone.** Factual, what is wrong first, no celebration, no adjectives where a number exists. A proof
tick (`TESTS ✅ · BUILD ✅ · L0/L1 ✅`) is set only on an observed result: command and exit code.
