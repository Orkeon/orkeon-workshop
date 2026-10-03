import { describe, expect, it } from 'vitest';

import { ValidateReport } from '../../src/application/use-cases/validate-report.js';
import { fixture } from '../fakes/fixture-team.js';
import { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const PATH = '/workbooks/demo/attempts/ATT-0001/report.json';

function withReport(mutate: (report: Record<string, unknown>) => unknown = (report) => report): ValidateReport {
  const report = JSON.parse(fixture('reports/accepted-report.json')) as Record<string, unknown>;
  return new ValidateReport(new InMemoryFileSystem().addFile(PATH, JSON.stringify(mutate(report))));
}

describe('ValidateReport', () => {
  it('validates the accepted fixture and computes its verdict input', async () => {
    const validation = await withReport().execute(PATH);
    expect(validation).toEqual({
      path: PATH,
      valid: true,
      issues: [],
      verdictInput: { all_ac_pass: true, all_inv_pass: true, indicators_in_range: true },
      accepted: true,
    });
  });

  it('lists schema violations with their path', async () => {
    const validation = await withReport((report) => ({ ...report, schema_version: '0.9', cost: {} })).execute(PATH);
    expect(validation.valid).toBe(false);
    expect(validation.accepted).toBe(false);
    expect(validation.verdictInput).toBeNull();
    expect(validation.issues.some((issue) => issue.startsWith('schema_version:'))).toBe(true);
    expect(validation.issues.some((issue) => issue.startsWith('cost.tokens_in:'))).toBe(true);
  });

  it('flags a verdict_input that the content contradicts', async () => {
    const validation = await withReport((report) => ({
      ...report,
      verdict_input: { all_ac_pass: false, all_inv_pass: true, indicators_in_range: true },
    })).execute(PATH);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(['verdict_input.all_ac_pass is false but the report content implies true']);
    expect(validation.accepted).toBe(true);
  });

  it('is consistent but not accepted when an invariant fails', async () => {
    const validation = await withReport((report) => ({
      ...report,
      invariants: { 'INV-FS': { status: 'fail', violations: ['/etc/passwd'] } },
      verdict_input: { all_ac_pass: true, all_inv_pass: false, indicators_in_range: true },
    })).execute(PATH);
    expect(validation.valid).toBe(true);
    expect(validation.accepted).toBe(false);
  });

  it('fails with file-not-found and invalid-input', async () => {
    await expect(withReport().execute('/nowhere.json')).rejects.toMatchObject({ code: 'file-not-found' });
    const broken = new ValidateReport(new InMemoryFileSystem().addFile(PATH, '{'));
    await expect(broken.execute(PATH)).rejects.toMatchObject({ code: 'invalid-input' });
  });
});
