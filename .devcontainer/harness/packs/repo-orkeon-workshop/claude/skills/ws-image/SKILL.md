---
name: ws-image
description: "Builds the orkeon-workshop image locally on the pinned Orkeon release, with the pinned Orkeon Code and Orkeon Studio, in a forked subagent, and after a push follows the checks, image and docs workflows to their end. Reports what was built, on which versions."
argument-hint: "[build | build pinned | follow]"
disable-model-invocation: true
context: fork
agent: ws-runner
---

# /ws-image — build the image, follow the workflows

You run in a forked subagent (`ws-runner`): the build log stays here, the caller gets the report
alone. The rule is `CLAUDE.md` § "The image is built and validated only on the user's explicit
request" (D74): this skill is that request; the command is `commands.image` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`.

Arguments: $ARGUMENTS (none: `build`)

## 1. Build

1. Resolve the releases again: `gh release view -R Orkeon/orkeon --json tagName` (or
   `git ls-remote --tags https://github.com/Orkeon/orkeon.git`) against `ORKEON_VERSION` in
   `.github/workflows/image.yml`, and the tags of Orkeon Code and Orkeon Studio against
   `ORKEON_CODE_VERSION` and `ORKEON_STUDIO_VERSION` (`orkeon_pin` in `repo.yaml`). A pin behind its
   latest release: say so — a build on the pin does not validate the change — name `/ws-migrate`, and
   stop; `build pinned` is the user's way of asking for the build on the pins all the same, and the
   report says the image was built on another version than the latest release.
2. No Docker: say that the image cannot be built here, name `/ws-check` (the three checks on the
   published CLI and the packages of the same Orkeon version), and stop.
3. Run `commands.image` detached, the exit code written at the end of its log:
   `nohup bash -c '<command>; echo "exit=$?"' > "${TMPDIR:-/tmp}/ws-image-build.log" 2>&1 & echo $!`
   — the build is long and its log longer. Wait in slices of at most 270 seconds
   (`timeout 270 tail --pid=<pid> -f /dev/null`; a Bash call ends at 290 s, `BASH_DEFAULT_TIMEOUT_MS`),
   reading the last lines of the log between two slices. Then report the `exit=` line, the duration, the image id
   (`docker image inspect orkeon-workshop --format '{{.Id}}'`), and on failure the failing step with
   its first error lines. Green means the build's own checks passed too: the released Orkeon installed
   and its packages packed from the tag, Orkeon Studio built from its tag, Orkeon Code installed on the
   `orkeon-repl` of the release, the templates' self-check, the bench tests, the evals in strict mode.

The command builds the pinned release: `ORKEON_VERSION`, with `ORKEON_COMMIT` (the commit of its tag)
as `ORKEON_REFRESH`, `ORKEON_CODE_VERSION` and `ORKEON_STUDIO_VERSION`. An unreleased Orkeon is another
build, on the user's request and without moving the pin (`orkeon_pin.unreleased`:
`--build-arg ORKEON_CHANNEL=source --build-arg ORKEON_SOURCE_REF=<ref> --build-arg ORKEON_REPL_VERSION=<a release>`).

## 2. Follow, after a push

After a green build the main session commits and pushes (D71: the files the change touched, the
repository's commit shape, `git push -u origin <branch>`; this skill runs read-only in `ws-runner`
and only reports); a tag is the user's, given as an exact line (D47). Once pushed: `gh run list` for the
commit, then for each of `checks`, `image` and `docs` the push started (their path filters decide,
`CLAUDE.md`), `gh run watch <id>` to its end, output to a log, and `gh run view <id> --log-failed`
when red. A green image does not say `checks` is green.

## 3. Report

What was built — the Orkeon version and the commit of its tag, the Orkeon Code and Orkeon Studio
versions —, the result, the log's path; per workflow its run id and conclusion. Said plainly when the
image was not built, or built on another version than the latest release.
