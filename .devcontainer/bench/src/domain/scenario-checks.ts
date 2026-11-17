import { decisionTasksNamed, namesTask, resolveTaskName, type CrewTask } from './decisions.js';
import { stubIssues, stubRequestText, type StubExchange } from './llm-stub.js';
import type { RunEvents } from './run-events.js';
import { unsupportedParts, type Scenario, type ScenarioCheck } from './scenario.js';

export interface CheckResult {
  readonly id: string;
  readonly type: string;
  readonly status: 'pass' | 'fail';
  /** Why it fails; empty when it passes. */
  readonly detail: string;
}

/** What a mount point holds at a path once the run is over. */
export interface FileEvidence {
  readonly exists: boolean;
  /** Null when there is no file to read there (absent, or a folder). */
  readonly text: string | null;
}

/** Everything the checks of a scenario are judged on, gathered after the run. */
export interface ScenarioEvidence {
  /** Null when the process gave no exit code (killed, timed out, not found). */
  readonly exitCode: number | null;
  readonly events: RunEvents;
  readonly exchanges: readonly StubExchange[];
  /** By virtual path, for every path a check names. */
  readonly files: ReadonlyMap<string, FileEvidence>;
  /** By path below the dataset, for every `expected` a check names; null when the file is missing. */
  readonly expected: ReadonlyMap<string, string | null>;
  /**
   * By check id, for a `matches-expected` whose file or expected file is not text: whether the two
   * hold the same bytes. Such files are never compared as text.
   */
  readonly sameBytes: ReadonlyMap<string, boolean>;
  /**
   * By check id, for a `json-schema` whose file is JSON: what the schema refuses in it, empty when
   * the document conforms — and one line when the schema itself could not be read or compiled.
   */
  readonly schemaViolations: ReadonlyMap<string, readonly string[]>;
  /** Why the bench stopped `orkeon run` itself — out of time, too much output — in words; null when it did not. */
  readonly stopped: string | null;
  /** The tasks of a YAML crew, read when a check names a task (`task-skipped`); empty for a TypeScript crew. */
  readonly crewTasks?: readonly CrewTask[];
}

/** How many violations of a schema the detail of a `json-schema` check names. */
export const SCHEMA_VIOLATIONS_SHOWN = 3;

/** Ids of the checks every scenario gets besides its own: the run itself, and the reply script. */
export const RUN_CHECK_ID = 'run';
export const STUB_CHECK_ID = 'stub';
export const SUPPORT_CHECK_ID = 'unsupported';

/**
 * The results of a scenario: the run succeeded, the reply script was followed without an issue
 * (on the simulated LLM alone: `options.stub`), nothing was asked that the bench does not do, then
 * each declared check.
 */
export function judgeScenario(scenario: Scenario, evidence: ScenarioEvidence, options: { readonly stub: boolean } = { stub: true }): CheckResult[] {
  const results = [runCheck(evidence), ...(options.stub ? [stubCheck(evidence.exchanges)] : [])];
  const unsupported = unsupportedParts(scenario);
  if (unsupported.length > 0) {
    results.push({ id: SUPPORT_CHECK_ID, type: 'unsupported', status: 'fail', detail: unsupported.join('; ') });
  }
  return [...results, ...scenario.checks.map((check) => judgeCheck(check, evidence))];
}

function runCheck(evidence: ScenarioEvidence): CheckResult {
  const finished = evidence.events.finished;
  const failures: string[] = [];
  if (evidence.stopped !== null) {
    failures.push(evidence.stopped);
  } else if (evidence.exitCode !== 0) {
    failures.push(evidence.exitCode === null ? 'orkeon run ended without an exit code (killed by a signal)' : `orkeon run exited ${String(evidence.exitCode)}`);
  }
  if (finished === null) {
    failures.push('no run.finished event');
  } else if (!finished.success) {
    failures.push('run.finished reports a failure');
  }
  failures.push(...evidence.events.errors);
  return result(RUN_CHECK_ID, 'run-succeeded', failures);
}

