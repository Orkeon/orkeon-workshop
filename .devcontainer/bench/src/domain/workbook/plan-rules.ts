import { batchIdSchema } from '../ids.js';
import type { Track } from '../status.js';
import { citedIds, undeclared, type WorkbookIds } from './acceptance-rules.js';
import { headingDifference } from './common-rules.js';
import { error, listOf, warning, type Finding } from './finding.js';
import { ARTEFACTS, CORRECTION_HEADING, WORKBOOK_HEADINGS } from './headings.js';
import { backTicked, cell, holdsNothing, isEmptyCell, ownLines, rowsWith, saysNone, sectionNamed, sectionsOf, shapedValueOf, unquote, wordOf, type MarkdownDocument, type MarkdownSection } from './markdown.js';

/** The status of a batch, as `## Batches` writes it; a remark may follow. */
const BATCH_STATUS = /^(?:todo|in progress|done \(ATT-\d{4}\))/;

/** The proof ticks every step line carries, unticked `☐` or ticked `✅` on an observed result. */
const PROOF_TICKS = /TESTS\s*[☐✅]\s*·\s*BUILD\s*[☐✅]\s*·\s*L0\/L1\s*[☐✅]/u;
const PROOF_TICKS_HINT = '`TESTS ☐ · BUILD ☐ · L0/L1 ☐`';

/** The trees the implementer never writes in: an anchor names none of their files. */
const FROZEN_TREES = ['tests/', 'workbooks/'];

/** The parts of a sheet that may say `None.`; an intent, steps and anchors are never none. */
const MAY_BE_NONE = ['Design decisions', 'Assumptions'];

/**
 * The steps of a part, with whether each carries its proof ticks: the numbered lines at the indent
 * of its first numbered line — none to three blanks, a list may be indented as a whole. A numbered
 * line indented more is a detail of the step above, not a step.
 */
function stepLines(section: MarkdownSection): { number: number; ticked: boolean }[] {
  const numbered = ownLines(section)
    .filter((line) => !line.fenced)
    .map((line) => /^( *)(\d+)[.)]\s+(.*)$/.exec(line.text))
    .filter((match) => match !== null);
  const indent = (numbered[0]?.[1] as string | undefined)?.length ?? 0;
  return indent > 3 ? [] : numbered.filter((match) => (match[1] as string).length <= indent).map((match) => ({ number: Number(match[2]), ticked: PROOF_TICKS.test(match[3] as string) }));
}

/**
 * The steps a `Step` cell of the anchors names, read by its leading numbers only: `1 (before B2)`
 * is step 1, `1, 2 and 3` three steps, `1–3` and `1-3` the steps 1 to 3.
 */
function stepsNamed(text: string): number[] {
  const numbers = new Set<number>();
  let rest = unquote(text);
  for (;;) {
    const match = /^\s*(\d+)(?:\s*[–-]\s*(\d+))?/.exec(rest);
    if (match === null) {
      break;
    }
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    // A range that runs backwards, or without end: its two ends.
    const range = to >= from && to - from < 100 ? Array.from({ length: to - from + 1 }, (_, index) => from + index) : [from, to];
    range.forEach((number) => numbers.add(number));
    rest = rest.slice(match[0].length);
    const joiner = /^\s*(?:[,;&]|and\b|et\b)/.exec(rest);
    if (joiner === null) {
      break;
    }
    rest = rest.slice(joiner[0].length);
  }
  return [...numbers];
}

/** A path as an anchor compares it: without the `./` and the `../` it opens with. */
function relative(path: string): string {
  return path.replace(/^(?:\.{1,2}\/)+/, '');
}

/**
 * The files an anchor cell names. `step`: those of the step — the back-ticked spans outside
 * brackets, or failing any back-tick the words outside brackets. `remarked`: the back-ticked paths
 * the cell writes in brackets — no file of the step, but a path all the same, and held to the rule
 * of the trees the implementer never writes in.
 */
function filesIn(cell: string): { step: string[]; remarked: string[] } {
  const outside = cell.replace(/\([^()]*\)/g, ' ');
  const quoted = backTicked(outside);
  const step = (quoted.length > 0 ? quoted : outside.split(/(?:<br\s*\/?>|[\s,;])+/i)).map(relative).filter((file) => file !== '');
  const remarked = [...cell.matchAll(/\(([^()]*)\)/g)].flatMap((match) => backTicked(match[1] as string)).map(relative);
  return { step, remarked };
}

/** Numbers as a message names them: `3`, `3, 5`, and a run as its two ends, `3–99`. */
function ranges(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index;
    while (sorted[end + 1] === (sorted[end] as number) + 1) {
      end += 1;
    }
    parts.push(end - index >= 2 ? `${String(sorted[index])}–${String(sorted[end])}` : sorted.slice(index, end + 1).join(', '));
    index = end;
  }
  return parts.join(', ');
}

/**
 * `PLAN.md` (gate 3): batches `B1`, `B2`… that cover every active criterion and every declared
 * invariant, and for each its sheet — the contract the implementer receives — with its parts in
 * the fixed order, its steps with their proof ticks and its anchors.
 */
