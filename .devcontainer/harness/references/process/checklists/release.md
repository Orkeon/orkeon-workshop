# Checklist — release: delivering an accepted team

> Reference document of the Orkeon harness (the workshop's `references/process/checklists/`). Established on Orkeon main at fb26364 (2026-10-06, after 1.0.0-rc.4).
> Sources: harness `references/process/workflow.md` § 5, § 11; `references/orkeon/studio-layout.md`; `library/README.md`, `library/tools/ts/README.md`;
> `FROZEN-LITERALS.md` § 4; `VERIFICATIONS.md` (V-03, V-07, V-12, V-15, re-checked in the sources at fb26364); `HARNESS.md` (rules of engagement);
> Orkeon `src/apps/Orkeon.Studio.Core/Teams/TeamCatalog.cs`, `docs/guides/email.md`; plan § 4.3, § 4.6, D3.

Exit of `/team-release`. There is no exit gate after it: the boxes below decide whether the team is
delivered. `orkeon-bench release` (lot 9) will realign, compact and print the commands; until then
by hand. The team already sits in `teams/<slug>/`, Studio's catalogue once its teams root points at the
workshop's `teams/` (`orkeon/studio-layout.md`): releasing moves nothing.
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
  `crew/`). No flat YAML triplet or `*.ork.ts` at its root, no crew in `crew/crew/`: Studio and
  `orkeon run` read `crew/` first and set the root aside (V-15), so such a file never runs, and
  `orkeon run crew` would load a `crew/crew/` in place of the team's. A root `agents/` or `tasks/` folder
  is there only as the folder of a mount point. No settings file either: `crew/appsettings.json`, or an
  `appsettings/` / `_shared/` folder up the tree, is the settings file of every run that names none; an
  `appsettings.json` at its root is the settings file of `--list-tools`, `orkeon doctor`, `orkeon email`
  and `orkeon mcp serve` started from the team folder (`orkeon/cli.md` § 5; `orkeon-bench doctor` and the
  check scripts report them); the team's settings live in `settings/<slug>/` (D33).
- [ ] Card and launchers are realigned from `mounts.json`: `orkeon-bench scaffold <team>` was run;
  `run.sh` is LF and executable, `run.cmd` CRLF; the check script and `./run.sh --validate` pass
  (`orkeon-harness-run crew --plugins <dir> --validate` for a team using C# plugin tools).
- [ ] `studio-team.json` holds `name`, `description`, `mounts[]` (`./<folder>:<root>:<access>`), and
  `profile` / `schedule` only if the user gave them; `archived`, `archivedAt`, `lastRunAt`, `addedAt`
  are Studio's own (`TeamCatalog.cs`); no other key (Studio writes back the keys it does not know when
  it saves the card, and reads none of them).
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
