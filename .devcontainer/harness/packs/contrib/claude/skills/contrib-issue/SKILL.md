---
name: contrib-issue
description: "Records a failure reproduced in the workshop in contrib/<slug>/RECORD.md and drafts ISSUE.md on the repository's issue template; the gh issue create command is handed over."
argument-hint: "<slug> [bug|docs|feature] | <slug> filed <issue url>"
disable-model-invocation: true
---

# /contrib-issue — a reproduction, recorded and drafted as an issue

You turn a failure the user met in the workshop into two files: a dated record of what was run and
seen, and an issue shaped on the repository's template. Nothing is posted: the user files the issue
(D47). Shapes of both files: `references/record-and-issue.md`.

Arguments: $ARGUMENTS

## 1. Where, and on which template

- A workshop (a `teams/` folder, `orkeon` on the PATH). Elsewhere, stop: the reproduction is a team
  of a workshop.
- `<slug> filed <url>`: append a dated `filed` entry with the URL to `contrib/<slug>/RECORD.md`, say so
  in one line, and stop.
- The repository and the template: a workshop holds no repository pack, so they are
  `github.com/Orkeon/orkeon` (the one the installed Orkeon comes from) and the template file the
  offline shape of `references/record-and-issue.md` names for the kind (`bug` by default); a
  `repo.yaml` under `.claude/harness/packs/repo-*/references/`, when one is there, gives `origin` and
  `contrib.issue_templates.<kind>` instead. Read it with `gh api repos/<owner>/<repo>/contents/<path>
  --jq .content | base64 -d` (a read). Unreachable: use the offline shape and say so.

## 2. The reproduction

1. The slug: lowercase, hyphens, the failure in a few words. `contrib/<slug>/` exists: read
   `RECORD.md` and add to it; never rewrite a past entry.
2. The reproduction is a minimal team under `teams/` and one command. None yet: stop and propose the
   smallest crew that fails, built with the workshop's skills; come back once it fails.
3. Run the command now. Save its output to `contrib/<slug>/evidence/<YYYYMMDD-HHMM>-run.log`, keys
   redacted. A command that does not fail is not reported: record it as `not reproduced` and stop.
4. Collect the environment by running, not asking: `orkeon --version`, `orkeon-update --check` (the
   channel), `uname -sr`, `dotnet --version`, the provider and model of `orkeon doctor`'s `llm-config`.
5. Append the dated entry to `RECORD.md`: version, channel, environment, steps, expected, actual,
   evidence paths. Expected comes from the user or the documentation page that promises it; quote it.

## 3. The issue

Write `contrib/<slug>/ISSUE.md`: a `Title:` line, then one `### <label>` section per input field of the
template, in its order, filled from `RECORD.md`. A dropdown takes one of its options word for word. A
required field you cannot fill stays `TBD` and is named to the user. No key, no token, no path of
the user's home that says more than needed.

## 4. Stop — the user files it

Show the path of `ISSUE.md` and its title. Hand the command over (D47), saying where it is typed: the
terminal of the container, after `/exit`.

```bash
gh issue create --repo <owner>/<repo> --title "<title>" --body-file contrib/<slug>/ISSUE.md
```

No `--label`: labels need triage rights on the repository. Once filed, `/contrib-issue <slug> filed
<url>` records it.

## 5. Report

A summary of actions and results, in a few lines: the slug, reproduced or not, the files written, the
fields left `TBD`, the command handed over.
