import { describe, expect, it } from 'vitest';

import type { WorkbookIds } from '../../../src/domain/workbook/acceptance-rules.js';
import { readMarkdown } from '../../../src/domain/workbook/markdown.js';
import { benchConfigFindings, plannedBudget, readWorkbookBenchConfig, testPlanFindings } from '../../../src/domain/workbook/test-plan-rules.js';
import { workbookFixture } from '../../fakes/workbook-fixtures.js';

const IDS: WorkbookIds = {
  criteria: [
    { id: 'AC-01', level: 'e2e_local', given: '`nominal` (12 mails)' },
    { id: 'AC-02', level: 'static', given: 'the crew definition, `crew/config.yaml`' },
  ],
  indicators: [
    { id: 'IND-01', level: 'e2e_local', threshold: 100 },
    { id: 'IND-02', level: 'e2e_remote', threshold: 95 },
  ],
  invariants: [{ id: 'INV-FS', level: 'component' }],
  dropped: ['AC-03'],
};

const CONFIG = readWorkbookBenchConfig(workbookFixture('clean/tests/bench.config.json')).config!;

interface Plan {
  datasets?: string[];
  targets?: string[];
  judges?: string;
  budget?: string[];
}

function plan({ datasets = ['| nominal | synthetic | 12 mails | the mix | AC-01 |'], targets = ['| stub | `stub` | — | L2 |'], judges = 'None.', budget = ['| local | 60 minutes |', '| remote | 2.00 USD per attempt |'] }: Plan = {}) {
  return readMarkdown(
    [
      '## Datasets',
      '',
      '| Name | Origin | Size | Cases covered | Criteria served |',
      '|---|---|---|---|---|',
      ...datasets,
      '',
      '## LLM targets',
      '',
      '| Target | Profile | Model | Required for |',
      '|---|---|---|---|',
      ...targets,
      '',
      '## Judges',
      '',
      judges,
      '',
      '## Budget',
      '',
      '| Kind | Limit |',
      '|---|---|',
      ...budget,
    ].join('\n'),
  );
}

function found(options: Plan = {}, ids: WorkbookIds = IDS, config: typeof CONFIG | null = CONFIG): [string, string, string][] {
  return testPlanFindings(plan(options), ids, config).map((finding) => [finding.code, `${finding.artefact} § ${String(finding.section)}`, finding.message]);
}

const JUDGES = '| Id | Rubric | Scale | Threshold | Applies to |\n|---|---|---|---|---|\n';

