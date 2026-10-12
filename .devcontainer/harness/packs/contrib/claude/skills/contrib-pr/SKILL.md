---
name: contrib-pr
description: "Prepares a pull request from a source checkout: walks the repository's contribution checklist, runs its build and tests, writes <work>/pr-<slug>/PR.md, commits, pushes and opens the pull request after asking (HARNESS_PR_AUTO=1 skips the question)."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /contrib-pr — a change made ready for review

The change is written; you check it against what the repository asks of a pull request, run its
build and tests, write the body of the pull request, commit and push, then open the pull request
after asking the user once (D71). How each checklist line is checked: `references/checklist.md`.

Arguments: $ARGUMENTS

## 1. The checkout and its values

1. A source space: `git rev-parse --show-toplevel` is the current folder and there is no `teams/`.
   In a workshop, stop: a pull request is prepared in the repository's checkout.
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `contrib.branch`, `contrib.commit`,
   `contrib.checklist`, `contrib.pr_template`, `commands.build`, `commands.test`,
   `commands.docs_checks`. A key that is missing (or no file at all): ask the user for that value
   once, and say which key of a repository pack would have given it.
3. The base: `origin/<default branch>` (`git symbolic-ref refs/remotes/origin/HEAD`); the change: `git
   status --short` and `git diff --stat <base>...` plus the untracked files. Nothing changed: stop.
4. The branch: `git branch --show-current`. On the default branch, move the work to a branch shaped
   like `contrib.branch` yourself (`git switch -c fix/<slug>`, the first prefix of the pattern; say
   so). The slug: the argument, else the branch name without its prefix.

## 2. Run the build and the tests

Delegate to one general-purpose subagent, so the output stays out of this conversation: it runs
`commands.restore` when the pack has one (the build carries `--no-restore` since 2026-10-12), then
`commands.build`, then `commands.test`, from the repository root, logs to
`<work>/pr-<slug>/logs/{restore,build,test}.log`, and returns for each the exit code, the duration and at
most 20 lines (the errors, the failed tests, the totals). Do not run them twice.

## 3. Walk the checklist

One verdict per line of `contrib.checklist`: `met`, `not met`, `not applicable` or `to confirm` (only
the user can say), with its evidence — a command and its result, a file and line. The
mechanical checks of `references/checklist.md` are run, not guessed. A line `not met` is not fixed
here: name it; the user decides whether to fix it first.

## 4. Write the body

`<work>/pr-<slug>/PR.md`, shaped on `contrib.pr_template` (its headings, in order, its comments
removed): what changes and why, in two sentences, the issue it fixes when there is one; the checklist
with `[x]` only for `met` and `not applicable` lines (the latter saying why); the notes for the
reviewer — what is `to confirm`, what is left out.

## 5. Commit, push, then the pull request — asked first (D71)

Show the verdicts as a table and the path of `PR.md`. A line `not met` stops here: the user decides.
Otherwise follow `references/commit-and-pr.md`, in its order: the identity git already has (`git var GIT_AUTHOR_IDENT`; none:
stop before the commit and hand `workshop --git-identity` or the two `git config --global` lines over), `gh auth status` before the pull request, `git add` of the files of
§ 1 and the commit in the `contrib.commit` shape, `git push -u origin <branch>`, then the pull request
— shown first, and the user **asked once** whether to open it, unless `HARNESS_PR_AUTO=1` opens it
without asking. With `HARNESS_GUARD_GIT=1` the four commands become the script
`.claude/local/scripts/pr-<slug>.sh`, handed over as before.

## 6. Report

A summary of actions and results: build and tests (exit, duration), each checklist verdict, the file
written, the commit (short hash, branch), the push, and the pull request — its URL, or that it was
not opened and why.
