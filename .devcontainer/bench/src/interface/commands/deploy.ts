import type { Command } from 'commander';

import type { DeployResult } from '../../application/use-cases/deploy-team.js';
import { ARCHIVE_FORMATS, isArchiveFormat } from '../../domain/deployment/deployment-plan.js';
import { resolvePath } from '../../domain/paths.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

interface DeployCommandOptions {
  withSettings?: boolean;
  withoutSettings?: boolean;
  into?: string;
  format?: string;
  json?: boolean;
}

export function registerDeploy(program: Command, services: Services, session: Session): void {
  program
    .command('deploy <team>')
    .description('write <slug>-<yyyymmdd>.zip (or .tar.gz) under deployments/: the team folder as Orkeon Studio runs it (the data of its mount points left out) and, on request, its settings file, laid out to unpack at the root of a workshop')
    .option('--with-settings', 'put settings/<slug>/appsettings.json in the archive (refused when it holds a secret)')
    .option('--without-settings', 'leave the settings file out')
    .option('--into <folder>', 'write the archive in this folder instead of <workshop>/deployments/')
    .option('--format <format>', `${ARCHIVE_FORMATS.join(' or ')}: a zip (file modes kept by unzip and most tools), or a gzipped tar (file modes kept by every Unix unpacker)`, 'zip')
    .option('--json', 'print what was written as JSON')
    .action(async (teamArgument: string, options: DeployCommandOptions) => {
      await session.run(async () => {
        if (options.withSettings === true && options.withoutSettings === true) {
          session.output.error('error: --with-settings and --without-settings exclude each other');
          return EXIT.error;
        }
        const format = options.format ?? 'zip';
        if (!isArchiveFormat(format)) {
          session.output.error(`error: --format takes ${ARCHIVE_FORMATS.join(' or ')}, not "${format}"`);
          return EXIT.error;
        }
        const team = await services.locateTeam.execute(teamArgument);
        const result = await services.deployTeam.execute(team, {
          settings: options.withSettings === true ? 'include' : options.withoutSettings === true ? 'leave-out' : null,
          format,
          ...(options.into === undefined ? {} : { into: resolvePath(services.currentDirectory(), options.into) }),
        });
        if (options.json === true) {
          session.output.json(toJson(result));
        } else {
          toText(result).forEach((line) => session.output.line(line));
          for (const warning of result.warnings) {
            session.output.error(`warning: ${warning}`);
          }
        }
        return EXIT.ok;
      });
    });
}

function toJson(result: DeployResult): unknown {
  return {
    team: result.team,
    archive: result.archive,
    format: result.format,
    date: result.date,
    files: result.files,
    bytes: result.bytes,
    settings: result.settings,
    left_out: { mount_data: result.leftOut.mountData, build_output: result.leftOut.buildOutput, links: result.leftOut.links },
    warnings: result.warnings,
    orkeon_version: result.orkeonVersion,
    bench_version: result.benchVersion,
  };
}

function toText(result: DeployResult): string[] {
  const settings: Record<DeployResult['settings'], string> = {
    included: `settings: included (settings/${result.team}/appsettings.json)`,
    'left-out': 'settings: left out',
    none: 'settings: none (the team has no settings file of its own)',
  };
  const data = Object.entries(result.leftOut.mountData).filter(([, count]) => count > 0);
  const lines = [`${result.team}: ${result.archive} (${String(result.files.length)} files, ${size(result.bytes)})`, settings[result.settings]];
  if (data.length > 0) {
    lines.push(`left out: the data of ${data.map(([folder, count]) => `${folder}/ (${String(count)})`).join(', ')}`);
  }
  if (result.leftOut.buildOutput.length > 0) {
    lines.push(`left out: ${String(result.leftOut.buildOutput.length)} dependency or build files`);
  }
  if (result.leftOut.links.length > 0) {
    lines.push(`left out: symbolic links ${result.leftOut.links.join(', ')}`);
  }
  lines.push(`${result.format === 'zip' ? 'unzip' : 'unpack'} it at the root of a workshop (~/Orkeon): teams/${result.team}/ lands in Studio's catalogue, and its launchers find the settings beside it`);
  return lines;
}

function size(bytes: number): string {
  return bytes < 1024 ? `${String(bytes)} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
