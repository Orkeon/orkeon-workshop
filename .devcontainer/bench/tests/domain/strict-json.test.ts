import { describe, expect, it } from 'vitest';

import { jsonSyntaxErrorAt, strictJsonOffence, strictJsonRefusal } from '../../src/domain/strict-json.js';

describe('strictJsonOffence', () => {
  it('finds nothing in strict JSON, whatever it holds', () => {
    const strict = [
      '{}',
      '[]',
      '  {"Llm": {"BaseUrl": "http://localhost:11434", "Profiles": {}}, "n": -1.5e3, "t": true, "f": false, "z": null}\n',
      '{"url": "https://example.com/a//b", "text": "/* not a comment */", "quote": "a \\" b // c", "list": [1, [2, {"a": 1}], "x,]"]}',
      '{"Llm": 1, "LLM": 2, "a": {"Llm": 3}, "b": {"Llm": 4}}',
      '﻿{"a": 1}',
      '"a string"',
      '12',
    ];
    for (const text of strict) {
      expect(strictJsonOffence(text), text).toBeNull();
      expect(() => JSON.parse(text.replace('﻿', '')) as unknown, text).not.toThrow();
    }
  });

  it('names the first comment, trailing comma or key written twice, with its line', () => {
    const offences: [string, number, string][] = [
      ['{\n  // the model\n  "Llm": {}\n}', 2, 'a comment'],
      ['{ "Llm": {} /* inline */ }', 1, 'a comment'],
      ['{\n  "Llm": {\n    "Model": "m",\n  }\n}', 4, 'a trailing comma'],
      ['{"list": [1, 2,\n]}', 2, 'a trailing comma'],
      ['{\n  "Llm": {"Model": "a"},\n  "Other": 1,\n  "Llm": {"BaseUrl": "x"}\n}', 4, 'the key "Llm" written twice'],
      ['{"a": {"b": 1, "c": {"d": 1,\n "d": 2}}}', 2, 'the key "d" written twice'],
      ['{\n  "a": 1, // first\n  "a": 2,\n}', 2, 'a comment'],
    ];
    for (const [text, line, what] of offences) {
      expect(strictJsonOffence(text), text).toEqual({ line, what });
    }
  });

  it('leaves to JSON.parse what is no JSON at all', () => {
    for (const text of ['{ not json', '', '{"a": }', '{"a" 1}', '[1 2]', '{"a": "unterminated', '{"a": 1} trailing', '/* never closed', '{"a": 1,, "b": 2}', '{"multi\nline": 1}']) {
      expect(strictJsonOffence(text), text).toBeNull();
      expect(() => JSON.parse(text) as unknown, text).toThrow();
    }
  });

  it('says why the bench refuses what Orkeon reads', () => {
    expect(strictJsonRefusal('/ws/settings/demo/appsettings.json', { line: 2, what: 'a comment' })).toBe(
      '/ws/settings/demo/appsettings.json is not strict JSON — line 2: a comment. Orkeon accepts it; the bench and the run gate read a settings file as strict JSON — no comment, no trailing comma, no key written twice — and judge a run on what they read: rewrite the file strictly',
    );
  });
});

describe('jsonSyntaxErrorAt', () => {
  it('finds nothing wrong in JSON, whatever JSON.parse accepts', () => {
    for (const text of ['{}', '[]', ' { "a": [1, -2.5e3, true, false, null, "x\\n\\u00e9"], "b": { "c": {} } } ', '"alone"', '0', '\uFEFF{"a": 1}\n']) {
      expect(() => JSON.parse(text.replace('\uFEFF', '')) as unknown, text).not.toThrow();
      expect(jsonSyntaxErrorAt(text), text).toBeNull();
    }
  });

  it('gives the line and the column where a text stops being JSON, and nothing of the text', () => {
    const at: [string, number, number][] = [
      ['', 1, 1],
      ['{', 1, 2],
      ['{ "a": }', 1, 8],
      ['{ "a": 1,\n  "b": sk-secret\n}', 2, 8],
      ['{ "a": 1 "b": 2 }', 1, 10],
      ['[1, 2,]', 1, 7],
      ['{ "a": 01 }', 1, 9],
      ['{ a: 1 }', 1, 3],
      ['{ "a": "unterminated }', 1, 8],
      ['{} trailing', 1, 4],
      ['[1] [2]', 1, 5],
      ["{ 'a': 1 }", 1, 3],
    ];
    for (const [text, line, column] of at) {
      expect(() => JSON.parse(text) as unknown, text).toThrow(SyntaxError);
      expect(jsonSyntaxErrorAt(text), text).toEqual({ line, column });
    }
  });

  it('walks a text nested without end, as strictJsonOffence gives up on one', () => {
    expect(jsonSyntaxErrorAt('['.repeat(300_000))).toEqual({ line: 1, column: 300_001 });
    expect(strictJsonOffence('['.repeat(300_000))).toBeNull();
    expect(jsonSyntaxErrorAt(`${'['.repeat(100_000)}${']'.repeat(100_000)}`)).toBeNull();
  });
});
