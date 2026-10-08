import { describe, expect, it } from 'vitest';

import type { WorkbookIds } from '../../../src/domain/workbook/acceptance-rules.js';
import { readMarkdown } from '../../../src/domain/workbook/markdown.js';
import { planFindings } from '../../../src/domain/workbook/plan-rules.js';
import type { Track } from '../../../src/domain/status.js';

const IDS: WorkbookIds = {
  criteria: [
    { id: 'AC-01', level: 'e2e_local', given: '`nominal`' },
    { id: 'AC-02', level: 'component', given: '`empty`' },
  ],
  indicators: [{ id: 'IND-01', level: 'e2e_local', threshold: 100 }],
  invariants: [{ id: 'INV-FS', level: 'component' }],
  dropped: ['AC-03'],
};

const STEP = 'TESTS ☐ · BUILD ☐ · L0/L1 ☐ —';

interface Sheet {
  intent?: string;
  decisions?: string;
  steps?: string[];
  anchors?: string[] | string;
  assumptions?: string;
  after?: string[];
}

function sheet(id: string, parts: Sheet = {}): string {
  const anchors = parts.anchors ?? ['| 1 | `teams/demo/crew/config.yaml` | `component/ac-02-empty.scenario.json` |'];
  return [
    `### ${id}`,
    '',
    '#### Intent',
    '',
    parts.intent ?? 'The crew loads.',
    '',
    '#### Design decisions',
    '',
    parts.decisions ?? 'None.',
    '',
    '#### Steps',
    '',
    ...(parts.steps ?? [`1. ${STEP} write the crew`]),
    '',
    '#### Anchors',
    '',
    ...(typeof anchors === 'string' ? [anchors] : ['| Step | Files to create or edit | Tests that observe it |', '|---|---|---|', ...anchors]),
    '',
    '#### Assumptions',
    '',
    parts.assumptions ?? 'None.',
    '',
    ...(parts.after ?? []),
  ].join('\n');
}

const BATCH = '| B1 | the crew | AC-01, AC-02, INV-FS | every scenario | 20 minutes | todo |';

function plan(batches: string[] = [BATCH], sheets: string[] = [sheet('B1')]): string {
  return ['# Demo — Plan', '', '## Batches', '', '| Batch | Scope | AC/INV covered | Tests that must pass | Expected cost | Status |', '|---|---|---|---|---|---|', ...batches, '', ...sheets, '', '## Order and dependencies', '', '### Not a sheet', '', 'B1 alone.'].join('\n');
}

function found(markdown: string, track: Track = 'full', ids: WorkbookIds = IDS): [string, string, string][] {
  return planFindings(readMarkdown(markdown), ids, track).map((finding) => [`${finding.severity} ${finding.code}`, String(finding.section), finding.message]);
}

const inSheet = (parts: Sheet): [string, string, string][] => found(plan([BATCH], [sheet('B1', parts)]));

