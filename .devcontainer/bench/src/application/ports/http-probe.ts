export interface HttpProbeResult {
  /** True when the server answered with a 2xx status. */
  readonly reachable: boolean;
  readonly status?: number;
  readonly error?: string;
}

/** A GET used only to check that a local service answers (Ollama, the LLM stub). */
export interface HttpProbe {
  get(url: string, timeoutMs: number): Promise<HttpProbeResult>;
}
