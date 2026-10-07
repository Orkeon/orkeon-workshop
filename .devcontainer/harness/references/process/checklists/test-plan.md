# Checklist — gate 2: the test plan

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 77ac8a9 (2026-10-07, after 1.0.0-rc.4).
> Sources: harness `.claude/templates/ACCEPTANCE.md`, `TEST-PLAN.md`, `bench.config.json`; `references/process/workflow.md` § 4–5, § 7;
> `references/process/artefacts.md` § 4–5; `references/testing/invariants-catalog.md`; `FROZEN-LITERALS.md` § 3–4; plan § 4.3, § 6.

Exit of `/team-test-plan`. Validated by **the user** — criteria, thresholds and budget. Artefacts:
`workbooks/<slug>/ACCEPTANCE.md`, `workbooks/<slug>/TEST-PLAN.md`, and `tests/<slug>/bench.config.json`
which carries their values. Boxes common to every gate: [`README.md`](README.md). How to write criteria:
`references/testing/acceptance-criteria.md`; levels: `references/testing/test-levels.md`.

## Before the gate

- [ ] `STATUS.md` says `gate_passed: need`; `NEED.md` has not changed since gate 1, or the change has its `DEC-nnnn`.
  On the light track (D37) no gate is passed yet — `gate_passed: null`, in phase `need` or `test-plan` — and the
  one approval, `/team-approve need`, comes at the end of this step.

## Pass when

**Acceptance criteria** (`## Acceptance criteria`)

- [ ] Every row has an `AC-nn` id, a dataset in Given, an observable Then (a file, a field, a count,
  an event — not "the summary is good"), a Level and a Status `active` or `dropped (DEC-nnnn)`.
- [ ] Every output and every rule `R-nn` of `NEED.md` is covered by at least one AC, or is a non-goal.
- [ ] Each Level is the **lowest** that can prove the criterion: a parsing rule in a custom tool is
  `L1`, wiring and deliverable shape `L2`, what depends on the model's judgement `L3`, a behaviour
  required of the production model `L4` — never proven by a local run.
- [ ] Every dataset named in Given appears in `TEST-PLAN.md` `## Datasets`.

**Indicators** (`## Indicators`)

- [ ] Every row has an `IND-nn` id, a measure, a unit, a numeric threshold, a direction `>=` or `<=`,
  a level; a local threshold that differs from the remote one has its own row.
- [ ] The standard indicators the team needs are there (`invariants-catalog.md`, "Standard indicators").

**Invariants** (`## Invariants`)

- [ ] `INV-FS`, `INV-SECRETS`, `INV-TOOLS`, `INV-BUDGET` (they apply always), with their catalogue id.
- [ ] `INV-INJECTION` when an input is untrusted (lowest level L3: a scripted LLM cannot prove it);
  `INV-RESUME` and `INV-INCR` when `NEED.md` asks for resume or incremental processing; `INV-IDEMP`
  when the team acts outside or keeps state; `INV-SCHEMA` when a deliverable has a schema;
  `INV-EMAIL` when the team can send mail (`email_send`, `http_api` to a mail API, a C# tool).
- [ ] Every invariant names its check; none is declared "to be safe" (a declared invariant without a
  check is a failing one). The team's own are `INV-01`, `INV-02`…, true or false on any run.

**Test plan** (`TEST-PLAN.md`)

- [ ] `## Levels`: which run, when, the stop rule; L4 "on request, behind the budget gate".
- [ ] `## Datasets`: origin `synthetic` / `provided` / `anonymized`, size, cases, criteria served; an
  adversarial set when an input is untrusted; edge cases (empty, oversized, encoding, duplicates);
  what cannot be tested in the container is said.
- [ ] `## LLM targets`: `stub` for L2, `machine` for L3, a named profile for L4 when L4 is required.
- [ ] `## Judges`: only where no deterministic oracle exists; each `J-nn` has a rubric, a scale and a threshold.
- [ ] `## Repetitions and flakiness`: runs per end-to-end scenario and the `pass@k` that counts.
- [ ] `## Budget`: local minutes and a remote cap in USD per attempt (default 2.00).
- [ ] `## Pass criteria` states the whole rule (every AC at its level, every IND, every INV).

**`tests/<slug>/bench.config.json`**

- [ ] It matches the plan: `levels.e2e_local` `{profile, repeat, pass_at}`, `levels.e2e_remote.profile`,
  `budget.local_minutes_max`, `budget.remote_usd_max`, `retention.runs_keep`.
- [ ] Every named profile has `baseUrl`, `model`, `keyEnv` (a variable **name**), `timeoutSeconds`; no key.
- [ ] `orkeon-bench profile <slug> <name>` says `remote` exactly for the targets the plan calls remote
  — including `machine`, which is remote as soon as what Orkeon will read — variables, the team's own
  settings files, the user's — points at a remote host, or holds an `Llm` section without a base URL
  (`FROZEN-LITERALS.md` § 3).

**The user**

- [ ] The user validated the criteria, the thresholds and the budget explicitly (`/team-approve test-plan`).

## Evidence to look at

| Evidence | How |
|---|---|
| ids | the command below prints nothing (no duplicate id; the `J-nn` are born in `TEST-PLAN.md`) |
| coverage of the need | each `R-nn` and each row of `## Outputs` of `NEED.md` against the AC table |
| datasets | each Given against `## Datasets` |
| profiles | `orkeon-bench profile <slug> <name> --json` (`remote`, `remote_reason`, `base_url_host`) — it reads `tests/<slug>/`: `teams/<slug>/` does not exist yet |
| config | `jq . tests/<slug>/bench.config.json` |

```bash
grep -hoE '^\| *(AC|IND|INV|J)-[0-9A-Z]+' workbooks/<slug>/ACCEPTANCE.md workbooks/<slug>/TEST-PLAN.md |
  tr -d '| ' | sort | uniq -d
```

## Usual reasons to refuse

- A criterion that cannot fail ("the team produces a good report") or that restates the need.
- A criterion attached too high (L3 where L1 or L2 proves it: slower, noisier, more expensive) or too
  low (L2 for a judgement only a model makes).
- A threshold written in several places, or a test planned to carry its own number.
- Untrusted inputs with no adversarial dataset and no `INV-INJECTION`.
- An invariant without a check, an indicator without unit or direction.
- One run for a local end-to-end scenario: a local model is noisy, `repeat` and `pass_at` decide.
- A judge where a schema, a count or a forbidden-text check would do.
- No budget, a key in `bench.config.json`, or a remote target that the plan calls local.

## Once passed

`STATUS.md`: `phase: test-plan`, `gate_passed: test-plan`, `next_action: /team-design <slug>`; journal
`- YYYY-MM-DD HH:MM — /team-approve — gate 2 passed: the user typed …`. The user approves by typing
`/team-approve test-plan`, and the hook `team-approve` records the gate from that line (D36), for a team
in phase `test-plan` with `gate_passed: need` whose `ACCEPTANCE.md` and `TEST-PLAN.md` exist: nobody
else writes the gate, and `guard-phase` refuses an edit that raises `gate_passed`. The hook records it
only once this step has submitted it: the step ends on `next_action: /team-approve test-plan <slug>`
(on the light track, `/team-approve need <slug>`), done by hand too while `/team-test-plan` is not
shipped. On the light track (D37),
`/team-approve need` passes this gate with gate 1.
