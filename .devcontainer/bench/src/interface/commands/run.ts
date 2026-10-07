import type { Command } from 'commander';

import type { RunResult } from '../../application/use-cases/run-test-levels.js';
import { DomainError } from '../../domain/errors.js';
import { LEVEL_LABELS, parseLevel } from '../../domain/run.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerRun(program: Command, services: Services, session: Session): void {
  program
    .command('run <team>')
    .description('run the test levels of a team in order, up to --level, and write report.json and REPORT.md into its open attempt, in place of the report of an earlier run (this version: L0 static and L2 component with the simulated LLM)')
    .option('--level <level>', 'the highest level to reach: L0…L4, or static, unit, component, e2e_local, e2e_remote', collect)
    .option('--profile <name>', 'the LLM profile of the run (this version: stub, the default up to L2)', collect)
    .option('--continue', 'go on to the next level after a red one')
    .option('--json', 'print the result as JSON')
    .action(async (teamArgument: string, options: { level?: string[]; profile?: string[]; continue?: boolean; json?: boolean }) => {
      await session.run(async () => {
        const level = once('--level', options.level ?? []);
        const profile = once('--profile', options.profile ?? []);
        const team = await services.locateTeam.execute(teamArgument);
        const result = await services.runTestLevels.execute(team, {
          maxLevel: level === null ? null : parseLevel(level),
          profile,
          continueAfterRed: options.continue === true,
        });
        if (options.json === true) {
          session.output.json(toJson(team, result));
        } else {
          toText(team, result).forEach((line) => session.output.line(line));
          for (const warning of result.warnings) {
            session.output.error(`warning: ${warning}`);
          }
        }
        return result.failed ? EXIT.failed : EXIT.ok;
      });
    });
}

/** Keeps every value of an option given several times, for `once` to refuse. */
function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/**
 * The value of an option that is given once at most. Twice, the run gate — which reads the command
 * before it runs — and the bench could each keep a different one: refused.
 */
function once(flag: string, values: readonly string[]): string | null {
  if (values.length > 1) {
    throw new DomainError(`${flag} is given ${String(values.length)} times (${values.join(', ')}): pass it once`);
  }
  return values[0] ?? null;
}

function toJson(team: TeamRef, result: RunResult): unknown {
  return {
    team: team.slug,
    attempt: result.attempt,
    failed: result.failed,
    levels: result.levels,
    runs: result.runs,
    report_file: result.reportFile,
    report_markdown_file: result.reportMarkdownFile,
    verdict_input: result.report.verdict_input,
    warnings: result.warnings,
  };
}

function toText(team: TeamRef, result: RunResult): string[] {
  const lines = [`${team.slug}: ${result.attempt}`];
  for (const entry of result.levels) {
    lines.push(`${LEVEL_LABELS[entry.level]} ${entry.level}: ${entry.status}${entry.note.length > 0 ? ` (${entry.note})` : ''}`);
  }
  const { all_ac_pass: ac, all_inv_pass: inv, indicators_in_range: ind } = result.report.verdict_input;
  lines.push(`verdict input: all_ac_pass=${String(ac)} all_inv_pass=${String(inv)} indicators_in_range=${String(ind)}`);
  lines.push(`report: ${result.reportFile}`);
  if (result.runs.length > 0) {
    lines.push(`runs: ${result.runs.join(', ')}`);
  }
  return lines;
}
