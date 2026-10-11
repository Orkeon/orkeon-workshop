# Profiles and packs

The harness is deployed as **packs** composed into **profiles** (design: `docs/profiles-design.md` of the
orkeon-workshop repository, decisions D48 onwards). This folder holds their definitions; `/workshop-profile`
(script `claude/skills/workshop-profile/scripts/workshop-profile.py`, linked by the image as
`/usr/local/bin/workshop-profile`) and `sync-harness.sh` read them.

| File | Holds |
|---|---|
| `packs/<pack>.yaml` | one pack: the spaces it fits, the files it owns, the switches it turns on, the visibility of skills, and for a repository pack the repositories it is made for and the packs it comes along with |
| `<profile>.yaml` | one profile: its packs and, optionally, skills with their visibility |
| `../packs/<pack>/` | the files of a pack that is not `core` or `workshop`: `claude/**` lands in `.claude/**` of the space, like the harness's own `claude/`; any other file lands under `.claude/harness/packs/<pack>/` |
| `../packs/repo-<name>/references/repo.yaml` | what a repository pack tells the generic skills, read at `.claude/harness/packs/repo-<name>/references/repo.yaml` |

## Spaces

| Space | What it is |
|---|---|
| `workshop` | an Orkeon workshop (`sync-harness.sh` `is_workshop`, or adopted) |
| `source` | the top of a git work tree that is not a workshop |

The space is `.claude/.harness-space` when it names one (the synchronisation writes `source` there), else
`workshop` when `is_workshop` holds (a harness manifest or marker in `.claude/`, a `teams/` folder, or
nothing visible in the folder), else `source` when the folder is the top of a git work tree, else
`unknown`, where nothing is deployed. A workshop that is a git repository stays a workshop.

## Pack file

```yaml
name: dev                         # = the file name, [a-z][a-z0-9-]*
description: One line.            # documentation only: nothing reads it
spaces: [source]                  # workshop and/or source
files: packs/dev/                 # optional: a folder (trailing /) or a list of globs, relative to the
                                  # harness root; default packs/<name>/. core lists globs over the
                                  # existing tree; workshop is "remainder" (every file outside packs/
                                  # that no other pack owns).
switches:                         # optional: HARNESS_* values written to settings.local.json env
  HARNESS_DEV_BATCH_GUARD: "1"
skills:                           # optional: visibility of a deployed skill while this pack is active -
  token-usage: on                 # its own or another pack's; on | name-only | user-invocable-only | off
# Repository pack: any pack with repos (the name repo-<name> is a convention):
repos: ['github\.com[:/]Orkeon/orkeon(\.git)?/?$']   # regexes over the origin URL
with: [contrib, dev, quality, release, docs-audit]   # added when the profile holds one of these
```

## Profile file

```yaml
name: dev
description: One line.            # printed by --list
packs: [core, source, dev, quality, usage]
skills:                           # optional
  docs-audit: on                  # deployed even though its pack is not listed (the skill folder alone)
  token-usage: user-invocable-only
```

- `custom:<pack>,<pack>` in `.claude/local/profile` takes packs only; `core` is always added. A bare
  `custom`, an unknown pack or an unknown profile is refused.
- A hand-made profile is `.claude/local/profiles/<name>.yaml`, same shape; it is never touched by the
  synchronisation and a shipped profile of the same name wins.

## Resolution

1. **Active profile**: `.claude/local/profile` (one line, `<name>` or `custom:<packs>`), else the container
   variable `HARNESS_PROFILE`, else `user`. A `profile` file that is empty counts as absent; one that does
   not hold a profile name (another text, a folder, a symbolic link) is ignored and `user` applies, and so
   does a `HARNESS_PROFILE` that is not a profile name.
2. **Effective packs**: the profile's packs whose `spaces` hold the current space (and, for a repository
   pack, whose `repos` match the `origin` remote), plus every repository pack whose `repos` match and
   whose `with` meets one of them. `core` is always in, first. The profile **fits** the space when one of
   its packs made for one space only fits it - `dev` holds `usage`, which fits a workshop, and is not a
   workshop profile for that - or, for a profile made only of packs that fit both spaces
   (`custom:contrib,usage`), when one of them does. A profile that does not fit is refused, with the
   profiles that fit.
