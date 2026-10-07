# Checklist — gate 1: the need

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 80fdefe (2026-10-07, after 1.0.0-rc.4).
> Sources: Orkeon `docs/guides/email.md`, `src/tools/Orkeon.Tools.Email/Configuration/EmailToolsOptions.cs`, `EmailEnums.cs`;
> harness `.claude/templates/NEED.md`, `references/process/workflow.md` § 4–5, `references/process/artefacts.md` § 3,
> `.claude/rules/workbook.md`, `VERIFICATIONS.md` (V-08, V-12, re-checked in the sources at fb26364); plan § 4.3.

Exit of `/team-need`. Validated by **the user**. Artefact: `workbooks/<slug>/NEED.md`. Boxes common to every gate:
[`README.md`](README.md). Gate 1 may pass with open questions; gate 3 may not pass while one of them blocks.

## Before the gate

- [ ] `STATUS.md` says `phase: need`, `gate_passed: null`, its `track` and `iteration: 0`;
  `decisions/DEC-0001-*.md` records the creation.

## Pass when

**Shape**

- [ ] Every heading of the template is present, in order, from `## Purpose` to `## Open questions`.
- [ ] Every section is filled, `None.`, or `TBD` with its question under `## Open questions`.

**No design detail**

- [ ] No agent, task, tool name, orchestration mode, format (YAML / TypeScript / C#) or model in the
  file. "The team reads the mailbox" is a need; "an agent calls `email_parser`" is design.

**Inputs, outputs, mounts**

- [ ] `## Inputs`: one row per source, with format, volume, frequency, a sample, and a virtual path
  under a root declared in `## Mounts`. Volume and frequency are numbers or ranges, not "some".
- [ ] `## Outputs`: every row says `file` or `action`; every action names its authorization
  (who approves, which recipients). For mail: which account, which rights the team needs (`Read`,
  `Organize`, `Draft`, `Send`, `Delete`, `Purge`) and which recipients are allowed. A reply is a
  draft left in the mailbox, nothing sent, unless the need authorises sending to named
  recipients (the tool names come at design). The account is declared in
  `settings/<slug>/appsettings.json` (D33: `Orkeon:Tools:Email:Accounts`; an empty
  `Send:AllowedRecipients` allows nobody), never in the team folder nor in the machine's settings,
  where it would exist for every run.
- [ ] `## Mounts`: one point per kind of content, named after it; access `ro` / `rw` / `rwnd`; a role;
  the folder of the team (`./input` for `/workspace`, `./<name>` otherwise); `/state` (rw) present
  as soon as the need asks for resume or incremental processing; no reserved root (`/crew`,
  `/script`, `/llm-logs`, `/sandbox`, `/credentials`); a proposed scheme is labelled as a proposal.
- [ ] Every virtual path of `## Inputs` and `## Outputs` falls under one of these points, with an
  access that allows what is done there (nothing written under `ro`).

**Rules, state, failure**

- [ ] `## Processing rules`: numbered `R-01`, `R-02`…, one rule per row, testable as written.
- [ ] `## Incremental processing and memory`: what counts as already processed, the deduplication key,
  where the state lives — or `None.` when every run starts from scratch.
- [ ] `## Failure and resume`: the unit of work, what must be idempotent, what must never happen twice.
  Nothing relies on Orkeon resuming a run: it cannot (V-08).

**Constraints, security, scope**

- [ ] `## Constraints`: local or remote LLM, cost, duration, language, confidentiality.
- [ ] `## Security`: where each key lives (an environment variable, never a file), allowed recipients,
  which inputs are untrusted, what must never leave.
- [ ] `## Non-goals` names at least what a reader would otherwise assume.
- [ ] `## Open questions`: blocking ones first; each assumption has an `Hn` and a "to be validated by".

**The user**

- [ ] The user answered the questions and validated the file explicitly (`/team-approve need`).

## Evidence to look at

| Evidence | How |
|---|---|
| headings | `diff <(grep '^## ' .claude/templates/NEED.md) <(grep '^## ' workbooks/<slug>/NEED.md)` |
| open points | `grep -n 'TBD' workbooks/<slug>/NEED.md`, each matched by a row of `## Open questions` |
| design leaks | a read of the file; a word search (`agent`, `task`, `tool`, `.yaml`, `.ork.ts`, a tool name) as a first pass only |
| samples | the sample files named in `## Inputs`, when the user provided some |
| state | `orkeon-bench status <slug>` (it reads the workbook: `teams/<slug>/` does not exist yet) |

## Usual reasons to refuse

- A design decision slipped in (an agent, a tool, "use TypeScript"), which closes options before the
  test plan exists.
- An action without an authorization, or a recipient list left open for a team that writes to people.
- A virtual path under an undeclared root, mount points named after physical folders or after
  Orkeon's defaults rather than after the content, a reserved root declared.
- Incremental processing or resume asked for, with no `/state` point and no deduplication key.
- Untrusted inputs (mail, web, uploads) not called untrusted: the adversarial tests will be missing.
- A blocking question disguised as an assumption.
- Scope wider than the purpose: the interview's challenges (minimal scope, simpler alternative,
  justified complexity) were not put.

## Once passed

`STATUS.md`: `phase: need`, `gate_passed: need`, `next_action: /team-test-plan <slug>`; journal
`- YYYY-MM-DD HH:MM — /team-approve — gate 1 passed: the user typed …`. The user approves by typing
`/team-approve need`, and the hook `team-approve` records the gate from that line (D36): nobody else
writes it — `/team-need` stops at `next_action: /team-approve need` and the journal line
`— /team-need — NEED.md complete, gate 1 submitted (<n> open questions)`, and `guard-phase` refuses an
edit that raises `gate_passed`. The hook refuses the approval while `NEED.md` is missing, empty or
still holds a `{{…}}` placeholder of its template, and while the gate is not submitted — `next_action`
still names `/team-need`, the interview paused or running. On the light track (D37) the same approval covers
`ACCEPTANCE.md` and `TEST-PLAN.md`, checked with [`test-plan.md`](test-plan.md) — the three files must
exist — and writes `phase: test-plan`, `gate_passed: test-plan`, `next_action: /team-design <slug>`.
