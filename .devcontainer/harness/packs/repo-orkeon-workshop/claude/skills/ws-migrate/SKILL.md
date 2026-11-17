---
name: ws-migrate
description: "Compares the latest Orkeon release with ORKEON_VERSION in a forked subagent, Orkeon Code and Orkeon Studio with their pins, and, when a release came out, lists what changed upstream and every file of the workshop to bring in step. Stops before any edit."
argument-hint: "[<orkeon version to migrate to instead of the latest release>]"
disable-model-invocation: true
context: fork
agent: ws-runner
---

# /ws-migrate — is the pin the latest Orkeon release, and what moves with it

You run in a forked subagent (`ws-runner`): the upstream log and diff stay here, the caller gets the
table alone. The rule is `CLAUDE.md` § "Every change follows the latest Orkeon release", steps 1
and 2 (D110, D111); the values are under `orkeon_pin` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill reads and lists. It
edits nothing.

Arguments: $ARGUMENTS

## 1. Resolve

Run `gh release view -R Orkeon/orkeon --json tagName` (or
`git ls-remote --tags https://github.com/Orkeon/orkeon.git`; or take the version given) and read
`ORKEON_VERSION` and `ORKEON_COMMIT` in `.github/workflows/image.yml`: the first is the release the
workshop is established on, the second the commit of its tag `v<version>`. Resolve Orkeon Code and
Orkeon Studio the same way, from their tags (`orkeon_pin.companions`), against `ORKEON_CODE_VERSION`
and `ORKEON_STUDIO_VERSION`. Every pin on its latest release: say "the pins are the latest releases
(Orkeon `<version>`, Orkeon Code `<version>`, Orkeon Studio `<version>`)" and stop. Orkeon's `main` is
not followed: commits after the latest tag move nothing.

## 2. Read what changed upstream

In a clone of Orkeon — an existing checkout, or `git clone --filter=blob:none` into
`${TMPDIR:-/tmp}/ws-migrate-orkeon` — read `git log --oneline v<pinned>..v<latest>`, `git diff --stat`
(to a file, then its last line and the paths that matter) and the `CHANGELOG.md` sections of every
version in between, and say which of them touch what the workshop relies on — CLI options, the tool
catalogue, packages, settings keys, the YAML and TypeScript DSL, the reserved virtual roots. The new
version is the released one, as it is (`1.2.0`: what the published CLI prints); `ORKEON_COMMIT` is the
commit of its tag (`git ls-remote --tags … "refs/tags/v<version>^{}"`). For the companions: the Orkeon
commit the new Orkeon Code names in its `.orkeon-version`, and the Orkeon version the new Orkeon
Studio builds against in its `Directory.Packages.props` — a companion written for another Orkeon than
the one migrated to is said, not moved.

## 3. List the files to bring in step

One table — file, what changes, from, to — built from `orkeon_pin.files`, then from
`git grep -l` of the previous version and of the previous short hash. Leave out what records history
(a run made on an earlier build, "since `<commit>`", the commit that delivered an upstream change):
`CLAUDE.md` says why. Mark each statement about Orkeon that must be checked on the published CLI of
the new version before it moves (`orkeon_pin.check_on`), and end with the new `VERIFICATIONS.md` entry
and the plan's § 11.1 line the migration will need.

## 4. Stop

The table is your report, handed to the user. The edits and the checks (`/ws-check`) start when the
user says so, the image build (`/ws-image`) only when the user asks for it (D74); the commit and the push come after them, by the main
session (D71).
