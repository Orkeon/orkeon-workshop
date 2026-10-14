---
name: dev-verify
description: Step 4 of the dev chain - audits a batch delivered by /dev-implement, read-only and in an isolated subagent (dev-auditor) - code first, then its conformance to the sheet - and writes <work>/<code>/<CODE>-VERIFY-F<n>.md with a VALID or GAPS verdict.
argument-hint: "F<n> [<work>/<code>/<CODE>-PLAN.md] [full | resume]"
disable-model-invocation: true
---

# /dev-verify — the audit of a batch

Step 4 of the dev chain, also run by `/dev-implement` when it closes a batch. A script gates the batch and makes the
mechanical pass — a table of `ok`, `gap` and `not checked` rows in its capture (D80) —; a read-only subagent, `dev-auditor`
(opus), judges the rest from that table in an isolated context (D72: an audit is mechanical first, judged second);
you write the verdict file and relay it. Nothing is fixed here: fixing is `/dev-implement`'s.

Arguments: $ARGUMENTS

## 1. Scope

- The batch `F<n>` and its sheet `<work>/<code>/<CODE>-PLAN-F<n>.md` (plan path from the argument, else `ls <work>/*/*-PLAN-F<n>.md`,
  several → ask). Read the sheet's `## Design`, `## TDD sequence` and `## Test policy and scopes` only, and the `Commands` and `Layout`
  lines of the global plan's `## 1. Scope` (`grep -n`). Absent there: `.claude/harness/packs/repo-*/references/repo.yaml`; absent there too, ask once. The
  trait name comes from `repo.yaml` alone (`tests.rule_trait`, `BR` for Orkeon): without one, the gate does not check the traits.
  Called by `/dev-implement`, inline or in a `dev-batch` agent: what the session already holds of these is not read again.
- Mode: `fast` by default; `full` adds the whole fast suite (never a whole integration suite); `resume` re-audits after a correction — the previous verdict file's gap table and the diff since.

## 2. Gate and capture — one call

```bash
bash .claude/skills/dev-verify/scripts/audit-capture.sh F<n> <sheet> "${TMPDIR:-/tmp}/dev-audit-F<n>.txt" \
  --build "<commands.build>" --build-log "${TMPDIR:-/tmp}/dev-F<n>-build.txt" --test-log "<the last test log, below>" \
  --roots "<production root> <test root>" --trait "<tests.rule_trait>" --build-outputs "<layout.build_outputs>"
```

`--build` is `commands.build`, `--no-restore` included: the batch was restored at its entry, nothing restores here (B7). `--build-log` is the file `/dev-implement` § 3 wrote:
ended green and older than no changed file, the gate reads it instead of building the solution again (B3), else it builds, to the capture; `--test-log` puts the last fifteen lines of the last test run in the capture (B6): `${TMPDIR:-/tmp}/dev-F<n>-test-affected.txt` once a correction round ran, else the whole suite's `dev-F<n>-test.txt`;
its searches never read a build output (`git grep --untracked`, `--build-outputs` left out when the pack has none); run on its own, without those files, leave the two out. Every other `dotnet` you run here
(the fast suite of `full`, a re-run) goes to a file: `<cmd> > "${TMPDIR:-/tmp}/dev-F<n>-<suite>.txt" 2>&1; echo "exit=$?"; tail -15 "${TMPDIR:-/tmp}/dev-F<n>-<suite>.txt"`.

Exit `1` is the gate, red (an open `TDD:` line, an unclassified design id, a changed file outside the batch and absent
from the sheet, a sheet id no test carries as `[Trait("<name>", "<id>")]` — leave `--trait` out when the pack has none —,
whitespace errors): fix what it lists (through `/dev-implement` when it is code) and run it again; no audit while it is
red. Exit `0`: the capture is written — status, changed files, diff, build, access cost (`access-cost.py --diff`), traits, the last test run, the test classes per changed file,
and the section `Mechanical audit — F<n>`: the table `| Axis | Check | Result | Evidence |` of `references/audit-axes.md` § 0.1, one row per check, `ok`, `gap` or `not checked` (D80). Never read it yourself: it is the auditor's.

## 3. The audit — one delegation

`Agent`, `subagent_type: "dev-auditor"`, a `description` (`audit F<n>`), and this prompt:

```text
mode: <fast | full | resume>
batch: F<n> — sheet: <path> — capture: <path of the capture> — applied rules: <the Applied rules row of the sheet> — harness: <the checkout's .claude/, absolute>
commands: test_class `<commands.test_class>` · test `<commands.test>` · test_integration `<commands.test_integration>`
previous gaps (resume only): <the gap table of the previous verdict file>
```

It reads the mechanical table in the capture: an `ok` row settled, a `gap` row carried into its verdict, a `not checked` row checked by it.
Its report opens with `## Audit — VALID` or `## Audit — GAPS`, a table, a `Validations` line, and ends with `## DONE`;
without its headings it goes back to the agent once (`SendMessage`).

## 4. The verdict file

Write `<work>/<code>/<CODE>-VERIFY-F<n>.md` (on `resume`, append a dated section; never rewrite an earlier one). `/dev-learn` reads these files: keep the headings and columns verbatim.

```markdown
# <CODE>-VERIFY-F<n> — <YYYY-MM-DD HH:MM> — <mode>

## Verdict — VALID | GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|

Validations: `<command>` — exit N, scope <filter or whole suite>, <n> tests
Not run: <suite> — <reason>
Measure: duration <hh:mm>, turns <n>, subagents <n>[, context >=<N>k]
```

`VALID` lists its minors under the same columns, or `None.` under the heading. `GAPS` as soon as one `Blocking` or `Major` row stands. `Measure:` only for a batch of `/dev-batches` (the `Notes` of its report).

## 5. Relay

Print the verdict block as written, nothing else. Called by `/dev-implement`: return to its closing. Run on its own, on `VALID`:
commit, push and offer the pull request as `.claude/skills/dev-implement/references/closing.md` § 4 says (D71: `gh auth status` first,
`gh pr create --base <default branch>`, one question unless `HARNESS_PR_AUTO=1`), then print `→ Batch F<n> complete — manual validation required. Run /clear before the next batch.`
On `GAPS`: `→ /dev-implement F<n> — correction: <the first gap>` is the user's to launch.
