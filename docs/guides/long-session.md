# A long autonomous session

A `/dev-batches` run of a dozen batches lasts a day or more. In October 2026 one such run (GAP-50-55, twelve
batches on Orkeon) took 34 h 31 from the launch to its pull request for about 15 h 30 of work: 8 h 17 went to a
frozen machine, 1 h 35 to a rate limit, and 9 h to waiting for someone to type "go on" — a night after the
container stopped, two hours after the rate-limit window reset, a stall of 4 h 28 that ended at "where do you
stand?". This page says what the harness does about each, and what stays yours.

## What the harness does

- **It keeps a log of the run.** `/dev-batches` appends one line per event — a batch launched, returned,
  merged, relaunched, stopped, a stall — to `<work>/<code>/<CODE>-BATCHES-STATE.md`, as the run goes.
- **It resumes after a restart.** At every start of Claude Code (a new `claude`, a `claude --continue`, the
  container started again), a hook reads that log and tells Claude which batches the run left open. The
  background agents of the previous process are lost; their worktrees and their checkpoints (a local commit
  after each green step) are not. Claude runs the preflight again — a git identity exported by
  `workshop --git-identity` dies with the process that held it — then resumes each open batch from its
  checkpoints: after asking you once by default, without asking when you set `HARNESS_AUTO_RESUME=1` in your
  settings (D82).
- **It waits out a rate limit.** The harness sets Claude Code's `CLAUDE_CODE_RETRY_WATCHDOG=1`: a request
  hit by a `429` waits for the window and retries instead of failing. A batch agent that failed all the same
  is resumed from its checkpoints like a stopped one.
- **It notes the stalls.** A batch agent waits in slices of 270 seconds; a slice that comes back more than
  ten minutes late is a stall (the host asleep, the disk frozen), noted in the batch's report and in the log,
  so that the next usage report attributes it without guessing.
- **It warns before the launch.** The preflight prints the memory (two batches per 15 GB), the type of the
  disk the checkout sits on, and the worktrees a stopped run left.

## The supervisor

Nothing restarts a Claude Code that exited, and nothing types into a conversation that stalled. For a run that
lasts the night, `/dev-batches` hands you `.claude/local/scripts/dev-batches-supervise.sh` (D83). Once:

1. Set `HARNESS_AUTO_RESUME` to `1` in `.claude/settings.local.json` (`"env": {"HARNESS_AUTO_RESUME": "1"}`),
   so that a resumed session goes on without a question.
2. Leave Claude Code (`/exit`). In a terminal of the container:

   ```bash
   bash .claude/local/scripts/dev-batches-supervise.sh
   ```

3. Then attach to the session it opened:

   ```bash
   tmux attach -t dev-batches
   ```

   The conversation comes back there (`claude --continue`), and the run goes on. Detach with Ctrl+B then D;
   the session keeps running.

Every minute, while the log has an open batch, the supervisor types `claude --continue` again when the session
exited, and sends one message — `Resume the batches` — when no transcript of the project was written for 30
minutes (`--idle`). It never types into a conversation that is working, and it stops by itself once `/dev-batches`
closes the run. Its log is `.claude/local/logs/dev-batches-supervise.log`; `--check` prints what it sees without
doing anything. It keeps an interactive session, never `claude -p`: a `-p` run does not wait for a rate limit.

## What stays yours

- **The host awake.** A Windows host that sleeps freezes the container and every batch. Set its power plan so
  that it never sleeps on mains (Settings, System, Power: "When plugged in, put my device to sleep after:
  Never"), or run `powercfg /change standby-timeout-ac 0` in a Windows terminal.
- **The container.** The supervisor cannot start a container that stopped: after a restart of the container,
  run it again (step 2).
- **The disk.** A folder of a Windows disk mounted in the container sits on a 9p mount: GAP-50-55 measured a
  read 170 times slower than on Docker's own disk, `git status` at 7.8 seconds, and every stall of the run
  there. Keep your folder where it is and put the batches' worktrees on a Docker volume, the advanced setting of
  [Docker modes](docker-modes.md#advanced-the-worktrees-on-a-volume): builds twice as fast, a worktree made 70
  times faster (D85).
- **While the batches run**, a question goes through `/btw`; never Esc, Ctrl+C or Ctrl+X Ctrl+K, which stop the
  background agents, and no message until the conversation is idle.

## See also

- [Develop a feature](../workflows/develop.md): the dev chain and `/dev-batches`.
- [Harness reference](../reference/harness.md): `HARNESS_AUTO_RESUME`, `HARNESS_DEV_BATCHES_MAX`,
  `HARNESS_BUILD_LOCK`.
- [Measure what a session costs](../workflows/measure.md).