3. **Switches**: the union of the effective packs' `switches`. Two different values for one switch: a
   guard (`HARNESS_GUARD_*`, `HARNESS_SECRET_GUARD`) takes `"1"`, a bound (`*_LINES`, `*_BYTES`) the
   smaller when both values are numbers; any other conflict is an error of the definitions (an eval checks
   the shipped ones).
4. **Skills visibility** (`skillOverrides`): `off` for every harness skill outside the effective packs and
   the profile's `skills` whose folder is still on disk once the synchronisation has run (a key for a
   folder that goes would outlive it); then the packs' `skills`; then the profile's `skills`. A key the
   user had set before the switch is kept as it is and never owned.

## The switcher

`claude/skills/workshop-profile/scripts/workshop-profile.py` (python3 and PyYAML), run by `/workshop-profile`.
One profile per call:

| Arguments | Does |
|---|---|
| (none), `--show` | the active profile, where it comes from, its effective packs and switches |
| `--list` | the profiles (shipped and hand-made) and whether each fits here; the packs and their spaces |
| `<profile>`, `custom:<pack>,<pack>` | switches: refuses (exit 2) a profile that does not fit, an unknown profile or pack, an unknown space, a target git tracks in a source space, a symbolic link between the root and a target, a `settings.local.json` that is not a regular file, not JSON, or whose `env` or `skillOverrides` is not an object, and a switch outside the harness tree (a deployed copy); else writes `.claude/local/profile`, the owned keys of `.claude/settings.local.json` (`env` switches, `skillOverrides`), `.claude/local/profile.owned.json`, then runs `sync-harness.sh` (`$HARNESS_SYNC_SCRIPT`, default `/usr/local/bin/sync-harness.sh`) |
| `--dry-run` | with a profile: what a switch would write; writes nothing |
| `--no-sync` | with a profile: switches without running the synchronisation |
| `--check` | the definitions and the partition: every file of one pack, no two files on one path, no skill in two packs, no seed outside the remainder, no skill a profile names that the harness does not ship, the switches of every union resolve; prints a count of files per pack (exit 1 on a problem; an eval runs it) |
| `--resolve [--space workshop\|source] [--manifest <in> <out>]` | for `sync-harness.sh` and the SessionStart hook: lines `space <s>`, `profile <name>`, `packs <pack> ...`, `skills <skill> ...` (deployed without their pack), `note <why>` (a profile that does not fit a workshop: `user` applies), or `refused <why>` with exit 2; `--manifest` writes to `<out>` the lines of the image manifest `<in>` whose file is deployed here |
| `-h`, `--help` | the usage line |

Every line it prints starts with `workshop-profile:`, except those of `--resolve`. In a workshop, every
refusal of `--resolve` but one of the `user` profile itself becomes a `note` and `user` applies; in a
source space it is `refused`, exit 2. The root is `$ORKEON_WORKSHOP`, else `$CLAUDE_PROJECT_DIR`, else
`~/Orkeon`. The definitions are read from `$HARNESS_STAGING/profiles` when the variable is set (no
fallback), else from `/usr/local/share/claude-harness`, else from the harness tree the script ships in,
else from the deployed `.claude/harness/profiles/` beside it - a read-only copy, where `--check` fails (exit 1) and a
switch is refused (exit 2): switching is done inside the `orkeon-workshop` container.

## Synchronisation

`sync-harness.sh` (a script of the image, beside its Dockerfile) deploys what the profile
resolves to; the full account of the synchronisation is `docs/reference/harness.md` of the orkeon-workshop
repository. What the profiles add to it:

- When `.claude/local/profile` does not exist, `HARNESS_PROFILE` names a profile other than `user` and the
  run is not a dry run, the switcher is run first, `workshop-profile.py <profile> --no-sync`: it writes the
  profile file and the packs' switches, as `/workshop-profile` would.
