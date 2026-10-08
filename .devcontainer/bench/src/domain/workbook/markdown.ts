/**
 * The Markdown of a workbook artefact, as the checks read it: fenced blocks marked and comments
 * removed, then sections by heading and tables by header. Nothing here knows which artefact it
 * reads. An artefact is written by a model, often with a remark beside a value: the cell readers
 * below say what the value is, and what is a remark.
 */

/** A line of an artefact once its comments are removed. */
export interface MarkdownLine {
  readonly text: string;
  /** Inside a fenced block, the two fence lines included: neither a heading nor a table row. */
  readonly fenced: boolean;
}

export interface MarkdownSection {
  /** The heading text without its `#` marks. */
  readonly heading: string;
  /** The number of `#` marks: 2 for a section, 3 for a batch sheet, 4 for a part of a sheet. */
  readonly depth: number;
  /** What lies under the heading, up to the next heading of the same depth or above. */
  readonly lines: readonly MarkdownLine[];
}

export interface MarkdownDocument {
  readonly lines: readonly MarkdownLine[];
  /** The `## ` sections, in the order of the file. */
  readonly sections: readonly MarkdownSection[];
}

/** A table row with the headers of its table: a cell is found by header text, never by position. */
export interface TableRow {
  /** The headers, back-ticks removed, in lower case. */
  readonly headers: readonly string[];
  readonly cells: readonly string[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * The runs of back-ticks of a line, each with the run of the same length that follows it — what
 * closes the code span it opens —, found in one pass from the end: a line of thousands of runs of
 * as many lengths is read once, not once per run.
 */
function tickRuns(line: string): Map<number, { end: number; close: number }> {
  const starts: number[] = [];
  for (let at = line.indexOf('`'); at !== -1; ) {
    let end = at;
    while (line[end] === '`') {
      end += 1;
    }
    starts.push(at, end);
    at = line.indexOf('`', end);
  }
  const runs = new Map<number, { end: number; close: number }>();
  const next = new Map<number, number>();
  for (let index = starts.length - 2; index >= 0; index -= 2) {
    const start = starts[index] as number;
    const end = starts[index + 1] as number;
    runs.set(start, { end, close: next.get(end - start) ?? -1 });
    next.set(end - start, start);
  }
  return runs;
}

/**
 * The lines of an artefact: fenced blocks marked first, then the HTML comments removed outside
 * the fences and outside the inline code spans — `` `<!--` `` in a sentence opens nothing. A
 * comment may span lines, which stay as blank lines; a `<!--` that is never closed is plain text,
 * not a comment to the end of the file.
 */
function scan(markdown: string): MarkdownLine[] {
  const source = (markdown.startsWith('﻿') ? markdown.slice(1) : markdown).split(/\r?\n/);
  let lastClose = { line: -1, column: -1 };
  for (let index = source.length - 1; index >= 0 && lastClose.line === -1; index -= 1) {
    const column = (source[index] as string).lastIndexOf('-->');
    if (column !== -1) {
      lastClose = { line: index, column };
    }
  }
  const lines: MarkdownLine[] = [];
  let fence: string | null = null;
  let commented = false;
  source.forEach((raw, index) => {
    const marker = commented ? null : FENCE.exec(raw);
    if (fence !== null) {
      lines.push({ text: raw, fenced: true });
      if (marker !== null && (marker[1] as string).startsWith(fence) && (marker[2] as string).trim() === '') {
        fence = null;
      }
      return;
    }
    if (marker !== null) {
      fence = marker[1] as string;
      lines.push({ text: raw, fenced: true });
      return;
    }
    let text = '';
    let position = 0;
    let tick = raw.indexOf('`');
    let open = raw.indexOf('<!--');
    const runs = tick === -1 ? null : tickRuns(raw);
    while (position < raw.length) {
      if (commented) {
        const close = raw.indexOf('-->', position);
        commented = close === -1;
        position = close === -1 ? raw.length : close + 3;
        continue;
      }
      tick = tick !== -1 && tick < position ? raw.indexOf('`', position) : tick;
      open = open !== -1 && open < position ? raw.indexOf('<!--', position) : open;
      if (open !== -1 && (tick === -1 || open < tick)) {
        commented = lastClose.line > index || (lastClose.line === index && lastClose.column >= open + 4);
        text += raw.slice(position, commented ? open : open + 4);
        position = open + 4;
      } else if (tick !== -1) {
        // A code span runs to the next run of as many back-ticks; without one, the run is plain text.
        const run = runs?.get(tick) ?? { end: tick + 1, close: -1 };
        const next = run.close === -1 ? run.end : run.close + (run.end - tick);
        text += raw.slice(position, next);
        position = next;
      } else {
        text += raw.slice(position);
        position = raw.length;
      }
    }
    lines.push({ text, fenced: false });
  });
  return lines;
}

/** The text of an artefact without its HTML comments: those of the fenced blocks and of the code spans stay. */
export function stripComments(markdown: string): string {
  return textOf(scan(markdown));
}

/** Reads an artefact: a byte order mark skipped, fenced blocks marked, comments removed. */
export function readMarkdown(markdown: string): MarkdownDocument {
  const lines = scan(markdown);
  return { lines, sections: sectionsOf(lines, 2) };
}

/** The heading a line is, or null: `## Agents` is `{ depth: 2, text: 'Agents' }`. */
export function headingOf(line: MarkdownLine): { depth: number; text: string } | null {
  if (line.fenced || !line.text.startsWith('#')) {
    return null;
  }
  let depth = 0;
  while (line.text[depth] === '#') {
    depth += 1;
  }
  const after = line.text[depth];
  if (depth > 6 || (after !== ' ' && after !== '\t')) {
    return null;
  }
  const text = line.text.slice(depth).trim();
  // A closing run of `#`, after a blank: `## Title ##`.
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') {
    end -= 1;
  }
  const closed = end < text.length && (end === 0 || text[end - 1] === ' ' || text[end - 1] === '\t');
  return { depth, text: closed ? text.slice(0, end).trimEnd() : text };
}

/** The sections a heading of `depth` opens among `lines`; each ends at the next heading of that depth or above. */
export function sectionsOf(lines: readonly MarkdownLine[], depth: number): MarkdownSection[] {
  const sections: { heading: string; depth: number; lines: MarkdownLine[] }[] = [];
  let current: MarkdownLine[] | null = null;
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading !== null && heading.depth <= depth) {
      current = heading.depth === depth ? [] : null;
      if (current !== null) {
        sections.push({ heading: heading.text, depth, lines: current });
      }
    } else {
      current?.push(line);
    }
  }
  return sections;
}

