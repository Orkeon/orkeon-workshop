# references/reliability — teams that survive failure

Established on Orkeon `main` at fb26364, the version the image builds. The fact they all start from:
`orkeon run` has **no `--resume`**, its
checkpoints are written at the end of a run only, and there is no native deduplication or watermark.
Resume and incremental processing are carried by the team itself — a state registry under a
dedicated root (`/state`), idempotent units of work — and proven by `INV-RESUME`, `INV-INCR` and
`INV-IDEMP` (`references/testing/invariants-catalog.md`).

| Document | Abstract |
|---|---|
| `resume-patterns.md` | Resuming after an error or a stop: the state registry (where it lives, what it records), idempotent tasks, cutting the work into units, done markers, what a restart skips. |
| `incremental-patterns.md` | Processing only what is new: the deduplication key, the watermark, Orkeon memory versus a file registry, purging old state. |
| `error-handling.md` | What fails a task and the run in each mode, model retries, `graphConfig`, the stop on repeated tool errors, escalation through `human_input`, controlled degradation when a tool or the model fails. |
| `security.md` | Keys never on disk, allowed recipients for e-mail, SSRF on `http_api` and `web_scrape`, untrusted inputs and prompt injection, secrets leaking into outputs and logs. |
