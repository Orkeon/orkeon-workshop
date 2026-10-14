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
two audit prompts name the copy as the sheet. § 4 applies in your worktree up to its point 3, the
commit; points 4 and 5 do not (D79): a batch branch is local, never pushed, and the
pull request stays with `/dev-batches`, which merges a `VALID` batch into the work branch and pushes
that branch once, with its one pull request (§ 7). § 5
does not apply (the orchestrator runs it once). § 6 does not apply: never print the closing line;
your report is your last message.

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
solution, B3; its capture carries the mechanical table, D80), the delegation to `dev-auditor`, which
judges from that table (D72), the verdict file `<work>/<code>/<CODE>-VERIFY-F<n>.md`.

- `VALID`: go on to § 3. Minor findings are carried over as they are, for the user to decide.
- `GAPS`: fix through the agents (a correction cycle per gap, RED first when a behaviour is wrong), re-run
  what the fix reaches — `commands.build` of the solution to `dev-F<n>-build.txt`, then `commands.test_project` on
  the test projects `affected-tests.py --base <base>` prints, to `dev-F<n>-test-affected.txt` (overwritten: the
  `--test-log` of the next gate), never the whole suite again (`contracts.md`, "The whole suite once per
  batch") —, then the audit again in `resume` mode with the previous gap table. Two rounds still in
  `GAPS` → stop and hand the blocking gaps to the user, every round's table with them (in a `dev-batch`
  agent, in the report: the verdict file is written from it); work around neither the plan nor the audit.

## 3. Summary

No diff re-read: the auditor walked it. In a few lines, short cells:

- files created and changed, per layer;
- the access cost per behaviour, from the `Cost` notes;
- the `Hn` assumptions; what was reported without being fixed (`path:line`);
- the validations: `<command> — exit N, scope <filter or whole suite>, <n> tests`, and `Not run: <suite> —
  <reason>`;
- the verdict, and its minors;
- the test recap: one table per test class, `| Test | Ids | Case covered |`, assembled from the RED
  tables relayed during the batch — never rebuilt from the diff.

## 4. The commit

The batch is committed by you (D71), after a `VALID` verdict only, in this order — pushed when you run
inline; in a `dev-batch` agent points 4 and 5 do not apply (§ 0, D79):

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
`bash -n`) and hand it over instead, the `gh pr create` included. With batches (`/dev-batches`) the
switch refuses the agents' checkpoints too: a `dev-batch` agent commits nothing and leaves its batch
uncommitted in its worktree, its report naming the commit (point 3, `git -C <worktree>`); the
orchestrator writes the commits, the merges of § 7.1 and the push of § 7.2 as one script
`.claude/local/scripts/merge-<code>.sh` and hands it over (the `wip` commit of a stopped batch, § 8,
goes the same way).

## 5. The `/dev-learn` reminder

Run `python3 .claude/skills/dev-learn/scripts/learn-candidates.py --count`. A non-empty line is printed
as it is, just before the closing line. Never launch `/dev-learn` yourself.

## 6. The closing line

`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`

With the real batch number, exactly once, and only after a `VALID` verdict: `dev-batch-guard` reads this
line to refuse a second batch in the same session.

## 7. Several batches — the merge, the push and the pull request (`/dev-batches`, D79)

