---
name: release-evidence
description: "Gathers the install evidence of a release candidate (the Windows jobs of the release workflow read with gh run view, and what the user pastes) into todo/release-<version>/; the tag command is handed over."
argument-hint: "<version> [<run id>]"
disable-model-invocation: true
---

# /release-evidence — proof that it installs, before the tag

`/release-prepare` said the commit is ready. You collect the evidence that the packages install where
the CI cannot be watched by eye: the Windows jobs of the release workflow, and what the user pasted
from a machine of their own. Then the tag command is handed over; nothing is tagged or pushed by
Claude (D47). Record shape: `../release-prepare/references/record.md`.

Arguments: $ARGUMENTS

## 1. The values and the run

1. A source space, and `todo/release-<version>/RECORD.md` with a `prepare` entry; none, stop and name
   `/release-prepare <version>`.
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `release.workflows.release`,
   `release.windows_jobs`, `release.tag`. A missing key: ask for it once, naming the key.
3. The run: the run id given, else the latest of `gh run list --workflow <release workflow> --commit
   <commit of the prepare entry> --json databaseId,event,status,conclusion,url`. None, or none
   completed: stop. When the workflow has a manual trigger that publishes nothing (read its `on:`
   and its header), hand over `gh workflow run <release workflow> --ref <branch>`, then
   `/release-evidence <version> <run id>` once it has finished; otherwise the evidence comes after
   the tag.

## 2. The CI evidence

`gh run view <run id> --json jobs`: for each name of `release.windows_jobs` (a matrix job matches by
prefix), its conclusion, its steps' conclusions and its URL. A completed job's last 40 log lines:

```bash
gh run view <run id> --log --job <job id> | tail -n 40
```

Write each to `todo/release-<version>/evidence/ci-<job>.txt`. A job absent from the run is `missing`.
`release.windows_jobs` empty: no job to read, say so; the run's conclusion stands as the CI evidence.

## 3. The pasted evidence

Ask the user (one question) for what they saw on a Windows machine of their own — `orkeon --version`
after installing the candidate, the installer's end, `orkeon doctor` — or for nothing. Save each
paste verbatim to `evidence/pasted-<n>.txt`, keys and tokens redacted; never ask for a key.

## 4. Record and stop

Append a dated `evidence` entry: run URL and event, one row per Windows job (verdict and file), the
pasted files. Then:

- a job not `success`, or the `prepare` entry not ready: name what is missing; no tag line;
- otherwise write `.claude/local/scripts/tag-<version>.sh` (the source-space rule: two commands, one
  script; check it with `bash -n`), hand it over, and append a `tag handed over` entry:

```bash
#!/bin/bash
set -euo pipefail
git rev-parse -q --verify "refs/tags/<tag>" >/dev/null || git tag <tag> <commit>
git push origin <tag>
```

Typed in Claude Code with `!` in front or in a terminal of the container, at the root of the checkout:

```bash
bash .claude/local/scripts/tag-<version>.sh
```

When it worked, git prints `* [new tag] <tag> -> <tag>`; the tag starts the release workflows, and
`/release-verify <version>` runs once they are done.

## 5. Report

A summary of actions and results: the run used, each Windows job's verdict, the pasted files, the
tag lines handed over or what blocks them.
