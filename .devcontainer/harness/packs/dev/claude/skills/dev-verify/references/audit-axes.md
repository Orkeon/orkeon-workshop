# Audit axes, severities and report

Read by `dev-auditor`. The axis labels and severities are written verbatim in the report; `/dev-learn`
groups gaps by them.

## 0. Two passes — mechanical first, judged second (D72, D80)

An audit has a mechanical half — what a grep or a count decides from the capture and the sheet — and a
judged half — what needs the code read around a hunk. The gate script makes the first, an agent the
second, in that order:

| Pass | By | Does | Returns |
|------|----|------|---------|
| mechanical | `audit-capture.sh` (the gate, D80) | the checks of § 0.1, from the sheet, the capture's own sections and one `git grep --untracked`; green gate only | the capture's section `Mechanical audit — F<n>`, a table `\| Axis \| Check \| Result \| Evidence \|`, `Result` one of `ok`, `gap`, `not checked` |
| judged | `dev-auditor` (opus) | the axes of § 1 on the hunks, from that section: a row `ok` is never re-established, a row `gap` becomes a gap row of the verdict with its axis's severity, a row `not checked` is checked here — `Conventions` always | `## Audit — VALID \| GAPS` (§ 4) |

### 0.1 The mechanical checks

One row per check, `Evidence` a `path:line`, an id or the capture section that decides it. The gate fails
on the checks marked *gate*: green, they are `ok` by construction.

| Axis | Check | ok when |
|------|-------|---------|
| Build | the capture's `build` section | `exit: 0` (reused or run); another exit is `gap`; no `--build` is `not checked` |
| Test | every id of the sheet's `## TDD sequence` is carried by a test as `[Trait("<name>", "<id>")]` (*gate*) | the capture's `rule traits` section lists each id; no `--trait` is `not checked` |
| Test | every test method the step tables name (their `Test` column) exists in the test roots (`git grep -n --untracked -w`, the build outputs excluded: never a `grep -r`, which reads every build output of the roots) | each method found, `path:line`; a missing one is `gap`, named |
| Test | the last test run (`--test-log`): its summary lines (`Failed: n, Passed: m`, or `failed:` / `succeeded:`) and its `exit=` line, in the tail the capture shows | none failed and `exit=0`; red is `gap`; no log is `not checked` |
| Scope | every changed file is under the roots, under the plan folder, or named by the sheet (*gate*) | no file outside |
| Cost | the capture's `access cost` section | `exit: 0`; `exit: 2` is `gap` with the flagged lines; `exit: 3` is `not checked` |
| Conventions | the layer rules of the changed layers (`.claude/rules/*.md` whose `paths:` match a changed file) | always `not checked` — the judged pass (`dev-auditor`) |
| Plan | every `TDD:` line of the sheet is ticked (*gate*) | none open |
| Plan | every design id is on an `Applied rules` row of the plan folder or on `Non-applicable rules` (*gate*) | all classified |
| Plan | every id of the sheet's `Applied rules` row is an id of `design-rules.md` | all found; an unknown one is `gap`, named |

What a check cannot decide is `not checked`, with the reason — never `ok` by default.

## Order of work (the judged pass)

1. Read the capture by name, never by `sed -n`: its map first, `python3 <harness>/scripts/code-map.py
   outline <capture>` (its sections and one `diff/<file>` entry per changed file, each with its lines and
   tokens), then `show <capture> "<section>"` for a section you need and `show <capture> "diff/<file>"`
   for the hunks of one file you judge — each once (S1 of the reading plan). It holds `git status`, `git diff --check`, the changed files, the
   batch diff, the build exit code, the access cost of the changed production files (`access-cost.py
   --diff`: every port call in a loop, a lambda or a memory filter, added lines flagged, pre-existing ones
   marked), the rule traits found for the sheet's ids, the last test run, the test classes per changed
   file, the gate result and the mechanical table (§ 0, `show <capture> "Mechanical audit"`): never
   re-establish any of it. Take its `ok` rows as settled, carry its `gap` rows into your table, check its
   `not checked` rows.
2. From the sheet take the owning aggregate, invariants, consistency, access cost, applied ids and the
   tests named per step. Never rebuild the design from the code.
3. Walk the diff **hunk by hunk** and tie each to an id or a sheet step. Read a file only around a hunk
   a judged axis needs — Correctness, Reuse, Simplification, Placement, the judged half of Test, Plan and
   Scope —, bounded. Everything independent goes in one message: a turn is a billed round trip.
4. Run the validations of § 3, then report.

`resume`: the scope is the previous gap table plus the diff since; skip every axis no gap touches.

