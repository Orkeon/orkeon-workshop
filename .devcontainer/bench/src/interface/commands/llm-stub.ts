import type { Command } from 'commander';

import { DomainError } from '../../domain/errors.js';
import { LLM_VARIABLES } from '../../domain/profile.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerLlmStub(program: Command, services: Services, session: Session): void {
  const stub = program.command('llm-stub').description('the simulated LLM: an OpenAI- and Ollama-compatible endpoint on 127.0.0.1 that answers from a reply script');
  stub
    .command('serve')
    .description('serve the reply script of a scenario until interrupted (Ctrl-C): scripted final texts and tool calls, which orkeon run executes with the real tools')
    .requiredOption('--scenario <file>', 'a scenario (*.scenario.json, its llm_stub) or a reply script')
    .option('--port <port>', 'the port to listen on (never 11434); the system picks one when absent')
    .option('--log <file>', 'append every exchange to this JSONL file (what it already holds is kept)')
    .option('--json', 'print the endpoint, then the summary, as JSON')
    .action(async (options: { scenario: string; port?: string; log?: string; json?: boolean }) => {
      await session.run(async () => {
        const summary = await services.serveLlmStub.execute(
          { scenarioFile: options.scenario, ...(options.port === undefined ? {} : { port: parsePort(options.port) }), ...(options.log === undefined ? {} : { logFile: options.log }) },
          (endpoint) => {
            if (options.json === true) {
              session.output.json({ base_url: endpoint.baseUrl, port: endpoint.port, model: endpoint.model, api_key: endpoint.apiKey });
            } else {
              session.output.line(`listening on ${endpoint.baseUrl}`);
              session.output.line(`export ${LLM_VARIABLES.baseUrl}=${endpoint.baseUrl} ${LLM_VARIABLES.model}=${endpoint.model} ${LLM_VARIABLES.apiKey}=${endpoint.apiKey}`);
            }
          },
        );
        if (options.json === true) {
          session.output.json({ requests: summary.requests, issues: summary.issues });
        } else {
          session.output.line(`${String(summary.requests)} request(s) received`);
          for (const issue of summary.issues) {
            session.output.error(`issue: ${issue}`);
          }
        }
        return summary.issues.length === 0 ? EXIT.ok : EXIT.failed;
      });
    });
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new DomainError(`invalid port "${value}" (expected an integer between 1 and 65535)`);
  }
  return Number(value.trim());
}
