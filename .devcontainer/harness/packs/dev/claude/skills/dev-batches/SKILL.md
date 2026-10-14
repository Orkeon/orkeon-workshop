---
name: dev-batches
description: Runs several batches of a validated plan, each in a dev-batch agent in its own worktree - at most HARNESS_DEV_BATCHES_MAX at a time - and writes their sheets and verdicts from the agents' reports. The main context orchestrates and never carries a batch.
argument-hint: "F<n> [F<m>...] [<work>/<code>/<CODE>-PLAN.md]"
disable-model-invocation: true
---

# /dev-batches — the batches of a plan, one agent each

D70. `/dev-implement` is the procedure of one batch; here it runs in `dev-batch` agents (never a generic one:
`delegation-guard` refuses it, D75), in the background, one worktree each, and you orchestrate: you launch, you
wait, you write the backlog from what comes back. You read no code, delegate no RED or GREEN yourself, and never
print the closing line of a batch (`→ Batch F<n> complete …` is `/dev-implement`'s, read by `dev-batch-guard`).

Arguments: $ARGUMENTS

## 1. Entry

1. The batches: every `F<n>` of the argument, in the plan's order. The plan: the path in the argument
   (as text), else `ls <work>/*/*-PLAN.md`, several → ask; none → stop and name `/dev-plan`.
2. Read the global plan's `## 0. Summary` table and, for each batch, the sheet's `## Intent` line (`Depends on`)
   and `## Anchors` table (`grep -n`, nothing else of the sheet). A sheet titled `… — done (<date>)` is skipped and said.
3. **Dependencies.** A batch whose `Depends on` names a batch that is not done waits for it; you merge
   each `VALID` batch into the work branch as it returns (§ 3), so a dependency done but not merged
   (`git branch --merged HEAD`) is one whose merge failed: say which, stop that batch, go on. Before launching F<m>
   whose dependency F<n> was just merged: one `Agent` call, `subagent_type: "adversarial-reviewer"`, `model: "sonnet"`,
   prompt `mode: next-batch <sheet F<m>> <delivered sheet F<n>>`; a `Blocking` question stops F<m> and goes to the
   user, each `Major` becomes a line `stale: <question, proposed delivered value>` ending F<m>'s prompt (§ 2).
4. **Parallelism.** Two batches run at once only when their `## Anchors` paths (columns 2 to 4) are disjoint and
   neither names the other under `Depends on`. The limit is `HARNESS_DEV_BATCHES_MAX` (`printf '%s' "${HARNESS_DEV_BATCHES_MAX:-4}"`):
   the first batches that may run fill it, the others queue in the plan's order.
5. Resolve once: `<main>` = `git rev-parse --show-toplevel`; `<harness>` = `<main>/.claude`; the
   absolute paths of the plan and of each sheet (the work folder, D69: the one the start line names).
6. **Before the first launch, one block**: `bash <harness>/skills/dev-batches/scripts/preflight.sh <harness>`, printed as
   it is — identity, branch, `rtk hook claude`, `gh`, space. A `FAIL` stops the run: the branch you create (D71); the
   identity and the hook are handed over (source-space rule); a `warn` is said, then the run goes on.
7. Two lines before the first launch: `→ Batches: F2 F3 now, F4 after F2` and the user's safe gestures, as
   `closing.md` § 8 words them (`/btw` for a question; never Esc, Ctrl+C or a message mid-turn) — then launch.

## 2. Launch

For each batch of the wave, one `Agent` call: `subagent_type: "dev-batch"`, `run_in_background:
true`, `name: "batch-F<n>"`, `description: "batch F<n>"`, `model: <m>` when `printf '%s' "${HARNESS_DEV_BATCH_MODEL:-}"`
prints one (`sonnet`, `opus`; empty: the charter's `opus`; its roles keep theirs, `dev-auditor` opus), and this prompt:

```text
batch: F<n> — plan: <absolute path of <CODE>-PLAN.md> — sheet: <absolute path of <CODE>-PLAN-F<n>.md>
harness: <harness>
commands and layout: the `Commands` and `Layout` lines of the plan's `## 1. Scope`; each key absent there (`test_project`), `<harness>/harness/packs/repo-*/references/repo.yaml`
```

The agent's worktree is created by the harness (`WorktreeCreate` hook: `.claude/worktrees/<name>`
from your `HEAD`, the shared folders linked; an `rtk hook claude` of the user's settings stopped it at § 1.6). Then wait: no other work in this
context, no reading of the agents' files. When a batch returns, write (§ 3) and launch the next one the limit allows (a dependant: § 1.3 first).

## 3. When a batch returns — you write the backlog

From the report alone (`## Batch F<n>`, `## Audit`, `### Tests`), in one message of edits:

- the sheet: every step's `TDD:` line as the `Ticks` line says — never a tick the report does not evidence —, the
  `Build and tests` body line `Done (<date>) — <command> — exit 0, <scope>`, the `Hn` rows under `## Assumptions`, the
  deviations under `## Decisions`, the title ` — done (<date>)` for `VALID`; the global plan's `### Batch F<n>` line and step boxes likewise;
- the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`, as `dev-verify` § 4 shapes it, from the
  `## Audit` blocks (one section per round), plus one line after `Not run:` from the `Notes` of `## DONE` — `Measure: duration
  <hh:mm>, turns <n>, subagents <n>[, context >=<N>k]` (plan E: `/token-usage --agent <id>` adds the tokens);
- then, for `VALID`, merge it into the work branch and remove its worktree in the background (`closing.md`
  § 7.1 and § 7.5, D79), and relay one block, short cells: `### F<n> — VALID | GAPS — commit <hash>, merged, worktree removed | not merged (<why>)`,
  the files, the `Hn`, the validations, the `Measure` line, the test recap table as returned.

A `## BLOCKED` report: when it carries `## Audit` tables (GAPS after two rounds), write the verdict file first, one dated section per round with
its `## Verdict — GAPS` rows (`/dev-learn` reads them); then relay its `Reason`, `Missing`, `Next` and the worktree, tick nothing, and carry the
question to the user. A relaunched batch re-reads its context from scratch (~35 k tokens and the sheet; its work comes back from its checkpoints):
a design question that reaches here is a spec or plan hole — write it and its answer under `## Open questions` of the spec before relaunching.
A batch stopped (`killed`, or a `SendMessage` refused as stopped by the user): the resume of `closing.md` § 8, from its checkpoints, a new agent only on the user's explicit yes.
`GAPS`: the sheet records what was done; the correction is the batch relaunched with a `resume:` line and the gaps (its worktree has no `.claude/`: no session there has the harness), or, its branch merged by the user, `/dev-implement F<n> — correction: <gap>` from the main checkout.

## 4. Close

When no batch is running or queued: the table `| Batch | Verdict | Commit | Merged | Worktree |`,
then, as `dev-implement/references/closing.md` § 7 says (D79): the work branch pushed once, its one pull
request — `gh auth status -h github.com` first, a `PR.md` from `dev-implement/references/pr-template.md`, one
question (`HARNESS_PR_AUTO=1`: none), `gh pr create --base <default branch> --head <work branch>`, the base from
`git symbolic-ref --short refs/remotes/origin/HEAD` —, and the script that deletes the batch branches an older
harness pushed, handed over. The merge of the pull request is the user's. Then
`python3 <harness>/skills/dev-learn/scripts/learn-candidates.py --count`, its non-empty line printed as it is;
no merged worktree is left (`--space` lists none), an unmerged one is named with its reason. Stop.