describe('testPlanFindings', () => {
  it('finds nothing in a plan whose datasets, targets, judges and budget are stated', () => {
    expect(found()).toEqual([]);
    expect(found({ judges: `${JUDGES}| J-01 | \`judges/reply-draft.md\` v1 | 1–5 | IND-01 (L3), IND-02 (L4) | the drafts |\n| \`J-02\` | \`judges/tone.md\` v1 | 1–5 | 3.5 | the drafts |` })).toEqual([]);
    expect(found({ targets: ['| stub | `stub` | — | L2 |', '| local | machine | | L3 |', '| remote | `claude` | | L4 |', '| later | | | |', '| never | — | | |'] })).toEqual([]);
  });

  it('reads a name, an origin and a profile with a remark beside them, and the other spelling of anonymized', () => {
    const datasets = ['| `nominal` (12 mails) | `synthetic` (généré par /team-tests) | | | AC-01 |', '| edge | anonymised | | | AC-01 |', '| big | provided (by the user, see `README.md`) | | | AC-01 |'];
    const targets = ['| remote | `claude` (profil nommé de bench.config.json) | | L4 |', '| local | machine (Ollama) | | L3 |', '| `stub` | stub, le LLM simulé (`127.0.0.1`) | | L2 |'];
    expect(found({ datasets, targets })).toEqual([]);
    expect(found({ datasets: ['| nominal (12 mails) | synthetic, généré | | | AC-01 |'] })).toEqual([]);
    expect(found({ datasets: ['| nominal | synthetic-ish | | | AC-01 |'] }).map(([code]) => code)).toEqual(['dataset-incomplete']);
  });

  it('does not read a second table of datasets, of judges or of the budget that has the key column alone', () => {
    const datasets = ['| nominal | synthetic | 12 mails | the mix | AC-01 |', '', 'Cas du jeu `nominal` :', '', '| Name | Description |', '|---|---|', '| support-outage | une panne signalée |', '| billing-deadline | une échéance à deux jours |'];
    const judges = `${JUDGES}| J-01 | \`judges/x.md\` v1 | 1–5 | 3.5 | the drafts |\n\n| Id | Note |\n|---|---|\n| juge | calibrated once |`;
    const budget = ['| local | 60 minutes |', '| remote | 2.00 USD per attempt |', '', '| Kind | Estimate |', '|---|---|', '| remote comparison | 0.40 USD |'];
    expect(found({ datasets, judges, budget })).toEqual([]);
  });

  it('misses the table of the template when its headers are renamed: the rules of the section say so', () => {
    const renamed = plan().lines.map((line) => line.text).join('\n').replace('| Kind | Limit |', '| Kind | Budget |');
    expect(testPlanFindings(readMarkdown(renamed), IDS, CONFIG).map((finding) => [finding.code, finding.message])).toEqual([
      ['budget', 'no `local` row with a number in `Limit`: the minutes a local attempt may take'],
      ['budget', 'no `remote` row with a number in `Limit`: the cap in USD of a remote attempt'],
    ]);
  });

  it('does not let a remark rescue a wrong value: a cell is read by what it opens with', () => {
    expect(found({ targets: ['| remote | openai (comme `claude`) | | L4 |', '| other | `gpt-5` (pas `claude`) | | L4 |', '| third | the `stub` profile | | L2 |'] }).map(([code, , message]) => [code, message.split(' is neither')[0]])).toEqual([
      ['target-profile', 'target `remote`: profile `openai (comme claude)`'],
      ['target-profile', 'target `other`: profile `gpt-5`'],
      ['target-profile', 'target `third`: profile `the stub profile`'],
    ]);
    expect(found({ datasets: ['| nominal | `real` — `synthetic` refusé | | | AC-01 |', '| edge | real (not synthetic) | | | AC-01 |'] }).map(([code, , message]) => [code, message.split(' — none')[0]])).toEqual([
      ['dataset-incomplete', '`nominal`: `Origin` `real`'],
      ['dataset-incomplete', '`edge`: `Origin` `real (not synthetic)`'],
    ]);
  });

  it('asks a dataset for a name, written once, and an origin of the list', () => {
    expect(found({ datasets: ['| nominal | synthetic | | | AC-01 |', '| nominal | provided | | | AC-01 |', '| — | anonymized | | | AC-01 |', '| edge | Synthetic | | | AC-01 |', '| big | | | | AC-01 |'] })).toEqual([
      ['dataset-incomplete', 'TEST-PLAN.md § Datasets', '`nominal`: the name is on two rows'],
      ['dataset-incomplete', 'TEST-PLAN.md § Datasets', 'row 3: no `Name`'],
      ['dataset-incomplete', 'TEST-PLAN.md § Datasets', '`edge`: `Origin` `Synthetic` — none of `synthetic`, `provided` and `anonymized`'],
      ['dataset-incomplete', 'TEST-PLAN.md § Datasets', '`big`: `Origin` is empty — none of `synthetic`, `provided` and `anonymized`'],
    ]);
  });

  it('refuses a served id that is unknown or dropped, wherever the cell writes it — a range names its two ends', () => {
    expect(found({ datasets: ['| nominal | synthetic | | | AC-01 (12 mails), AC-03, AC-09, IND-01…IND-03 |'] })).toEqual([
      ['dataset-unknown-id', 'TEST-PLAN.md § Datasets', '`nominal`: `Criteria served` — `AC-03` is dropped'],
      ['dataset-unknown-id', 'TEST-PLAN.md § Datasets', '`nominal`: `Criteria served` — `ACCEPTANCE.md` does not declare `AC-09`'],
      ['dataset-unknown-id', 'TEST-PLAN.md § Datasets', '`nominal`: `Criteria served` — `ACCEPTANCE.md` does not declare `IND-03`'],
    ]);
    expect(found({ datasets: ['| nominal | synthetic | | | AC-01, IND-01…IND-02 |'] })).toEqual([]);
  });

  it('takes for the dataset of a criterion the first back-ticked kebab-case name of Given that is a dataset', () => {
    const ids = (given: string, level: WorkbookIds['criteria'][number]['level'] = 'e2e_local'): WorkbookIds => ({ ...IDS, criteria: [{ id: 'AC-01', level, given }] });
    const datasets = ['| nominal | synthetic | | | AC-01 |', '| edge | synthetic | | | AC-01 |'];
    for (const given of ['`edge`, case `edge-empty-body`', 'the files of `/mailbox`, loaded from `nominal`', '`nominal`, then `incr-v2`', 'un registre `state` vide et le jeu `nominal` (aucun courriel)', '`incr-v1`, then `nominal`']) {
      expect(found({ datasets }, ids(given)), given).toEqual([]);
    }
    expect(found({ datasets }, ids('un registre `state` vide, puis `incr-v1`'))).toEqual([
      ['ac-dataset', 'ACCEPTANCE.md § Acceptance criteria', 'AC-01: `Given` names the dataset `state`, which is not a `Name` of `TEST-PLAN.md` `## Datasets`'],
    ]);
    expect(found({ datasets }, ids('`incr-v1`', 'component')).map(([code]) => code)).toEqual(['ac-dataset']);
  });

  it('judges the dataset of a criterion at L2 and above only: below, the name may be a tool, and nothing runs on a dataset', () => {
    const ids = (level: WorkbookIds['criteria'][number]['level'], given: string): WorkbookIds => ({ ...IDS, criteria: [{ id: 'AC-01', level, given }] });
    const datasets = ['| nominal | synthetic | | | AC-01 |'];
    for (const level of ['static', 'unit', null] as const) {
      expect(found({ datasets }, ids(level, 'the tool `dedupe`, given two lists that share a key')), String(level)).toEqual([]);
      expect(found({ datasets }, ids(level, '`registry_update` reçoit un registre de 3 clés')), String(level)).toEqual([]);
    }
    for (const level of ['component', 'e2e_local', 'e2e_remote'] as const) {
      expect(found({ datasets }, ids(level, 'the `crew/config.yaml` of the team')), level).toEqual([
        ['ac-no-dataset', 'ACCEPTANCE.md § Acceptance criteria', 'AC-01: `Given` names no back-ticked dataset, and a criterion at L2 or above runs on one of `TEST-PLAN.md` `## Datasets`'],
      ]);
    }
  });

  it('warns about a dataset no criterion names and that serves no declared id', () => {
    const datasets = ['| nominal | synthetic | | | — |', '| incr-v2 | synthetic | | | INV-FS |', '| spare | synthetic | | | AC-03 |'];
    expect(found({ datasets }).filter(([code]) => code === 'dataset-unused')).toEqual([['dataset-unused', 'TEST-PLAN.md § Datasets', '`spare`: no active criterion names it in `Given`, and it serves no declared id']]);
  });

  it('asks for an adversarial set once INV-INJECTION is declared', () => {
    const ids: WorkbookIds = { ...IDS, invariants: [...IDS.invariants, { id: 'INV-INJECTION', level: 'e2e_local' }] };
    expect(found({}, ids)).toEqual([
      ['adversarial-missing', 'TEST-PLAN.md § Datasets', '`INV-INJECTION` is declared and no dataset lists it in `Criteria served`: untrusted inputs call for an adversarial set'],
    ]);
    expect(found({ datasets: ['| nominal | synthetic | | | AC-01 |', '| adversarial | synthetic | | | INV-INJECTION |'] }, ids)).toEqual([]);
  });

  it('asks a judge for an id, a rubric, a scale and a threshold that is a number or a declared indicator', () => {
    const rows = ['| J-1 | r | 1–5 | 4 | x |', '| J-02 | | | | x |', '| J-03 | r | 1–5 | high | x |', '| J-04 | r | 1–5 | IND-01, IND-07 | x |', '| J-04 | r | 1–5 | 4.0 | x |', '| | r | 1–5 | 4 | x |'];
    expect(found({ judges: JUDGES + rows.join('\n') })).toEqual([
      ['judge-incomplete', 'TEST-PLAN.md § Judges', 'J-1: not a judge id (`J-nn`, two digits or more)'],
      ['judge-incomplete', 'TEST-PLAN.md § Judges', 'J-02: empty `Rubric`; empty `Scale`; empty `Threshold`'],
      ['judge-incomplete', 'TEST-PLAN.md § Judges', 'J-03: `Threshold` `high` is neither a number nor the id of an indicator'],
      ['judge-incomplete', 'TEST-PLAN.md § Judges', 'J-04: `Threshold` names `IND-07`, which `ACCEPTANCE.md` does not declare'],
      ['id-duplicate', 'TEST-PLAN.md § Judges', '`J-04` is on two rows: an id names one row, and is never reused'],
      ['judge-incomplete', 'TEST-PLAN.md § Judges', 'row 6: no id'],
    ]);
  });

  it('knows the profiles stub, machine and those of the configuration — and judges none without the configuration', () => {
    const targets = ['| remote | `gpt` | | L4 |', '| | `claude-2 (remote)` | | |'];
    expect(found({ targets })).toEqual([
      ['target-profile', 'TEST-PLAN.md § LLM targets', 'target `remote`: profile `gpt` is neither `stub`, `machine` nor a profile of bench.config.json'],
      ['target-profile', 'TEST-PLAN.md § LLM targets', 'a target: profile `claude-2 (remote)` is neither `stub`, `machine` nor a profile of bench.config.json'],
    ]);
    expect(found({ targets: ['| x | `toString` | | |'] })).toHaveLength(1);
    expect(found({ targets }, IDS, null)).toEqual([]);
  });

  it('asks the budget for its two rows, each with a number', () => {
    expect(found({ budget: ['| local | a morning |'] })).toEqual([
      ['budget', 'TEST-PLAN.md § Budget', 'no `local` row with a number in `Limit`: the minutes a local attempt may take'],
      ['budget', 'TEST-PLAN.md § Budget', 'no `remote` row with a number in `Limit`: the cap in USD of a remote attempt'],
    ]);
  });
});

