---
name: team-review
description: "Step 5 of the method: reviews an attempt of an Orkeon team — team-reviewer reads capture.md, REPORT.md and judgements.json against TEAM.md and returns ACCEPTED, ITERATE or BLOCKED with its gaps; the skill writes ANALYSIS.md, on ITERATE a FIX-PLAN.md and the correction sheets of TEAM.md § Plan, closes the attempt on ACCEPTED, and repositions STATUS.md (D38)."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-review — the verdict of an attempt

Step 5 of the method (`references/process/workflow.md`). A verdict is given by a reviewer that did not
build the team, on the captured evidence, against the acceptance of `TEAM.md`. You relay it, record it
and reposition; you argue with it only on a fact of the archive.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`phase: review`), the open attempt (`capture.md`, `REPORT.md`, `report.json`,
  `judgements.json`), `TEAM.md § Acceptance` and `§ Plan`, `.claude/templates/ANALYSIS.md`,
  `FIX-PLAN.md`, `references/process/checklists/review.md`.
- Subagent: `team-reviewer` (model `opus`, read-only), contract: the slug, the attempt id, the paths
  above, the verdict shape of its charter (`## Verdict — ACCEPTED|ITERATE|BLOCKED`, gaps `F-<m>` with
  severity Blocking/Major/Minor, each citing an id and a file of the archive, ≤ 120 lines).
- Writes: `attempts/ATT-nnnn/ANALYSIS.md` (the reviewer's text in the template), on ITERATE
  `FIX-PLAN.md` and `#### Correction C<n> — F-<m>` sheets in `TEAM.md § Plan`; `STATUS.md`.
- Bench: `orkeon-bench attempt close <slug> --verdict ACCEPTED` on ACCEPTED only.
- Journal: `— /team-review — ACCEPTED|ITERATE|BLOCKED (<n> gaps: <b> Blocking, <m> Major, <k> Minor)`.
- Exit state: ACCEPTED → `verdict: ACCEPTED`, `phase: accepted`, `gate_passed: review`, `attempt: null`,
  `next_action: /team-release <slug>`; ITERATE → `verdict: ITERATE`, `phase: build`, `gate_passed:
  tests`, `iteration: +1`, `next_action: /team-build <slug>` (D38: the gate never runs ahead of the phase;
  the attempt stays open); BLOCKED →
  `verdict: BLOCKED`, `phase: review`, `next_action` the human action the reviewer names.

## Steps

1. **Find the team**: the argument, else the only team with `phase: review`, else ask. `orkeon-bench
   status <slug>`: `phase: review`, an open attempt with `report.json` and `capture.md` (missing:
   `/team-run <slug>` first). Journal `- … — /team-review — started (ATT-nnnn)`.
2. **Delegate the review** to `team-reviewer` with the contract above. Read the report: every gap cites
   an id and a file; a gap that cites nothing goes back to the reviewer once. Check the verdict against
   the rule: ACCEPTED needs every active AC passed at its level, every IND within threshold (a `not_applicable` IND counts neither way), every judge
   of `report.judges` within its threshold, every INV `pass` (a `not_run` INV is a gap), no Blocking
   gap. A red judge blocks the verdict like a red indicator (D97: `verdict_input.indicators_in_range` is
   false): it means ITERATE — the output falls short of its rubric —, not a note; BLOCKED only when the
   threshold is out of reach of any build. ITERATE for gaps the build can fix; BLOCKED for
   what needs the user (a threshold out of reach, a model that cannot, a missing input). A verdict that
   breaks the rule is sent back once with the fact; then you keep the stricter one and say so. A failed
   run's `failure_class` (`report.json`, `REPORT.md` § What fails) says whose failure it is: `team` (or
   none) is a gap for the build; `decision_blocked`, a decision stage blocking a call, is a gap only when
   it blocked a legitimate input (the profile or the crew to correct) — on an adversarial input it is the
   profile working, and the scenario's checks say so; `decision_provider` is no team defect and no
   ITERATE gap: BLOCKED — with `failure_cause` `unreachable` (down, timed out, 429, 5xx), `next_action`
   "start the provider (`orkeon-bench doctor`, check `decision-model`), then `/team-run <slug>`"; with
   `key` (401/403, no key), "correct the key variable the provider reads, then `/team-run <slug>`".
3. **Record**: `ANALYSIS.md` from the template with the reviewer's text; walk `checklists/review.md`.
4. **ACCEPTED**: `orkeon-bench attempt close <slug> --verdict ACCEPTED` (it checks the report accepts);
   `STATUS.md` as the Contract says.
5. **ITERATE**: `FIX-PLAN.md` from the template — one `F-<m>` per gap, in severity order, each with the
   batch it touches and the files; then under that batch's sheet in `TEAM.md § Plan`, `#### Correction
   C<n> — F-<m>` with its own unticked steps (earlier proofs stay). `STATUS.md` as the Contract says;
   the fix plan changes no test — a gap that needs a test change is a `/team-decision` and is said so.
   Two ITERATE on the same gap: say it to the user before a third; `/team-loop` stops there.
6. **BLOCKED**: the reason and the human action in `ANALYSIS.md` and `next_action`; propose the
   `/team-decision` that would unblock when there is one.
7. **Hand over**: the verdict in one sentence, the gaps by severity, the command next. Then stop,
   unless `/team-loop` is driving.

## Done when

`ANALYSIS.md` exists, `STATUS.md` holds the verdict and its journal line, and on ACCEPTED the attempt is
closed. This step edits no crew and no test, never lowers a threshold, never accepts on a `not_run`
invariant or a skipped level that the acceptance requires.
