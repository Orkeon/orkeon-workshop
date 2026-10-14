---
name: ws-docs
description: "Checks the bilingual documentation of orkeon-workshop in a forked subagent: French mirror parity, both toc.yml and indexes, relative links and anchors of every Markdown file, Mermaid, then the docfx site build."
argument-hint: "[<base commit>]"
disable-model-invocation: true
context: fork
agent: ws-runner
---

# /ws-docs — the documentation and its site

You run in a forked subagent (`ws-runner`): the output of the checks stays here, the caller gets the
report alone. The rules are `CLAUDE.md` § "Conventions" (the French mirror) and the end of § "Checking
a change"; the values are under `docs_mirror`, `manual_checks.docs` and `commands.docs_checks` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill checks and reports; it
translates and fixes nothing.

Arguments: $ARGUMENTS (the base to compare with; none: the merge base with `main`)

## 1. Mirror, tables of contents, indexes

- Every page under `docs/` has its page under `docs/fr/`, and `README.md` has `README.fr.md`, except
  `docs_mirror.english_only`.
- An English page changed since the base whose French page did not change: listed.
- A page added, moved or removed since the base: present, moved or gone in both `toc.yml` and both
  indexes.

## 2. Links, anchors, diagrams

The items of `manual_checks.docs`. Check every relative link and `#anchor` of every tracked Markdown
file, hidden folders included, against the GitHub heading slugs:
`git ls-files -z '*.md' | xargs -0 python3 .claude/skills/docs-audit/scripts/check-links.py`
(`check-links.py <file.md | folder> [...]`, its header gives the usage), output to
`${TMPDIR:-/tmp}/ws-docs-links.log`. Only when the `docs-audit` pack is not deployed (no such
script): your own pass. Report each broken one as `file:line target`. Mermaid: with `mmdc` on the `PATH`, render each diagram of the
changed pages, output to `${TMPDIR:-/tmp}/ws-docs-mermaid.log`; without it, Mermaid is reported not
checked.

## 3. Site

Run `commands.docs_checks[0]`, output to `${TMPDIR:-/tmp}/ws-docs-site.log`: it installs docfx at
`DOCFX_VERSION` of `.github/workflows/docs.yml` once, in a cache folder, then builds the site. It
fails on a broken link, a broken anchor, or a `toc.yml` entry without its page. No `dotnet`: not run.

## 4. Report

One table — check, result, findings — then the findings as `file:line`. A fix is the caller's to ask
for. The commit and the push are the main session's, after this report (D71).
