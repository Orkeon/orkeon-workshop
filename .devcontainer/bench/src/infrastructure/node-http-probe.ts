import type { HttpProbe, HttpProbeResult } from '../application/ports/http-probe.js';

/** GET with the global fetch; any failure (refused, timeout, DNS) is reported, never thrown. */
export class NodeHttpProbe implements HttpProbe {
  async get(url: string, timeoutMs: number): Promise<HttpProbeResult> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
      await response.body?.cancel();
      return { reachable: response.ok, status: response.status };
    } catch (error) {
      return { reachable: false, error: describe(error) };
    }
  }
}

/** The network error code when fetch carries one (ECONNREFUSED...), else the message. */
function describe(error: unknown): string {
  const failure = error as { message?: string; cause?: { code?: string; message?: string } } | null | undefined;
  return failure?.cause?.code ?? failure?.cause?.message ?? failure?.message ?? String(error);
}