describe('plannedBudget', () => {
  it('reads the first number of each limit, whatever the unit written after it', () => {
    expect(plannedBudget(plan())).toEqual({ localMinutes: 60, remoteUsd: 2 });
    expect(plannedBudget(plan({ budget: ['| `Local` | 90 |', '| remote | 0.50 USD |'] }))).toEqual({ localMinutes: 90, remoteUsd: 0.5 });
    expect(plannedBudget(readMarkdown('## Budget\n\nNone.'))).toEqual({ localMinutes: null, remoteUsd: null });
  });

  it('reads the number that stands before the unit, and the kind by its first word', () => {
    const budget = (local: string, remote: string) => plannedBudget(plan({ budget: [`| ${local} |`, `| ${remote} |`] }));
    expect(budget('local | 1 h (60 minutes)', 'remote (L4) | 2 essais, 5.00 USD au plus')).toEqual({ localMinutes: 60, remoteUsd: 5 });
    expect(budget('local (L3) | L3 : 90 min par tentative', '`remote` | $ 3 per attempt, 2.50 $ on average')).toEqual({ localMinutes: 90, remoteUsd: 2.5 });
    expect(budget('Local | 45', 'Remote, on request | 0 USD (aucun essai distant)')).toEqual({ localMinutes: 45, remoteUsd: 0 });
    expect(budget('locally | 45', 'remote | —')).toEqual({ localMinutes: null, remoteUsd: null });
  });

  it('reads a decimal comma as a decimal point, and of several numbers with the unit the last', () => {
    const budget = (local: string, remote: string) => plannedBudget(plan({ budget: [`| local | ${local} |`, `| remote | ${remote} |`] }));
    expect(budget('3 × 20 minutes = 60 minutes', '2,00 USD par tentative')).toEqual({ localMinutes: 60, remoteUsd: 2 });
    expect(budget('1,5 h, soit 90 min', '2 runs à 1.00 USD, soit 2.00 USD')).toEqual({ localMinutes: 90, remoteUsd: 2 });
    expect(budget('60 mn', '$2.00 per attempt (10 runs max)')).toEqual({ localMinutes: 60, remoteUsd: 2 });
    expect(budget('0,5', '0,25 USD')).toEqual({ localMinutes: 0.5, remoteUsd: 0.25 });
    expect(plannedBudget(readMarkdown('## Levels'))).toEqual({ localMinutes: null, remoteUsd: null });
  });
});

