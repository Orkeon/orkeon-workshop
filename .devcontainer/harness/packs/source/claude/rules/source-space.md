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
  issue or pull request body - goes under `<work>/<code>/` (`<code>` a short slug of the work,
  `release-<version>`, `docs-audit-<date>`). `<work>` is the **work folder** of the checkout (D69), the
  same in every skill of the packs:
  - `todo/` at the root of the checkout by default: the harness keeps it out of git;
  - another folder of the repository when the session start says `work folder <folder>/`: the
    repository pack names it (`repo.yaml` `layout.work`, the switch `HARNESS_WORK_DIR`; Orkeon:
    `backstage/tasks/`, where its tasks and backlog live), or the user does in
    `.claude/settings.local.json`. That folder is the repository's own: git sees what is written
    there, and the user commits it with the repository's conventions. When the folder named is
    absent from the checkout - a submodule not checked out - `todo/` applies, and the start line says so;
    in a linked git worktree without it, the main worktree's folder applies instead, named by the
    start line as an absolute path (a worktree checks no submodule out): write there, never in a
    `todo/` of the worktree.
  - Never create a `todo/` when the start line names another folder.
  - Before the first write under a work folder the repository named, read its conventions: the
    `CLAUDE.md` of that folder, or of the nearest folder above it (a submodule's root), when one exists
    and the session has not loaded it yet - Claude Code loads a nested `CLAUDE.md` at the first read or
    write in its folder, which would come after that first artefact. The repository's `README.md` of
    that folder, failing a `CLAUDE.md`.
- Code, tests and documentation of the repository are changed only for the task the user gave, in
  the repository's conventions, and checked with the repository's own commands.
- The product is run from this checkout, never from the image's install: the repository pack names
  the command (`repo.yaml` `commands.cli`) and `guard-source-cli` refuses the image's binary with it
  (D67). Without a pack, the repository's own guide says how its CLI runs from the sources.

## What the user runs (D47)

Claude Code does not commit, push, tag, create an issue or a pull request, comment on one, or publish
a release. It prepares what they need - the commit message, the issue or PR body under
`<work>/<code>/`, the release notes - then hands the command over:

1. say where it is typed: in Claude Code with `!` in front, or in a terminal of the container;
2. one step per line, each command in its own code block, nothing optional;
3. two commands or more become one script `.claude/local/scripts/<name>.sh` (`set -euo pipefail`,
   idempotent, never a secret inside), checked with `bash -n`, handed as `bash <path>`;
4. end with what the user will see when it worked.

A secret is never asked for in the conversation: it lives in an environment variable.

## Profiles

`/workshop-profile` lists the profiles that fit this space (`--list`), shows the active one
(`--show`) and switches; a switch deploys or removes files and asks for a restart of Claude Code.
