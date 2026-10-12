# Commit, push and the pull request (D71)

> Reference of `/contrib-pr` § 5. The source-space rule says who runs what; this page is the order of
> the gestures.

1. **The identity git already has**: `git config user.name` and `git config user.email`. One of them
   empty - stop before any commit, say so, and hand the two lines over (the source-space rule's shape),
   never an identity of your own:

   ```bash
   git config --global user.name "<name>"
   git config --global user.email "<email>"
   ```

2. **The commit**: `git add <files>` - the files of the change found in § 1, never the work folder -,
   then `git commit -m "<message>"`, the message after `contrib.commit` (`fix(scope): summary`), in
   English. A new script that starts with `#!` and lacks its mode is added with `git add --chmod=+x`.
3. **The push**: `git push -u origin <branch>`. `origin` is the user's fork when they contribute from
   one (`git remote -v` says which). A push refused is said with git's line, the commit kept local;
   nothing is forced.
4. **The pull request**: when `gh pr view <branch> --repo <owner>/<repo>` finds one, say its URL and
   stop. Otherwise show the title, the base, the head (`<fork owner>:<branch>` from a fork) and the
   path of the body, and **ask the user once** whether to open it - unless `HARNESS_PR_AUTO` is `1`,
   which opens it without asking. On a yes, or under the switch:

   ```bash
   gh pr create --repo <owner>/<repo> --base <default branch> --head <fork owner>:<branch> --title "<title>" --body-file <work>/pr-<slug>/PR.md
   ```

   The last line is the URL of the pull request. On a no, the pull request is not opened; say that the
   branch is pushed and give the `gh pr create` line above for later.

With `HARNESS_GUARD_GIT=1` the dispatcher refuses every git command that changes something: write the
commands as one script `.claude/local/scripts/pr-<slug>.sh` (`set -euo pipefail`, `bash -n`), the
`gh pr create` included, and hand it over instead, typed in Claude Code with `!` in front or in a
terminal of the container, at the root of the checkout.
