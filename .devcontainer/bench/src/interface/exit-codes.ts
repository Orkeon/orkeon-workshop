/** Exit codes of `orkeon-bench`; scripts and hooks rely on them. */
export const EXIT = {
  /** The command did what was asked and, when it checks something, the check holds. */
  ok: 0,
  /** The command ran but what it checked does not hold (doctor failure, invalid report, an error finding of `check`). */
  failed: 1,
  /** Bad usage or input: unknown team, missing file, malformed JSON, unknown environment. */
  error: 2,
  /** `decide`: no decision model to ask (none configured, the circuit off, or a remote one without `--allow-remote`); nothing on stdout. */
  noDecisionModel: 4,
  /** `decide`: the decision provider failed (unreachable, timed out, 429 or 5xx after its retries, an answer it cannot give, settings Orkeon refuses). */
  decisionFailed: 5,
  /** The command was asked to stop (SIGINT, SIGTERM, SIGHUP) and did, after putting things back in order. */
  interrupted: 130,
} as const;
