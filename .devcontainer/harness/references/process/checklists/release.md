# Checklist — release: delivering an accepted team

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: harness `references/process/workflow.md` § 5, § 11; `references/orkeon/studio-layout.md`; `library/README.md`, `library/tools/ts/README.md`;
> `FROZEN-LITERALS.md` § 4; `VERIFICATIONS.md` (V-03, V-07, V-12, V-15, re-checked in the sources at 24ab0d0); `HARNESS.md` (rules of engagement);
> Orkeon `src/apps/Orkeon.Studio.Core/Teams/TeamCatalog.cs`, `docs/guides/email.md`; plan § 4.3, § 4.6, D3.

Exit of `/team-release`. There is no exit gate after it: the boxes below decide whether the team is
delivered. `orkeon-bench release` (lot 9) will realign, compact and print the commands; until then
by hand. The team already sits in Studio's catalogue (`teams/<slug>/`): releasing moves nothing.
Boxes common to every gate: [`README.md`](README.md).

## Before the release

- [ ] `STATUS.md` says `phase: accepted`, `verdict: ACCEPTED`, `gate_passed: review`; the last attempt
  is closed with `verdict: ACCEPTED` in its manifest.
- [ ] The definition is the one accepted: `teams/<slug>/crew/` (and the custom tools it imports) has not
  changed since the attempt's design snapshot — `diff -r` against `design-snapshot/`, or the commit
  it names. A later change needs a new attempt.

## Pass when

**The team folder**

- [ ] It holds only what Studio and the crew need: `crew/`, `mounts.json`, `studio-team.json`,
  `run.sh`, `run.cmd`, `README.md`, one folder per mount point with its `.gitkeep`, the `.gitignore`
  that `orkeon-bench scaffold` writes, and for TypeScript `tsconfig.json` and `typings/` (outside
  `crew/`). No `agents/` or `tasks/` folder, flat YAML triplet or `*.ork.ts` at its root: Studio would
  take the team folder itself for the crew and the launch fails, run a root `crew.ork.ts` instead of
  `crew/`, or ask which script to run (V-15). No settings file either (`appsettings*.json` at its root,
  `appsettings/`, `_shared/`, `crew/appsettings.json`): Orkeon would read it for the team's runs
  (`orkeon-bench doctor` and the check scripts report it); the team's settings live in `settings/<slug>/`
  (D33).
- [ ] Card and launchers are realigned from `mounts.json`: `orkeon-bench scaffold <team>` was run;
  `run.sh` is LF and executable, `run.cmd` CRLF; the check script and `./run.sh --validate` pass
  (`orkeon-harness-run crew --plugins <dir> --validate` for a team using C# plugin tools).
- [ ] `studio-team.json` holds `name`, `description`, `mounts[]` (`./<folder>:<root>:<access>`), and
  `profile` / `schedule` only if the user gave them; `archived`, `archivedAt`, `lastRunAt`, `addedAt`
  are Studio's own (`TeamCatalog.cs`); no other key (Studio drops unknown keys when it saves the card).
  The default folders stay inside the team (V-12).

**The README of the team**

- [ ] Regenerated: purpose, agents, tasks, mount points and what each holds, prerequisites, how to
  launch from Studio and with `./run.sh` (and `TEAM_ENV=<name> ./run.sh` for a mount set), a summary
  of the attempts and of the accepted report.
- [ ] Prerequisites name variables, never values: the LLM profile, tool keys (`ORKEON_TAVILY_API_KEY`
  for `web_search`…), the firewall domains a remote provider, a web tool or a mail server needs.
- [ ] A team using the e-mail tools names the account it expects in `Orkeon:Tools:Email` (declared in
  `settings/<slug>/appsettings.json`, D33), the rights it needs, the allowed recipients when it sends, and how to check the account (`orkeon email
  accounts`, `orkeon email check`: `docs/guides/email.md`); passwords and secrets are named by their
  variable.
- [ ] A team using a C# plugin tool says it runs through `orkeon-harness-run`, not from Studio on
  Windows, which launches the shipped `orkeon` (V-07).

**Archive and library**

- [ ] Old runs compacted: the last `retention.runs_keep` runs plus every run a report cites stay under
  `runs/`; the rest goes to `archive/`.
- [ ] A brick proposed for `library/` was proven by this accepted team, comes with its tests and its
  README (origin team, attempt, Orkeon version, LLM profile), and is recorded at release or with a
  `DEC-nnnn` (`library/README.md`). A TypeScript tool follows `library/tools/ts/README.md`.
- [ ] No secret in `teams/<slug>/`, `workbooks/<slug>/`, `tests/<slug>/`, `settings/<slug>/` or the
  promoted bricks.

**The commit, proposed**

- [ ] The commit and the tag `team/<slug>/v<n>` are **proposed** as exact commands for the user to run;
  nothing is committed or tagged by Claude (D3).

## Evidence to look at

```bash
diff -r workbooks/<slug>/attempts/ATT-nnnn/design-snapshot/crew teams/<slug>/crew   # nothing, if the snapshot holds crew/
orkeon-bench scaffold <team> && orkeon-bench mounts <team>
(cd teams/<slug> && ./run.sh --validate)
grep -rnE 'sk-|ghp_|AKIA|BEGIN .*PRIVATE KEY' teams/<slug> workbooks/<slug> tests/<slug> settings/<slug>   # nothing
```

The layout of the snapshot is set by `orkeon-bench attempt` (lot 4): compare like with like. A proposed
commit reads, for instance, `git add teams/<slug> workbooks/<slug> tests/<slug> settings/<slug> && git
commit -m "<slug>: v1, accepted in ATT-0003" && git tag team/<slug>/v1` (`settings/<slug>` only when the
team has its own settings; `workbooks/*/runs/` and the mount sets `mounts.*/` are git-ignored).

## Usual reasons to refuse

- The verdict is not `ACCEPTED`, or the crew differs from the accepted snapshot.
- The README or the card does not match `mounts.json`; launchers edited by hand instead of regenerated.
- A key value in the README, the card or a promoted brick.
- A commit or a tag run without the user.
- A brick promoted without having been proven, or without its tests and README.

## Once passed

`STATUS.md`: `phase: published`, a `next_action` that makes sense (for instance `/team-status`); the
version goes in the journal, `- YYYY-MM-DD HH:MM — /team-release — v1 released (tag team/<slug>/v1 proposed)`.
