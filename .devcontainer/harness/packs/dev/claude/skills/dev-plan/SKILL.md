---
name: dev-plan
description: Step 2 of the dev chain - turns a validated spec or change brief into a technical plan split into batches (<work>/<code>/<CODE>-PLAN.md and one <CODE>-PLAN-F<n>.md sheet per batch) with traced rules, named tests and exact paths, then has adversarial-reviewer refute it.
argument-hint: "<code> | <path of SPEC-<code>.md or CHANGE-<code>.md>"
disable-model-invocation: true
---

# /dev-plan — from a spec or a change brief to batches

Step 2 of the dev chain, after `/dev-spec` (a feature) or `/dev-change` (a bug, a refactor, a perf
change). The plan says **what, why, where and in which order**; it holds no code — no
method body, no assertion, no SQL. `/dev-implement` copies its names and paths, it searches nothing.

Arguments: $ARGUMENTS

## 1. Gate and inputs

1. The source: `<work>/<code>/SPEC-<code>.md` or `<work>/<code>/CHANGE-<code>.md` (from the argument,
   else `ls <work>/*/SPEC-*.md <work>/*/CHANGE-*.md`, several → ask). **Before any other read**, list its
   open blocking questions:
   `awk '/^## .*Open questions/{p=1;next} /^## /{p=0} p && /\| *Blocking *\|/' <source>`. One line →
   stop, list them, end with `→ Open blocking questions: settle them with /dev-spec <code>.` (or
   `/dev-change <code>` for a brief).
2. Read the source whole, then `references/design-rules.md` (the `DDD-`, `APP-`, `PERF-` ids every plan
   classifies) and `references/plan-template.md`.
3. Repository values: `.claude/harness/packs/repo-*/references/repo.yaml` (zero or one) — `layout`
   (where production and test projects live) and `commands.build`, `commands.test`,
   `commands.test_integration`. A key that is absent is asked once (AskUserQuestion) with the key of a
   repository pack that would have given it; the answer is written on the `Commands` and `Layout`
   lines of the global plan's `## 1. Scope`, which later steps read instead of asking again. The
   layer rules of the repository (`.claude/rules/*.md`, loaded by path) give its conventions: do not
   restate them in the plan.

## 2. Inventory — delegated

Never read the source tree from here: delegate to one `Explore` subagent (`model: "haiku"`, a
`description`), with this contract:

```text
Work: <name> — source: <work>/<code>/SPEC-<code>.md | CHANGE-<code>.md — need: <one sentence>
Return `path:line` tables, 60 lines at most, no code excerpt:
1. Domain types (aggregates, entities, value objects, ports) reusable for the need — exact names
2. Use cases or services owning the same business act or a similar one
3. Test anchors: for each item of 1 and 2, its test class, fixture and the doubles it uses
4. Local conventions of the area (naming, folder layout), one line each
```

Then one technical question at a time (AskUserQuestion, recommended answer first) only where the
answer removes work: ship without a new type, extend what covers 80 % of the need, defer part of the
scope. Never plan around an open blocking question.

## 3. Split and write

- Batches are **functional**, cross-layer, each deliverable with the build green; `sequential` by
  default, `parallelisable with F<m>` only when they share no type, file, fixture or configuration.
  Each sheet's `**Depends on**` line names the batches it needs done first, `[none]` when free: what
  `/dev-batches` reads to run batches at once (D70).
  A change brief is usually one batch; its `unpinned` rows come first, as characterisation tests
  (`references/plan-template.md`, "Rules for steps").
- Write `<work>/<code>/<CODE>-PLAN.md` (compact: one row and one step list per batch) and one sheet
  `<work>/<code>/<CODE>-PLAN-F<n>.md` per batch, exactly as `references/plan-template.md` shapes them.
  A fact lives in one of the two, never both.
- Walk the template's self-check; fix what fails.

## 4. Adversarial review

`Agent` with `subagent_type: "adversarial-reviewer"`, a `description`, a prompt starting
`mode: plan <work>/<code>/`. A `Blocking` row: fix the plan, or ask the user when the answer is theirs.
A `Major` row: fix it, or keep it with one line under the sheet's `## Decisions` saying why. Never
re-run the review on the corrected plan.

## 5. Stop — you validate

Summary in a few lines: batches (intent, ids, order), ids traced, files written, review rows and how
each was settled. Then stop.

`→ Manual plan validation required. Once validated: /dev-implement F1 <work>/<code>/<CODE>-PLAN.md`