function stubCheck(exchanges: readonly StubExchange[]): CheckResult {
  const issues = exchanges.length === 0 ? ['the simulated LLM received no request: the run did not reach it'] : stubIssues(exchanges);
  return result(STUB_CHECK_ID, 'stub-script', issues);
}

function judgeCheck(check: ScenarioCheck, evidence: ScenarioEvidence): CheckResult {
  const fail = (detail: string): CheckResult => ({ id: check.id, type: check.type, status: 'fail', detail });
  const pass: CheckResult = { id: check.id, type: check.type, status: 'pass', detail: '' };
  switch (check.type) {
    case 'file-exists':
      return evidence.files.get(check.path)?.exists === true ? pass : fail(`${check.path} does not exist`);
    case 'text-present':
    case 'text-absent': {
      const text = evidence.files.get(check.path)?.text ?? null;
      if (text === null) {
        return fail(`${check.path} is not a file the run left`);
      }
      const found = search(check.pattern, text);
      if (found === null) {
        return fail(`"${check.pattern}" is not a regular expression`);
      }
      if (check.type === 'text-present') {
        return found ? pass : fail(`${check.path} does not hold /${check.pattern}/i`);
      }
      return found ? fail(`${check.path} holds /${check.pattern}/i`) : pass;
    }
    case 'matches-expected': {
      const actual = evidence.files.get(check.path)?.text ?? null;
      const expected = evidence.expected.get(check.expected) ?? null;
      if (expected === null) {
        return fail(`the expected file ${check.expected} is missing from the dataset`);
      }
      if (actual === null) {
        return fail(`${check.path} is not a file the run left`);
      }
      const bytes = evidence.sameBytes.get(check.id);
      if (bytes !== undefined) {
        return bytes ? pass : fail(`${check.path} differs from ${check.expected} (not text: compared byte for byte)`);
      }
      return sameContent(actual, expected) ? pass : fail(`${check.path} differs from ${check.expected}`);
    }
    case 'json-schema': {
      const text = evidence.files.get(check.path)?.text ?? null;
      if (text === null) {
        return fail(`${check.path} is not a file the run left`);
      }
      if (!parseJson(text).ok) {
        return fail(`${check.path} is not JSON`);
      }
      const violations = evidence.schemaViolations.get(check.id) ?? [`the schema ${check.schema} was not read`];
      return violations.length === 0 ? pass : fail(`schema violations: ${violations.slice(0, SCHEMA_VIOLATIONS_SHOWN).join('; ')}${violations.length > SCHEMA_VIOLATIONS_SHOWN ? '; …' : ''}`);
    }
    case 'tool-called': {
      const calls = evidence.events.toolCalls.filter((call) => call.tool === check.tool);
      if (calls.length === 0) {
        return fail(`${check.tool} was never called`);
      }
      if (check.outcome === 'any' || calls.some((call) => call.success === (check.outcome === 'success'))) {
        return pass;
      }
      return fail(`${check.tool} was called ${String(calls.length)} time(s) and no call ${check.outcome === 'success' ? 'succeeded' : 'failed'} (tool.returned)`);
    }
    case 'tool-never-called': {
      const calls = evidence.events.toolCalls.filter((call) => call.tool === check.tool).length;
      return calls === 0 ? pass : fail(`${check.tool} was called ${String(calls)} time(s)`);
    }
    case 'stub-received': {
      const requests = evidence.exchanges.filter((exchange) => check.role === undefined || exchange.role === check.role);
      const found = requests.map((exchange) => search(check.pattern, stubRequestText(exchange.request)));
      if (found.includes(null)) {
        return fail(`"${check.pattern}" is not a regular expression`);
      }
      const whom = check.role === undefined ? 'no request' : `no request of role "${check.role}"`;
      return found.includes(true) ? pass : fail(`${whom} held /${check.pattern}/i`);
    }
    case 'decision-answered': {
      const { tasks, notRun } = decisionTasksNamed(evidence.events, check.task);
      if (tasks.length === 0) {
        return fail(notRun ? `the decision ${check.task} did not run` : `no decision task ${check.task} completed (task.completed with isDecision)`);
      }
      if (tasks.some((task) => task.success && !task.skipped && !task.defaulted)) {
        return pass;
      }
      return fail(tasks.some((task) => task.defaulted) ? `the decision ${check.task} answered from its fallback (defaulted): no decision model answered` : `the decision ${check.task} did not succeed`);
    }
    case 'decision-chose': {
      const { tasks, notRun } = decisionTasksNamed(evidence.events, check.task);
      if (tasks.length === 0) {
        return fail(notRun ? `the decision ${check.task} did not run` : `no decision task ${check.task} completed (task.completed with isDecision)`);
      }
      const answers = tasks.flatMap((task) => (task.decision ?? []).filter((answer) => answer.question === check.question));
      if (answers.some((answer) => answer.chosen === check.option)) {
        // `defaulted` (optional): the answer must come from the fallback (true) or from the model (false).
        if (check.defaulted === undefined || tasks.some((task) => task.defaulted === check.defaulted && (task.decision ?? []).some((answer) => answer.question === check.question && answer.chosen === check.option))) {
          return pass;
        }
        return fail(check.defaulted ? `the decision ${check.task} chose ${check.option}, but not from its fallback: a decision model answered (defaulted false)` : `the decision ${check.task} chose ${check.option} from its fallback (defaulted): no decision model answered`);
      }
      if (answers.length === 0) {
        return fail(tasks.some((task) => task.decisionUnparsed) ? `the answers of the decision ${check.task} cannot be read` : `the decision ${check.task} gave no answer to ${check.question}`);
      }
      return fail(`the decision ${check.task} chose ${answers.map((answer) => answer.chosen).join(', ')} for ${check.question}, not ${check.option}`);
    }
    case 'task-skipped': {
      // The task events never carry the file stem (Orkeon 1.2.0): a stem resolves to its agent's role.
      const resolved = resolveTaskName(check.task, evidence.crewTasks ?? []);
      if (resolved !== null && 'unresolved' in resolved) {
        return fail(`${check.task} cannot be found in the events: ${resolved.unresolved}`);
      }
      const name = resolved === null ? check.task : resolved.role;
      const named = evidence.events.tasks.filter((task) => namesTask(task, name));
      if (named.length === 0) {
        return fail(`no task ${check.task}${resolved === null ? '' : ` (role ${name})`} completed (task.completed names it by taskId, agentRole or agentId; a YAML task's file stem resolves to its agent's role)`);
      }
      return named.some((task) => task.skipped) ? pass : fail(`${check.task} ran: it was not skipped`);
    }
  }
}

/** True or false for a match ignoring case; null when the pattern is no regular expression. */
function search(pattern: string, text: string): boolean | null {
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return null;
  }
}

/**
 * How `matches-expected` compares two texts: two JSON documents by value, whatever the order of
 * their keys and their layout; any other text line by line, line ends and trailing blank lines
 * aside. A file that is not text (`isText`) is compared byte for byte instead.
 */
export function sameContent(actual: string, expected: string): boolean {
  const left = parseJson(actual);
  const right = parseJson(expected);
  if (left.ok && right.ok) {
    return canonical(left.value) === canonical(right.value);
  }
  const lines = (text: string): string => text.replaceAll('\r\n', '\n').trimEnd();
  return lines(actual) === lines(expected);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function result(id: string, type: string, failures: readonly string[]): CheckResult {
  return { id, type, status: failures.length === 0 ? 'pass' : 'fail', detail: failures.join('; ') };
}

/** True for the bytes of a text file: valid UTF-8 without a NUL. An image, an archive, a DOCX are not. */
export function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) {
    return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
