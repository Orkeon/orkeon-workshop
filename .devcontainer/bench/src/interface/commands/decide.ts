import type { Command } from 'commander';

import { DEFAULT_MAX_CONTEXT_BYTES, parseOption, type DecideKind } from '../../domain/decide.js';
import { DomainError } from '../../domain/errors.js';
import { resolvePath } from '../../domain/paths.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

interface DecideOptions {
  question: string;
  option?: string[];
  level?: string[];
  contextFile?: string;
  maxContextBytes?: string;
  settings?: string;
  allowRemote?: boolean;
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/**
 * `decide choice|score|noul` (D98): JSON on stdout when the decision model answers (exit 0); with no
 * model, one `notice:` line on stderr and nothing on stdout (exit 4); a provider that fails, one
 * `error:` line (exit 5).
 */
export function registerDecide(program: Command, services: Services, session: Session): void {
  const decide = program
    .command('decide')
    .description(`ask the machine's decision model (Kev, TypeSafe, Liquid) one typed question; exit ${String(EXIT.noDecisionModel)} and nothing on stdout without one, exit ${String(EXIT.decisionFailed)} when its provider fails`);
  const kinds: { kind: DecideKind; description: string; flag?: 'option' | 'level' }[] = [
    { kind: 'choice', description: 'one option among several (--option name[=description], twice or more)', flag: 'option' },
    { kind: 'score', description: 'a level on an ordered scale (--level, lowest first, twice or more)', flag: 'level' },
    { kind: 'noul', description: 'the probability that a statement (--question) is true: yes or no' },
  ];
  for (const { kind, description, flag } of kinds) {
    const command = decide.command(kind).description(description).requiredOption('--question <text>', kind === 'noul' ? 'the statement' : 'the question');
    if (flag === 'option') {
      command.option('--option <name[=description]>', 'an option (repeat)', collect);
    } else if (flag === 'level') {
      command.option('--level <label>', 'a level, lowest first (repeat)', collect);
    }
    command
      .option('--context-file <file>', 'what the question is about, read from a file: pass the excerpt that matters, not a whole document')
      .option('--max-context-bytes <n>', `the most bytes of the context passed, cut on a line boundary (the JSON says "truncated") — the local Kev answers 500 past about 5 KB (default ${String(DEFAULT_MAX_CONTEXT_BYTES)})`)
      .option('--settings <file>', 'the settings file passed to orkeon run (the chain Orkeon resolves by default)')
      .option('--allow-remote', 'ask a hosted or non-local provider, a paid remote call (refused by default: exit 4)')
      .action(async (options: DecideOptions) => {
        await session.run(async () => {
          const here = services.currentDirectory();
          const outcome = await services.decide.execute({
            kind,
            question: options.question,
            options: (flag === 'option' ? (options.option ?? []).map(parseOption) : flag === 'level' ? (options.level ?? []).map((level) => ({ name: level.trim(), description: level.trim() })) : []),
            contextFile: options.contextFile === undefined ? undefined : resolvePath(here, options.contextFile),
            maxContextBytes: options.maxContextBytes === undefined ? undefined : positiveInteger(options.maxContextBytes),
            settingsFile: options.settings === undefined ? undefined : resolvePath(here, options.settings),
            allowRemote: options.allowRemote === true,
          });
          switch (outcome.status) {
            case 'answered':
              session.output.json(outcome.answer);
              return EXIT.ok;
            case 'no-model':
              session.output.error(`notice: no decision model: ${outcome.reason}`);
              return EXIT.noDecisionModel;
            case 'failed':
              session.output.error(`error: the decision model failed: ${outcome.reason}`);
              return EXIT.decisionFailed;
          }
        });
      });
  }
}

function positiveInteger(raw: string): number {
  const value = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value < 1) {
    throw new DomainError('invalid --max-context-bytes', [`--max-context-bytes takes a whole number of bytes, 1 or more: ${raw}`]);
  }
  return value;
}
