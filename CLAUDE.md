# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repository is

**Orkeon Workshop**: the Docker image `orkeon-workshop` (Claude Code, the Orkeon CLI built from its
sources, a local Ollama) and the harness with which Claude Code designs, builds, tests and releases
Orkeon agent teams (YAML, TypeScript, C#). It is an independent MIT project, not a fork of Orkeon.

This repository builds the image; it is **not** a workshop. The harness under `.devcontainer/harness/`
is deployed into a user's workshop by the image (`sync-harness.sh`); its `HARNESS.md`, skills, hooks and
rules apply there, not here.

| Path | Content |
|---|---|
| `.devcontainer/Dockerfile`, `*.sh` | the image and its start-up scripts ([`.devcontainer/README.md`](.devcontainer/README.md)) |
| `.devcontainer/harness/` | the Claude Code side: `HARNESS.md`, `claude/` (skills, subagent charters, hooks, `lib/`, rules, templates, settings), `references/`, `library/`, `examples/`, `evals/`, and the two records `VERIFICATIONS.md` and `FROZEN-LITERALS.md` |
| `.devcontainer/bench/` | `orkeon-bench`, the harness CLI (TypeScript, Clean Architecture, vitest, dependency-cruiser) |
| `.devcontainer/csharp/` | the .NET templates, `orkeon-harness-run`, `orkeon-studio-check`, and the script that packs the Orkeon packages |
| `.github/workflows/checks.yml` | fast feedback: the tests of `orkeon-bench` and the harness evals in a bare `node:24-bookworm` container, on a push or a pull request that touches `harness/` or `bench/` |
| `.github/workflows/image.yml` | builds, checks and publishes the image to `ghcr.io/orkeon/orkeon-workshop` |
| `.github/workflows/docs.yml` | builds the documentation site with docfx and, on `main`, publishes it to GitHub Pages (<https://orkeon.github.io/orkeon-workshop/>) |
| `docfx.json`, `toc.yml`, `scripts/build-docs-site.sh`, `scripts/docs-site/` | the documentation site: its configuration, its navigation bar, and the script that stages the pages (`README.md`, `README.fr.md`, `docs/`) without modifying them, then runs docfx |
| `docs/` | user documentation (`docs/README.md` is the index and holds the roadmap), mirrored in French under `docs/fr/`; `docs/toc.yml` and `docs/fr/toc.yml` are the navigation of the site |
| `docs/orkeon-workshop-plan.md` | the design document: lots (§ 11), progress journal (§ 11.1), binding decisions `D<n>` (§ 13) |

## Conventions

- **English** for every file of the repository. The user documentation is mirrored in French:
  `README.fr.md` and `docs/fr/` follow `README.md` and `docs/` page for page. A change to an English
  page is ported to its French page in the same change. The plan is English only. A page added, moved
  or removed is added, moved or removed in `docs/toc.yml` and `docs/fr/toc.yml` too, and in the index
  (`docs/README.md`, `docs/fr/README.md`).
- **The plan is the record.** A decision, a change of scope or the outcome of a lot is written in
  `docs/orkeon-workshop-plan.md` (§ 13 for a decision, § 11.1 for progress). Its section numbers and the
  decision ids are cited throughout the sources as `plan § x.y` and `D<n>`: never renumber them.
- **Facts about Orkeon are checked, not assumed.** A statement about what Orkeon does is read in its
  sources or run on a build of the reference commit; `.devcontainer/harness/VERIFICATIONS.md` keeps the
  runs (`V-nn`). The literals several files must agree on are listed in
  `.devcontainer/harness/FROZEN-LITERALS.md`: change them together.
- **No key on disk**, in any file of the repository or of a workshop: a key lives in an environment
  variable.
- **Git**: no commit, push or tag unless the user asks for it. New shell scripts are added with their
  executable bit (`git add --chmod=+x`): the image runs them as copied.

## Checking a change

```bash
# orkeon-bench: lint (types, dependency rules) and tests. `npm test` rebuilds dist/ first.
cd .devcontainer/bench && npm run lint && npm test

# Harness evals, strict: a case that cannot run fails instead of being skipped. They need `orkeon`,
# `orkeon-bench` (bench/bin, on an up-to-date dist/), `orkeon-studio-check`, `rtk` and PyYAML on the
# PATH, and an `orkeon` whose `--version` is the reference version: on any other, the comparison of
# the tool catalogue with `orkeon run --list-tools` is left out. Never run them while the bench
# rebuilds dist/.
cd .devcontainer/harness && HARNESS_EVALS_STRICT=1 bash evals/run.sh

# .NET templates, against a feed of Orkeon packages built from the reference commit
# (csharp/scripts/build-orkeon-packages.sh <reference version> <feed> <Orkeon checkout>).
bash .devcontainer/csharp/scripts/verify-templates.sh --feed <feed> --offline --smoke
```

After a documentation change, check the relative links and anchors of every Markdown file, hidden
folders included, and that the Mermaid diagrams still render; then build the site, which fails on a
broken link, a broken anchor or a `toc.yml` entry without its page:

```bash
# docfx at the version DOCFX_VERSION of .github/workflows/docs.yml (dotnet tool install docfx --version <version> --tool-path <dir>).
DOCFX=<dir>/docfx bash scripts/build-docs-site.sh
```

A push starts up to three workflows, `checks`, `image` and `docs`: follow each to its end (`gh run list`),
a green image does not say `checks` is green. `checks` runs in a job container whose first process reaps nothing
and that has neither `orkeon` nor `rtk` — a test that passes here and in the image build can fail there. To
replay it: a `node:24-bookworm` container started on `tail -f /dev/null`, the tracked files of `bench/` and
`harness/`, then the steps of `checks.yml`.

## The image is rebuilt and validated on the latest Orkeon `main`

**Whenever this repository is modified, the image must be rebuilt and validated with the latest commit
available on Orkeon's `main`** (<https://github.com/Orkeon/orkeon/commits/main/>). A change is not done
while the image that carries it has not been built green on that commit.

1. **Resolve the latest commit**: `git ls-remote https://github.com/Orkeon/orkeon.git refs/heads/main`,
   and compare it with `ORKEON_COMMIT` in `.github/workflows/image.yml` — the commit the published image
   builds and the workshop was checked on (D32).
2. **When `main` has moved, migrate the workshop to it in the same change.** Read what changed upstream
   (`git diff <pinned>..<latest>`, `CHANGELOG.md`), then bring in step everything established on the
   reference commit:
   - `ORKEON_COMMIT` in `.github/workflows/image.yml`;
   - `REFERENCE_ORKEON_VERSION` in `.devcontainer/bench/src/domain/orkeon-version.ts` and the
     `OrkeonVersion` of `.devcontainer/csharp/Orkeon*/Directory.Packages.props` — the version of a
     source build is `<Orkeon version>.src.<commit date>.g<commit, 7 characters>`, as
     `orkeon-update.sh --source` computes it;
   - the references (`.devcontainer/harness/references/`, their table in `references/README.md`), the
     tool catalogue of `references/orkeon/orkeon-reference.md` § 5 (regenerated with
     `orkeon-bench tools dump`), the tool list embedded in `check_crew.py` and `check_team.py`, the
     rules and the user documentation that state what Orkeon does;
   - every other file that names the commit or the version — tests of the bench, READMEs, comments:
     search for the short hash of the previous commit;
   - an entry in `.devcontainer/harness/VERIFICATIONS.md` and in the plan's § 11.1.

   A statement moves to the new commit only when it has been checked there. What records history — a run
   made on an earlier build, "since `<commit>`", the commit that delivered an upstream change — stays as
   written.
3. **Rebuild the image on that commit.** Locally, where Docker is available:

   ```bash
   c=$(sed -n 's/^ *ORKEON_COMMIT: *//p' .github/workflows/image.yml)
   docker build --build-arg ORKEON_SOURCE_REF=$c --build-arg ORKEON_REFRESH=$c -t orkeon-workshop .devcontainer
   ```

   Or through `.github/workflows/image.yml`. A pull request builds without publishing; a push to `main`
   builds, publishes and moves `:latest`; a `vX.Y.Z` tag publishes a versioned image. A push or a pull
   request starts the workflow only when it touches `.devcontainer/**` (its `README.md` excepted) or the
   workflow itself: a change of `docs/`, of the root READMEs or of this file builds nothing, and
   needs a local build or a manual run. A manual run takes `orkeon_ref` to try another commit — and,
   started on `main`, it publishes and moves `:latest` like any run there.
4. **Validated** means that build is green: it compiles Orkeon and its packages from the commit, runs the
   .NET templates' self-check, the tests of `orkeon-bench` and the harness evals in strict mode — a
   single red case fails the image. Without Docker, run the three checks above on a local build of the
   same Orkeon commit — the CLI built with `-p:Version=<reference version>` — and say plainly that the
   image itself was not built.

Report what was built and on which commit; when the rebuild could not be run, or the image was built on
another commit than the latest `main`, say so instead of calling the change done.
