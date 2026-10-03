import type { HttpProbe, HttpProbeResult } from '../../src/application/ports/http-probe.js';

/** Scripted results per URL; unknown URLs are unreachable. Records each URL and its timeout. */
export class FakeHttpProbe implements HttpProbe {
  readonly requests: string[] = [];
  readonly timeouts: number[] = [];

  constructor(private readonly results: Record<string, HttpProbeResult> = {}) {}

  async get(url: string, timeoutMs: number): Promise<HttpProbeResult> {
    this.requests.push(url);
    this.timeouts.push(timeoutMs);
    return this.results[url] ?? { reachable: false, error: 'ECONNREFUSED' };
  }
}
