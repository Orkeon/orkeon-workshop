import { describe, expect, it } from 'vitest';

import { levelOfCell, parseAcceptance } from '../../src/domain/acceptance.js';

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
  it('reads the active criteria and the invariants with their level, and the indicators with their threshold', () => {
    const declared = parseAcceptance(ACCEPTANCE);
    expect(declared.acceptance).toEqual([
      { id: 'AC-01', level: 'e2e_local', levelCell: 'L3 e2e local' },
      { id: 'AC-02', level: 'component', levelCell: 'L2' },
      { id: 'AC-04', level: null, levelCell: 'soon' },
      { id: 'AC-05', level: null, levelCell: 'L3 / L4' },
      { id: 'AC-10', level: null, levelCell: '' },
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
      '| INV-FS | writes | events | | L2 | dropped |',
      '| DEC-0002 | not an id of a report | | | | dropped |',
    ].join('\n');
    const declared = parseAcceptance(rows);
    expect(declared.dropped).toEqual(['AC-07', 'INV-FS']);
    expect(declared.acceptance).toEqual([{ id: 'AC-08', level: 'e2e_local', levelCell: 'L3' }]);
    expect(declared.invariants).toEqual([]);
  });

  it('reads the levels of the template the harness ships', () => {
    const template = ['| Id | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-01 | | the team runs | | L3 | active |'].join('\n');
    expect(parseAcceptance(template).acceptance).toEqual([{ id: 'AC-01', level: 'e2e_local', levelCell: 'L3' }]);
  });

  it('finds nothing in a file without tables', () => {
    expect(parseAcceptance('# Acceptance\r\n\r\nTBD\r\n|\r\n')).toEqual({ acceptance: [], invariants: [], indicators: [], dropped: [] });
  });
});
