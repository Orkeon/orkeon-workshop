import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { REPORT_SCHEMA_VERSION, parseReport, reportSchema, type Report } from '../../src/domain/report.js';
import { computeVerdictInput, isAccepted, verdictInputDiscrepancies } from '../../src/domain/verdict.js';
import { fixture } from '../fakes/fixture-team.js';

const accepted = (): Report => parseReport(JSON.parse(fixture('reports/accepted-report.json')));

describe('report schema 1.0', () => {
  it('parses the accepted fixture', () => {
    const report = accepted();
    expect(report.schema_version).toBe(REPORT_SCHEMA_VERSION);
    expect(Object.keys(report)).toEqual(['schema_version', 'metadata', 'levels', 'acceptance', 'indicators', 'invariants', 'judges', 'cost', 'verdict_input']);
  });

  it('rejects another schema version and unknown top-level keys', () => {
    expect(() => parseReport({ ...accepted(), schema_version: '2.0' })).toThrow(DomainError);
    expect(() => parseReport({ ...accepted(), extra: true })).toThrow(/extra/);
  });

  it.each([
    ['a malformed AC id', (report: Report) => ({ ...report, acceptance: { 'AC-1': { status: 'pass', level: 'unit', evidence: '' } } })],
    ['an AC level outside the five levels', (report: Report) => ({ ...report, acceptance: { 'AC-01': { status: 'pass', level: 'smoke', evidence: '' } } })],
    ['a malformed attempt id', (report: Report) => ({ ...report, metadata: { ...report.metadata, attempt: 'attempt-1' } })],
    ['a malformed pass_at_k', (report: Report) => ({ ...report, levels: { ...report.levels, e2e_local: { ...report.levels.e2e_local, pass_at_k: 'two of three' } } })],
    ['a negative cost', (report: Report) => ({ ...report, cost: { ...report.cost, tokens_in: -1 } })],
    ['a judge id of another family', (report: Report) => ({ ...report, judges: { 'AC-01': { rubric_version: '1', judge_model: 'm', score: 1, threshold: 1 } } })],
  ])('rejects %s', (_label, mutate) => {
    expect(reportSchema.safeParse(mutate(accepted())).success).toBe(false);
  });
});

describe('verdict rule', () => {
  it('accepts when every AC passes at a level that ran, every INV passes and every IND is in range', () => {
    const input = computeVerdictInput(accepted());
    expect(input).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: true });
    expect(isAccepted(input)).toBe(true);
    expect(verdictInputDiscrepancies(accepted())).toEqual([]);
  });

  it('fails all_ac_pass on a failing or not-run AC', () => {
    const report = accepted();
    report.acceptance['AC-02' as keyof typeof report.acceptance]!.status = 'fail';
    expect(computeVerdictInput(report).all_ac_pass).toBe(false);
    report.acceptance['AC-02' as keyof typeof report.acceptance]!.status = 'not_run';
    expect(computeVerdictInput(report).all_ac_pass).toBe(false);
  });

  it('does not count an AC as passed at a level that was skipped', () => {
    const report = accepted();
    report.acceptance['AC-02' as keyof typeof report.acceptance]!.level = 'e2e_remote';
    expect(computeVerdictInput(report).all_ac_pass).toBe(false);
  });

  it('never accepts a report with no acceptance criteria', () => {
    const report = { ...accepted(), acceptance: {} };
    expect(computeVerdictInput(report).all_ac_pass).toBe(false);
  });

  it('fails on a failing invariant or an out-of-range indicator, each independently', () => {
    const badInvariant = { ...accepted(), invariants: { 'INV-FS': { status: 'fail' as const, violations: ['/etc/x'] } } };
    expect(computeVerdictInput(badInvariant)).toEqual({ all_ac_pass: true, all_inv_pass: false, indicators_in_range: true });
    const badIndicator = { ...accepted(), indicators: { 'IND-01': { value: 0.5, threshold: 0.9, status: 'fail' as const } } };
    expect(computeVerdictInput(badIndicator)).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: false });
    expect(isAccepted(computeVerdictInput(badIndicator))).toBe(false);
  });

  it('counts an invariant or an indicator that was not run as neither proven nor in range', () => {
    const unproven = parseReport({ ...accepted(), invariants: { 'INV-FS': { status: 'not_run', violations: [] } } });
    expect(computeVerdictInput(unproven)).toEqual({ all_ac_pass: true, all_inv_pass: false, indicators_in_range: true });
    const uncomputed = parseReport({ ...accepted(), indicators: { 'IND-01': { value: null, threshold: null, status: 'not_run' } } });
    expect(computeVerdictInput(uncomputed)).toEqual({ all_ac_pass: true, all_inv_pass: true, indicators_in_range: false });
    expect(reportSchema.safeParse({ ...accepted(), indicators: { 'IND-01': { value: 'n/a', threshold: 1, status: 'pass' } } }).success).toBe(false);
    expect(reportSchema.safeParse({ ...accepted(), invariants: { 'INV-FS': { status: 'skipped', violations: [] } } }).success).toBe(false);
  });

  it('reports a verdict_input that contradicts the content', () => {
    const report = { ...accepted(), verdict_input: { all_ac_pass: true, all_inv_pass: false, indicators_in_range: true } };
    expect(verdictInputDiscrepancies(report)).toEqual(['verdict_input.all_inv_pass is false but the report content implies true']);
  });
});
