import { z } from 'zod';

import { LEVELS } from './bench-config.js';
import { ID_PATTERNS } from './ids.js';
import { stubScriptSchema } from './llm-stub.js';
import { VIRTUAL_ROOT_PATTERN } from './mounts/virtual-root.js';
import { parseWith } from './schema.js';

/**
 * A test scenario, `tests/<slug>/{component,e2e}/*.scenario.json` (template
 * `.claude/templates/scenario.json`; the format is provisional until lot 5): a dataset, how the
 * team's mount points are bound to it, the reply script of the simulated LLM, and the checks.
 */
export const SCENARIO_SCHEMA_VERSION = '1.0';
export const SCENARIO_SUFFIX = '.scenario.json';

/** A file seen through a mount point: `/output/report.md`. Never climbs out of its root. */
const virtualFile = z
  .string()
  .regex(/^\/[a-z0-9][a-z0-9_-]*\/.+$/, 'expected a path under a mount point, such as /output/report.md')
  .refine((path) => !path.split('/').includes('..'), { message: 'a path never climbs with ".."' });

/** A path below a folder of the tests, written with `/`: no leading slash, no `..`, no backslash — which a Windows host reads as a separator. */
const relativePath = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'), { message: 'expected a relative path without ".."' });

/** What a `tool-called` check may ask of the call: `tool.returned` says whether a call succeeded. */
export const TOOL_OUTCOMES = ['success', 'failure', 'any'] as const;

/** The folder of a dataset that holds what the written points must contain: never bound to a mount point. */
export const EXPECTED_FOLDER = 'expected';

const id = z.string().min(1);
const pattern = z.string().min(1);
const tool = z.string().regex(/^[a-z0-9_]+$/, 'a tool name is snake_case');

/**
 * The deterministic checks of a scenario. `pattern` is a regular expression, matched ignoring
 * case. `json-schema` is part of the format but not evaluated by this version: it fails the
 * scenario rather than pass unseen.
 */
export const scenarioCheckSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('file-exists'), path: virtualFile }),
  z.object({ id, type: z.literal('text-present'), path: virtualFile, pattern }),
  z.object({ id, type: z.literal('text-absent'), path: virtualFile, pattern }),
  z.object({ id, type: z.literal('matches-expected'), path: virtualFile, expected: relativePath }),
  z.object({ id, type: z.literal('json-schema'), path: virtualFile, schema: z.string().min(1) }),
  /** `outcome`: the call the check wants to see — one that succeeded (the default), one that failed, or any. */
  z.object({ id, type: z.literal('tool-called'), tool, outcome: z.enum(TOOL_OUTCOMES).default('success') }),
  z.object({ id, type: z.literal('tool-never-called'), tool }),
  z.object({ id, type: z.literal('stub-received'), role: z.string().min(1).optional(), pattern }),
]);
export type ScenarioCheck = z.infer<typeof scenarioCheckSchema>;

const coveredId = z.string().refine((value) => ID_PATTERNS.AC.test(value) || ID_PATTERNS.IND.test(value) || ID_PATTERNS.INV.test(value), {
  message: 'expected an AC, IND or INV id',
});

export const scenarioSchema = z
  .object({
    schema_version: z.literal(SCENARIO_SCHEMA_VERSION).default(SCENARIO_SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'expected a kebab-case id such as ac-01-nominal'),
    title: z.string().default(''),
    covers: z.array(coveredId).default([]),
    level: z.enum(LEVELS),
    /** A folder of `tests/<slug>/datasets/`, or of `library/datasets/` when shared; null: every point starts empty. */
    dataset: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, 'a dataset is named in kebab-case')
      .nullable()
      .default(null),
    /** Mount point → folder of the dataset; `null` → an empty folder. An absent point takes the folder named after it. */
    bindings: z.record(z.string(), relativePath.nullable()).default({}),
    target: z.object({ task: z.string().min(1).nullable().default(null) }).default({ task: null }),
    /** The reply script of the simulated LLM: inline, or a file next to the scenario. */
    llm_stub: z.union([relativePath, stubScriptSchema]).nullable().default(null),
    human_inputs: z.array(z.unknown()).default([]),
    checks: z.array(scenarioCheckSchema).default([]),
    judges: z.array(z.unknown()).default([]),
    /** How long `orkeon run` may take; `DEFAULT_SCENARIO_TIMEOUT_SECONDS` when absent. */
    timeout_seconds: z.int().positive().optional(),
  })
  .superRefine((scenario, context) => {
    for (const root of Object.keys(scenario.bindings).filter((key) => !VIRTUAL_ROOT_PATTERN.test(key))) {
      context.addIssue({ code: 'custom', path: ['bindings', root], message: 'expected a virtual root such as /workspace' });
    }
    for (const [root, folder] of Object.entries(scenario.bindings)) {
      const refusal = folder === null ? null : bindingRefusal(folder);
      if (refusal !== null) {
        context.addIssue({ code: 'custom', path: ['bindings', root], message: refusal });
      }
    }
    if (scenario.covers.length > 0 && scenario.checks.length === 0) {
      context.addIssue({ code: 'custom', path: ['checks'], message: `the scenario covers ${scenario.covers.join(', ')} and declares no check: a scenario proves an id by a check, never by running` });
    }
    const seen = new Set<string>();
    scenario.checks.forEach((check, index) => {
      if (seen.has(check.id)) {
        context.addIssue({ code: 'custom', path: ['checks', index, 'id'], message: `duplicate check id ${check.id}` });
      }
      seen.add(check.id);
    });
  });
export type Scenario = z.infer<typeof scenarioSchema>;

/**
 * Why a folder of the dataset may not back a mount point, or null when it may: the dataset itself
 * (`.`) would show the team everything, and `expected/` what it is expected to produce.
 */
export function bindingRefusal(folder: string): string | null {
  const segments = folder.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) {
    return `"${folder}" is the dataset itself: bind a mount point to one of its folders, never to all of them (${EXPECTED_FOLDER}/ and the manifest included)`;
  }
  if ((segments[0] as string).toLowerCase() === EXPECTED_FOLDER) {
    return `"${folder}" is where the dataset keeps the expected outputs: the team must not read what it is expected to produce`;
  }
  return null;
}

export const DEFAULT_SCENARIO_TIMEOUT_SECONDS = 300;

export function parseScenario(input: unknown, what = 'scenario'): Scenario {
  return parseWith(scenarioSchema, input, what);
}

/**
 * What a scenario asks for that this version of the bench does not do. Each one fails the scenario:
 * a part of a test that did not run is never reported green.
 */
export function unsupportedParts(scenario: Scenario): string[] {
  const parts: string[] = [];
  if (scenario.target.task !== null) {
    parts.push(`target.task "${scenario.target.task}": isolating one task as a one-task crew is not implemented yet (lot 4) — the whole crew would run`);
  }
  if (scenario.human_inputs.length > 0) {
    parts.push('human_inputs: answering input.needed events is not implemented yet (lot 4)');
  }
  if (scenario.judges.length > 0) {
    parts.push('judges: grades are integrated by `orkeon-bench evaluate` (lot 4), not by this run');
  }
  return parts;
}

/** The mount point a virtual file lies under, and its path below that point. */
export function splitVirtualFile(path: string): { root: string; rest: string } {
  const slash = path.indexOf('/', 1);
  return { root: path.slice(0, slash), rest: path.slice(slash + 1) };
}
