# Gate checklists

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: harness `references/process/workflow.md` (§ 3, § 4, § 9), `references/process/artefacts.md`,
> `.claude/harness/FROZEN-LITERALS.md`, `.claude/rules/workbook.md`, `.claude/harness/README.md` (the guards); plan § 4.

One checklist per gate of `references/process/workflow.md` § 4: what must be true before the gate is
passed, the evidence to look at, and the usual reasons to refuse. The workflow says *when* a gate
happens and who validates it; a checklist says *what* to check. Formats are in
`references/process/artefacts.md`; the templates are in `.claude/templates/`.

| Checklist | Gate (as written in the journal) | Exit of | Validated by | `STATUS.md` once passed |
|---|---|---|---|---|
| [`need.md`](need.md) | `gate 1` | `/team-need` | the user | `phase: need`, `gate_passed: need` |
| [`test-plan.md`](test-plan.md) | `gate 2` | `/team-test-plan` | the user | `phase: test-plan`, `gate_passed: test-plan` |
| [`design.md`](design.md) | `gate 3` | `/team-design` | script (planned), then the user | `phase: design`, `gate_passed: design` |
| [`tests.md`](tests.md) | `tests red` | `/team-tests` | script | `phase: tests`, `gate_passed: tests` |
| [`build.md`](build.md) | `batch green` | each `/team-build B<n>` | script, diff read by the orchestrator | `phase: build`, `batch: B<n>`; `gate_passed: build` after the last batch |
| [`run.md`](run.md) | `budget` (before a remote target), then a report fit for review | `/team-run` | the user (budget), the bench (report) | `phase: run`; the approval lives in the attempt |
| [`review.md`](review.md) | `verdict` | `/team-review` | the reviewer, applied by the main thread | `verdict` set, `gate_passed: review` (`tests` on `ITERATE`, D38) |
| [`release.md`](release.md) | — (no exit gate) | `/team-release` | the main thread; the user runs the commit | `phase: published` |

## How to use a checklist at a gate

1. **Read `STATUS.md` first** (`orkeon-bench status <slug>`, which works as soon as
   `workbooks/<slug>/` exists — `teams/<slug>/` comes with the first build): the previous gate must be
   passed (`gate_passed`), and the step must be the one `next_action` names. A gate is never skipped.
2. **Walk the boxes in order.** Tick a box only on evidence looked at during this step: a section of
   an artefact, a command with its exit code, a file the bench wrote. "Probably true" stays unticked.
3. **An unticked box is a refusal or a decision.** Fix it inside the step when it is in its scope.
   Otherwise refuse the gate and go back (workflow § 9), or record the change with `/team-decision`
   when it touches the need, a threshold, a test or the design.
4. **At a user gate** (`gate 1`, `gate 2`, `gate 3`, `budget`), show the artefact path, the boxes left
   open and why, and the points the user must settle, then ask for an explicit answer: validate, amend
   (the step resumes at the question) or refuse (back to the previous step). Silence is not a yes. The
   user validates by typing `/team-approve need`, `test-plan` or `design` (`/team-approve remote <usd>`
   at the budget gate).
5. **Record the outcome**, never the checklist: the front matter and one journal line of `STATUS.md`
   (`- YYYY-MM-DD HH:MM — /team-<skill> — gate 2 passed`). A `UserPromptSubmit` hook (lot 2, D36) will
   record an approved gate from the `/team-approve` the user typed; until it ships, nothing records an
   approval automatically: the main thread writes the gate on the user's explicit word, quoted in the
   journal line. An open point becomes an open question, an assumption `Hn` or a `DEC-nnnn`. The
   checklist is not copied into the workbook.

## Boxes common to every gate

- [ ] `STATUS.md` was read at the start of the step and is updated at its end (front matter and
  journal); `updated_at` carries an offset.
- [ ] The artefact keeps the headings of its template, same text, level and order; an empty section
  says `None.`. For files with fixed headings:
  `diff <(grep '^## ' .claude/templates/NEED.md) <(grep '^## ' workbooks/<slug>/NEED.md)` prints nothing.
- [ ] Every id is well formed and unique, none renumbered (`references/process/artefacts.md` § 2).
- [ ] English; no key, token or password anywhere (`secret-guard` refuses the obvious patterns, not all).
- [ ] Nothing needed for the next step exists only in the conversation (workflow § 10).

## What the hooks already hold — and what they do not

| Hook | Holds | Does not hold |
|---|---|---|
| `guard-phase` | inside a team's four trees (`teams/`, `workbooks/`, `tests/`, `settings/` of its slug): who of the six harness agents writes where; with a `STATUS.md` phase, `crew/` frozen outside `build` and `tests/<slug>/` frozen during it; closed attempts; no subagent writes a settings file | writes made through Bash (redirects, scripts); writes outside the team's four trees (other than settings files); the scope of another agent type (`general-purpose`…); a team without a `STATUS.md` phase; `gate_passed`, until D36 lands (lots 2 and 6) |
| `secret-guard` | key patterns written with Edit/Write under the team folders, `library/`, `references/` | a secret it has no pattern for, or one written through Bash |
| `run-gate` | a remote run without an approval in the open attempt | who approved; a run started from inside another program |
| `subagent-report-shape` | the shape of a `## DONE` / `## BLOCKED` report and of a review | whether the command passed, whether a gap is true |
| `status-check` | that `STATUS.md` was written after a `team-*` skill | whether what it says is right |

A hook never passes a gate: shape is not content. Part of the checks become scripts in later lots —
`orkeon-bench check design` (lot 3: gate 3, ids ↔ tests traceability), `run`, `capture`, `attempt`
(lot 4), `estimate`, `release` (lot 9). Until then they exit `3` and the boxes are checked by hand.
