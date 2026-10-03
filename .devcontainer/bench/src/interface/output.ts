/** Where commands write; swapped for a recorder in tests. */
export interface Output {
  line(text: string): void;
  json(value: unknown): void;
  error(text: string): void;
}

export class ConsoleOutput implements Output {
  line(text: string): void {
    process.stdout.write(`${text}\n`);
  }

  json(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${text}\n`);
  }
}
