---
name: ws-image
description: "Builds the orkeon-workshop image locally on the pinned Orkeon commit, and after a push follows the checks, image and docs workflows to their end. Reports what was built, on which commit."
argument-hint: "[build | follow]"
disable-model-invocation: true
---

# /ws-image — build the image, follow the workflows

The rule is `CLAUDE.md` § "The image is rebuilt and validated on the latest Orkeon `main`", steps 3
and 4; the command is `commands.image` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`.

Arguments: $ARGUMENTS (none: `build`)

## 1. Build

1. Resolve `git ls-remote https://github.com/Orkeon/orkeon.git refs/heads/main` against
   `ORKEON_COMMIT`. Behind: say so — a build on the pin does not validate the change — and propose
   `/ws-migrate`; build anyway only when the user asks.
2. No Docker: say that the image cannot be built here, propose `/ws-check` (the three checks on a
   local build of the same Orkeon commit), and stop.
3. Run `commands.image` in a `general-purpose` subagent (a `description`, an explicit `model`), in the
   background: the build is long and its log longer. Its report: exit code, duration, the image id,
   and on failure the failing step with its first error lines. Green means the build's own checks
   passed too: the templates' self-check, the bench tests, the evals in strict mode.

## 2. Follow, after a push

The user pushes and tags; give the exact commands, never run them. Once pushed: `gh run list` for the
commit, then for each of `checks`, `image` and `docs` the push started (their path filters decide,
`CLAUDE.md`), `gh run watch <id>` to its end and `gh run view <id> --log-failed` when red. A green
image does not say `checks` is green.

## 3. Report

What was built, on which Orkeon commit, the result; per workflow its run id and conclusion. Said
plainly when the image was not built, or built on another commit than the latest main.
