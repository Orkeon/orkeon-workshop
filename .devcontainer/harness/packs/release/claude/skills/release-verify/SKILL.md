---
name: release-verify
description: "After the release CI, checks what was published for a version (the release and its checksums, the verify jobs, each channel the repository lists) and records it in todo/release-<version>/RECORD.md."
argument-hint: "<version>"
disable-model-invocation: true
---

# /release-verify — what reached the users

The tag is pushed and the release workflows have run. You check, channel by channel, that the version
is where the repository says it publishes, and record what you saw. You publish, rerun and delete
nothing: a rerun or a fix is the user's. How each kind of check is run: `references/channels.md`.

Arguments: $ARGUMENTS

## 1. The values and the runs

1. A source space. No version: ask for it (one question). `todo/release-<version>/RECORD.md` is created
   when absent (`../release-prepare/references/record.md`).
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `release.tag`, `release.workflows`,
   `release.channels` (each a `name` and a `check`). A missing key: ask for it once, naming the key.
3. The runs on the tag, for each workflow of `release.workflows`:
   `gh run list --workflow <file> --branch <tag> --json databaseId,status,conclusion,url`. A run not
   completed: stop and say which; come back when it is.

## 2. The jobs

`gh run view <run id> --json jobs` for each run: every job with its conclusion. A failed job: its name,
its URL and its last 30 log lines in `todo/release-<version>/evidence/ci-<job>.txt`. A job skipped on a
tag that should run it is a finding, not a pass.

## 3. The channels

One verdict per entry of `release.channels`, by running its `check` with `<version>` and `<tag>`
filled in (`references/channels.md` turns each kind of check into commands): `published`, `missing`,
`wrong` (there, but not as stated), or `not checked` with the reason. A channel whose check needs a
machine the container is not (an installer of another system): ask the user once for a paste, saved
verbatim to `evidence/pasted-<n>.txt`, keys redacted; no paste, `not checked`.

## 4. Record and stop

Append a dated `verify` entry: each run (URL, conclusion), each failed job, one row per channel
(verdict, evidence). Then stop. Something `missing` or `wrong`: name it with the line that would retry
it (a rerun of a job, a manual run of the verify workflow), handed over to the user, never run here.

## 5. Report

A summary of actions and results: runs and their conclusions, the table of channels, the record's
path, what is left for the user to do.
