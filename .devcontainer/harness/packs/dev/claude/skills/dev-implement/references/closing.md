# Closing a batch

Read after the whole suites are green (`/dev-implement` § 3), never before.

## 0. In a `dev-batch` agent (D70)

Launched by `/dev-batches`, you run in a worktree and the main checkout is read-only to you: § 1
and § 2's verdict file are **returned, not written** - the ticks with their evidence, the
assumptions, the deviations and the audit block go in your report, as your charter shapes it, and
the orchestrator writes the sheet, the plan and the verdict file. The audit gate reads the ticks of
the sheet, which you cannot tick: copy it to `${TMPDIR:-/tmp}/dev-sheet-F<n>/<CODE>-PLAN-F<n>.md`, tick
the copy as § 2 says (never a tick the evidence does not allow), and run `audit-capture.sh` on the copy with
`--plan-dir <work>/<code>` (the plan's folder: the non-applicable rules and the known ids are read there); the
two audit prompts name the copy as the sheet. § 4 applies as written, in your
worktree, except its point 5: the pull request stays with `/dev-batches`, which asks once for every
batch branch. § 5 does not apply (the orchestrator runs it once). § 6 does not apply: never print the
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
capture script (with `--build-log` and `--test-log` on the files § 3 wrote: no new build of the
solution, B3), the two delegations — `dev-auditor-conformance`, then `dev-auditor` with its table
(D72) —, the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`.

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

1. **The identity git already has**: `git var GIT_AUTHOR_IDENT >/dev/null 2>&1; echo "exit=$?"` — git
   reads it from `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` as well as from its configuration, whose
   `user.name` stays empty when the container got it through `workshop --git-identity`.
   A non-zero exit → stop before any commit, say so, and hand the choice over (the source-space rule's
   shape), never an identity of your own: for the container, `/exit` then
   `workshop --git-identity "<name>" <email>`; for the configuration:

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
   update) is said with git's line, the commit kept local; nothing is forced. Say the short hash and
   the branch.
5. **The pull request** (D71), when the current branch is not the default branch and is pushed — in
   a `dev-batch` agent, § 0: not here. `gh auth status -h github.com` first: a non-zero exit is said,
   the branch stays pushed, and `gh auth login` (interactive: after `/exit`, in the terminal of the
   container) is handed over with the `gh pr create` line below for later. Authenticated:
   `gh pr view <branch>` finds one → say its URL. Else write `<work>/pr-<code>-F<n>/PR.md` from
   `references/pr-template.md` — filled from the § 3 summary, never from the diff —, show its path,
   the title and the base, and ask once whether to open it (`HARNESS_PR_AUTO=1`: do not ask). On a
   yes, or under the switch, `<default branch>` being
   `git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##'` (unset:
   `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`):

   ```bash
   gh pr create --base <default branch> --head <branch> --title "<commit subject>" --body-file <work>/pr-<code>-F<n>/PR.md
   ```

   The last line is the URL. On a no, the branch stays pushed and the line above is given for later.

With `HARNESS_GUARD_GIT=1` the dispatcher refuses every git command that changes something: write the
commands of points 2 to 5 as one script `.claude/local/scripts/commit-F<n>.sh` (`set -euo pipefail`,
`bash -n`) and hand it over instead, the `gh pr create` included.

## 5. The `/dev-learn` reminder

Run `python3 .claude/skills/dev-learn/scripts/learn-candidates.py --count`. A non-empty line is printed
as it is, just before the closing line. Never launch `/dev-learn` yourself.

## 6. The closing line

`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`

With the real batch number, exactly once, and only after a `VALID` verdict: `dev-batch-guard` reads this
line to refuse a second batch in the same session.
