---
name: ws-image
description: "Builds the orkeon-workshop image locally on the pinned Orkeon commit, in a forked subagent, and after a push follows the checks, image and docs workflows to their end. Reports what was built, on which commit."
argument-hint: "[build | build pinned | follow]"
disable-model-invocation: true
context: fork
agent: ws-runner
---

# /ws-image — build the image, follow the workflows

You run in a forked subagent (`ws-runner`): the build log stays here, the caller gets the report
alone. The rule is `CLAUDE.md` § "The image is rebuilt and validated on the latest Orkeon `main`",
steps 3 and 4; the command is `commands.image` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`.

Arguments: $ARGUMENTS (none: `build`)

## 1. Build

1. Resolve `git ls-remote https://github.com/Orkeon/orkeon.git refs/heads/main` against
   `ORKEON_COMMIT`. Behind: say so — a build on the pin does not validate the change — name
   `/ws-migrate`, and stop; `build pinned` is the user's way of asking for the build on the pin all the
   same, and the report says the image was built on another commit than the latest `main`.
2. No Docker: say that the image cannot be built here, name `/ws-check` (the three checks on a local
   build of the same Orkeon commit), and stop.
3. Run `commands.image` detached, the exit code written at the end of its log:
   `nohup bash -c '<command>; echo "exit=$?"' > "${TMPDIR:-/tmp}/ws-image-build.log" 2>&1 & echo $!`
   — the build is long and its log longer. Wait in slices of at most nine minutes
   (`timeout 540 tail --pid=<pid> -f /dev/null`), reading the last lines of the log between two
   slices. Then report the `exit=` line, the duration, the image id
   (`docker image inspect orkeon-workshop --format '{{.Id}}'`), and on failure the failing step with
   its first error lines. Green means the build's own checks passed too: the templates' self-check,
   the bench tests, the evals in strict mode.

## 2. Follow, after a push

After a green build the main session commits and pushes (D71: the files the change touched, the
repository's commit shape, `git push -u origin <branch>`; this skill runs read-only in `ws-runner`
and only reports); a tag is the user's, given as an exact line (D47). Once pushed: `gh run list` for the
commit, then for each of `checks`, `image` and `docs` the push started (their path filters decide,
`CLAUDE.md`), `gh run watch <id>` to its end, output to a log, and `gh run view <id> --log-failed`
when red. A green image does not say `checks` is green.

## 3. Report

What was built, on which Orkeon commit, the result, the log's path; per workflow its run id and
conclusion. Said plainly when the image was not built, or built on another commit than the latest
`main`.
