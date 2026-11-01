import { describe, expect, it } from 'vitest';

import { commonFindings, headingDifference, needTbdFindings, teamStructureFindings } from '../../../src/domain/workbook/common-rules.js';
import { CORRECTION_HEADING, TEAM_HEADINGS, TEAM_SECTIONS, type TeamSection } from '../../../src/domain/workbook/headings.js';
import { partNamed, readMarkdown, sectionsOf } from '../../../src/domain/workbook/markdown.js';
import { workbookFixture } from '../../fakes/workbook-fixtures.js';

const ACCEPTANCE = ['## Acceptance', '', '### Acceptance criteria', '', 'None.', '', '### Indicators', '', 'None.', '', '### Invariants', '', 'None.', '', '### Datasets', '', 'None.', '', '### LLM targets', '', 'None.', '', '### Judges', '', 'None.', '', '### Budget', '', 'None.'].join('\n');

function common(markdown: string, part: TeamSection = 'Acceptance', emptySections = true) {
  return commonFindings(part, partNamed(readMarkdown(markdown), part), { emptySections });
}

describe('the frozen headings', () => {
  const template = readMarkdown(workbookFixture('templates/TEAM.md'));

  it('are the four parts of the template TEAM.md, in its order — its title being the one placeholder above them', () => {
    expect(template.sections.map((section) => section.heading)).toEqual(TEAM_SECTIONS);
    expect(teamStructureFindings(template)).toEqual([{ severity: 'error', code: 'placeholder', artefact: 'TEAM.md', section: null, message: 'the placeholder `{{TEAM_TITLE}}` of the template is left' }]);
  });

  it.each(TEAM_SECTIONS)('are those of the part %s of the template, in its order', (part) => {
    const found = partNamed(template, part);
    const headings = found.sections.map((section) => section.heading).filter((heading) => part !== 'Plan' || !/^B[1-9][0-9]*$/.test(heading));
    expect(headings).toEqual(TEAM_HEADINGS[part]);
    expect(common(workbookFixture('templates/TEAM.md'), part, false)).toEqual([]);
  });

  it('are those of the batch sheet of the template, a correction being what the template says may follow', () => {
    const sheet = sectionsOf(partNamed(template, 'Plan').lines, 3).filter((section) => section.heading === 'B1');
    expect(sheet.map((found) => found.heading)).toEqual(['B1']);
    expect(sectionsOf(sheet[0]!.lines, 4).map((part) => part.heading)).toEqual(TEAM_HEADINGS.sheet);
    const correction = /^#### (Correction .*)$/m.exec(workbookFixture('templates/TEAM.md'))?.[1];
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

describe('teamStructureFindings', () => {
  it('asks TEAM.md for its four parts in order, and nothing of what the parts hold', () => {
    expect(teamStructureFindings(readMarkdown('# T\n\n## Need\n\n{{X}}\n\n## Acceptance\n\n## Design\n\n## Plan\n'))).toEqual([]);
    expect(teamStructureFindings(readMarkdown('# T\n\n## Need\n\n## Design\n\n## Plan\n'))).toEqual([
      { severity: 'error', code: 'headings', artefact: 'TEAM.md', section: null, message: 'the `## ` headings are not those of the template, in its order: `## Acceptance` is missing (expected before `## Design`)' },
    ]);
  });

  it('finds what the template or a decision left above the first part: the title, a line', () => {
    expect(teamStructureFindings(readMarkdown('# {{TEAM_TITLE}} — Team\n\n> To revise — DEC-0002: the title\n\n## Need\n\n## Acceptance\n\n## Design\n\n## Plan\n')).map((finding) => [finding.code, finding.section])).toEqual([
      ['to-revise', null],
      ['placeholder', null],
    ]);
  });
});

describe('commonFindings', () => {
  it('finds nothing in a part that has its headings and says None. where it has nothing to say', () => {
    expect(common(ACCEPTANCE)).toEqual([]);
  });

  it('names the first heading that differs, the section bare for the check to place', () => {
    expect(common(ACCEPTANCE.replace('### Indicators', '### Measures'))).toEqual([
      { severity: 'error', code: 'headings', artefact: 'TEAM.md', section: null, message: 'the `### ` headings are not those of the template, in its order: `### Measures` is unexpected' },
    ]);
  });

  it('reads the sheets of the plan as the batches’ own: between Batches and Order, and nowhere else', () => {
    const plan = (sheets: string[], tail = '\n\n### Order and dependencies\n\nB1 alone.') => `## Plan\n\n### Batches\n\nNone.${sheets.map((sheet) => `\n\n### ${sheet}\n\nx`).join('')}${tail}`;
    expect(common(plan(['B1', 'B2']), 'Plan')).toEqual([]);
    expect(common(plan([]), 'Plan')).toEqual([]);
    expect(common(plan(['B1'], ''), 'Plan').map((finding) => finding.message)).toEqual(['the `### ` headings are not those of the template, in its order: `### Order and dependencies` is missing']);
    expect(common(plan(['B1'], '\n\n### Order and dependencies\n\nx\n\n### B2\n\nx'), 'Plan').map((finding) => finding.message)).toEqual(['the `### ` headings are not those of the template, in its order: `### B2` is unexpected']);
    expect(common('## Plan\n\n### B1\n\nx\n\n### Order and dependencies\n\nx', 'Plan').map((finding) => finding.message)).toEqual(['the `### ` headings are not those of the template, in its order: `### B1` is unexpected']);
  });

  it('finds a placeholder once, with the section it is left in — and none in a diagram or in lower case', () => {
    const text = ACCEPTANCE.replace('## Acceptance', '## Acceptance\n\n{{TEAM_TITLE}}').replace('None.', '{{DATE}} and {{DATE}}, {{lower}}\n\n```mermaid\nflowchart LR\n    a{{START}} --> b\n```');
    expect(common(text).map((finding) => [finding.code, finding.section, finding.message])).toEqual([
      ['placeholder', null, 'the placeholder `{{TEAM_TITLE}}` of the template is left'],
      ['placeholder', 'Acceptance criteria', 'the placeholder `{{DATE}}` of the template is left'],
    ]);
  });

  it('finds the line a decision left, at the start of a line only', () => {
    const marked = ACCEPTANCE.replace('\n\n### Acceptance', '\n\n> To revise — DEC-0002: the drafts go to another folder\n\n### Acceptance');
    expect(common(marked)).toEqual([
      { severity: 'error', code: 'to-revise', artefact: 'TEAM.md', section: null, message: '`> To revise — DEC-0002` is left: the step that resumes revises the part and removes the line' },
    ]);
    expect(common(ACCEPTANCE.replace('None.', 'The line `> To revise — DEC-0002` is removed by the step.'))).toEqual([]);
  });

  it('finds that line however it was retyped: another dash, no blank, emphasis', () => {
    for (const line of ['> To revise - DEC-0003: the threshold of IND-02', '>To revise — DEC-0003: x', '> **To revise — DEC-0003**: x', '>  To revise – DEC-0003', '> *To revise—DEC-0003*']) {
      const marked = ACCEPTANCE.replace('\n\n### Acceptance', `\n\n${line}\n\n### Acceptance`);
      expect(common(marked).map((finding) => [finding.code, finding.message]), line).toEqual([['to-revise', '`> To revise — DEC-0003` is left: the step that resumes revises the part and removes the line']]);
    }
    expect(common(ACCEPTANCE.replace('None.', '> To be revised later, see DEC-0003'))).toEqual([]);
  });

  it('finds a section that holds a comment, or the blank row of the template, and nothing else', () => {
    const empty = ACCEPTANCE.replace('None.', '<!-- one behaviour per row -->\n\n| Id | Then |\n|---|---|\n| | |');
    expect(common(empty).map((finding) => [finding.code, finding.section])).toEqual([['empty-section', 'Acceptance criteria']]);
    expect(common(empty, 'Acceptance', false)).toEqual([]);
  });

  it('judges a part the document does not have as empty: its headings are missing', () => {
    expect(common('## Need\n\nx', 'Design').map((finding) => finding.message)).toEqual(['the `### ` headings are not those of the template, in its order: `### Format and rationale` is missing']);
  });
});

describe('needTbdFindings', () => {
  it('warns once about a TBD left in the need, and not about one in a comment or in a word', () => {
    expect(needTbdFindings(readMarkdown('### Constraints\n\nCost: TBD\n\n### Security\n\nTBD'))).toEqual([
      { severity: 'warning', code: 'need-tbd', artefact: 'TEAM.md', section: null, message: 'the need still holds TBD: no plan while a blocking question is open' },
    ]);
    expect(needTbdFindings(readMarkdown('<!-- Unknown yet: write TBD -->\n\nNo TBDs here.'))).toEqual([]);
    expect(needTbdFindings(partNamed(readMarkdown(workbookFixture('clean/workbook/TEAM.md')), 'Need'))).toEqual([]);
  });
});
