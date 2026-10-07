import { describe, expect, it } from 'vitest';

import { strictJsonOffence, strictJsonRefusal } from '../../src/domain/strict-json.js';

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
