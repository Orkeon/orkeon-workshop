---
name: ws-check
description: "Runs the checks of orkeon-workshop (bench lint and tests, harness evals in strict mode, on request the replay of checks.yml in node:24-bookworm) in a forked subagent and reports what is red."
argument-hint: "[bench | evals | ci | templates | all]"
disable-model-invocation: true
context: fork
agent: ws-runner
---

# /ws-check — the checks of orkeon-workshop

You run in a forked subagent (`ws-runner`): the output of the checks stays here, the caller gets the
report alone. The procedure is `CLAUDE.md` § "Checking a change"; the commands are under `commands`
(the CI replay, a procedure, under `manual_checks`) in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill runs them and reports.
It changes no file and fixes nothing.

Arguments: $ARGUMENTS (none: `bench` then `evals`; `all`: `bench`, `evals`, then `ci` and `templates`
when their need is present, else each reported `not run (<need>)`)

## 1. Run each check, one after the other

Their output is long: each command writes to its own log, `${TMPDIR:-/tmp}/ws-check-<check>.log`, and
you read the summary line and each failure by name with its first lines (`tail`, `grep -n`). One after
the other, never together: the evals must not run while the bench rebuilds `dist/`.

| Check | Command (`repo.yaml`) | Needs |
|---|---|---|
| `bench` | `commands.lint`, then `commands.test` | `npm ci` done in `.devcontainer/bench` |
| `evals` | `commands.test_integration` | `orkeon` at the reference version, `orkeon-bench` (`bench/bin` on an up-to-date `dist/`), `orkeon-studio-check`, `rtk`, PyYAML on the `PATH`: in strict mode a missing tool fails its cases |
| `ci` | `manual_checks.ci_replay`, as `CLAUDE.md` describes it | Docker |
| `templates` | `commands.templates` | a feed built from the reference commit (`.devcontainer/csharp/scripts/build-orkeon-packages.sh`) |

A check whose need is missing is reported `not run` with the reason, never as green.

## 2. Report

One table — check, command, result (`green`, `N failed`, `not run: <why>`), log — then the failures by
name with their first lines. A failure is called pre-existing only when the same case was run red on
the base commit in this run. The commit and the push are the main session's, after this report (D71).