describe('readWorkbookBenchConfig', () => {
  const messages = (text: string | null) => readWorkbookBenchConfig(text).findings.map((finding) => [finding.code, finding.artefact, finding.section, finding.message]);

  it('reads a configuration, a byte order mark skipped', () => {
    const reading = readWorkbookBenchConfig(`﻿${workbookFixture('clean/tests/bench.config.json')}`);
    expect(reading.findings).toEqual([]);
    expect(reading.config?.budget).toEqual({ local_minutes_max: 60, remote_usd_max: 2 });
  });

  it('says the file is missing, and which step writes it', () => {
    expect(messages(null)).toEqual([['config-missing', 'bench.config.json', null, 'tests/<slug>/bench.config.json does not exist: `/team-test-plan` writes it from the plan']]);
    expect(readWorkbookBenchConfig(null).config).toBeNull();
  });

  it('refuses what is not strict JSON, and what the parser of the bench refuses, in its words', () => {
    expect(messages('{ "budget": {} // later\n}')).toEqual([['config-invalid', 'bench.config.json', null, 'not strict JSON — line 1: a comment']]);
    expect(messages('{ "budget": {}, "budget": {} }')).toEqual([['config-invalid', 'bench.config.json', null, 'not strict JSON — line 1: the key "budget" written twice']]);
    expect(messages('{ "budget": ')).toEqual([['config-invalid', 'bench.config.json', null, 'not valid JSON: line 1, column 13']]);
    expect(messages('')).toEqual([['config-invalid', 'bench.config.json', null, 'not valid JSON: line 1, column 1']]);
    expect(messages('{ "levels": { "e2e_local": { "profile": "nobody" } } }')).toEqual([['config-invalid', 'bench.config.json', null, 'invalid bench.config.json: levels.e2e_local.profile: unknown profile "nobody"']]);
  });
});

