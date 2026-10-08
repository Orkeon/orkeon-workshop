import { describe, expect, it } from 'vitest';

import { levelOfCell, parseAcceptance } from '../../src/domain/acceptance.js';
import { readAcceptance } from '../../src/domain/workbook/acceptance-rules.js';
import { readMarkdown } from '../../src/domain/workbook/markdown.js';
import { arrayScanWork } from '../fakes/scan-work.js';
import { workbookFixture } from '../fakes/workbook-fixtures.js';

const ACCEPTANCE = `# Mail triage — Acceptance

## Acceptance criteria

| Id | Given (dataset) | When | Then | Level | Status |
|---|---|---|---|---|---|
| AC-01 | nominal | the team runs | one record per mail | L3 e2e local | active |
| AC-02 | empty | the team runs | an empty file | L2 | active |
| AC-03 | old | the team runs | gone | L3 | dropped (DEC-0004) |
| AC-04 | x | y | z | soon | active |
| AC-05 | x | y | z | L3 / L4 | active |
| AC-01 | twice | | | L0 | active |

## Indicators

| Id | Measure | Unit | Threshold | Direction | Level |
|---|---|---|---|---|---|
| IND-01 | acceptance criteria passing | % | 100 | >= | L3 |
| IND-02 | judge score | /5 | to decide | >= | L3 |
| IND-03 | gone | % | 1 | >= | L3 |

## Invariants

| Id | Statement | Check | Level |
|---|---|---|---|
| INV-FS | writes only under its roots | events | L2 |
| INV-07 | own | script | e2e_local |

Free text with AC-09 in it.

| AC-10 | a row without a header above |
`;

describe('levelOfCell', () => {
  it('reads a level as the template writes it', () => {
    const read: [string, string | null][] = [
      ['L0', 'static'],
      ['L0 static', 'static'],
      ['L1 unit', 'unit'],
      ['L2', 'component'],
      ['l2 component', 'component'],
      ['L3 e2e local', 'e2e_local'],
      ['L3 local', 'e2e_local'],
      ['L3 (local model)', 'e2e_local'],
      ['e2e_local', 'e2e_local'],
      ['e2e-remote', 'e2e_remote'],
      ['L4 e2e remote', 'e2e_remote'],
      ['L3 — one unit of work per mail', 'e2e_local'],
      ['component', 'component'],
    ];
    for (const [cell, level] of read) {
      expect(levelOfCell(cell), cell).toBe(level);
    }
  });

  it('reads none where the cell names no level, or more than one', () => {
    for (const cell of ['', 'soon', 'L5', 'L3 / L4', 'L2 then L3', 'component or e2e_local', 'AL3', 'L30']) {
      expect(levelOfCell(cell), cell).toBeNull();
    }
  });
});

