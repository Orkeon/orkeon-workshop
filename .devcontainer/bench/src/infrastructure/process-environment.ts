import { homedir } from 'node:os';

import type { Environment } from '../application/ports/environment.js';

export class ProcessEnvironment implements Environment {
  /** Own variables only: `process.env.constructor` would otherwise answer with a function. */
  get(name: string): string | undefined {
    return Object.hasOwn(process.env, name) ? process.env[name] : undefined;
  }

  variables(): Readonly<Record<string, string>> {
    return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  }

  homeDirectory(): string {
    return homedir();
  }

  currentDirectory(): string {
    return process.cwd();
  }
}