describe('a value of bench.config.json', () => {
  const SECRET = 'sk-ant-api03-SECRETVALUE';

  it('never reaches a message: a syntax error is given by its place, not by an excerpt', () => {
    const text = workbookFixture('clean/tests/bench.config.json').replace('"keyEnv": "ANTHROPIC_API_KEY"', `"keyEnv": "K", "apiKey": ${SECRET}`);
    const [finding] = readWorkbookBenchConfig(text).findings;
    expect(finding?.message).toBe('not valid JSON: line 4, column 112');
    for (const broken of [`{ "key": "${SECRET}" `, `{ "key": "${SECRET}", }x`, `["${SECRET}" "b"]`, `{ "a": { "key": ${SECRET} } }`, `"${SECRET}`, `{ "k\\q": "${SECRET}" }`]) {
      const message = readWorkbookBenchConfig(broken).findings[0]?.message ?? '';
      expect(message, broken).toMatch(/^not (?:valid JSON: line \d+, column \d+|strict JSON — line \d+: a trailing comma)$/);
      expect(message).not.toContain('SECRET');
    }
  });

  it('never reaches a message: a profile still to decide is named with its key, not with what the key holds', () => {
    const config = { profiles: { claude: { baseUrl: `https://user:${SECRET}@host/<region>/v1`, model: 'm', keyEnv: 'REMOTE_KEY' } }, levels: { e2e_remote: { profile: 'claude' } } };
    const [finding] = benchConfigFindings(readWorkbookBenchConfig(JSON.stringify(config)).config!, { localMinutes: null, remoteUsd: null }, { ...IDS, criteria: [] });
    expect(finding?.message).toBe('profile `claude`: `baseUrl` still holds a `<…>` placeholder, and `levels.e2e_remote` names that profile');
  });

  it('is walked without a deep call when the file nests without end', () => {
    expect(readWorkbookBenchConfig('['.repeat(200_000)).findings[0]?.message).toBe('not valid JSON: line 1, column 200001');
  });
});

