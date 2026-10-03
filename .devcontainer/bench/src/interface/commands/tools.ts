import type { Command } from 'commander';

import { renderToolTable } from '../../domain/tool-schema.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerTools(program: Command, services: Services, session: Session): void {
  const tools = program.command('tools').description('the tools of the installed orkeon');
  tools
    .command('dump')
    .description('record the schema of every tool, as orkeon run sends it to the model, through a local stub (no model is called)')
    .option('--json', 'print the tool entries as orkeon run sent them')
    .action(async (options: { json?: boolean }) => {
      await session.run(async () => {
        const dump = await services.dumpTools.execute();
        if (options.json === true) {
          session.output.json({ tools: dump.tools.map((tool) => tool.entry), missing: dump.missing });
        } else {
          session.output.line(renderToolTable(dump.tools));
          session.output.line('');
          session.output.line(`${String(dump.tools.length)} tools recorded`);
          if (dump.missing.length > 0) {
            session.output.line(`listed by orkeon run --list-tools but not sent to the model: ${dump.missing.join(', ')}`);
          }
        }
        return dump.missing.length === 0 ? EXIT.ok : EXIT.failed;
      });
    });
}