export function planFindings(plan: MarkdownDocument, ids: WorkbookIds, track: Track): Finding[] {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], section: string, message: string): void => {
    findings.push(error(code, ARTEFACTS.plan, section, message));
  };
  const batches = sectionNamed(plan.sections, 'Batches');
  if (batches === null) {
    return findings;
  }

  const rows = rowsWith(batches.lines, 'Batch', ['Scope', 'AC/INV covered', 'Status']);
  const batchIds: string[] = [];
  const covered = new Set<string>();
  rows.forEach((row, index) => {
    const id = wordOf(cell(row, 'Batch'));
    const label = id === '' ? `row ${String(index + 1)}` : id;
    const parsed = batchIdSchema.safeParse(id);
    if (id === '') {
      report('batch-id', 'Batches', `row ${String(index + 1)} has no batch id`);
    } else if (!parsed.success) {
      report('batch-id', 'Batches', `\`${id}\`: ${parsed.error.issues[0]?.message ?? 'expected a batch id such as B1'}`);
    } else if (batchIds.includes(id)) {
      report('batch-id', 'Batches', `\`${id}\` is on two rows`);
    }
    const problems = ['Scope', 'Tests that must pass', 'Expected cost'].filter((header) => isEmptyCell(cell(row, header))).map((header) => `empty \`${header}\``);
    const status = shapedValueOf(cell(row, 'Status'), BATCH_STATUS);
    if (BATCH_STATUS.exec(status)?.[0] !== status) {
      problems.push(`\`Status\` ${status === '' ? 'is empty' : `\`${status}\``} — none of \`todo\`, \`in progress\`, \`done (ATT-nnnn)\``);
    }
    if (problems.length > 0) {
      report('batch-incomplete', 'Batches', `${label}: ${problems.join('; ')}`);
    }
    for (const cited of citedIds(cell(row, 'AC/INV covered'))) {
      covered.add(cited);
      const reason = undeclared(ids, cited);
      if (reason !== null) {
        report('batch-unknown-id', 'Batches', `${label}: \`AC/INV covered\` — ${reason}`);
      }
    }
    if (id !== '') {
      batchIds.push(id);
    }
  });
  if (rows.length === 0) {
    report('batch-id', 'Batches', 'no batch: a plan has at least `B1`');
  }
  for (const row of [...ids.criteria, ...ids.invariants]) {
    if (!covered.has(row.id)) {
      report('coverage', 'Batches', `\`${row.id}\` is covered by no batch`);
    }
  }
  if (track === 'light' && (rows.length > 1 || (rows.length === 1 && batchIds[0] !== 'B1'))) {
    report('light-track', 'Batches', `\`STATUS.md\` says \`track: light\` and the plan has ${batchIds.length === 0 ? 'a batch without id' : listOf(batchIds.map((id) => `\`${id}\``))}: the light track builds the single batch \`B1\``);
  }

  // A heading that opens with a batch id and goes on — `### B1 — tools` — is the sheet of that batch, wrongly titled.
  const longestFirst = [...batchIds].sort((a, b) => b.length - a.length);
  const sheets = sectionsOf(batches.lines, 3).map((sheet) => {
    const heading = unquote(sheet.heading);
    const batch = batchIds.includes(heading) ? heading : longestFirst.find((id) => heading.startsWith(id) && !/[A-Za-z0-9]/.test(heading.charAt(id.length)));
    return { sheet, heading, batch: batch ?? null };
  });
  for (const id of new Set(batchIds)) {
    if (!sheets.some((sheet) => sheet.batch === id)) {
      report('sheet', 'Batches', `batch \`${id}\` has no \`### ${id}\` sheet`);
    }
  }
  const seen = new Set<string>();
  for (const { sheet, heading, batch } of sheets) {
    const name = batch ?? heading;
    if (seen.has(name)) {
      report('sheet', name, `the sheet \`### ${name}\` is written twice`);
      continue;
    }
    seen.add(name);
    if (batch === null) {
      report('sheet', name, `the sheet \`### ${name}\` has no row in \`## Batches\``);
    } else if (heading !== batch) {
      report('sheet', name, `the sheet of \`${batch}\` is headed \`### ${heading}\`: a sheet heading is the batch id alone, \`### ${batch}\``);
    }
    findings.push(...sheetFindings(name, sheet));
  }
  return findings;
}

