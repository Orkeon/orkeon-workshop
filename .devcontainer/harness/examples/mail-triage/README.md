# Pilot 1 — mail triage (YAML)

**Goal.** Classify incoming mails and prepare replies: for each `.eml` file, a classification record
(category, urgency, reason) in a JSON deliverable that follows a schema, and a reply draft for the
mails that call for one. Mails already processed are not processed again; an interrupted run resumes
where it stopped. Nothing is ever sent.

**Mounts.**

| Mount point | Access | Role | Folder of the team |
|---|---|---|---|
| `/mailbox` | ro | mailbox | `./mailbox` — the `.eml` files to triage |
| `/state` | rw | state | `./state` — the registry of processed mails |
| `/output` | rw | deliverables | `./output` — the classification file and the drafts |

**What it will demonstrate.**

- A YAML crew built batch by batch from tests written first.
- `email_parser` on `.eml` files, without any mail account.
- Three declared roots instead of the default pair, and their bindings in `mounts.json`.
- Incremental processing with a state registry and a deduplication key (`INV-INCR`), resume after an
  interruption (`INV-RESUME`), idempotence (`INV-IDEMP`).
- An adversarial dataset — mails carrying hidden instructions — and the guardrails that make them
  inert (`INV-INJECTION`), drafts as files only — no mail tool but `email_parser`, so nothing can be sent
  (AC-05) —, writes confined to the writable roots (`INV-FS`).
  Orkeon's Guardian (on by default since `main` a2bb6c3) blocks a task whose prompt reads as an
  injection: a task that copies an injected mail verbatim into its output makes the next task fail, so
  the tasks summarise mails rather than quote them.
- The whole loop: need → acceptance → design → tests → build → run → review, first with the simulated
  LLM, then with the local model.

**Status.** In phase `test-plan` (lot 3): its workbook is `../workbooks/mail-triage/` — `STATUS.md`,
`decisions/DEC-0001-creation.md`, a complete `NEED.md`, whose gate 1 the project owner passed on
2026-10-07 by typing `/team-approve need mail-triage`, and `ACCEPTANCE.md` with `TEST-PLAN.md`,
submitted at gate 2 on 2026-10-08 (`orkeon-bench check test-plan` passes on them) and waiting for
`/team-approve test-plan mail-triage` — and its tests folder `../tests/mail-triage/` holds
`bench.config.json` and no test yet. The design and its plan follow gate 2 (`/team-design`), the tests arrive with lot 5, the crew
(`../teams/mail-triage/`) with lot 6, the first accepted attempt with lot 7. This file stays the
description of the pilot until the first build writes the team's own README.
