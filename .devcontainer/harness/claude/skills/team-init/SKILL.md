---
name: team-init
description: "Step 0 of the method: opens the record of a new Orkeon team — workbooks/<slug>/TEAM.md (the template) and STATUS.md (phase spec, DEC-0001), and tests/<slug>/ — without creating the team folder, which comes with the first build. --adopt brings an existing prototype of teams/<slug>/ into the method."
argument-hint: "[--adopt] <slug>"
disable-model-invocation: true
---

# /team-init — open the record of a team

Step 0 of the method (`references/process/workflow.md`). You create the **workbook** and the **tests
folder** of a team, nothing else: `teams/<slug>/` is created by the first build batch, once `TEAM.md`
has decided the format and the mount points (D35).

Arguments: $ARGUMENTS

## Contract

- Input: a slug (ASCII kebab-case, 63 characters at most); `--adopt` when `teams/<slug>/crew/` exists.
- Output: `workbooks/<slug>/TEAM.md` (the template, every heading), `STATUS.md` (`phase: spec`,
  `gate_passed: null`, `iteration: 0`, `next_action: /team-spec <slug>`), `decisions/DEC-0001-creation.md`,
  `tests/<slug>/`.
- Journal: the script writes `— /team-init — workbook and tests created (DEC-0001)`.
- Next: `/team-spec <slug>`, the user's to launch.

## Steps

1. **The slug.** From the arguments; otherwise propose one from what the user said and ask
   (AskUserQuestion, one question). It names the team in `teams/`, `workbooks/`, `tests/`, `settings/`,
   `mounts.<set>/` and is not renamed lightly.
2. **Adopt or not** (D34). `teams/<slug>/` already holds a prototype: offer `--adopt` — its crew is kept
   as the starting point of the build, its README is the first draft of `TEAM.md § Need`. Do not adopt
   on your own.
3. **Create the record**, from the workshop root:

   ```bash
   bash .claude/skills/team-init/scripts/team-init.sh [--adopt] <slug>
   ```

   It overwrites nothing and refuses — exit 1, one line — a slug already in the method, a team folder
   without `--adopt`, `--adopt` without a crew; exit 2 is a usage error or not a workshop. Relay a
   refusal as it is, with the way forward it names; do not write the files yourself.
4. **Complete DEC-0001.** When the conversation holds the request that led to this team, quote it in
   `## Context` of `DEC-0001-creation.md` (Edit). Change nothing else.
5. **Hand over**, in the user's language, in a few lines: what was created; that `teams/<slug>/` does
   not exist yet on purpose (with `--adopt`: that the prototype is kept as it is and its `crew/` is
   frozen until the build — a change goes through `/team-decision`); the one approval they will type
   later (`/team-approve team <slug>`); the next step `/team-spec <slug>`. Then stop.

## Done when

The script printed its `next —` line and `STATUS.md` reads `phase: spec`. `/team-spec` is the user's to
launch.
