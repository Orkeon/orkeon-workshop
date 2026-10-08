import { levelOfCell } from '../level-cell.js';
import { LEVELS, type Level } from '../bench-config.js';
import { ID_PATTERNS } from '../ids.js';
import { ownProperty } from '../records.js';
import { LEVEL_LABELS } from '../run.js';
import { error, listOf, type Finding } from './finding.js';
import { ARTEFACTS } from './headings.js';
import { idOf, isDropped, thresholdOf } from './acceptance-cells.js';
import { strayFindings } from './common-rules.js';
import { cell, choiceOf, isEmptyCell, rowsWith, sectionNamed, shapedValueOf, valueOf, type MarkdownDocument, type TableRow } from './markdown.js';

/**
 * The standard invariants (`references/testing/invariants-catalog.md`) and the lowest level that
 * can observe each: the only `INV-<NAME>` ids there are — a team's own are `INV-01`, `INV-02`…
 */
export const INVARIANT_CATALOGUE: Readonly<Record<string, Level>> = Object.freeze({
  'INV-FS': 'component',
  'INV-SECRETS': 'component',
  'INV-EMAIL': 'component',
  'INV-TOOLS': 'component',
  'INV-SCHEMA': 'component',
  'INV-IDEMP': 'e2e_local',
  'INV-RESUME': 'component',
  'INV-INCR': 'component',
  'INV-BUDGET': 'e2e_local',
  'INV-INJECTION': 'e2e_local',
});

/** The invariants of the catalogue that apply to every team: each one is declared. */
export const ALWAYS_INVARIANTS = ['INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET'] as const;

/** A row of `ACCEPTANCE.md` the checks count on: its id and the level its `Level` cell names. */
export interface DeclaredRow {
  readonly id: string;
  /** Null when the cell names no single level. */
  readonly level: Level | null;
}

/** An active acceptance criterion, with the `Given` cell that names its dataset. */
export interface DeclaredCriterion extends DeclaredRow {
  readonly given: string;
}

/** An indicator, with the number its `Threshold` cell holds when it holds one. */
export interface DeclaredIndicatorRow extends DeclaredRow {
  readonly threshold: number | null;
}

/** What `ACCEPTANCE.md` declares, read in its three tables. */
export interface WorkbookIds {
  /** The active acceptance criteria. */
  readonly criteria: readonly DeclaredCriterion[];
  readonly indicators: readonly DeclaredIndicatorRow[];
  readonly invariants: readonly DeclaredRow[];
  /** The ids of the rows whose status starts with `dropped`: known, and given up by a decision. */
  readonly dropped: readonly string[];
}

export interface AcceptanceReading {
  readonly ids: WorkbookIds;
  /** The `Level` cell of each declared id, as written: what a report quotes when it cannot read a level. */
  readonly levelCells: ReadonlyMap<string, string>;
  readonly findings: readonly Finding[];
}

/** The two ways an indicator reads its threshold: higher is better, lower is better. */
const DIRECTIONS = ['>=', '<='];

const LEVELS_HINT = LEVELS.map((level) => LEVEL_LABELS[level]).join(' · ');

interface Family {
  readonly section: 'Acceptance criteria' | 'Indicators' | 'Invariants';
  readonly kind: 'AC' | 'IND' | 'INV';
  readonly shape: string;
  /** The columns that, with `Id`, make a table the table of the family: another table of the section is the author's own. */
  readonly columns: readonly string[];
}

const FAMILIES: readonly Family[] = [
  { section: 'Acceptance criteria', kind: 'AC', shape: 'an acceptance criterion id (`AC-nn`, two digits or more)', columns: ['Given', 'Then'] },
  { section: 'Indicators', kind: 'IND', shape: 'an indicator id (`IND-nn`, two digits or more)', columns: ['Measure', 'Threshold'] },
  { section: 'Invariants', kind: 'INV', shape: 'an invariant id (`INV-nn`, or `INV-<NAME>` of the catalogue)', columns: ['Statement', 'Check'] },
];

/** An id of one of the three families, wherever it stands. */
const ANY_ID = new RegExp(`${ID_PATTERNS.AC.source}|${ID_PATTERNS.IND.source}|${ID_PATTERNS.INV.source}`);