/** The first section of that heading, or null. */
export function sectionNamed(sections: readonly MarkdownSection[], heading: string): MarkdownSection | null {
  return sections.find((section) => section.heading === heading) ?? null;
}

/** The lines of a section before its first sub-heading. */
export function ownLines(section: MarkdownSection): MarkdownLine[] {
  const end = section.lines.findIndex((line) => headingOf(line) !== null);
  return end === -1 ? [...section.lines] : section.lines.slice(0, end);
}

export function textOf(lines: readonly MarkdownLine[]): string {
  return lines.map((line) => line.text).join('\n');
}

/**
 * The cells of a table line, outside a fenced block: a line that opens with `|`, its closing `|`
 * being optional, as a renderer reads it. Cells are trimmed, `\|` is a pipe inside a cell; null for
 * any other line.
 */
export function tableCells(line: MarkdownLine): string[] | null {
  const text = line.text.trim();
  if (line.fenced || !text.startsWith('|')) {
    return null;
  }
  const cells: string[] = [];
  let cell = '';
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index] as string;
    if (character === '\\' && text[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  // What follows the last pipe is a cell when the row is not closed, and nothing when it is.
  if (cell.trim() !== '' || cells.length === 0) {
    cells.push(cell.trim());
  }
  return cells;
}

/** A header as the readers compare it: back-ticks and emphasis marks removed, blanks collapsed, in lower case. */
export function normalizeHeader(header: string): string {
  return header.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A table: its headers, and its rows but the blank ones. */
export interface MarkdownTable {
  readonly headers: readonly string[];
  readonly rows: readonly TableRow[];
}

/**
 * The tables among `lines`: consecutive table lines, the first the header, a separator line
 * skipped, the rest rows. A row whose cells are all empty — the blank row of a template — is left
 * out.
 */
export function tablesOf(lines: readonly MarkdownLine[]): MarkdownTable[] {
  const tables: { headers: string[]; rows: TableRow[] }[] = [];
  let table: { headers: string[]; rows: TableRow[] } | null = null;
  for (const line of lines) {
    const cells = tableCells(line);
    if (cells === null) {
      table = null;
    } else if (table === null) {
      table = { headers: cells.map(normalizeHeader), rows: [] };
      tables.push(table);
    } else if (!cells.every((cell) => /^:?-+:?$/.test(cell)) && cells.some((cell) => cell !== '')) {
      table.rows.push({ headers: table.headers, cells });
    }
  }
  return tables;
}

/** The rows of every table among `lines`. */
export function tableRows(lines: readonly MarkdownLine[]): TableRow[] {
  return tablesOf(lines).flatMap((table) => table.rows);
}

/** Where a header stands among the headers of a table, whatever its case and whatever the template or the author adds in brackets: `Kind` finds `Kind (built-in / custom)`. */
function columnAmong(headers: readonly string[], header: string): number {
  const wanted = normalizeHeader(header);
  return headers.findIndex((candidate) => candidate === wanted || candidate.startsWith(`${wanted} (`));
}

function carries(headers: readonly string[], key: string, others: readonly string[]): boolean {
  return columnAmong(headers, key) !== -1 && (others.length === 0 || others.some((other) => columnAmong(headers, other) !== -1));
}

/**
 * The rows of the tables that carry the columns of a rule: the `key` column and, when `others`
 * names some, one of them at least.
 */
export function rowsWith(lines: readonly MarkdownLine[], key: string, others: readonly string[] = []): TableRow[] {
  return tablesOf(lines)
    .filter((table) => carries(table.headers, key, others))
    .flatMap((table) => table.rows);
}

/**
 * The rows of the tables that have the `key` column of a rule and none of its `others`: tables the
 * rule does not read. One of the author's own may repeat what a read table declares; what it
 * alone declares is declared nowhere (`strayFindings`).
 */
export function strayRows(lines: readonly MarkdownLine[], key: string, others: readonly string[]): TableRow[] {
  return tablesOf(lines)
    .filter((table) => columnAmong(table.headers, key) !== -1 && !carries(table.headers, key, others))
    .flatMap((table) => table.rows);
}

/** The cell of a row under a header, as written; empty when the table has no such column. */
export function cell(row: TableRow, header: string): string {
  return row.cells[columnAmong(row.headers, header)] ?? '';
}

/** A text without its back-ticks. */
export function unquote(text: string): string {
  return text.replaceAll('`', '').trim();
}

/** The spans a text writes between back-ticks, in order. */
export function backTicked(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => (match[1] as string).trim());
}

/**
 * The value of a cell that holds one: the back-ticked span it opens with — what follows is a
 * remark, `` `claude` (named profile) `` is `claude` —, otherwise the cell as written. A span
 * further in the cell belongs to a remark and rescues nothing: `` openai (like `claude`) `` is
 * not `claude`.
 */
export function valueOf(text: string): string {
  const opening = /^`([^`]+)`/.exec(text.trim());
  return opening === null ? unquote(text) : (opening[1] as string).trim();
}

/** What may follow a value before a remark: a blank, a bracket, a comma, a colon. */
const REMARK = /^[\s(,;:]/;

/**
 * The id or the name a cell holds: the back-ticked span it opens with, otherwise the word it
 * opens with — `reader (the only one to read /mailbox)` is `reader`.
 */
export function wordOf(text: string): string {
  const value = valueOf(text);
  return /^`/.test(text.trim()) ? value : (/^[^\s(,;:]*/.exec(value)?.[0] ?? value);
}