describe('parseAcceptance', () => {
  /** The tables of a test under their three headings: `run` reads the tables of the sections, as `check` does. */
  const sectioned = (criteria: string[], indicators: string[] = [], invariants: string[] = []): string =>
    ['## Acceptance criteria', '', ...criteria, '', '## Indicators', '', ...indicators, '', '## Invariants', '', ...invariants].join('\n');

  it('reads the active criteria and the invariants with their level, and the indicators with their threshold', () => {
    const declared = parseAcceptance(ACCEPTANCE);
    expect(declared.acceptance).toEqual([
      { id: 'AC-01', level: 'e2e_local', levelCell: 'L3 e2e local' },
      { id: 'AC-02', level: 'component', levelCell: 'L2' },
      { id: 'AC-04', level: null, levelCell: 'soon' },
      { id: 'AC-05', level: null, levelCell: 'L3 / L4' },
    ]);
    expect(declared.invariants).toEqual([
      { id: 'INV-FS', level: 'component', levelCell: 'L2' },
      { id: 'INV-07', level: 'e2e_local', levelCell: 'e2e_local' },
    ]);
    expect(declared.indicators).toEqual([
      { id: 'IND-01', threshold: 100 },
      { id: 'IND-02', threshold: null },
      { id: 'IND-03', threshold: 1 },
    ]);
    expect(declared.dropped).toEqual(['AC-03']);
  });

  it('knows a dropped row for what it is, unless the id is active in another row', () => {
    const rows = [
      '| Id | Given | When | Then | Level | Status |',
      '|---|---|---|---|---|---|',
      '| AC-07 | x | y | z | L2 | dropped (DEC-0002) |',
      '| AC-07 | twice | y | z | L2 | Dropped |',
      '| AC-08 | x | y | z | L2 | dropped (DEC-0003) |',
      '| AC-08 | again | y | z | L3 | active |',
      '| DEC-0002 | not an id of a report | | | | dropped |',
    ];
    const dropped = ['| Id | Statement | Check | Level | Status |', '|---|---|---|---|---|', '| INV-FS | writes | events | L2 | dropped |'];
    const declared = parseAcceptance(sectioned(rows, [], dropped));
    expect(declared.dropped).toEqual(['AC-07', 'INV-FS']);
    expect(declared.acceptance).toEqual([{ id: 'AC-08', level: 'e2e_local', levelCell: 'L3' }]);
    expect(declared.invariants).toEqual([]);
  });

  it('reads the levels of the template the harness ships', () => {
    const template = sectioned(['| Id | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | | the team runs | | L3 | active |']);
    expect(parseAcceptance(template).acceptance).toEqual([{ id: 'AC-01', level: 'e2e_local', levelCell: 'L3' }]);
  });

  it('reads an id written between back-ticks, as the checks of the workbook do', () => {
    const rows = ['| `Id` | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| `AC-01` | `nominal` | the team runs | x | L3 | active |', '| `AC-02` | `nominal` | the team runs | x | L3 | dropped (DEC-0002) |'];
    expect(parseAcceptance(sectioned(rows))).toMatchObject({ acceptance: [{ id: 'AC-01', level: 'e2e_local', levelCell: 'L3' }], dropped: ['AC-02'] });
  });

  it('leaves out a row inside a comment or a fenced block, and finds a header whatever it adds in brackets', () => {
    const text = sectioned([
      '| Id (never renumbered) | Given (dataset) | When | Then | Level (lowest) | Status |',
      '|---|---|---|---|---|---|',
      '| AC-01 | `nominal` | the team runs | one record \\| one draft | L3 | `active` |',
      '<!--',
      '| AC-08 | `nominal` | the team runs | later | L3 | active |',
      '-->',
      '',
      '```markdown',
      '| Id | Level | Status |',
      '| AC-09 | L3 | active |',
      '```',
    ], ['| Id | Measure | Unit | Threshold | Direction | Level |', '|---|---|---|---|---|---|', '| IND-01 | m | % | `80` | `>=` | L3 |']);
    expect(parseAcceptance(text)).toEqual({ acceptance: [{ id: 'AC-01', level: 'e2e_local', levelCell: 'L3' }], invariants: [], indicators: [{ id: 'IND-01', threshold: 80 }], dropped: [] });
  });

  it('declares nothing outside the three sections, nor in a table that has not the columns of the template', () => {
    const table = ['| Id | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | `nominal` | the team runs | x | L3 | active |'];
    expect(parseAcceptance(table.join('\n')).acceptance).toEqual([]);
    expect(parseAcceptance(`## Summary\n\n${table.join('\n')}`).acceptance).toEqual([]);
    const note = ['', '| Id | Summary |', '|---|---|', '| AC-01 | one record per mail |', '| AC-09 | declared nowhere else |'];
    expect(parseAcceptance(sectioned([...table, ...note])).acceptance).toEqual([{ id: 'AC-01', level: 'e2e_local', levelCell: 'L3' }]);
    expect(parseAcceptance(sectioned([], table)).acceptance).toEqual([]);
  });

  it('reads a row without its closing pipe, and an id with a remark after it', () => {
    const rows = ['| Id | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---', '| AC-01 (R-01) | `nominal` | the team runs | x | L2 | active', '| `AC-02` (new) | `nominal` | the team runs | x | L3 | dropped (DEC-0002) — was `active`'];
    expect(parseAcceptance(sectioned(rows))).toMatchObject({ acceptance: [{ id: 'AC-01', level: 'component', levelCell: 'L2' }], dropped: ['AC-02'] });
  });

  it('finds nothing in a file without tables', () => {
    expect(parseAcceptance('# Acceptance\r\n\r\nTBD\r\n|\r\n')).toEqual({ acceptance: [], invariants: [], indicators: [], dropped: [] });
  });
});

