---
name: dev-batches
description: Runs several batches of a validated plan, each in a dev-batch agent in its own worktree - at most HARNESS_DEV_BATCHES_MAX at a time - and writes their sheets and verdicts from the agents' reports. The main context orchestrates and never carries a batch.
argument-hint: "F<n> [F<m>...] [<work>/<code>/<CODE>-PLAN.md]"
disable-model-invocation: true
---

# /dev-batches — the batches of a plan, one agent each

D70. `/dev-implement` is the procedure of one batch; here it runs in `dev-batch` agents, in the
background, one worktree each, and you orchestrate: you launch, you wait, you write the backlog from
what comes back. You read no code, delegate no RED or GREEN yourself, and never print the closing
line of a batch (`→ Batch F<n> complete …` is `/dev-implement`'s, read by `dev-batch-guard`).

Arguments: $ARGUMENTS

## 1. Entry

1. The batches: every `F<n>` of the argument, in the plan's order. The plan: the path in the argument
   (as text), else `ls <work>/*/*-PLAN.md`, several → ask; none → stop and name `/dev-plan`.
2. Read the global plan's `## 0. Summary` table and, for each batch, the sheet's `## Intent` line
   (`Depends on`) and `## Anchors` table (`grep -n`, nothing else of the sheet). A sheet whose title
   ends with `— done` is skipped and said.
3. **Dependencies.** A batch whose `Depends on` names a batch that is not done waits for it; one
   whose dependency is done but whose branch is not merged into yours (`git branch --merged HEAD`)
   waits for your merge: say which branch, stop that batch, go on with the others.
4. **Parallelism.** Two batches run at once only when their `## Anchors` paths (columns 2 to 4) are
   disjoint and neither names the other under `Depends on`. The limit is `HARNESS_DEV_BATCHES_MAX`
   (`printf '%s' "${HARNESS_DEV_BATCHES_MAX:-4}"`): the first batches that may run fill it, the others
   queue in the plan's order.
5. Resolve once: `<main>` = `git rev-parse --show-toplevel`; `<harness>` = `<main>/.claude`; the
   absolute paths of the plan and of each sheet (the work folder, D69: the one the start line names).
6. One line before the first launch: `→ Batches: F2 F3 now, F4 after F2, F5 waiting for merge of
   <branch>` — then launch.

## 2. Launch

For each batch of the wave, one `Agent` call: `subagent_type: "dev-batch"`, `run_in_background:
true`, `name: "batch-F<n>"`, `description: "batch F<n>"`, and this prompt - nothing more, the charter
reads the skill itself:

```text
batch: F<n> — plan: <absolute path of <CODE>-PLAN.md> — sheet: <absolute path of <CODE>-PLAN-F<n>.md>
harness: <harness>
commands and layout: the `Commands` and `Layout` lines of the plan's `## 1. Scope`, else `<harness>/harness/packs/repo-*/references/repo.yaml`
```

The agent's worktree is created by the harness (`WorktreeCreate` hook: `.claude/worktrees/<name>`
from your `HEAD`, the shared folders linked). An `rtk hook claude` of the user's own `~/.claude/settings.json`
rewrites `git` into `rtk git`, which the worktree isolation refuses: remove it before `/dev-batches` (the
harness's dispatcher runs rtk itself). Then wait: no other work in this context, no reading of
the agents' files. When a batch returns, write (§ 3) and launch the next one the limit allows.

## 3. When a batch returns — you write the backlog

From the report alone (`## Batch F<n>`, `## Audit`, `### Tests`), in one message of edits:

- the sheet: every step's `TDD:` line as the `Ticks` line says — never a tick the report does not
  evidence —, the `Build and tests` body line `Done (<date>) — <command> — exit 0, <scope>`, the
  `Hn` rows under `## Assumptions`, the deviations under `## Decisions`, the title ` — done (<date>)`
  for `VALID`; the global plan's `### Batch F<n>` line and step boxes likewise;
- the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`, as `dev-verify` § 4 shapes it, from the
  `## Audit` block, plus one line after `Not run:` from the `Notes` of `## DONE` — `Measure: duration
  <hh:mm>, turns <n>, subagents <n>[, context >=<N>k]` (plan E: `/token-usage --agent <id>` adds the tokens);
- then relay one block, short cells: `### F<n> — VALID | GAPS — commit <hash> on <branch>, pushed`,
  the files, the `Hn`, the validations, the `Measure` line, the test recap table as returned.

A `## BLOCKED` report: relay its `Reason`, `Missing`, `Next` and the worktree, tick nothing, and
carry the question to the user. A relaunched batch re-reads its context from scratch (~35 k tokens and
the sheet): a design question that reaches here is a spec or plan hole — write it and its answer under
`## Open questions` of the spec before relaunching (`/dev-batches F<n>`, the worktree reused). `GAPS`: the sheet records what was done; the correction is
`/dev-implement F<n> — correction: <gap>` run in that worktree by the user, or the batch again here.

## 4. Close

When no batch is running or queued: the table `| Batch | Verdict | Branch | Commit | Worktree |`,
then the pull requests (D71), as `dev-implement/references/closing.md` § 4 point 5 says, once for all
the branches: `gh auth status -h github.com` first (non-zero: say it, hand `gh auth login` and the lines
over); for each branch with a `VALID` batch, `gh pr view <branch>` or a `PR.md` written from
`dev-implement/references/pr-template.md` out of the batch block; one question for all of them
(`HARNESS_PR_AUTO=1`: none), then per branch `gh pr create --base <default branch> --head <branch>
--title "<commit subject>" --body-file <work>/pr-<code>-F<n>/PR.md`, the base from
`git symbolic-ref --short refs/remotes/origin/HEAD`. The merge is the user's. Then
`python3 <harness>/skills/dev-learn/scripts/learn-candidates.py --count`, its non-empty line
printed as it is; the worktrees stay until the user removes them
(`bash .claude/scripts/worktree-create.sh --remove <worktree>` once merged). Stop.
