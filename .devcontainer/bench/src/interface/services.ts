import { LocateTeam } from '../application/teams/locate-team.js';
import { ScenarioRunner } from '../application/runs/run-scenario.js';
import { ApproveRemote } from '../application/use-cases/approve-remote.js';
import { CheckWorkbook } from '../application/use-cases/check-workbook.js';
import { CloseAttempt } from '../application/use-cases/close-attempt.js';
import { DeployTeam } from '../application/use-cases/deploy-team.js';
import { Doctor } from '../application/use-cases/doctor.js';
import { DumpTools } from '../application/use-cases/dump-tools.js';
import { OpenAttempt } from '../application/use-cases/open-attempt.js';
import { ReadStatus } from '../application/use-cases/read-status.js';
import { ResolveMounts } from '../application/use-cases/resolve-mounts.js';
import { ResolveProfile } from '../application/use-cases/resolve-profile.js';
import { RunTestLevels } from '../application/use-cases/run-test-levels.js';
import { ScaffoldTeam } from '../application/use-cases/scaffold-team.js';
import { ServeLlmStub } from '../application/use-cases/serve-llm-stub.js';
import { ValidateReport } from '../application/use-cases/validate-report.js';
import { machineFolders } from '../application/workshop.js';
import type { Adapters } from '../infrastructure/node-adapters.js';
import { BENCH_VERSION } from './version.js';

/** The use cases the CLI commands call. */
export interface Services {
  readonly locateTeam: LocateTeam;
  readonly readStatus: ReadStatus;
  readonly resolveMounts: ResolveMounts;
  readonly resolveProfile: ResolveProfile;
  readonly scaffoldTeam: ScaffoldTeam;
  readonly validateReport: ValidateReport;
  readonly checkWorkbook: CheckWorkbook;
  readonly doctor: Doctor;
  readonly dumpTools: DumpTools;
  readonly openAttempt: OpenAttempt;
  readonly closeAttempt: CloseAttempt;
  readonly approveRemote: ApproveRemote;
  readonly serveLlmStub: ServeLlmStub;
  readonly runTestLevels: RunTestLevels;
  readonly deployTeam: DeployTeam;
  /** Where a relative path given on the command line is resolved from. */
  readonly currentDirectory: () => string;
}

export function createServices(adapters: Adapters): Services {
  const machine = machineFolders(adapters.environment);
  const resolveProfile = new ResolveProfile(adapters.fileSystem, adapters.environment);
  const scenarios = new ScenarioRunner(adapters.fileSystem, adapters.processRunner, adapters.environment, adapters.clock, adapters.llmStub, resolveProfile);
  return {
    locateTeam: new LocateTeam(adapters.fileSystem, adapters.environment),
    readStatus: new ReadStatus(adapters.fileSystem),
    resolveMounts: new ResolveMounts(adapters.fileSystem, machine),
    resolveProfile,
    scaffoldTeam: new ScaffoldTeam(adapters.fileSystem, machine),
    validateReport: new ValidateReport(adapters.fileSystem),
    checkWorkbook: new CheckWorkbook(adapters.fileSystem, adapters.processRunner),
    doctor: new Doctor(adapters.processRunner, adapters.httpProbe, adapters.fileSystem, adapters.environment, adapters.clock),
    dumpTools: new DumpTools(adapters.processRunner, adapters.fileSystem, adapters.environment, adapters.llmRecorder),
    openAttempt: new OpenAttempt(adapters.fileSystem, adapters.processRunner, adapters.clock),
    closeAttempt: new CloseAttempt(adapters.fileSystem, adapters.clock),
    approveRemote: new ApproveRemote(adapters.fileSystem, adapters.clock),
    serveLlmStub: new ServeLlmStub(adapters.fileSystem, adapters.environment, adapters.llmStub, adapters.shutdownSignal),
    runTestLevels: new RunTestLevels(adapters.fileSystem, adapters.processRunner, adapters.clock, adapters.environment, machine, scenarios, adapters.shutdownSignal, BENCH_VERSION),
    deployTeam: new DeployTeam(adapters.fileSystem, adapters.compressor, adapters.processRunner, adapters.clock, BENCH_VERSION, machine),
    currentDirectory: () => adapters.environment.currentDirectory(),
  };
}
