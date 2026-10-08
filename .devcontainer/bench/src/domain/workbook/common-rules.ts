import { error, listOf, warning, type Finding } from './finding.js';
import { ARTEFACTS, WORKBOOK_HEADINGS, type HeadedArtefact } from './headings.js';
import { cell, headingOf, holdsNothing, isEmptyCell, sectionNamed, strayRows, wordOf, type MarkdownDocument, type MarkdownLine } from './markdown.js';

/**
 * How the headings of an artefact differ from the contractual ones, or null when they are the
 * same, in the same order: the first difference — one missing, one unexpected, one out of order.
 */
export function headingDifference(expected: readonly string[], actual: readonly string[], marks: string): string | null {
  const name = (heading: string): string => `\`${marks} ${heading}\``;
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    const wanted = expected[index];
    const found = actual[index];
    if (wanted === found) {
      continue;
    }
    if (found === undefined) {
      return `${name(wanted as string)} is missing`;
    }
    if (wanted === undefined || !expected.includes(found)) {
      const written = expected.find((heading) => heading.toLowerCase() === found.toLowerCase());
      return `${name(found)} is unexpected${written === undefined ? '' : ` (the template writes ${name(written)})`}`;
    }
    if (actual.indexOf(found) < index) {
      return `${name(found)} is written twice`;
    }
    if (!actual.includes(wanted)) {
      return `${name(wanted)} is missing (expected before ${name(found)})`;
    }
    return `${name(found)} is out of order (${name(wanted)} is expected there)`;
  }
  return null;
}

/**
 * What every artefact owes: the `## ` headings of its template, no placeholder of the template, no
 * `> To revise — DEC-nnnn` line left by a decision, and — unless `emptySections` is false, for the
 * need, which gate 1 judged — no contractual section left empty.
 */
export function commonFindings(artefact: HeadedArtefact, document: MarkdownDocument, options: { emptySections: boolean }): Finding[] {
  const findings: Finding[] = [];
  const expected = WORKBOOK_HEADINGS[artefact];
  const difference = headingDifference(
    expected,
    document.sections.map((section) => section.heading),
    '##',
  );
  if (difference !== null) {
    findings.push(error('headings', artefact, null, `the \`## \` headings are not those of the template, in its order: ${difference}`));
  }
  const placeholders = new Map<string, string | null>();
  let section: string | null = null;
  for (const line of document.lines) {
    const heading = headingOf(line);
    if (heading !== null && heading.depth <= 2) {
      section = heading.depth === 2 ? heading.text : null;
    }
    if (line.fenced) {
      // A diagram writes `{{…}}` for a node shape.
      continue;
    }
    for (const match of line.text.matchAll(/\{\{[A-Z][A-Z0-9_]*\}\}/g)) {
      if (!placeholders.has(match[0])) {
        placeholders.set(match[0], section);
      }
    }
    // Tolerant of spacing, of emphasis and of the dash: what a decision left is found however it was retyped.
    const revise = /^>\s*\**\s*To revise\s*[—–-]\s*(DEC-[0-9]+)/.exec(line.text);
    if (revise !== null) {
      findings.push(error('to-revise', artefact, null, `\`> To revise — ${revise[1] as string}\` is left: the step that resumes revises the artefact and removes the line`));
    }
  }
  for (const [placeholder, where] of placeholders) {
    findings.push(error('placeholder', artefact, where, `the placeholder \`${placeholder}\` of the template is left`));
  }
  if (options.emptySections) {
    for (const heading of expected) {
      const found = sectionNamed(document.sections, heading);
      if (found !== null && holdsNothing(found.lines)) {
        findings.push(error('empty-section', artefact, heading, 'the section holds nothing: a section with nothing to say holds `None.`'));
      }
    }
  }
  return findings;
}

/** A `TBD` left in the need: a question is still open, and no plan is written meanwhile. */
export function needTbdFindings(need: MarkdownDocument): Finding[] {
  const open = need.lines.some((line) => /\bTBD\b/.test(line.text));
  return open ? [warning('need-tbd', ARTEFACTS.need, null, 'NEED.md still holds TBD: no plan while a blocking question is open')] : [];
}

/**
 * What a table that is not the template's declares alone. In a section, a table that has the key
 * column of the rule and none of its other columns is not read: it may repeat what a read table
 * declares — a note on each indicator —, but a name it alone holds is declared nowhere. The rule
 * is held where a name hidden that way would escape another rule: the criteria, the indicators
 * and the invariants (the run reads what the check reads), the agents, the tasks, the tools (the
 * mail rule), the mount points and the deliverables (the read-only rule). Elsewhere — datasets,
 * judges, budget, risks, batches, anchors, assumptions — a second table with the key column alone
 * is the author's own, and simply not read. `declared` holds what the read tables declare;
 * `shape`, when given, what a value must look like to count (an id among other words, a virtual
 * path among the fields of a file); `read`, how the key cell is read when it is no single word.
 */
export function strayFindings(code: Finding['code'], artefact: string, section: string, lines: readonly MarkdownLine[], key: string, others: readonly string[], declared: ReadonlySet<string>, shape?: RegExp, read: (text: string) => string = wordOf): Finding[] {
  const values = strayRows(lines, key, others)
    .map((row) => read(cell(row, key)))
    .filter((value) => !isEmptyCell(value) && (shape === undefined || shape.test(value)));
  const alone = [...new Set(values)].filter((value) => !declared.has(value));
  if (alone.length === 0) {
    return [];
  }
  const shown = alone.slice(0, 5).map((value) => `\`${value}\``);
  const names = alone.length > 5 ? `${shown.join(', ')} and ${String(alone.length - 5)} more` : listOf(shown);
  const columns = others.map((other) => `\`${other}\``);
  const lacking = columns.length <= 1 ? columns.join('') : `${columns.slice(0, -1).join(', ')} or ${columns.at(-1) as string}`;
  return [error(code, artefact, section, `${names} ${alone.length === 1 ? 'stands' : 'stand'} in a table that is not the template's — it has no ${lacking} column: ${alone.length === 1 ? 'it is' : 'they are'} not declared`)];
}
