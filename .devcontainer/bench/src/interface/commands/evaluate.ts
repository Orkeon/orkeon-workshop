import type { Command } from 'commander';

import { resolvePath } from '../../domain/paths.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerEvaluate(program: Command, services: Services, session: Session): void {
  program
    .command('evaluate <team>')
    .description("fold the judge agent's grades into the report of the open attempt: judges scored against their TEAM.md thresholds, verdict input computed again (exit 1 when a judge scores under its threshold)")
    .requiredOption('--judgements <file>', 'the grades of the judge agent, {"judgements": [{judge, rubric_version, output, score, justification, quotes}]}')
    .option('--json', "print each judge's score, threshold and status, and the verdict input, as JSON")
    .action(async (teamArgument: string, options: { judgements: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const result = await services.evaluateJudgements.execute(team, resolvePath(services.currentDirectory(), options.judgements));
        if (options.json === true) {
          session.output.json({
            team: team.slug,
            attempt: result.attempt,
            judges: result.judges.map((judge) => ({ id: judge.id, score: judge.score, threshold: judge.threshold, direction: judge.direction, status: judge.status, grades: judge.grades, rubric_version: judge.rubric_version, judge_model: judge.judge_model })),
            verdict_input: result.verdictInput,
            report: result.reportFile,
            judgements: result.judgementsFile,
          });
        } else {
          session.output.line(`${team.slug}: ${result.attempt}`);
          session.output.line(`judges: ${result.judges.map((judge) => `${judge.id}=${String(judge.score)} (${judge.direction} ${String(judge.threshold)}) ${judge.status}`).join(', ')}`);
          session.output.line(`report: ${result.reportFile}`);
        }
        return result.failed ? EXIT.failed : EXIT.ok;
      });
    });
}
