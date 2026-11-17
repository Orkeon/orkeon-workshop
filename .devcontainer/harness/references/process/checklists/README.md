# Gate checklists

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: harness `references/process/workflow.md` (§ 3, § 4, § 9), `references/process/artefacts.md`,
> `.claude/harness/FROZEN-LITERALS.md`, `.claude/rules/workbook.md`, `.claude/harness/README.md` (the guards); plan § 4, D89.

One checklist per gate of `references/process/workflow.md` § 4: what must be true before the gate is
passed, the evidence to look at, and the usual reasons to refuse. The workflow says *when* a gate
happens and who validates it; a checklist says *what* to check. Formats are in
`references/process/artefacts.md`; the templates are in `.claude/templates/`.

| Checklist | Gate (as written in the journal) | Exit of | Validated by | `STATUS.md` once passed |
|---|---|---|---|---|
| [`spec.md`](spec.md) | `gate team` | `/team-spec` | script, then the user | `phase: tests`, `gate_passed: team` |
| [`tests.md`](tests.md) | `tests red` | `/team-tests` | script | `phase: tests`, `gate_passed: tests` |
| [`build.md`](build.md) | `batch green` | each `/team-build B<n>` | script, diff read by the orchestrator | `phase: build`, `batch: B<n>`; `gate_passed: build` after the last batch |
| [`run.md`](run.md) | `budget` (before a remote target), then a report fit for review | `/team-run` | the user (budget), the bench (report) | `phase: run`; the approval lives in the attempt |
| [`review.md`](review.md) | `verdict` | `/team-review` | the reviewer, applied by the main thread | `verdict` set, `gate_passed: review` (`tests` on `ITERATE`, D38) |
| [`release.md`](release.md) | — (no exit gate) | `/team-release` | the main thread; the user runs the tag | `phase: published` |

## How to use a checklist at a gate

1. **Read `STATUS.md` first** (`orkeon-bench status <slug>`, which works as soon as
   `workbooks/<slug>/` exists — `teams/<slug>/` comes with the first build): the previous gate must be
   passed (`gate_passed`), and the step must be the one `next_action` names. A gate is never skipped.
2. **Walk the boxes in order.** Tick a box only on evidence looked at during this step: a section of
   an artefact, a command with its exit code, a file the bench wrote. "Probably true" stays unticked.
3. **An unticked box is a refusal or a decision.** Fix it inside the step when it is in its scope.
   Otherwise refuse the gate and go back (workflow § 9), or record the change with `/team-decision`
   when it touches the need, a threshold, a test or the design.
4. **At a user gate** (`team`, `budget`), show the artefact path, the boxes left open and why, and the
   points the user must settle, then ask for an explicit answer: validate, amend (the step resumes at
   the question) or refuse. Silence is not a yes. The user validates by typing
   `/team-approve team <slug>` (`/team-approve remote <usd> <slug>` at the budget gate).
5. **Record the outcome**, never the checklist: the front matter and one journal line of `STATUS.md`
   (`- YYYY-MM-DD HH:MM — /team-<skill> — <outcome>`). At the team gate the step records that the gate
   is submitted — `next_action: /team-approve team <slug>`, without which the hook records nothing —
   and stops; the gate itself is recorded by the hook `team-approve`, from the `/team-approve …` line
   the user types (D36) — `gate_passed`, `next_action` and the journal line
   `— /team-approve — gate team passed: the user typed …`. Nobody else writes the team gate:
   `guard-phase` refuses it. An open point becomes an open question, an assumption `Hn` or a
   `DEC-nnnn`. The checklist is not copied into the workbook.

## Boxes common to every gate

- [ ] `STATUS.md` was read at the start of the step and is updated at its end (front matter and
  journal); `updated_at` carries an offset.
- [ ] The artefact keeps the headings of its template, same text, level and order; an empty section
  says `None.`. For `TEAM.md`:
  `diff <(grep -E '^##+ ' .claude/templates/TEAM.md) <(grep -E '^##+ ' workbooks/<slug>/TEAM.md)`
  prints only the `### B<n>` sheets and their `#### Correction` sheets.
- [ ] Every id is well formed and unique, none renumbered (`references/process/artefacts.md` § 2).
- [ ] The structure in English — headings, ids, fixed words — and the prose in English too, or in the
  workshop's language when one is set (`.claude/rules/workbook.md` § "Tone and language"); no key,
  token or password anywhere (`secret-guard` refuses the obvious patterns, not all).
- [ ] Nothing needed for the next step exists only in the conversation (workflow § 10).

## What the hooks already hold — and what they do not

| Hook | Holds | Does not hold |
|---|---|---|
| `guard-phase` | inside a team's four trees (`teams/`, `workbooks/`, `tests/`, `settings/` of its slug): who of the six harness agents writes where; with a `STATUS.md` phase, `crew/` frozen outside `build`, `tests/<slug>/` frozen once the last batch is built and from `run` on, `TEAM.md` frozen above `## Plan` after the team gate; closed attempts; no subagent writes a settings file; no Edit or Write raises `gate_passed` in `STATUS.md` while the team gate is not passed | writes made through Bash (redirects, scripts) — but for `gate_passed` in a `STATUS.md`, which `bash-dispatch` (`guard-user-gate`) refuses; writes outside the team's four trees (other than settings files); the scope of another agent type (`general-purpose`…); a team without a `STATUS.md` phase |
| `secret-guard` | key patterns written with Edit/Write under the team folders, `library/`, `references/` | a secret it has no pattern for, or one written through Bash |
| `run-gate` | a remote run without an approval in the open attempt | who approved; a run started from inside another program |
| `subagent-report-shape` | the shape of a `## DONE` / `## BLOCKED` report and of a review | whether the command passed, whether a gap is true |
| `status-check` | that `STATUS.md` was written after a `team-*` skill | whether what it says is right |
| `team-approve` | that the team gate and a remote approval are recorded from a line the user typed, for a team that waits for the gate, whose `TEAM.md` holds its four sections and whose step has submitted it | whether the artefact is good: it checks the shape of the file, not the boxes above |

No hook passes a gate: `team-approve` records the user's approval, the others check shape, and shape
is not content. Part of the checks are scripts: `orkeon-bench check team <slug>` (the team gate; with
`--tests`, the ids ↔ tests traceability of the *tests red* gate) reads the workbook and reports
findings — an error refuses the gate, a warning is read —, and holds shape too, never a reason.
`orkeon-bench run --level L0|L1|L2|L3|L4` runs the levels, evaluates the invariants and the
indicators from the run archive and, with `evaluate --judgements`, folds the judges in; `estimate`
prices a remote run; `capture` builds the review's input; `release` realigns and compacts.
`orkeon-bench attempt open|close|approve` keeps the attempts.
