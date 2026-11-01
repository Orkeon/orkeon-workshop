import { LocateTeam } from '../application/teams/locate-team.js';
import { ScenarioRunner } from '../application/runs/run-scenario.js';
import { ApproveRemote } from '../application/use-cases/approve-remote.js';
import { CaptureAttempt } from '../application/use-cases/capture-attempt.js';
import { CheckTeam } from '../application/use-cases/check-team.js';
import { CloseAttempt } from '../application/use-cases/close-attempt.js';
import { DeployTeam } from '../application/use-cases/deploy-team.js';
import { Doctor } from '../application/use-cases/doctor.js';
import { DumpTools } from '../application/use-cases/dump-tools.js';
import { EstimateRemote } from '../application/use-cases/estimate-remote.js';
import { EvaluateJudgements } from '../application/use-cases/evaluate-judgements.js';
import { OpenAttempt } from '../application/use-cases/open-attempt.js';
import { ReadStatus } from '../application/use-cases/read-status.js';
import { ReleaseTeam } from '../application/use-cases/release-team.js';
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
  readonly checkTeam: CheckTeam;
  readonly doctor: Doctor;
  readonly dumpTools: DumpTools;
  readonly openAttempt: OpenAttempt;
  readonly closeAttempt: CloseAttempt;
  readonly approveRemote: ApproveRemote;
  readonly serveLlmStub: ServeLlmStub;
  readonly runTestLevels: RunTestLevels;
  readonly deployTeam: DeployTeam;
  readonly evaluateJudgements: EvaluateJudgements;
  readonly estimateRemote: EstimateRemote;
  readonly captureAttempt: CaptureAttempt;
  readonly releaseTeam: ReleaseTeam;
  /** Where a relative path given on the command line is resolved from. */
  readonly currentDirectory: () => string;
}

export function createServices(adapters: Adapters): Services {
  const machine = machineFolders(adapters.environment);
  const resolveProfile = new ResolveProfile(adapters.fileSystem, adapters.environment);
  const scaffoldTeam = new ScaffoldTeam(adapters.fileSystem, machine);
  const scenarios = new ScenarioRunner(adapters.fileSystem, adapters.processRunner, adapters.environment, adapters.clock, adapters.llmStub, resolveProfile, adapters.schemaValidator);
  return {
    locateTeam: new LocateTeam(adapters.fileSystem, adapters.environment),
    readStatus: new ReadStatus(adapters.fileSystem),
    resolveMounts: new ResolveMounts(adapters.fileSystem, machine),
    resolveProfile,
    scaffoldTeam,
    validateReport: new ValidateReport(adapters.fileSystem),
    checkTeam: new CheckTeam(adapters.fileSystem, adapters.processRunner),
    doctor: new Doctor(adapters.processRunner, adapters.httpProbe, adapters.fileSystem, adapters.environment, adapters.clock),
    dumpTools: new DumpTools(adapters.processRunner, adapters.fileSystem, adapters.environment, adapters.llmRecorder),
    openAttempt: new OpenAttempt(adapters.fileSystem, adapters.processRunner, adapters.clock),
    closeAttempt: new CloseAttempt(adapters.fileSystem, adapters.clock),
    approveRemote: new ApproveRemote(adapters.fileSystem, adapters.clock),
    serveLlmStub: new ServeLlmStub(adapters.fileSystem, adapters.environment, adapters.llmStub, adapters.shutdownSignal),
    runTestLevels: new RunTestLevels(adapters.fileSystem, adapters.processRunner, adapters.clock, adapters.environment, machine, scenarios, adapters.shutdownSignal, BENCH_VERSION),
    deployTeam: new DeployTeam(adapters.fileSystem, adapters.compressor, adapters.processRunner, adapters.clock, BENCH_VERSION, machine),
    evaluateJudgements: new EvaluateJudgements(adapters.fileSystem),
    estimateRemote: new EstimateRemote(adapters.fileSystem, resolveProfile),
    captureAttempt: new CaptureAttempt(adapters.fileSystem, adapters.processRunner),
    releaseTeam: new ReleaseTeam(adapters.fileSystem, scaffoldTeam),
    currentDirectory: () => adapters.environment.currentDirectory(),
  };
}
