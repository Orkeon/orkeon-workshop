import type { Command } from 'commander';

import type { StoredAttempt } from '../../application/attempts/attempt-store.js';
import { DEFAULT_OPENED_BY } from '../../domain/attempt.js';
import { DomainError } from '../../domain/errors.js';
import { VERDICTS, type Verdict } from '../../domain/status.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerAttempt(program: Command, services: Services, session: Session): void {
  const attempt = program.command('attempt').description('open or close an attempt of a team, and record the approval of a remote run in it');
  attempt
    .command('open <team>')
    .description('open the next attempt: workbooks/<team>/attempts/ATT-nnnn/ with its manifest and a snapshot of the design')
    .option('--by <skill>', 'who opens the attempt, in one short line: the skill (team-build, team-decision)', DEFAULT_OPENED_BY)
    .option('--json', 'print the attempt as JSON')
    .action(async (teamArgument: string, options: { by: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const opened = await services.openAttempt.execute(team, options.by);
        print(session, options.json === true, team, opened, `${team.slug}: opened ${opened.id} (${opened.folder})${opened.manifest.design_snapshot === null ? ' — no crew yet: the design snapshot comes with the first run' : ''}`);
        return EXIT.ok;
      });
    });
  attempt
    .command('close <team>')
    .description('close the open attempt, with the verdict of its review when given (ACCEPTED needs a report that accepts); a closed attempt is immutable')
    .option('--verdict <verdict>', `the verdict of the review: ${VERDICTS.join(', ')}`)
    .option('--json', 'print the attempt as JSON')
    .action(async (teamArgument: string, options: { verdict?: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const closed = await services.closeAttempt.execute(team, options.verdict === undefined ? null : parseVerdict(options.verdict));
        const abandoned = closed.kept === null ? ' as abandoned: it had no manifest (an interrupted attempt open, or a folder made by hand)' : ` as abandoned: its manifest could not be read, and is kept as ${closed.kept}`;
        const how = closed.abandoned ? abandoned : closed.manifest.verdict === null ? '' : ` (${closed.manifest.verdict})`;
        print(session, options.json === true, team, closed, `${team.slug}: closed ${closed.id}${how}`);
        return EXIT.ok;
      });
    });
  attempt
    .command('approve <team>')
    .description('record the approval of a remote run in the open attempt (remote-approval.json): what the user typed as /team-approve remote <usd>')
    .requiredOption('--usd <amount>', 'the amount of USD the user approved, 0 or more, at most budget.remote_usd_max of bench.config.json')
    .option('--json', 'print the approval as JSON')
    .action(async (teamArgument: string, options: { usd: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const record = await services.approveRemote.execute(team, options.usd);
        if (options.json === true) {
          session.output.json({ team: team.slug, attempt: record.attempt, file: record.file, approval: record.approval });
        } else {
          session.output.line(`${team.slug}: remote run approved in ${record.attempt} — ${String(record.approval.estimated_usd)} USD, cap ${String(record.approval.cap_usd)} USD (${record.file})`);
        }
        return EXIT.ok;
      });
    });
}

function parseVerdict(value: string): Verdict {
  const verdict = VERDICTS.find((candidate) => candidate === value.trim().toUpperCase());
  if (verdict === undefined) {
    throw new DomainError(`unknown verdict "${value}" (expected ${VERDICTS.join(', ')})`);
  }
  return verdict;
}

function print(session: Session, json: boolean, team: TeamRef, attempt: Pick<StoredAttempt, 'id' | 'folder' | 'manifest'>, text: string): void {
  if (json) {
    session.output.json({ team: team.slug, attempt: attempt.id, folder: attempt.folder, manifest: attempt.manifest });
  } else {
    session.output.line(text);
  }
}
