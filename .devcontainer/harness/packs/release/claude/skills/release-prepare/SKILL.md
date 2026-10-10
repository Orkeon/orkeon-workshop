---
name: release-prepare
description: "Checks that a version is ready to tag (version file, changelog section, readiness command, CI green on the commit) and drafts its notes from the changelog into todo/release-<version>/."
argument-hint: "<version>"
disable-model-invocation: true
---

# /release-prepare — is this commit ready to become `<version>`

You check what must hold before a tag, and draft the release notes. You change no file of the
repository: what is not ready is named, and the person releasing fixes it. The record and the notes
live in `todo/release-<version>/` (`references/record.md` gives their shapes; `/release-evidence` and
`/release-verify` add to the same record).

Arguments: $ARGUMENTS

## 1. The values

1. A source space: `git rev-parse --show-toplevel` is the current folder. No version in the
   arguments: ask for it (AskUserQuestion, one question).
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `release.version_file`, `release.tag`,
   `release.changelog`, `release.workflows`, `commands.release_readiness`. No repository pack: ask the
   user once for each value, naming its key. A pack that leaves out `release.version_file`,
   `release.changelog` or `commands.release_readiness` says the repository has none: that check is
   `not applicable (no <key>)`, never `not ready`.
3. The tag: `release.tag` with `<version>` replaced. The commit: `git rev-parse HEAD`.

## 2. The checks

Run each, record its verdict (`ready` / `not ready` / `not checked` / `not applicable`, with the
evidence):

| Check | How |
|---|---|
| version file | the version `release.version_file` declares equals `<version>` (an MSBuild props file: `VersionPrefix`, then `-` and `VersionSuffix` when there is one) |
| tag is free | `git tag -l <tag>` and `git ls-remote --tags origin <tag>` are both empty |
| changelog | `release.changelog` has a `## [<version>]` section with a date; its `[Unreleased]` section is empty |
| readiness | `commands.release_readiness`, exit 0 (its output lines in the record) |
| pushed | `git status --porcelain` empty, and `git branch -r --contains HEAD` names the default branch |
| CI green | `gh run list --commit <commit> --json workflowName,status,conclusion,url`: every run completed, `success` or `skipped` |
| quality, docs | the latest `todo/quality-*/REPORT.md` and `todo/docs-audit-*/REPORT.md`, if any: their date and verdict, quoted; absent, `not checked` and name `/quality-report`, `/docs-audit` |

## 3. The notes

Draft `todo/release-<version>/NOTES.md` from the version's changelog section: a title, the `### `
headings of the section as the list of changes (their own words), the breaking changes it states in
full, a link to the section of the changelog on the default branch. Invent nothing the section does
not say. No `release.changelog`: the notes list the subjects of `git log --oneline <previous
tag>..<commit>`, word for word.

## 4. Record and stop

Append a dated `prepare` entry to `todo/release-<version>/RECORD.md`: commit, every verdict, the path
of the notes. Then stop: the person releasing decides.

- Not ready: list what is missing, one line each, with the step that fixes it.
- Ready: the next step is `/release-evidence <version>`; the tag comes after the evidence.

## 5. Report

A summary of actions and results: the version and commit, the table of verdicts, the notes written,
what is missing before the tag.
