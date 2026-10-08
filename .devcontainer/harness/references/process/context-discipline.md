# Context discipline — reading and delegating in the workshop

> Reference document of the Orkeon harness (the workshop's `references/process/`). Established on Orkeon main at bd3420c (2026-10-08, after 1.0.0-rc.4).
> Sources: harness `.claude/harness/README.md` (the guards), `.claude/hooks/read-bounds.sh`, `delegation-guard.sh`,
> `subagent-report-shape.sh`, `status-check.sh`, `.claude/lib/bounds-common.sh`, `guard-cat-bounds.sh`, `guard-diff-bounds.sh`,
> `batching-nudge.sh`, `delegation-nudge.sh`, `.claude/settings.json`, the six charters of `.claude/agents/`,
> `FROZEN-LITERALS.md` § 1; `references/process/workflow.md` § 1, § 6, § 10; plan § 4.3–4.5, § 7.2–7.3;
> Orkeon `docs/architecture/run-event-bus.md` (the event envelope).

A team is built over a long loop — need, tests, batches, runs, reviews — in one workshop session or
several. The loop survives only if the main thread keeps its context small and the state lives in
files. This document says how, and what the hooks enforce. Rule 9 of `HARNESS.md` in one line:
bounded reads, independent calls in one message, logs stay with whoever produced them.

## 1. Why the cost follows the number of turns

- **Every turn resends the whole context.** A run of single-call turns pays the accumulated context
  once per call that could have shipped in one message (`batching-nudge.sh`).
- **What is read stays.** A file read whole is carried until the session ends; the cost was never one
  huge read, it was the count of them (`read-bounds.sh`).
- **A subagent's final report is re-injected whole** into the main conversation: everything it
  carries is paid there (`delegation-guard.sh`).

So: fewer turns (batch independent calls), less carried (bounded reads, short reports), conclusions
rather than material (delegate exploration, keep logs where they were produced).

## 2. Bounded reads — the `read-bounds` hook

`read-bounds.sh` (PreToolUse `Read`, every agent) denies a Read carrying neither `offset` nor `limit`
on a file over **120 lines or 8 kB** (`HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`). The refusal
carries the file's outline — up to 40 line-numbered declarations (Markdown headings, TypeScript
exports and `describe`, YAML and JSON top keys, C# declarations) — so the bounded read costs the same
single turn as forcing would.

| Passes without bounds | Why |
|---|---|
| instruction files: `*/skills/*.md`, `*/agents/*.md`, `*/rules/*.md`, `CLAUDE.md`, `HARNESS.md`, `*/references/*.md`, `*/templates/*` | conventions hold only as a set: read them whole (the generator skills read `references/orkeon/` in full before designing) |
| binary or rendered files (`.png`, `.pdf`, `.docx`, `.xlsx`, `.zip`…) | the tool reads them natively |
| flat files (declarations ≥ 33 % of the bytes, `HARNESS_BOUNDS_FLAT_PCT`) | nothing to skip |
| the identical Read issued a second time by the same agent | the explicit way to force a full read |

The workbook is **not** exempt: `DESIGN.md` and `PLAN.md` outgrow 8 kB. Locate, then read the range:

```bash
grep -nE '^(### B3|#### )' workbooks/<slug>/PLAN.md     # then Read with offset/limit on the B3 sheet
```

The same thresholds hold in Bash (`bash-dispatch.sh`): `guard-cat-bounds` denies a bare `cat`, a
`head -n 5000` or a `tail -n +1` of a large file (a pipe or a redirect passes);
`guard-diff-bounds` denies `git diff`, `git show` or `git log -p` printing over 400 changed lines
(`HARNESS_DIFF_BOUNDS_LINES`) — start with `--stat` or `--name-only`, then `git diff -- <path>`. A
repeated identical command forces. `permissions.deny` closes Read under `node_modules`, `bin`,
`obj` and `.git`.

Force a full read only when the whole file is the target (an edit across it). A question *about* a
file — what it covers, which ids, which tools — goes to a subagent (§ 4).

`events.jsonl` is never read whole: grep an event kind (`tool.called`, `task.completed`…), then read
the lines around the hit. A refused `.jsonl` comes with an outline of its first 40 `"kind"` lines — the
outline matches `"kind"`, `"event"` or `"type"` keys, and the envelope of Orkeon's protocol v2 names the
event `kind` (`docs/architecture/run-event-bus.md`; `VERIFICATIONS.md` V-05).

## 3. Batching independent calls

Send in one message every call that does not need another's result: `STATUS.md` with the artefacts the
step reads; two subagents with disjoint scopes; independent checks chained in one Bash command. Keep
apart what depends: an Edit after the Read it relies on, a gate box after the command it reads.

`batching-nudge` (advisory, main thread only) adds a reminder when the last 6 tool-carrying turns each
held a single call; it is evaluated on one Bash call in three and waits 6 turns before nudging again
(`HARNESS_BATCHING_WINDOW`, `HARNESS_BATCHING_SAMPLE`, `HARNESS_BATCHING_COOLDOWN`).

## 4. Delegating with a compact contract

**When.** Exploration — locating, mapping, checking a convention across N files — and the production
steps of the workflow: tests and datasets, batches, the review, run analysis, judgements. **Not** for
a targeted read of a known path: Read is the right tool there. `delegation-nudge` (advisory, main
thread) speaks once 6 distinct source files (`.ts`, `.cs`, `.py`, `.yaml`, `.json`, `.jsonl`…) were
read directly since the last spawn, then at 12, 24… (`HARNESS_DELEGATION_NUDGE_THRESHOLD`); a spawn
restarts the count.

**What `delegation-guard` requires** (PreToolUse `Agent`):

- a `description` — a delegation with no name was never scoped;
- an explicit `model`, unless the agent's charter in `.claude/agents/` pins `model:` (the six harness
  charters do); `haiku` for a read-only search (`Explore`; `HARNESS_EXPLORE_MODEL` can pin it);
  `fork` inherits the caller's model by design;
