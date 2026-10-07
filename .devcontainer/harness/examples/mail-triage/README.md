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
  inert (`INV-INJECTION`), drafts only (`INV-EMAIL`), writes confined to the writable roots (`INV-FS`).
  Orkeon's Guardian (on by default since `main` a2bb6c3) blocks a task whose prompt reads as an
  injection: a task that copies an injected mail verbatim into its output makes the next task fail, so
  the tasks summarise mails rather than quote them.
- The whole loop: need → acceptance → design → tests → build → run → review, first with the simulated
  LLM, then with the local model.

**Status.** In phase `need` (lot 2): its workbook is `../workbooks/mail-triage/` — `STATUS.md`,
`decisions/DEC-0001-creation.md` and a complete `NEED.md`, whose gate 1 the project owner passed on
2026-10-07 by typing `/team-approve need mail-triage` — and its tests folder `../tests/mail-triage/` is open and empty. The acceptance
criteria, the test plan and the design arrive with lot 3, the tests with lot 5, the crew
(`../teams/mail-triage/`) with lot 6, the first accepted attempt with lot 7. This file stays the
description of the pilot until the first build writes the team's own README.
