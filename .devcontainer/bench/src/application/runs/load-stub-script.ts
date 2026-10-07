import { parseStubScript, type StubScript } from '../../domain/llm-stub.js';
import { joinPath } from '../../domain/paths.js';
import { SCENARIO_SUFFIX, parseScenario, type Scenario } from '../../domain/scenario.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from '../use-cases/read-json-file.js';

/** The reply script a scenario carries: inline, or in the file it names next to itself. */
export async function stubScriptOf(fileSystem: FileSystem, scenario: Scenario, scenarioFile: string): Promise<StubScript> {
  if (scenario.llm_stub === null) {
    throw new ApplicationError('invalid-input', `${scenarioFile} has no reply script: set llm_stub to a script, or to the file that holds one`);
  }
  if (typeof scenario.llm_stub !== 'string') {
    return scenario.llm_stub;
  }
  const path = joinPath(scenarioFile, '..', scenario.llm_stub);
  if (!(await fileSystem.exists(path))) {
    throw new ApplicationError('file-not-found', `reply script not found: ${path} (llm_stub of ${scenarioFile})`);
  }
  return parseStubScript(await readJsonFile(fileSystem, path), path);
}

/** `--scenario <file>` of `llm-stub serve`: a scenario (`*.scenario.json`), or a reply script alone. */
export async function loadStubScript(fileSystem: FileSystem, file: string): Promise<StubScript> {
  if (!(await fileSystem.exists(file))) {
    throw new ApplicationError('file-not-found', `scenario not found: ${file}`);
  }
  const content = await readJsonFile(fileSystem, file);
  if (file.endsWith(SCENARIO_SUFFIX) || (typeof content === 'object' && content !== null && 'llm_stub' in content)) {
    return stubScriptOf(fileSystem, parseScenario(content, file), file);
  }
  return parseStubScript(content, file);
}
