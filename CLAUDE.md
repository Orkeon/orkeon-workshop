# CLAUDE.md

## What this repository is

**Orkeon Workshop** (MIT, independent of Orkeon): the Docker image `orkeon-workshop` (Claude Code, the
released Orkeon CLI, Orkeon Code, Orkeon Studio's terminal applications, a local Ollama) and the harness with which Claude Code builds Orkeon
agent teams (YAML, TypeScript, C#). This repository builds the image; it is **not** a workshop: the
harness under `.devcontainer/harness/` (`HARNESS.md`, skills, hooks, rules) is deployed into a user's
workshop by `sync-harness.sh` and applies there, not here.

| Path | Content |
|---|---|
| `.devcontainer/Dockerfile`, `*.sh` | the image and its start-up scripts ([README](.devcontainer/README.md)) |
| `.devcontainer/harness/` | `HARNESS.md`, `claude/` (skills, agents, hooks, `lib/`, rules, templates, settings), `packs/`, `references/`, `library/`, `examples/`, `evals/`, `VERIFICATIONS.md`, `FROZEN-LITERALS.md` |
| `.devcontainer/bench/` | `orkeon-bench`, the harness CLI (TypeScript, Clean Architecture, vitest, dependency-cruiser) |
| `.devcontainer/csharp/` | the .NET templates, `orkeon-harness-run`, `orkeon-studio-check`, the packing of the Orkeon packages and of Orkeon Studio |
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
- **No key in the repository.** In a workshop a key lives in an environment variable or, when the user
  chose `workshop setup keys` (D109), in the `env` block of `.claude/settings.local.json` and nowhere
  else: written by `orkeon-bench setup`, never by Claude Code, never shown.
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

## Orkeon's releases and the image

### Every change follows the latest Orkeon release

The workshop is established on a **released** Orkeon (D110): `ORKEON_VERSION` in
`.github/workflows/image.yml`, `ORKEON_COMMIT` beside it being the commit of the tag `v<version>`.
Orkeon Code (`ORKEON_CODE_VERSION`) and Orkeon Studio (`ORKEON_STUDIO_VERSION`) are pinned there too
(D111), and move with it: Orkeon Code names the Orkeon commit it was written for (`.orkeon-version`),
Studio the Orkeon version it builds against (`Directory.Packages.props`).

1. **Resolve** the latest release (`gh release view -R Orkeon/orkeon --json tagName`, or
   `git ls-remote --tags https://github.com/Orkeon/orkeon.git`) against `ORKEON_VERSION`, at the start
   of the change and again before a push; the same for Orkeon Code (its tags: its releases are
   pre-releases, which `gh release view` does not find) and Orkeon Studio (its tags too: its GitHub
   release can lag behind them, or stay a draft).
2. **When a release came out, migrate in the same change** (read `git diff v<pinned>..v<latest>` and
   `CHANGELOG.md`), bringing in step:
   - `ORKEON_VERSION` and `ORKEON_COMMIT`; `ORKEON_VERSION` in `.devcontainer/Dockerfile`;
     `REFERENCE_ORKEON_VERSION` in `bench/src/domain/orkeon-version.ts` (built from `REFERENCE_ORKEON_RELEASE`,
     `_COMMIT`, `_SOURCE_VERSION`, `_IS_RELEASE`); `OrkeonVersion` in
     `csharp/Orkeon*/Directory.Packages.props` — the released version, as it is;
   - `harness/references/` and their table, the tool catalogue of `orkeon-reference.md` § 5
     (`orkeon-bench tools dump`), the tool list in `check_crew.py` and `check_team.py`, the rules and
     docs stating what Orkeon does;
   - every file naming the previous short hash (bench tests, READMEs, comments);
   - a `VERIFICATIONS.md` entry and a § 11.1 line.

   A statement moves only once checked on the published CLI of that version
   (`dotnet tool install Orkeon.Scripting.Cli --version <version> --tool-path <dir>`). What records
   history (earlier runs, "since `<commit>`") stays as written.
3. **Done** = the checks above that the change touches are green on the checkout. No image needed.

Orkeon's `main` is no longer followed commit by commit. To try an unreleased Orkeon, the image
builds from sources on request (`--build-arg ORKEON_CHANNEL=source --build-arg ORKEON_SOURCE_REF=<ref>
--build-arg ORKEON_REPL_VERSION=<a release>`; the input `orkeon_ref` of `image.yml`): the pin does not
move for that.

**The exception (D115, 2026-11-17; none in force).** When the user decides it, because a fix the workshop
needs is on `main` and in no release, the pin is a commit of `main`: `ORKEON_CHANNEL: source` and
`ORKEON_COMMIT` that commit (`ORKEON_VERSION` the release before it), and for Orkeon Code
`ORKEON_CODE_COMMIT`. A source build carries the version of its sources
(`<version>-src.<commit date>.g<commit>`: the bench's `REFERENCE_ORKEON_VERSION`, with
`REFERENCE_ORKEON_IS_RELEASE` false, and the templates' `OrkeonVersion`), and the statements are
checked on a build of that commit (`orkeon-update.sh --source <commit> --source-dir <dir>`, the CLI
then packed into a tool feed). Step 1 still runs: the release that holds the pinned commit ends the
exception, and so does any later release. Orkeon left it at its release 1.3.0 (2026-11-18, which holds
1b480bd), Orkeon Code at its release 1.0.0-rc.3 (2026-11-19, which holds 61c72f8): every pin is a
release again, `ORKEON_CODE_COMMIT` empty.

### The image is built and validated only on the user's explicit request

Never on your own initiative (D74), even after a migration: no `docker build` of `.devcontainer/`, no
`gh workflow run`/`gh run rerun` of `image.yml`, no substitute validation (Orkeon packed from the tag,
then templates, bench and evals run as "the image's checks"). A request ("build the image",
`/ws-image`) covers one build. When a build would be due (migration, `Dockerfile`, start-up scripts),
say so in the report with the commit and the command.

A push touching `.devcontainer/**` (its `README.md` excepted) or the workflow starts `image.yml` on
GitHub by itself: a pull request builds only, a push to `main` publishes and moves `:latest`, a `vX.Y.Z`
tag publishes a versioned image. Announce it before the push and follow it.

When asked, resolve the releases again (a pin behind one is built only if the user confirms), then:

```bash
v() { sed -n "s/^ *$1: *//p" .github/workflows/image.yml | tr -d '"'; }
docker build --build-arg ORKEON_CHANNEL=$(v ORKEON_CHANNEL) --build-arg ORKEON_SOURCE_REF=$(v ORKEON_COMMIT) \
  --build-arg ORKEON_VERSION=$(v ORKEON_VERSION) --build-arg ORKEON_REFRESH=$(v ORKEON_COMMIT) \
  --build-arg ORKEON_CODE_VERSION=$(v ORKEON_CODE_VERSION) --build-arg ORKEON_CODE_COMMIT=$(v ORKEON_CODE_COMMIT) \
  --build-arg ORKEON_STUDIO_VERSION=$(v ORKEON_STUDIO_VERSION) -t orkeon-workshop .devcontainer
```

**Validated** = that build green: the pinned Orkeon installed (the released CLI, or built from the
pinned commit) and its packages packed from the same sources, Orkeon Studio built from its tag, Orkeon
Code (its release, or built from the pinned commit) installed on the `orkeon-repl` of the release, the
templates' self-check, the bench tests and the strict evals — one red case fails it. Without Docker, propose the
checks above on a local build of the same commit, run them only if the user agrees, and say the image
was not built. Report what was built, on which commit, the result and the log.
