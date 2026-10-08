# Checklist — batch green: the end of each batch

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at bd3420c (2026-10-08, after 1.0.0-rc.4).
> Sources: harness `.claude/agents/team-implementer.md`, `.claude/rules/orkeon-yaml.md`, `orkeon-ts.md`, `workbook.md`;
> the generator skills' `check_crew.py` / `check_team.py`; `references/process/workflow.md` § 4–5, § 7; `VERIFICATIONS.md` (V-02);
> Orkeon `src/hosting/Orkeon.Hosting/RunnerExecution.Diagnostics.cs` (the `VALIDATION OK` line); plan § 4.3.

Exit of each `/team-build B<n>`, and of each correction appended after an `ITERATE`. Validated by
**script** (L0, L1) and by the **orchestrator reading the diff**. Artefacts: the files the batch sheet
anchors (`teams/<slug>/crew/**`, `library/tools/**`, the team `README.md`; `teams/<slug>/mounts.json`
at the first batch), and the proof ticks of `PLAN.md`. Boxes common to every gate: [`README.md`](README.md).

## Before the batch

- [ ] `STATUS.md` says `gate_passed: tests` (first batch) or the previous batch is green; an attempt is
  open (`attempts/ATT-nnnn/manifest.json`, `closed_at: null`); `phase: build`, `batch: B<n>`,
  `attempt: ATT-nnnn`.
- [ ] The contract handed to `team-implementer` names the batch, the sheet (`PLAN.md` → `### B<n>`),
  the anchored files as the only ones to touch, the ids, the tests to pass, what is forbidden
  (`tests/<slug>/`, the workbook, any settings file, any remote profile) and the L0/L1 commands to report.

## Pass when

**The first batch** (`B1`, D35)

- [ ] It created `teams/<slug>/`: `mounts.json` from `DESIGN.md` `## Mounts`, the crew through the
  generator skill (into that folder, never `<slug>-2`), then `orkeon-bench scaffold <slug>`, which
  refuses a folder the reach rule forbids (`references/process/workflow.md` § 8). Studio lists the team
  as soon as the folder exists, and launches it once `--validate` passes.
- [ ] A team that needs its own settings (a model of its own, a mail account) has
  `settings/<slug>/appsettings.json`, written by the main thread — no subagent writes a settings file
  (D33, D40).

**What was delivered**

- [ ] The report is `## DONE`; every path of `- Files:` is anchored in the sheet (or its correction).
- [ ] `tests/<slug>/` is untouched: `git diff --stat -- tests/<slug>/` is empty in a git workshop;
  otherwise `find tests/<slug> -type f -newer workbooks/<slug>/attempts/ATT-nnnn/manifest.json` prints nothing.
- [ ] The diff, read by the orchestrator: no physical path in the definition; no model pinned (no
  `.llm()`, no `model:`); `allowDelegation` written `false` unless the design says otherwise;
  deliverables under writable roots; only the designed tools; custom TypeScript tools pure (no Node
  API, no `console`, no I/O); no secret.

**L0 static — green**

- [ ] YAML: `python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py teams/<slug>` exits 0.
- [ ] TypeScript: `python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py teams/<slug>`
  and `tsc -p teams/<slug>` exit 0, and so do the dependency rules of
  `references/typescript/clean-architecture-ddd.md` § 7.
- [ ] C#: the build of the tool or host passes (`references/orkeon/csharp-tools.md`, `csharp-crews.md`).
- [ ] The check scripts ran with `--orkeon "$(command -v orkeon)"`: the tool catalogue then comes from
  the installed binary (`orkeon run --list-tools`) instead of the list embedded in the script.
- [ ] From the team folder, `./run.sh --validate` prints `VALIDATION OK: <path> (agents=N, tasks=M,
  tools resolved=K)` with the counts the design expects — for a team using C# plugin tools,
  `orkeon-harness-run crew --plugins <dir> --validate`, since the launchers run the stock `orkeon`, which
  refuses those tools. The check script and `--validate` both pass: each sees what the other lets through.
- [ ] If `mounts.json` changed: `orkeon-bench scaffold <team>` was run again and `orkeon-bench mounts
  <team>` exits 0 (launchers, card mounts and folders follow the file).

**L1 unit — green**

- [ ] `npx vitest run tests/<slug>/unit` — plus the folders of the library tools the crew imports —
  exits 0.

**Proofs and cost**

- [ ] In `PLAN.md`, each step of the batch is ticked (`TESTS ✅ · BUILD ✅ · L0/L1 ✅`) on a command and
  its exit code; the batch row reads `done (ATT-nnnn)` once every step is ticked.
- [ ] No remote profile was used; the `machine` profile only while `orkeon-bench profile <slug> machine`
  says it is local (`run-gate` refuses the rest).

**Corrections** — after an `ITERATE`, the same boxes hold for each `#### Correction Cn — F-m`
appended to its sheet; earlier proofs stay as they were.

## Evidence to look at

| Evidence | How |
|---|---|
| scope | the `- Files:` line of the report against `#### Anchors` |
| diff | `git diff --stat`, then the patch of the anchored files (`git diff -- <path>`) |
| L0, L1 | the commands above, re-run by the orchestrator when the report's exit codes are in doubt |
| tests frozen | `git diff --stat -- tests/<slug>/`, or the `find -newer` above |
| state | `orkeon-bench status <slug>`: phase, batch, attempt |

Logs stay with the implementer; the orchestrator reads the diff and the exit codes
(`references/process/context-discipline.md`).

## Usual reasons to refuse

- A test modified, skipped or weakened to make the batch pass — a wrong test is a decision, not a fix.
- A file outside the anchors, or a missing anchor "found" by searching instead of coming back `BLOCKED`.
- `--validate` green while the check script is red (or the reverse); `tools resolved` lower than the
  design (a tool silently missing).
- Unit tests green on a copy of the logic, a domain that uses a Node API, a tool that does I/O.
- A `BLOCKED` worked around, or an agent relaunched with the same instruction.
- A proof tick without a command and its exit code.
- A remote run during the build.

## Once passed

`STATUS.md`: `phase: build`, `batch: B<n>`, `next_action: /team-build B<n+1>`; after the last batch,
`gate_passed: build` and `next_action: /team-run`. Journal
`- YYYY-MM-DD HH:MM — /team-build — B<n> batch green`.
