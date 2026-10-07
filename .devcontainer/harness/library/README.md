# Library

Reusable bricks for building Orkeon agent teams: agent fragments, deterministic tools, schemas of
deliverables, shared datasets, mount schemes. The workshop's `library/` belongs to the workshop — the
image creates these README files once and never updates or removes what is here. The exception is
`library/examples/`, which the image keeps up to date: the three pilot teams, built in lots 2–8 — for
now their READMEs and, for `mail-triage`, its workbook and its tests folder.

| Folder | Holds |
|---|---|
| `agents/` | agent fragments (YAML or TypeScript) that proved themselves: role, goal, backstory, tools, sizing |
| `tools/ts/` | pure TypeScript tools: domain + `toolBuilder` adapter + tests |
| `tools/csharp/` | Orkeon tools in C#: one .NET solution per tool, with its tests and its own workbook |
| `schemas/` | JSON schemas of deliverables |
| `datasets/` | synthetic datasets shared by several teams, each with its manifest |
| `mount-schemes/` | your schemes of mount points, proposed when a team is created and its need names no folder |
| `examples/` | the pilot teams (workbook + tests + crew, once built in lots 2–8; today their READMEs, and the workbook of `mail-triage`), outside Studio's catalogue |

## The promotion rule

A brick enters the library only when **at least one accepted team has proven it**: the team reached
the verdict `ACCEPTED` with that brick in place. Nothing is written here speculatively.

- Promotion happens at `/team-release`, or by hand with a `DEC-nnnn` in the team that proposes it.
- Every brick records where it comes from: the team, the attempt (`ATT-nnnn`), the Orkeon version and
  the LLM profile it was accepted with.
- Every brick has a `README.md` (what it does, when to use it, when not to) and, for code, its tests.
- A brick is used by reference or by copy as its folder's README says; a team never edits a library
  brick in place to fit its own case — it proposes a new version.
- No secret, no key, no real personal data. Anonymised real data needs a decision.

A brick that stops being true (Orkeon changed, a better one exists) is removed with a decision, not
left to rot: the library is small on purpose.
