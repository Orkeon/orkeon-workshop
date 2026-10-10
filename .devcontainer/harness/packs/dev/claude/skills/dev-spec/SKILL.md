---
name: dev-spec
description: Step 1 of the dev chain - writes a short, testable business spec of a feature (todo/<code>/SPEC-<code>.md) after settling its decisions with you one at a time, then has adversarial-reviewer try to refute it. No design, no code.
argument-hint: "<code> [the feature, or the path of a brief]"
disable-model-invocation: true
---

# /dev-spec — the business spec of a feature

Step 1 of the dev chain (`/dev-spec` → `/dev-plan` → `/dev-implement` → `/dev-verify`). You turn a
feature into a spec a business expert can proofread: use cases, business rules, data, states, scope.
**Nothing technical**: no class, type, file, table, framework, pattern. Design is `/dev-plan`'s.

Arguments: $ARGUMENTS

## 1. Where

- `<code>`: kebab-case, from the argument; otherwise ask it (AskUserQuestion). The folder is
  `todo/<code>/` at the top of the checkout (excluded from git by the harness); the spec is
  `todo/<code>/SPEC-<code>.md`. An existing spec is revised, never written over.
- A repository pack, when one is deployed, is `.claude/harness/packs/repo-*/references/repo.yaml`
  (zero or one): read `product` and `docs` from it for the vocabulary. Nothing else is needed here.

## 2. Settle the decisions — before writing

1. Read the brief. What the code already answers is looked up, not asked: delegate the look to one
   `Explore` subagent (`model: "haiku"`, a `description`) with a bounded contract — the existing
   concepts, behaviours and vocabulary the feature touches, as a `path:line` table, 30 lines at most.
   Never sweep the source tree from here.
2. Ask what the code cannot answer, **one decision per question** (AskUserQuestion, the recommended
   answer first, marked `(recommended)`), branch by branch: the answer to one changes the next.
   A business constraint (regulation, standard, commitment, behaviour that must survive) is a decision
   too and lands as a business rule carrying its origin. A technical constraint belongs to `/dev-plan`.
3. Challenge the scope only when an answer would cut it — at most three questions: a smaller scope
   that still proves the need, a simpler path (configuration, an existing behaviour extended), value
   worth the complexity. Skip when the interview already settled it.
4. Stop asking when no open decision would change a use case, a rule, the data, a state or the scope.
   What stays open is `TBD` in the body and a row of `## Open questions`.

## 3. Write

Read `references/spec-template.md` and follow it: its sections, ids (`UC-nn` use cases, `BR-nn`
business rules), verbosity budget and self-check. Write the spec in one `Write`.

## 4. Adversarial review

You wrote it, so you read what you meant. Delegate one fresh reading: `Agent` with
`subagent_type: "adversarial-reviewer"`, a `description`, a prompt starting `mode: spec todo/<code>/SPEC-<code>.md`.

- `## Review — CLEAR`: go on.
- `## Review — GAPS`: each row becomes a row of `## Open questions` with its severity, merged with a
  row that already asks the same thing.
- Then every `Blocking` row, one at a time (AskUserQuestion, recommended answer first). An answer is
  written into the body (rule, use case, data, scope) and its row removed. `Major` rows stay for you or
  for `/dev-plan` to carry as assumptions.

## 5. Stop — you validate

Show in a few lines: the use cases and rules (ids and names), the open questions left and their
severity, the assumptions. Then stop: the spec is yours to read and validate. `/dev-plan` refuses to
start while a `Blocking` open question remains.

`→ Next step, once you have validated the spec: /dev-plan <code>`

Talk in the user's language; the spec is written in English unless the user asks otherwise. Nothing is
committed: `todo/` stays out of git.
