import type { Environment } from '../../src/application/ports/environment.js';

export class FakeEnvironment implements Environment {
  constructor(
    private readonly values: Record<string, string> = {},
    private readonly home = '/home/tester',
    private readonly cwd = '/home/tester/work',
  ) {}

  get(name: string): string | undefined {
    return this.values[name];
  }

  variables(): Readonly<Record<string, string>> {
    return { ...this.values };
  }

  homeDirectory(): string {
    return this.home;
  }

  currentDirectory(): string {
    return this.cwd;
  }
}
