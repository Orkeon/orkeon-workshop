import type { Output } from '../../src/interface/output.js';

export class RecordingOutput implements Output {
  readonly stdout: string[] = [];
  readonly stderr: string[] = [];

  line(text: string): void {
    this.stdout.push(text);
  }

  json(value: unknown): void {
    this.stdout.push(JSON.stringify(value, null, 2));
  }

  error(text: string): void {
    this.stderr.push(text);
  }

  get text(): string {
    return this.stdout.join('\n');
  }
}
