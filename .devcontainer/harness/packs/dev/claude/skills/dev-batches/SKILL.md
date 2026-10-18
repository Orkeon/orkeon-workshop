---
name: dev-batches
description: Runs several batches of a validated plan, each in a dev-batch agent in its own worktree - at most HARNESS_DEV_BATCHES_MAX at a time - and writes their sheets and verdicts from the agents' reports. The main context orchestrates and never carries a batch.
argument-hint: "F<n> [F<m>...] [<work>/<code>/<CODE>-PLAN.md]"
disable-model-invocation: true
---

# /dev-batches — the batches of a plan, one agent each

D70. `/dev-implement` is the procedure of one batch; here it runs in `dev-batch` agents (never a generic one, D75), in
the background, one worktree each, and you orchestrate: you launch, you wait, you write the backlog from what comes back.
You read no code, delegate no RED or GREEN, and never print a batch's closing line (`→ Batch F<n> complete …`, `dev-batch-guard`).

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
   neither names the other under `Depends on`. The limit is `HARNESS_DEV_BATCHES_MAX` (`printf '%s' "${HARNESS_DEV_BATCHES_MAX:-2}"`):
   the first batches that may run fill it, the others queue in the plan's order (two by default, D81: their long
   builds pass one at a time under the build lock, `contracts.md` "Builds and the restore").
5. Resolve once: `<main>` = `git rev-parse --show-toplevel`; `<harness>` = `<main>/.claude`; the absolute paths of the
   plan, of each sheet (the work folder, D69) and of `<state>`, `<work>/<code>/<CODE>-BATCHES-STATE.md`.
6. **Before the first launch, one block**: `bash <harness>/skills/dev-batches/scripts/preflight.sh <harness>`, printed as
   it is (identity, branch, `rtk hook claude`, `gh`, space, memory, mount, worktrees, host). A `FAIL` stops the run: the
   branch you create (D71); the identity and the hook are handed over (source-space rule); a `warn` is said.
7. Two lines before the first launch: `→ Batches: F2 F3 now, F4 after F2`, then `/autocompact 250k` for the user to type
   (D84: you cannot), the safe gestures of `closing.md` § 8, the host kept awake, and for a long run the supervisor of
   `closing.md` § 9, with `printf '%s' "${HARNESS_AUTO_RESUME:-0}"` (`1`: a restart resumes by itself, D82) — then launch.

## 2. Launch

For each batch of the wave, one `Agent` call: `subagent_type: "dev-batch"`, `isolation: "worktree"`, `run_in_background:
true`, `description: "batch F<n>"` — **never a `name`**, which makes an in-process teammate without a worktree (GAP-50-55) —,
`model: <m>` when `printf '%s' "${HARNESS_DEV_BATCH_MODEL:-}"` prints one (the dev pack: `sonnet`, the trial of 2026-10-14 —
a batch whose verdict or rounds degrade goes back to `opus`; empty: the charter's `opus`; `dev-auditor` stays opus), and this prompt:

```text
batch: F<n> — plan: <absolute path of <CODE>-PLAN.md> — sheet: <absolute path of <CODE>-PLAN-F<n>.md>
harness: <harness>
commands and layout: the `Commands` and `Layout` lines of the plan's `## 1. Scope`; each key absent there (`test_project`), `<harness>/harness/packs/repo-*/references/repo.yaml`
```

The agent's worktree is created by the harness (`WorktreeCreate` hook: `.claude/worktrees/<name>`, or under `HARNESS_WORKTREE_ROOT` (D85), from your `HEAD`, the shared
folders linked). Then wait: no other work here, no reading of the agents' files. When a batch returns, write (§ 3) and launch
the next one the limit allows (a dependant: § 1.3 first).

**The state, as it happens**: each launch, relay or merge appends its line to `<state>` in the same message (`launched`,
`relaunched`, `returned <verdict>`, `merged <hash>`, `stopped`, `stall …`, `closed`), as `closing.md` § 9 "The log" writes it.

## 3. When a batch returns — you write the backlog

From the report alone (`## Batch F<n>`, `## Audit`, `### Tests`), in one message of edits:

- the sheet: every step's `TDD:` line as the `Ticks` line says — never a tick the report does not evidence —, the
  `Build and tests` body line `Done (<date>) — <command> — exit 0, <scope>`, the `Hn` rows under `## Assumptions`, the
  deviations under `## Decisions`, the title ` — done (<date>)` for `VALID`; the global plan's `### Batch F<n>` line and step boxes likewise;
- the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`, as `dev-verify` § 4 shapes it, from the
  `## Audit` blocks (one section per round), plus one line after `Not run:` from the `Notes` of `## DONE` — `Measure: duration
  <hh:mm>, turns <n>, subagents <n>[, context >=<N>k][, stalls <HH:MM> <n>m ...]` (plan E: `/token-usage --agent <id>` adds the tokens);
- then, for `VALID`, merge it into the work branch and remove its worktree in the background (`closing.md`
  § 7.1 and § 7.5, D79), and relay one block, short cells: `### F<n> — VALID | GAPS — commit <hash>, merged, worktree removed | not merged (<why>)`,
  the files, the `Hn`, the validations, the `Measure` line, the test recap table as returned.

A `## BLOCKED`, `GAPS` or stopped batch: `closing.md` § 7.6 — the verdict file first, the question carried to the user,
the resume from its checkpoints (`HARNESS_AUTO_RESUME=1`: without asking, D82), three audit rounds at most.

## 4. Close

When no batch is running or queued: the table `| Batch | Verdict | Commit | Merged | Worktree |`,
then, as `dev-implement/references/closing.md` § 7 says (D79): the work branch pushed once, its one pull request —
`gh auth status -h github.com` first, a `PR.md` from `pr-template.md`, one question (`HARNESS_PR_AUTO=1`: none),
`gh pr create --base <default branch> --head <work branch>`, the base from `git symbolic-ref --short refs/remotes/origin/HEAD` —,
and the script deleting the batch branches an older harness pushed, handed over. The merge of the pull request is the user's. Then
`python3 <harness>/skills/dev-learn/scripts/learn-candidates.py --count`, its non-empty line printed as it is;
no merged worktree is left (`--space` lists none), an unmerged one is named with its reason; `closed` logged. Stop.