- Then `--resolve --manifest <image manifest> <filtered>` names the space and the packs and keeps the
  lines of the image manifest the space receives; the space's own manifest is that filtered one, so a file
  a new profile leaves out is removed like a file the image no longer ships. `--adopt`, or a folder that
  does not exist yet, forces `--space workshop`.
- When the resolver cannot run (exit 1: no python3, no PyYAML, broken definitions), a warning is printed
  and a workshop whose profile is `user` still gets every file outside `packs/`; any other folder gets
  `Nothing deployed: the profile of <root> is not user.`
- In a **source** space no seed is created and no workshop skeleton (`teams/`, `workbooks/`...) is made.
  A deployment that would write or remove a file git tracks, or write through a folder that is a
  symbolic link, is refused whole, exit 2, with nothing written. Otherwise `.claude/.harness-space` is
  written (`source`) and a block of `.git/info/exclude`, one per worktree and rewritten at every start,
  lists `/.claude/local/`, `/.claude/.harness-*`, `/.claude/settings.local.json`,
  `/.claude/harness-backup/`, `/.claude/evals/.fixtures/`, `/.claude/agent-memory/` (the memory of the auditors,
  D58), `/todo/` and every deployed file.
- The summary line ends with ` - profile <name> in a <space> space (<packs>)`, except for `user` in a
  workshop.

The SessionStart hook `workshop-profile.sh` tells the session which profile the space runs: one line of
`additionalContext`, `workshop-profile: <profile> (<packs>) — /workshop-profile to change`, the packs
read from `--resolve`; for `startup` and `clear` only. Silent on `user`. A `profile` file that does not
hold a profile name is said in one line and `user` applies; a profile that does not apply in the space is
said in one line too. `HARNESS_WORKSHOP_PROFILE=0` disables it.

## Repository pack: `references/repo.yaml`

The generic skills (`contrib-*`, `dev-*` but `dev-learn`, `quality-report`, `release-*`, `docs-audit`)
read the values of the repository they run in from here, and never hard-code a repository. A key that is
absent is asked of the user once, and the skill says which key would have given it.
A pack may leave a key out on purpose — a repository with no version file or no Keep-a-Changelog file has
no `release.version_file` or `release.changelog`, said in a YAML comment — and the skill then reports that
check as `not applicable (no <key>)`; a pack may also carry keys of its own for its own skills (for
example `instructions`, `record`, `manual_checks`, `docs_mirror` and `orkeon_pin` in
`repo-orkeon-workshop`, read by its `ws-*` skills). Every `commands.*` value is a shell command, never
prose; a value may hold a placeholder (`<feed>`, `<version>`) for what is known at run time only.

```yaml
product: Orkeon                   # the product's name, for the skills' messages (rules are written concretely)
origin: github.com/Orkeon/orkeon
docs: https://...                 # optional
layout:                           # optional, used by dev rules and skills
  domain: src/core/Orkeon.Domain
  application: src/core/Orkeon.Application
  infrastructure: src/core/Orkeon.Infrastructure
  tests: tests                    # test projects live under tests/<zone>/<Project>.Tests
commands:                         # each a shell command run from the repository root
  build: ...
  lint: ...                       # optional
  test: ...                       # the fast suite
  test_integration: ...
  coverage: ...
  sonar: ...                      # optional; needs SONAR_HOST_URL / SONAR_TOKEN in the environment
  docs_checks: [...]              # list
  templates: ...                  # optional; may hold <feed>
  image: ...                      # optional
  release_readiness: ...
contrib:
  branch: "feature|fix|chore/<slug>"
  commit: "type(scope): summary"
  issue_templates: {bug: ..., docs: ..., feature: ...}   # the kinds a repository has
  pr_template: .github/PULL_REQUEST_TEMPLATE.md
  checklist: [...]                # what a PR must satisfy, one line each
release:
  version_file: ...
  tag: "v<version>"
  changelog: CHANGELOG.md
  workflows: {release: release.yml, verify: release-verify.yml, publish: publish.yml}
  follow: ...                     # optional: how to follow the runs the tag does not start
  windows_jobs: [...]
  channels:                       # what /release-verify checks after the CI
    - name: ...
      check: ...                  # a command, or what to read
```