/**
 * The value of a cell that holds one word of a closed list. A remark after the word is accepted,
 * with or without back-ticks — `ro (read only)` is `ro`, and so is `` `ro` (never changed) `` —,
 * but the word itself is not loosened, and a remark does not replace it: `read-only` and
 * `` not `ro`: `rw` `` are returned as written, for the rule to refuse.
 */
export function choiceOf(text: string, choices: readonly string[]): string {
  const value = valueOf(text);
  const longestFirst = [...choices].sort((a, b) => b.length - a.length);
  return longestFirst.find((choice) => value === choice || (value.startsWith(choice) && REMARK.test(value.slice(choice.length)))) ?? value;
}

/**
 * The value of a cell that must match `shape` — a pattern anchored at its start —, a remark after
 * it accepted: `dropped (DEC-0002) — replaced by AC-01` is `dropped (DEC-0002)`. The cell's own
 * value, as written, when it does not match.
 */
export function shapedValueOf(text: string, shape: RegExp): string {
  const value = valueOf(text);
  const match = shape.exec(value);
  return match !== null && match.index === 0 && (match[0].length === value.length || REMARK.test(value.slice(match[0].length))) ? match[0] : value;
}

/** The words by which a cell or a section says it holds nothing, in lower case. */
const EMPTY_WORDS = ['', '—', '-', '–', 'n/a', 'none', 'none.', 'aucun', 'aucune', 'aucun.', 'aucune.'];

/**
 * Whether a cell says nothing: blank, a dash, `n/a`, `none`, `None.`, `Aucun.` — alone, with its
 * reason in brackets or after a colon: `— (no schema yet)` and `None: the task only reads` are
 * as empty as `—`. What the reason names is no value of the cell.
 */
export function isEmptyCell(text: string): boolean {
  return EMPTY_WORDS.includes(
    unquote(text)
      .replace(/\s*(?:\([^()]*\)\s*|:\s.*)$/s, '')
      .toLowerCase(),
  );
}