Read by `/dev-batches`. A batch branch (`<prefix>/agent-<id>`, its worktree's) is local: the agent
commits there and never pushes. The work branch is the one the main checkout is on.

1. **The merge, per batch**: once the backlog of a `VALID` batch is written (`/dev-batches` § 3),
   `git merge --ff-only <commit>` in the main checkout, said in one line (`→ F<n> merged into
   <work branch> (fast-forward)`). Not a fast-forward — another batch merged first —:
   `git -C <worktree> rebase <work branch>` (the branch was never pushed: the rewrite touches nothing
   anyone has), then `--ff-only` again; a conflict: `git -C <worktree> rebase --abort`, said, and the
   merge handed over. A `GAPS` or `## BLOCKED` batch is never merged. This merge is the orchestrator's;
   the merge of the pull request stays the user's (D71).
2. **The push, once**: at the close, `git push -u origin <work branch>` — the only branch the run
   pushes. Refused: said with git's line, the commits kept local, nothing forced.
3. **One pull request**, of the work branch, as § 4 point 5 says: `gh auth status -h github.com`
   first; `gh pr view <work branch>`, else `<work>/pr-<code>/PR.md` from `pr-template.md`, its sections
   filled from the batch blocks relayed during the run (one `F<n>` subsection each), one question
   (`HARNESS_PR_AUTO=1`: none), then `gh pr create --base <default branch> --head <work branch>
   --title "<one sentence for the whole plan>" --body-file <work>/pr-<code>/PR.md`.
4. **Batch branches an older harness pushed** (`git branch -r --merged <work branch>` lists an
   `origin/<prefix>/agent-*`): deleting a remote branch is the user's. Write
   `.claude/local/scripts/delete-batch-branches-<code>.sh` (`set -euo pipefail`; for each branch,
   `git ls-remote --exit-code --heads origin <branch> >/dev/null && git push origin --delete <branch>`,
   so that a second run does nothing), check it with `bash -n`, and hand it over as `bash <path>`, never run.
5. **The worktree, once merged** (2026-10-14, GAP-43-44: a built worktree holds 25 to 30 GB; the disk fell
   to 72 GB free before four were removed, 9.4 minutes on the 9p mount): right after the merge of point 1,
   `bash <harness>/scripts/worktree-create.sh --remove <worktree> --background` — the checks at once (it
   refuses a worktree with uncommitted work or a branch no other branch holds), the deletion detached,
   its log `<harness>/local/worktrees/<name>.remove.txt` ending with `exit=<n>`; nothing is lost, the
   commits are in the work branch. Said in the batch block (`worktree removed`). A refusal is said with
   its line, the worktree kept. At the close, `--space` lists no `merged:` worktree; an `unmerged:` one
   is named with its reason (`GAPS`, `BLOCKED`, a merge handed over).

## 8. While the batches run, and a stopped batch (`/dev-batches`, 2026-10-14)

**What the user can do while the agents run** — said at the launch (`/dev-batches` § 1.7). In GAP-43-44
two batches were marked `killed` seconds after a gesture in the main session: F5 six seconds after a
`/btw` without a question and four before "Request interrupted by user", F6 thirty seconds after a
message. What the documentation of Claude Code says (2.1.299, read 2026-10-14): `/btw` never interrupts
the main turn; a message typed while Claude works is queued, not an interruption; Ctrl+X Ctrl+K stops
every background agent, `x` on a row of `/tasks` one; Ctrl+C stops background agents (changelog
2.1.196); Esc no longer stops them (changelog 2.1.47) — yet open issues report agents killed by Esc
(#76807), by Ctrl+C (#81765, #81056) and by a message sent mid-turn (#78151, still reported on 2.1.296).
The launch says it in one line: `→ While they run: /btw for a question, a message only once this
conversation is idle; never Esc, Ctrl+C or Ctrl+X Ctrl+K — they stop the agents.`

**A stopped batch** (`killed`, or a `SendMessage` refused: "was stopped by the user and was not
resumed"). Its context is lost; its worktree and its checkpoints are not (the `dev-batch` charter,
"Checkpoints"). In this order:
1. While its row is still in `/tasks`, the user can type into its transcript to resume it, its context
   intact: say so first — it costs nothing to rebuild.
2. Otherwise, read what it left: `cat <worktree>/.claude/local/batch-state.txt`,
   `git -C <worktree> log --oneline <base>..HEAD`, `git -C <worktree> status --short` (the agent no
   longer runs: its files are yours to read). Uncommitted work is the step in progress: commit it as
   `checkpoint F<n>: wip, step <k> not green` (`git -C <worktree>`), so that nothing is lost.
3. Ask the user once, with what the state line says: a new agent resumes at that point. **Only on an
   explicit yes** — the refusal's own words ("only start a new agent for it if the user explicitly
   asks"). The prompt of § 2 plus one line: `resume: branch <branch> — state: <the state line>`.
   The new agent replays that branch on its own HEAD (a rebase: another batch may have merged since)
   and goes on from the last green step; the old
   worktree, its branch now held by the new one, is removed in the background (`--remove --background`).

