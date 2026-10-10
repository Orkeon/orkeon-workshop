# Closing a batch

Read after the whole suites are green (`/dev-implement` § 3), never before.

## 1. The sheet, first

In one message, `grep -n` the lines to change in the global plan and the sheet, then one `Edit` per file:

- every behaviour step reads `TDD: RED [x] GREEN [x] COST [x]` — none left open;
- the `Build and tests` step gets a body line `Done (<YYYY-MM-DD>) — <command> — exit 0, <scope>`;
- the sheet title gets ` — done (<YYYY-MM-DD>)`; in the global plan, `### Batch F<n> — <Name> — open`
  becomes `— done (<YYYY-MM-DD>)` and its step boxes `- [x]`;
- assumptions settled mid-batch are rows of `## Assumptions` (`Hn`); a confirmed one moves to
  `## Decisions`; a deviation from the sheet (an extra file, another decision) is written there too;
- a correction that changes a `BR-nn` or `UC-nn` updates the spec as well.

## 2. The audit

Read `.claude/skills/dev-verify/SKILL.md` and run its §§ 1 to 4 for `F<n>` in fast mode: the gate and
capture script, the `dev-auditor` delegation, the verdict file `todo/<code>/<CODE>-VERIFY-F<n>.md`.

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

## 4. The commit, handed over

Claude Code never commits, pushes or branches. Two commands are one script (the source-space rule):
write `.claude/local/scripts/commit-F<n>.sh` from the files the batch touched (`git status --short`
restricted to the source and test roots — `todo/` is excluded from git), check it with `bash -n`:

```bash
#!/bin/bash
set -euo pipefail
git add <path> <path> …
git diff --cached --quiet || git commit -m "<message>"
```

Hand it over, typed in Claude Code with `!` in front or in a terminal of the container:

```bash
bash .claude/local/scripts/commit-F<n>.sh
```

When it worked, git prints the new commit's short hash and its message.

The message follows `contrib.commit` of `repo.yaml` when present (for instance `type(scope): summary`),
else the shape of `git log --oneline -5`. When the current branch is the default branch and `repo.yaml`
names a branch pattern (`contrib.branch`), say so before the script: the user creates the branch first.

## 5. The `/dev-learn` reminder

Run `python3 .claude/skills/dev-learn/scripts/learn-candidates.py --count`. A non-empty line is printed
as it is, just before the closing line. Never launch `/dev-learn` yourself.

## 6. The closing line

`→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`

With the real batch number, exactly once, and only after a `VALID` verdict: `dev-batch-guard` reads this
line to refuse a second batch in the same session.
