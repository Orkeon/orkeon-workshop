import type { Command } from 'commander';

import type { SetupReport, SetupResult } from '../../application/use-cases/setup.js';
import { SETUP_KEY_VARIABLE } from '../../application/use-cases/setup.js';
import { SETUP_PROVIDERS } from '../../domain/setup.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

interface CommonOptions {
  root?: string;
  json?: boolean;
}

interface KeysOptions extends CommonOptions {
  provider: string;
  model: string;
  baseUrl?: string;
  keyVariable?: string;
  claudeOnKey?: boolean;
}

/**
 * `orkeon-bench setup` (D108, D109): the model keys of a workshop, for Claude Code and for Orkeon at
 * once. `status` reads; `keys` and `subscription` write `.claude/settings.local.json` and Orkeon's
 * user settings. No key is ever printed, in text or in JSON.
 */
export function registerSetup(program: Command, services: Services, session: Session): void {
  const setup = program.command('setup').description('set the model keys for Claude Code and Orkeon at once: status, keys (the keys in .claude/settings.local.json), subscription (no key on disk, the teams on the local model), apply (at the start of a container)');

  setup
    .command('status')
    .description('the mode, the key variables present (names only), the model of the teams and whether a run of theirs is paid')
    .option('--root <dir>', 'the folder whose .claude/ is read (default: $ORKEON_WORKSHOP, else the current directory)')
    .option('--json', 'print the status as JSON')
    .action(async (options: CommonOptions) => {
      await session.run(async () => {
        const report = await services.setup.status(options.root);
        print(session, options, [], report);
        return EXIT.ok;
      });
    });

  setup
    .command('keys')
    .description(`write a model key into the env block of .claude/settings.local.json and name its variable in Orkeon's settings; the key is read from the variable ${SETUP_KEY_VARIABLE} of this command (workshop setup asks for it on the terminal)`)
    .requiredOption('--provider <id>', `${SETUP_PROVIDERS.map((provider) => provider.id).join(', ')}, or custom`)
    .requiredOption('--model <model>', 'the model the teams call')
    .option('--base-url <url>', 'the endpoint; required for custom, the provider\'s own otherwise')
    .option('--key-variable <name>', 'the variable that holds the key; required for custom, the provider\'s own otherwise')
    .option('--claude-on-key', 'anthropic only: Claude Code takes the key too (ANTHROPIC_API_KEY) and bills the API account instead of the plan')
    .option('--root <dir>', 'the folder whose .claude/ is written (default: $ORKEON_WORKSHOP, else the current directory)')
    .option('--json', 'print the result as JSON')
    .action(async (options: KeysOptions) => {
      await session.run(async () => {
        const result = await services.setup.keys(
          { provider: options.provider, model: options.model, baseUrl: options.baseUrl, keyVariable: options.keyVariable, claudeOnKey: options.claudeOnKey === true },
          options.root,
        );
        print(session, options, result.lines, result.report);
        return EXIT.ok;
      });
    });

  setup
    .command('subscription')
    .description('remove the keys setup keys wrote and give Orkeon back the Llm section it had: Claude Code on its sign-in, the teams on the local model')
    .option('--root <dir>', 'the folder whose .claude/ is written (default: $ORKEON_WORKSHOP, else the current directory)')
    .option('--json', 'print the result as JSON')
    .action(async (options: CommonOptions) => {
      await session.run(async () => {
        const result: SetupResult = await services.setup.subscription(options.root);
        print(session, options, result.lines, result.report);
        return EXIT.ok;
      });
    });

  registerApply(setup, services, session);
}

function registerApply(setup: Command, services: Services, session: Session): void {
  setup
    .command('apply')
    .description('at the start of a container: put Orkeon\'s settings back on what setup keys chose when they no longer name it (a new container writes its own, for the local model); prints one line when it did, nothing otherwise')
    .option('--root <dir>', 'the folder whose .claude/ is read (default: $ORKEON_WORKSHOP, else the current directory)')
    .action(async (options: CommonOptions) => {
      await session.run(async () => {
        const result = await services.setup.apply(options.root);
        result.lines.forEach((line) => session.output.line(line));
        return EXIT.ok;
      });
    });
}

function print(session: Session, options: CommonOptions, lines: readonly string[], report: SetupReport): void {
  if (options.json === true) {
    session.output.json(toJson(lines, report));
    return;
  }
  [...lines, ...toText(report)].forEach((line) => session.output.line(line));
}

function toJson(lines: readonly string[], report: SetupReport): unknown {
  return {
    mode: report.mode,
    keys: report.keys,
    claude_on_key: report.claudeOnKey,
    llm: { model: report.model, base_url: report.baseUrl, key_variable: report.keyVariable, key_missing: report.keyMissing, remote: report.remote },
    files: { settings_local: report.paths.local, orkeon_settings: report.paths.orkeon, state: report.paths.state },
    changes: lines,
  };
}

function toText(report: SetupReport): string[] {
  const teams =
    report.model === null && report.baseUrl === null
      ? 'no Llm section in Orkeon\'s settings: the teams have no model'
      : `${report.model ?? '(no model)'} at ${report.baseUrl ?? '(no base URL)'} — ${report.remote ? 'remote: a run is paid' : 'local'}`;
  return [
    `mode: ${report.mode}`,
    `keys in .claude/settings.local.json: ${report.keys.length > 0 ? report.keys.join(', ') : 'none'}`,
    `Claude Code: ${report.claudeOnKey ? 'on the API key (ANTHROPIC_API_KEY in the env block)' : 'on its sign-in'}`,
    `teams: ${teams}`,
    ...(report.keyVariable === null ? [] : [`key variable of the teams: ${report.keyVariable}${report.keyMissing ? ' — NOT SET: neither in the env block nor in this environment' : ''}`]),
  ];
}
