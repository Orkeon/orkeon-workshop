---
name: team-init
description: "Step 0 of the method: opens the record of a new Orkeon team — its workbook (workbooks/<slug>/STATUS.md in phase need, DEC-0001) and its tests folder (tests/<slug>/) — without creating the team folder, which comes with the first build. --adopt brings an existing prototype of teams/<slug>/ into the method; --light chooses the light track for a small team."
argument-hint: "[--adopt] [--light] <slug>"
disable-model-invocation: true
---

# /team-init — open the record of a team

Step 0 of the method (`references/process/workflow.md` § 3, § 5). You create the **workbook** and the
**tests folder** of a team, and nothing else: `teams/<slug>/` is created by the first build batch, once
the need and the design have decided the format and the mount points (D35).

Arguments: $ARGUMENTS

## 1. Settle the slug and the track

- **Slug**: ASCII kebab-case, 63 characters at most (`mail-triage`). It names the team in five trees —
  `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.<set>/` — and is not renamed lightly. If the
  arguments give none, propose one from what the user said and ask (AskUserQuestion, one question).
- **Track** — only when the user did not say:
  - *full* (default): three approvals — the need, the test plan, the design.
  - *light* (`--light`, D37): for a small team. `NEED.md`, `ACCEPTANCE.md` and `TEST-PLAN.md` are filled
    together and approved once; `DESIGN.md` and `PLAN.md` come together, with a single batch `B1`. The
    design approval, the tests written before the build, the budget gate, the verdict and the record stay.
- **Adopt** (`--adopt`, D34): `teams/<slug>/` already holds a prototype a generator wrote. Its crew is
  kept as the starting point of the build and its README becomes the first draft of `NEED.md`. If the
  user asks to init a slug whose team folder exists, say so and offer `--adopt`; never adopt on your own.

## 2. Create the record

Run, from the workshop root:

```bash
bash .claude/skills/team-init/scripts/team-init.sh [--adopt] [--light] <slug>
```

The script writes `workbooks/<slug>/STATUS.md` (`phase: need`, `gate_passed: null`, the track,
`iteration: 0`, `next_action: /team-need <slug>`), `workbooks/<slug>/decisions/DEC-0001-creation.md`
(accepted) and `tests/<slug>/`. It overwrites nothing and refuses — exit 1, one line saying why — a slug
that is already in the method, a team folder that exists without `--adopt`, and `--adopt` without a
`teams/<slug>/crew/`. Relay a refusal as it is, with the way forward it names; do not work around it by
writing the files yourself.

## 3. Complete DEC-0001

When the conversation holds the request that led to this team, put it in `## Context` of
`DEC-0001-creation.md`, in the user's words, quoted (Edit). Otherwise leave the file as the script wrote
it. Change nothing else: the need itself is written by `/team-need`.

## 4. Hand over

`STATUS.md` is already current (the script wrote it). Tell the user, in their language, in a few lines:

- what was created, and that `teams/<slug>/` does not exist yet, on purpose (with `--adopt`: that the
  prototype is kept as it is and that its `crew/` is now frozen until the build — a change of it goes
  through `/team-decision`);
- the track, and what it means for the approvals they will type (`/team-approve need`, …);
- the next step: `/team-need <slug>`.

Then stop: `/team-need` is the user's to launch.
