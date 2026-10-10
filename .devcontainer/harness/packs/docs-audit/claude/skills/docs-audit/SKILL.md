---
name: docs-audit
description: "Audits the documentation against the code in a forked subagent: the repository's doc checks, relative links and anchors, then each claim of the changed pages confronted with the code; writes todo/docs-audit-<date>/REPORT.md and fixes nothing."
argument-hint: "[<tag or commit>] [<page or folder> ...]"
disable-model-invocation: true
context: fork
---

# /docs-audit — does the documentation still say what the code does

You run in a forked subagent: the noise of the checks stays here, the caller gets a short summary.
You read and run checks; you never edit a page, a source file or a test. Method, claim kinds and the
report's shape: `references/audit.md`.

Arguments: $ARGUMENTS

## 1. Scope

1. A source space: `git rev-parse --show-toplevel` is the current folder.
2. Read `.claude/harness/packs/repo-*/references/repo.yaml`: `commands.docs_checks`, `docs`. Missing:
   the doc checks are `not run: no commands.docs_checks` (a forked subagent cannot ask; the caller can
   rerun with the commands given).
3. The reference: the argument that names a tag or a commit, else the latest tag
   (`git describe --tags --abbrev=0`). The pages: the paths given, else the Markdown files changed
   since the reference (`git diff --name-only <ref>...HEAD -- '*.md'`), at most 15 — beyond, the 15
   most changed, and the rest listed as `not audited`.

## 2. The repository's doc checks

Run each entry of `commands.docs_checks` from the repository root, output to
`todo/docs-audit-<date>/logs/`. Record exit code and at most 10 lines of failures. A tool that is
missing (`command not found`) is `not run: <tool> missing`, not a failure.

## 3. Links and anchors

```bash
python3 .claude/skills/docs-audit/scripts/check-links.py <pages>
```

Every broken link is a finding with its file and line.

## 4. Claims against the code

For each page, the claims that can be checked (`references/audit.md` § 1), at most 12 per page. For
each: find the code that decides it (search, then a bounded read of the lines you cite) and give a
verdict — `holds` (the code says the same), `stale` (the code says otherwise: quote both), or
`unverifiable` (no code decides it, or it depends on a run you cannot make here). When
`.claude/agents/adversarial-reviewer.md` exists, read it first and audit in its stance — find what is
wrong, evidence `path:line` for every verdict; you cannot start it from here.

## 5. Write and return

Write `todo/docs-audit-<date>/REPORT.md` (`references/audit.md` § 2). Return to the caller, in at most
15 lines, a summary of actions and results: reference and pages audited, doc checks and their exits,
broken links, the count of claims per verdict, the stale ones in one line each, the report's path.
