import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { hasTools, parseRecordedTools, renderToolTable, toolDumpCrew } from '../../src/domain/tool-schema.js';

const FILE_READ = {
  type: 'function',
  function: {
    name: 'file_read',
    description: 'Read content from files.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'The file path' }, max_length: { type: 'integer', format: 'int32' } },
      required: ['path'],
    },
  },
};
const MEMORY_STORE = { type: 'function', function: { name: 'memory_store', description: 'List | add memories.', parameters: { type: 'object', properties: {}, required: [] } } };

describe('parseRecordedTools', () => {
  it('reads name, description and arguments in schema order, sorted by tool name', () => {
    const tools = parseRecordedTools({ model: 'stub-model', tools: [MEMORY_STORE, FILE_READ] });
    expect(tools.map((tool) => tool.name)).toEqual(['file_read', 'memory_store']);
    expect(tools[0]?.arguments).toEqual([
      { name: 'path', required: true, type: 'string', description: 'The file path' },
      { name: 'max_length', required: false, type: 'integer', description: null },
    ]);
    expect(tools[1]?.arguments).toEqual([]);
  });

  it('keeps the entry as sent, extra keys included', () => {
    const [tool] = parseRecordedTools({ tools: [FILE_READ] });
    expect(tool?.entry).toMatchObject({ function: { parameters: { properties: { max_length: { format: 'int32' } } } } });
  });

  it('accepts a tool without parameters and a union type', () => {
    const tools = parseRecordedTools({
      tools: [
        { type: 'function', function: { name: 'list_mounts' } },
        { type: 'function', function: { name: 'json_tool', parameters: { properties: { input: { type: ['string', 'object'] } }, required: ['input'] } } },
      ],
    });
    expect(tools.map((tool) => [tool.name, tool.description, tool.arguments])).toEqual([
      ['json_tool', '', [{ name: 'input', required: true, type: 'string|object', description: null }]],
      ['list_mounts', '', []],
    ]);
  });

  it('refuses a body that is not a chat-completions request with tools of type function', () => {
    expect(() => parseRecordedTools({ tools: [{ type: 'retrieval' }] })).toThrow(DomainError);
    expect(() => parseRecordedTools({ tools: [{ type: 'function', function: { name: 'Bad-Name' } }] })).toThrow(/snake_case/);
  });
});

describe('hasTools', () => {
  it('is true only for a body with a non-empty tools array', () => {
    expect(hasTools({ tools: [FILE_READ] })).toBe(true);
    expect(hasTools({ tools: [] })).toBe(false);
    expect(hasTools({ messages: [] })).toBe(false);
    expect(hasTools(null)).toBe(false);
  });
});

describe('renderToolTable', () => {
  it('bolds the required arguments, says when the schema has none, escapes pipes', () => {
    expect(renderToolTable(parseRecordedTools({ tools: [FILE_READ, MEMORY_STORE] }))).toBe(
      [
        '| Tool | Arguments | What it does |',
        '|---|---|---|',
        '| `file_read` | **`path`**, `max_length` | Read content from files. |',
        '| `memory_store` | none in the schema | List \\| add memories. |',
      ].join('\n'),
    );
  });
});

describe('toolDumpCrew', () => {
  it('writes a crew whose single agent lists every tool', () => {
    const files = toolDumpCrew(['file_read', 'web_search']);
    expect(files.map((file) => file.path)).toEqual(['crew/config.yaml', 'crew/agents/recorder.yaml', 'crew/tasks/answer.yaml']);
    expect(files[1]?.content).toContain('tools:\n  - file_read\n  - web_search\n');
    expect(files[2]?.content).toContain('agent: recorder');
  });

  it('refuses an empty list and a name that is not snake_case', () => {
    expect(() => toolDumpCrew([])).toThrow(/listed none/);
    expect(() => toolDumpCrew(['file_read', 'rm -rf'])).toThrow(DomainError);
  });
});