/** The status of a criterion, as the template writes it; a remark may follow. */
const STATUS = /^(?:active|dropped \(DEC-\d{4}\))/;

/**
 * The ids a cell cites, each once, whatever the words around them: `IND-04 (L3), IND-05 (L4)`. A
 * range — `IND-02…IND-07` — names its two ends only: an id is cited where it is written.
 */
export function citedIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(?:AC|IND|INV)-[A-Za-z0-9]+\b/g)].map((match) => match[0]))];
}

/** Every id that is declared and not dropped. */
export function declaredIds(ids: WorkbookIds): string[] {
  return [...ids.criteria, ...ids.indicators, ...ids.invariants].map((row) => row.id);
}

/** Why a cited id is not one to cite — unknown to `ACCEPTANCE.md`, or dropped — or null when it is declared. */
export function undeclared(ids: WorkbookIds, id: string): string | null {
  if (declaredIds(ids).includes(id)) {
    return null;
  }
  return ids.dropped.includes(id) ? `\`${id}\` is dropped` : `\`ACCEPTANCE.md\` does not declare \`${id}\``;
}

/** The active criteria, the indicators and the invariants that sit at a level. */
export function idsAtLevel(ids: WorkbookIds, level: Level): string[] {
  return [...ids.criteria, ...ids.indicators, ...ids.invariants].filter((row) => row.level === level).map((row) => row.id);
}

/**
 * Reads the three tables of `ACCEPTANCE.md` and judges each row (gate 2): well-formed ids, written
 * once; a criterion with its dataset, trigger, outcome, level and status; an indicator with its
 * measure and threshold; an invariant with its check, known to the catalogue and at a level that
 * can observe it. A dropped row is only read for its id and its status.
 */
export function readAcceptance(document: MarkdownDocument): AcceptanceReading {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], section: string, message: string): void => {
    findings.push(error(code, ARTEFACTS.acceptance, section, message));
  };
  const seen = new Set<string>();
  const dropped: string[] = [];
  const criteria: DeclaredCriterion[] = [];
  const indicators: DeclaredIndicatorRow[] = [];
  const invariants: DeclaredRow[] = [];
  const levelCells = new Map<string, string>();
  const active = new Set<string>();

  for (const family of FAMILIES) {
    const section = sectionNamed(document.sections, family.section);
    const rows = section === null ? [] : rowsWith(section.lines, 'Id', family.columns);
    rows.forEach((row, index) => {
      const id = idOf(cell(row, 'Id'));
      const label = id === '' ? `row ${String(index + 1)}` : id;
      const valid = ID_PATTERNS[family.kind].test(id);
      if (!valid) {
        report('id-malformed', family.section, malformed(family, id, index));
      }
      if (id !== '' && seen.has(id)) {
        report('id-duplicate', family.section, `\`${id}\` is on two rows: an id names one row, and is never reused`);
      }
      const first = id !== '' && !seen.has(id);
      seen.add(id);
      // A row that is active somewhere is not dropped, whatever another row of the same id says: the duplicate is the error.
      const declares = (): boolean => valid && !active.has(id) && active.add(id).has(id);
      const status = shapedValueOf(cell(row, 'Status'), STATUS);
      if (family.kind === 'AC' && STATUS.exec(status)?.[0] !== status) {
        report('ac-status', family.section, `${label}: \`Status\` ${status === '' ? 'is empty' : `\`${status}\``} — neither \`active\` nor \`dropped (DEC-nnnn)\``);
      }
      if (isDropped(cell(row, 'Status'))) {
        if (valid && first) {
          dropped.push(id);
        }
        return;
      }
      const levelCell = cell(row, 'Level');
      const level = levelOfCell(levelCell);
      if (valid && !active.has(id)) {
        levelCells.set(id, levelCell);
      }
      if (level === null) {
        report('level', family.section, `${label}: \`Level\` ${levelCell === '' ? 'is empty' : `\`${levelCell}\` names no single level`} — one of ${LEVELS_HINT}`);
      }
      const empty = (headers: readonly string[]): string[] => headers.filter((header) => isEmptyCell(cell(row, header))).map((header) => `\`${header}\``);
      if (family.kind === 'AC') {
        const missing = empty(['Given', 'When', 'Then']).map((header) => (header === '`Given`' ? '`Given (dataset)`' : header));
        if (missing.length > 0) {
          report('ac-incomplete', family.section, `${label}: empty ${listOf(missing)}`);
        }
        if (declares()) {
          criteria.push({ id, level, given: cell(row, 'Given') });
        }
      } else if (family.kind === 'IND') {
        const problems = [...empty(['Measure', 'Unit']).map((header) => `empty ${header}`), ...indicatorProblems(row)];
        if (problems.length > 0) {
          report('ind-incomplete', family.section, `${label}: ${problems.join('; ')}`);
        }
        if (declares()) {
          indicators.push({ id, level, threshold: thresholdOf(cell(row, 'Threshold')) });
        }
      } else {
        const missing = empty(['Statement', 'Check']);
        if (missing.length > 0) {
          report('inv-incomplete', family.section, `${label}: empty ${listOf(missing)} — a declared invariant without a check is a failing one`);
        }
        findings.push(...invariantFindings(id, valid, level));
        if (declares()) {
          invariants.push({ id, level });
        }
      }
    });
  }

  // An id that only a table the rules do not read holds is declared nowhere: `run` would not see it either.
  for (const family of FAMILIES) {
    const section = sectionNamed(document.sections, family.section);
    const code = family.kind === 'AC' ? 'ac-incomplete' : family.kind === 'IND' ? 'ind-incomplete' : 'inv-incomplete';
    findings.push(...strayFindings(code, ARTEFACTS.acceptance, family.section, section?.lines ?? [], 'Id', family.columns, seen, ANY_ID));
  }

  if (criteria.length === 0) {
    report('ac-none', 'Acceptance criteria', 'no active acceptance criterion: a report without any AC is never accepted');
  }
  for (const always of ALWAYS_INVARIANTS) {
    if (!invariants.some((invariant) => invariant.id === always)) {
      report('inv-always', 'Invariants', `\`${always}\` is not declared: it applies to every team`);
    }
  }
  return { ids: { criteria, indicators, invariants, dropped: dropped.filter((id) => !active.has(id)) }, levelCells, findings };
}

