---
name: dev-learn
description: Turns the gaps /dev-verify keeps finding across batches (todo/*/*-VERIFY-F*.md) into a rule, a check or a charter line that prevents them, retiring the lines they make useless - written only once you accept each proposal.
argument-hint: "[axis, e.g. Plan | Conventions]"
disable-model-invocation: true
---

# /dev-learn — from recurring gaps to what prevents them

A gap fixed inside its batch leaves no trace but its verdict file: the next batch repeats it, the auditor
finds it again. You draw the **recurring** motifs out of the verdict files and propose, for each, the
narrowest line or check that would have caught it. Nothing is written before the user accepts it. Run
after `/clear`, never during a batch; one axis at a time.

Arguments: $ARGUMENTS

## 1. Backlog

`python3 .claude/skills/dev-learn/scripts/learn-candidates.py` — untreated `Blocking` and `Major` gaps
per axis, their batch count, the motifs already refused. An axis in the argument: that one only.
Otherwise the axes with three batches or more, most batches first. None: say so and stop.

## 2. One axis

`python3 .claude/skills/dev-learn/scripts/learn-candidates.py --axis <Axis>` lists its rows, oldest first.
Group them into **motifs** (one root cause, whatever the wording). Keep a motif only when it passes all
three filters — otherwise drop it and name the filter in one line:

- **Recurrence**: three distinct batches or more.
- **Prevention**: the line names something an agent or a check can apply, and would have flagged each
  row before the audit. "Handle null" prevents nothing: `Correctness` rows rarely form a motif.
- **New**: not refused before, not already prevented by a rule, a check or a test.

At most three motifs per axis.

## 3. Destination — the narrowest owner

| Motif | Destination |
|---|---|
| A convention of the repository (layer, naming, test, forbidden API) | the repository's own guidance or check — its contribution guide, an analyzer, an architecture test — written in the checkout; or its repository pack's rule |
| A sheet written incomplete | the plan template of `dev-plan` |
| A mistake the coding agents repeat | `dev-implement`'s `references/common-rules.md` |
| What the auditor misses or misjudges | `dev-verify`'s `references/audit-axes.md` |
| Checkable without judgement | a test or analyzer of the repository, or the gate `dev-verify/scripts/audit-capture.sh` |

A check beats prose whenever both fit. **Harness files are never edited in place**: `.claude/skills/`,
`.claude/agents/` and `.claude/rules/` are rewritten by the next synchronisation. A harness destination
is handed over as an exact patch — the file in the orkeon-workshop repository
(`.devcontainer/harness/packs/dev/claude/…`, `.devcontainer/harness/packs/repo-<name>/claude/rules/…`),
the line removed, the line added — for the user to apply there.

## 4. Reconcile

`grep -n` the motif's key term in its destination, then a bounded read of that section. One status per
motif: `covered` (already said — propose a check instead, or drop), `refines` (rewrite the close line,
never add a second), `replaces` (the existing line caused the gaps), `new` (one line). Each kept motif
also flags as `retire` the line it makes useless — a prose line its check now enforces, a line its
rewrite duplicates — quoted exactly; nothing else is retired.

## 5. Confirm, then write

One AskUserQuestion per axis, `multiSelect: true`, one option per motif and per `retire`: a label of five
words at most; the description gives the batch count, status, destination and the exact line added (and
removed). An option left unselected is refused. Then:

1. Accepted: apply it in the checkout, or print the patch for a harness destination.
2. Refused: `learn-candidates.py --refuse "<motif>"` (a refused `retire`: `--refuse "keep: <line>"`).
3. Axis done: `learn-candidates.py --treat-axis <Axis>`.

## 6. Output

Per axis, one table — `| Motif | Batches | Status | Decision | Destination | Lines |` — then the
remaining backlog from `--count`, or `Backlog empty.` Nothing is committed: the user does it.
