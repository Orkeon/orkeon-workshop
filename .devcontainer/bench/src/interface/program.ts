import { Command } from 'commander';

import { registerAttempt } from './commands/attempt.js';
import { registerCapture } from './commands/capture.js';
import { registerCheck } from './commands/check.js';
import { registerDeploy } from './commands/deploy.js';
import { registerDoctor } from './commands/doctor.js';
import { registerEstimate } from './commands/estimate.js';
import { registerEvaluate } from './commands/evaluate.js';
import { registerLlmStub } from './commands/llm-stub.js';
import { registerMounts } from './commands/mounts.js';
import { registerProfile } from './commands/profile.js';
import { registerRelease } from './commands/release.js';
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
    .description('Bench CLI of the Orkeon harness: checks the machine, reads and scaffolds Orkeon agent teams, checks their test plan and their design before a gate, opens their attempts, runs their tests, folds the grades of the judges into the report, prices a remote run, captures an attempt for review, releases an accepted team and packs it into a deployment archive.')
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
  registerCheck(program, services, session);
  registerProfile(program, services, session);
  registerTools(program, services, session);
  registerAttempt(program, services, session);
  registerLlmStub(program, services, session);
  registerRun(program, services, session);
  registerEvaluate(program, services, session);
  registerEstimate(program, services, session);
  registerCapture(program, services, session);
  registerRelease(program, services, session);
  registerDeploy(program, services, session);
  return program;
}