describe('planFindings', () => {
  it('finds nothing in a plan of one batch with its sheet, on either track', () => {
    expect(found(plan())).toEqual([]);
    expect(found(plan(), 'light')).toEqual([]);
  });

  it('says nothing of a plan without its ## Batches: the headings say it', () => {
    expect(found('# Demo — Plan\n\n## Order and dependencies\n\nB1 alone.')).toEqual([]);
  });

  describe('the batches', () => {
    it('asks for one at least, named B<n>, each once — L names the test levels', () => {
      expect(found(plan([], [])).filter(([code]) => code === 'error batch-id')).toEqual([['error batch-id', 'Batches', 'no batch: a plan has at least `B1`']]);
      const batches = [BATCH, BATCH.replace('B1', 'L1'), BATCH.replace('B1', 'B01'), BATCH.replace('B1', '`B1`'), BATCH.replace('| B1 ', '| ')];
      expect(found(plan(batches, [sheet('B1'), sheet('L1'), sheet('B01')])).filter(([code]) => code === 'error batch-id')).toEqual([
        ['error batch-id', 'Batches', '`L1`: expected a batch id such as B1 (the L prefix names the test levels L0–L4)'],
        ['error batch-id', 'Batches', '`B01`: expected a batch id such as B1 (the L prefix names the test levels L0–L4)'],
        ['error batch-id', 'Batches', '`B1` is on two rows'],
        ['error batch-id', 'Batches', 'row 5 has no batch id'],
      ]);
    });

    it('asks each for a scope, its tests, a cost and a status of the list', () => {
      const batches = [BATCH, '| B2 | | — | n/a | | doing |', '| B3 | x | — | t | c | in progress |', '| B4 | x | — | t | c | done (ATT-0003) |', '| B5 | x | — | t | c | done |'];
      const sheets = ['B1', 'B2', 'B3', 'B4', 'B5'].map((id) => sheet(id));
      expect(found(plan(batches, sheets))).toEqual([
        ['error batch-incomplete', 'Batches', 'B2: empty `Scope`; empty `Tests that must pass`; empty `Expected cost`; `Status` `doing` — none of `todo`, `in progress`, `done (ATT-nnnn)`'],
        ['error batch-incomplete', 'Batches', 'B5: `Status` `done` — none of `todo`, `in progress`, `done (ATT-nnnn)`'],
      ]);
    });

    it('reads a batch id and a status with a remark beside them, and the table of the batches only', () => {
      const batches = ['| `B1` (le socle) | the crew | AC-01, AC-02, INV-FS | every scenario | 20 minutes | `todo` (rien de construit) |', '| B2 (suite) | x | — | t | c | done (ATT-0003) — relu le 8 octobre |', '', '| Batch | Note |', '|---|---|', '| B2 | after B1 |'];
      expect(found(plan(batches, [sheet('B1'), sheet('B2')]))).toEqual([]);
      // A second table with the key column alone is the author's own, whatever it lists: no rule depends on it.
      expect(found(plan([...batches, '| B9 | a batch of this table alone |'], [sheet('B1'), sheet('B2')]))).toEqual([]);
      expect(found(plan([BATCH.replace('| todo |', '| to do |')])).map(([code]) => code)).toEqual(['error batch-incomplete']);
    });

    it('refuses a covered id that is unknown or dropped, and asks for every active criterion and every invariant — not for an indicator', () => {
      expect(found(plan([BATCH.replace('AC-01, AC-02, INV-FS', 'AC-01, AC-03, INV-07')]))).toEqual([
        ['error batch-unknown-id', 'Batches', 'B1: `AC/INV covered` — `AC-03` is dropped'],
        ['error batch-unknown-id', 'Batches', 'B1: `AC/INV covered` — `ACCEPTANCE.md` does not declare `INV-07`'],
        ['error coverage', 'Batches', '`AC-02` is covered by no batch'],
        ['error coverage', 'Batches', '`INV-FS` is covered by no batch'],
      ]);
      expect(found(plan([BATCH.replace('AC-01, AC-02, INV-FS', 'the criteria `AC-01`…`AC-02` (L3) and `INV-FS`')]))).toEqual([]);
      // A range names its two ends only.
      const three: WorkbookIds = { ...IDS, criteria: [...IDS.criteria, { id: 'AC-04', level: 'component', given: '`empty`' }] };
      expect(found(plan([BATCH.replace('AC-01, AC-02, INV-FS', 'AC-01…AC-04, INV-FS')]), 'full', three)).toEqual([['error coverage', 'Batches', '`AC-02` is covered by no batch']]);
    });

    it('holds the light track to the single batch B1', () => {
      const two = plan([BATCH, BATCH.replace('B1', 'B2')], [sheet('B1'), sheet('B2')]);
      expect(found(two)).toEqual([]);
      expect(found(two, 'light')).toEqual([['error light-track', 'Batches', '`STATUS.md` says `track: light` and the plan has `B1` and `B2`: the light track builds the single batch `B1`']]);
      expect(found(plan([BATCH.replace('B1', 'B2')], [sheet('B2')]), 'light').map(([code]) => code)).toEqual(['error light-track']);
    });
  });

  describe('the sheets', () => {
    it('asks for one sheet per batch and one batch per sheet, each written once', () => {
      expect(found(plan([BATCH, BATCH.replace('B1', 'B2')], [sheet('B1'), sheet('B1'), sheet('B3')]))).toEqual([
        ['error sheet', 'Batches', 'batch `B2` has no `### B2` sheet'],
        ['error sheet', 'B1', 'the sheet `### B1` is written twice'],
        ['error sheet', 'B3', 'the sheet `### B3` has no row in `## Batches`'],
      ]);
    });

    it('takes a heading that goes on after a batch id for the sheet of that batch, and says the heading is the id alone', () => {
      const batches = [BATCH, BATCH.replace('B1', 'B10')];
      const sheets = [sheet('B1 — the crew', { steps: ['To be written.'], anchors: 'None.' }), sheet('`B10`: hardening')];
      expect(found(plan(batches, sheets))).toEqual([
        ['error sheet', 'B1', 'the sheet of `B1` is headed `### B1 — the crew`: a sheet heading is the batch id alone, `### B1`'],
        ['error steps', 'B1', '`#### Steps` has no numbered step'],
        ['error anchors', 'B1', '`#### Anchors` has no row: every file a step creates or edits is named'],
        ['error sheet', 'B10', 'the sheet of `B10` is headed `### B10: hardening`: a sheet heading is the batch id alone, `### B10`'],
      ]);
      // `B12` is not `B1` and more: a sheet without a row, and a batch without a sheet.
      expect(found(plan([BATCH], [sheet('B12')])).map(([, section, message]) => [section, message])).toEqual([
        ['Batches', 'batch `B1` has no `### B1` sheet'],
        ['B12', 'the sheet `### B12` has no row in `## Batches`'],
      ]);
      expect(found(plan([BATCH], [sheet('B1'), sheet('B1 (again)')])).map(([, , message]) => message)).toEqual(['the sheet `### B1` is written twice']);
    });

    it('asks a sheet for its five parts in the fixed order', () => {
      const without = sheet('B1').replace('#### Design decisions\n\nNone.\n\n', '');
      expect(found(plan([BATCH], [without]))).toEqual([
        ['error sheet', 'B1', 'the `#### ` parts are not `Intent`, `Design decisions`, `Steps`, `Anchors` and `Assumptions`, in that order: `#### Design decisions` is missing (expected before `#### Steps`)'],
      ]);
      const swapped = sheet('B1').replace('#### Intent', '#### Purpose');
      expect(found(plan([BATCH], [swapped])).map(([code, , message]) => [code, message.split(': ')[1]])).toEqual([['error sheet', '`#### Purpose` is unexpected']]);
    });

    it('lets corrections follow the five parts, each with its own steps', () => {
      const corrected = sheet('B1', { after: ['#### Correction C1 — F-1', '', `1. TESTS ✅ · BUILD ✅ · L0/L1 ☐ — fix the path`, '', '#### Correction C2 — F-3', '', 'To do.', '', '#### Notes', '', 'x'] });
      expect(found(plan([BATCH], [corrected]))).toEqual([
        ['error sheet', 'B1', 'the `#### ` parts are not `Intent`, `Design decisions`, `Steps`, `Anchors` and `Assumptions`, in that order: `#### Notes` is unexpected after a correction'],
        ['error steps', 'B1', '`#### Correction C2 — F-3` has no numbered step'],
      ]);
      expect(inSheet({ after: ['#### Correction C1 — F-1', '', `1. ${STEP} fix the path`] })).toEqual([]);
      expect(inSheet({ after: ['#### Correction 1', '', `1. ${STEP} fix the path`] }).map(([code]) => code)).toEqual(['error sheet']);
    });

    it('refuses a part that holds nothing, and an intent that says None.', () => {
      expect(inSheet({ intent: '<!-- two lines -->', decisions: '', assumptions: '| Id | Assumption | To be validated by |\n|---|---|---|\n| | | |' })).toEqual([
        ['error empty-section', 'B1', '`#### Intent` holds nothing'],
        ['error empty-section', 'B1', '`#### Design decisions` holds nothing: a part with nothing to say holds `None.`'],
        ['error empty-section', 'B1', '`#### Assumptions` holds nothing: a part with nothing to say holds `None.`'],
      ]);
      expect(inSheet({ intent: 'None.' })).toEqual([['error empty-section', 'B1', '`#### Intent` says `None.`: a batch has an intent']]);
    });

    it('asks every step for its three proof ticks, ticked or not', () => {
      expect(inSheet({ steps: [`1. TESTS ✅ · BUILD ✅ · L0/L1 ✅ — write the crew`, '   continued on a second line'] })).toEqual([]);
      const steps = [`1. ${STEP} write the crew`, '2. write the tools', '3) TESTS ☐ · BUILD ☐ — scaffold'];
      const anchors = ['| 1, 2 and 3 | `teams/demo/crew/config.yaml` | `static/ac-01.txt` |'];
      expect(inSheet({ steps, anchors })).toEqual([
        ['error steps', 'B1', '`#### Steps`: step 2 lacks its three proof ticks `TESTS ☐ · BUILD ☐ · L0/L1 ☐`'],
        ['error steps', 'B1', '`#### Steps`: step 3 lacks its three proof ticks `TESTS ☐ · BUILD ☐ · L0/L1 ☐`'],
      ]);
      expect(inSheet({ steps: ['To be written.'] })).toEqual([
        ['error steps', 'B1', '`#### Steps` has no numbered step'],
        ['error anchors', 'B1', 'anchor row 1: `Step` 1 is not a step of the sheet'],
      ]);
    });

    it('takes a numbered line without indent for a step, and an indented one under it for a detail of that step', () => {
      const steps = [`1. ${STEP} write \`mounts.json\` and the crew skeleton, then scaffold the team:`, '   1. `mounts.json` from `## Mounts`', '   2. `orkeon-bench scaffold demo`', '  3. check the launchers', `2. ${STEP} write the tools`];
      const anchors = ['| 1 | `teams/demo/mounts.json` | `static/ac-01.txt` |', '| 2 | `teams/demo/crew/tools/dedupe/domain.ts` | `unit/dedupe.test.ts` |'];
      expect(inSheet({ steps, anchors })).toEqual([]);
    });

    it('takes for steps the numbered lines at the indent of the first one: a list may be indented as a whole', () => {
      const anchors = ['| 1 | `teams/demo/mounts.json` | `static/ac-01.txt` |', '| 2 | `teams/demo/crew/tools/dedupe/domain.ts` | `unit/dedupe.test.ts` |'];
      const indented = [`  1. ${STEP} write the crew`, '     1. a detail', `  2. ${STEP} write the tools`];
      expect(inSheet({ steps: indented, anchors })).toEqual([]);
      // Held to the same rules as a list at the margin: ticks, and an anchor for every step.
      expect(inSheet({ steps: [`  1. ${STEP} write the crew`, '  2. write the tools', `  3. ${STEP} scaffold`], anchors })).toEqual([
        ['error steps', 'B1', '`#### Steps`: step 2 lacks its three proof ticks `TESTS ☐ · BUILD ☐ · L0/L1 ☐`'],
        ['error anchors', 'B1', 'step 3 is named by no anchor row'],
      ]);
      // Beyond three blanks, a numbered line is code or a detail of nothing: no step.
      expect(inSheet({ steps: [`    1. ${STEP} write the crew`] }).map(([code, , message]) => [code, message])).toEqual([
        ['error steps', '`#### Steps` has no numbered step'],
        ['error anchors', 'anchor row 1: `Step` 1 is not a step of the sheet'],
      ]);
    });

    it('refuses a step number written twice in a sheet: the anchors could not tell the two steps apart', () => {
      const steps = [`1. ${STEP} write the crew`, `1. ${STEP} write the tools`, `1. ${STEP} scaffold`, `2. ${STEP} check`];
      const anchors = ['| 1 | `teams/demo/crew/config.yaml` | `static/ac-01.txt` |', '| 2 | `teams/demo/run.sh` | `static/ac-01.txt` |'];
      expect(inSheet({ steps, anchors })).toEqual([['error steps', 'B1', '`#### Steps`: step 1 is numbered twice — a step has its own number, which its anchors name']]);
      const correction = ['#### Correction C1 — F-1', '', `1. ${STEP} fix the path`, `1. ${STEP} fix the test`];
      expect(inSheet({ after: correction })).toEqual([['error steps', 'B1', '`#### Correction C1 — F-1`: step 1 is numbered twice — a step has its own number, which its anchors name']]);
    });

    it('reads the Step cell of an anchor by its leading numbers: a remark after them, a list, a range', () => {
      const steps = [`1. ${STEP} a`, `2. ${STEP} b`, `3. ${STEP} c`, `4. ${STEP} d`];
      const file = '`teams/demo/crew/config.yaml` | `static/ac-01.txt` |';
      for (const cells of [['1–4'], ['1-3', '4'], ['`1`, 2 and 3', '4 (after B2)'], ['1 et 2', '3 & 4'], ['1 – 2', '3;4']]) {
        expect(inSheet({ steps, anchors: cells.map((cell) => `| ${cell} | ${file}`) }), cells.join(' / ')).toEqual([]);
      }
      // The number of another batch in a remark names no step, and a step it would have hidden is found missing.
      expect(inSheet({ steps: steps.slice(0, 2), anchors: [`| 1 (avant B2) | ${file}`] })).toEqual([['error anchors', 'B1', 'step 2 is named by no anchor row']]);
      expect(inSheet({ steps: steps.slice(0, 2), anchors: [`| 1 | ${file}`, `| 2–5 | ${file}`] })).toEqual([['error anchors', 'B1', 'anchor row 2: `Step` 3–5 is not a step of the sheet']]);
      // A range that covers nothing is named by its ends, not number by number.
      expect(inSheet({ steps: steps.slice(0, 2), anchors: [`| 1–99 | ${file}`] })).toEqual([['error anchors', 'B1', 'anchor row 1: `Step` 3–99 is not a step of the sheet']]);
      expect(inSheet({ steps: steps.slice(0, 1), anchors: [`| 1, 3, 4 | ${file}`] })).toEqual([['error anchors', 'B1', 'anchor row 1: `Step` 3, 4 is not a step of the sheet']]);
      expect(inSheet({ steps: steps.slice(0, 1), anchors: [`| step 1 | ${file}`] }).map(([, , message]) => message)).toEqual(['anchor row 1: `Step` names no step', 'step 1 is named by no anchor row']);
    });

    it('counts for the files of a step what stands outside brackets, and holds every back-ticked path to the rule of the frozen trees', () => {
      const anchors = ['| 1 | `teams/demo/mounts.json`, `teams/demo/crew/config.yaml` (lu par le runner), `settings/demo/appsettings.json` (main thread) | `static/ac-01.txt` |'];
      expect(inSheet({ anchors })).toEqual([]);
      const remarked = ['| 1 | `teams/demo/mounts.json` (et `tests/demo/static/ac-03-mail-tools.txt`, à adapter) | `static/ac-01.txt` |'];
      expect(inSheet({ anchors: remarked })).toEqual([['error anchors', 'B1', 'step 1: `tests/demo/static/ac-03-mail-tools.txt` lies under `tests/` — the implementer never writes there']]);
      // A file named in brackets only is no file of the step.
      expect(inSheet({ anchors: ['| 1 | (`teams/demo/mounts.json`) | `static/ac-01.txt` |'] })).toEqual([['error anchors', 'B1', 'step 1: empty `Files to create or edit`']]);
      const climbing = ['| 1 | `./workbooks/demo/PLAN.md`, `../tests/demo/a.txt`, `teams/demo/crew/tests/helper.ts` | `static/ac-01.txt` |'];
      expect(inSheet({ anchors: climbing }).map(([, , message]) => message.split(' lies')[0])).toEqual(['step 1: `workbooks/demo/PLAN.md`', 'step 1: `tests/demo/a.txt`']);
    });

    it('does not read a second table of anchors or of assumptions that has the key column alone', () => {
      const extra = ['| Step | Command to observe it |', '|---|---|', '| 1 | `orkeon-bench run demo --level L0` |', '| 3 | (après B2) |', '', '| Id | Note |', '|---|---|', '| X9 | not an assumption of the table |'];
      expect(inSheet({ after: extra })).toEqual([]);
      // The table of the template itself, renamed, is still missed: its own rule says so.
      const renamed = sheet('B1').replace('| Step | Files to create or edit | Tests that observe it |', '| Step | Files | Tests |');
      expect(found(plan([BATCH], [renamed]))).toEqual([
        ['error anchors', 'B1', '`#### Anchors` has no row: every file a step creates or edits is named'],
        ['error anchors', 'B1', 'step 1 is named by no anchor row'],
      ]);
    });

    it('warns about an anchor from the root, and about one nothing observes', () => {
      const anchors = ['| 1 | /workspace/teams/demo/crew/config.yaml<br>library/tools/dedupe/domain.ts | — |'];
      expect(inSheet({ anchors })).toEqual([
        ['warning anchors-path', 'B1', 'step 1: `/workspace/teams/demo/crew/config.yaml` starts with `/` — anchors name physical paths relative to the workshop (`teams/<slug>/crew/…`, `library/tools/…`)'],
        ['warning anchors-tests', 'B1', 'step 1 has no test that observes it'],
      ]);
    });

    it('asks an assumption for its id, what it assumes and who validates it', () => {
      const table = ['| Id | Assumption | To be validated by |', '|---|---|---|', '| `H1` (kept from the need) | the model calls tools | the first local run |', '| H2 | | |', '| h3 | x | y |', '| | x | y |'].join('\n');
      expect(inSheet({ assumptions: table })).toEqual([
        ['error assumptions', 'B1', '`H2`: empty `Assumption`; empty `To be validated by`'],
        ['error assumptions', 'B1', '`h3`: not an assumption id (`H1`, `H2`…)'],
        ['error assumptions', 'B1', 'assumption row 4: no id'],
      ]);
    });
  });
});
