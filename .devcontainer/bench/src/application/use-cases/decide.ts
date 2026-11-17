import { stringify as stringifyYaml } from 'yaml';

import { ApplicationError } from '../errors.js';
import type { Environment, FileSystem, ProcessRunner } from '../ports/index.js';
import { DEFAULT_MAX_CONTEXT_BYTES, capContext, decideCrew, decideOutcome, decideQuestion, type DecideContext, type DecideKind, type DecideOption, type DecideOutcome } from '../../domain/decide.js';
import { LOCAL_HOSTS_VARIABLE, decisionModelTarget, decisionProvider, parseLocalHosts } from '../../domain/llm-target.js';
import { effectiveDecisionModel } from '../../domain/orkeon-configuration.js';
import { joinPath } from '../../domain/paths.js';
import { readLlmLayers } from './read-llm-layers.js';

const RUN_TIMEOUT_MS = 120_000;

export interface DecideRequest {
  readonly kind: DecideKind;
  readonly question: string;
  readonly options: readonly DecideOption[];
  /** A file whose content is what the question is about. */
  readonly contextFile?: string | undefined;
  /** The most UTF-8 bytes of the context passed, cut on a line boundary; `DEFAULT_MAX_CONTEXT_BYTES` when absent. */
  readonly maxContextBytes?: number | undefined;
  /** The file passed to `orkeon run --settings`; the chain Orkeon resolves when absent. */
  readonly settingsFile?: string | undefined;
  /** A hosted or non-local provider is a paid remote call: asked only with `--allow-remote`. */
  readonly allowRemote?: boolean;
}

/**
 * `orkeon-bench decide` (D98): asks the decision model of the machine one typed question through a
 * throw-away crew of one decision task, run by `orkeon run --events jsonl` with the caller's environment.
 * No provider (the settings resolved as Orkeon resolves them, `effectiveDecisionModel`), or a remote one
 * without `allowRemote`: `no-model`, and orkeon is not started.
 */
export class Decide {
  constructor(
    private readonly processes: ProcessRunner,
    private readonly files: FileSystem,
    private readonly environment: Environment,
  ) {}

  async execute(request: DecideRequest): Promise<DecideOutcome> {
    let context = '';
    let contextSummary: DecideContext | undefined;
    if (request.contextFile !== undefined) {
      if (!(await this.files.exists(request.contextFile)) || (await this.files.isDirectory(request.contextFile))) {
        throw new ApplicationError('file-not-found', `context file not found: ${request.contextFile}`);
      }
      const capped = capContext(await this.files.readText(request.contextFile), request.maxContextBytes ?? DEFAULT_MAX_CONTEXT_BYTES);
      context = capped.text;
      contextSummary = capped.context;
    }
    const question = decideQuestion(request.kind, request.question, request.options, context);
    const folder = await this.files.makeTemporaryDirectory('orkeon-bench-decide-');
    try {
      const crewFolder = joinPath(folder, 'crew');
      await this.files.makeDirectory(joinPath(crewFolder, 'agents'));
      await this.files.makeDirectory(joinPath(crewFolder, 'tasks'));
      for (const file of decideCrew(question)) {
        await this.files.writeText(joinPath(folder, file.path), stringifyYaml(file.content, { lineWidth: 0 }));
      }

      const machine = await readLlmLayers(this.files, this.environment, { crewFolder, explicitSettingsFile: request.settingsFile });
      const extraLocalHosts = parseLocalHosts(this.environment.get(LOCAL_HOSTS_VARIABLE));
      const model = effectiveDecisionModel(machine.layers, machine.decisionKeys, extraLocalHosts);
      if (!model.configured) {
        return { status: 'no-model', reason: 'no decision provider is configured (Orkeon:Decision:Provider, Orkeon:TypeSafe, Orkeon:Liquid, TYPESAFE_API_KEY, LIQUID_API_KEY)' };
      }
      if (model.refusal !== null) {
        return { status: 'failed', reason: `Orkeon refuses the decision settings: ${model.refusal}` };
      }
      const target = decisionModelTarget(model, extraLocalHosts);
      if (target?.remote === true && request.allowRemote !== true) {
        const name = model.provider === null ? 'the decision provider' : decisionProvider(model.provider).displayName;
        return { status: 'no-model', reason: `${name} at ${model.baseUrl ?? 'its default address'} is remote: a paid call, asked only with --allow-remote` };
      }

      const args = ['run', 'crew', '--events', 'jsonl', ...(request.settingsFile === undefined ? [] : ['--settings', request.settingsFile])];
      const run = await this.processes.run('orkeon', args, { cwd: folder, timeoutMs: RUN_TIMEOUT_MS });
      if (!run.found) {
        throw new ApplicationError('process-failed', 'orkeon not found on PATH');
      }
      if (run.stopped !== undefined) {
        return { status: 'failed', reason: `orkeon run was stopped (${run.stopped}) after ${String(RUN_TIMEOUT_MS / 1000)} s` };
      }
      const outcome = decideOutcome(question, run.stdout, run.stderr);
      if (outcome.status === 'answered') {
        return {
          status: 'answered',
          answer: { ...outcome.answer, provider: outcome.answer.provider ?? model.provider, model: outcome.answer.model ?? model.model, ...(contextSummary === undefined ? {} : { context: contextSummary }) },
        };
      }
      return outcome;
    } finally {
      await this.files.remove(folder);
    }
  }
}
