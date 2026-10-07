# Checklist — the verdict: the review of an attempt

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 80fdefe (2026-10-07, after 1.0.0-rc.4).
> Sources: harness `.claude/agents/team-reviewer.md`, `.claude/templates/ANALYSIS.md`, `FIX-PLAN.md`; `.claude/hooks/subagent-report-shape.sh`, `guard-phase.sh`;
> `references/process/workflow.md` § 4–5; `FROZEN-LITERALS.md` § 1–3; `bench/src/domain/verdict.ts`; plan § 4.3.

Exit of `/team-review`. The verdict is **the reviewer's**, applied by the main thread. Artefacts:
`attempts/ATT-nnnn/ANALYSIS.md` and `FIX-PLAN.md` of the open attempt, the verdict in `STATUS.md`
and in the attempt manifest. Boxes common to every gate: [`README.md`](README.md).

## Before the review

- [ ] `REPORT.md` and `report.json` are in the open attempt and `orkeon-bench report validate` exits 0;
  they are the report of the attempt's last run, at the level the review needs (`Asked for:` in
  `REPORT.md`, `metadata.requested_level` in `report.json`), and `design-snapshot/` is the design that
  run measured (the snapshot is retaken at every run; a run manifest carries `crew.sha256`).
- [ ] The capture is ready: `STATUS.md`, the diff since the previous attempt, `REPORT.md` /
  `report.json`, the relevant `events.jsonl` excerpts, plus `DESIGN.md` and the batch sheet.
  `orkeon-bench capture <team>` builds it (planned, lot 4); until then the contract names the same
  pieces by path. On a re-review the scope is the previous gap table plus the diff since.

## Pass when

**The review**

- [ ] `team-reviewer` ran read-only, in a forked context, and returned one message that opens with
  `## Verdict — ACCEPTED`, `## Verdict — ITERATE` or `## Verdict — BLOCKED` and ends with its
  `## DONE` report (`subagent-report-shape` checked the shape — not the content).
- [ ] Every gap has a severity (`Blocking` / `Major` / `Minor`), an `AC-`/`IND-`/`INV-` id, a category
  (`prompt`, `tool`, `dag`, `data`, `model`, `flaky`, `need`) and an evidence — a run id and event, or a
  file and line. No evidence, no gap.
- [ ] What was delivered was audited first, conformance to the plan second; each divergence from the
  plan is *team at fault*, *plan outdated* (never blocking) or *to be arbitrated*.

**The verdict rule**

- [ ] `ACCEPTED` only if every active AC passes at its required level (a level that ran — `not_run` is
  not a pass, a local run never proves an L4 criterion), every IND is within its threshold, every INV
  holds, and no gap is `Blocking` or `Major`. `verdict_input` of `report.json` agrees.
- [ ] `ITERATE` only if the fix plan applies as is: every fix has an `F-n`, a gap row, a change, files
  and a batch; `## Needs a decision` is `None.`. A fix that edits a test or a threshold is a decision.
- [ ] `BLOCKED` when the user must decide: `## Needs a decision` lists each point as the argument of a
  `/team-decision`.
- [ ] After two correction/review rounds still in gap, the loop stops and hands back to the user.

**The files and the state**

- [ ] The main thread wrote `ANALYSIS.md` (from `## Verdict` up to `## Fixes`) and `FIX-PLAN.md` (the
  rest, up to `## DONE`) in the **open** attempt, headings verbatim; `ANALYSIS.md` is under 2 kB when
  accepted, 4 kB otherwise.
- [ ] Then the attempt is closed — `closed_at` and `verdict` in its manifest — by `orkeon-bench attempt
  close <slug> --verdict <VERDICT>`: a closed attempt is immutable, so nothing is written in it
  afterwards. The bench refuses `--verdict ACCEPTED` unless the attempt holds a valid `report.json`
  whose verdict input accepts: the reviewer cannot accept what the report does not.
- [ ] `STATUS.md` carries the verdict and `gate_passed: review` (`tests` on `ITERATE`, D38), with the
  phase of the table below.

## Evidence to look at

| Evidence | How |
|---|---|
| verdict input, criteria that did not pass | the first two commands below |
| verdict heading, size | the last two commands below: one heading line, a size under the cap |
| gaps vs fixes | every `Gap #` of `FIX-PLAN.md` is a row of the gap table, every fix names a batch |
| previous round | the gap table of the previous attempt's `ANALYSIS.md` |

```bash
A=workbooks/<slug>/attempts/ATT-nnnn
jq .verdict_input "$A/report.json"
jq '.acceptance | to_entries[] | select(.value.status != "pass")' "$A/report.json"
grep -nE '^## Verdict — (ACCEPTED|ITERATE|BLOCKED)$' "$A/ANALYSIS.md"
wc -c "$A/ANALYSIS.md"
```

## Usual reasons to refuse

- A gap without evidence, or an opinion presented as a gap.
- `ACCEPTED` with an AC `not_run`, with an L4 criterion proven locally, or with a `Major` gap left open.
- A fix without files or batch, or a fix that weakens a test.
- The reviewer writing files, or `ANALYSIS.md` / `FIX-PLAN.md` written by a subagent (`guard-phase` refuses both).
- `ANALYSIS.md` over its cap, or its verdict heading reworded (the parsers match it exactly).
- A third round started without handing back.

## Once passed

| Verdict | `STATUS.md` | Next |
|---|---|---|
| `ACCEPTED` | `verdict: ACCEPTED`, `gate_passed: review`, `phase: accepted` | `/team-release` |
| `ITERATE` | `verdict: ITERATE`, `gate_passed: tests`, `phase: build`, `iteration` raised by one, a new attempt, `batch` of the first fix (D38) | `/team-build B<n>` with the corrections appended to the sheets |
| `BLOCKED` | `verdict: BLOCKED`, `gate_passed: review`, `phase: review` | `/team-decision "<the first point>"` |

Journal: `- YYYY-MM-DD HH:MM — /team-review — ITERATE (3 gaps: 0 Blocking, 2 Major, 1 Minor)`.

Settled by D38: a correction batch starts from the `tests` gate, so `ITERATE` writes `gate_passed:
tests` and counts the round in `iteration`, which `orkeon-bench status` shows; the state then reads
without a warning. `BLOCKED` sets `phase: review`, which no earlier step writes: left at `run`, the bench
warns `gate_passed (review) is ahead of phase (run)`.
