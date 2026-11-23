# references/reliability — teams that survive failure

Established on Orkeon 1.2.0 (a9f3878) and checked on 1.3.0 (d81bfab), the release the image installs (D110). The fact they all start from:
`orkeon run --resume <id>|latest` resumes a run **by task** only, and only with `Orkeon:Checkpointing:Enabled`
(since rc.7; none before); it knows nothing of the units inside a task, and there is no native deduplication or
watermark from one run to the next.
Unit-level resume and incremental processing are carried by the team itself — a state registry under a
dedicated root (`/registry`; `/state` and `/runs` are the runner's own), idempotent units of work — and proven by `INV-RESUME`, `INV-INCR` and
`INV-IDEMP` (`references/testing/invariants-catalog.md`).

| Document | Abstract |
|---|---|
| `resume-patterns.md` | Resuming after an error or a stop: the state registry (where it lives, what it records), idempotent tasks, cutting the work into units, done markers, what a restart skips. |
| `incremental-patterns.md` | Processing only what is new: the deduplication key, the watermark, Orkeon memory versus a file registry, purging old state. |
| `error-handling.md` | What fails a task and the run in each mode, model retries, a task's `retry:`, the `graph:` breaker, the stop on repeated tool errors, escalation through `human_input`, controlled degradation when a tool or the model fails. |
| `security.md` | Keys never on disk but in the one file of D109, allowed recipients for e-mail, SSRF on `http_api` and `web_scrape`, untrusted inputs and prompt injection, secrets leaking into outputs and logs. |
