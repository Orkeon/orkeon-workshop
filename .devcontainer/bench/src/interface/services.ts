import { LocateTeam } from '../application/teams/locate-team.js';
import { Doctor } from '../application/use-cases/doctor.js';
import { DumpTools } from '../application/use-cases/dump-tools.js';
import { ReadStatus } from '../application/use-cases/read-status.js';
import { ResolveMounts } from '../application/use-cases/resolve-mounts.js';
import { ResolveProfile } from '../application/use-cases/resolve-profile.js';
import { ScaffoldTeam } from '../application/use-cases/scaffold-team.js';
import { ValidateReport } from '../application/use-cases/validate-report.js';
import { machineFolders } from '../application/workshop.js';
import type { Adapters } from '../infrastructure/node-adapters.js';

/** The use cases the CLI commands call. */
export interface Services {
  readonly locateTeam: LocateTeam;
  readonly readStatus: ReadStatus;
  readonly resolveMounts: ResolveMounts;
  readonly resolveProfile: ResolveProfile;
  readonly scaffoldTeam: ScaffoldTeam;
  readonly validateReport: ValidateReport;
  readonly doctor: Doctor;
  readonly dumpTools: DumpTools;
}

export function createServices(adapters: Adapters): Services {
  const machine = machineFolders(adapters.environment);
  return {
    locateTeam: new LocateTeam(adapters.fileSystem, adapters.environment),
    readStatus: new ReadStatus(adapters.fileSystem),
    resolveMounts: new ResolveMounts(adapters.fileSystem, machine),
    resolveProfile: new ResolveProfile(adapters.fileSystem, adapters.environment),
    scaffoldTeam: new ScaffoldTeam(adapters.fileSystem, machine),
    validateReport: new ValidateReport(adapters.fileSystem),
    doctor: new Doctor(adapters.processRunner, adapters.httpProbe, adapters.fileSystem, adapters.environment, adapters.clock),
    dumpTools: new DumpTools(adapters.processRunner, adapters.fileSystem, adapters.environment, adapters.llmRecorder),
  };
}
