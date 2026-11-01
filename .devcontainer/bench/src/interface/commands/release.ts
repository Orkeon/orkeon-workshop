import type { Command } from 'commander';

import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerRelease(program: Command, services: Services, session: Session): void {
  program
    .command('release <team>')
    .description('make a team whose last attempt was ACCEPTED ready to tag: launchers written again, runs past retention.runs_keep moved to archive/runs/<team>/, the git tag command printed')
    .option('--json', 'print the release as JSON')
    .action(async (teamArgument: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const outcome = await services.releaseTeam.execute(team);
        if (outcome.status === 'unreadable-reports') {
          for (const report of outcome.reports) {
            session.output.error(`error: ${report.file} cannot be read: ${report.reason}`);
          }
          session.output.error(`error: ${team.slug} is not released: the runs an unreadable report cites cannot be kept apart — repair or remove the report (orkeon-bench report validate <file>), then release again`);
          return EXIT.failed;
        }
        const release = outcome;
        const tagCommand = `git tag ${release.tag} && git push origin ${release.tag}`;
        if (options.json === true) {
          session.output.json({ team: team.slug, version: release.version, attempt: release.attempt, tag: release.tag, tag_command: tagCommand, runs_kept: release.runsKept, runs_archived: release.runsArchived, archive: release.archive });
        } else {
          session.output.line(`${team.slug}: release v${String(release.version)} ready`);
          session.output.line(`runs kept: ${release.runsKept.length === 0 ? 'none' : release.runsKept.join(', ')}`);
          session.output.line(`runs archived: ${String(release.runsArchived.length)}${release.runsArchived.length === 0 ? '' : ` → archive/runs/${team.slug}/`}`);
          session.output.line(`tag: ${tagCommand}`);
        }
        return EXIT.ok;
      });
    });
}
