---
name: ws-migrate
description: "Compares the latest Orkeon main with ORKEON_COMMIT and, when main moved, lists what changed upstream and every file of the workshop to bring in step. Stops before any edit."
argument-hint: "[<orkeon commit to try instead of main>]"
disable-model-invocation: true
---

# /ws-migrate — is the pin the latest Orkeon main, and what moves with it

The rule is `CLAUDE.md` § "The image is rebuilt and validated on the latest Orkeon `main`", steps 1
and 2; the values are under `orkeon_pin` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill reads and lists. It
edits nothing.

Arguments: $ARGUMENTS

## 1. Resolve

Run `git ls-remote https://github.com/Orkeon/orkeon.git refs/heads/main` (or take the commit given)
and read `ORKEON_COMMIT` in `.github/workflows/image.yml`. Same commit: say "the pin is the latest
main (`<short>`)" and stop.

## 2. Read what changed upstream, in a subagent

A `general-purpose` subagent (a `description`, an explicit `model`) works in a clone of Orkeon (an
existing checkout, or `git clone --filter=blob:none` into the scratchpad) and reports:
`git log --oneline <pinned>..<latest>`, `git diff --stat`, the new `CHANGELOG.md` entries, and which
of them touch what the workshop relies on — CLI options, the tool catalogue, packages, settings keys,
the YAML and TypeScript DSL. It also computes the new version
`<Orkeon version>.src.<commit date>.g<commit, 7 characters>` the way
`.devcontainer/orkeon-update.sh --source` does.

## 3. List the files to bring in step

One table — file, what changes, from, to — built from `orkeon_pin.files`, then from
`git grep -l <previous short hash>`. Leave out what records history (a run made on an earlier
build, "since `<commit>`", the commit that delivered an upstream change): `CLAUDE.md` says why. Mark
each statement about Orkeon that must be checked on the new commit before it moves, and end with
the new `VERIFICATIONS.md` entry and the plan's § 11.1 line the migration will need.

## 4. Stop

Hand the table to the user. The edits, the rebuild (`/ws-image`) and the checks (`/ws-check`) start
when the user says so; commit and push stay with the user.
