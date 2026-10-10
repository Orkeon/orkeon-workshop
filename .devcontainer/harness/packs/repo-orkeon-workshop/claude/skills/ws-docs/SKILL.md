---
name: ws-docs
description: "Checks the bilingual documentation of orkeon-workshop: French mirror parity, both toc.yml and indexes, relative links and anchors of every Markdown file, Mermaid, then the docfx site build."
argument-hint: "[<base commit>]"
disable-model-invocation: true
---

# /ws-docs — the documentation and its site

The rules are `CLAUDE.md` § "Conventions" (the French mirror) and the end of § "Checking a change";
the values are under `docs_mirror`, `manual_checks.docs` and `commands.docs_checks` in
`.claude/harness/packs/repo-orkeon-workshop/references/repo.yaml`. This skill checks and reports; it
translates and fixes nothing unless asked.

Arguments: $ARGUMENTS (the base to compare with; none: the merge base with `main`)

## 1. Mirror, tables of contents, indexes

- Every page under `docs/` has its page under `docs/fr/`, and `README.md` has `README.fr.md`, except
  `docs_mirror.english_only`.
- An English page changed since the base whose French page did not change: listed.
- A page added, moved or removed since the base: present, moved or gone in both `toc.yml` and both
  indexes.

## 2. Links, anchors, diagrams — in a subagent

The items of `manual_checks.docs`. A `general-purpose` subagent (a `description`, an explicit
`model`) checks every relative link and `#anchor` of every tracked Markdown file (`git ls-files
'*.md'`, hidden folders included) against the GitHub heading slugs, and reports each broken one as
`file:line target`. Mermaid: with `mmdc` on the `PATH` it renders each diagram of the changed pages;
without it, Mermaid is reported not checked.

## 3. Site

Run `commands.docs_checks[0]` in a subagent: it installs docfx at `DOCFX_VERSION` of
`.github/workflows/docs.yml` once, in a cache folder, then builds the site. It fails on a broken link,
a broken anchor, or a `toc.yml` entry without its page. No `dotnet`: not run.

## 4. Report

One table — check, result, findings — then the findings as `file:line`. Commit and push stay with
the user.
