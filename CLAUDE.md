# CLAUDE.md

## What this repository is

**Orkeon Workshop** (MIT, independent of Orkeon): the Docker image `orkeon-workshop` (Claude Code, the
Orkeon CLI built from its sources, a local Ollama) and the harness with which Claude Code builds Orkeon
agent teams (YAML, TypeScript, C#). This repository builds the image; it is **not** a workshop: the
harness under `.devcontainer/harness/` (`HARNESS.md`, skills, hooks, rules) is deployed into a user's
workshop by `sync-harness.sh` and applies there, not here.

| Path | Content |
|---|---|
| `.devcontainer/Dockerfile`, `*.sh` | the image and its start-up scripts ([README](.devcontainer/README.md)) |
| `.devcontainer/harness/` | `HARNESS.md`, `claude/` (skills, agents, hooks, `lib/`, rules, templates, settings), `packs/`, `references/`, `library/`, `examples/`, `evals/`, `VERIFICATIONS.md`, `FROZEN-LITERALS.md` |
| `.devcontainer/bench/` | `orkeon-bench`, the harness CLI (TypeScript, Clean Architecture, vitest, dependency-cruiser) |
| `.devcontainer/csharp/` | the .NET templates, `orkeon-harness-run`, `orkeon-studio-check`, the packing of the Orkeon packages |
| `.github/workflows/` | `checks.yml` (bench tests and evals in a bare `node:24-bookworm`, on changes to `harness/` or `bench/`), `image.yml` (builds, checks, publishes to `ghcr.io/orkeon/orkeon-workshop`), `docs.yml` (docfx site, published from `main` to <https://orkeon.github.io/orkeon-workshop/>) |
| `docfx.json`, `toc.yml`, `scripts/build-docs-site.sh`, `scripts/docs-site/` | the documentation site |
| `docs/` | user documentation (index and roadmap: `docs/README.md`), French mirror `docs/fr/`, navigation `toc.yml` in each |
| `docs/orkeon-workshop-plan.md` | the design document: lots (§ 11), progress (§ 11.1), decisions `D<n>` (§ 13) |

## Conventions

- **English** everywhere. `README.fr.md` and `docs/fr/` mirror `README.md` and `docs/` page for page,
  in the same change; a page added, moved or removed is so in both `toc.yml` and both indexes. The
  plan is English only.
- **The plan is the record**: a decision goes to § 13, progress to § 11.1. Its section numbers and
  `D<n>` are cited across the sources: never renumber them.
- **Facts about Orkeon are checked, not assumed**: read in its sources or run on a build of the
  reference commit, the runs kept in `harness/VERIFICATIONS.md` (`V-nn`). Literals several files share
  are listed in `harness/FROZEN-LITERALS.md`: change them together.
- **No key on disk**, in the repository or a workshop: keys live in environment variables.
- **Git**: no commit, push or tag unless the user asks. New shell scripts get their executable bit
  (`git add --chmod=+x`).

## Checking a change

```bash
cd .devcontainer/bench && npm run lint && npm test        # npm test rebuilds dist/ first
# Strict evals (a case that cannot run fails). Need orkeon, orkeon-bench (bench/bin, up-to-date dist/),
# orkeon-studio-check, rtk and PyYAML on the PATH; the catalogue case needs orkeon at the reference
# version. Never while the bench rebuilds dist/.
cd .devcontainer/harness && HARNESS_EVALS_STRICT=1 bash evals/run.sh
# .NET templates, against a feed built from the reference commit
# (csharp/scripts/build-orkeon-packages.sh <reference version> <feed> <Orkeon checkout>).
bash .devcontainer/csharp/scripts/verify-templates.sh --feed <feed> --offline --smoke
```

A push starts up to three workflows, `checks`, `image` and `docs`: follow each to its end
(`gh run list`); a green image does not mean a green `checks`. `checks` runs in a container with no
reaping init, no `orkeon` and no `rtk`; replay it in a `node:24-bookworm` container started on
`tail -f /dev/null`, with the tracked files of `bench/` and `harness/`, then the steps of `checks.yml`.

After a documentation change: relative links and anchors of every Markdown file (hidden folders
included), Mermaid diagrams, then the site build, which fails on a broken link, anchor or `toc.yml`
entry — `DOCFX=<dir>/docfx bash scripts/build-docs-site.sh`, docfx at `DOCFX_VERSION` of `docs.yml`.

## Orkeon `main` and the image

### Every change follows the latest Orkeon `main`

1. **Resolve** `git ls-remote https://github.com/Orkeon/orkeon.git refs/heads/main` against
   `ORKEON_COMMIT` in `.github/workflows/image.yml` (D32), at the start of the change and again before
   a push.
2. **When `main` has moved, migrate in the same change** (read `git diff <pinned>..<latest>` and
   `CHANGELOG.md`), bringing in step:
   - `ORKEON_COMMIT`; `REFERENCE_ORKEON_VERSION` in `bench/src/domain/orkeon-version.ts`; `OrkeonVersion`
     in `csharp/Orkeon*/Directory.Packages.props` — version `<Orkeon version>.src.<commit date>.g<7-char
     commit>`, as `orkeon-update.sh --source` computes it;
   - `harness/references/` and their table, the tool catalogue of `orkeon-reference.md` § 5
     (`orkeon-bench tools dump`), the tool list in `check_crew.py` and `check_team.py`, the rules and
     docs stating what Orkeon does;
   - every file naming the previous short hash (bench tests, READMEs, comments);
   - a `VERIFICATIONS.md` entry and a § 11.1 line.

   A statement moves only once checked on a local CLI build (`-p:Version=<reference version>`). What
   records history (earlier runs, "since `<commit>`") stays as written.
3. **Done** = the checks above that the change touches are green on the checkout. No image needed.

### The image is built and validated only on the user's explicit request

Never on your own initiative (D74), even after a migration: no `docker build` of `.devcontainer/`, no
`gh workflow run`/`gh run rerun` of `image.yml`, no substitute validation (Orkeon packed from the commit,
then templates, bench and evals run as "the image's checks"). A request ("build the image",
`/ws-image`) covers one build. When a build would be due (migration, `Dockerfile`, start-up scripts),
say so in the report with the commit and the command.

A push touching `.devcontainer/**` (its `README.md` excepted) or the workflow starts `image.yml` on
GitHub by itself: a pull request builds only, a push to `main` publishes and moves `:latest`, a `vX.Y.Z`
tag publishes a versioned image. Announce it before the push and follow it.

When asked, resolve `main` again (a pin behind it is built only if the user confirms), then:

```bash
c=$(sed -n 's/^ *ORKEON_COMMIT: *//p' .github/workflows/image.yml)
docker build --build-arg ORKEON_SOURCE_REF=$c --build-arg ORKEON_REFRESH=$c -t orkeon-workshop .devcontainer
```

**Validated** = that build green: Orkeon and its packages compiled from the commit, the templates'
self-check, the bench tests and the strict evals — one red case fails it. Without Docker, propose the
checks above on a local build of the same commit, run them only if the user agrees, and say the image
was not built. Report what was built, on which commit, the result and the log.
