import { z } from 'zod';

import { DomainError } from './errors.js';
import { parseWith } from './schema.js';

/** A tool name of the catalogue, as agents reference it. */
const TOOL_NAME = /^[a-z0-9_]+$/;

const propertySchema = z.looseObject({
  type: z.unknown().optional(),
  description: z.string().optional(),
});

/** One entry of the `tools[]` of a chat-completions request, the shape `orkeon run` sends. */
const toolEntrySchema = z.looseObject({
  type: z.literal('function'),
  function: z.looseObject({
    name: z.string().regex(TOOL_NAME, 'a tool name is snake_case'),
    description: z.string().default(''),
    parameters: z
      .looseObject({
        properties: z.record(z.string(), propertySchema).default({}),
        required: z.array(z.string()).default([]),
      })
      .optional(),
  }),
});

const recordedRequestSchema = z.looseObject({ tools: z.array(toolEntrySchema).default([]) });

export interface ToolArgument {
  readonly name: string;
  readonly required: boolean;
  /** The JSON Schema `type`, `a|b` for a union, null when the schema gives none. */
  readonly type: string | null;
  readonly description: string | null;
}

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  /** In the order of the schema's `properties`; empty when the model is told of no argument. */
  readonly arguments: readonly ToolArgument[];
  /** The entry as `orkeon run` sent it (extra keys kept), for `--json`. */
  readonly entry: unknown;
}

/** True when a recorded request body carries a non-empty `tools[]`. */
export function hasTools(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || !('tools' in body)) {
    return false;
  }
  const tools = (body as { tools: unknown }).tools;
  return Array.isArray(tools) && tools.length > 0;
}

/** The tools of one recorded request body, sorted by name. */
export function parseRecordedTools(body: unknown): ToolSchema[] {
  const request = parseWith(recordedRequestSchema, body, 'recorded request');
  return request.tools
    .map((entry): ToolSchema => {
      const parameters = entry.function.parameters;
      const required = new Set(parameters?.required ?? []);
      return {
        name: entry.function.name,
        description: entry.function.description,
        arguments: Object.entries(parameters?.properties ?? {}).map(([name, property]) => ({
          name,
          required: required.has(name),
          type: typeName(property.type),
          description: property.description ?? null,
        })),
        entry,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function typeName(type: unknown): string | null {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type) && type.every((part) => typeof part === 'string')) {
    return type.join('|');
  }
  return null;
}

/** A Markdown table of the tools: name, arguments (required ones in bold), description. */
export function renderToolTable(tools: readonly ToolSchema[]): string {
  const lines = ['| Tool | Arguments | What it does |', '|---|---|---|'];
  for (const tool of tools) {
    const args =
      tool.arguments.length === 0
        ? 'none in the schema'
        : tool.arguments.map((argument) => (argument.required ? `**\`${argument.name}\`**` : `\`${argument.name}\``)).join(', ');
    lines.push(`| \`${tool.name}\` | ${args} | ${cell(tool.description)} |`);
  }
  return lines.join('\n');
}

function cell(text: string): string {
  return text.split(/\s+/).join(' ').trim().replaceAll('|', '\\|');
}

export interface CrewFile {
  /** Relative to the folder of the throw-away crew. */
  readonly path: string;
  readonly content: string;
}

/**
 * The files of a throw-away crew whose single agent lists `names`: running it once makes
 * `orkeon run` send the schema of every one of those tools in its first model request.
 */
export function toolDumpCrew(names: readonly string[]): CrewFile[] {
  if (names.length === 0) {
    throw new DomainError('no tool to record: orkeon run --list-tools listed none');
  }
  const invalid = names.filter((name) => !TOOL_NAME.test(name));
  if (invalid.length > 0) {
    throw new DomainError('invalid tool names', invalid);
  }
  return [
    { path: 'crew/config.yaml', content: 'name: tool-dump\ngoal: "Record the tool schemas"\nprocess: sequential\n' },
    {
      path: 'crew/agents/recorder.yaml',
      content: [
        'role: "Recorder"',
        'goal: "Answer OK"',
        'backstory: "Answers OK."',
        'allowDelegation: false',
        'maxIter: 1',
        'tools:',
        ...names.map((name) => `  - ${name}`),
        '',
      ].join('\n'),
    },
    { path: 'crew/tasks/answer.yaml', content: 'description: "Answer OK."\nexpectedOutput: "OK"\nagent: recorder\n' },
  ];
}
