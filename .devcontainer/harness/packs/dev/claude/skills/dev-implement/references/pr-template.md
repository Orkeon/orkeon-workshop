# Pull request of a batch — body template (D71)

> Reference of `closing.md` § 4, point 5, read by `/dev-implement`, `/dev-verify` and `/dev-batches`.
> Written to `<work>/pr-<code>-F<n>/PR.md` — `<work>/pr-<code>/PR.md` for the one pull request of a
> `/dev-batches` run, one `## Batch` section per merged batch (`closing.md` § 7, D79) —, then passed as `--body-file`. Every value comes from the
> closing summary (`closing.md` § 3) or the `dev-batch` report — never from a re-read of the diff. A
> section with nothing to say keeps its heading and reads `None.`; no section is removed or added. The
> title of the pull request is the commit subject, not part of this body.

```markdown
## Batch

`F<n>` of `<CODE>` — <the sheet's Intent sentence>. Ids covered: `<BR-nn, UC-nn, CH-nn…>`.
Plan: `<work>/<code>/<CODE>-PLAN.md`; sheet: `<work>/<code>/<CODE>-PLAN-F<n>.md`; verdict: `<work>/<code>/<CODE>-VERIFY-F<n>.md`.

## Files, per layer

- Domain: `<path>` (created | changed) …
- Application: …
- Infrastructure: …
- WebAPI: …
- Tests: …

## Validations

- `<command>` — exit 0, scope <filter or whole suite>, <n> tests
- `<command>` — exit 0, …
- Not run: <suite> — <reason> | None.

## Assumptions to validate

| Id | Assumption | To be validated by |
|----|------------|--------------------|
| H1 | … | … |

## Audit

Verdict: **VALID** (`<CODE>-VERIFY-F<n>.md`, <YYYY-MM-DD>). Minors carried over, for the reviewer:

| Severity | Axis | Finding | Evidence |
|----------|------|---------|----------|
| Minor | … | … | `<path:line>` |

Reported without fixing: `<path:line>` — <what> | None.

## Not run

<a suite left out and why, a check the container could not make> | None.
```
