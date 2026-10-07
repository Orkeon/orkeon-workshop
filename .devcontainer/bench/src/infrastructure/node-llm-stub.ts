import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ApplicationError } from '../application/errors.js';
import type { LlmRecorder, LlmRecording } from '../application/ports/llm-recorder.js';
import type { LlmStubOptions, LlmStubServer, LlmStubSession } from '../application/ports/llm-stub.js';
import { RECORDER_SCRIPT, answerStubRequest, droppedStubExchange, stubModelList, type StubExchange, type StubScript } from '../domain/llm-stub.js';
import { STUB_HOST, stubBaseUrl } from '../domain/profile.js';

/** Largest request body kept: a request with every tool schema is about 60 kB. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/**
 * The simulated LLM on `127.0.0.1` and a port the system picks (or the one asked for): every `POST`
 * is answered from the reply script (`answerStubRequest`, both dialects) and kept as an exchange;
 * a `GET` lists `stub-model`. A request dropped before its body arrived is kept too, with its issue,
 * and the server goes on.
 */
export class NodeLlmStub implements LlmStubServer {
  start(script: StubScript, options: LlmStubOptions = {}): Promise<LlmStubSession> {
    const exchanges: StubExchange[] = [];
    const server = createServer((request, response) => {
      // A client may drop its request at any point: that ends the exchange, never the server.
      response.on('error', () => undefined);
      handle(request, response, script, exchanges, options.onExchange).catch(() => undefined);
    });
    return new Promise((resolve, reject) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        reject(new ApplicationError('process-failed', `the simulated LLM cannot listen on ${STUB_HOST}:${String(options.port ?? 0)}: ${error.code ?? error.message}`));
      });
      server.listen(options.port ?? 0, STUB_HOST, () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          baseUrl: stubBaseUrl(port),
          port,
          exchanges: () => [...exchanges],
          stop: () =>
            new Promise<void>((done) => {
              server.closeAllConnections();
              server.close(() => {
                done();
              });
            }),
        });
      });
    });
  }
}

/** The stub with the script that answers `OK` to everything: what `tools dump` records against. */
export class NodeLlmRecorder implements LlmRecorder {
  constructor(private readonly stub: LlmStubServer = new NodeLlmStub()) {}

  async start(): Promise<LlmRecording> {
    const session = await this.stub.start(RECORDER_SCRIPT);
    return { baseUrl: session.baseUrl, requests: () => session.exchanges().map((exchange) => exchange.request), stop: () => session.stop() };
  }
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  script: StubScript,
  exchanges: StubExchange[],
  onExchange: ((exchange: StubExchange) => void) | undefined,
): Promise<void> {
  if (request.method !== 'POST') {
    send(response, 200, stubModelList());
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(buffer);
      }
    }
  } catch (error) {
    // The body never arrived whole (a killed or crashing client): there is nobody to answer.
    const dropped = droppedStubExchange(request.url ?? '', exchanges.length + 1, (error as NodeJS.ErrnoException).code ?? (error as Error).message);
    exchanges.push(dropped);
    onExchange?.(dropped);
    response.destroy();
    return;
  }
  let body: unknown = null;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    body = null;
  }
  const exchange = answerStubRequest(script, request.url ?? '', body, exchanges.length + 1);
  exchanges.push(exchange);
  onExchange?.(exchange);
  send(response, exchange.status, exchange.response);
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}
