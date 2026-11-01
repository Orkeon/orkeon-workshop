---
phase: spec
gate_passed: null
iteration: 0
attempt: null
batch: null
verdict: null
next_action: /team-spec
updated_at: {{UPDATED_AT}}
---

# {{TEAM_TITLE}} — Status

<!-- The front matter is the state machine: orkeon-bench and the hooks read it.
     phase: spec | tests | build | run | review | accepted | published
     gate_passed: the last gate passed — team (the user, /team-approve team), tests, build, review — or null; after ITERATE, tests again
     iteration: 0 at /team-init, +1 at each ITERATE (D38) · attempt: ATT-nnnn or null · batch: B1, B2, … or null
     verdict: ACCEPTED | ITERATE | BLOCKED or null · next_action: the command to run next · updated_at: ISO 8601 with offset (2026-09-30T19:12:00Z)
     Below, the journal: every bullet of this file is read as a journal entry, so keep no other list here. One bullet per event:
     YYYY-MM-DD HH:MM — /team-skill — outcome -->

- {{DATE}} {{TIME}} — /team-init — workbook and tests created (DEC-0001)
