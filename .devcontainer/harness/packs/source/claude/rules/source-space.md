# Source space - the harness in a repository checkout

This folder is the git checkout of a repository, not an Orkeon workshop: the harness deployed here is
the packs of its profile (`/workshop-profile --show`), chosen with `/workshop-profile` (lot 11,
D48-D55). There are no teams, no workbooks and no `team-*` skills; the hooks made for a workshop stay
silent. The repository's own `CLAUDE.md`, contribution guide and conventions rule its code: this rule
adds to them and never overrides them.

## What the harness owns here

- `.claude/` files it deployed (skills, agents, rules, hooks, `settings.json`) are replaced at the
  next synchronisation: never edit them; a change of the harness is made in the orkeon-workshop
  repository.
- `.claude/local/` (the profile, scripts handed to the user, logs) and `.claude/settings.local.json`
  are the space's own. `/workshop-profile` rewrites only the keys it owns in the latter.
- Nothing the harness writes is tracked by git: a block of `.git/info/exclude` lists it, rewritten at
  every start. Never `git add -f` one of these files, and never add them to the repository's
  `.gitignore`.

## Where the work goes

- Every artefact of a workflow - spec, plan, batch notes, audit, quality report, release record,
  issue or pull request body - goes under `todo/<code>/` at the root of the checkout (`<code>` a
  short slug of the work, `release-<version>`, `docs-audit-<date>`). `todo/` is excluded from git.
- Code, tests and documentation of the repository are changed only for the task the user gave, in
  the repository's conventions, and checked with the repository's own commands.

## What the user runs (D47)

Claude Code does not commit, push, tag, create an issue or a pull request, comment on one, or publish
a release. It prepares what they need - the commit message, the issue or PR body under
`todo/<code>/`, the release notes - then hands the command over:

1. say where it is typed: in Claude Code with `!` in front, or in a terminal of the container;
2. one step per line, each command in its own code block, nothing optional;
3. two commands or more become one script `.claude/local/scripts/<name>.sh` (`set -euo pipefail`,
   idempotent, never a secret inside), checked with `bash -n`, handed as `bash <path>`;
4. end with what the user will see when it worked.

A secret is never asked for in the conversation: it lives in an environment variable.

## Profiles

`/workshop-profile` lists the profiles that fit this space (`--list`), shows the active one
(`--show`) and switches; a switch deploys or removes files and asks for a restart of Claude Code.
