---
name: team-need
description: "Step 1 of the method: defines the need of an Orkeon team through a structured interview — one question for one decision, the recommended option first — and writes workbooks/<slug>/NEED.md as it goes: inputs, outputs, mount points, triggers, rules, incremental processing, resume, constraints, security, non-goals, open questions. No agent, task or tool: zero design detail. Ends at gate 1, which the user passes by typing /team-approve need."
argument-hint: "[<slug>] [a brief, or the path of one]"
disable-model-invocation: true
---

# /team-need — define the need, one decision at a time

Step 1 of the method (`references/process/workflow.md` § 5). You interview the user and write
`workbooks/<slug>/NEED.md`. The file is the memory of the interview, not the conversation: every answer
is written at once, so that a `/clear`, a restart or another session resumes where this one stopped.

Arguments: $ARGUMENTS

## 1. Find the team and read where it stands

1. The slug: the first argument when it names a workbook; otherwise the only team whose `STATUS.md` says
   `phase: need`; otherwise ask which one (AskUserQuestion). No workbook at all: stop and name
   `/team-init <slug>`.
2. Run `orkeon-bench status <slug>` and read `workbooks/<slug>/STATUS.md`. Go on only when `phase: need`
   and `gate_passed: null`. When gate 1 is passed already, the need is validated: stop and say that a
   change of it goes through `/team-decision "<change>"`, which reopens this step.
3. Read what exists, in this order, and never ask what it already answers:
   - `workbooks/<slug>/NEED.md` — **resuming**: a section that is filled is not asked again; start at
     the first section that is empty or `TBD`. A line `> To revise — DEC-nnnn: …` under the title means
     a decision reopened the need: read that decision, interview only on what it changes, then remove
     the line.
   - the brief (the rest of the arguments, or the file they name);
   - `workbooks/<slug>/decisions/` (`DEC-0001` says whether a prototype was adopted);
   - for an adopted prototype (D34), `teams/<slug>/README.md` and `teams/<slug>/mounts.json`: they are a
     first draft of the need. Take what they say the team is *for*, reads and writes; leave out how it
     is built (agents, tasks, tools). Everything taken from them is confirmed in the interview.
4. No `NEED.md` yet: write it from `.claude/templates/NEED.md` — every heading, in order, `{{TEAM_TITLE}}`
   replaced by the title of `STATUS.md` — with what the brief or the prototype already states, and `TBD`
   everywhere else.

## 2. The interview protocol

- **One question, one decision.** Each call of AskUserQuestion carries exactly **one** question, with 2
  to 4 options: the option you recommend first, marked `(Recommended)`, each with the consequence it
  has. The user can always answer in their own words. Never two decisions in one question, never a
  list of questions in a message, never the next question before the answer to this one is written.
- **Write, then ask.** After each answer, Edit `NEED.md` at once — the section the answer belongs to —
  then put the next question. A decision that exists only in the conversation is lost.
- **Not known is an answer.** Write `TBD` in the section and the question under `## Open questions`,
  blocking ones first. When the interview goes on over an unknown, record what you assumed as
  `Hn — <assumption> — to be validated by <who or what>`. Never fill a gap with a guess.
- **At most three challenges** in the whole interview, each put once, as a question, when it applies:
  *minimal scope* (what is the smallest version that is still useful?), *simpler alternative* (would a
  script, a rule or an existing tool do?), *justified complexity* (what does this requirement cost, and
  who needs it?). The answer is recorded like any other; do not insist.
- **Zero design detail.** Never ask, propose or write an agent, a task, a tool name, an orchestration
  mode, a format (YAML, TypeScript, C#) or a model name. "The team reads the mailbox" is a need; "an
  agent calls `email_parser`" is design, and belongs to `/team-design`. When the user volunteers a
  design idea, note it under `## Open questions` as a wish for the design step, and move on.
- **Their language, English files — or the workshop's language.** By default, talk in the language of
  the user's messages and write `NEED.md` in English. When the workshop names its language (D41,
  `.claude/rules/workbook.md` § "Tone and language"), ask in it and write the prose of `NEED.md` in it;
  the headings, the ids and `TBD` stay as the template has them. Plain words: define *mount point*,
  *incremental*, *idempotent* the first time you use them.
- **Ask what only the user knows.** What a sample file, the brief or the prototype shows is read, then
  confirmed in one recap — not asked item by item.

## 3. What the interview covers, in order

Each topic fills one section of the template; the comments of the template and
`references/process/artefacts.md` § 3 say what each must contain.