describe('benchConfigFindings', () => {
  const messages = (config: unknown, budget = { localMinutes: 60 as number | null, remoteUsd: 2 as number | null }, ids = IDS) =>
    benchConfigFindings(readWorkbookBenchConfig(JSON.stringify(config)).config!, budget, ids).map((finding) => [finding.code, finding.message]);
  const LEVELS = { e2e_local: { profile: 'machine' }, e2e_remote: { profile: 'machine' } };

  it('finds nothing where the configuration follows the plan', () => {
    expect(messages(JSON.parse(workbookFixture('clean/tests/bench.config.json')))).toEqual([]);
    // The defaults of the bench are the budget of the template.
    expect(messages({ levels: LEVELS })).toEqual([]);
  });

  it('compares the two limits with the numbers of the plan, when the plan gives them', () => {
    const config = { levels: LEVELS, budget: { local_minutes_max: 45, remote_usd_max: 5 } };
    expect(messages(config)).toEqual([
      ['config-budget', '`budget.local_minutes_max` is 45 and `TEST-PLAN.md` `## Budget` says 60'],
      ['config-budget', '`budget.remote_usd_max` is 5 and `TEST-PLAN.md` `## Budget` says 2'],
    ]);
    expect(messages(config, { localMinutes: null, remoteUsd: null })).toEqual([]);
  });

  it('says the bench defaults to a limit the configuration does not state', () => {
    const reading = readWorkbookBenchConfig(JSON.stringify({ levels: LEVELS, budget: { local_minutes_max: 60 } }));
    expect(reading.stated).toEqual(['local_minutes_max']);
    expect(benchConfigFindings(reading.config!, { localMinutes: 90, remoteUsd: 0 }, IDS, reading.stated).map((finding) => finding.message)).toEqual([
      '`budget.local_minutes_max` is 60 and `TEST-PLAN.md` `## Budget` says 90',
      '`budget.remote_usd_max` is not stated — the bench defaults to 2 — and `TEST-PLAN.md` `## Budget` says 0',
    ]);
    expect(readWorkbookBenchConfig('{}').stated).toEqual([]);
  });

  it('refuses a profile still to decide once a level names it, and leaves one no level uses', () => {
    const claude = { baseUrl: 'https://api.example.com/<region>', model: '<to decide>', keyEnv: 'REMOTE_KEY' };
    expect(messages({ profiles: { claude }, levels: { ...LEVELS, e2e_remote: { profile: 'claude' } } })).toEqual([
      ['config-placeholder', 'profile `claude`: `model` and `baseUrl` still hold a `<…>` placeholder, and `levels.e2e_remote` names that profile'],
    ]);
    expect(messages({ profiles: { claude }, levels: LEVELS })).toEqual([]);
  });

  it('asks for the end-to-end level an id sits at', () => {
    expect(messages({})).toEqual([
      ['config-remote', 'IND-02 sits at L4 and `levels.e2e_remote` is absent'],
      ['config-local', 'AC-01 and IND-01 sit at L3 and `levels.e2e_local` is absent'],
    ]);
    expect(messages({}, undefined, { ...IDS, criteria: [], indicators: [] })).toEqual([]);
  });
});
