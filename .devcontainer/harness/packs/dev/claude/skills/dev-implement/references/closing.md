# Closing a batch

Read after the whole suites are green (`/dev-implement` § 3), never before.

## 0. In a `dev-batch` agent (D70)

Launched by `/dev-batches`, you run in a worktree and the main checkout is read-only to you: § 1
and § 2's verdict file are **returned, not written** - the ticks with their evidence, the
assumptions, the deviations and the audit block go in your report, as your charter shapes it, and
the orchestrator writes the sheet, the plan and the verdict file. § 4 applies as written, in your
worktree. § 5 does not apply (the orchestrator runs it once). § 6 does not apply: never print the
closing line; your report is your last message.

## 1. The sheet, first

In one message, `grep -n` the lines to change in the global plan and the sheet, then one `Edit` per file:

- every behaviour step reads `TDD: RED [x] GREEN [x] COST [x]` — none left open;
- the `Build and tests` step gets a body line `Done (<YYYY-MM-DD>) — <command> — exit 0, <scope>`;
- the sheet title gets ` — done (<YYYY-MM-DD>)`; in the global plan, `### Batch F<n> — <Name> — open`
  becomes `— done (<YYYY-MM-DD>)` and its step boxes `- [x]`;
- assumptions settled mid-batch are rows of `## Assumptions` (`Hn`); a confirmed one moves to
  `## Decisions`; a deviation from the sheet (an extra file, another decision) is written there too;
- a correction that changes a `BR-nn` or `UC-nn` updates the spec as well; one that changes a `CH-nn`,
  the change brief.

## 2. The audit

Read `.claude/skills/dev-verify/SKILL.md` and run its §§ 1 to 4 for `F<n>` in fast mode: the gate and
capture script, the `dev-auditor` delegation, the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`.

- `VALID`: go on to § 3. Minor findings are carried over as they are, for the user to decide.
- `GAPS`: fix through the agents (a correction cycle per gap, RED first when a behaviour is wrong), re-run
  what the fix reaches, then the audit again in `resume` mode with the previous gap table. Two rounds
  still in `GAPS` → stop and hand the blocking gaps to the user; work around neither the plan nor the
  audit.

## 3. Summary

No diff re-read: the auditor walked it. In a few lines, short cells:

- files created and changed, per layer;
- the access cost per behaviour, from the `Cost` notes;
- the `Hn` assumptions; what was reported without being fixed (`path:line`);
- the validations: `<command> — exit N, scope <filter or whole suite>, <n> tests`, and `Not run: <suite> —
  <reason>`;
- the verdict, and its minors;
- the test recap: one table per test class, `| Test | Ids | Case verified |`, assembled from the RED
  tables relayed during the batch — never rebuilt from the diff.

## 4. The commit

The batch is committed and pushed by you (D71), after a `VALID` verdict only, in this order:

1. **The identity git already has**: `git config user.name` and `git config user.email`. One of them
   empty → stop before any commit, say so, and hand the two lines over (the source-space rule's
   shape), never an identity of your own:

   ```bash
   git config --global user.name "<name>"
   git config --global user.email "<email>"
   ```

2. **The branch**: when the current branch is the repository's default branch and `repo.yaml` gives
   `contrib.branch`, create the branch first (`git switch -c <prefix>/<code>-f<n>`, the first prefix of
   the pattern); in a `dev-batch` agent the worktree's branch is already that one.
3. **The commit**: `git add` of the files the batch touched - `git status --short` restricted to the
   source and test roots, never the work folder `<work>/` -, then `git commit -m "<message>"`, the
   message after `contrib.commit` of `repo.yaml` when present (`type(scope): summary`), else the shape
   of `git log --oneline -5`; English.
4. **The push**: `git push -u origin <branch>`. A push refused (no remote, no right, a rejected
   update) is said with git's line, the commit kept local; nothing is forced.

Say the short hash and the branch. No pull request from here: `/dev-batches` offers one per batch
branch, `/contrib-pr` one for a contribution. With `HARNESS_GUARD_GIT=1` the dispatcher refuses every
git command that changes something: write the four commands as one script
`.claude/local/scripts/commit-F<n>.sh` (`set -euo pipefail`, `bash -n`) and hand it over instead.

## 5. The `/dev-learn` reminder

Run `python3 .claude/skills/dev-learn/scripts/learn-candidates.py --count`. A non-empty line is printed
as it is, just before the closing line. Never launch `/dev-learn` yourself.

## 6. The closing line

`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`

With the real batch number, exactly once, and only after a `VALID` verdict: `dev-batch-guard` reads this
line to refuse a second batch in the same session.
