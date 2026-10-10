# Profiles and packs

The harness is deployed as **packs** composed into **profiles** (design: `docs/profiles-design.md`,
decisions D48 onwards). This folder holds their definitions; `/workshop-profile` (script
`claude/skills/workshop-profile/scripts/workshop-profile.py`) and `sync-harness.sh` read them.

| File | Holds |
|---|---|
| `packs/<pack>.yaml` | one pack: the spaces it fits, the files it owns, the switches it turns on |
| `<profile>.yaml` | one profile: its packs and, optionally, skills with their visibility |
| `../packs/<pack>/` | the files of a pack that is not `core` or `workshop`, laid out like the harness |
| `../packs/repo-<name>/references/repo.yaml` | what a repository pack tells the generic skills |

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
description: One line.
spaces: [source]                  # workshop and/or source
files: packs/dev/                 # optional: a folder (trailing /) or a list of globs, relative to the
                                  # harness root; default packs/<name>/. core lists globs over the
                                  # existing tree; workshop is "remainder" (every file outside packs/
                                  # that no other pack owns).
switches:                         # optional: HARNESS_* values written to settings.local.json env
  HARNESS_DEV_BATCH_GUARD: "1"
skills:                           # optional: visibility of this pack's skills when it is active
  token-usage: on                 # on | name-only | user-invocable-only | off
# Repository packs only (name repo-<name>):
repos: ['github\.com[:/]Orkeon/orkeon(\.git)?/?$']   # regexes over the origin URL
with: [contrib, dev, quality, release, docs-audit]   # added when the profile holds one of these
```

## Profile file

```yaml
name: dev
description: One line.
packs: [core, source, dev, quality, usage]
skills:                           # optional
  docs-audit: on                  # deployed even though its pack is not listed (the skill folder alone)
  token-usage: user-invocable-only
```

- `custom:<pack>,<pack>` in `.claude/local/profile` takes packs only; `core` is always added.
- A hand-made profile is `.claude/local/profiles/<name>.yaml`, same shape; it is never touched by the
  synchronisation and a shipped profile of the same name wins.

## Resolution

1. **Active profile**: `.claude/local/profile` (one line, `<name>` or `custom:<packs>`), else the container
   variable `HARNESS_PROFILE`, else `user`.
2. **Effective packs**: the profile's packs whose `spaces` hold the current space (and, for a repository
   pack, whose `repos` match the `origin` remote), plus every repository pack whose `repos` match and
   whose `with` meets one of them. `core` is always in, first. The profile **fits** the space when one of
   its packs made for one space only fits it - `dev` holds `usage`, which fits a workshop, and is not a
   workshop profile for that - or, for a profile made only of packs that fit both spaces
   (`custom:contrib,usage`), when one of them does. A profile that does not fit is refused, with the
   profiles that fit.
3. **Switches**: the union of the effective packs' `switches`. Two different values for one switch: a
   guard (`HARNESS_GUARD_*`, `HARNESS_SECRET_GUARD`) takes `"1"`, a bound (`*_LINES`, `*_BYTES`) the
   smaller; any other conflict is an error of the definitions (an eval checks the shipped ones).
4. **Skills visibility** (`skillOverrides`): `off` for every harness skill deployed but outside the
   effective packs and the profile's `skills`; then the packs' `skills`; then the profile's `skills`.

## The switcher

`claude/skills/workshop-profile/scripts/workshop-profile.py` (python3 and PyYAML), run by `/workshop-profile`:

| Arguments | Does |
|---|---|
| (none), `--show` | the active profile, where it comes from, its effective packs and switches |
| `--list` | the profiles (shipped and hand-made) and whether each fits here; the packs and their spaces |
| `<profile>`, `custom:<pack>,<pack>` | switches: refuses (exit 2) a profile that does not fit, an unknown space, a target git tracks in a source space, an unreadable `settings.local.json`; else writes `.claude/local/profile`, the owned keys of `.claude/settings.local.json` (`env` switches, `skillOverrides`), `.claude/local/profile.owned.json`, then runs `sync-harness.sh` (`$HARNESS_SYNC_SCRIPT`, default `/usr/local/bin/sync-harness.sh`) |
| `--dry-run` | with a profile: what a switch would write; writes nothing |
| `--no-sync` | with a profile: switches without running the synchronisation |
| `--check` | the definitions and the partition: every file of one pack, no two files on one path, no skill in two packs, the switches of every union resolve (exit 1 otherwise; an eval runs it) |
| `--resolve [--space <s>] [--manifest <in> <out>]` | for `sync-harness.sh` and the SessionStart hook: lines `space <s>`, `profile <name>`, `packs <pack> ...`, `skills <skill> ...` (deployed without their pack), `note <why>` (a profile that does not fit a workshop: `user` applies), or `refused <why>` with exit 2; `--manifest` writes to `<out>` the lines of the image manifest `<in>` whose file is deployed here |

Every line it prints starts with `workshop-profile:`, except those of `--resolve`. The definitions are
read from `$HARNESS_STAGING/profiles` (default `/usr/local/share/claude-harness`), else from the tree the
script ships in; the root is `$ORKEON_WORKSHOP`, else `$CLAUDE_PROJECT_DIR`, else `~/Orkeon`.

## Repository pack: `references/repo.yaml`

The generic skills (`contrib-*`, `dev-*`, `quality-report`, `release-*`, `docs-audit`) read the values of the
repository they run in from here, and never hard-code a repository. A key that is absent is asked of the
user once, and the skill says which key would have given it.
A pack may leave a key out on purpose — a repository with no version file or no Keep-a-Changelog file has
no `release.version_file` or `release.changelog`, said in a YAML comment — and the skill then reports that
check as `not applicable (no <key>)`; a pack may also carry keys of its own for its own skills (for
example `manual_checks` in `repo-orkeon-workshop`). Every `commands.*` value is a shell command, never prose.

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
  test: ...                       # the fast suite
  test_integration: ...
  coverage: ...
  sonar: ...                      # optional; needs SONAR_HOST_URL / SONAR_TOKEN in the environment
  docs_checks: [...]              # list
  release_readiness: ...
contrib:
  branch: "feature|fix|chore/<slug>"
  commit: "type(scope): summary"
  issue_templates: {bug: .github/ISSUE_TEMPLATE/bug_report.yml}
  pr_template: .github/PULL_REQUEST_TEMPLATE.md
  checklist: [...]                # what a PR must satisfy, one line each
release:
  version_file: ...
  tag: "v<version>"
  changelog: CHANGELOG.md
  workflows: {release: release.yml, verify: release-verify.yml}
  windows_jobs: [...]
  channels: [...]                 # what /release-verify checks after the CI
```
