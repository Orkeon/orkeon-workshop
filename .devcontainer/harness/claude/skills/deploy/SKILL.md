---
name: deploy
description: "Packs an Orkeon team of the workshop into a deployment archive, <slug>-<date>.zip (or .tar.gz) under deployments/: the team folder as Orkeon Studio runs it (crew, card, launchers, README, the empty folders of its mount points) and, if the user says so, its own settings file settings/<slug>/appsettings.json — never the data of its mount points, never a key. Asks whether the settings go in, checks the team first, then calls orkeon-bench deploy and says where the archive is and how to install it."
argument-hint: "[<slug>] [--with-settings | --without-settings] [--format zip|tar.gz] [--into <folder>]"
disable-model-invocation: true
---

# /deploy — a team as an archive, to install elsewhere

A deployment is a zip of **one team**, laid out as in a workshop (D45): `teams/<slug>/` as Orkeon Studio
runs it, and beside it, when the user wants it, `settings/<slug>/appsettings.json`. Unzipped at the root
of another workshop (`~/Orkeon` on Windows), the team is listed by Studio and its launchers find their
settings two levels up, exactly as here. The workbook, the tests and the data of the mount points are the
workshop's and never travel; nor does a key, ever. The archive is written by `orkeon-bench deploy`
(`references/process/workflow.md` § 11, `docs/reference/orkeon-bench.md`): you decide nothing about its
content, you put the one question the bench leaves open to the user, and you report.

Arguments: $ARGUMENTS

## 1. The team

- The slug: the argument when it names a folder of `teams/`; otherwise, when `teams/` holds one team,
  that one; otherwise ask which one (AskUserQuestion, one question, the teams listed). A slug without a
  team folder cannot be deployed: `teams/<slug>/` is born at the first build batch (D35) — say so and stop.
- Flags given in the arguments are passed on: `--with-settings`, `--without-settings`, `--into <folder>`,
  `--format zip|tar.gz`. The format is `zip` unless the user asks for `tar.gz` — the shape to choose when
  the archive is unpacked on Linux or macOS by a tool other than `unzip`, since every Unix unpacker
  restores a tar's file modes (`run.sh` executable); both carry the same files and the same modes. Do not
  ask about the format: zip by default, tar.gz when asked.

## 2. Check what is about to be shipped

1. `orkeon-bench scaffold <slug>` has been run since the last change of `mounts.json`: when `run.sh`,
   `run.cmd` or `studio-team.json` is missing, run it (it only writes what derives from `mounts.json`).
2. `(cd teams/<slug> && ./run.sh --validate)`: the crew loads and every tool resolves, no model called. A
   validation that fails is not shipped: show the error and stop — the fix belongs to the team's generator
   skill or to `/team-build`, not to this step.
3. When the team has a workbook, read the front matter of `workbooks/<slug>/STATUS.md`: a team that is
   not `accepted` or `published` is deployable, but say it in one line in § 5 — what is shipped is not
   proven yet.

## 3. The settings question — the user's alone

When `settings/<slug>/appsettings.json` exists and the arguments carry neither `--with-settings` nor
`--without-settings`, ask (AskUserQuestion, one question, two options):

- **Include it** `(Recommended)` when the file is what makes the team run — its model, a mail account,
  its own limits: the machine that unzips the archive then runs the team on these settings, through
  the launchers and Studio alike. Say what the file holds in one line (`Llm` section, accounts, no key).
- **Leave it out** when the other machine has its own settings for the team, or must not learn these:
  the launchers then run on the machine's settings.

Do not ask when the file does not exist: the archive holds the team alone, and you say so. Never write
or edit the settings file here; a file the bench refuses (a key, a password) is fixed by its owner —
report the refusal as it is, with the way out it names.

## 4. Write the archive

```bash
orkeon-bench deploy <slug> --with-settings|--without-settings [--format tar.gz] [--into <folder>] --json
```

Read the JSON: `archive`, `format`, `files`, `settings` (`included` | `left-out` | `none`), `left_out`
(`mount_data` by folder, `build_output`, `links`), `warnings`, `orkeon_version`. Exit `2` means the
bench refused — a settings file in the team folder, a `.env`, a secret in the settings file, a team
folder missing: relay the reason verbatim and stop. Never remove or move a file to make the deploy pass.

When the team has a workbook, add one journal line to `workbooks/<slug>/STATUS.md` (Edit, below the
front matter, which you do not change):
`- YYYY-MM-DD HH:MM — /deploy — <archive name> written (<n> files; settings included|left out|none)`.

## 5. Hand over

Tell the user, in their language, in a few lines:

- the path of the archive and its size; what it holds (the team as Studio runs it, the settings file or
  not) and what it leaves out (the data of each mount point folder, counted; the workbook and the tests,
  always); the Orkeon version it was made on;
- how to install it, in the shape of rule 10 (`references/process/hand-over.md`): where — on the machine
  that receives it, in a terminal of that computer —, then one line per step, each in its own code block:
  `unzip <archive> -d <workshop>` (or `tar -xzf <archive> -C <workshop>`) at the root of a workshop
  (`%USERPROFILE%\Orkeon` on Windows), so that `teams/<slug>/` lands in Studio's catalogue and
  `settings/<slug>/` beside it; then `sh <workshop>/teams/<slug>/run.sh` (`run.cmd` on Windows) — the
  launchers look for the settings two levels up and need no mode;
- when the settings were left out, that the team will run on the settings of the machine that
  receives it; when they were included, that the file names no key — the variable it names
  (`ApiKeyEnvVar`) must exist on that machine, given as `hand-over.md` § 5 says, never asked for in the
  conversation;
- the warnings of the bench, each in one line, and whether the team is proven (§ 2.3).

## 6. What this skill never does

It never changes the team, its settings or its tests to make the archive possible; it never includes
the settings file without the user's word; it never writes a key anywhere; it does not commit, tag or
send the archive (D3: the user runs those commands).
