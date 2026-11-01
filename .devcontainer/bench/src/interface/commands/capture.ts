import type { Command } from 'commander';

import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerCapture(program: Command, services: Services, session: Session): void {
  program
    .command('capture <team>')
    .description("write capture.md in the open attempt for the reviewer: the status, the diff of crew/ against the previous attempt's design snapshot, REPORT.md, the errors and failed tasks of the runs it cites and the edges of their stderr")
    .option('--json', 'print what was written as JSON')
    .action(async (teamArgument: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const capture = await services.captureAttempt.execute(team);
        if (options.json === true) {
          session.output.json({ team: team.slug, attempt: capture.attempt, file: capture.file, compared_with: capture.comparedWith, diff_lines: capture.diffLines, diff_truncated: capture.diffTruncated, runs: capture.runs });
        } else {
          session.output.line(`${team.slug}: capture written to ${capture.file}${capture.diffTruncated ? ` (crew diff truncated at its first lines of ${String(capture.diffLines)})` : ''}`);
        }
        return EXIT.ok;
      });
    });
}
