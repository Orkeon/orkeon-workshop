import { parseAcceptance } from '../../domain/acceptance.js';
import type { AttemptId } from '../../domain/ids.js';
import { JUDGEMENTS_FILE, judgedIndicators, mergeJudgements, parseDeclaredJudges, parseJudgementsFile, scoreJudges, type JudgeScore, type ReportIndicatorEntry } from '../../domain/judgements.js';
import { joinPath } from '../../domain/paths.js';
import { parseReport, type Report, type VerdictInput } from '../../domain/report.js';
import { outcomeFromReport, renderReportMarkdown } from '../../domain/run-report.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { computeVerdictInput } from '../../domain/verdict.js';
import { requireOpenAttempt, withAttemptsLock } from '../attempts/attempt-store.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';

export interface EvaluateResult {
  readonly attempt: AttemptId;
  /** Every judge of the report once merged: those of the file and those it already held. */
  readonly judges: readonly JudgeScore[];
  readonly verdictInput: VerdictInput;
  readonly reportFile: string;
  readonly judgementsFile: string;
  /** True when a judge of the merged set is on the wrong side of its threshold. */
  readonly failed: boolean;
}

/**
 * `orkeon-bench evaluate <team> --judgements <file>` (D91): the grades the `judge` agent gave,
 * folded into the report of the open attempt — merged by judge into `judgements.json` beside it,
 * `report.judges` (the same judges, scored from those grades) and the indicators whose measure is a
 * judge filled, the verdict input computed again, and
 * `report.json` and `REPORT.md` rewritten. The bench grades nothing itself.
 */
export class EvaluateJudgements {
  constructor(private readonly fileSystem: FileSystem) {}

  async execute(team: TeamRef, judgementsPath: string): Promise<EvaluateResult> {
    const file = parseJudgementsFile(await readJsonFile(this.fileSystem, judgementsPath));
    const paths = teamPaths(team);
    if (!(await this.fileSystem.exists(paths.teamFile))) {
      throw new ApplicationError('file-not-found', `TEAM.md not found: ${paths.teamFile} — the thresholds of the judges live in its § Acceptance § Judges`);
    }
    const markdown = await this.fileSystem.readText(paths.teamFile);
    const indicators = parseAcceptance(markdown).indicators;
    const declared = parseDeclaredJudges(markdown, indicators);
    // The judges of the file are checked before anything is read from the attempt.
    scoreJudges(file, declared);

    return withAttemptsLock(this.fileSystem, team, async () => {
      const attempt = await requireOpenAttempt(this.fileSystem, team);
      const reportFile = joinPath(attempt.folder, 'report.json');
      if (!(await this.fileSystem.exists(reportFile))) {
        throw new ApplicationError('file-not-found', `${attempt.id} holds no report.json: run orkeon-bench run ${team.slug} first, then grade its outputs`);
      }
      // Read as written — the notes and measures the schema does not hold are kept —, checked by the schema.
      const raw = (await readJsonFile(this.fileSystem, reportFile)) as Record<string, unknown>;
      const report = parseReport(raw);

      // Merged by judge: the grades of a judge this file grades replace that judge's earlier ones; the
      // others are kept from judgements.json — only those the report still holds: a later run writes a
      // report with no judge, and the grades of its predecessor's outputs no longer apply.
      const judgementsFile = joinPath(attempt.folder, JUDGEMENTS_FILE);
      // A judge TEAM.md no longer gives a threshold leaves the report with its grades rather than stop the command.
      const kept = Object.keys(report.judges).filter((id) => declared.some((judge) => judge.id === id && judge.threshold !== null));
      const earlier = (await this.fileSystem.exists(judgementsFile)) ? parseJudgementsFile(await readJsonFile(this.fileSystem, judgementsFile)) : null;
      const merged = mergeJudgements(earlier, file, kept);
      const scores = scoreJudges(merged, declared);

      const judges: Record<string, unknown> = {};
      for (const score of scores) {
        judges[score.id] = { rubric_version: score.rubric_version, judge_model: score.judge_model, score: score.score, threshold: score.threshold, ...(score.direction === '<=' ? { direction: score.direction } : {}) };
      }
      const updated: Record<string, unknown> = { ...raw, judges, indicators: judgedIndicators(raw.indicators as Record<string, ReportIndicatorEntry>, scores, indicators) };
      const verdictInput = computeVerdictInput(parseReport(updated));
      updated.verdict_input = verdictInput;

      await this.fileSystem.writeText(judgementsFile, `${JSON.stringify(merged, null, 2)}\n`);
      await this.fileSystem.writeText(reportFile, `${JSON.stringify(updated, null, 2)}\n`);
      await this.fileSystem.writeText(joinPath(attempt.folder, 'REPORT.md'), renderReportMarkdown(updated as unknown as Report, outcomeFromReport(updated)));
      return { attempt: attempt.id, judges: scores, verdictInput, reportFile, judgementsFile, failed: scores.some((score) => score.status === 'fail') };
    });
  }
}
