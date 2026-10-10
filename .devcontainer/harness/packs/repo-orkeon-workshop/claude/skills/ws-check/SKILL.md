---
name: ws-check
description: "Runs the checks of orkeon-workshop (bench lint and tests, harness evals in strict mode, on request the replay of checks.yml in node:24-bookworm) and reports what is red."
argument-hint: "[bench | evals | ci | templates | all]"
disable-model-invocation: true
---

# /ws-check — the checks of orkeon-workshop

The procedure is `CLAUDE.md` § "Checking a change"; the commands are under `commands` (the CI
replay, a procedure, under `manual_checks`) in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill runs them and reports.
It changes no file and fixes nothing.

Arguments: $ARGUMENTS (none: `bench` then `evals`)

## 1. Run each check in a subagent

Their output is long: give each check to its own `general-purpose` subagent (a `description`, an
explicit `model`) whose report names the command, its exit code, the summary line, and each failure
by name with its first lines. One after the other, never together: the evals must not run while the
bench rebuilds `dist/`.

| Check | Command (`repo.yaml`) | Needs |
|---|---|---|
| `bench` | `commands.lint`, then `commands.test` | `npm ci` done in `.devcontainer/bench` |
| `evals` | `commands.test_integration` | `orkeon` at the reference version, `orkeon-bench` (`bench/bin` on an up-to-date `dist/`), `orkeon-studio-check`, `rtk`, PyYAML on the `PATH`: in strict mode a missing tool fails its cases |
| `ci` | `manual_checks.ci_replay`, as `CLAUDE.md` describes it | Docker |
| `templates` | `commands.templates` | a feed built from the reference commit (`.devcontainer/csharp/scripts/build-orkeon-packages.sh`) |

A check whose need is missing is reported `not run` with the reason, never as green.

## 2. Report

One table — check, command, result (`green`, `N failed`, `not run: <why>`) — then the failures by
name with their first lines. A failure is called pre-existing only when the same case was run red on
the base commit in this session. Commit and push stay with the user.
