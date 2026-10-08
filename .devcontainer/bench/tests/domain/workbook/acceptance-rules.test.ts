import { describe, expect, it } from 'vitest';

import { ALWAYS_INVARIANTS, INVARIANT_CATALOGUE, citedIds, declaredIds, idsAtLevel, readAcceptance, undeclared } from '../../../src/domain/workbook/acceptance-rules.js';
import { readMarkdown } from '../../../src/domain/workbook/markdown.js';

const ALWAYS = ['| INV-FS | writes under its roots | events | L2 |', '| INV-SECRETS | no secret | scan | L2 |', '| INV-TOOLS | declared tools only | events | L2 |', '| INV-BUDGET | under the cap | manifest | L3 |'];

function acceptance(criteria: string[], indicators: string[] = [], invariants: string[] = ALWAYS): string {
  return [
    '## Acceptance criteria',
    '',
    '| Id | Given (dataset) | When | Then | Level | Status |',
    '|---|---|---|---|---|---|',
    ...criteria,
    '',
    '## Indicators',
    '',
    '| Id | Measure | Unit | Threshold | Direction | Level |',
    '|---|---|---|---|---|---|',
    ...indicators,
    '',
    '## Invariants',
    '',
    '| Id | Statement | Check | Level |',
    '|---|---|---|---|',
    ...invariants,
  ].join('\n');
}

function read(criteria: string[], indicators?: string[], invariants?: string[]) {
  return readAcceptance(readMarkdown(acceptance(criteria, indicators, invariants)));
}

const AC_01 = '| AC-01 | `nominal` | the team runs | one record per mail | L3 | active |';

