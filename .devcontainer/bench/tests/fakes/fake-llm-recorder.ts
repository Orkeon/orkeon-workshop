import type { LlmRecorder, LlmRecording } from '../../src/application/ports/llm-recorder.js';

/** Hands out one recording whose requests are given in advance; tells whether it was stopped. */
export class FakeLlmRecorder implements LlmRecorder {
  started = 0;
  stopped = 0;

  constructor(
    private readonly recorded: readonly unknown[],
    readonly baseUrl = 'http://127.0.0.1:43210/v1',
  ) {}

  async start(): Promise<LlmRecording> {
    this.started += 1;
    return {
      baseUrl: this.baseUrl,
      requests: () => this.recorded,
      stop: async () => {
        this.stopped += 1;
      },
    };
  }
}
