import { describe, expect, it } from 'vitest';

import { CaptureAttempt } from '../../src/application/use-cases/capture-attempt.js';
import { EstimateRemote } from '../../src/application/use-cases/estimate-remote.js';
import { EvaluateJudgements } from '../../src/application/use-cases/evaluate-judgements.js';
import { ReleaseTeam, type ReleaseOutcome, type ReleaseResult } from '../../src/application/use-cases/release-team.js';
import { ResolveProfile } from '../../src/application/use-cases/resolve-profile.js';
import { ScaffoldTeam } from '../../src/application/use-cases/scaffold-team.js';
import type { RunId } from '../../src/domain/ids.js';
import { NO_FACTS, type ScenarioResult } from '../../src/domain/scenario-result.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { FakeEnvironment } from '../fakes/fake-environment.js';
import { FakeProcessRunner, failed, succeeded } from '../fakes/fake-process-runner.js';
import { WORKSHOP, demoTeam, fixture } from '../fakes/fixture-team.js';
import type { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';

const ATTEMPTS = `${WORKSHOP}/workbooks/demo/attempts`;
const RUNS = `${WORKSHOP}/workbooks/demo/runs`;

const TEAM_MD = `# demo — Team

## Acceptance

### Indicators

| Id | Measure | Unit | Threshold | Direction | Level |
|---|---|---|---|---|---|
| IND-01 | acceptance criteria passing | % | 0.9 | >= | L3 |
| IND-03 | the judge's grade of the drafts | score | 4 | >= | L3 |

### Judges

| Id | Rubric | Threshold |
|---|---|---|
| J-01 | drafts are polite and complete | 4 |
| J-02 | the summary quotes its sources | IND-03 |
`;

function manifest(id: string, closed: boolean, verdict: string | null): string {
  return JSON.stringify({ attempt: id, opened_at: '2026-10-01T08:00:00Z', closed_at: closed ? '2026-10-02T08:00:00Z' : null, opened_by: 'team-build', design_snapshot: 'design-snapshot/', orkeon_version: '1.0.0', runs: [], remote_approval: null, verdict });
}

function report(withMeasure: boolean): string {
  const raw = JSON.parse(fixture('reports/accepted-report.json')) as { levels: { component: Record<string, unknown>; e2e_local: Record<string, unknown> }; indicators: Record<string, unknown> };
  // As `run` writes it: each scenario the full result, with the run it cites.
  raw.levels.component.scenarios = [];
  raw.levels.e2e_local.scenarios = [scenarioResult()];
  if (withMeasure) {
    raw.indicators = { ...raw.indicators, 'IND-03': { value: null, threshold: 4, status: 'not_run', measure: 'judge:J-02' } };
  }
  return JSON.stringify(raw);
}

function scenarioResult(): ScenarioResult {
  return {
    id: 'ac-02-nominal',
    title: 'nominal',
    file: 'e2e/ac-02.scenario.json',
    level: 'e2e_local',
    iteration: 1,
    status: 'pass',
    covers: ['AC-02'],
    run: 'RUN-20260930-1912-local' as RunId,
    dataset: 'nominal',
    datasets: ['nominal'],
    model: 'qwen3:8b',
    exit_code: 0,
    duration_seconds: 10,
    tokens_in: 1000,
    tokens_out: 200,
    usd: null,
    tool_calls: 3,
    human_inputs: 0,
    indicators: [],
    checks: [],
    facts: NO_FACTS,
  };
}

function judgements(scores: Record<string, number[]>): string {
  return JSON.stringify({
    judge_model: 'claude',
    judgements: Object.entries(scores).flatMap(([judge, grades]) => grades.map((score, index) => ({ judge, rubric_version: '1', output: `/output/draft-${String(index)}.md`, score }))),
  });
}

function withOpenAttempt(fileSystem: InMemoryFileSystem, id = 'ATT-0001'): void {
  fileSystem.addFile(`${ATTEMPTS}/${id}/manifest.json`, manifest(id, false, null));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function run(fileSystem: InMemoryFileSystem, id: string, fields: Record<string, unknown>): void {
  fileSystem.addFile(`${RUNS}/${id}/manifest.json`, JSON.stringify({ run: id, level: 'e2e_local', target: 'machine', status: 'pass', tokens_in: 1000, tokens_out: 200, ...fields }));
}

describe('EvaluateJudgements', () => {
  function setup() {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(teamPaths(team).teamFile, TEAM_MD);
    withOpenAttempt(fileSystem);
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, report(true));
    return { team, fileSystem, evaluate: new EvaluateJudgements(fileSystem) };
  }

  it('scores each judge against its threshold, fills the indicator it measures and rewrites the report', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile('/tmp/j.json', judgements({ 'J-01': [4, 5], 'J-02': [4.5] }));
    const result = await evaluate.execute(team, '/tmp/j.json');
    expect(result.failed).toBe(false);
    expect(result.judges.map((judge) => [judge.id, judge.score, judge.threshold, judge.status, judge.judge_model])).toEqual([
      ['J-01', 4.5, 4, 'pass', 'claude'],
      ['J-02', 4.5, 4, 'pass', 'claude'],
    ]);
    const written = JSON.parse(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/report.json`)) as { judges: Record<string, unknown>; indicators: Record<string, unknown> };
    expect(written.judges['J-02']).toEqual({ rubric_version: '1', judge_model: 'claude', score: 4.5, threshold: 4 });
    expect(written.indicators['IND-03']).toMatchObject({ value: 4.5, threshold: 4, status: 'pass', measure: 'judge:J-02' });
    expect(result.verdictInput.indicators_in_range).toBe(true);
    expect(await fileSystem.exists(`${ATTEMPTS}/ATT-0001/judgements.json`)).toBe(true);
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/REPORT.md`)).toContain('demo');
  });

  it('fails when a judge scores under its threshold, and says so in REPORT.md', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile('/tmp/j.json', judgements({ 'J-02': [2, 3] }));
    const result = await evaluate.execute(team, '/tmp/j.json');
    expect(result.failed).toBe(true);
    expect(result.verdictInput.indicators_in_range).toBe(false);
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/REPORT.md`)).toContain('J-02 — fail — scored 2.5 against 4');
  });

  it('merges the judges of successive calls by id, and fails on the merged set', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile('/tmp/j1.json', judgements({ 'J-01': [2, 3] }));
    expect((await evaluate.execute(team, '/tmp/j1.json')).failed).toBe(true);
    fileSystem.addFile('/tmp/j2.json', judgements({ 'J-02': [5] }));
    const result = await evaluate.execute(team, '/tmp/j2.json');
    expect(result.judges.map((judge) => [judge.id, judge.score, judge.status])).toEqual([
      ['J-01', 2.5, 'fail'],
      ['J-02', 5, 'pass'],
    ]);
    expect(result.failed).toBe(true);
    const written = JSON.parse(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/report.json`)) as { judges: Record<string, unknown> };
    expect(Object.keys(written.judges)).toEqual(['J-01', 'J-02']);
    const kept = JSON.parse(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/judgements.json`)) as { judgements: { judge: string; judge_model: string }[] };
    expect(kept.judgements.map((judgement) => judgement.judge)).toEqual(['J-01', 'J-01', 'J-02']);
    // Grading J-01 again replaces its grades, it does not add to them.
    fileSystem.addFile('/tmp/j3.json', judgements({ 'J-01': [5] }));
    const regraded = await evaluate.execute(team, '/tmp/j3.json');
    expect(regraded.failed).toBe(false);
    expect(regraded.judges.map((judge) => [judge.id, judge.score])).toEqual([
      ['J-01', 5],
      ['J-02', 5],
    ]);
  });

  it('drops the grades of a report a new run replaced: report.json holds no judge any more', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile('/tmp/j1.json', judgements({ 'J-01': [2] }));
    await evaluate.execute(team, '/tmp/j1.json');
    // As a new run writes it: buildReport starts with no judge.
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, JSON.stringify({ ...(JSON.parse(report(true)) as object), judges: {} }));
    fileSystem.addFile('/tmp/j2.json', judgements({ 'J-02': [5] }));
    const result = await evaluate.execute(team, '/tmp/j2.json');
    expect(result.judges.map((judge) => judge.id)).toEqual(['J-02']);
    expect(result.failed).toBe(false);
  });

  it('holds a judge that borrows the threshold of a lower-is-better indicator to <=', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile(
      teamPaths(team).teamFile,
      TEAM_MD.replace('| IND-03 |', '| IND-04 | hallucinated facts per draft | count | 1 | <= | L3 |\n| IND-03 |').replace('| J-02 |', '| J-03 | facts the drafts invent | IND-04 |\n| J-02 |'),
    );
    fileSystem.addFile('/tmp/low.json', judgements({ 'J-03': [0, 1] }));
    const low = await evaluate.execute(team, '/tmp/low.json');
    expect(low.judges.map((judge) => [judge.id, judge.score, judge.threshold, judge.direction, judge.status])).toEqual([['J-03', 0.5, 1, '<=', 'pass']]);
    expect(low.failed).toBe(false);
    const written = JSON.parse(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/report.json`)) as { judges: Record<string, unknown> };
    expect(written.judges['J-03']).toMatchObject({ score: 0.5, threshold: 1, direction: '<=' });
    fileSystem.addFile('/tmp/high.json', judgements({ 'J-03': [3] }));
    const high = await evaluate.execute(team, '/tmp/high.json');
    expect(high.failed).toBe(true);
    expect(await fileSystem.readText(`${ATTEMPTS}/ATT-0001/REPORT.md`)).toContain('J-03 — fail — scored 3 against <= 1');
  });

  it('refuses a judge TEAM.md gives no threshold, an attempt without report, and a team without TEAM.md', async () => {
    const { team, fileSystem, evaluate } = setup();
    fileSystem.addFile('/tmp/j.json', judgements({ 'J-09': [5] }));
    await expect(evaluate.execute(team, '/tmp/j.json')).rejects.toThrow(/no threshold the bench can read for J-09/);
    fileSystem.addFile('/tmp/ok.json', judgements({ 'J-01': [5] }));
    await fileSystem.remove(`${ATTEMPTS}/ATT-0001/report.json`);
    await expect(evaluate.execute(team, '/tmp/ok.json')).rejects.toThrow(/holds no report.json/);
    await fileSystem.remove(teamPaths(team).teamFile);
    await expect(evaluate.execute(team, '/tmp/ok.json')).rejects.toThrow(/TEAM.md not found/);
  });
});

