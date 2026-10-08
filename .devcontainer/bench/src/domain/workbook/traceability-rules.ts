import { LEVELS, type Level } from '../bench-config.js';
import { LEVEL_LABELS } from '../run.js';
import { SCENARIO_SUFFIX } from '../scenario.js';
import { jsonSyntaxErrorAt } from '../strict-json.js';
import { INVARIANT_CATALOGUE, undeclared, type DeclaredRow, type WorkbookIds } from './acceptance-rules.js';
import { error, type Finding } from './finding.js';
import { ARTEFACTS } from './headings.js';

/**
 * The folders of `tests/<slug>/` that hold tests, with the levels a test of each serves when it
 * names none: `e2e/` runs on the local model and on the remote one.
 */
export const TEST_FOLDERS: Readonly<Record<string, readonly Level[]>> = Object.freeze({
  static: ['static'],
  unit: ['unit'],
  component: ['component'],
  e2e: ['e2e_local', 'e2e_remote'],
});

/** The folders, at any depth below a test folder, that hold no test: data, rubrics, installed packages, what a build or a run leaves. */
export const NOT_TESTS = ['datasets', 'judges', 'node_modules', 'dist', 'build', 'bin', 'obj', 'coverage', '__pycache__'];

/** What a finding names when no test file is there to name. */
export const TESTS_FOLDER = 'tests';

/** A file of `tests/<slug>/`, by its path relative to that folder. */
export interface TestFile {
  readonly path: string;
  /** Null when the file could not be read: a link to nothing, a file that is no file. */
  readonly text: string | null;
}

/** What `--tests` adds to the result of a check. */
export interface TestsSummary {
  /** The number of test files read. */
  readonly files: number;
  /** The active criteria and the declared invariants that no test cites. */
  readonly uncovered: readonly string[];
  /** The tests that cite no id. */
  readonly orphans: readonly string[];
}

export interface Traceability {
  readonly summary: TestsSummary;
  readonly findings: readonly Finding[];
}

/** What a folder of `static/` may hold besides its expectations: a word on them, for people. */
const STATIC_NOTES = 'README.md';

/** A unit test by its name: `dedupe.test.ts`, `dedupe.spec.js` — a helper, a fixture or a configuration beside it is none. */
const UNIT_TEST_NAME = /\.(?:test|spec)\.[^.]+$/;

/**
 * Whether a file of `tests/<slug>/`, by its relative path, may be a test: a `*.scenario.json` of
 * one of the four test folders, a `*.test.*` or `*.spec.*` file of `unit/`, or any other file of
 * `static/` but a `README.md` — which is a test once it cites an id, and a note otherwise. A
 * hidden file, such as a `.gitkeep`, and what lies under a folder of `NOT_TESTS` are none.
 */
export function isTestFile(path: string): boolean {
  const segments = path.split('/');
  const folder = segments[0] as string;
  const name = segments.at(-1) as string;
  if (segments.length < 2 || !Object.hasOwn(TEST_FOLDERS, folder) || segments.some((segment) => segment.startsWith('.') || NOT_TESTS.includes(segment))) {
    return false;
  }
  return path.endsWith(SCENARIO_SUFFIX) || (folder === 'static' && name !== STATIC_NOTES) || (folder === 'unit' && UNIT_TEST_NAME.test(name));
}

/** The ids a unit test or a static expectation names in its text. */
function idsInText(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(?:(?:AC|IND)-\d{2,}|INV-(?:\d{2,}|[A-Z][A-Z0-9]*))\b/g)].map((match) => match[0]))];
}

/** The id a file is named after, as the tests name theirs: `ac-03-mail-tools.txt`, `inv-fs-roots.json`. */
function idInName(path: string): string[] {
  const match = /^(ac|ind|inv)-([0-9]{2,}|[a-z][a-z0-9]*)(?![a-z0-9])/.exec((path.split('/').at(-1) as string).toLowerCase());
  const id = match === null ? '' : `${(match[1] as string).toUpperCase()}-${(match[2] as string).toUpperCase()}`;
  const numbered = /^(?:AC|IND|INV)-[0-9]+$/.test(id);
  return numbered || Object.hasOwn(INVARIANT_CATALOGUE, id) ? [id] : [];
}

/**
 * The ids ↔ tests traceability (the "tests red" gate): every test cites an id that is declared, and
 * every active criterion and declared invariant is cited by a test of its own level.
 */
