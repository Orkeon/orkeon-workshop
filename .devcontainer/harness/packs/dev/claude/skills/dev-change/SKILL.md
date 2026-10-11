---
name: dev-change
description: Technical entry of the dev chain - writes the brief of a bug fix, a refactor or a performance change (<work>/<code>/CHANGE-<code>.md) from evidence, not from a business spec - reproduction, measurement or smell, what must not change, acceptance criteria - then has adversarial-reviewer refute it. No design, no code.
argument-hint: "<code> bug|refactor|perf [the brief, an issue, or contrib/<slug>/RECORD.md]"
disable-model-invocation: true
---

# /dev-change — the brief of a technical change

The technical entry of the dev chain (`/dev-change` → `/dev-plan` → `/dev-implement` → `/dev-verify`),
for what has no business spec to write: a **bug** (a behaviour the product already promises and
breaks), a **refactor** (the same behaviour, a better shape) or a **perf** change (the same behaviour,
a lower cost). A new behaviour, a new rule, a changed promise is a feature: `/dev-spec`. The brief
holds **facts and acceptance**, no design: no new type, no file to create, no pattern. Design is
`/dev-plan`'s.

Arguments: $ARGUMENTS

## 1. Where

- `<code>` kebab-case and the kind (`bug`, `refactor`, `perf`), from the argument; otherwise ask
  (AskUserQuestion). The folder is `<work>/<code>/` - `<work>` the work folder of the checkout, `todo/`
  unless the session start named another (the rule source-space.md, D69); the brief is
  `<work>/<code>/CHANGE-<code>.md`. An existing brief is revised, never written over.
- A repository pack, when one is deployed, is `.claude/harness/packs/repo-*/references/repo.yaml`
  (zero or one): read `product`, `docs`, `commands.test` and `commands.cli` from it. In a source
  checkout the product runs from its sources (`commands.cli`), never from the image's install.
- An origin given in the argument is read whole and quoted, never paraphrased: an issue (`gh issue view
  <n> --repo <origin>`), a contribution record (`contrib/<slug>/RECORD.md`: its reproduction is the
  bug's), a quality report or an audit under `<work>/`.

## 2. Establish the facts — before writing

1. **A bug is reproduced first**, by running, not by reading: the origin's reproduction or the command
   of the brief, output to a file (`<cmd> > "${TMPDIR:-/tmp}/dev-change-repro.txt" 2>&1; echo "exit=$?"`,
   then `tail -20`). A failing test named by the origin is run narrowed to its class. No reproduction
   → stop and say what was tried: a bug that does not show is not fixed.
2. **A perf change is measured first**: the number before (a duration, a count of calls, an
   allocation), how it was read, on which input, and the `Cost:` line of
   `python3 .claude/skills/dev-implement/scripts/access-cost.py <files>` on the files concerned.
3. What the code already answers is looked up, not asked: delegate the look to one `Explore`
   subagent (`model: "haiku"`, a `description`), a `path:line` table of 30 lines at most — the code
   path of the symptom or the smell, the tests that already pin the behaviours of that area (class
   and fixture), the call sites a refactor would touch, the ports a perf change goes through. Never
   sweep the source tree from here.
4. Ask what the code cannot answer, **one decision per question** (AskUserQuestion, the recommended
   answer first, marked `(recommended)`): the target of a measurement, a behaviour to keep or to let
   go, a scope cut. Stop asking when no open decision would change a criterion, the scope or what must
   not change. What stays open is `TBD` in the body and a row of `## Open questions`.
5. A fact that turns out to be a new promise — the expected behaviour exists nowhere, in code, test or
   documentation — stops the brief: `→ This is a feature: /dev-spec <code>`.

## 3. Write

Read `references/change-template.md` and follow it: its sections, ids (`CH-nn` acceptance criteria),
budget and self-check. Write the brief in one `Write`.

## 4. Adversarial review

Delegate one fresh reading: `Agent` with `subagent_type: "adversarial-reviewer"`, a `description`, a
prompt starting `mode: change <work>/<code>/CHANGE-<code>.md`.

- `## Review — CLEAR`: go on.
- `## Review — GAPS`: each row becomes a row of `## Open questions` with its severity, merged with a
  row that already asks the same thing.
- Then every `Blocking` row, one at a time (AskUserQuestion, recommended answer first). An answer is
  written into the body and its row removed. `Major` rows stay for you or for `/dev-plan` to carry
  as assumptions.

## 5. Stop — you validate

Show in a few lines: the kind, the evidence (the reproduction's exit, the measurement), the criteria
(ids and names), what must not change, the open questions left and their severity. Then stop: the
brief is yours to read and validate. `/dev-plan` refuses to start while a `Blocking` open question
remains.

`→ Next step, once you have validated the brief: /dev-plan <code>`

Talk in the user's language; the brief is written in English unless the user asks otherwise. Nothing is
committed by Claude Code (D47).
