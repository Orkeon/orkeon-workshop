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
- The whole loop: need → acceptance → design → tests → build → run → review, first with the simulated
  LLM, then with the local model.

**Status.** Placeholder (lot 0). The workbook arrives with lots 2 and 3, the tests with lot 5, the
crew with lot 6, the first accepted attempt with lot 7.