describe('the two readers of ACCEPTANCE.md', () => {
  const BASE = workbookFixture('clean/workbook/ACCEPTANCE.md');
  /** What `orkeon-bench run` and `orkeon-bench check` each read of the same file: ids, levels, thresholds, dropped rows. */
  const both = (text: string) => {
    const run = parseAcceptance(text);
    const check = readAcceptance(readMarkdown(text)).ids;
    return {
      run: { criteria: run.acceptance.map((row) => [row.id, row.level]), invariants: run.invariants.map((row) => [row.id, row.level]), indicators: run.indicators.map((row) => [row.id, row.threshold]), dropped: run.dropped },
      check: { criteria: check.criteria.map((row) => [row.id, row.level]), invariants: check.invariants.map((row) => [row.id, row.level]), indicators: check.indicators.map((row) => [row.id, row.threshold]), dropped: check.dropped },
    };
  };
  const VARIANTS: [string, (text: string) => string][] = [
    ['as written', (text) => text],
    ['a back-ticked status', (text) => text.replace('| dropped (DEC-0002) |', '| `dropped (DEC-0002)` |')],
    ['a status with a remark', (text) => text.replace('| dropped (DEC-0002) |', '| dropped (DEC-0002) — remplacé par AC-01 |')],
    ['a back-ticked threshold and direction', (text) => text.replace('| % | 80 | >= |', '| % | `80` | `>=` |')],
    ['an escaped pipe in Then', (text) => text.replace('holds an empty list', 'holds `[]` \\| an empty list')],
    ['a row inside a comment', (text) => text.replace('\n## Indicators', '<!--\n| AC-09 | `nominal` | the team runs | later | L3 | active |\n-->\n\n## Indicators')],
    ['a row inside a fenced block', (text) => text.replace('\n## Indicators', '```\n| Id | Level | Status |\n| AC-09 | L3 | active |\n```\n\n## Indicators')],
    ['ids and headers between back-ticks', (text) => text.replaceAll('| Id |', '| `Id` |').replace(/^\| ((?:AC|IND|INV)-[A-Z0-9]+) \|/gm, '| `$1` |')],
    ['an id with a remark', (text) => text.replace('| AC-02 |', '| `AC-02` (new) |')],
    ['headers with a remark', (text) => text.replaceAll('| Id |', '| Id (never renumbered) |').replaceAll('| Level |', '| Level (lowest) |').replace('| Threshold |', '| Threshold (number) |')],
    ['levels written long', (text) => text.replace('| L2 | active |', '| L2 component (simulated LLM) | active |').replace('| pattern scan | L2 |', '| pattern scan | `L2` |')],
    ['CRLF and a byte order mark', (text) => `\uFEFF${text.replace(/\n/g, '\r\n')}`],
    ['a summary table before the sections', (text) => text.replace('## Acceptance criteria', '| Id | Summary |\n|---|---|\n| AC-01 | one record per mail |\n| AC-04 | drafts longer than 200 characters |\n| IND-02 | accuracy |\n\n## Acceptance criteria')],
    ['a table of the author’s own that repeats declared ids', (text) => text.replace('\n## Invariants', '\n| Id | Why this threshold |\n|---|---|\n| IND-02 | 80 % |\n\n## Invariants')],
    ['a row without its closing pipe', (text) => text.replace('| L2 | active |', '| L2 | active')],
    ['a header in bold', (text) => text.replaceAll('| Id |', '| **Id** |')],
    ['a status that opens with active and quotes the old one', (text) => text.replace('| L0 | active |', '| L0 | active (was `dropped (DEC-0002)`, restored) |')],
    ['a dropped status that quotes the old one', (text) => text.replace('| dropped (DEC-0002) |', '| dropped (DEC-0002) — was `active` |')],
  ];

  it.each(VARIANTS)('read the same ids, levels, thresholds and dropped rows: %s', (_name, vary) => {
    const text = vary(BASE);
    const read = both(text);
    expect(read.run).toEqual(read.check);
    expect(read.check).toEqual({
      criteria: [['AC-01', 'e2e_local'], ['AC-02', 'component'], ['AC-03', 'static']],
      invariants: [['INV-FS', 'component'], ['INV-SECRETS', 'component'], ['INV-TOOLS', 'component'], ['INV-BUDGET', 'e2e_local'], ['INV-INCR', 'component'], ['INV-INJECTION', 'e2e_local'], ['INV-01', 'component']],
      indicators: [['IND-01', 100], ['IND-02', 80]],
      dropped: ['AC-04'],
    });
    expect(readAcceptance(readMarkdown(text)).findings).toEqual([]);
  });
});

