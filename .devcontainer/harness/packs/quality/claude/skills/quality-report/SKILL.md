---
name: quality-report
description: "Runs the repository's quality commands (build, tests, coverage, Sonar when a server is reachable) in a forked subagent and writes a checked report to <work>/quality-<date>/REPORT.md and REPORT.json."
argument-hint: "[--integration] [--no-sonar] [--<step> \"<command>\" ...]"
disable-model-invocation: true
context: fork
agent: quality-runner
---

# /quality-report — the repository's quality gates, in one checked report

You run in a forked subagent (`quality-runner`): the commands' output stays here, the caller gets the
summary alone. You run the quality commands the repository declares, collect their figures, write a
report, and check its arithmetic with a script. A snapshot, today's values only: no trend, no
comparison with an earlier report. Shapes of the JSON and the Markdown, and the tone:
`references/report.md`.

Arguments: $ARGUMENTS

## 1. The commands

1. A source space: `git rev-parse --show-toplevel` is the current folder.
2. Read the `commands:` block of `.claude/harness/packs/repo-*/references/repo.yaml` alone
   (`sed -n '/^commands:/,/^[a-z]/p' <file>`, never the file whole): `commands.build`, `commands.test`,
   `commands.coverage`, `commands.sonar`, and `commands.test_integration` only with `--integration`
   (it may need Docker); `commands.restore` when the pack has one, run before the build and logged with
   it (the build carries `--no-restore` since 2026-10-12), never a step of the report. An argument `--<step> "<command>"` (`--build`, `--test`, `--coverage`,
   `--sonar`, `--test_integration`) gives or replaces a command. A step with no command from either:
   you cannot ask — it is `not_run`, reason `no commands.<step>`, and the report's findings name the
   key of a repository pack and the argument that would give it.
3. The folder: `<work>/quality-<YYYY-MM-DD>/` (a second run the same day overwrites it, say so), logs
   under its `logs/`. Note `git rev-parse HEAD` and the branch.

## 2. Sonar, only when reachable

Run it only when none of these stops it, else `not_run` with the reason that stopped it:
`--no-sonar`; no `commands.sonar`; `SONAR_HOST_URL` unset; `SONAR_TOKEN` unset;
`curl -sf "$SONAR_HOST_URL/api/system/status"` not answering `"status":"UP"`. The token lives in the
environment only: never print it, never pass it on a command line you show, never write it to a file.
This skill never starts a Sonar server. A run writes to that server (project binding, quality gate):
the user's own, set by `SONAR_HOST_URL`.

## 3. Run, one step at a time

In this order — build, test, coverage, test_integration, sonar — run each command with its output in
`logs/<step>.log`, and keep for it the record of `references/report.md` § 3: exit code, whole seconds,
the figures read from the runner's own summary lines, at most 15 lines of failures. The later steps
reuse the build; a failed build stops the steps that need it: they are `not_run`, reason
`build failed`. No file of the repository is edited.

- **One run of a suite**: when `commands.coverage` wraps the suite `commands.test` runs (the same test
  command and filter inside it — Orkeon's case), the test step does not run on its own: `not_run`, reason
  `same suite as coverage: totals from logs/coverage.log`, and `tests` takes the runner's summary lines
  of that log; `REPORT.md` says so in its Tests row. Different suites, or no coverage step: both run.
- **A command that can outlast 270 seconds** — the build, a suite, the coverage, Sonar — runs detached to
  its log and is awaited in slices: `f=<work>/quality-<date>/logs/<step>.log; setsid nohup bash -c 's=$(date +%s); <cmd> > "$0" 2>&1; e=$?; echo "exit=$e seconds=$(( $(date +%s) - s ))" >> "$0"' "$f" >/dev/null 2>&1 &`,
  then `timeout 270 bash -c "until grep -q '^exit=' \"$f\"; do sleep 5; done"; tail -15 "$f"` again until the
  `exit=` line is there. Never one long loop: the Bash tool ends a call at 290 s (`BASH_DEFAULT_TIMEOUT_MS`
  of the harness's `settings.json`; 120 s without it), and a wait longer than the five minutes of the
  prompt cache makes the next turn write the whole context again.

## 4. Write and check

1. `<work>/quality-<date>/REPORT.json` first (schema `quality-report/1`), then `REPORT.md` from it.
2. Check:

   ```bash
   python3 .claude/skills/quality-report/scripts/quality-report-check.py <work>/quality-<date>/REPORT.json
   ```

   A `FAIL` line: correct the JSON and the section of `REPORT.md` it feeds, run the check again. A
   `WARN` line goes into the report as a finding, never dropped.
3. Every figure of the summary table of `REPORT.md` equals the JSON and its own section.

## 5. Report

A summary of actions and results: each step with its status and duration, the test totals, line and
branch coverage, the Sonar gate or why Sonar was not run, the check's last line, the report's path,
and the two or three findings that matter most.
