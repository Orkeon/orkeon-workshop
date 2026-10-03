# {{TEAM_TITLE}} — Need

<!-- Written by /team-need, one decision at a time (one question = one decision, recommended option first).
     No agent, no task, no tool in this file: zero design detail.
     Unknown yet: write TBD and put the question under "Open questions". Keep every heading, in this order. -->

## Purpose

<!-- Two or three sentences: who needs what, and what changes for them once the team runs. -->

## Actors

<!-- Who triggers the team, who reads its outputs, who approves an action. -->

## Inputs

<!-- One row per source (folder, files, mail, database, web). Virtual path: where the team reads it, under a root declared in "Mounts". -->

| Source | Format | Volume | Frequency | Virtual path | Sample |
|---|---|---|---|---|---|
| | | | | | |

## Outputs

<!-- Kind: file | action (e-mail draft, API call, database write). An action names the authorization it requires. -->

| Kind | Virtual root | Format / schema | Destination | Authorization |
|---|---|---|---|---|
| | | | | |

## Mounts

<!-- The mount points of the team: the folders its agents see, free in name and number. One point per kind of content the team
     reads or writes, named after it (/mailbox, /invoices, /reports…); add /state (rw, state) as soon as the team resumes or processes
     incrementally. Access: ro | rw | rwnd. Role: inputs | deliverables | state | archive | mailbox | reference | …
     Only when the need names no folder, propose a scheme — one of library/mount-schemes/, else the generic one
     (.claude/templates/mounts.json: /workspace ro, /output rw) — and say it is a proposal.
     Folder of the team: ./input for /workspace, ./<name> otherwise. Never declared (reserved to the runner): /crew /script /llm-logs
     /sandbox /credentials. Other folders for a trial or another environment are mount sets (mounts.<name>/<slug>/), not rows here. -->

| Mount point | Access | Role | Folder of the team | What it holds |
|---|---|---|---|---|
| | | | | |

## Triggers and scheduling

<!-- Manual, scheduled (Studio card `schedule`, or the orkeon-host daemon), on arrival. -->

## Processing rules

<!-- Numbered business rules. An id is never renumbered. -->

| Id | Rule |
|---|---|
| R-01 | |

## Incremental processing and memory

<!-- What counts as "already processed", the deduplication key, where the state lives. Write "None." when every run starts from scratch. -->

## Failure and resume

<!-- Unit of work, expected failures, what must be idempotent, what must never be done twice.
     Orkeon has no native resume at run time: the team carries it. -->

## Constraints

<!-- Local or remote LLM, cost, duration, language, confidentiality. -->

## Security

<!-- Keys and where they live (never on disk), allowed recipients, untrusted inputs, what must never leave. -->

## Non-goals

<!-- What this team deliberately does not do. -->

## Open questions

<!-- Blocking questions first. No plan is written while one is open. Assumptions made meanwhile go in the table. -->

| Id | Assumption | To be validated by |
|---|---|---|
| H1 | | |