export function traceability(files: readonly TestFile[], ids: WorkbookIds): Traceability {
  const findings: Finding[] = [];
  const tests: { path: string; cites: string[]; levels: readonly Level[] }[] = [];
  const orphans: string[] = [];
  let read = 0;
  for (const file of files.filter((candidate) => isTestFile(candidate.path))) {
    const folderName = file.path.split('/')[0] as string;
    const folder = TEST_FOLDERS[folderName] as readonly Level[];
    let cites: string[];
    let levels = folder;
    if (file.text === null) {
      read += 1;
      findings.push(error('test-unreadable', file.path, null, 'the file cannot be read: a link to nothing, or no file'));
      continue;
    }
    if (file.path.endsWith(SCENARIO_SUFFIX)) {
      read += 1;
      let scenario: unknown;
      try {
        scenario = JSON.parse(file.text.startsWith('﻿') ? file.text.slice(1) : file.text);
      } catch {
        const at = jsonSyntaxErrorAt(file.text);
        findings.push(error('test-unreadable', file.path, null, at === null ? 'not valid JSON' : `not valid JSON: line ${String(at.line)}, column ${String(at.column)}`));
        continue;
      }
      const fields = typeof scenario === 'object' && scenario !== null ? (scenario as { covers?: unknown; level?: unknown }) : {};
      const covers = fields.covers ?? [];
      if (!Array.isArray(covers) || covers.some((id) => typeof id !== 'string')) {
        findings.push(error('test-unreadable', file.path, null, '`covers` is not a list of ids'));
        continue;
      }
      cites = [...new Set(covers as string[])];
      if (fields.level !== undefined) {
        // One of `LEVELS`, as `scenarioSchema` asks: a label (`L3`) is no level of a scenario, and no run would take it.
        const level = LEVELS.find((known) => known === fields.level) ?? null;
        if (level === null) {
          findings.push(error('test-unreadable', file.path, null, `\`level\` is none of the levels the bench knows (${LEVELS.join(', ')})`));
          continue;
        }
        if (!folder.includes(level)) {
          findings.push(error('test-level', file.path, null, `the scenario says level \`${level}\` (${LEVEL_LABELS[level]}) and lies in \`${folderName}/\`, which serves ${folder.map((served) => LEVEL_LABELS[served]).join(' and ')}: no run picks it up at its level`));
        }
        levels = [level];
      }
    } else {
      cites = [...new Set([...idsInText(file.text), ...(folderName === 'static' ? idInName(file.path) : [])])];
      if (folderName === 'static' && cites.length === 0) {
        // A note, an expected layout: what cites no id under `static/` is no test.
        continue;
      }
      read += 1;
    }
    tests.push({ path: file.path, cites, levels });
    if (cites.length === 0) {
      orphans.push(file.path);
      findings.push(error('test-orphan', file.path, null, 'the test cites no id: a test names the `AC-`, `IND-` or `INV-` id it proves'));
    }
    for (const reason of cites.map((id) => undeclared(ids, id)).filter((found) => found !== null)) {
      findings.push(error('test-unknown-id', file.path, null, `the test cites an id that is not one to prove — ${reason}`));
    }
  }
  if (read === 0) {
    findings.push(error('tests-none', TESTS_FOLDER, null, `no test file under ${Object.keys(TEST_FOLDERS).map((folder) => `\`${folder}/\``).join(', ')}: the tests exist before the team`));
  }

  const uncovered: string[] = [];
  const judge = (row: DeclaredRow, section: string): void => {
    const citing = tests.filter((test) => test.cites.includes(row.id));
    if (citing.length === 0) {
      uncovered.push(row.id);
      findings.push(error('untested', ARTEFACTS.acceptance, section, `\`${row.id}\` is cited by no test`));
    } else if (row.level !== null && !citing.some((test) => test.levels.includes(row.level as Level))) {
      const where = citing.map((test) => `${test.path} (${test.levels.map((level) => LEVEL_LABELS[level]).join(', ')})`);
      findings.push(error('test-level', ARTEFACTS.acceptance, section, `\`${row.id}\` sits at ${LEVEL_LABELS[row.level]} and is cited only by tests of another level: ${where.join(', ')}`));
    }
  };
  ids.criteria.forEach((criterion) => judge(criterion, 'Acceptance criteria'));
  ids.invariants.forEach((invariant) => judge(invariant, 'Invariants'));
  return { summary: { files: read, uncovered, orphans }, findings };
}
