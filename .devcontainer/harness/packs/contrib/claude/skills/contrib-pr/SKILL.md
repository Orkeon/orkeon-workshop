---
name: contrib-pr
description: "Prepares a pull request from a source checkout: walks the repository's contribution checklist, runs its build and test commands, writes todo/pr-<slug>/PR.md; commit, push and gh pr create are handed over."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /contrib-pr — a change made ready for review

The change is written; you check it against what the repository asks of a pull request, run its
build and tests, and write the body of the pull request. Nothing is committed, pushed or opened: those
commands are the user's (D47). How each checklist line is checked: `references/checklist.md`.

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
4. The branch: `git branch --show-current`. On the default branch, stop and hand over the line that
   moves the work to a branch shaped like `contrib.branch` (`git switch -c fix/<slug>`, run by the
   user). The slug: the argument, else the branch name without its prefix.

## 2. Run the build and the tests

Delegate to one general-purpose subagent, so the output stays out of this conversation: it runs
`commands.build`, then `commands.test`, from the repository root, logs to
`todo/pr-<slug>/logs/{build,test}.log`, and returns for each the exit code, the duration and at most
20 lines (the errors, the failed tests, the totals). Do not run them twice.

## 3. Walk the checklist

One verdict per line of `contrib.checklist`: `met`, `not met`, `not applicable` or `to confirm` (only
the user can say), with its evidence — a command and its result, a file and line. The
mechanical checks of `references/checklist.md` are run, not guessed. A line `not met` is not fixed
here: name it; the user decides whether to fix it first.

## 4. Write the body

`todo/pr-<slug>/PR.md`, shaped on `contrib.pr_template` (its headings, in order, its comments
removed): what changes and why, in two sentences, the issue it fixes when there is one; the checklist
with `[x]` only for `met` and `not applicable` lines (the latter saying why); the notes for the
reviewer — what is `to confirm`, what is left out.

## 5. Stop — the user commits, pushes and opens it

Show the verdicts as a table and the path of `PR.md`. Four commands are one script (the source-space
rule): write `.claude/local/scripts/pr-<slug>.sh`, files and message filled in, check it with `bash -n`:

```bash
#!/bin/bash
set -euo pipefail
git add <files>
git diff --cached --quiet || git commit -m "<contrib.commit shape, e.g. fix(scope): summary>"
git push -u origin <branch>
gh pr view <branch> --repo <owner>/<repo> >/dev/null 2>&1 || gh pr create --repo <owner>/<repo> --base <default branch> --head <fork owner>:<branch> --title "<title>" --body-file todo/pr-<slug>/PR.md
```

`origin` is the user's fork when they contribute from one (`git remote -v` says which). Hand it over,
typed in Claude Code with `!` in front or in a terminal of the container, at the root of the checkout:

```bash
bash .claude/local/scripts/pr-<slug>.sh
```

When it worked, the last line is the URL of the pull request.

## 6. Report

A summary of actions and results: build and tests (exit, duration), each checklist verdict, the file
written, the commands handed over.