/** One sheet: its parts in order, none empty, steps with their ticks, anchors for every step, assumptions with their validator. */
function sheetFindings(name: string, sheet: MarkdownSection): Finding[] {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], message: string): void => {
    findings.push(error(code, ARTEFACTS.plan, name, message));
  };
  const parts = sectionsOf(sheet.lines, 4);
  const firstCorrection = parts.findIndex((part) => CORRECTION_HEADING.test(part.heading));
  const fixed = firstCorrection === -1 ? parts : parts.slice(0, firstCorrection);
  const corrections = firstCorrection === -1 ? [] : parts.slice(firstCorrection);
  const stray = corrections.find((part) => !CORRECTION_HEADING.test(part.heading));
  const difference =
    headingDifference(
      WORKBOOK_HEADINGS.sheet,
      fixed.map((part) => part.heading),
      '####',
    ) ?? (stray === undefined ? null : `\`#### ${stray.heading}\` is unexpected after a correction`);
  if (difference !== null) {
    report('sheet', `the \`#### \` parts are not ${listOf(WORKBOOK_HEADINGS.sheet.map((heading) => `\`${heading}\``))}, in that order: ${difference}`);
  }
  for (const heading of WORKBOOK_HEADINGS.sheet) {
    const part = sectionNamed(fixed, heading);
    if (part === null) {
      continue;
    }
    if (holdsNothing(part.lines)) {
      report('empty-section', `\`#### ${heading}\` holds nothing${MAY_BE_NONE.includes(heading) ? ': a part with nothing to say holds `None.`' : ''}`);
    } else if (heading === 'Intent' && saysNone(part.lines)) {
      report('empty-section', '`#### Intent` says `None.`: a batch has an intent');
    }
  }

  const steps = sectionNamed(fixed, 'Steps');
  const numbers = steps === null ? [] : stepLines(steps).map((step) => step.number);
  for (const part of [...(steps === null ? [] : [steps]), ...corrections.filter((correction) => CORRECTION_HEADING.test(correction.heading))]) {
    const lines = stepLines(part);
    if (lines.length === 0) {
      report('steps', `\`#### ${part.heading}\` has no numbered step`);
    }
    const twice = lines.map((line) => line.number).filter((number, index, all) => all.indexOf(number) !== index);
    for (const number of new Set(twice)) {
      report('steps', `\`#### ${part.heading}\`: step ${String(number)} is numbered twice — a step has its own number, which its anchors name`);
    }
    for (const step of lines.filter((line) => !line.ticked)) {
      report('steps', `\`#### ${part.heading}\`: step ${String(step.number)} lacks its three proof ticks ${PROOF_TICKS_HINT}`);
    }
  }

  const anchors = sectionNamed(fixed, 'Anchors');
  if (anchors !== null) {
    const rows = rowsWith(anchors.lines, 'Step', ['Files to create or edit']);
    if (rows.length === 0) {
      report('anchors', '`#### Anchors` has no row: every file a step creates or edits is named');
    }
    const anchored = new Set<number>();
    rows.forEach((row, index) => {
      const named = stepsNamed(cell(row, 'Step'));
      const label = named.length === 0 ? `anchor row ${String(index + 1)}` : `step ${ranges(named)}`;
      const unknown = named.filter((number) => !numbers.includes(number));
      if (named.length === 0 || unknown.length > 0) {
        report('anchors', `anchor row ${String(index + 1)}: \`Step\` ${named.length === 0 ? 'names no step' : `${ranges(unknown)} is not a step of the sheet`}`);
      }
      named.forEach((number) => anchored.add(number));
      const files = isEmptyCell(cell(row, 'Files to create or edit')) ? { step: [], remarked: [] } : filesIn(cell(row, 'Files to create or edit'));
      if (files.step.length === 0) {
        report('anchors', `${label}: empty \`Files to create or edit\``);
      }
      for (const file of [...files.step, ...files.remarked]) {
        const tree = FROZEN_TREES.find((frozen) => file.startsWith(frozen));
        if (tree !== undefined) {
          report('anchors', `${label}: \`${file}\` lies under \`${tree}\` — the implementer never writes there`);
        } else if (file.startsWith('/') && files.step.includes(file)) {
          findings.push(warning('anchors-path', ARTEFACTS.plan, name, `${label}: \`${file}\` starts with \`/\` — anchors name physical paths relative to the workshop (\`teams/<slug>/crew/…\`, \`library/tools/…\`)`));
        }
      }
      if (isEmptyCell(cell(row, 'Tests that observe it'))) {
        findings.push(warning('anchors-tests', ARTEFACTS.plan, name, `${label} has no test that observes it`));
      }
    });
    for (const number of numbers.filter((step) => !anchored.has(step))) {
      report('anchors', `step ${String(number)} is named by no anchor row`);
    }
  }

  const assumptions = sectionNamed(fixed, 'Assumptions');
  rowsWith(assumptions?.lines ?? [], 'Id', ['Assumption']).forEach((row, index) => {
    const id = wordOf(cell(row, 'Id'));
    const problems = [
      ...(/^H[1-9][0-9]*$/.test(id) ? [] : [id === '' ? 'no id' : 'not an assumption id (`H1`, `H2`…)']),
      ...['Assumption', 'To be validated by'].filter((header) => isEmptyCell(cell(row, header))).map((header) => `empty \`${header}\``),
    ];
    if (problems.length > 0) {
      report('assumptions', `${id === '' ? `assumption row ${String(index + 1)}` : `\`${id}\``}: ${problems.join('; ')}`);
    }
  });
  return findings;
}
