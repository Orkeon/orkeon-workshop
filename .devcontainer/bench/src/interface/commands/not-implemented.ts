import type { Command } from 'commander';

import { EXIT } from '../exit-codes.js';
import type { Session } from '../session.js';

/** Commands of later lots (plan § 7.5, § 11): present so scripts can probe them, exit 3. */
export const PLANNED_COMMANDS: readonly { name: string; lot: number; summary: string }[] = [
  { name: 'datasets', lot: 4, summary: 'materialize the datasets of a team (datasets build <team> [<set>])' },
  { name: 'evaluate', lot: 4, summary: 'recompute AC / IND / INV on an archived run' },
  { name: 'capture', lot: 4, summary: 'compact capture for the reviewer' },
  { name: 'team', lot: 4, summary: 'move or remove the five trees of a team together: its folder, workbook, tests, settings and mount sets (team rename | remove)' },
  { name: 'estimate', lot: 9, summary: 'estimate the cost of a remote run' },
  { name: 'release', lot: 9, summary: 'realign the Studio card and launchers, compact runs, print the tag command' },
];

export function registerNotImplemented(program: Command, session: Session): void {
  for (const planned of PLANNED_COMMANDS) {
    stub(program.command(`${planned.name} [args...]`).description(`${planned.summary} — lot ${planned.lot}`), planned.name, planned.lot, session);
  }
}

function stub(command: Command, name: string, lot: number, session: Session): void {
  command
    .allowUnknownOption()
    .allowExcessArguments()
    .action(() => {
      session.output.error(`orkeon-bench ${name}: not implemented yet (lot ${lot})`);
      session.exitCode = EXIT.notImplemented;
    });
}
