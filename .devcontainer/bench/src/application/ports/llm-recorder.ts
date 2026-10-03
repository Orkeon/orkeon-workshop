/** A local OpenAI-compatible endpoint, started for one run, that records what Orkeon sends. */
export interface LlmRecording {
  /** `http://127.0.0.1:<port>/v1`: the value of `ORKEON_Llm__BaseUrl` for the run. */
  readonly baseUrl: string;
  /** The JSON bodies of the chat-completions requests received so far, oldest first. */
  requests(): readonly unknown[];
  stop(): Promise<void>;
}

/** Starts recordings; every request gets a short final answer, so a run ends after one call. */
export interface LlmRecorder {
  start(): Promise<LlmRecording>;
}
