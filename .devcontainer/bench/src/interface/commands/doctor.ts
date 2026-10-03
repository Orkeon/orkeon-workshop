import { Option, type Command } from 'commander';

import type { DoctorReport } from '../../application/use-cases/doctor.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';
import { BENCH_VERSION } from '../version.js';

export function registerDoctor(program: Command, services: Services, session: Session): void {
  program
    .command('doctor')
    .description('check orkeon and its tool catalogue, esbuild, PyYAML, Ollama, the local model concurrency, the typings, the workshop layout and stray settings files')
    .option('--json', 'print the report as JSON')
    .addOption(new Option('-q, --quiet', 'exit code only: one line per failing check on stderr, nothing otherwise').conflicts('json'))
    .action(async (options: { json?: boolean; quiet?: boolean }) => {
      await session.run(async () => {
        const report = await services.doctor.execute();
        if (options.quiet === true) {
          toFailures(report).forEach((line) => session.output.error(line));
        } else if (options.json === true) {
          session.output.json(toJson(report));
        } else {
          toText(report).forEach((line) => session.output.line(line));
        }
        return report.ok ? EXIT.ok : EXIT.failed;
      });
    });
}

function toJson(report: DoctorReport): unknown {
  return {
    bench_version: BENCH_VERSION,
    reference_orkeon_version: report.referenceOrkeonVersion,
    checked_at: report.checkedAt,
    ok: report.ok,
    checks: report.checks.map((check) => ({ id: check.id, label: check.label, status: check.status, detail: check.detail })),
  };
}

function toText(report: DoctorReport): string[] {
  const failing = report.checks.filter((check) => check.status === 'fail').length;
  return [
    `orkeon-bench ${BENCH_VERSION} — references established on Orkeon ${report.referenceOrkeonVersion}`,
    ...report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)}  ${check.label.padEnd(30)}  ${check.detail}`),
    report.ok ? 'Result: OK' : `Result: FAILED (${failing} failing)`,
  ];
}

/** Quiet mode (SessionStart hook): the failing checks only; a warning is not worth a line. */
function toFailures(report: DoctorReport): string[] {
  return report.checks.filter((check) => check.status === 'fail').map((check) => `FAIL ${check.id}: ${check.detail}`);
}
