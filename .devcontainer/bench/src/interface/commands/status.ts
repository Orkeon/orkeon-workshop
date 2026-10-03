import type { Command } from 'commander';

import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

const LOG_TAIL = 5;

export function registerStatus(program: Command, services: Services, session: Session): void {
  program
    .command('status <team>')
    .description('read workbooks/<team>/STATUS.md (phase, gate, track, iteration, attempt, batch, verdict, next action)')
    .option('--json', 'print the status as JSON')
    .action(async (teamArgument: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const reading = await services.readStatus.execute(team);
        if (options.json === true) {
          session.output.json({ team: team.slug, folder: team.folder, ...reading.status, log: reading.log, warnings: reading.warnings });
          return EXIT.ok;
        }
        session.output.line(`team: ${team.slug} (${team.folder})`);
        for (const [key, value] of Object.entries(reading.status)) {
          session.output.line(`${key}: ${value === null ? '-' : String(value)}`);
        }
        if (reading.log.length > 0) {
          session.output.line(`log (last ${Math.min(LOG_TAIL, reading.log.length)} of ${reading.log.length}):`);
          for (const entry of reading.log.slice(-LOG_TAIL)) {
            session.output.line(`  - ${entry}`);
          }
        }
        for (const warning of reading.warnings) {
          session.output.line(`warning: ${warning}`);
        }
        return EXIT.ok;
      });
    });
}
