import { parseStatus, statusWarnings, type StatusDocument } from '../../domain/status.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { logLines, parseFrontMatter } from '../status/front-matter.js';

export interface StatusReading extends StatusDocument {
  /** Inconsistencies of a readable status (gate ahead of phase, accepted without verdict...). */
  readonly warnings: readonly string[];
}

/** Reads `workbooks/<slug>/STATUS.md`: the front matter as a Status, the bullets as the log. */
export class ReadStatus {
  constructor(private readonly fileSystem: FileSystem) {}

  async execute(team: TeamRef): Promise<StatusReading> {
    const path = teamPaths(team).statusFile;
    if (!(await this.fileSystem.exists(path))) {
      throw new ApplicationError('file-not-found', `STATUS.md not found: ${path}`);
    }
    const document = parseFrontMatter(await this.fileSystem.readText(path));
    const status = parseStatus(document.data);
    return { status, log: logLines(document.body), warnings: statusWarnings(status) };
  }
}
