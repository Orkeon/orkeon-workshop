export const SEVERITIES = ['error', 'warning'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * What a check of the workbook can find, in the order the findings are printed (after their
 * severity): what every artefact owes, then gate 2 — `ACCEPTANCE.md`, `TEST-PLAN.md`,
 * `bench.config.json` —, gate 3 — `DESIGN.md`, `PLAN.md` — and the ids ↔ tests traceability. The
 * codes are part of the `--json` output the skills and the evals read: frozen literals.
 */
export const FINDING_CODES = [
  'headings',
  'placeholder',
  'to-revise',
  'empty-section',
  'need-tbd',
  'id-malformed',
  'id-duplicate',
  'ac-none',
  'ac-incomplete',
  'level',
  'ac-status',
  'ac-dataset',
  'ac-no-dataset',
  'ind-incomplete',
  'inv-incomplete',
  'inv-unknown',
  'inv-always',
  'inv-level',
  'dataset-incomplete',
  'dataset-unknown-id',
  'dataset-unused',
  'adversarial-missing',
  'judge-incomplete',
  'target-profile',
  'budget',
  'config-missing',
  'config-invalid',
  'config-budget',
  'config-placeholder',
  'config-remote',
  'config-local',
  'process',
  'process-manager',
  'process-failure',
  'agents-count',
  'agent-incomplete',
  'unknown-tool',
  'mail-read-send',
  'mail-send',
  'tool-incomplete',
  'tool-shadow',
  'task-incomplete',
  'task-cycle',
  'task-reads',
  'diagram',
  'mounts',
  'mounts-need',
  'deliverable',
  'deliverable-orphan',
  'resume',
  'risks',
  'batch-id',
  'batch-incomplete',
  'batch-unknown-id',
  'coverage',
  'light-track',
  'sheet',
  'steps',
  'anchors',
  'anchors-path',
  'anchors-tests',
  'assumptions',
  'tests-none',
  'test-orphan',
  'test-unknown-id',
  'test-unreadable',
  'untested',
  'test-level',
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

/** One thing a check found wrong, or worth a look, in an artefact. */
export interface Finding {
  readonly severity: Severity;
  readonly code: FindingCode;
  /** The file name of the artefact, or the path of a test file relative to `tests/<slug>/`. */
  readonly artefact: string;
  /** The heading the finding lies under, without its `#` marks (`B2` for a sheet), or null. */
  readonly section: string | null;
  readonly message: string;
}

/** A check that could not be made, and why: it is done by hand, and changes no exit code. */
export interface SkippedCheck {
  readonly check: string;
  readonly reason: string;
}

export function error(code: FindingCode, artefact: string, section: string | null, message: string): Finding {
  return { severity: 'error', code, artefact, section, message };
}

export function warning(code: FindingCode, artefact: string, section: string | null, message: string): Finding {
  return { severity: 'warning', code, artefact, section, message };
}

/** The findings as they are printed: errors first, then in the order of `FINDING_CODES`; two of one code keep their order. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const rank = (finding: Finding): number => SEVERITIES.indexOf(finding.severity) * FINDING_CODES.length + FINDING_CODES.indexOf(finding.code);
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => rank(a.finding) - rank(b.finding) || a.index - b.index)
    .map(({ finding }) => finding);
}

/** `a`, `a and b`, `a, b and c`: the items of a message. */
export function listOf(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) as string}`;
}
