import type { StubExchange, StubScript } from '../../domain/llm-stub.js';

export interface LlmStubOptions {
  /** The port to listen on; the system picks one when absent. Never 11434 (`stubBaseUrl`). */
  readonly port?: number;
  /** Called after each exchange, in order: the live log of `llm-stub serve`. */
  readonly onExchange?: (exchange: StubExchange) => void;
}

/** A running simulated LLM (plan § 6.3): an OpenAI- and Ollama-compatible endpoint on `127.0.0.1`. */
export interface LlmStubSession {
  /** `http://127.0.0.1:<port>/v1`: the value of `ORKEON_Llm__BaseUrl` for the run. */
  readonly baseUrl: string;
  readonly port: number;
  /** What the stub received and answered so far, oldest first. */
  exchanges(): readonly StubExchange[];
  stop(): Promise<void>;
}

/** Starts a simulated LLM that answers from a reply script. */
export interface LlmStubServer {
  start(script: StubScript, options?: LlmStubOptions): Promise<LlmStubSession>;
}
