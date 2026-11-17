import { z } from 'zod';

import type { DeclaredIndicator } from './acceptance.js';
import type { Direction } from './workbook/acceptance-rules.js';
import { DomainError } from './errors.js';
import { ID_PATTERNS } from './ids.js';
import { JUDGE_MEASURE_PREFIX } from './scenario.js';
import { parseWith } from './schema.js';
import { thresholdOf } from './workbook/acceptance-cells.js';
import { cell, partNamed, readMarkdown, rowsWith, sectionNamed, unquote, wordOf } from './workbook/markdown.js';

/** The file `/team-run` hands to `evaluate` and the bench keeps in the attempt (D91). */
export const JUDGEMENTS_FILE = 'judgements.json';

/** One grade of the `judge` agent: one output of one run, against the rubric of one judge. */
export const judgementSchema = z.object({
  judge: z.string().regex(ID_PATTERNS.J, 'expected a judge id such as J-01'),
  rubric_version: z.string().min(1),
  output: z.string().min(1),
  score: z.number(),
  justification: z.string().default(''),
  quotes: z.array(z.string()).default([]),
  /** The model that graded, when the file says it. */
  judge_model: z.string().min(1).nullable().optional(),
});
export type Judgement = z.infer<typeof judgementSchema>;

/** `{"judgements": [...]}`, with the model that graded them all when it is one. */
export const judgementsFileSchema = z.object({
  judge_model: z.string().min(1).nullable().optional(),
  judgements: z.array(judgementSchema).min(1, 'expected at least one judgement'),
});
export type JudgementsFile = z.infer<typeof judgementsFileSchema>;

export function parseJudgementsFile(input: unknown): JudgementsFile {
  return parseWith(judgementsFileSchema, input, 'judgements file');
}

/**
 * The grades `judgements.json` holds once a new file is folded in: the judges the new file grades
 * take its grades, the others keep their earlier ones when `keep` names them. Each grade carries
 * the model that gave it, so that grades of different files keep theirs.
 */
export function mergeJudgements(earlier: JudgementsFile | null, next: JudgementsFile, keep: readonly string[]): JudgementsFile {
  const graded = new Set(next.judgements.map((judgement) => judgement.judge));
  const withModel = (file: JudgementsFile, judgement: Judgement): Judgement => ({ ...judgement, judge_model: judgement.judge_model ?? file.judge_model ?? null });
  const judgements = [
    ...(earlier === null ? [] : earlier.judgements.filter((judgement) => !graded.has(judgement.judge) && keep.includes(judgement.judge)).map((judgement) => withModel(earlier, judgement))),
    ...next.judgements.map((judgement) => withModel(next, judgement)),
  ];
  const models = [...new Set(judgements.map((judgement) => judgement.judge_model ?? null))];
  return { judge_model: models.length === 1 ? (models[0] ?? null) : null, judgements };
}

/**
 * A row of `### Judges` of `TEAM.md § Acceptance`: its threshold, a number — a grade to reach — or
 * the threshold and the direction of the indicator it names.
 */
export interface DeclaredJudge {
  readonly id: string;
  /** Null when the cell holds no number and names no indicator that has a threshold and a direction. */
  readonly threshold: number | null;
  /** `>=` for a number; the indicator's own direction when the cell names one (`<=`: lower is better). */
  readonly direction: Direction;
  /** The indicator the `Threshold` cell names, when it names one. */
  readonly indicator: string | null;
}

/** The judges `TEAM.md` declares, each with the threshold its score must reach. */
export function parseDeclaredJudges(markdown: string, indicators: readonly DeclaredIndicator[]): DeclaredJudge[] {
  const lines = sectionNamed(partNamed(readMarkdown(markdown), 'Acceptance').sections, 'Judges')?.lines ?? [];
  return rowsWith(lines, 'Id', ['Threshold'])
    .map((row) => {
      const id = wordOf(cell(row, 'Id'));
      const written = cell(row, 'Threshold');
      const number = thresholdOf(written);
      const indicator = number === null ? (/\bIND-[A-Za-z0-9]+\b/.exec(unquote(written))?.[0] ?? null) : null;
      if (number !== null || indicator === null) {
        return { id, threshold: number, direction: '>=' as Direction, indicator };
      }
      const named = indicators.find((declared) => declared.id === indicator);
      // An indicator without a direction gives no rule to grade against: its threshold is not borrowed.
      const borrowed = named?.direction == null ? null : named.threshold;
      return { id, threshold: borrowed, direction: named?.direction ?? ('>=' as Direction), indicator };
    })
    .filter((judge) => ID_PATTERNS.J.test(judge.id));
}

