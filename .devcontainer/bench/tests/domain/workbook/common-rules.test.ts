import { describe, expect, it } from 'vitest';

import { commonFindings, headingDifference, needTbdFindings } from '../../../src/domain/workbook/common-rules.js';
import { CORRECTION_HEADING, WORKBOOK_HEADINGS, type HeadedArtefact } from '../../../src/domain/workbook/headings.js';
import { readMarkdown, sectionsOf } from '../../../src/domain/workbook/markdown.js';
import { workbookFixture } from '../../fakes/workbook-fixtures.js';

const ACCEPTANCE = ['# Mail triage — Acceptance', '', '## Acceptance criteria', '', 'None.', '', '## Indicators', '', 'None.', '', '## Invariants', '', 'None.'].join('\n');

function common(markdown: string, artefact: HeadedArtefact = 'ACCEPTANCE.md', emptySections = true) {
  return commonFindings(artefact, readMarkdown(markdown), { emptySections });
}

describe('the frozen headings', () => {
  it.each(['NEED.md', 'ACCEPTANCE.md', 'TEST-PLAN.md', 'DESIGN.md', 'PLAN.md'] as const)('are those of the template %s, in its order', (artefact) => {
    const template = readMarkdown(workbookFixture(`templates/${artefact}`));
    expect(template.sections.map((section) => section.heading)).toEqual(WORKBOOK_HEADINGS[artefact]);
    expect(common(workbookFixture(`templates/${artefact}`), artefact, false).map((finding) => finding.code)).toEqual(['placeholder']);
  });

  it('are those of the batch sheet of the template, a correction being what the template says may follow', () => {
    const sheet = sectionsOf(readMarkdown(workbookFixture('templates/PLAN.md')).lines, 3);
    expect(sheet.map((found) => found.heading)).toEqual(['B1']);
    expect(sectionsOf(sheet[0]!.lines, 4).map((part) => part.heading)).toEqual(WORKBOOK_HEADINGS.sheet);
    const correction = /^#### (Correction .*)$/m.exec(workbookFixture('templates/PLAN.md'))?.[1];
    expect(correction).toBe('Correction C1 — F-1');
    expect(CORRECTION_HEADING.test(correction as string)).toBe(true);
    expect(CORRECTION_HEADING.test('Correction 1')).toBe(false);
  });
});

describe('headingDifference', () => {
  const expected = ['A', 'B', 'C'];

  it('finds none between the same headings in the same order', () => {
    expect(headingDifference(expected, ['A', 'B', 'C'], '##')).toBeNull();
  });

  it.each([
    [['A', 'B'], '`## C` is missing'],
    [['A', 'C'], '`## B` is missing (expected before `## C`)'],
    [['A', 'B', 'C', 'D'], '`## D` is unexpected'],
    [['A', 'X', 'B', 'C'], '`## X` is unexpected'],
    [['a', 'B', 'C'], '`## a` is unexpected (the template writes `## A`)'],
    [['A', 'A', 'B', 'C'], '`## A` is written twice'],
    [['B', 'A', 'C'], '`## B` is out of order (`## A` is expected there)'],
    [[], '`## A` is missing'],
  ])('names the first difference of %j', (actual, difference) => {
    expect(headingDifference(expected, actual, '##')).toBe(difference);
  });
});

describe('commonFindings', () => {
  it('finds nothing in an artefact that has its headings and says None. where it has nothing to say', () => {
    expect(common(ACCEPTANCE)).toEqual([]);
  });

  it('names the first heading that differs', () => {
    expect(common(ACCEPTANCE.replace('## Indicators', '## Measures'))).toEqual([
      { severity: 'error', code: 'headings', artefact: 'ACCEPTANCE.md', section: null, message: 'the `## ` headings are not those of the template, in its order: `## Measures` is unexpected' },
    ]);
  });

  it('finds a placeholder once, with the section it is left in — and none in a diagram or in lower case', () => {
    const text = ACCEPTANCE.replace('Mail triage', '{{TEAM_TITLE}}').replace('None.', '{{DATE}} and {{DATE}}, {{lower}}\n\n```mermaid\nflowchart LR\n    a{{START}} --> b\n```');
    expect(common(text).map((finding) => [finding.code, finding.section, finding.message])).toEqual([
      ['placeholder', null, 'the placeholder `{{TEAM_TITLE}}` of the template is left'],
      ['placeholder', 'Acceptance criteria', 'the placeholder `{{DATE}}` of the template is left'],
    ]);
  });

  it('finds the line a decision left, at the start of a line only', () => {
    const marked = ACCEPTANCE.replace('\n\n## Acceptance', '\n\n> To revise — DEC-0002: the drafts go to another folder\n\n## Acceptance');
    expect(common(marked)).toEqual([
      { severity: 'error', code: 'to-revise', artefact: 'ACCEPTANCE.md', section: null, message: '`> To revise — DEC-0002` is left: the step that resumes revises the artefact and removes the line' },
    ]);
    expect(common(ACCEPTANCE.replace('None.', 'The line `> To revise — DEC-0002` is removed by the step.'))).toEqual([]);
  });

  it('finds that line however it was retyped: another dash, no blank, emphasis', () => {
    for (const line of ['> To revise - DEC-0003: the threshold of IND-02', '>To revise — DEC-0003: x', '> **To revise — DEC-0003**: x', '>  To revise – DEC-0003', '> *To revise—DEC-0003*']) {
      const marked = ACCEPTANCE.replace('\n\n## Acceptance', `\n\n${line}\n\n## Acceptance`);
      expect(common(marked).map((finding) => [finding.code, finding.message]), line).toEqual([['to-revise', '`> To revise — DEC-0003` is left: the step that resumes revises the artefact and removes the line']]);
    }
    expect(common(ACCEPTANCE.replace('None.', '> To be revised later, see DEC-0003'))).toEqual([]);
  });

  it('finds a section that holds a comment, or the blank row of the template, and nothing else', () => {
    const empty = ACCEPTANCE.replace('None.', '<!-- one behaviour per row -->\n\n| Id | Then |\n|---|---|\n| | |');
    expect(common(empty).map((finding) => [finding.code, finding.section])).toEqual([['empty-section', 'Acceptance criteria']]);
    expect(common(empty, 'ACCEPTANCE.md', false)).toEqual([]);
  });
});

describe('needTbdFindings', () => {
  it('warns once about a TBD left in the need, and not about one in a comment or in a word', () => {
    expect(needTbdFindings(readMarkdown('## Constraints\n\nCost: TBD\n\n## Security\n\nTBD'))).toEqual([
      { severity: 'warning', code: 'need-tbd', artefact: 'NEED.md', section: null, message: 'NEED.md still holds TBD: no plan while a blocking question is open' },
    ]);
    expect(needTbdFindings(readMarkdown('<!-- Unknown yet: write TBD -->\n\nNo TBDs here.'))).toEqual([]);
    expect(needTbdFindings(readMarkdown(workbookFixture('clean/workbook/NEED.md')))).toEqual([]);
  });
});