describe('readAcceptance', () => {
  it('reads the three tables without a finding, ids in back-ticks included', () => {
    const reading = read([AC_01, '| `AC-02` | the crew definition | the static checks run | no mail tool | L0 static | active |'], ['| IND-01 | criteria passing | % | 99.5 | >= | L3 |', '| IND-02 | wall time | s | 1200 | `<=` | e2e_local |'], [...ALWAYS, '| INV-01 | own | script | L2 |']);
    expect(reading.findings).toEqual([]);
    expect(reading.ids).toEqual({
      criteria: [
        { id: 'AC-01', level: 'e2e_local', given: '`nominal`' },
        { id: 'AC-02', level: 'static', given: 'the crew definition' },
      ],
      indicators: [
        { id: 'IND-01', level: 'e2e_local', threshold: 99.5 },
        { id: 'IND-02', level: 'e2e_local', threshold: 1200 },
      ],
      invariants: [
        { id: 'INV-FS', level: 'component' },
        { id: 'INV-SECRETS', level: 'component' },
        { id: 'INV-TOOLS', level: 'component' },
        { id: 'INV-BUDGET', level: 'e2e_local' },
        { id: 'INV-01', level: 'component' },
      ],
      dropped: [],
    });
  });

  it('refuses an id of the wrong shape, of another family, or missing — and counts none of them as declared', () => {
    const reading = read([AC_01, '| AC-2 | `nominal` | runs | x | L3 | active |', '| IND-04 | `nominal` | runs | x | L3 | active |', '| | `nominal` | runs | x | L3 | active |'], [], [...ALWAYS, '| INV-fs | x | y | L2 |']);
    expect(reading.findings.map((finding) => [finding.code, finding.section, finding.message])).toEqual([
      ['id-malformed', 'Acceptance criteria', '`AC-2` is not an acceptance criterion id (`AC-nn`, two digits or more)'],
      ['id-malformed', 'Acceptance criteria', '`IND-04` is not an acceptance criterion id (`AC-nn`, two digits or more): it belongs in `## Indicators`'],
      ['id-malformed', 'Acceptance criteria', 'row 4 has no id'],
      ['id-malformed', 'Invariants', '`INV-fs` is not an invariant id (`INV-nn`, or `INV-<NAME>` of the catalogue)'],
    ]);
    expect(reading.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01']);
  });

  it('refuses an id written on two rows, across the tables, and keeps the first', () => {
    const reading = read([AC_01, '| AC-01 | `nominal` | runs twice | x | L2 | active |'], ['| IND-01 | a | % | 1 | >= | L3 |', '| IND-01 | b | % | 2 | >= | L4 |']);
    expect(reading.findings.map((finding) => [finding.code, finding.section])).toEqual([
      ['id-duplicate', 'Acceptance criteria'],
      ['id-duplicate', 'Indicators'],
    ]);
    expect(reading.ids.criteria).toEqual([{ id: 'AC-01', level: 'e2e_local', given: '`nominal`' }]);
    expect(reading.ids.indicators).toEqual([{ id: 'IND-01', level: 'e2e_local', threshold: 1 }]);
  });

  it('reads a dropped row for its id and its status only', () => {
    const reading = read([AC_01, '| AC-02 | | | | soon | dropped (DEC-0004) |', '| AC-03 | | | | | dropped |', '| AC-1 | | | | | Dropped (DEC-0005) |']);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([
      ['ac-status', 'AC-03: `Status` `dropped` — neither `active` nor `dropped (DEC-nnnn)`'],
      ['id-malformed', '`AC-1` is not an acceptance criterion id (`AC-nn`, two digits or more)'],
      ['ac-status', 'AC-1: `Status` `Dropped (DEC-0005)` — neither `active` nor `dropped (DEC-nnnn)`'],
    ]);
    expect(reading.ids.dropped).toEqual(['AC-02', 'AC-03']);
    expect(reading.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01']);
  });

  it('reads a status, a threshold, a direction and an id with a remark or back-ticks beside them', () => {
    const reading = read(
      ['| `AC-01` (the main one) | `nominal` | the team runs | one record \\| one draft | `L3` | active (since gate 2) |', '| AC-02 | x | y | z | L3 | `dropped (DEC-0002)` |', '| AC-03 | x | y | z | L3 | dropped (DEC-0003) — remplacé par AC-01 |'],
      ['| IND-01 | m | % | `99.5` | `>=` (higher is better) | L3 |'],
    );
    expect(reading.findings).toEqual([]);
    expect(reading.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01']);
    expect(reading.ids.indicators).toEqual([{ id: 'IND-01', level: 'e2e_local', threshold: 99.5 }]);
    expect(reading.ids.dropped).toEqual(['AC-02', 'AC-03']);
    // The word itself is not loosened.
    expect(read(['| AC-01 | `nominal` | runs | x | L3 | Active |', '| AC-02 | `nominal` | runs | x | L3 | activated |']).findings.map((finding) => finding.code)).toEqual(['ac-status', 'ac-status']);
  });

  it('lets a table of the author’s own repeat a declared id, and refuses an id that table alone holds', () => {
    const note = ['', '| Id | Why this threshold |', '|---|---|', '| IND-01 | 80 % : seuil donné par l’utilisateur |', '| AC-01 | see above |', '| not an id | ignored |'];
    const repeated = readAcceptance(readMarkdown(acceptance([AC_01], ['| IND-01 | m | % | 80 | >= | L3 |', ...note])));
    expect(repeated.findings).toEqual([]);
    expect(repeated.ids.indicators.map((indicator) => indicator.id)).toEqual(['IND-01']);

    const alone = readAcceptance(readMarkdown(acceptance([AC_01], ['| IND-01 | m | % | 80 | >= | L3 |', ...note, '| IND-09 | declared nowhere |', '| `AC-07` (later) | declared nowhere |'])));
    expect(alone.ids.indicators.map((indicator) => indicator.id)).toEqual(['IND-01']);
    expect(alone.findings).toEqual([
      { severity: 'error', code: 'ind-incomplete', artefact: 'ACCEPTANCE.md', section: 'Indicators', message: "`IND-09` and `AC-07` stand in a table that is not the template's — it has no `Measure` or `Threshold` column: they are not declared" },
    ]);
  });

  it('refuses a table whose headers are not the template’s: its ids are declared nowhere', () => {
    const renamed = acceptance([AC_01], ['| IND-01 | m | % | 80 | >= | L3 |']).replace('| Id | Measure | Unit | Threshold | Direction | Level |', '| Id | Indicator | Unit | Target | Direction | Level |');
    const reading = readAcceptance(readMarkdown(renamed));
    expect(reading.ids.indicators).toEqual([]);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([['ind-incomplete', "`IND-01` stands in a table that is not the template's — it has no `Measure` or `Threshold` column: it is not declared"]]);
    // A criteria table under another heading, and an invariant table with other headers.
    const misplaced = acceptance([AC_01], ['| IND-01 | m | % | 80 | >= | L3 |', '', '| Id | Given (dataset) | When | Then | Level | Status |', '|---|---|---|---|---|---|', '| AC-09 | `nominal` | runs | x | L3 | active |'], [...ALWAYS, '', '| Id | Invariant | How | Level |', '|---|---|---|---|', '| INV-02 | never | events | L2 |']);
    expect(readAcceptance(readMarkdown(misplaced)).findings.map((finding) => [finding.code, finding.section, finding.message.split(' stand')[0]])).toEqual([
      ['ind-incomplete', 'Indicators', '`AC-09`'],
      ['inv-incomplete', 'Invariants', '`INV-02`'],
    ]);
  });

  it('reads a criteria table whose Given header is short, and a header in bold', () => {
    const text = acceptance([AC_01]).replace('| Id | Given (dataset) | When | Then | Level | Status |', '| **Id** | Given | When | Expected | Level | Status |');
    const reading = readAcceptance(readMarkdown(text));
    expect(reading.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01']);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([['ac-incomplete', 'AC-01: empty `Then`']]);
  });

  it('reads the status by what the cell opens with: a remark quotes the other status without becoming it', () => {
    const reading = read(['| AC-01 | `nominal` | runs | x | L3 | active (was `dropped (DEC-0002)`, restored by DEC-0005) |', '| AC-02 | `nominal` | runs | x | L3 | dropped (DEC-0002) — was `active` |', '| AC-03 | `nominal` | runs | x | L3 | active — `dropped` refusé par l’utilisateur |']);
    expect(reading.findings).toEqual([]);
    expect(reading.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01', 'AC-03']);
    expect(reading.ids.dropped).toEqual(['AC-02']);
    // One reading for the rule and for the row: what the rule refuses is not silently dropped or kept under another value.
    const wrong = read([AC_01, '| AC-02 | `nominal` | runs | x | L3 | to drop (was `active`) |', '| AC-03 | `nominal` | runs | x | L3 | `dropped` |']);
    expect(wrong.findings.map((finding) => [finding.code, finding.message.split(' — ')[0]])).toEqual([['ac-status', 'AC-02: `Status` `to drop (was active)`'], ['ac-status', 'AC-03: `Status` `dropped`']]);
    expect(wrong.ids.criteria.map((criterion) => criterion.id)).toEqual(['AC-01', 'AC-02']);
    expect(wrong.ids.dropped).toEqual(['AC-03']);
  });

  it('asks an active criterion for its dataset, its trigger, its outcome, one level and a status', () => {
    const reading = read(['| AC-01 | — | the team runs | | L3 / L4 | |']);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([
      ['ac-status', 'AC-01: `Status` is empty — neither `active` nor `dropped (DEC-nnnn)`'],
      ['level', 'AC-01: `Level` `L3 / L4` names no single level — one of L0 · L1 · L2 · L3 · L4'],
      ['ac-incomplete', 'AC-01: empty `Given (dataset)` and `Then`'],
    ]);
    // Neither dropped nor refused: it is active, at a level nobody can tell.
    expect(reading.ids.criteria).toEqual([{ id: 'AC-01', level: null, given: '—' }]);
  });

  it('finds no active criterion in an empty table, in a section that says None., or without the section', () => {
    for (const text of [acceptance([]), acceptance([]).replace(/\| Id \| Given[\s\S]*?\n\n/, 'None.\n\n'), acceptance([AC_01]).replace('## Acceptance criteria', '## Criteria')]) {
      expect(readAcceptance(readMarkdown(text)).findings.map((finding) => [finding.code, finding.section, finding.message])).toEqual([
        ['ac-none', 'Acceptance criteria', 'no active acceptance criterion: a report without any AC is never accepted'],
      ]);
    }
  });

  it('asks an indicator for a measure, a unit, a number and a direction', () => {
    const reading = read([AC_01], ['| IND-01 | | — | 95 % | ≥ | |', '| IND-02 | m | % | | | L3 |', '| IND-03 | m | 1–5 | -0.5 | <= | L4 |']);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([
      ['level', 'IND-01: `Level` is empty — one of L0 · L1 · L2 · L3 · L4'],
      ['ind-incomplete', 'IND-01: empty `Measure`; empty `Unit`; `Threshold` `95 %` is not a number (a number with a decimal point and no unit); `Direction` `≥` — neither `>=` nor `<=`'],
      ['ind-incomplete', 'IND-02: `Threshold` is empty (a number with a decimal point and no unit); `Direction` is empty — neither `>=` nor `<=`'],
    ]);
  });

  it('asks an invariant for a statement and a check, an id of the catalogue, and a level that can observe it', () => {
    const reading = read([AC_01], [], [...ALWAYS, '| INV-EMAIL | | n/a | L2 |', '| INV-SPEED | fast | timer | L3 |', '| INV-IDEMP | same output | double run | L2 |', '| INV-RESUME | resumes | kill | L3 |', '| INV-01 | own | script | L0 |']);
    expect(reading.findings.map((finding) => [finding.code, finding.message])).toEqual([
      ['inv-incomplete', 'INV-EMAIL: empty `Statement` and `Check` — a declared invariant without a check is a failing one'],
      [
        'inv-unknown',
        "`INV-SPEED` is not an invariant of the catalogue (INV-FS, INV-SECRETS, INV-EMAIL, INV-TOOLS, INV-SCHEMA, INV-IDEMP, INV-RESUME, INV-INCR, INV-BUDGET, INV-INJECTION): a team's own invariant is `INV-01`, `INV-02`…",
      ],
      ['inv-level', '`INV-IDEMP` is declared at L2, below L3, the lowest level that can observe it'],
    ]);
  });

  it('asks for each invariant that always applies', () => {
    const reading = read([AC_01], [], [ALWAYS[0]!]);
    expect(reading.findings.map((finding) => [finding.code, finding.section, finding.message])).toEqual([
      ['inv-always', 'Invariants', '`INV-SECRETS` is not declared: it applies to every team'],
      ['inv-always', 'Invariants', '`INV-TOOLS` is not declared: it applies to every team'],
      ['inv-always', 'Invariants', '`INV-BUDGET` is not declared: it applies to every team'],
    ]);
    expect(ALWAYS_INVARIANTS.every((id) => Object.hasOwn(INVARIANT_CATALOGUE, id))).toBe(true);
  });
});

describe('citedIds', () => {
  it('reads the ids of a cell, each once', () => {
    expect(citedIds('AC-01, `INV-FS` and AC-01; IND-02 (L3)')).toEqual(['AC-01', 'INV-FS', 'IND-02']);
    expect(citedIds('— MAC-01, R-01, DEC-0001')).toEqual([]);
  });

  it('reads the two ends of a range, and no id between them', () => {
    expect(citedIds('AC-01…AC-03, IND-09 to IND-11')).toEqual(['AC-01', 'AC-03', 'IND-09', 'IND-11']);
    expect(citedIds('IND-04 (L3), IND-05 (L4) — 12 mails')).toEqual(['IND-04', 'IND-05']);
  });
});

describe('the declared ids', () => {
  const { ids } = read([AC_01, '| AC-02 | `nominal` | runs | x | L4 | active |', '| AC-03 | `nominal` | runs | x | L4 | dropped (DEC-0002) |'], ['| IND-01 | m | % | 1 | >= | L4 |']);

  it('are the active criteria, the indicators and the invariants', () => {
    expect(declaredIds(ids)).toEqual(['AC-01', 'AC-02', 'IND-01', 'INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET']);
    expect(idsAtLevel(ids, 'e2e_remote')).toEqual(['AC-02', 'IND-01']);
  });

  it('say why another id is not one to cite', () => {
    expect(undeclared(ids, 'AC-01')).toBeNull();
    expect(undeclared(ids, 'AC-03')).toBe('`AC-03` is dropped');
    expect(undeclared(ids, 'AC-09')).toBe('`ACCEPTANCE.md` does not declare `AC-09`');
  });
});
