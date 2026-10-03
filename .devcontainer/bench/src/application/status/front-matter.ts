import { parse as parseYaml } from 'yaml';

import { ApplicationError } from '../errors.js';

export interface FrontMatterDocument {
  /** The parsed YAML block (a mapping, or whatever the block holds). */
  readonly data: unknown;
  /** The Markdown after the closing `---`. */
  readonly body: string;
}

const FENCE = /^---[ \t]*\r?\n/;

/** Splits a Markdown file starting with a `---` YAML block from the text that follows. */
export function parseFrontMatter(text: string): FrontMatterDocument {
  const normalized = text.startsWith('﻿') ? text.slice(1) : text;
  if (!FENCE.test(normalized)) {
    throw new ApplicationError('invalid-input', 'no YAML front matter: the file must start with a "---" line');
  }
  const afterOpening = normalized.replace(FENCE, '');
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(afterOpening);
  if (closing === null) {
    throw new ApplicationError('invalid-input', 'unterminated YAML front matter: closing "---" line not found');
  }
  const yamlBlock = afterOpening.slice(0, closing.index);
  const body = afterOpening.slice(closing.index + closing[0].length);
  try {
    return { data: parseYaml(yamlBlock), body };
  } catch (error) {
    throw new ApplicationError('invalid-input', `front matter is not valid YAML: ${(error as Error).message}`);
  }
}

/** Log lines of a STATUS.md body: the `- ` bullets, trimmed. */
export function logLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}
