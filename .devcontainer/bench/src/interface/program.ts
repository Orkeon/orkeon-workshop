import { Command } from 'commander';

import { registerAttempt } from './commands/attempt.js';
import { registerDoctor } from './commands/doctor.js';
import { registerLlmStub } from './commands/llm-stub.js';
import { registerMounts } from './commands/mounts.js';
import { registerNotImplemented } from './commands/not-implemented.js';
import { registerProfile } from './commands/profile.js';
import { registerReport } from './commands/report.js';
import { registerRun } from './commands/run.js';
import { registerScaffold } from './commands/scaffold.js';
import { registerStatus } from './commands/status.js';
import { registerTools } from './commands/tools.js';
import type { Services } from './services.js';
import type { Session } from './session.js';
import { BENCH_VERSION } from './version.js';

/** Builds the commander program: arguments in, use cases called, text or JSON out. */
export function createProgram(services: Services, session: Session): Command {
  const program = new Command();
  program
    .name('orkeon-bench')
    .description('Bench CLI of the Orkeon harness: checks the machine, reads and scaffolds Orkeon agent teams, opens their attempts and runs their static and component tests with a simulated LLM.')
    .version(BENCH_VERSION, '-V, --version', 'print the bench version')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => session.output.line(text.replace(/\n$/, '')),
      writeErr: (text) => session.output.error(text.replace(/\n$/, '')),
    });

  registerDoctor(program, services, session);
  registerStatus(program, services, session);
  registerMounts(program, services, session);
  registerScaffold(program, services, session);
  registerReport(program, services, session);
  registerProfile(program, services, session);
  registerTools(program, services, session);
  registerAttempt(program, services, session);
  registerLlmStub(program, services, session);
  registerRun(program, services, session);
  registerNotImplemented(program, session);
  return program;
}
