# Change brief template, budget and self-check

Read by `/dev-change` before writing `<work>/<code>/CHANGE-<code>.md`, and again on a revision. The brief
is to a technical change what the spec is to a feature: `/dev-plan` reads one or the other, and the
ids it carries (`CH-nn`) are traced, tested and carried as traits exactly like `BR-nn` and `UC-nn`.

## Writing rules

- Facts first: a reproduction that ran, a number that was read, a `path:line` that was opened. A
  belief about the cause is written as such (`suspected`), never as a fact.
- **No design**: no new type, file, pattern or library. Where the fix lands is `/dev-plan`'s; the brief
  says what is observed, what is expected and what must survive.
- **What must not change** is named test by test: an existing behaviour nobody pinned is the first
  thing the plan pins (a characterisation test, green before the change). Left unnamed, it is not
  protected.
- Each fact lives in exactly one place. **An empty section is deleted**, heading included.
- Unsettled: `TBD` in the body, and a row of `## Open questions`.
- Budget: one page, two for a refactor that touches several call sites. A criterion is one line.

## Structure

```markdown
# <CODE> — <Name> — <bug | refactor | perf>

> Two or three sentences: what is wrong or costly, where it shows, why it is worth changing now.

## 1. Origin
Issue `#n` of `<origin>`, `contrib/<slug>/RECORD.md`, a quality report, an audit, a session — one line,
quoted when it is a text.

## 2. Evidence
**bug**: the reproduction — command or test, input, observed, expected, exit code — and the output file;
the suspected cause as `path:line`, marked `suspected`.
**perf**: what was measured, how, on which input, the number before; the `Cost:` line of access-cost.py
on the files concerned.
**refactor**: the smell and its `path:line` (a rule coded twice, a dependency the wrong way, a method
nobody can name, a loop over ports), and the cost it carries today.

## 3. Acceptance
### CH-01 — <Short name>
- **Statement** (testable, yes or no) · **Proof**: the test that reproduces, the measurement after
  and its target, or "no observable behaviour changes" · **Severity** (blocking / warning)
A bug has at least one criterion that is the reproduction turned green; a perf change at least one
with a number or a `Cost:` line as target; a refactor at least one that pins "nothing observable
changes" on the behaviours of § 4.

## 4. What must not change
| Behaviour | Pinned by |
|-----------|-----------|
| <observable behaviour> | `<TestClass>.<Method>` / `unpinned` |
From the inventory, test by test. `unpinned` is a row the plan turns into a characterisation test.

## 5. Scope
| In | Out |
|----|-----|
What the change touches (areas, from the inventory) and what is left for another change, with where it
is decided.

## 6. Constraints
Technical facts the plan must honour: a public signature (`PublicAPI.Unshipped.txt`), a stored format, a
compatibility, a configuration key, a documented behaviour. One line each, with its source.

## 7. Assumptions
| # | Assumption | To be validated by |
What was assumed for lack of an answer — not an open question.

## 8. Open questions
| # | Severity | Question | Impact | Options |
Every `TBD` of the body. Severity `Blocking` or `Major`, verbatim.
```

## Self-check, after writing — fix what fails

- **Kind**: a `bug` has a reproduction that ran and failed; a `perf` has a number before and a target;
  a `refactor` changes no observable behaviour and says which tests prove it.
- **No design**: no new type, file, pattern or library named as the fix; a `path:line` names what is,
  never what will be.
- **Consistency**: every `CH-nn` is testable and has a proof; no criterion contradicts a row of § 4;
  every `TBD` is a row of `## Open questions`.
- **Protection**: every behaviour of the area the inventory listed is a row of § 4, pinned or
  `unpinned`.
- **Routing**: nothing in the brief is a new promise; otherwise it is a feature and `/dev-spec` writes it.
