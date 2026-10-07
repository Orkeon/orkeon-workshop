import type { LlmStubOptions, LlmStubServer, LlmStubSession } from '../../src/application/ports/llm-stub.js';
import type { ShutdownSignal, ShutdownWatch } from '../../src/application/ports/shutdown-signal.js';
import { answerStubRequest, type StubExchange, type StubScript } from '../../src/domain/llm-stub.js';

/**
 * A stub without a socket: each session answers, with the real rule, the requests given in advance
 * for it (the first list for the first session, and so on), as if a run had sent them.
 */
export class FakeLlmStub implements LlmStubServer {
  readonly scripts: StubScript[] = [];
  readonly options: LlmStubOptions[] = [];
  stopped = 0;

  constructor(
    private readonly requests: readonly (readonly { path: string; body: unknown }[])[] = [],
    readonly port = 43210,
  ) {}

  async start(script: StubScript, options: LlmStubOptions = {}): Promise<LlmStubSession> {
    const sent = this.requests[this.scripts.length] ?? [];
    this.scripts.push(script);
    this.options.push(options);
    const exchanges: StubExchange[] = sent.map((request, index) => answerStubRequest(script, request.path, request.body, index + 1));
    exchanges.forEach((exchange) => options.onExchange?.(exchange));
    return {
      baseUrl: `http://127.0.0.1:${String(options.port ?? this.port)}/v1`,
      port: options.port ?? this.port,
      exchanges: () => exchanges,
      stop: async () => {
        this.stopped += 1;
      },
    };
  }
}

/**
 * Requests to stop, played by the test: already come (a foreground server then ends as soon as it
 * has started), or asked for later with `request()`.
 */
export class FakeShutdownSignal implements ShutdownSignal {
  watched = 0;
  released = 0;
  private requested = false;
  private resolve: () => void = () => undefined;
  private readonly promise = new Promise<void>((done) => {
    this.resolve = done;
  });

  constructor(alreadyRequested = true) {
    if (alreadyRequested) {
      this.request();
    }
  }

  request(): void {
    this.requested = true;
    this.resolve();
  }

  watch(): ShutdownWatch {
    this.watched += 1;
    return {
      requested: this.promise,
      isRequested: () => this.requested,
      release: () => {
        this.released += 1;
      },
    };
  }
}
