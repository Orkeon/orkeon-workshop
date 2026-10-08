import { describe, expect, it } from 'vitest';

import {
  backTicked,
  cell,
  choiceOf,
  headingOf,
  holdsNothing,
  isEmptyCell,
  namesIn,
  ownLines,
  readMarkdown,
  rowsWith,
  saysNone,
  sectionNamed,
  sectionsOf,
  stripComments,
  tableRows,
  tablesOf,
  textOf,
  shapedValueOf,
  strayRows,
  unquote,
  valueOf,
  wordOf,
} from '../../../src/domain/workbook/markdown.js';
import { indexOfCalls } from '../../fakes/scan-work.js';

const lines = (markdown: string) => readMarkdown(markdown).lines;

/**
 * What one pass over a megabyte may take on the slowest machine that runs these tests, a whole
 * suite beside it: a minute. A pass takes well under a second where this was written; a rescan
 * per mark takes a quarter of an hour or more. The bound is far from both, so that it says how
 * the code scales, never how loaded the machine is.
 */
const ONE_PASS_MS = 60_000;

describe('stripComments', () => {
  it('removes a comment on one line and on several, whose lines stay as blank lines', () => {
    expect(stripComments('a <!-- b --> c')).toBe('a  c');
    expect(stripComments('a\n<!-- b\n## Not a heading\n-->\nc')).toBe('a\n\n\n\nc');
    expect(stripComments('a <!-- b --> c <!-- d\n--> e')).toBe('a  c \n e');
  });

  it('takes a <!-- that is never closed for plain text, not for a comment to the end of the file', () => {
    expect(stripComments('a\n<!-- b\n## Budget\n\n| Kind | Limit |')).toBe('a\n<!-- b\n## Budget\n\n| Kind | Limit |');
    expect(stripComments('a <!-- b --> c <!-- d\n## Kept')).toBe('a  c <!-- d\n## Kept');
  });

  it('opens no comment inside an inline code span or a fenced block', () => {
    const text = ['or after `<!--` in an HTML body', '', '## Judges', '', '```html', '<!-- kept -->', '```', '', 'the mark ``<!--`` and its end `-->`, then <!-- a real one --> gone'].join('\n');
    expect(stripComments(text)).toBe(text.replace('<!-- a real one -->', ''));
    expect(readMarkdown(text).sections.map((section) => section.heading)).toEqual(['Judges']);
    // A back-tick without its pair opens no span: the comment after it is one.
    expect(stripComments('a ` b <!-- c --> d')).toBe('a ` b  d');
  });

  /**
   * A million marks on one line, in one pass: a third of a second on the machine this was written
   * on. A reader that looked for the end of each comment from each opening mark took a minute for
   * a tenth of them, and would take hours here: the bound is a minute, far from both.
   */
  it(
    'reads a line of a million comment marks, closed or not, in one pass',
    () => {
      const started = Date.now();
      expect(stripComments('<!--'.repeat(1_000_000))).toHaveLength(4_000_000);
      expect(stripComments('<!-- -->'.repeat(500_000))).toBe('');
      expect(stripComments('`a'.repeat(500_000))).toHaveLength(1_000_000);
      expect(Date.now() - started).toBeLessThan(ONE_PASS_MS);
    },
    2 * ONE_PASS_MS,
  );

  it('searches a line of back-tick runs of as many lengths once per run, not once per pair of runs', () => {
    // None of these runs closes another: each used to be looked for to the end of the line — a million searches for 2000 runs.
    const count = 2_000;
    const runs = Array.from({ length: count }, (_, index) => `${'`'.repeat(index + 1)}x`).join(' ');
    let stripped = '';
    const calls = indexOfCalls(() => {
      stripped = stripComments(`${runs} <!-- gone -->`);
    });
    expect(stripped).toBe(`${runs} `);
    expect(calls).toBeLessThan(4 * count);
  });
});

describe('readMarkdown', () => {
  const document = readMarkdown(
    ['﻿# Title', '', '> a note', '', '## First', '<!-- ## Hidden', '-->', 'text', '', '```mermaid', '## Not a heading', '| not | a row |', '```', '', '## Second ##', '### B1', '#### Intent', 'x', '### B2', 'y', '## Third'].join('\r\n'),
  );

  it('reads the ## sections in order, without the comments, a byte order mark or a fenced heading', () => {
    expect(document.sections.map((section) => section.heading)).toEqual(['First', 'Second', 'Third']);
    expect(document.lines[0]).toEqual({ text: '# Title', fenced: false });
    expect(textOf(sectionNamed(document.sections, 'First')!.lines)).toContain('## Not a heading');
    expect(sectionNamed(document.sections, 'Hidden')).toBeNull();
  });

  it('marks the lines of a fenced block, its two fences included', () => {
    const fenced = document.lines.filter((line) => line.fenced).map((line) => line.text);
    expect(fenced).toEqual(['```mermaid', '## Not a heading', '| not | a row |', '```']);
    expect(tableRows(document.lines)).toEqual([]);
  });

  it('closes a fence only on a fence of the same kind, at least as long', () => {
    const fences = lines(['````', '```', '## in', '````', '## out', '~~~ts', '```', '~~~', '## out too'].join('\n'));
    expect(fences.filter((line) => headingOf(line) !== null).map((line) => line.text)).toEqual(['## out', '## out too']);
  });

  it('splits a section into sheets, and a sheet into its parts', () => {
    const second = sectionNamed(document.sections, 'Second')!;
    const sheets = sectionsOf(second.lines, 3);
    expect(sheets.map((sheet) => [sheet.heading, sheet.depth, textOf(sheet.lines)])).toEqual([
      ['B1', 3, '#### Intent\nx'],
      ['B2', 3, 'y'],
    ]);
    expect(sectionsOf(sheets[0]!.lines, 4).map((part) => [part.heading, textOf(part.lines)])).toEqual([['Intent', 'x']]);
    expect(ownLines(second)).toEqual([]);
    expect(textOf(ownLines(sectionNamed(document.sections, 'First')!))).toContain('text');
  });

  it('reads a heading without its marks, and nothing of a line that is none', () => {
    expect(headingOf({ text: '### B2 ###', fenced: false })).toEqual({ depth: 3, text: 'B2' });
    expect(headingOf({ text: '## C#', fenced: false })).toEqual({ depth: 2, text: 'C#' });
    expect(headingOf({ text: '##No space', fenced: false })).toBeNull();
    expect(headingOf({ text: '## Fenced', fenced: true })).toBeNull();
    expect(headingOf({ text: '####### Seven', fenced: false })).toBeNull();
    expect(headingOf({ text: '##', fenced: false })).toBeNull();
    expect(headingOf({ text: '## ##', fenced: false })).toEqual({ depth: 2, text: '' });
    expect(headingOf({ text: '## A # B #', fenced: false })).toEqual({ depth: 2, text: 'A # B' });
  });

  /**
   * A heading line of a million blanks: a few milliseconds. The pattern it was read with before
   * took 5 seconds for 80 000 blanks and four times as long for twice as many — a quarter of an
   * hour here: the bound is a minute, far from both.
   */
  it(
    'reads a heading line of a million blanks in one pass',
    () => {
      const started = Date.now();
      expect(headingOf({ text: `## x${' '.repeat(1_000_000)}y`, fenced: false })?.text).toHaveLength(1_000_002);
      expect(headingOf({ text: `## x${' #'.repeat(500_000)}b`, fenced: false })?.depth).toBe(2);
      expect(Date.now() - started).toBeLessThan(ONE_PASS_MS);
    },
    2 * ONE_PASS_MS,
  );
});

describe('tables', () => {
  const table = lines(
    [
      '| Id | Given (dataset) | `Kind` (built-in / custom) | Notes |',
      '|---|:---:|---|---|',
      '| `AC-01` | `nominal` | built-in | a \\| b |',
      '| | | | |',
      '| AC-02 | | custom |',
      '',
      'prose',
      '| Risk | Mitigation |',
      '| slow | wait |',
    ].join('\n'),
  );

  it('reads rows by header: the separator and the blank row of a template are no rows', () => {
    const rows = tableRows(table);
    expect(rows.map((row) => row.cells)).toEqual([['`AC-01`', '`nominal`', 'built-in', 'a | b'], ['AC-02', '', 'custom'], ['slow', 'wait']]);
    expect(rows[0]!.headers).toEqual(['id', 'given (dataset)', 'kind (built-in / custom)', 'notes']);
  });

  it('finds a column whatever its case, and with what the template adds in brackets', () => {
    const [first, second] = rowsWith(table, 'ID');
    expect(cell(first!, 'id')).toBe('`AC-01`');
    expect(cell(first!, 'Given')).toBe('`nominal`');
    expect(cell(first!, 'Given (dataset)')).toBe('`nominal`');
    expect(cell(first!, 'Kind')).toBe('built-in');
    expect(cell(second!, 'Notes')).toBe('');
    expect(cell(second!, 'No such column')).toBe('');
  });

  it('keeps the tables that have the key column only', () => {
    expect(rowsWith(table, 'Risk').map((row) => row.cells)).toEqual([['slow', 'wait']]);
    expect(rowsWith(table, 'Given (data')).toEqual([]);
  });

  it('keeps, of the tables that share a key, those that carry a column of the rule', () => {
    const lines2 = lines(['| Id | Measure | Threshold |', '|---|---|---|', '| IND-01 | m | 1 |', '', '| Id | Why this threshold |', '|---|---|', '| IND-01 | the user said so |'].join('\n'));
    expect(rowsWith(lines2, 'Id').map((row) => row.cells[1])).toEqual(['m', 'the user said so']);
    expect(rowsWith(lines2, 'Id', ['Measure', 'Unit']).map((row) => row.cells[1])).toEqual(['m']);
    expect(rowsWith(lines2, 'Id', ['Statement'])).toEqual([]);
  });

  it('reads a second line that is no separator as a row', () => {
    expect(tableRows(lines('| Id |\n| AC-01 |')).map((row) => row.cells)).toEqual([['AC-01']]);
    expect(tableRows(lines('| Id |'))).toEqual([]);
  });

  it('reads a row without its closing pipe, as a renderer does', () => {
    const open = lines(['| Id | Then | Level', '|---|---|---', '| AC-01 | one record \\| one draft | L3', '| AC-02 | an empty list | L2 |', '| | |', '| AC-03 |'].join('\n'));
    const rows = tableRows(open);
    expect(rows.map((row) => row.cells)).toEqual([['AC-01', 'one record | one draft', 'L3'], ['AC-02', 'an empty list', 'L2'], ['AC-03']]);
    expect(cell(rows[0]!, 'Level')).toBe('L3');
    expect(tableRows(lines('not | a row\n|'))).toEqual([]);
  });

  it('groups the rows by table, and tells the tables a rule does not read', () => {
    const two = lines(['| Tool | Kind |', '|---|---|', '| a | built-in |', '', '| Tool | Type |', '|---|---|', '| b | built-in |', '', '| Name |', '|---|', '| c |'].join('\n'));
    expect(tablesOf(two).map((table) => [table.headers, table.rows.length])).toEqual([[['tool', 'kind'], 1], [['tool', 'type'], 1], [['name'], 1]]);
    expect(rowsWith(two, 'Tool', ['Kind']).map((row) => row.cells[0])).toEqual(['a']);
    expect(strayRows(two, 'Tool', ['Kind']).map((row) => row.cells[0])).toEqual(['b']);
    expect(strayRows(two, 'Name', [])).toEqual([]);
    expect(tablesOf(lines('| **Id** | `Level` (lowest) |\n|---|---|\n| x | L2 |'))[0]?.headers).toEqual(['id', 'level (lowest)']);
  });
});

describe('cells', () => {
  it('reads an id or a name without its back-ticks', () => {
    expect(unquote(' `AC-01` ')).toBe('AC-01');
  });

  it.each(['', '—', '-', '–', 'n/a', 'N/A', 'none', 'None.', '`—`', 'Aucun', 'aucune', 'Aucun.'])('takes "%s" for an empty cell', (text) => {
    expect(isEmptyCell(text)).toBe(true);
  });

  it.each(['— (pas de schéma pour l’instant)', 'none (first task)', '`—` (à préciser)', 'Aucun : la tâche lit `/mailbox` et `/state/registry.json`', 'None: the task only reads', '— (lit `/mailbox`, n’écrit rien)'])('takes "%s" for an empty cell: its reason stands in brackets or after a colon', (text) => {
    expect(isEmptyCell(text)).toBe(true);
  });

  it.each(['0', 'no', 'None of them', '— none', '- the file exists', 'none of the records (see R-04)', 'the file: none', 'none:x'])('takes "%s" for a cell that says something', (text) => {
    expect(isEmptyCell(text)).toBe(false);
  });

  it('reads the value of a cell: the back-ticked span it opens with, or the cell — a span further on is a remark', () => {
    expect(valueOf('`claude` (profil nommé de bench.config.json)')).toBe('claude');
    expect(valueOf('`reader` (seul à lire `/mailbox`)')).toBe('reader');
    expect(valueOf('registry update')).toBe('registry update');
    expect(valueOf('openai (comme `claude`)')).toBe('openai (comme claude)');
    expect(valueOf('the `stub` profile')).toBe('the stub profile');
    expect(valueOf('')).toBe('');
  });

  it('reads an id or a name by what the cell opens with: a span, or a word', () => {
    for (const [text, word] of [['`AC-01` (R-01)', 'AC-01'], ['AC-01 (R-01)', 'AC-01'], ['reader (seul à lire `/mailbox`)', 'reader'], ['/mailbox (courriels)', '/mailbox'], ['email_send (SMTP)', 'email_send'], ['nominal, 12 mails', 'nominal'], ['writer (replaces `sorter`)', 'writer'], ['**AC-01**', '**AC-01**'], ['`a b` c', 'a b'], ['', '']] as const) {
      expect(wordOf(text), text).toBe(word);
    }
  });

  it('accepts a remark after a word of a closed list, and does not loosen the word', () => {
    const accesses = ['ro', 'rw', 'rwnd'];
    for (const [text, value] of [['ro', 'ro'], ['`ro` (jamais modifié)', 'ro'], ['rw (écrit par `file_write`)', 'rw'], ['`rw` (ro in NEED)', 'rw'], ['the `rw` one', 'the rw one'], ['pas `ro` : `rw`', 'pas ro : rw'], ['openai (comme `ro`)', 'openai (comme ro)'], ['ro, then rw', 'ro'], ['ro (lecture seule)', 'ro'], ['rwnd, no delete', 'rwnd'], ['rw: the registry', 'rw'], ['read-only', 'read-only'], ['row', 'row'], ['RO', 'RO'], ['ro/rw', 'ro/rw'], ['', '']] as const) {
      expect(choiceOf(text, accesses), text).toBe(value);
    }
  });

  it('accepts a remark after a value of a given shape', () => {
    const status = /^(?:active|dropped \(DEC-\d{4}\))/;
    expect(shapedValueOf('dropped (DEC-0002) — remplacé par AC-01', status)).toBe('dropped (DEC-0002)');
    expect(shapedValueOf('`dropped (DEC-0002)`', status)).toBe('dropped (DEC-0002)');
    expect(shapedValueOf('active (since gate 2)', status)).toBe('active');
    expect(shapedValueOf('actively kept', status)).toBe('actively kept');
    expect(shapedValueOf('Active', status)).toBe('Active');
    expect(shapedValueOf('12 (5 lots de 2 appels + marge)', /^[0-9]+/)).toBe('12');
    expect(shapedValueOf('2.5', /^[0-9]+/)).toBe('2.5');
    expect(shapedValueOf('3–5', /^[0-9]+/)).toBe('3–5');
    expect(shapedValueOf('active (was `dropped (DEC-0002)`, restored by DEC-0005)', status)).toBe('active');
    expect(shapedValueOf('dropped (DEC-0002) — was `active`', status)).toBe('dropped (DEC-0002)');
    expect(shapedValueOf('to drop, was `active`', status)).toBe('to drop, was active');
  });

  it('lists the names of a cell without back-ticks: its words, without the connectors and what stands in brackets', () => {
    expect(namesIn('file_read, file_write  json_tool')).toEqual(['file_read', 'file_write', 'json_tool']);
    expect(namesIn('reader and drafter; sorter & checker')).toEqual(['reader', 'drafter', 'sorter', 'checker']);
    expect(namesIn('email_parser, file_read (lecture seule)')).toEqual(['email_parser', 'file_read']);
    expect(namesIn('email_parser<br>file_read / file_write')).toEqual(['email_parser', 'file_read', 'file_write']);
    expect(namesIn('parse_mails et classify, ou sort')).toEqual(['parse_mails', 'classify', 'sort']);
    expect(namesIn('parse_mails → classify.')).toEqual(['parse_mails', 'classify']);
    expect(namesIn('**email_parse**, **file_read**')).toEqual(['email_parse', 'file_read']);
    expect(backTicked('`edge`, case `edge-empty-body` and plain')).toEqual(['edge', 'edge-empty-body']);
  });

  it('names, of what stands in brackets, the known names only — back-ticked or not', () => {
    const tools = new Set(['email_send', 'file_write']);
    expect(namesIn('email_parser, file_read (email_send en dernier recours)', tools)).toEqual(['email_parser', 'file_read', 'email_send']);
    expect(namesIn('sorter (et reader pour les réponses)', new Set(['reader']))).toEqual(['sorter', 'reader']);
    expect(namesIn('email_parser (lecture (email_send exclu ? non)), file_read', tools)).toEqual(['email_parser', 'email_send', 'file_read']);
    expect(namesIn('`email_parser`, `file_read` (les fichiers `.eml` seulement)', tools)).toEqual(['email_parser', 'file_read']);
    expect(namesIn('`parse_mails`, `classify` (ses `records`)', new Set(['parse_mails', 'classify']))).toEqual(['parse_mails', 'classify']);
    expect(namesIn('`reader`, `drafter` (via `file_write` ensuite)', new Set(['reader', 'drafter']))).toEqual(['reader', 'drafter']);
    expect(namesIn('`email_parser` (via `file_write` ensuite)', tools)).toEqual(['email_parser', 'file_write']);
    // A back-ticked span in a remark does not turn a plain list into a quoted one: the unknown word is still a name.
    expect(namesIn('reader, nobody (see `README.md`)', new Set(['reader']))).toEqual(['reader', 'nobody']);
  });

  it('takes a cell for empty by its first word, whatever follows', () => {
    for (const text of ['', '—', '-', 'n/a', 'None.', 'none (first task)', 'Aucune', 'Aucun.', 'aucune dépendance : première tâche', '`—`', 'none, it is the first task']) {
      expect(namesIn(text, new Set(['parse', 'classify'])), text).toEqual([]);
    }
    // What follows the empty word names nothing — unless it is a name that exists: nothing hides behind a dash.
    expect(namesIn('none, but classify first', new Set(['parse', 'classify']))).toEqual(['classify']);
  });

  it('takes the back-ticked spans of a cell for its names, and the words around them for remarks', () => {
    expect(namesIn('`file_read` (read only), `file_write` for the report')).toEqual(['file_read', 'file_write']);
    expect(namesIn('`reader` and `drafter`, not sorter')).toEqual(['reader', 'drafter']);
    expect(namesIn('`email_parser`, `file_read` (lecture seule de `/mailbox`)')).toEqual(['email_parser', 'file_read']);
    expect(namesIn('`file_read`, `file_write`')).toEqual(['file_read', 'file_write']);
  });

  it('still reads, beside back-ticked names, a word that is a known name or has the shape of an identifier', () => {
    const catalogue = new Set(['email_send', 'reader']);
    expect(namesIn('`email_parser`, `file_read`, plus email_send and email_parse pour les réponses', catalogue)).toEqual(['email_parser', 'file_read', 'email_send', 'email_parse']);
    expect(namesIn('`sorter`, then reader', catalogue)).toEqual(['sorter', 'reader']);
    expect(namesIn('`sorter`, then drafter', catalogue)).toEqual(['sorter']);
    // In brackets a known name still counts — nothing is hidden there —, the shape alone does not: `(read-only)` is a remark.
    expect(namesIn('`file_read` (read-only, never email_send)', catalogue)).toEqual(['file_read', 'email_send']);
    expect(namesIn('`—`, draft_replies', new Set(['draft_replies']))).toEqual(['draft_replies']);
    expect(namesIn('`parse_mails` (lui-même, en boucle), puis draft_replies')).toEqual(['parse_mails', 'draft_replies']);
  });
});

describe('holdsNothing and saysNone', () => {
  it('finds nothing in blanks, a comment, a sub-heading or a table without a row', () => {
    for (const text of ['', '\n\n', '<!-- to fill -->', '#### Intent', '| Id | Role |\n|---|---|\n| | |']) {
      expect(holdsNothing(lines(text)), text).toBe(true);
    }
  });

  it('finds something in a sentence, a row or a diagram', () => {
    for (const text of ['None.', '| Id |\n|---|\n| a |', '```mermaid\nflowchart LR\n```']) {
      expect(holdsNothing(lines(text)), text).toBe(false);
    }
  });

  it('reads None. at the start of a section, with or without its reason', () => {
    for (const text of ['None.', '\nnone', 'None. Every run starts from scratch.', 'None: every criterion has an oracle.', 'N/A', 'Not applicable.', 'Aucun.', 'Aucune (chaque exécution repart de zéro)', '**None.**', 'Sans objet.']) {
      expect(saysNone(lines(text)), text).toBe(true);
    }
    for (const text of ['', 'None of the tasks resumes.', 'Nonetheless', 'The registry. None.', 'Not applicable to the first run only', 'Aucun registre hors de `/state`']) {
      expect(saysNone(lines(text)), text).toBe(false);
    }
  });
});
