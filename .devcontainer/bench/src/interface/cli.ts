import { CommanderError } from 'commander';

import { createNodeAdapters } from '../infrastructure/node-adapters.js';
import { EXIT } from './exit-codes.js';
import { ConsoleOutput } from './output.js';
import { createProgram } from './program.js';
import { createServices } from './services.js';
import { Session } from './session.js';

/** `--help` and `--version` end the parse early with these codes; anything else is a usage error. */
const INFORMATIONAL = new Set(['commander.helpDisplayed', 'commander.version']);

/** Composition root: Node adapters → use cases → commander; returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const session = new Session(new ConsoleOutput());
  const program = createProgram(createServices(createNodeAdapters()), session);
  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      return INFORMATIONAL.has(error.code) ? EXIT.ok : EXIT.error;
    }
    session.output.error(`unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    return EXIT.error;
  }
  return session.exitCode;
}

/**
 * `orkeon-bench doctor | head -1`: the reader closing the pipe early is not a failure. Without
 * this, Node raises an unhandled EPIPE and prints a stack trace.
 */
function stopQuietlyWhenThePipeCloses(stream: NodeJS.WriteStream): void {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      process.exit(EXIT.ok);
    }
    throw error;
  });
}

stopQuietlyWhenThePipeCloses(process.stdout);
stopQuietlyWhenThePipeCloses(process.stderr);
process.exitCode = await main(process.argv.slice(2));
