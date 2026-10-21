# Profiles

*English · [Français](../fr/reference/profiles.md)*

A **profile** names the packs of the harness — skills, subagents, rules, the switches of some hooks —
that the folder Claude Code works in receives. Every folder runs `user` unless you choose otherwise:
with it, a workshop gets the harness exactly as [The harness](./harness.md) describes it. The other
profiles exist for whoever works on a repository — Orkeon, this project, or another — in a **git
checkout**. This page says, for each profile, who it is for, what it changes and in which folder it
applies; the mechanics (packs, switches, the deployment into a checkout) are in
[Profiles and packs](./harness.md#profiles-and-packs), and the step-by-step of each role in
[the workflows](../workflows/overview.md).

## The profiles

The facts below are read in the definitions the image ships (`profiles/*.yaml`, `profiles/packs/*.yaml`
of the harness) and in what deploys them (`sync-harness.sh`, `workshop-profile.py`).

| Profile | For whom | What it changes | In which folder |
|---|---|---|---|
| `user` (the default) | whoever **builds Orkeon teams**: an Orkeon Studio user, or a developer building teams for a project of their own | the workshop harness: the method (`/team-init` … `/team-tests`, `/team-approve`), the generators, `orkeon-bench`, `/deploy`, `/orkeon-tour`, `/workshop-language`, the guards of the workshop | a **workshop** — a folder of teams: one that holds `teams/`, one the harness was deployed into, or an empty one. Git may version it ([the rule](../concepts/workshop.md#into-a-workshop-or-a-git-checkout)) |
| `contrib` | an **outside contributor** to Orkeon or to this project: reproduce a failure, report it, validate a fix, prepare a pull request | the workshop harness **plus** the contrib pack (`/contrib-*`: the issue, the validated fix, the pull request) and the usage pack (`/token-usage`) | a workshop, **or** the top of a git checkout (without the workshop packs there) |
| `dev` | a **core developer** of a repository | the dev chain in a checkout: `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-batches`, `/dev-verify`, the review and test subagents, `/quality-report`, `/token-usage`; **no team skill, no `teams/`** | the top of a git checkout only |
| `release` | whoever **releases** a repository | the quality gates, the readiness check, the evidence record, the notes, the verification of what was published, the docs audit | the top of a git checkout only |
| `docs` | whoever **keeps the documentation true** to the code | the audit of the pages against the code | the top of a git checkout only |
| `all` | the maintainer who does a bit of everything | every pack that fits the folder: in a workshop, `user` plus `contrib` and the usage pack; in a checkout, every source pack | either |
| `custom:<pack>,<pack>` | anything else | the packs you name, and `core` (the guards, the switcher, the evals) always | either, when one of the packs fits it |

Two facts settle the common questions:

- **The source profiles are not tied to this repository.** `dev`, `release`, `docs` and `contrib` apply
  to the top of any git checkout: their skills are generic and read what is specific to a repository —
  commands, checklists, layout rules — in a **repository pack** that joins the profile when the `origin`
  remote is that repository. Two exist: `repo-orkeon` for Orkeon and `repo-orkeon-workshop` for this
  project. In another repository the skills ask for what they miss.
- **A source profile builds no team.** In a checkout there is no `teams/`, no workbook and no `team-*`
  skill: the hooks made for a workshop stay silent and the repository's own `CLAUDE.md` rules its code
  ([In a source checkout](./harness.md#in-a-source-checkout)). A developer who builds teams for a
  project of their own therefore works with `user`, in a **folder of teams** of their own — which may
  be a git repository, versioned from its first commit — and keeps the project's code in another
  folder: to see it from the workshop, mount it next to the workshop by hand
  (`-v "<project>:/projects/<name>"`, [Starting by hand](../getting-started/install.md#starting-by-hand)).

What `user` refuses, and the message it gives, is in
[Into a workshop, or a git checkout](../concepts/workshop.md#into-a-workshop-or-a-git-checkout).

## Choosing one

- **At the first start**: `-Profile <name>` of the start script (`--profile <name>` on Linux), or
  `-e HARNESS_PROFILE=<name>` on a `docker run` typed by hand. It is the folder's **first** profile: a
  folder that has one already keeps it. The script's other options — the folder, the container's
  name, the model, the GPU, the update — are in
  [The script's options](../getting-started/install.md#the-scripts-options).
- **Later**: `/workshop-profile <name>` in Claude Code, or `workshop-profile <name>` in a terminal of
  the container; `workshop-profile --list` shows which profiles fit the folder, `--show` the active one.
  A profile not made for the folder is refused with those that fit: `dev` in a workshop, `user` in a
  checkout.

One line of the start script is **one named container** (`-Name`, `my-orkeon-workshop` by default): a
`-Profile` given with the name of a container created on another profile is refused, not applied —
give the new folder a container of its own, or change the profile inside with `workshop-profile`
([Later: reopen, add a terminal, stop](../getting-started/install.md#later-reopen-add-a-terminal-stop)).
