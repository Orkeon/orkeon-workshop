---
name: dev-verify
description: Step 4 of the dev chain - audits a batch delivered by /dev-implement, read-only and in an isolated subagent (dev-auditor) - code first, then its conformance to the sheet - and writes todo/<code>/<CODE>-VERIFY-F<n>.md with a VALID or GAPS verdict.
argument-hint: "F<n> [todo/<code>/<CODE>-PLAN.md] [full | resume]"
disable-model-invocation: true
---

# /dev-verify — the audit of a batch

Step 4 of the dev chain, also run by `/dev-implement` when it closes a batch. A script gathers what is
mechanical; `dev-auditor`, read-only, judges the rest from an isolated context; you write the verdict
file and relay it. Nothing is fixed here: fixing is `/dev-implement`'s.

Arguments: $ARGUMENTS

## 1. Scope

- The batch `F<n>` and its sheet `todo/<code>/<CODE>-PLAN-F<n>.md` (plan path from the argument, else
  `ls todo/*/*-PLAN-F<n>.md`, several → ask). Read the sheet's `## Design`, `## TDD sequence` and
  `## Test policy and scopes` only, and the `Commands` and `Layout` lines of the global plan's
  `## 1. Scope` (`grep -n`). Absent there: `.claude/harness/packs/repo-*/references/repo.yaml`; absent
  there too, ask once.
- Mode: `fast` by default; `full` adds the whole fast suite (never a whole integration suite);
  `resume` re-audits after a correction — the previous verdict file's gap table and the diff since.

## 2. Gate and capture — one call

```bash
bash .claude/skills/dev-verify/scripts/audit-capture.sh F<n> <sheet> "${TMPDIR:-/tmp}/dev-audit-F<n>.txt" \
  --build "<commands.build>" --roots "<production root> <test root>"
```

Exit `1` is the gate, red: an open `TDD:` line, an unclassified design id, a changed file outside the
batch and absent from the sheet, whitespace errors. Fix what it lists (through `/dev-implement` when it is
code) and run it again; no audit while it is red. Exit `0`: the capture is written.

## 3. The audit — delegated

`Agent` with `subagent_type: "dev-auditor"`, a `description` (`audit F<n>`), and this prompt:

```text
mode: <fast | full | resume>
batch: F<n> — sheet: <path> — capture: <path of the capture>
commands: test `<commands.test>` · test_integration `<commands.test_integration>`
applied rules: <the Applied rules row of the sheet>
previous gaps (resume only): <the gap table of the previous verdict file>
```

Its report opens with `## Audit — VALID` or `## Audit — GAPS`, a table, a `Validations` line, and ends
with `## DONE`. A report without them goes back to it once (`SendMessage`).

## 4. The verdict file

Write `todo/<code>/<CODE>-VERIFY-F<n>.md` (on `resume`, append a dated section; never rewrite an earlier
one). `/dev-learn` reads these files: keep the headings and columns verbatim.

```markdown
# <CODE>-VERIFY-F<n> — <YYYY-MM-DD HH:MM> — <mode>

## Verdict — VALID | GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|

Validations: `<command>` — exit N, scope <filter or whole suite>, <n> tests
Not run: <suite> — <reason>
```

`VALID` lists its minors under the same columns, or `None.` under the heading. `GAPS` as soon as one
`Blocking` or `Major` row stands.

## 5. Relay

Print the verdict block as written, nothing else. Called by `/dev-implement`: return to its closing.
Run on its own, on `VALID`: hand the commit over as `.claude/skills/dev-implement/references/closing.md`
§ 4 says, then print `→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`
On `GAPS`: `→ /dev-implement F<n> — correction: <the first gap>` is the user's to launch.
