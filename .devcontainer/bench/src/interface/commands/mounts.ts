import type { Command } from 'commander';

import { DEFAULT_ENVIRONMENT, type MountResolution } from '../../domain/mounts/mount-set.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerMounts(program: Command, services: Services, session: Session): void {
  program
    .command('mounts <team>')
    .description('print the orkeon run mount arguments derived from mounts.json (one --mount flag, then --allow-external-mounts when needed)')
    .option('--env <name>', "mount set to bind: default (the team's own folders) or <name> (mounts.<name>/<team>/ next to teams/)", DEFAULT_ENVIRONMENT)
    .option('--json', 'print the bindings, the arguments and the Studio card mounts as JSON')
    .action(async (teamArgument: string, options: { env: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const resolution = await services.resolveMounts.execute(team, options.env);
        if (options.json === true) {
          session.output.json(toJson(team, resolution));
        } else {
          session.output.line(resolution.arguments.map(shellQuote).join(' '));
          for (const warning of resolution.warnings) {
            session.output.error(`warning: ${warning}`);
          }
        }
        return EXIT.ok;
      });
    });
}

function toJson(team: TeamRef, resolution: MountResolution): unknown {
  return {
    team: team.slug,
    folder: team.folder,
    environment: resolution.environment,
    set_folder: resolution.setFolder,
    allow_external: resolution.allowExternal,
    arguments: resolution.arguments,
    studio_mounts: resolution.studioMounts,
    warnings: resolution.warnings,
    bindings: resolution.bindings.map((binding) => ({
      root: binding.root,
      access: binding.access,
      role: binding.role,
      declared_path: binding.declaredPath,
      physical_path: binding.physicalPath,
      relative_path: binding.relativePath,
      external: binding.external,
    })),
  };
}

/** Quotes an argument only when a POSIX shell would split or expand it. */
function shellQuote(argument: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", String.raw`'\''`)}'`;
}
