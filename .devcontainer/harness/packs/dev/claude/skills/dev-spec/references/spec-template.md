# Spec template, budget and self-check

Read by `/dev-spec` before writing `todo/<code>/SPEC-<code>.md`, and again on a revision.

## Writing rules

- One sentence when one suffices; a table over prose; no introduction. Each fact lives in exactly one
  place: a use case, or a business rule, or a cross-cutting behaviour — never two of them.
- **An empty section is deleted**, heading included. No "Not applicable".
- Every business rule names its **origin** (regulation, standard, practice, product choice, existing
  behaviour), briefly. A rule owned by another system (identity provider, external catalogue) names
  **that authority** and what the product only consumes: it is cited, never restated.
- **What must not break** is a business rule with origin `existing behaviour`. Left unnamed, it is not
  tested.
- Unsettled: `TBD` in the body, and a row of `## Open questions`.
- Budget: a few minutes of reading, one to three pages. A nominal scenario has at most seven steps; a
  rule statement is one line; the expected outcome is written only when the scenario does not make it
  obvious.

## Structure

```markdown
# <CODE> — <Name>

> Two or three sentences: what, for whom, why.

## 1. Context
The problem, for whom, the cost of doing nothing. Two to four sentences.

## 2. Vocabulary
| Term | Definition |
Specific or ambiguous terms only.

## 3. Overview
One fenced `mermaid` flowchart: entry points, the main decision, lifecycle states, business labels only,
`UC-nn`/`BR-nn` in parentheses. Deleted when the feature has neither branch nor lifecycle.

## 4. Use cases
### UC-01 — <Name>
**Actor** · **Intent** (one sentence) · **Frequency**
**Nominal scenario:** numbered steps.
**Variants:** … **Errors:** behaviour on failure.
**Expected outcome:** the observable final state — only when not obvious.

## 5. Business rules
### BR-01 — <Short name>
- **Statement** (testable, yes or no) · **Origin** · **Severity** (blocking / warning / informational)
- **Applies to**: UC-nn, or `cross-cutting`.
- Compliant / non-compliant example, only when not obvious.

## 6. Data
| Datum | Description | Source | Importance |
Source: entered / computed / imported / catalogue. Importance: essential / secondary / expert.

## 7. States and transitions
| State | Event | Next state | Condition |
Only when the concept has a lifecycle. Business states, no enum.

## 8. Cross-cutting behaviours
Only what fits neither one use case nor one rule: defaults, cascades, duplication.

## 9. Relations
| Upstream | Downstream |

## 10. Out of scope
| Exclusion | Reason |

## 11. Assumptions
| # | Assumption | To be validated by |
What was assumed for lack of an answer — not an open question.

## 12. Open questions
| # | Severity | Question | Impact | Options |
Every `TBD` of the body. Severity `Blocking` or `Major`, verbatim.
```

## Self-check, after writing — fix what fails

- **Business purity**: no class, type, file, table, framework, pattern, HTTP status, exit code. A
  non-developer expert can read every line.
- **Consistency**: every use case has an actor, an intent and a nominal scenario; every rule is
  testable and has an origin and a severity; no rule contradicts another or a use case; every
  `UC-nn`/`BR-nn` cited exists; every vocabulary term is used.
- **Completeness**: the lifecycle is covered (create, read, change, withdraw — as relevant); errors and
  edges where they matter; every `TBD` is a row of `## Open questions`; every rule is precise enough to
  give it an owner later, without naming that owner.
- **Code alignment** (a signal, not a veto): a concept that already exists under another name, or a
  capability that already exists, is named in `## Relations` or `## Assumptions` from the inventory's
  `path:line` — the spec itself stays free of them.
