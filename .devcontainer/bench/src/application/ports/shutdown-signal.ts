/** A watch on the requests to stop (SIGINT, SIGTERM, SIGHUP), held until released. */
export interface ShutdownWatch {
  /** Resolves at the first request to stop. */
  readonly requested: Promise<void>;
  isRequested(): boolean;
  /** Ends the watch: a later request stops the bench as it would any process. */
  release(): void;
}

/**
 * How a command that must clean up after itself learns that it is asked to stop: while a watch is
 * held, the first request no longer ends the process — the command does, once it has put things
 * back in order.
 */
export interface ShutdownSignal {
  watch(): ShutdownWatch;
}
