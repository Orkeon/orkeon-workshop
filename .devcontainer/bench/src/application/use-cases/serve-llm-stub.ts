import { stubIssues, type StubExchange } from '../../domain/llm-stub.js';
import { STUB_API_KEY, STUB_MODEL, stubBaseUrl } from '../../domain/profile.js';
import { resolvePath } from '../../domain/paths.js';
import type { Environment, FileSystem, LlmStubServer, LlmStubSession, ShutdownSignal } from '../ports/index.js';
import { loadStubScript } from '../runs/load-stub-script.js';

export interface ServeLlmStubInput {
  /** A scenario or a reply script. */
  readonly scenarioFile: string;
  readonly port?: number;
  /** A JSONL file every exchange is appended to as it happens; what it already holds is kept. */
  readonly logFile?: string;
}

/** What to export to point a run at the stub. */
export interface StubEndpoint {
  readonly baseUrl: string;
  readonly port: number;
  readonly model: string;
  /** A fake, non-empty key: not a secret. */
  readonly apiKey: string;
}

export interface StubSessionSummary {
  readonly requests: number;
  /** What the script did not cover or a request could not take; empty when the script was followed. */
  readonly issues: readonly string[];
}

/**
 * `llm-stub serve`: the simulated LLM in the foreground (plan § 6.3), answering from the reply
 * script of a scenario until the bench is told to stop. `announce` receives the endpoint as soon
 * as it listens.
 */
export class ServeLlmStub {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly environment: Environment,
    private readonly stub: LlmStubServer,
    private readonly shutdown: ShutdownSignal,
  ) {}

  async execute(input: ServeLlmStubInput, announce: (endpoint: StubEndpoint) => void): Promise<StubSessionSummary> {
    if (input.port !== undefined) {
      stubBaseUrl(input.port);
    }
    const cwd = this.environment.currentDirectory();
    const script = await loadStubScript(this.fileSystem, resolvePath(cwd, input.scenarioFile));
    const logFile = input.logFile === undefined ? null : resolvePath(cwd, input.logFile);
    if (logFile !== null) {
      // Appended to, never emptied: an existing file keeps what it holds. A log that cannot be written is said before the server starts.
      await this.fileSystem.appendText(logFile, '');
    }
    // Appends are chained so that the log keeps the order of the exchanges.
    let logged: Promise<void> = Promise.resolve();
    const onExchange = (exchange: StubExchange): void => {
      if (logFile !== null) {
        logged = logged.then(() => this.fileSystem.appendText(logFile, `${JSON.stringify(exchange)}\n`));
      }
    };
    const watch = this.shutdown.watch();
    let session: LlmStubSession;
    try {
      session = await this.stub.start(script, { ...(input.port === undefined ? {} : { port: input.port }), onExchange });
      try {
        announce({ baseUrl: session.baseUrl, port: session.port, model: STUB_MODEL, apiKey: STUB_API_KEY });
        await watch.requested;
      } finally {
        await session.stop();
      }
    } finally {
      watch.release();
    }
    await logged;
    const exchanges = session.exchanges();
    return { requests: exchanges.length, issues: stubIssues(exchanges) };
  }
}