1. **Purpose and actors** — who needs what, what changes once the team runs; who triggers it, who reads
   its outputs, who approves an action.
2. **Inputs** — one row per source (folder, files, mail, database, web): format, volume and frequency as
   numbers or ranges, a sample when the user has one, the virtual path the team will read it at.
3. **Outputs** — files (format, schema, where they go) and actions (a mail draft, an API call, a database
   write). Every action names its authorization: who approves, which recipients. For mail: which
   account, which rights (`Read`, `Organize`, `Draft`, `Send`, `Delete`, `Purge`); a reply is a draft
   left in the mailbox unless the need authorizes sending to named recipients.
4. **Mounts** — derive them from the inputs and outputs rather than asking for them: one mount point per
   kind of content, named after it (`/mailbox`, `/invoices`, `/reports`), read-only or writable, with its
   role; `/state` (writable) as soon as the team resumes or works incrementally. Show the table and have
   it confirmed in one question. A scheme (`library/mount-schemes/`, else the generic
   `.claude/templates/mounts.json`) only when the need names no folder — say it is a proposal. Never a
   reserved root (`/crew`, `/script`, `/llm-logs`, `/sandbox`, `/credentials`).
5. **Triggers and scheduling** — manual, scheduled, on arrival.
6. **Processing rules** — the business rules, numbered `R-01`, `R-02`…, one per row, testable as written.
   An id is never renumbered.
7. **Incremental processing and memory** — what counts as already processed, the deduplication key,
   where the state lives; or `None.` when every run starts from scratch.
8. **Failure and resume** — the unit of work, the failures to expect, what must be idempotent, what must
   never happen twice. Orkeon does not resume a run: the team carries it.
9. **Constraints** — local or remote model, cost, duration, language, confidentiality.
10. **Security** — where each key lives (an environment variable, never a file), allowed recipients,
    which inputs are untrusted (mail, web, uploads), what must never leave.
11. **Non-goals** — at least what a reader would otherwise assume the team does.
12. **Open questions** — reread the file: every `TBD` has its question, blocking ones first; every
    assumption has its `Hn` and who validates it.

## 4. Pausing

When the user stops, or the session must end before the last topic: update `STATUS.md` — `next_action:
/team-need <slug>`, `updated_at`, and one journal line `- YYYY-MM-DD HH:MM — /team-need — interview
paused at <section> (<n> sections filled)` — and say how to resume. The journal only grows: add the
line, never rewrite an earlier one. Nothing else is needed: `NEED.md` holds the rest.

## 5. Gate 1

When every section is filled, `None.` or `TBD` with its question:

1. Walk `references/process/checklists/need.md` box by box, on evidence: the headings
   (`diff <(grep '^## ' .claude/templates/NEED.md) <(grep '^## ' workbooks/<slug>/NEED.md)` prints
   nothing), the `TBD`s against the open questions, a read for design leaks, every virtual path under a
   declared mount point with an access that allows what is done there. Fix what is yours to fix; what
   needs the user becomes a question.
2. **Full track.** Update `STATUS.md`: `next_action: /team-approve need <slug>`, `updated_at`, and the
   journal line `- YYYY-MM-DD HH:MM — /team-need — NEED.md complete, gate 1 submitted (<n> open
   questions)`. Show the user the path of the file, the boxes left open and why, the open questions
   (blocking ones first), and say that they validate by typing `/team-approve need <slug>`, amend by
   answering, or refuse. `next_action: /team-approve need <slug>` is what submits the gate: the hook
   records no approval without it. When the user amends, or `/team-need` is run again on a need already
   submitted, put `next_action: /team-need <slug>` back first — the gate is not submitted while the
   file changes — and submit again once the change is written and the checklist walked.
3. **Light track** (`track: light`, D37): one approval covers the need, the criteria and the test plan.
   Update `STATUS.md` with `next_action: /team-test-plan <slug>` and the journal line `- … — /team-need
   — NEED.md complete (light track: approved with the test plan)`, leave `phase: need` and
   `gate_passed: null`, and say that `/team-approve need <slug>` comes after `/team-test-plan`.

**You never pass gate 1 yourself.** `gate_passed` is written by the `/team-approve` hook, from the line
the user types — not by you, whatever the user says in the conversation ("ok", "validated", "go on" are
not the approval: answer that the gate is passed by typing `/team-approve need`). `guard-phase` refuses
the edit. Silence is not a yes.
