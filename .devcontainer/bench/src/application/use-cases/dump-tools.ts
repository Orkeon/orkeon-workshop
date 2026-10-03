import { ApplicationError } from '../errors.js';
import type { Environment, FileSystem, LlmRecorder, ProcessResult, ProcessRunner } from '../ports/index.js';
import { joinPath } from '../../domain/paths.js';
import { STUB_API_KEY, STUB_MODEL } from '../../domain/profile.js';
import { parseToolCatalogue } from '../../domain/tool-catalogue.js';
import { hasTools, parseRecordedTools, toolDumpCrew, type ToolSchema } from '../../domain/tool-schema.js';

const LIST_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 180_000;
/**
 * The model settings of the run come from the recorder alone: the caller's own `ORKEON_Llm*`
 * variables are dropped, whatever the case of their names (Orkeon matches them case-insensitively).
 */
const LLM_VARIABLE_PREFIX = 'orkeon_llm';

export interface ToolDump {
  readonly tools: readonly ToolSchema[];
  /** Listed by `orkeon run --list-tools` but absent from the recorded request. */
  readonly missing: readonly string[];
}

/**
 * The schema of every tool `orkeon run` offers, as it sends them to the model (plan § 12, the
 * catalogue of the references): a throw-away crew lists every tool of `orkeon run --list-tools`,
 * runs once against a local recorder, and the `tools[]` of its first request is the answer.
 */
export class DumpTools {
  constructor(
    private readonly processes: ProcessRunner,
    private readonly files: FileSystem,
    private readonly environment: Environment,
    private readonly recorder: LlmRecorder,
  ) {}

  async execute(): Promise<ToolDump> {
    const listed = await this.processes.run('orkeon', ['run', '--list-tools'], { timeoutMs: LIST_TIMEOUT_MS });
    ensureSucceeded(listed, 'orkeon run --list-tools');
    const names = parseToolCatalogue(listed.stdout);
    const crew = toolDumpCrew(names);

    const folder = await this.files.makeTemporaryDirectory('orkeon-tool-dump-');
    try {
      for (const file of crew) {
        const path = joinPath(folder, file.path);
        await this.files.makeDirectory(path.slice(0, path.lastIndexOf('/')));
        await this.files.writeText(path, file.content);
      }
      const recording = await this.recorder.start();
      let run: ProcessResult;
      try {
        run = await this.processes.run('orkeon', ['run', 'crew'], {
          cwd: folder,
          timeoutMs: RUN_TIMEOUT_MS,
          env: { ...this.inheritedVariables(), ORKEON_Llm__BaseUrl: recording.baseUrl, ORKEON_Llm__Model: STUB_MODEL, ORKEON_Llm__ApiKey: STUB_API_KEY },
        });
      } finally {
        await recording.stop();
      }
      const request = recording.requests().find(hasTools);
      if (request === undefined) {
        throw new ApplicationError('process-failed', `orkeon run crew sent no request with tools (${describe(run)})`);
      }
      const tools = parseRecordedTools(request);
      const seen = new Set(tools.map((tool) => tool.name));
      return { tools, missing: names.filter((name) => !seen.has(name)) };
    } finally {
      await this.files.remove(folder);
    }
  }

  private inheritedVariables(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.environment.variables()).filter(([name]) => !name.toLowerCase().startsWith(LLM_VARIABLE_PREFIX)));
  }
}

function ensureSucceeded(result: ProcessResult, command: string): void {
  if (!result.found) {
    throw new ApplicationError('process-failed', 'orkeon not found on PATH');
  }
  if (result.exitCode !== 0) {
    throw new ApplicationError('process-failed', `${command} failed (${describe(result)})`);
  }
}

function describe(result: ProcessResult): string {
  const detail = result.stderr.trim().split(/\r?\n/).filter((line) => line.trim() !== '').slice(-1)[0];
  const exit = result.exitCode === null ? 'no exit code' : `exit ${String(result.exitCode)}`;
  return detail === undefined ? exit : `${exit}: ${detail}`;
}
