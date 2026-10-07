import type { ShutdownSignal, ShutdownWatch } from '../application/ports/shutdown-signal.js';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/** Watches the signals that ask the process to stop; a second one, after the first, ends it at once. */
export class ProcessShutdownSignal implements ShutdownSignal {
  watch(): ShutdownWatch {
    let requested = false;
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const release = (): void => {
      for (const signal of SIGNALS) {
        process.off(signal, stop);
      }
    };
    const stop = (): void => {
      requested = true;
      release();
      resolve();
    };
    for (const signal of SIGNALS) {
      process.once(signal, stop);
    }
    return { requested: promise, isRequested: () => requested, release };
  }
}
