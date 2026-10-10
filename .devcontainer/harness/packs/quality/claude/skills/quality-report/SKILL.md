---
name: quality-report
description: "Runs the repository's quality commands (build, tests, coverage, Sonar when a server is reachable) and writes a checked report to todo/quality-<date>/REPORT.md and REPORT.json."
argument-hint: "[--integration] [--no-sonar]"
disable-model-invocation: true
---

# /quality-report — the repository's quality gates, in one checked report

You run the quality commands the repository declares, collect their figures, write a report, and
check its arithmetic with a script. A snapshot, today's values only: no trend, no comparison with an
earlier report. Shapes of the JSON and the Markdown, and the tone: `references/report.md`.

Arguments: $ARGUMENTS

## 1. The commands

1. A source space: `git rev-parse --show-toplevel` is the current folder.
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `commands.build`, `commands.test`,
   `commands.coverage`, `commands.sonar`, and `commands.test_integration` only with `--integration`
   (it may need Docker). A missing key: ask the user for that command once and name the key that would
   have given it; a step the user leaves without a command is `not_run` with that reason.
3. The folder: `todo/quality-<YYYY-MM-DD>/` (a second run the same day overwrites it, say so), logs
   under its `logs/`. Note `git rev-parse HEAD` and the branch.

## 2. Sonar, only when reachable

Run it only when none of these stops it, else `not_run` with the reason that stopped it:
`--no-sonar`; no `commands.sonar`; `SONAR_HOST_URL` unset; `SONAR_TOKEN` unset;
`curl -sf "$SONAR_HOST_URL/api/system/status"` not answering `"status":"UP"`. The token lives in the
environment only: never print it, never pass it on a command line you show, never write it to a file.
This skill never starts a Sonar server. A run writes to that server (project binding, quality gate):
the user's own, set by `SONAR_HOST_URL`.

## 3. Run, in subagents

Delegate each step, in this order — build, test, coverage, test_integration, sonar — to a
general-purpose subagent, one at a time (the later steps reuse the build). Give it the command, the log
path, and the return contract of `references/report.md` § 3: exit code, whole seconds, the figures it
read, at most 15 lines of failures. It never edits a file of the repository. A failed build stops the
steps that need it: they are `not_run`, reason `build failed`.

## 4. Write and check

1. `todo/quality-<date>/REPORT.json` first (schema `quality-report/1`), then `REPORT.md` from it.
2. Check:

   ```bash
   python3 .claude/skills/quality-report/scripts/quality-report-check.py todo/quality-<date>/REPORT.json
   ```

   A `FAIL` line: correct the JSON and the section of `REPORT.md` it feeds, run the check again. A
   `WARN` line goes into the report as a finding, never dropped.
3. Every figure of the summary table of `REPORT.md` equals the JSON and its own section.

## 5. Report

A summary of actions and results: each step with its status and duration, the test totals, line and
branch coverage, the Sonar gate or why Sonar was not run, the check's last line, the report's path,
and the two or three findings that matter most.
