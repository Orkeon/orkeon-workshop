import type { Command } from 'commander';

import type { RunResult } from '../../application/use-cases/run-test-levels.js';
import { formatUsd } from '../../domain/bench-config.js';
import { DomainError } from '../../domain/errors.js';
import { LEVEL_LABELS, parseLevel } from '../../domain/run.js';
import { passCountsLine } from '../../domain/run-report.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerRun(program: Command, services: Services, session: Session): void {
  program
    .command('run <team>')
    .description('run the test levels of a team in order, up to --level, and write report.json and REPORT.md into its open attempt, in place of the report of an earlier run')
    .option('--level <level>', 'the highest level to reach: L0…L4, or static, unit, component, e2e_local, e2e_remote (default: the highest level bench.config.json configures, else L2)', collect)
    .option('--profile <name>', 'the LLM profile of the level --level names, when it is L3 or L4 (default: levels.<level>.profile of bench.config.json, the machine at L3)', collect)
    .option('--continue', 'go on to the next level after a red one')
    .option('--no-decision', 'pass --no-decision to every orkeon run: no call reaches the decision model (Orkeon 1.4.0) — decision tasks answer from their fallback, system_one_decide is withheld, a required crew is refused (exit 69); the gate still counts a configured decision model')
    .option('--json', 'print the result as JSON')
    .action(async (teamArgument: string, options: { level?: string[]; profile?: string[]; continue?: boolean; decision?: boolean; json?: boolean }) => {
      await session.run(async () => {
        const level = once('--level', options.level ?? []);
        const profile = once('--profile', options.profile ?? []);
        const team = await services.locateTeam.execute(teamArgument);
        const result = await services.runTestLevels.execute(team, {
          maxLevel: level === null ? null : parseLevel(level),
          profile,
          continueAfterRed: options.continue === true,
          noDecision: options.decision === false,
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
    ...(result.remote === null ? {} : { e2e_remote: { usd: result.remote.usd, cap_usd: result.remote.capUsd } }),
    warnings: result.warnings,
  };
}

function toText(team: TeamRef, result: RunResult): string[] {
  const lines = [`${team.slug}: ${result.attempt}`];
  for (const entry of result.levels) {
    const detail = entry.note.length > 0 ? entry.note : entry.level === 'e2e_local' ? passCountsLine(result.report.levels.e2e_local) : '';
    lines.push(`${LEVEL_LABELS[entry.level]} ${entry.level}: ${entry.status}${detail.length > 0 ? ` (${detail})` : ''}`);
  }
  const { all_ac_pass: ac, all_inv_pass: inv, indicators_in_range: ind } = result.report.verdict_input;
  lines.push(`verdict input: all_ac_pass=${String(ac)} all_inv_pass=${String(inv)} indicators_in_range=${String(ind)}`);
  lines.push(`report: ${result.reportFile}`);
  if (result.runs.length > 0) {
    lines.push(`runs: ${result.runs.join(', ')}`);
  }
  if (result.remote !== null) {
    lines.push(`cost: ${formatUsd(result.remote.usd)} USD (cap ${formatUsd(result.remote.capUsd)})`);
  }
  return lines;
}