- then it appends the report contract to the prompt, after the marker
  `--- Report contract (delegation-guard) ---`, never twice: do not restate it in your prompt.

| Agent (`subagent_type`) | Model · turns | Tools | Writes | Final message cap |
|---|---|---|---|---|
| `team-test-author` | sonnet · 60 | Read, Write, Edit, Grep, Glob, Bash | `tests/<slug>/**`, `library/datasets/**` | 20 lines |
| `dataset-synthesizer` | sonnet · 40 | Read, Write, Edit, Grep, Glob, Bash | `tests/<slug>/datasets/**`, `library/datasets/**` | 20 lines |
| `team-implementer` | sonnet · 80 | Read, Write, Edit, Grep, Glob, Bash | `teams/<slug>/crew/**`, `teams/<slug>/mounts.json` (first batch), the team `README.md`, `library/tools/**` | 20 lines |
| `team-reviewer` | opus · 40 | Read, Grep, Glob, read-only Bash | nothing — returns its review | 120 lines |
| `run-analyst` | haiku · 30 | Read, Grep, Glob | nothing | 40 lines |
| `judge` | sonnet · 20 | Read, Grep, Glob | nothing | 40 lines |

The caps come from `HARNESS_REPORT_MAX_LINES` (20): twice for `Plan`, `run-analyst` and `judge`, six
times for `team-reviewer`. Inside a team's four trees (`teams/`, `workbooks/`, `tests/`, `settings/` of
its slug) the write scopes are held by `guard-phase`, not by the prompt; elsewhere (`library/`,
`references/`…) only the charter holds them.

**The contract names; the subagent does not search.** One line of intent, then the paths, the ids,
what must pass, what is forbidden. A path or an id the contract lacks comes back `## BLOCKED` — a gap
of the plan, not a search to run.

```text
description:   Build batch B2 of mail-triage
subagent_type: team-implementer            (model pinned by the charter)
prompt:
  Build batch B2 of the team mail-triage.
  Sheet: workbooks/mail-triage/PLAN.md, section "### B2" — its Anchors are the only files you create or edit.
  Design: workbooks/mail-triage/DESIGN.md, sections "## Agents" and "## Tasks and DAG".
  Ids: AC-02, AC-03, INV-TOOLS.
  Must pass: check_crew.py teams/mail-triage; ./run.sh --validate from teams/mail-triage.
  Forbidden: tests/mail-triage/**, workbooks/mail-triage/**, any remote profile.
```

**After it.** Read the report and check its claims at the source — the diff, the exit code, the file —
never the agent's logs. A `## BLOCKED` is a decision for the orchestrator. Never relaunch an agent
with the same instruction: a short correction goes to the same agent (under three turns), otherwise a
new agent gets a corrected contract. Two subagents run in parallel only on disjoint files; merging
and checks stay serial.

## 5. The report shape — `subagent-report-shape`

