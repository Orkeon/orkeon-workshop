import { reportSchema, type VerdictInput } from '../../domain/report.js';
import { describeIssues } from '../../domain/schema.js';
import { computeVerdictInput, isAccepted, verdictInputDiscrepancies } from '../../domain/verdict.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';

export interface ReportValidation {
  readonly path: string;
  readonly valid: boolean;
  /** Schema violations, then inconsistencies between `verdict_input` and the report content. */
  readonly issues: readonly string[];
  /** The verdict input implied by the content, when the schema holds. */
  readonly verdictInput: VerdictInput | null;
  /** True when the implied verdict input yields ACCEPTED. */
  readonly accepted: boolean;
}

/** Checks a `report.json` against schema 1.0 and the verdict rule. */
export class ValidateReport {
  constructor(private readonly fileSystem: FileSystem) {}

  async execute(path: string): Promise<ReportValidation> {
    if (!(await this.fileSystem.exists(path))) {
      throw new ApplicationError('file-not-found', `report not found: ${path}`);
    }
    const parsed = reportSchema.safeParse(await readJsonFile(this.fileSystem, path));
    if (!parsed.success) {
      return { path, valid: false, issues: describeIssues(parsed.error), verdictInput: null, accepted: false };
    }
    const issues = verdictInputDiscrepancies(parsed.data);
    const verdictInput = computeVerdictInput(parsed.data);
    return { path, valid: issues.length === 0, issues, verdictInput, accepted: isAccepted(verdictInput) };
  }
}