## 1. Axes — code first, then its tie to the sheet

| Axis | A gap is | Evidence required |
|------|----------|-------------------|
| Correctness | an untreated error path or absence; a wrong boundary; an order of operations leaving an invalid state; a swallowed exception; a silent default masking a failure; a write to more than one aggregate outside DDD-08 | a concrete scenario, `input X → wrong behaviour Y` |
| Reuse | a type, service or method created while an existing one covers the need, or 80 % of it | the existing element, `path:line` |
| Simplification | a defensive branch an invariant of the batch makes impossible — or an invariant announced that removes nothing; a wrapper or mapping with one caller; dead code the batch introduced; a parameter never read; an abstraction with one implementer | the line and its effect |
| Cost | an IO call inside a loop over the input; an unbounded read; one call per element; a bound different from the sheet's (then a `Plan` gap) | the line — the capture's access cost section names it, with the receiver and the method |
| Placement | a business rule carried by a use case, an adapter or an entry point instead of the domain object that owns it; a rule owned by another system restated here; a bound re-coded away from its owner | the line and the owner it belongs to |
| Conventions | a rule of the repository's layer rules broken (`.claude/rules/*.md` loaded by the files you read): a forbidden dependency, a forbidden API, a naming or folder convention, an undeclared public API | the line and the rule |
| Test | a behaviour without the test its step names; a test that observes nothing the id states; a wrong level — an adapter hunk without an integration test or a written waiver; a test modified during GREEN | the test or the uncovered hunk, `path:line` |
| Plan | an id with no code owner; a design id neither applied nor `N/A — reason`; a `TDD:` tick with no evidence; a decision settled mid-batch and missing from `## Assumptions` | the id and where the evidence is missing |
| Scope | a hunk tied to no id and no step; a refactor, rename or reformat of code the batch had no reason to touch; an adjacent bug fixed in passing; flexibility nobody asked for | the hunk, `path:line` |

- **Worsened**: a pre-existing defect the batch makes one step worse (one more call in an existing loop,
  one more branch in a defensive chain) takes the severity of its axis, `(worsened)` before the gap.
  An untouched pre-existing defect is `Minor`.
- **No evidence, no gap.** Missing evidence is never read in the batch's favour either: say the point
  could not be checked.
- A divergence between code and sheet is classified on its row: *faulty code* (fix the code), *stale
  plan* (fix the sheet, and the spec if an id moves — `Major`, never `Blocking`), or *to arbitrate*
  (both readings hold: the user decides). An id with no code owner is a hole, `Blocking` in all cases.
- Never propose an added comment, an anticipatory abstraction or a rewrite as a fix.

## 2. Severities

- **Blocking** — any `Correctness` gap with its scenario; an id with no code owner; an unclassified
  design id; a red build; an adapter hunk with no integration test and no waiver; a `TDD:` tick with
  no evidence; a forbidden dependency or API of the repository's rules.
- **Major** — missed reuse of a named element; unbounded cost; a rule outside its owner; a stale plan;
  a hunk outside scope; an assumption with no trace; another broken convention.
- **Minor** — a simplification with no functional effect; pre-existing dead code or cost, reported.

`GAPS` as soon as one `Blocking` or `Major` stands; minors are listed under `VALID` without calling it
into question.

## 3. Validations

The capture already holds the build and the last test run: read their exit code and last lines, never
re-run them, never restore (`--no-build` on every test you run, B7). Then the narrowest test runs that
prove what you doubt — not every class the sheet names: `commands.test_class` on a class of the capture's
`test classes per changed file`, and the integration tests of the adapters the diff touches
(`commands.test_integration` narrowed). `full` adds the whole fast suite. Never the whole integration
suite. Green only on exit `0`; tell a test not run, skipped and failed apart; give each command its scope.

## 4. Report — the whole final message, 20 lines at most

```markdown
## Audit — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Blocking | Correctness | empty input → wrong total | `src/…/Order.cs:42` | handle the empty case in the aggregate |

Validations: `<command>` — exit N, scope <filter or whole suite>, <n> tests · Not run: <suite> — <reason>

## DONE
- Files: none
- Ids covered: <ids carrying a gap, or the ids checked>
- Command: `<last validation command>` — exit N
- Notes: Audit — GAPS (<b> Blocking, <m> Major, <k> Minor)
```

`VALID` keeps the same table for its `Minor` rows, or `None.` instead of it. At most eight rows: beyond, the most severe eight and one
line `+<n> more <severity> on <axes>`. Paths, ids, commands verbatim, in backticks. No preamble, no
pasted log: on a failure, at most three useful lines of it.
