/** Exit codes of `orkeon-bench`; scripts and hooks rely on them. */
export const EXIT = {
  /** The command did what was asked and, when it checks something, the check holds. */
  ok: 0,
  /** The command ran but what it checked does not hold (doctor failure, invalid report). */
  failed: 1,
  /** Bad usage or input: unknown team, missing file, malformed JSON, unknown environment. */
  error: 2,
  /** The command exists but belongs to a later lot. */
  notImplemented: 3,
} as const;