Every harness subagent ends with exactly one of two reports (frozen: `FROZEN-LITERALS.md` § 1):

```
## DONE                                     ## BLOCKED
- Files: …                                  - Reason: …
- Ids covered: …                            - Missing: …
- Command: `…` — exit N   (or none)         - Next: …
- Notes: …
```

`subagent-report-shape.sh` (SubagentStop) sends a report back once when a line is missing, when the
`- Command:` line carries neither an observed `exit N` nor `none`, or — for `team-reviewer` — when the
review lacks `## Verdict — <VERDICT>`, the gap table, the fix table on `ITERATE`, or the closing
`## DONE`. The agent re-emits from its own context without re-running anything. It checks shape,
never content: a failing command or a gap without evidence is the orchestrator's call.

## 6. Logs stay with whoever produced them

- `team-implementer` keeps its build and test logs; the orchestrator reads the diff and the exit codes.
- `team-test-author` pastes no test output; it reports the command that shows the tests red.
- Runs live in `workbooks/<slug>/runs/RUN-…/` (`events.jsonl`, `stderr.log`), written by the bench.
  `run-analyst` reads one run by grepping event kinds and returns at most 40 lines; `judge` returns
  its judgements as one JSON line. The orchestrator reads `REPORT.md` first, never a log whole.
- Bash output goes through `rtk` when it is installed (`rewrite-rtk`), which compresses build and test
  output — not a patch, hence the diff bound.
- A detail needed from a log is grepped for, then read as a range.

## 7. The reviewer's compact capture

`team-reviewer` works from a **capture**: `STATUS.md`, the diff since the previous attempt, `REPORT.md`
and `report.json`, the relevant `events.jsonl` excerpts, plus `DESIGN.md` and the batch sheet.
`orkeon-bench capture <team>` builds it (planned, lot 4); until then the contract names the same pieces
by path. The reviewer opens it once instead of rebuilding it over thirty turns; its Bash is read-only
(`orkeon-bench capture`, `orkeon-bench report validate`, `git diff --stat`, `jq` on a report). A
re-review narrows to the previous gap table plus the diff since. Its whole message stays under 120
lines; `ANALYSIS.md`, written from it, under 2 kB when accepted and 4 kB otherwise.

## 8. What goes in files, what may stay in the conversation

No information needed for what comes next exists only in the conversation (workflow § 10): after a
`/clear` or a restart, `/team-status` resumes from the files alone. `status-check` (Stop) blocks once
when a `team-*` skill ends without writing `STATUS.md`.

| In a file | Where |
|---|---|
| the state: phase, gate, attempt, batch, verdict, next action | `STATUS.md` front matter and journal |
| every decision of the user, every change of need, threshold, test or design | the artefact itself, or `decisions/DEC-nnnn-<slug>.md` |
| an answer given at a gate | the artefact it settles (`NEED.md`, `ACCEPTANCE.md`…) |
| a proof (a step built, a level green) | the proof ticks of `PLAN.md`, on a command and its exit code |
| a review | `ANALYSIS.md`, `FIX-PLAN.md` of the open attempt |
| a remote approval | the open attempt: on the user's `/team-approve remote <usd>`, the hook `team-approve` has `orkeon-bench` write it (D19, D36) — never Claude, on its own initiative or from the shell |
| a report, a run | the attempt and `runs/`, through `orkeon-bench` |

May stay in the conversation: questions to the user before the answer is recorded, progress notes,
summaries for the user, the reasoning of a step, a subagent report until what is kept from it is
written down.

## 9. A refusal, and what to do

| Message | Do instead |
|---|---|
| `Unbounded Read on <path> …` | pick a range from the outline (or `grep -n`), Read with `offset`/`limit`; delegate a question about the file; re-issue only to force a needed full read |
| `Unbounded cat on <path> …` (also `head`, `tail`) | the same, or pipe the command through `grep` |
| `Unbounded patch: …` | `git diff --stat`, then `git diff -- <path>` for the files that matter |
| `delegation-guard: … blocked` | add the `description`, or the explicit `model` |
| `Incomplete …` (inside a subagent) | re-emit the whole report or review in the charter's shape, without re-running anything |
| `Batching: …` / `Delegation: …` | group the next independent calls / send the remaining exploration to an agent |

Every refusal states its reason and the way forward: follow it rather than working around it
(`HARNESS.md`, Guards). The full list of hooks and switches is in `.claude/harness/README.md`.
