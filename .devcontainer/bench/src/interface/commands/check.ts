import type { Command } from 'commander';

import type { CheckWorkbookOptions } from '../../application/use-cases/check-workbook.js';
import type { WorkbookCheckResult } from '../../domain/workbook/check-workbook.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerCheck(program: Command, services: Services, session: Session): void {
  const check = program.command('check').description('static checks of the workbook of a team, before a gate');
  const run = async (teamArgument: string, options: CheckWorkbookOptions, json: boolean): Promise<void> => {
    await session.run(async () => {
      const team = await services.locateTeam.execute(teamArgument);
      const result = await services.checkWorkbook.execute(team, options);
      if (json) {
        session.output.json(toJson(result));
      } else {
        toText(result).forEach((line) => session.output.line(line));
      }
      return result.status === 'pass' ? EXIT.ok : EXIT.failed;
    });
  };
  check
    .command('test-plan <team>')
    .description('gate 2: check ACCEPTANCE.md, TEST-PLAN.md and tests/<team>/bench.config.json — ids, levels, datasets, invariants, judges, budget')
    .option('--json', 'print the findings as JSON')
    .action(async (teamArgument: string, options: { json?: boolean }) => {
      await run(teamArgument, { check: 'test-plan' }, options.json === true);
    });
  check
    .command('design <team>')
    .description('gate 3: everything check test-plan checks, then DESIGN.md and PLAN.md — tools against the catalogue, tasks, mount points, deliverables, batches, sheets, anchors')
    .option('--tests', 'check the ids ↔ tests traceability as well: every test cites an id, every criterion and invariant has a test (the "tests red" gate)')
    .option('--json', 'print the findings as JSON')
    .action(async (teamArgument: string, options: { tests?: boolean; json?: boolean }) => {
      await run(teamArgument, { check: 'design', tests: options.tests === true }, options.json === true);
    });
}

function toJson(result: WorkbookCheckResult): unknown {
  return {
    team: result.team,
    check: result.check,
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
    findings: result.findings.map((finding) => ({ severity: finding.severity, code: finding.code, artefact: finding.artefact, section: finding.section, message: finding.message })),
    skipped: result.skipped.map((skipped) => ({ check: skipped.check, reason: skipped.reason })),
    ids: { acceptance: result.ids.acceptance, indicators: result.ids.indicators, invariants: result.ids.invariants, dropped: result.ids.dropped },
    tests: result.tests === null ? null : { files: result.tests.files, uncovered: result.tests.uncovered, orphans: result.tests.orphans },
  };
}

function count(number: number, noun: string): string {
  return `${String(number)} ${noun}${number === 1 ? '' : 's'}`;
}

function toText(result: WorkbookCheckResult): string[] {
  const counts = result.findings.length === 0 ? '' : ` (${count(result.errors, 'error')}, ${count(result.warnings, 'warning')})`;
  return [
    `check ${result.check}: ${result.team} — ${result.status === 'pass' ? 'PASS' : 'FAIL'}${counts}`,
    ...result.findings.map((finding) => `  ${finding.severity.padEnd(7)} ${finding.artefact}${finding.section === null ? '' : ` § ${finding.section}`} — ${finding.message}`),
    ...result.skipped.map((skipped) => `  skipped ${skipped.check} — ${skipped.reason}`),
  ];
}