/** What one judge scored: the mean of its grades, against its threshold. */
export interface JudgeScore {
  readonly id: string;
  readonly score: number;
  readonly threshold: number;
  /** `>=`: the score must reach the threshold; `<=`: it must not exceed it. */
  readonly direction: Direction;
  readonly grades: number;
  readonly rubric_version: string;
  readonly judge_model: string | null;
  readonly status: 'pass' | 'fail';
}

/**
 * The score of each judge the file grades: the mean of its grades (four decimals), passing when it
 * is on the right side of the threshold `TEAM.md` declares — at or above it, or at or below it for a
 * judge that borrows the threshold of a `<=` indicator. A judge `TEAM.md` gives no threshold is refused: a
 * score against nothing proves nothing.
 */
export function scoreJudges(file: JudgementsFile, declared: readonly DeclaredJudge[]): JudgeScore[] {
  const ids = [...new Set(file.judgements.map((judgement) => judgement.judge))].sort();
  const missing = ids.filter((id) => declared.find((judge) => judge.id === id)?.threshold == null);
  if (missing.length > 0) {
    throw new DomainError(`TEAM.md § Acceptance § Judges gives no threshold the bench can read for ${missing.join(', ')}: write a number, or the id of an indicator that has a threshold and a direction`);
  }
  return ids.map((id) => {
    const grades = file.judgements.filter((judgement) => judgement.judge === id);
    const score = round(grades.reduce((total, grade) => total + grade.score, 0) / grades.length);
    const judge = declared.find((candidate) => candidate.id === id) as DeclaredJudge;
    const threshold = judge.threshold as number;
    const last = grades[grades.length - 1] as Judgement;
    return {
      id,
      score,
      threshold,
      direction: judge.direction,
      grades: grades.length,
      rubric_version: last.rubric_version,
      judge_model: last.judge_model ?? file.judge_model ?? null,
      status: judgeInRange(score, threshold, judge.direction) ? 'pass' : 'fail',
    };
  });
}

/** An indicator entry of `report.json` as the bench writes it: what the schema reads, and the measure and note it adds. */
export interface ReportIndicatorEntry {
  value: number | null;
  threshold: number | null;
  status: 'pass' | 'fail' | 'not_run';
  measure?: string | null;
  note?: string;
}

/**
 * The indicators whose measure is a judge (`judge:J-nn`) with that judge's score: in range by the
 * threshold and the direction `TEAM.md` declares. The others are returned as they are.
 */
export function judgedIndicators(entries: Readonly<Record<string, ReportIndicatorEntry>>, scores: readonly JudgeScore[], declared: readonly DeclaredIndicator[]): Record<string, ReportIndicatorEntry> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => {
      const judge = typeof entry.measure === 'string' && entry.measure.startsWith(JUDGE_MEASURE_PREFIX) ? entry.measure.slice(JUDGE_MEASURE_PREFIX.length) : null;
      const score = scores.find((candidate) => candidate.id === judge);
      if (score === undefined) {
        return [id, entry];
      }
      const indicator = declared.find((candidate) => candidate.id === id) ?? null;
      const threshold = indicator?.threshold ?? null;
      if (indicator === null || threshold === null || indicator.direction === null) {
        const why = indicator === null ? 'not declared in TEAM.md — nothing says what value is in range' : `TEAM.md gives no ${threshold === null ? 'threshold' : 'direction'} the bench can read for it`;
        return [id, { ...entry, value: score.score, threshold, status: 'not_run', note: `not run: ${why}` }];
      }
      const inRange = indicator.direction === '>=' ? score.score >= threshold : score.score <= threshold;
      return [id, { ...entry, value: score.score, threshold, status: inRange ? 'pass' : 'fail', note: `${entry.measure as string} ${indicator.direction} ${String(threshold)} over ${String(score.grades)} grade(s)` }];
    }),
  );
}

/** Whether a judge's score is on the right side of its threshold. */
export function judgeInRange(score: number, threshold: number, direction: Direction | undefined): boolean {
  return direction === '<=' ? score <= threshold : score >= threshold;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
