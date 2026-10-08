/**
 * What a settings file may hold that Orkeon accepts and strict JSON does not — or that strict JSON
 * accepts and loses. Orkeon reads its settings with comments and trailing commas allowed, and merges
 * a key written twice; `JSON.parse` — the bench — and `jq` — the run gate — refuse the first two and
 * keep only the last of the third. The bench therefore refuses all three, and says which.
 */
export interface JsonOffence {
  /** 1 for the first line of the text. */
  readonly line: number;
  /** What was found there, in words: `a comment`, `a trailing comma`, `the key "Llm" written twice`. */
  readonly what: string;
}

class NotJson extends Error {}

/**
 * The first thing in `text` that is not strict JSON although Orkeon would read it: a comment, a
 * trailing comma, a key written twice in one object. Null when there is none — the text is strict
 * JSON, or it is no JSON at all, which `JSON.parse` says better.
 */
export function strictJsonOffence(text: string): JsonOffence | null {
  let position = 0;
  let line = 1;
  let offence: JsonOffence | null = null;
  const note = (what: string, at: number = line): void => {
    offence ??= { line: at, what };
  };
  const advance = (count = 1): void => {
    for (let step = 0; step < count; step += 1) {
      if (text[position] === '\n') {
        line += 1;
      }
      position += 1;
    }
  };
  /** Skips blanks and comments; a comment is an offence. */
  const skip = (): void => {
    for (;;) {
      const character = text[position];
      if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
        advance();
      } else if (character === '/' && text[position + 1] === '/') {
        note('a comment');
        while (position < text.length && text[position] !== '\n') {
          advance();
        }
      } else if (character === '/' && text[position + 1] === '*') {
        note('a comment');
        const end = text.indexOf('*/', position + 2);
        if (end === -1) {
          throw new NotJson();
        }
        advance(end + 2 - position);
      } else {
        return;
      }
    }
  };
  const string = (): string => {
    const start = position;
    advance();
    while (position < text.length && text[position] !== '"') {
      if (text[position] === '\n') {
        throw new NotJson();
      }
      advance(text[position] === '\\' ? 2 : 1);
    }
    if (position >= text.length) {
      throw new NotJson();
    }
    advance();
    return text.slice(start + 1, position - 1);
  };
  const value = (): void => {
    skip();
    const character = text[position];
    if (character === '{') {
      advance();
      const keys = new Set<string>();
      let afterComma = false;
      for (;;) {
        skip();
        if (text[position] === '}') {
          if (afterComma) {
            note('a trailing comma');
          }
          advance();
          return;
        }
        if (text[position] !== '"') {
          throw new NotJson();
        }
        const keyLine = line;
        const key = string();
        if (keys.has(key)) {
          note(`the key "${key}" written twice`, keyLine);
        }
        keys.add(key);
        skip();
        if (text[position] !== ':') {
          throw new NotJson();
        }
        advance();
        value();
        skip();
        afterComma = text[position] === ',';
        if (afterComma) {
          advance();
        } else if (text[position] !== '}') {
          throw new NotJson();
        }
      }
    }
    if (character === '[') {
      advance();
      let afterComma = false;
      for (;;) {
        skip();
        if (text[position] === ']') {
          if (afterComma) {
            note('a trailing comma');
          }
          advance();
          return;
        }
        value();
        skip();
        afterComma = text[position] === ',';
        if (afterComma) {
          advance();
        } else if (text[position] !== ']') {
          throw new NotJson();
        }
      }
    }
    if (character === '"') {
      string();
      return;
    }
    // A number or a literal: up to what ends a value.
    const start = position;
    while (position < text.length && !/[\s,\]}/]/.test(text[position] as string)) {
      advance();
    }
    if (position === start) {
      throw new NotJson();
    }
  };
  try {
    if (text.startsWith('﻿')) {
      position = 1;
    }
    value();
    skip();
    return position < text.length ? null : offence;
  } catch (error) {
    // A text nested deeper than the stack is no settings file: `JSON.parse` says what it is.
    if (error instanceof NotJson || error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}

/** How the bench says a file is refused for an offence: the same sentence wherever a settings file is read. */
export function strictJsonRefusal(path: string, offence: JsonOffence): string {
  return `${path} is not strict JSON — line ${String(offence.line)}: ${offence.what}. Orkeon accepts it; the bench and the run gate read a settings file as strict JSON — no comment, no trailing comma, no key written twice — and judge a run on what they read: rewrite the file strictly`;
}

/** Where a text stops being JSON: 1 for the first line and for the first column. */
export interface JsonPosition {
  readonly line: number;
  readonly column: number;
}

/**
 * Where `text` stops being JSON, or null when it is JSON. `JSON.parse` says what it found there
 * by quoting the text around it — and a settings file may hold a key: a message built from this
 * position names the place and shows nothing of the file. Walks the text with a stack of its own,
 * so a file nested without end is refused like any other.
 */
export function jsonSyntaxErrorAt(text: string): JsonPosition | null {
  const containers: ('object' | 'array')[] = [];
  const blank = /[ \t\r\n]*/y;
  const scalar = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/y;
  let position = text.startsWith('﻿') ? 1 : 0;
  const skip = (): void => {
    blank.lastIndex = position;
    blank.exec(text);
    position = blank.lastIndex;
  };
  /** Reads a string, a number or a literal at the position; false when there is none. */
  const take = (stringOnly: boolean): boolean => {
    scalar.lastIndex = position;
    const match = scalar.exec(text);
    if (match === null || (stringOnly && !match[0].startsWith('"'))) {
      return false;
    }
    position = scalar.lastIndex;
    return true;
  };
  let expecting: 'value' | 'key' | 'next' = 'value';
  for (;;) {
    skip();
    const character = text[position];
    if (expecting === 'value') {
      if (character === '{' || character === '[') {
        containers.push(character === '{' ? 'object' : 'array');
        position += 1;
        skip();
        const closes = text[position] === (character === '{' ? '}' : ']');
        if (closes) {
          containers.pop();
          position += 1;
        }
        expecting = closes ? 'next' : character === '{' ? 'key' : 'value';
      } else if (take(false)) {
        expecting = 'next';
      } else {
        break;
      }
    } else if (expecting === 'key') {
      if (!take(true)) {
        break;
      }
      skip();
      if (text[position] !== ':') {
        break;
      }
      position += 1;
      expecting = 'value';
    } else {
      const container = containers.at(-1);
      if (container === undefined) {
        if (position === text.length) {
          return null;
        }
        break;
      }
      if (character === ',') {
        expecting = container === 'object' ? 'key' : 'value';
      } else if (character === (container === 'object' ? '}' : ']')) {
        containers.pop();
      } else {
        break;
      }
      position += 1;
    }
  }
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  return { line, column: position - before.lastIndexOf('\n') };
}