/** The words that join two names in a sentence: no name themselves. */
const CONNECTORS = ['and', '&', '+', 'et', 'ou', 'or'];

/** A word shaped like an identifier with a separator — `email_parse`, `read-file`: outside back-ticks, still a name. */
const IDENTIFIER = /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/;

/** Whether a word has the shape of an identifier with a separator. */
export function isIdentifier(word: string): boolean {
  return IDENTIFIER.test(word);
}

/** The words of a text, split on blanks, `,` `;` `/` `→` and `<br>`, without the emphasis marks and the punctuation around them. */
function wordsOf(text: string): string[] {
  return text
    .split(/(?:<br\s*\/?>|[\s,;/→])+/i)
    .map((word) => word.replace(/^[*"'[]+/, '').replace(/[*"'\].:!?]+$/, ''))
    .filter((word) => word !== '');
}

/** A stretch of a cell: between back-ticks or not, inside brackets or not. */
export interface Piece {
  readonly text: string;
  readonly quoted: boolean;
  readonly bracketed: boolean;
}

/** The stretches of a cell, in order: its back-ticked spans and what stands between them, each known to be inside brackets or not. */
export function piecesOf(text: string): Piece[] {
  const pieces: Piece[] = [];
  let depth = 0;
  let start = 0;
  const plain = (end: number): void => {
    if (end > start) {
      pieces.push({ text: text.slice(start, end), quoted: false, bracketed: depth > 0 });
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const close = character === '`' ? text.indexOf('`', index + 1) : -1;
    if (close !== -1) {
      plain(index);
      pieces.push({ text: text.slice(index + 1, close), quoted: true, bracketed: depth > 0 });
      index = close;
      start = close + 1;
    } else if (character === '(' || character === ')') {
      plain(index);
      depth = character === '(' ? depth + 1 : Math.max(0, depth - 1);
      start = index + 1;
    }
  }
  plain(text.length);
  return pieces;
}

/**
 * The names a cell lists (the tools of an agent, the dependencies of a task, the agents that use
 * a tool). `known` holds the names of that kind that exist. A remark may hide a word nobody knows;
 * it never hides a known name.
 *
 * - Without a back-tick outside brackets, the names are the words of the cell: split on blanks,
 *   `,` `;` `/` `→` and `<br>`, the connectors (`and`, `et`, `ou`…) left out.
 * - With back-ticked spans, the names are the spans — but a virtual path, which is no name — plus
 *   any word outside them that is a known name, or has the shape of an identifier (`email_parse`):
 *   a plain word is a remark, and a name is not hidden by leaving its back-ticks out.
 * - What stands in brackets is a remark, back-ticked or not: it names only the known names it
 *   holds — `(email_send as a last resort)` names the tool, `` (the `.eml` files only) `` nothing.
 * - A cell whose first word says it is empty (`—`, `none`, `Aucune`…) is read the second way
 *   whatever follows: `none (first task)` names nothing.
 */
export function namesIn(text: string, known: ReadonlySet<string> = new Set()): string[] {
  const names = new Set<string>();
  const pieces = piecesOf(text);
  const first = (unquote(text).split(/[\s,;(]+/)[0] ?? '').toLowerCase();
  const marked = EMPTY_WORDS.includes(first) || pieces.some((piece) => piece.quoted && !piece.bracketed);
  for (const piece of pieces) {
    const words = piece.quoted && piece.text.trim().startsWith('/') ? [] : wordsOf(piece.text);
    for (const word of words) {
      const named = piece.bracketed
        ? known.has(word)
        : piece.quoted
          ? !EMPTY_WORDS.includes(word.toLowerCase())
          : marked
            ? known.has(word) || IDENTIFIER.test(word)
            : !CONNECTORS.includes(word.toLowerCase());
      if (named) {
        names.add(word);
      }
    }
  }
  return [...names];
}

/**
 * Whether lines hold nothing: no text, and no table with a row — a table reduced to its header
 * and the blank row of the template says nothing. A heading is a title, not content.
 */
export function holdsNothing(lines: readonly MarkdownLine[]): boolean {
  const prose = lines.some((line) => line.text.trim() !== '' && tableCells(line) === null && headingOf(line) === null);
  return !prose && tableRows(lines).length === 0;
}

/**
 * Whether lines open by saying there is nothing to say — `None.`, `N/A`, `Not applicable.`,
 * `Aucun.` —, with or without a reason after it. `None of the tasks…` is a sentence, not that.
 */
export function saysNone(lines: readonly MarkdownLine[]): boolean {
  const first = lines.find((line) => line.text.trim() !== '');
  return first !== undefined && /^(?:none|n\/a|not applicable|aucune?|sans objet)\s*(?:[.:,;(—–]|$)/i.test(first.text.trim().replace(/^[*_]+/, ''));
}
