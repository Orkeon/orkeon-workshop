import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { LlmRecorder, LlmRecording } from '../application/ports/llm-recorder.js';
import { STUB_HOST, STUB_MODEL, stubBaseUrl } from '../domain/profile.js';

/** Largest request body kept: a request with every tool schema is about 60 kB. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/**
 * An OpenAI-compatible server on `127.0.0.1` and a port the system picks: it records the JSON body
 * of every `POST`, answers each with the final message `OK`, and lists `stub-model` on `GET`.
 */
export class NodeLlmRecorder implements LlmRecorder {
  start(): Promise<LlmRecording> {
    const requests: unknown[] = [];
    const server = createServer((request, response) => {
      void handle(request, response, requests);
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, STUB_HOST, () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          baseUrl: stubBaseUrl(port),
          requests: () => [...requests],
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

async function handle(request: IncomingMessage, response: ServerResponse, requests: unknown[]): Promise<void> {
  if (request.method !== 'POST') {
    send(response, { object: 'list', data: [{ id: STUB_MODEL, object: 'model' }] });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size <= MAX_BODY_BYTES) {
      chunks.push(buffer);
    }
  }
  try {
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    requests.push(null);
  }
  send(response, {
    id: 'chatcmpl-recorder',
    object: 'chat.completion',
    created: 0,
    model: STUB_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

function send(response: ServerResponse, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}
