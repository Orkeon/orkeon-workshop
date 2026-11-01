---
name: team-release
description: "Step 6 of the method: releases an accepted Orkeon team — orkeon-bench release verifies the ACCEPTED attempt and that crew/ and mounts.json match its design snapshot, re-runs scaffold, compacts the runs and prints the tag command; the skill brings the team's README up to date, records the version in STATUS.md (phase published) and proposes the tag, never typing it."
argument-hint: "[<slug>]"
disable-model-invocation: true
---

# /team-release — publish an accepted team

Step 6 of the method (`references/process/workflow.md`). Nothing is built, tested or judged here: a
release is the accepted attempt made durable and findable.

Arguments: $ARGUMENTS

## Contract

- Reads: `STATUS.md` (`phase: accepted`, `verdict: ACCEPTED`, no open attempt), the last closed
  attempt, `TEAM.md`, `teams/<slug>/README.md`, `references/process/checklists/release.md`.
- Bench: `orkeon-bench release <slug>` — refuses without an ACCEPTED closed attempt or when `crew/` or
  `mounts.json` differs from that attempt's design snapshot; re-runs scaffold; keeps
  `retention.runs_keep` runs plus the ones a report cites (its scenarios' and those of the report it
  replaced) or an attempt manifest lists, moves the others to `archive/runs/<slug>/`; prints `<slug>:
  release v<n> ready` and `tag: git tag team/<slug>/v<n> && git push origin team/<slug>/v<n>`. Exit 1,
  nothing moved, when an attempt's `report.json` cannot be read: each one is named.
- Writes: `teams/<slug>/README.md` (what the team does, its mount points, how to launch, the version
  and the attempt that accepted it, the prerequisites — never a key); `STATUS.md`.
- Journal: `— /team-release — v<n> released (tag team/<slug>/v<n> proposed)`.
- Exit state: `phase: published`, `next_action: null` — or the tag command, for the user.

## Steps

1. **Find the team**: the argument, else the only team with `phase: accepted`, else ask. `orkeon-bench
   status <slug>`: `phase: accepted`, `verdict: ACCEPTED`. Else stop: the team is not accepted
   (`/team-status <slug>`), or already published.
2. `orkeon-bench release <slug>`: relay a refusal as it is (a crew or a `mounts.json` changed after
   acceptance goes back through `/team-decision` and a new attempt; an unreadable report is repaired
   — `orkeon-bench report validate <file>` — or removed, then release again). Note `v<n>`, the runs kept and archived, the tag line.
3. **README** of the team: Edit it to state the version, the date, the attempt id and its levels, the
   mount points of `mounts.json`, the launch lines (HARNESS.md rule 10), the prerequisites. Walk
   `checklists/release.md`.
4. `STATUS.md`: `phase: published`, `next_action: null`, `updated_at`, the journal line.
5. **Hand over**: the version, what was kept and archived, and the tag command for the user to type
   (`git tag`/`git push` are theirs: you never run them, D74 applies to publishing as to building).

## Done when

The bench printed `release v<n> ready`, the README names the version, `phase: published`. This step
changes nothing in `crew/`, `tests/<slug>/` or `TEAM.md`, and tags nothing.
