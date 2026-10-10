---
name: contrib-validate
description: "Validates a proposed fix: builds Orkeon from the pull request's branch (or main, once merged) with orkeon-update --source, reruns the recorded reproduction, records fixed or not fixed; the gh pr comment command is handed over."
argument-hint: "<pr number> [<slug>] | main [<slug>]"
disable-model-invocation: true
---

# /contrib-validate — a fix tried on the reproduction that showed the failure

A pull request claims to fix what `/contrib-issue` recorded. You build the CLI from its branch, rerun
the same reproduction, and write down what happened. Nothing is posted: the user comments on the pull
request (D47). Details, refusals and the comment's shape: `references/validate.md`.

Arguments: $ARGUMENTS

## 1. The pull request and the record

1. A workshop with `orkeon-update` on the PATH; otherwise stop: the build of a branch is what that
   command does.
2. The slug: the argument, or the only `contrib/<slug>/RECORD.md` without a `validated` entry; several,
   ask which one (AskUserQuestion, one question). No record: stop and name `/contrib-issue`.
3. The repository: `origin` of `.claude/harness/packs/repo-*/references/repo.yaml`, else
   `Orkeon/orkeon`. Read the pull request (`main` given instead: § 1.5):

   ```bash
   gh pr view <n> --repo <owner>/<repo> --json number,title,state,url,headRefName,headRefOid,isCrossRepository,headRepository,headRepositoryOwner
   ```

4. Refuse, record a dated `refused PR #<n>` entry with the reason and stop, when:
   - `isCrossRepository` is true: `orkeon-update --source` fetches branches, tags and commits of
     `Orkeon/orkeon` only, and the branch lives in `<headRepositoryOwner>/<headRepository>`;
   - the state is `CLOSED`, or `MERGED` and the branch is gone: say what the user can ask for instead
     (`references/validate.md` § 2).
5. `main` in place of a number (the fix is merged): no pull request is read or refused; the ref is
   `main`, its commit `git ls-remote https://github.com/<owner>/<repo>.git refs/heads/main`.

## 2. Build the branch

1. Note the version in place: `orkeon --version` and `orkeon-update --check` (to go back later).
2. `orkeon-update --source <headRefName or main>` (a few minutes; it refuses while an `orkeon`
   process runs). A failed build is recorded as `inconclusive: the branch does not build here`, with
   the error lines.
3. `orkeon-update --check`: the `commit` it reports must be `headRefOid` (with `main`, the commit of
   § 1.5). Another commit means the branch moved since it was read: say which commit was built.

## 3. Rerun the reproduction

Run the steps of the first `reproduced` entry of `RECORD.md`, word for word, from the workshop root.
Output to `contrib/<slug>/evidence/<YYYYMMDD-HHMM>-pr<n>.log` (`-main.log`), keys redacted. Verdict:

- `fixed`: the expected behaviour of the record, observed;
- `not fixed`: the actual behaviour of the record, again;
- `inconclusive`: anything else (another error, a model that did not answer) — say what.

Append a dated `validated on PR #<n>` entry (`validated on main` with `main`): commit built, version,
verdict, evidence path.

## 4. Stop — the user comments

With `main` there is no pull request to comment on: skip to the next paragraph. Otherwise write
`contrib/<slug>/PR-<n>-COMMENT.md` (`references/validate.md` § 3) and hand the command over (D47),
typed in the terminal of the container after `/exit`:

```bash
gh pr comment <n> --repo <owner>/<repo> --body-file contrib/<slug>/PR-<n>-COMMENT.md
```

Say how to return to the version noted in § 2.1 (`orkeon-update --source`, or `--channel release`):
Claude runs it when asked.

## 5. Report

A summary of actions and results: pull request, commit built, verdict, files written, the command
handed over.