describe('the two readers of ACCEPTANCE.md, where a file is not what the template asks', () => {
  const BASE = workbookFixture('clean/workbook/ACCEPTANCE.md');
  const ids = (text: string) => {
    const run = parseAcceptance(text);
    const check = readAcceptance(readMarkdown(text));
    return {
      run: [...run.acceptance, ...run.invariants, ...run.indicators].map((row) => row.id),
      check: [...check.ids.criteria, ...check.ids.invariants, ...check.ids.indicators].map((row) => row.id),
      dropped: [run.dropped, check.ids.dropped],
      codes: check.findings.map((finding) => finding.code),
    };
  };

  it('declare neither an id that only a table of the author’s own holds, and the check says so', () => {
    const read = ids(BASE.replace('\n## Invariants', '\n| Id | Why this threshold |\n|---|---|\n| IND-02 | 80 % |\n| IND-03 | none yet |\n\n## Invariants'));
    expect(read.run).toEqual(read.check);
    expect(read.run).not.toContain('IND-03');
    expect(read.codes).toEqual(['ind-incomplete']);
  });

  it('declare neither a criterion written under another section', () => {
    const read = ids(BASE.replace('\n## Invariants', '\n| Id | Given (dataset) | When | Then | Level | Status |\n|---|---|---|---|---|---|\n| AC-09 | `nominal` | the team runs | x | L3 | active |\n\n## Invariants'));
    expect(read.run).toEqual(read.check);
    expect(read.run).not.toContain('AC-09');
    expect(read.codes).toEqual(['ind-incomplete']);
  });

  it('declare nothing of a table that stands before any of the three headings', () => {
    const read = ids(BASE.replace('## Acceptance criteria\n', '').replace('## Indicators', '## Acceptance criteria\n\n## Indicators'));
    expect(read.run).toEqual(read.check);
    expect(read.run).not.toContain('AC-01');
    expect(read.dropped).toEqual([[], []]);
    expect(read.codes).toEqual(['ac-none']);
  });

  it('read a table whose Id column is not the first', () => {
    const shifted = BASE.replace(/^\| Id \|/gm, '| # | Id |').replace(/^\|---\|/gm, '|---|---|').replace(/^\| ((?:AC|IND|INV)-)/gm, '| 1 | $1');
    const read = ids(shifted);
    expect(read.run).toEqual(read.check);
    expect(read.run).toEqual(['AC-01', 'AC-02', 'AC-03', 'INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET', 'INV-INCR', 'INV-INJECTION', 'INV-01', 'IND-01', 'IND-02']);
    expect(read.codes).toEqual([]);
  });

  it('look no id up in the list of the ids before it: four times the rows, four times the work', () => {
    // Counted, not timed: the reader of `run` once looked each id up in the list of the ids already read — n²/2 steps, half a minute for 100 000 rows —, and four times the rows were sixteen times the work.
    const text = (count: number): string =>
      ['## Acceptance criteria', '', '| Id | Given | When | Then | Level | Status |', '|---|---|---|---|---|---|', ...Array.from({ length: count }, (_, index) => `| AC-${String(10_000 + index)} | \`nominal\` | the team runs | x | L3 | active |`)].join('\n');
    const work = (count: number): number => {
      const markdown = text(count);
      let read = 0;
      const steps = arrayScanWork(() => {
        read = parseAcceptance(markdown).acceptance.length;
      });
      expect(read).toBe(count);
      return steps;
    };
    const [small, large] = [work(1_000), work(4_000)];
    expect(small).toBeGreaterThan(1_000);
    expect(large / small).toBeLessThan(6);
  });
});