describe('EstimateRemote', () => {
  function setup(price = true, decision?: Record<string, unknown>) {
    const { team, fileSystem } = demoTeam();
    const config = JSON.parse(fixture('workshop/tests/demo/bench.config.json')) as { profiles: Record<string, Record<string, unknown>>; levels: { e2e_remote: { repeat: number } }; decision?: Record<string, unknown> };
    if (decision !== undefined) {
      config.decision = decision;
    }
    config.profiles.claude = { ...config.profiles.claude, model: 'claude-sonnet-5-5', ...(price ? { price: { input_per_million: 3, output_per_million: 15 } } : {}) };
    config.levels.e2e_remote.repeat = 2;
    fileSystem.addFile(teamPaths(team).benchConfigFile, JSON.stringify(config));
    // As test-levels.md § 6 lays them out: each L4 scenario the L3 one of the same id, on the remote profile.
    for (const id of ['ac-01', 'ac-02']) {
      scenarioFile(fileSystem, `${id}.scenario.json`, id, 'e2e_local');
      scenarioFile(fileSystem, `${id}.remote.scenario.json`, id, 'e2e_remote');
    }
    return { team, fileSystem, estimate: new EstimateRemote(fileSystem, new ResolveProfile(fileSystem, new FakeEnvironment())) };
  }

  function scenarioFile(fileSystem: InMemoryFileSystem, file: string, id: string, level: string): void {
    fileSystem.addFile(`${WORKSHOP}/tests/demo/e2e/${file}`, JSON.stringify({ id, level, dataset: 'nominal', profile: level === 'e2e_remote' ? 'claude' : 'machine', checks: [] }));
  }

  it('prices each L4 scenario from the completed local runs of the L3 scenario of the same id, latest attempt only, × repeat × 1.3', async () => {
    const { team, fileSystem, estimate } = setup();
    run(fileSystem, 'RUN-20261001-0800-machine', { scenario: 'ac-01', attempt: 'ATT-0001', tokens_in: 1_000_000, tokens_out: 0 });
    run(fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01', attempt: 'ATT-0002', tokens_in: 100_000, tokens_out: 10_000 });
    run(fileSystem, 'RUN-20261002-0801-machine', { scenario: 'ac-01', attempt: 'ATT-0002', status: 'fail', tokens_in: 120_000, tokens_out: 10_000 });
    run(fileSystem, 'RUN-20261002-0802-machine', { scenario: 'ac-01', attempt: 'ATT-0002', status: 'fail', tokens_in: 0, tokens_out: 0 });
    run(fileSystem, 'RUN-20261002-0803-machine', { scenario: 'ac-01', attempt: 'ATT-0002', status: 'interrupted', tokens_in: 9_000_000 });
    run(fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02', tokens_in: 100_000, tokens_out: 10_000 });
    run(fileSystem, 'RUN-20261002-1000-claude', { scenario: 'ac-02', level: 'e2e_remote', target: 'claude', tokens_in: 9_000_000 });
    const result = await estimate.execute(team, undefined);
    expect(result.profile).toBe('claude');
    expect(result.model).toBe('claude-sonnet-5-5');
    expect(result.scenarios.map((scenario) => [scenario.id, scenario.attempt, scenario.runs, scenario.tokens_in, scenario.tokens_out, scenario.usd])).toEqual([
      ['ac-01', 'ATT-0002', ['RUN-20261002-0800-machine', 'RUN-20261002-0801-machine'], 110_000, 10_000, 0.48],
      ['ac-02', null, ['RUN-20261002-0900-machine'], 100_000, 10_000, 0.45],
    ]);
    expect(result.scenarios[0]?.run).toBe('RUN-20261002-0801-machine');
    expect(result.warnings).toEqual([]);
    expect(result.usd).toBe(2.418);
    expect(result.capUsd).toBe(2);
    expect(result.withinCap).toBe(false);
    expect([result.decisionCalls, result.decisionPricePerCall, result.decisionUsd]).toEqual([0, null, 0]);
  });

  /** A run whose events.jsonl completes `decisions` decision tasks and calls system_one_decide `asks` times. */
  function decidingRun(fileSystem: InMemoryFileSystem, id: string, scenario: string, decisions: number, asks: number): void {
    run(fileSystem, id, { scenario, tokens_in: 100_000, tokens_out: 10_000 });
    const lines = [
      ...Array.from({ length: decisions }, (_, index) => ({ kind: 'task.completed', taskId: `T${String(index)}`, agentRole: 'decision', isDecision: true, defaulted: false, decision: '{"route":{"chosen":"fix","confidence":0.9}}' })),
      ...Array.from({ length: asks }, (_, index) => ({ kind: 'tool.called', toolName: 'system_one_decide', correlationId: `c${String(index)}` })),
    ];
    fileSystem.addFile(`${RUNS}/${id}/events.jsonl`, lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('D96: adds the decision calls of the local runs × price_per_call of the decision block of e2e_remote', async () => {
    const { team, fileSystem, estimate } = setup(true, { provider: 'typesafe', model: 'ts-small', price_per_call: 0.01 });
    decidingRun(fileSystem, 'RUN-20261002-0800-machine', 'ac-01', 2, 1);
    decidingRun(fileSystem, 'RUN-20261002-0801-machine', 'ac-01', 1, 0);
    run(fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02', tokens_in: 100_000, tokens_out: 10_000, decision_calls: 4 });
    const result = await estimate.execute(team, undefined);
    expect(result.scenarios.map((scenario) => [scenario.id, scenario.decision_calls, scenario.usd])).toEqual([
      ['ac-01', 2, 0.47],
      ['ac-02', 4, 0.49],
    ]);
    expect([result.decisionCalls, result.decisionPricePerCall, result.decisionUsd]).toEqual([6, 0.01, 0.156]);
    expect(result.usd).toBe(round4((0.45 * 2 + 0.06) * 2 * 1.3));
  });

  it('D96: refuses decision calls toward a remote decision model without price_per_call; a local one costs nothing', async () => {
    const remote = setup(true, { provider: 'typesafe', model: 'ts-small' });
    decidingRun(remote.fileSystem, 'RUN-20261002-0800-machine', 'ac-01', 1, 0);
    run(remote.fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02' });
    await expect(remote.estimate.execute(remote.team, undefined)).rejects.toThrow(/1 decision call\(s\) per pass and the decision model of an L4 run is remote .*price_per_call/);
    const local = setup(true, { provider: 'kev', base_url: 'http://127.0.0.1:11434', model: 'kev-1' });
    decidingRun(local.fileSystem, 'RUN-20261002-0800-machine', 'ac-01', 1, 0);
    run(local.fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02' });
    const result = await local.estimate.execute(local.team, undefined);
    expect([result.decisionCalls, result.decisionPricePerCall, result.decisionUsd]).toEqual([1, null, 0]);
    const none = setup(true, { provider: 'typesafe', model: 'ts-small' });
    run(none.fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01' });
    run(none.fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02' });
    expect((await none.estimate.execute(none.team, undefined)).decisionCalls).toBe(0);
  });

  it('refuses an L4 scenario no L3 run of the same id prices, rather than guess it from the others', async () => {
    const { team, fileSystem, estimate } = setup();
    scenarioFile(fileSystem, 'ac-03.remote.scenario.json', 'ac-03', 'e2e_remote');
    run(fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01' });
    run(fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02' });
    run(fileSystem, 'RUN-20261002-1000-machine', { scenario: 'ac-03', status: 'interrupted' });
    await expect(estimate.execute(team, undefined)).rejects.toThrow(/no completed local run on machine to price ac-03 from: an L4 scenario is priced from the runs of the L3 scenario of the same id/);
  });

  it('refuses without a stated cap, as attempt approve does: no default stands in for it', async () => {
    const { team, fileSystem, estimate } = setup();
    run(fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01' });
    run(fileSystem, 'RUN-20261002-0900-machine', { scenario: 'ac-02' });
    const config = JSON.parse(await fileSystem.readText(teamPaths(team).benchConfigFile)) as { budget: Record<string, unknown> };
    delete config.budget.remote_usd_max;
    fileSystem.addFile(teamPaths(team).benchConfigFile, JSON.stringify(config));
    await expect(estimate.execute(team, undefined)).rejects.toThrow(/no cap for a remote run: .*states no budget.remote_usd_max/);
    await fileSystem.remove(teamPaths(team).benchConfigFile);
    await expect(estimate.execute(team, undefined)).rejects.toThrow(/no cap for a remote run: .*does not exist/);
  });

  /** The demo team with its L3 decision block (or none), the top-level one, and the machine's environment. */
  function local(levelDecision?: Record<string, unknown>, topDecision?: Record<string, unknown>, environment: Record<string, string> = {}) {
    const { team, fileSystem } = demoTeam();
    const config = JSON.parse(fixture('workshop/tests/demo/bench.config.json')) as { levels: { e2e_local: Record<string, unknown> }; decision?: Record<string, unknown> };
    if (levelDecision !== undefined) {
      config.levels.e2e_local.decision = levelDecision;
    }
    if (topDecision !== undefined) {
      config.decision = topDecision;
    }
    fileSystem.addFile(teamPaths(team).benchConfigFile, JSON.stringify(config));
    scenarioFile(fileSystem, 'ac-01.scenario.json', 'ac-01', 'e2e_local');
    scenarioFile(fileSystem, 'ac-02.scenario.json', 'ac-02', 'e2e_local');
    return { team, fileSystem, estimate: new EstimateRemote(fileSystem, new ResolveProfile(fileSystem, new FakeEnvironment(environment))) };
  }

  it('D104: an L3 run whose LLM and decision model are local is free and needs no approval', async () => {
    const { team, estimate } = local();
    const result = await estimate.execute(team, undefined, { level: 'e2e_local' });
    expect([result.level, result.remote, result.usd, result.profile, result.scenarios]).toEqual(['e2e_local', false, 0, 'machine', []]);
  });

  it('D104: prices an L3 run with a hosted decision model from its L3 runs, else from the latest L2 runs, × repeat × 1.3', async () => {
    const { team, fileSystem, estimate } = local({ provider: 'typesafe', model: 'ts-small', price_per_call: 0.01 });
    await expect(estimate.execute(team, undefined, { level: 'e2e_local' })).rejects.toThrow(/run orkeon-bench run demo --level L2 first/);
    run(fileSystem, 'RUN-20261002-0700-stub', { scenario: 'c-01', level: 'component', target: 'stub', tokens_in: 0, tokens_out: 0, decision_calls: 2 });
    run(fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01', decision_calls: 4 });
    const result = await estimate.execute(team, undefined, { level: 'e2e_local' });
    expect(result.remote).toBe(true);
    expect(result.scenarios.map((scenario) => [scenario.id, scenario.decision_calls])).toEqual([['ac-01', 4], ['ac-02', 2]]);
    expect([result.decisionCalls, result.decisionPricePerCall, result.usd]).toEqual([6, 0.01, round4(6 * 0.01 * 3 * 1.3)]);
    expect(result.warnings.join(' ')).toMatch(/ac-02 are counted from the latest L2 runs \(2 per run\)/);
  });

  it('D104: a hosted decision model no block declares has no price: refused, naming /team-decision', async () => {
    const { team, fileSystem, estimate } = local(undefined, undefined, { TYPESAFE_API_KEY: 'x' });
    run(fileSystem, 'RUN-20261002-0800-machine', { scenario: 'ac-01' });
    await expect(estimate.execute(team, undefined, { level: 'e2e_local' })).rejects.toThrow(/declares no decision block for it.*\/team-decision/);
  });

  it('D104: an L3 run on a remote LLM is refused without a price: L3 is the local level', async () => {
    const { team, estimate } = local(undefined, undefined, { ORKEON_Llm__BaseUrl: 'https://api.example.com/v1', ORKEON_Llm__Model: 'm' });
    await expect(estimate.execute(team, undefined, { level: 'e2e_local' })).rejects.toThrow(/an L3 run on the profile "machine" is remote \(api.example.com\).*L3 is the local level/);
  });

  it('D104: --decide adds its calls at price_per_call of the top-level block, and is refused without one', async () => {
    const priced = local(undefined, { provider: 'kev', base_url: 'http://127.0.0.1:8009/v1', price_per_call: 0.02 });
    const result = await priced.estimate.execute(priced.team, undefined, { level: 'e2e_local', decideCalls: 3 });
    expect([result.remote, result.decideCalls, result.decidePricePerCall, result.decideUsd, result.usd]).toEqual([true, 3, 0.02, 0.078, 0.078]);
    const unpriced = local();
    await expect(unpriced.estimate.execute(unpriced.team, undefined, { level: 'e2e_local', decideCalls: 1 })).rejects.toThrow(/decide --allow-remote have no price/);
  });

  it('refuses a profile without price, a team without L4 scenario or without local run', async () => {
    const { team, estimate, fileSystem } = setup();
    await expect(estimate.execute(team, undefined)).rejects.toThrow(/no local e2e run archived yet/);
    await expect(estimate.execute(team, 'machine')).rejects.toThrow(/has no price/);
    await fileSystem.remove(`${WORKSHOP}/tests/demo/e2e`);
    await expect(estimate.execute(team, undefined)).rejects.toThrow(/no L4 scenario/);
    const unpriced = setup(false);
    await expect(unpriced.estimate.execute(unpriced.team, undefined)).rejects.toThrow(/profiles.claude.price/);
  });
});

describe('CaptureAttempt', () => {
  it('writes capture.md: the status, the crew diff against the previous snapshot, the report and the cited runs', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(`${team.folder}/crew/crew.ork.ts`, 'export {};\n');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/manifest.json`, manifest('ATT-0001', true, 'ITERATE'));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/design-snapshot/crew/config.yaml`, 'name: old\n');
    withOpenAttempt(fileSystem, 'ATT-0002');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/report.json`, report(false));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/REPORT.md`, '# demo — Report\n\nAll green.\n');
    fileSystem.addFile(`${RUNS}/RUN-20260930-1912-local/events.jsonl`, fixture('runs/stub-crew-failed.events.jsonl'));
    fileSystem.addFile(`${RUNS}/RUN-20260930-1912-local/stderr.log`, Array.from({ length: 50 }, (_, index) => `line ${String(index)}`).join('\n'));
    const diff = Array.from({ length: 1300 }, (_, index) => `+${String(index)}`).join('\n');
    const processes = new FakeProcessRunner({ diff: { found: true, exitCode: 1, stdout: diff, stderr: '' } });
    const result = await new CaptureAttempt(fileSystem, processes).execute(team);
    expect(result).toMatchObject({ attempt: 'ATT-0002', comparedWith: 'ATT-0001', diffLines: 1300, diffTruncated: true, runs: ['RUN-20260930-1912-local'] });
    expect(processes.calls[0]?.args).toEqual(['-ruN', `${ATTEMPTS}/ATT-0001/design-snapshot/crew`, `${team.folder}/crew`]);
    const capture = await fileSystem.readText(`${ATTEMPTS}/ATT-0002/capture.md`);
    expect(capture).toContain('Against the design snapshot of ATT-0001.');
    expect(capture).toContain('Truncated: 100 more line(s)');
    expect(capture).toContain('### demo — Report');
    expect(capture).toContain('### RUN-20260930-1912-local');
    expect(capture).toContain('… 10 line(s) …');
    expect(capture).not.toContain('iteration cap');
  });

  it('names in capture.md the tasks that ended on the iteration cap or succeeded without a declared deliverable (Orkeon 1.2.0)', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(`${team.folder}/crew/crew.ork.ts`, 'export {};\n');
    withOpenAttempt(fileSystem, 'ATT-0001');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, report(false));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/REPORT.md`, '# demo — Report\n');
    fileSystem.addFile(
      `${RUNS}/RUN-20260930-1912-local/events.jsonl`,
      [
        { kind: 'task.completed', taskId: 't1', agentRole: 'Writer', success: true, skipped: false, endedOnIterationCap: true, deliverableMissing: true },
        { kind: 'task.completed', taskId: 't2', agentRole: 'Reader', success: true, skipped: false, endedOnIterationCap: false, deliverableMissing: false },
        { kind: 'run.finished', success: true, exitCode: 0, cappedTasks: 1, missingDeliverables: 1 },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n'),
    );
    await new CaptureAttempt(fileSystem, new FakeProcessRunner()).execute(team);
    const capture = await fileSystem.readText(`${ATTEMPTS}/ATT-0001/capture.md`);
    expect(capture).toContain('- Tasks that ended on the iteration cap: Writer');
    expect(capture).toContain('- Tasks that succeeded without a declared deliverable: Writer');
  });

  it('says what it could not read: no snapshot before, no report, no events, a diff that failed', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem.addFile(`${team.folder}/crew/crew.ork.ts`, 'export {};\n');
    withOpenAttempt(fileSystem);
    const first = await new CaptureAttempt(fileSystem, new FakeProcessRunner()).execute(team);
    expect(first.comparedWith).toBeNull();
    const capture = await fileSystem.readText(first.file);
    expect(capture).toContain('No earlier attempt holds a design snapshot');
    expect(capture).toContain('No REPORT.md');
    expect(capture).toContain('The report cites no run.');

    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/manifest.json`, manifest('ATT-0001', true, 'ITERATE'));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/design-snapshot/crew/crew.ork.ts`, 'export {};\n');
    withOpenAttempt(fileSystem, 'ATT-0002');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/report.json`, report(false));
    const same = await new CaptureAttempt(fileSystem, new FakeProcessRunner({ diff: succeeded('') })).execute(team);
    expect(await fileSystem.readText(same.file)).toContain('_No change._');
    expect(await fileSystem.readText(same.file)).toContain('holds no events.jsonl');
    const broken = await new CaptureAttempt(fileSystem, new FakeProcessRunner({ diff: failed(2, 'diff: boom') })).execute(team);
    expect(await fileSystem.readText(broken.file)).toContain('The diff could not be computed (diff: boom)');
    const missing = await new CaptureAttempt(fileSystem, new FakeProcessRunner()).execute(team);
    expect(await fileSystem.readText(missing.file)).toContain('diff not found on PATH');
  });
});

function released(outcome: ReleaseOutcome): ReleaseResult {
  if (outcome.status !== 'released') {
    throw new Error(`not released: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

describe('ReleaseTeam', () => {
  function setup(runsKeep = 2) {
    const { team, fileSystem } = demoTeam();
    const config = JSON.parse(fixture('workshop/tests/demo/bench.config.json')) as { retention: { runs_keep: number } };
    config.retention.runs_keep = runsKeep;
    fileSystem.addFile(teamPaths(team).benchConfigFile, JSON.stringify(config));
    fileSystem.addFile(`${team.folder}/crew/crew.ork.ts`, 'export {};\n');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/manifest.json`, manifest('ATT-0001', true, 'ACCEPTED'));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, report(false));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/manifest.json`, manifest('ATT-0002', true, 'ACCEPTED'));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/design-snapshot/crew/crew.ork.ts`, 'export {};\n');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/design-snapshot/mounts.json`, fixture('workshop/teams/demo/mounts.json'));
    for (const id of ['RUN-20260930-1912-local', 'RUN-20261001-0800-machine', 'RUN-20261002-0800-machine', 'RUN-20261003-0800-machine', 'RUN-20261004-0800-machine']) {
      run(fileSystem, id, {});
    }
    const scaffold = new ScaffoldTeam(fileSystem, { home: '/home/tester', workshop: null, orkeonSettings: null });
    return { team, fileSystem, release: new ReleaseTeam(fileSystem, scaffold) };
  }

  it('keeps the last runs and those a report cites, archives the others and names the tag', async () => {
    const { team, fileSystem, release } = setup();
    const result = released(await release.execute(team));
    expect(result).toMatchObject({ version: 2, attempt: 'ATT-0002', tag: 'team/demo/v2' });
    expect(result.runsKept).toEqual(['RUN-20260930-1912-local', 'RUN-20261003-0800-machine', 'RUN-20261004-0800-machine']);
    expect(result.runsArchived).toEqual(['RUN-20261001-0800-machine', 'RUN-20261002-0800-machine']);
    expect(await fileSystem.exists(`${WORKSHOP}/archive/runs/demo/RUN-20261001-0800-machine/manifest.json`)).toBe(true);
    expect(await fileSystem.exists(`${RUNS}/RUN-20261001-0800-machine`)).toBe(false);
    expect(await fileSystem.exists(teamPaths(team).runSh)).toBe(true);
  });

  it('keeps the runs of the report a run replaced and those an attempt manifest lists', async () => {
    const { fileSystem, release, team } = setup(1);
    const replacing = JSON.parse(report(false)) as { metadata: Record<string, unknown> };
    replacing.metadata.replaces = { date: '2026-09-29T08:00:00Z', reached: 'e2e_local', runs: ['RUN-20261001-0800-machine'] };
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, JSON.stringify(replacing));
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/manifest.json`, JSON.stringify({ ...(JSON.parse(manifest('ATT-0002', true, 'ACCEPTED')) as object), runs: ['RUN-20261002-0800-machine'] }));
    const result = released(await release.execute(team));
    expect(result.runsKept).toEqual(['RUN-20260930-1912-local', 'RUN-20261001-0800-machine', 'RUN-20261002-0800-machine', 'RUN-20261004-0800-machine']);
    expect(result.runsArchived).toEqual(['RUN-20261003-0800-machine']);
  });

  it('releases nothing while a report cannot be read: the runs it cites cannot be told apart', async () => {
    const { fileSystem, release, team } = setup();
    fileSystem.addFile(`${ATTEMPTS}/ATT-0001/report.json`, '{ "schema_version": ');
    fileSystem.addFile(`${ATTEMPTS}/ATT-0002/report.json`, JSON.stringify({ schema_version: 'nope' }));
    const outcome = await release.execute(team);
    expect(outcome.status).toBe('unreadable-reports');
    expect(outcome.status === 'unreadable-reports' ? outcome.reports.map((unreadable) => unreadable.file) : []).toEqual([`${ATTEMPTS}/ATT-0001/report.json`, `${ATTEMPTS}/ATT-0002/report.json`]);
    expect(await fileSystem.exists(`${WORKSHOP}/archive/runs/demo`)).toBe(false);
    expect(await fileSystem.exists(`${RUNS}/RUN-20261001-0800-machine/manifest.json`)).toBe(true);
    expect(await fileSystem.exists(teamPaths(team).runSh)).toBe(false);
  });

  it('refuses a mounts.json changed, added or removed since the accepted attempt', async () => {
    const { team, fileSystem, release } = setup();
    const paths = teamPaths(team);
    fileSystem.addFile(paths.mountsFile, '{"mounts": []}\n');
    await expect(release.execute(team)).rejects.toThrow(/mounts.json differs from the design ATT-0002 accepted/);
    await fileSystem.remove(paths.mountsFile);
    await expect(release.execute(team)).rejects.toThrow(/mounts.json is missing from the team but present in the design ATT-0002 accepted/);
    fileSystem.addFile(paths.mountsFile, fixture('workshop/teams/demo/mounts.json'));
    await fileSystem.remove(`${ATTEMPTS}/ATT-0002/design-snapshot/mounts.json`);
    await expect(release.execute(team)).rejects.toThrow(/mounts.json exists but was absent from the design ATT-0002 accepted/);
  });

  it('refuses a crew changed since the accepted attempt, an attempt not accepted, a team without attempt or crew', async () => {
    const { team, fileSystem, release } = setup();
    fileSystem.addFile(`${team.folder}/crew/config.yaml`, 'name: changed\n');
    await expect(release.execute(team)).rejects.toThrow(/crew\/ differs from the design ATT-0002 accepted/);
    await fileSystem.remove(`${ATTEMPTS}/ATT-0002/design-snapshot`);
    await expect(release.execute(team)).rejects.toThrow(/holds no design snapshot/);
    withOpenAttempt(fileSystem, 'ATT-0003');
    await expect(release.execute(team)).rejects.toThrow(/ATT-0003, is still open/);
    fileSystem.addFile(`${ATTEMPTS}/ATT-0003/manifest.json`, manifest('ATT-0003', true, 'ITERATE'));
    await expect(release.execute(team)).rejects.toThrow(/was closed ITERATE/);
    await fileSystem.remove(`${WORKSHOP}/workbooks/demo/attempts`);
    await expect(release.execute(team)).rejects.toThrow(/has no attempt/);
    await fileSystem.remove(`${team.folder}/crew`);
    await expect(release.execute(team)).rejects.toThrow(/has no crew/);
  });
});
