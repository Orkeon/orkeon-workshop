import type { Command } from 'commander';

import type { ReportValidation } from '../../application/use-cases/validate-report.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerReport(program: Command, services: Services, session: Session): void {
  const report = program.command('report').description('work with attempt reports (report.json)');
  report
    .command('validate <file>')
    .description('check a report.json against schema 1.0 and the verdict rule')
    .option('--json', 'print the validation as JSON')
    .action(async (file: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const validation = await services.validateReport.execute(file);
        if (options.json === true) {
          session.output.json(toJson(validation));
        } else {
          toText(validation).forEach((line) => session.output.line(line));
        }
        return validation.valid ? EXIT.ok : EXIT.failed;
      });
    });
}

function toJson(validation: ReportValidation): unknown {
  return {
    path: validation.path,
    valid: validation.valid,
    issues: validation.issues,
    verdict_input: validation.verdictInput,
    accepted: validation.accepted,
  };
}

function toText(validation: ReportValidation): string[] {
  if (!validation.valid) {
    return [`invalid: ${validation.path}`, ...validation.issues.map((issue) => `  - ${issue}`)];
  }
  const input = validation.verdictInput;
  const summary =
    input === null
      ? ''
      : ` (all_ac_pass=${String(input.all_ac_pass)} all_inv_pass=${String(input.all_inv_pass)} indicators_in_range=${String(input.indicators_in_range)})`;
  return [`valid: ${validation.path}${summary} → ${validation.accepted ? 'ACCEPTED' : 'not accepted'}`];
}
