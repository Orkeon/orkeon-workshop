import type { Command } from 'commander';

import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerScaffold(program: Command, services: Services, session: Session): void {
  program
    .command('scaffold <team>')
    .description("write the team's launchers (run.sh, run.cmd), the mounts of its Studio card, the folders of its mount points and its .gitignore, from mounts.json")
    .option('--json', 'print what was written as JSON')
    .action(async (teamArgument: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const result = await services.scaffoldTeam.execute(team);
        if (options.json === true) {
          session.output.json({
            team: team.slug,
            folder: team.folder,
            kind: result.kind,
            target: result.target,
            written: result.written,
            created: result.created,
            placeholders: result.placeholders,
            studio_mounts: result.studioMounts,
            warnings: result.warnings,
          });
        } else {
          session.output.line(`${team.slug}: ${result.kind} crew, launchers start ${result.target}`);
          session.output.line(`wrote ${result.written.join(', ')}`);
          session.output.line(`mounts: ${result.studioMounts.join(' ')}`);
          if (result.created.length > 0) {
            session.output.line(`created ${result.created.map((folder) => `${folder}/`).join(' ')}`);
          }
          for (const warning of result.warnings) {
            session.output.error(`warning: ${warning}`);
          }
        }
        return EXIT.ok;
      });
    });
}