function malformed(family: Family, id: string, index: number): string {
  if (id === '') {
    return `row ${String(index + 1)} has no id`;
  }
  const other = FAMILIES.find((candidate) => candidate !== family && ID_PATTERNS[candidate.kind].test(id));
  return `\`${id}\` is not ${family.shape}${other === undefined ? '' : `: it belongs in \`## ${other.section}\``}`;
}

/** What is wrong with the threshold and the direction of an indicator row. */
function indicatorProblems(row: TableRow): string[] {
  const problems: string[] = [];
  const threshold = valueOf(cell(row, 'Threshold'));
  if (thresholdOf(cell(row, 'Threshold')) === null) {
    problems.push(`\`Threshold\` ${threshold === '' ? 'is empty' : `\`${threshold}\` is not a number`} (a number with a decimal point and no unit)`);
  }
  const direction = choiceOf(cell(row, 'Direction'), DIRECTIONS);
  if (!DIRECTIONS.includes(direction)) {
    problems.push(`\`Direction\` ${direction === '' ? 'is empty' : `\`${direction}\``} — neither \`>=\` nor \`<=\``);
  }
  return problems;
}

/** An `INV-<NAME>` outside the catalogue, or one of the catalogue below the lowest level that observes it. */
function invariantFindings(id: string, valid: boolean, level: Level | null): Finding[] {
  if (!valid || !/^INV-[A-Z]/.test(id)) {
    return [];
  }
  const lowest = ownProperty(INVARIANT_CATALOGUE, id);
  if (lowest === undefined) {
    const known = Object.keys(INVARIANT_CATALOGUE).join(', ');
    return [error('inv-unknown', ARTEFACTS.acceptance, 'Invariants', `\`${id}\` is not an invariant of the catalogue (${known}): a team's own invariant is \`INV-01\`, \`INV-02\`…`)];
  }
  if (level !== null && LEVELS.indexOf(level) < LEVELS.indexOf(lowest)) {
    return [error('inv-level', ARTEFACTS.acceptance, 'Invariants', `\`${id}\` is declared at ${LEVEL_LABELS[level]}, below ${LEVEL_LABELS[lowest]}, the lowest level that can observe it`)];
  }
  return [];
}
