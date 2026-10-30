---
name: dev-plan
description: Step 2 of the dev chain - turns a validated spec or change brief into a technical plan split into batches (<work>/<code>/<CODE>-PLAN.md and one <CODE>-PLAN-F<n>.md sheet per batch) with traced rules, named tests and exact paths, then has adversarial-reviewer refute it.
argument-hint: "<code> [--replace] | <path of SPEC-<code>.md or CHANGE-<code>.md> [--replace]"
disable-model-invocation: true
---

# /dev-plan — from a spec or a change brief to batches

Step 2 of the dev chain, after `/dev-spec` (a feature) or `/dev-change` (a bug, a refactor, a perf
change). The plan says **what, why, where and in which order**; it holds no code — no
method body, no assertion, no SQL. `/dev-implement` copies its names and paths, it searches nothing.

Arguments: $ARGUMENTS

**You write the plan and every sheet yourself**, never through an agent (D75, `delegation-guard`): § 2 is the one delegation.

## 1. Gate and inputs

1. The source: `<work>/<code>/SPEC-<code>.md` or `<work>/<code>/CHANGE-<code>.md` (from the argument,
   else `ls <work>/*/SPEC-*.md <work>/*/CHANGE-*.md`, several → ask). **Before any other read**, list its
   open blocking questions:
   `awk '/^## .*Open questions/{p=1;next} /^## /{p=0} p && /\| *Blocking *\|/' <source>`. One line →
   stop, list them, end with `→ Open blocking questions: settle them with /dev-spec <code>.` (or
   `/dev-change <code>` for a brief). An existing `<work>/<code>/<CODE>-PLAN.md` stops it too:
   `dev-plan: <CODE>-PLAN.md exists: /dev-plan <code> --replace writes a new plan over it (nothing is merged)`.
   `--replace` is refused once a batch is done (a `done` sheet title or `### Batch` line, a ticked `TDD:` box):
   `a started plan is never replaced; plan the rest as a new change`; its new plan never has fewer batches than
   the sheets on disk (one left over would still read as a batch to `/dev-batches` and `/dev-status`).
2. Read the source whole. Then **one message**: the `Explore` of § 2 launched (the source is all it
   needs) beside the reads of `references/design-rules.md` (the `DDD-`, `APP-`, `PERF-` ids every plan
   classifies), `references/plan-template.md` and the repository values of point 3 — it searches while
   you read.
3. Repository values: `.claude/harness/packs/repo-*/references/repo.yaml` (zero or one) — `layout` (where
   production and test projects live; `layout.test_files`, the patterns of tests beside their module) and
   `commands.restore`, `build`, `commands.build_test`, `commands.test_class`, `test`, `test_project`, `test_integration`. A key
   absent is asked once (AskUserQuestion), naming the key that would have given it; the answer goes on the
   `Commands` and `Layout` lines of the global plan's `## 1. Scope`, which later steps read — `build_test`,
   `test_class` and `test_project` with their `<test project>` and `<Class>` placeholders, which
   `/dev-implement` substitutes from `## Anchors` and the step's `Project` column (without them: the build
   of one test project with `--no-restore`, its test with `--no-build` filtered on one class). The layer
   rules (`.claude/rules/*.md`, loaded by path) give the conventions: never restate them in the plan.

## 2. Inventory — delegated

Never read the source tree from here: delegate to one `Explore` subagent (`model: "haiku"`, a
`description`), in the message of § 1.2's reads, with this contract:

```text
Work: <name> — source: <work>/<code>/SPEC-<code>.md | CHANGE-<code>.md — need: <one sentence>
Return `path:line` tables, 60 lines at most, no code excerpt:
1. Domain types (aggregates, entities, value objects, ports) reusable for the need — exact names
2. Use cases or services owning the same business act or a similar one
3. Test anchors: for each item of 1 and 2, its test class, fixture and the doubles it uses
4. Local conventions of the area (naming, folder layout), one line each
```

Then one technical question at a time (AskUserQuestion, recommended answer first) only where the answer removes work:
ship without a new type, extend what covers 80 % of the need, defer part of the scope. Never plan around an open blocking question.

## 3. Split and write

- Batches are **functional**, cross-layer, each deliverable with the build green; one that shares a type, file,
  fixture or configuration with an earlier one depends on it. Each sheet's `**Depends on**` line names the batches
  it needs done first, `[none]` when free: what `/dev-batches` reads to run batches at once (D70). Documentation is
  a batch of its own (GAP-50-55: F12 folded in ran its roles out of turns). A change brief is usually one batch,
  its `unpinned` rows first, as characterisation tests (`references/plan-template.md`, "Rules for steps").
- Write `<work>/<code>/<CODE>-PLAN.md` (compact: one row and one step list per batch) and one sheet
  `<work>/<code>/<CODE>-PLAN-F<n>.md` per batch, exactly as `references/plan-template.md` shapes them.
  A fact lives in one of the two, never both.
- Walk the template's self-check; fix what fails.

## 4. Adversarial review

`Agent` with `subagent_type: "adversarial-reviewer"`, a `description`, a prompt starting
`mode: plan <work>/<code>/`. Each row names its target, `plan` or `F<n>`: a `Blocking` row is fixed there,
or asked of the user when the answer is theirs; a `Major` row is fixed, or kept with one line saying why under
the `## Decisions` of its batch's sheet (a `plan` row: `## 1. Scope`, **Assumptions**). Never re-run the review
on the corrected plan. No review (the agent failed, ran out of turns, or answered without its headings): once
more, then the summary says `review not run (<reason>)` — never `CLEAR`.

## 5. Stop — you validate

Summary in a few lines: batches (intent, ids, order), ids traced, files written, review rows and how each was settled. Then stop.

`→ Manual plan validation required. Once validated: /dev-implement F1 <work>/<code>/<CODE>-PLAN.md — or, for several batches, /clear first, then /dev-batches F1 F2 … <work>/<code>/<CODE>-PLAN.md` (D84: a run launched in this context carries it).
