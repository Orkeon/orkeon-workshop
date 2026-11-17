# A long autonomous session

*English · [Français](../fr/guides/long-session.md)*

A run of a dozen batches lasts a day or more. In October 2026 one such run (GAP-50-55, twelve batches on
Orkeon, with the harness's own `/dev-batches`) took 34 h 31 from the launch to its pull request for about
15 h 30 of work: 8 h 17 went to a frozen machine, 1 h 35 to a rate limit, and 9 h to waiting for someone to
type "go on".

That chain is removed from the harness (D114), and with it its run log, its resume at start, the switch
`HARNESS_AUTO_RESUME` and the supervisor script `dev-batches-supervise.sh`. A long run of batches is now
Orkeon Code's `/dev-batches`, in its REPL ([Develop a feature](../workflows/develop.md)). This page says
what still helps a long session, and what stays yours.

## What still helps

- **Claude Code waits out a rate limit.** The harness sets Claude Code's `CLAUDE_CODE_RETRY_WATCHDOG=1`: a
  request hit by a `429` or a `529` waits for the window and retries instead of failing (D82).
- **Orkeon Code keeps the state of its batches.** It writes it in the project, under `.orkeon/dev/<code>/`,
  and its REPL names at start the batches a previous session left open. How it resumes is in
  [its documentation](https://orkeon.github.io/orkeon-code/). Its rate limits are those of its own model,
  not of your Claude plan.
- **A terminal that survives your window.** `tmux` is in the image: `tmux new -s code`, then `orkeon-code`
  inside (`workshop code` in the keys mode); detach with Ctrl+B then D, come back with `tmux attach -t code`.
- **The worktrees on a volume.** On a Windows folder, the start commands of Install put the worktrees on
  a Docker volume ([Docker modes](docker-modes.md#advanced-the-worktrees-on-a-volume), D85).

Nothing restarts a Claude Code or an Orkeon Code that exited, and nothing types into a conversation that
stalled.

## What stays yours

- **The host awake.** A Windows host that sleeps freezes the container and everything in it. Set its power
  plan so that it never sleeps on mains (Settings, System, Power: "When plugged in, put my device to sleep
  after: Never"), or run `powercfg /change standby-timeout-ac 0` in a Windows terminal.
- **The container.** After a restart of the container, open the session again yourself.
- **The disk.** A folder of a Windows disk mounted in the container sits on a 9p mount: GAP-50-55 measured
  a read 170 times slower than on Docker's own disk, `git status` at 7.8 seconds, and every stall of the
  run there.
- **The bill.** A long run of Orkeon Code on a hosted model is paid by the key you set
  ([Model keys](keys.md)); on the local model it costs nothing and is slower.

## See also

- [Develop a feature](../workflows/develop.md).
- [Orkeon Code and Studio's terminal applications](orkeon-code.md).
- [Harness reference](../reference/harness.md#switches): `CLAUDE_CODE_RETRY_WATCHDOG`, `HARNESS_BUILD_LOCK`,
  `HARNESS_WORKTREE_ROOT`.
- [Measure what a session costs](../workflows/measure.md).
