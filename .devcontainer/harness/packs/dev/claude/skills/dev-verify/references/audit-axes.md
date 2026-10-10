# Audit axes, severities and report

Read by `dev-auditor`. The axis labels and severities are written verbatim in the report; `/dev-learn`
groups gaps by them.

## Order of work

1. Open the capture once, bounded. It holds `git status`, `git diff --check`, the changed files, the
   batch diff, the build exit code and the gate result: never re-establish any of it.
2. From the sheet take the owning aggregate, invariants, consistency, access cost, applied ids and the
   tests named per step. Never rebuild the design from the code.
3. Walk the diff **hunk by hunk** and tie each to an id or a sheet step. Read a file only around a hunk
   an axis needs, bounded. Everything independent goes in one message: a turn is a billed round trip.
4. Run the validations of § 3, then report.

`resume`: the scope is the previous gap table plus the diff since; skip every axis no gap touches.

## 1. Axes — code first, then its tie to the sheet

| Axis | A gap is | Evidence required |
|------|----------|-------------------|
| Correctness | an untreated error path or absence; a wrong boundary; an order of operations leaving an invalid state; a swallowed exception; a silent default masking a failure; a write to more than one aggregate outside DDD-08 | a concrete scenario, `input X → wrong behaviour Y` |
| Reuse | a type, service or method created while an existing one covers the need, or 80 % of it | the existing element, `path:line` |
| Simplification | a defensive branch an invariant of the batch makes impossible — or an invariant announced that removes nothing; a wrapper or mapping with one caller; dead code the batch introduced; a parameter never read; an abstraction with one implementer | the line and its effect |
| Cost | an IO call inside a loop over the input; an unbounded read; one call per element; a bound different from the sheet's (then a `Plan` gap) | the line |
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

The capture already holds the build: read its exit code, never re-run it. Then the narrowest test runs
that prove the batch: the test classes the sheet names (`commands.test` narrowed), and the integration
tests of the adapters the diff touches (`commands.test_integration` narrowed). `full` adds the whole fast
suite. Never the whole integration suite. Green only on exit `0`; tell a test not run, skipped and failed
apart; give each command its scope.

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
