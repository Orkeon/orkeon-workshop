import { describe, expect, it } from 'vitest';

import { checkDesign, checkTestPlan, type DesignInputs } from '../../../src/domain/workbook/check-workbook.js';
import { FINDING_CODES, sortFindings, type Finding, type FindingCode } from '../../../src/domain/workbook/finding.js';
import { cleanInputs, templateInputs, workbookFixture } from '../../fakes/workbook-fixtures.js';

type Artefact = 'need' | 'acceptance' | 'testPlan' | 'design' | 'plan' | 'benchConfig';

/** `inputs` with one text of an artefact replaced; the text must be there, or the case tests nothing. */
function edit(inputs: DesignInputs, artefact: Artefact, from: string | RegExp, to: string): DesignInputs {
  const text = inputs[artefact] as string;
  const edited = text.replace(from, () => to);
  expect(edited, `${artefact}: ${String(from)} not found`).not.toBe(text);
  return { ...inputs, [artefact]: edited };
}

/** The clean workbook without its tests (`check design` without `--tests`), after the edits. */
function edited(...edits: [Artefact, string | RegExp, string][]): DesignInputs {
  return edits.reduce((inputs, [artefact, from, to]) => edit(inputs, artefact, from, to), { ...cleanInputs(), tests: null } as DesignInputs);
}

function codes(inputs: DesignInputs): FindingCode[] {
  return checkDesign('mail-triage', inputs).findings.map((finding) => finding.code);
}

const INDICATORS_END = '| IND-02 | mails of `nominal` whose `category` equals `expected/`, median of the runs | % | 80 | >= | L3 |';
const INVARIANTS_END = '| INV-01 | A draft holds nothing taken from another mail than its own (R-06) | scenario check of each draft against the other mails of `/mailbox` | L2 |';
const LAST_AGENT = '| drafter | Writes the reply draft of each mail that calls for one | `file_read`, `file_write` | 10 | one draft per mail of the three categories, 25 at most |';
const NO_REMOTE = '"e2e_remote": { "profile": "claude", "repeat": 1 }';

/**
 * One fault at a time in the clean workbook, and the codes it gives — all of them: a fault that
 * brought another finding along would be a false positive of that other rule.
 */
const FAULTS: [string, DesignInputs | (() => DesignInputs), FindingCode[]][] = [
  // What every artefact owes.
  ['a heading renamed', () => edited(['design', '## LLM profile', '## Model']), ['headings']],
  ['a placeholder of the template', () => edited(['plan', '# Mail triage — Plan', '# {{TEAM_TITLE}} — Plan']), ['placeholder']],
  ['a line left by a decision', () => edited(['acceptance', '# Mail triage — Acceptance', '# Mail triage — Acceptance\n\n> To revise — DEC-0003: a criterion on the drafts']), ['to-revise']],
  ['an empty section', () => edited(['testPlan', 'Every active AC passes at its level, every IND is within its threshold, every INV is true.', '']), ['empty-section']],
  ['a TBD in the need', () => edited(['need', 'No blocking question.', 'TBD: who exports the mails?']), ['need-tbd']],
  // ACCEPTANCE.md.
  ['an id with one digit', () => edited(['acceptance', INDICATORS_END, `${INDICATORS_END}\n| IND-3 | drafts written | count | 5 | >= | L3 |`]), ['id-malformed']],
  ['an id on two rows', () => edited(['acceptance', INDICATORS_END, `${INDICATORS_END}\n| IND-02 | drafts written | count | 5 | >= | L3 |`]), ['id-duplicate']],
  ['a criterion without its trigger', () => edited(['acceptance', '| AC-02 | `empty` (no mail) | the team runs |', '| AC-02 | `empty` (no mail) | — |']), ['ac-incomplete']],
  ['two levels in a cell', () => edited(['acceptance', '| % | 80 | >= | L3 |', '| % | 80 | >= | L3 / L4 |']), ['level']],
  ['a status of its own', () => edited(['acceptance', '| L0 | active |', '| L0 | Active |']), ['ac-status']],
  ['a dataset the plan does not list', () => edited(['acceptance', '| AC-02 | `empty` (no mail) |', '| AC-02 | `void` (no mail) |']), ['ac-dataset']],
  ['a criterion above L0 without a dataset', () => edited(['acceptance', '| AC-02 | `empty` (no mail) |', '| AC-02 | an empty mailbox |']), ['ac-no-dataset']],
  ['a threshold with its unit', () => edited(['acceptance', '| % | 80 | >= | L3 |', '| % | 80 % | >= | L3 |']), ['ind-incomplete']],
  ['an invariant without a check', () => edited(['acceptance', '| Only the declared tools are called | events vs the definition |', '| Only the declared tools are called | — |']), ['inv-incomplete']],
  ['an invariant the catalogue does not know', () => edited(['acceptance', INVARIANTS_END, `${INVARIANTS_END}\n| INV-SPEED | A run ends within the hour | the run manifest | L3 |`]), ['inv-unknown', 'coverage']],
  ['an invariant that always applies, not declared', () => edited(['acceptance', '| INV-BUDGET | Tokens and duration stay under the cap | the run manifest | L3 |\n', '']), ['inv-always', 'dataset-unknown-id', 'batch-unknown-id']],
  ['an invariant below its lowest level', () => edited(['acceptance', '| the run manifest | L3 |', '| the run manifest | L2 |']), ['inv-level']],
  // TEST-PLAN.md.
  ['an origin of its own', () => edited(['testPlan', '| empty | synthetic |', '| empty | generated |']), ['dataset-incomplete']],
  ['a dataset serving an unknown id', () => edited(['testPlan', 'an empty `/mailbox` | AC-02 |', 'an empty `/mailbox` | AC-02, AC-09 |']), ['dataset-unknown-id']],
  ['a dataset nothing uses', () => edited(['testPlan', '| empty | synthetic |', '| spare | synthetic | 1 mail | nothing yet | — |\n| empty | synthetic |']), ['dataset-unused']],
  ['no adversarial set for INV-INJECTION', () => edited(['testPlan', 'a header | INV-INJECTION |', 'a header | — |']), ['adversarial-missing', 'dataset-unused']],
  [
    'a judge with a word for a threshold',
    () => edited(['testPlan', '## Judges\n\nNone.', '## Judges\n\n| Id | Rubric | Scale | Threshold | Applies to |\n|---|---|---|---|---|\n| J-01 | `judges/reply-draft.md` v1 | 1–5 | high | the drafts |']),
    ['judge-incomplete'],
  ],
  ['a profile the configuration does not have', () => edited(['testPlan', '| remote | `claude` |', '| remote | `gpt` |']), ['target-profile']],
  ['a budget in words', () => edited(['testPlan', '| local | 60 minutes |', '| local | an hour |']), ['budget']],
  // bench.config.json.
  ['no bench configuration', { ...edited(), benchConfig: null }, ['config-missing']],
  ['a configuration that is not JSON', { ...edited(), benchConfig: '{ "profiles": ' }, ['config-invalid']],
  ['a budget that differs from the plan', () => edited(['testPlan', '| local | 60 minutes |', '| local | 90 minutes |']), ['config-budget']],
  ['a model still to decide', () => edited(['benchConfig', '"claude-sonnet-5-5"', '"<to decide>"']), ['config-placeholder']],
  ['a remote budget the configuration leaves to its default', () => edited(['testPlan', '| remote | 2.00 USD per attempt |', '| remote | 0 USD (aucun essai distant) |'], ['benchConfig', ', "remote_usd_max": 2.0', '']), ['config-budget']],
  ['an indicator at L4 and no remote level', () => edited(['acceptance', '| % | 80 | >= | L3 |', '| % | 80 | >= | L4 |'], ['benchConfig', `,\n    ${NO_REMOTE}`, '']), ['config-remote']],
  ['ids at L3 and no local level', () => edited(['benchConfig', '"e2e_local": { "profile": "machine", "repeat": 3, "pass_at": 2 },', '']), ['config-local']],
  // DESIGN.md.
  ['no mode named', () => edited(['design', '`sequential`: three steps', 'In order: three steps']), ['process']],
  ['a hierarchy without a manager', () => edited(['design', '`sequential`: three steps', '`hierarchical`: three steps']), ['process-manager', 'process-failure']],
  ['a mode other than sequential', () => edited(['design', '`sequential`: three steps', '`hierarchical`, with `sorter` as its manager: three steps']), ['process-failure']],
  ['six agents', () => edited(['design', LAST_AGENT, `${LAST_AGENT}\n| a4 | Checks | — | 2 | one pass |\n| a5 | Checks | — | 2 | one pass |\n| a6 | Checks | — | 2 | one pass |`]), ['agents-count']],
  ['a maxIter in words', () => edited(['design', '| `file_read`, `file_write` | 10 |', '| `file_read`, `file_write` | many |']), ['agent-incomplete']],
  ['a tool the catalogue does not list', () => edited(['design', '| `email_parser`, `file_read` |', '| `email_parse`, `file_read` |']), ['unknown-tool']],
  ['the reader of mails also sends', () => edited(['design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read`, `email_send` |']), ['mail-read-send', 'mail-send']],
  ['the reader of mails sends through a row of ## Tools', () => edited(['design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | built-in | sorter | — |\n| `email_send` | built-in | reader | — |']), ['mail-read-send', 'mail-send']],
  ['a tool hidden by leaving its back-ticks out', () => edited(['design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read`, plus email_send and email_parse pour les réponses |']), ['unknown-tool', 'mail-read-send', 'mail-send']],
  ['email_send in other hands', () => edited(['design', '| `file_read`, `file_write` | 10 |', '| `file_read`, `file_write`, `email_send` | 10 |']), ['mail-send']],
  ['a kind of its own', () => edited(['design', '| `json_tool` | built-in |', '| `json_tool` | native |']), ['tool-incomplete']],
  ['a custom tool named after a catalogue tool', () => edited(['design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | custom | sorter | a pure function |']), ['tool-shadow']],
  ['a task for nobody', () => edited(['design', '| classify | sorter |', '| classify | nobody |']), ['task-incomplete']],
  ['a cycle', () => edited(['design', '| parse_mails | reader | — |', '| parse_mails | reader | draft_replies |']), ['task-cycle']],
  ['a result read without the dependency', () => edited(['design', '| draft_replies | drafter | parse_mails, classify |', '| draft_replies | drafter | classify |']), ['task-reads']],
  ['no diagram', () => edited(['design', '```mermaid', '```text']), ['diagram']],
  ['a mount point without its folder', () => edited(['design', '| `/state` | rw | state | `./state` |', '| `/state` | rw | state | — |']), ['mounts']],
  ['an access that is not the need’s', () => edited(['design', '| `/state` | rw | state | `./state` |', '| `/state` | rwnd | state | `./state` |']), ['mounts-need']],
  ['a source of its own', () => edited(['design', '| tool_call | plain text', '| a tool | plain text']), ['deliverable']],
  ['a deliverable no task carries', () => edited(['design', '| the results of `parse_mails` and `classify` | `/output/drafts/<mail>.txt` |', '| the results of `parse_mails` and `classify` | — |']), ['deliverable-orphan']],
  ['a read-only deliverable on a task row only', () => edited(['design', '| `/output/classification.json` |\n| draft', '| `/mailbox/classification.json` |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a result read without the dependency, the task named with a possessive', () => edited(['design', '| parse_mails, classify | the results of `parse_mails` and `classify` |', "| parse_mails | `parse_mails`, and `classify`'s result |"]), ['task-reads']],
  ['a cycle behind a dash', () => edited(['design', '| parse_mails | reader | — |', '| parse_mails | reader | `—`, draft_replies |']), ['task-cycle']],
  ['a resume strategy said not to apply', () => edited(['design', /(## Resume and incremental strategy\n\n)[\s\S]*?(\n\n## LLM profile)/, '## Resume and incremental strategy\n\nNot applicable.\n\n## LLM profile']), ['resume']],
  ['a hierarchy named after another mode is dismissed', () => edited(['design', '`sequential`: three steps', 'Pas de `sequential` : un manager décide. `hierarchical`: three steps']), ['process-manager', 'process-failure']],
  ['no resume strategy where an invariant asks for one', () => edited(['design', /(## Resume and incremental strategy\n\n)[\s\S]*?(\n\n## LLM profile)/, '## Resume and incremental strategy\n\nNone.\n\n## LLM profile']), ['resume']],
  ['a risk without mitigation', () => edited(['design', '## Risks\n\n| Risk | Mitigation |\n|---|---|', '## Risks\n\n| Risk | Mitigation |\n|---|---|\n| The model is slow | — |']), ['risks']],
  // PLAN.md.
  ['a batch named after a level', () => edited(['plan', '| B1 | the registry tool', '| L1 | the registry tool'], ['plan', '### B1\n', '### L1\n']), ['batch-id']],
  ['a status of its own', () => edited(['plan', '| 15 minutes, no model | todo |', '| 15 minutes, no model | started |']), ['batch-incomplete']],
  ['a batch covering a dropped criterion', () => edited(['plan', '| AC-03, INV-TOOLS, INV-INCR |', '| AC-03, AC-04, INV-TOOLS, INV-INCR |']), ['batch-unknown-id']],
  ['a criterion no batch covers', () => edited(['plan', '| AC-01, AC-02, INV-FS,', '| AC-01, INV-FS,']), ['coverage']],
  ['two batches on the light track', { ...edited(), track: { track: 'light' } }, ['light-track']],
  ['a sheet without one of its parts', () => edited(['plan', '#### Design decisions\n\nNone.\n\n', '']), ['sheet']],
  ['a step without its ticks', () => edited(['plan', '2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — declare the three tasks', '2. declare the three tasks']), ['steps']],
  ['two steps with one number', () => edited(['plan', '2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write the domain', '1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write the domain'], ['plan', /\| 2 \| `teams\/mail-triage\/crew\/tools\/registry-update\/domain.ts`.*\n/, '']), ['steps']],
  ['a step hidden by a number in the remark of an anchor', () => edited(['plan', /\| 2 \| `teams\/mail-triage\/crew\/tools\/registry-update\/domain.ts`.*\n/, ''], ['plan', '| 1 | `teams/mail-triage/mounts.json`', '| 1 (avant B2) | `teams/mail-triage/mounts.json`']), ['anchors']],
  ['a line left by a decision, retyped', () => edited(['plan', '# Mail triage — Plan', '# Mail triage — Plan\n\n> **To revise - DEC-0003**: a third batch']), ['to-revise']],
  ['an anchor in the tests', () => edited(['plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `tests/mail-triage/unit/crew.test.ts` |']), ['anchors']],
  ['an anchor from the root', () => edited(['plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `/workspace/teams/mail-triage/crew/crew.ork.ts` |']), ['anchors-path']],
  ['an anchor nothing observes', () => edited(['plan', '| `component/ac-02-empty-mailbox.scenario.json` |', '| — |']), ['anchors-tests']],
  ['an assumption with another id', () => edited(['plan', '| H1 | The local model', '| A1 | The local model']), ['assumptions']],
  // What a remark, a pair of brackets or another table must not hide (second review).
  ['email_send in brackets, without back-ticks', () => edited(['design', '| `email_parser`, `file_read` |', '| email_parser, file_read (email_send en dernier recours) |']), ['mail-read-send', 'mail-send']],
  ['the reader of mails in the brackets of a Used by', () => edited(['design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | built-in | sorter | — |\n| `email_send` | built-in | sorter (et reader pour les réponses) | — |']), ['mail-read-send', 'mail-send']],
  ['a tools table with a header of its own', () => edited(['design', '| Tool | Kind (built-in / custom) | Used by | Why deterministic |', '| Tool | Type | Used by | Why deterministic |']), ['unknown-tool', 'tool-incomplete']],
  ['a status that opens with active and quotes the old one', () => edited(['acceptance', '| L3 | dropped (DEC-0002) |', '| L3 | active (was `dropped (DEC-0002)`, restored by DEC-0005) |']), ['coverage']],
  ['a second criteria table with a header of its own', () => edited(['acceptance', '\n## Indicators', '\n| Id | Given | When | Expected | Level | Status |\n|---|---|---|---|---|---|\n| AC-05 | `nominal` | the team runs | no draft for a `spam` mail | L3 | active |\n\n## Indicators']), ['ac-incomplete', 'coverage']],
  ['a criterion written under the indicators', () => edited(['acceptance', '\n## Invariants', '\n| Id | Given (dataset) | When | Then | Level | Status |\n|---|---|---|---|---|---|\n| AC-09 | `nominal` | the team runs | x | L3 | active |\n\n## Invariants']), ['ind-incomplete']],
  ['a result read without the dependency, the task named in a span with a colon', () => edited(['design', '| parse_mails, classify | the results of `parse_mails` and `classify` |', '| parse_mails | `classify:output`, `(parse_mails)` |']), ['task-reads']],
  ['a task that delivers into a read-only folder', () => edited(['design', '| `/output/classification.json` |\n| draft', '| `/mailbox/` |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a second path of a deliverable under a read-only mount point', () => edited(['design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/output/drafts/<mail>.txt`, copie dans `/mailbox/done/<mail>.txt` | tool_call |']), ['deliverable']],
  ['a profile nobody declares, with a declared one in its remark', () => edited(['testPlan', '| remote | `claude` |', '| remote | openai (comme `claude`) |']), ['target-profile']],
  ['an access that is not one, with the right one in its remark', () => edited(['design', '| `/mailbox` | ro |', '| `/mailbox` | pas `rw` : `ro` |']), ['mounts', 'mounts-need']],
  ['an anchor in the tests, written in brackets', () => edited(['plan', '| 1 | `teams/mail-triage/mounts.json`, `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `teams/mail-triage/mounts.json`, `teams/mail-triage/crew/crew.ork.ts` (et `tests/mail-triage/static/ac-03-mail-tools.txt`, à adapter) |']), ['anchors']],
  ['a JSON deliverable whose schema is a dash with its reason', () => edited(['design', '| `library/schemas/mail-classification.schema.json` |', '| — (pas de schéma pour l’instant) |']), ['deliverable']],
  ['a read-only path in brackets, the only path of the cell', () => edited(['design', '| `/output/classification.json` |\n| draft', '| classification (`/mailbox/x.json`) |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a read-only glob, printed as written', () => edited(['design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/mailbox/*.txt` | tool_call |']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a task that only a table without the columns of the template holds', () => edited(['design', '\n```mermaid', '\n| Id | Expected output |\n|---|---|\n| parse_mails | la liste |\n| registry | le registre mis à jour |\n\n```mermaid']), ['task-incomplete']],
  // The tests.
  [
    'a scenario whose level is a label',
    { ...cleanInputs(), tests: cleanInputs().tests!.map((file) => (file.path === 'e2e/ac-01-nominal.scenario.json' ? { ...file, text: (file.text as string).replace('"e2e_local"', '"L3"') } : file)) },
    ['test-unreadable', 'untested', 'untested'],
  ],
  ['a test that cites nothing', { ...cleanInputs(), tests: [...cleanInputs().tests!, { path: 'unit/layout.test.js', text: 'the crew loads' }] }, ['test-orphan']],
  ['a scenario in a folder that does not serve its level', { ...cleanInputs(), tests: [...cleanInputs().tests!, { path: 'component/ac-01-wiring.scenario.json', text: '{ "covers": ["AC-01"], "level": "e2e_local" }' }] }, ['test-level']],
  ['a test that cites an unknown id', { ...cleanInputs(), tests: [...cleanInputs().tests!, { path: 'unit/extra.test.js', text: '// AC-09 — never declared' }] }, ['test-unknown-id']],
  ['a scenario that is not JSON', { ...cleanInputs(), tests: [...cleanInputs().tests!, { path: 'component/broken.scenario.json', text: '{ "covers": ' }] }, ['test-unreadable']],
  ['a criterion no test cites', { ...cleanInputs(), tests: cleanInputs().tests!.filter((file) => !file.path.startsWith('static/')) }, ['untested']],
  [
    'ids cited at another level only',
    { ...cleanInputs(), tests: cleanInputs().tests!.map((file) => (file.path === 'e2e/ac-01-nominal.scenario.json' ? { ...file, text: (file.text as string).replace('"e2e_local"', '"e2e_remote"') } : file)) },
    ['test-level', 'test-level'],
  ],
];

describe('checkDesign on the clean workbook', () => {
  it('passes without a finding, with its tests', () => {
    const result = checkDesign('mail-triage', cleanInputs());
    expect(result.findings).toEqual([]);
    expect(result).toEqual({
      team: 'mail-triage',
      check: 'design',
      status: 'pass',
      errors: 0,
      warnings: 0,
      findings: [],
      skipped: [],
      ids: {
        acceptance: ['AC-01', 'AC-02', 'AC-03'],
        indicators: ['IND-01', 'IND-02'],
        invariants: ['INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET', 'INV-INCR', 'INV-INJECTION', 'INV-01'],
        dropped: ['AC-04'],
      },
      tests: { files: 6, uncovered: [], orphans: [] },
    });
  });

  it('reports no tests unless they were asked for', () => {
    expect(checkDesign('mail-triage', { ...cleanInputs(), tests: null })).toMatchObject({ status: 'pass', findings: [], tests: null });
  });

  it.each(FAULTS)('%s', (_name, inputs, expected) => {
    expect(codes(typeof inputs === 'function' ? inputs() : inputs)).toEqual(expected);
  });

  it('has a fault for every code but the two that need a workbook of their own', () => {
    const tried = new Set(FAULTS.flatMap(([, , expected]) => expected));
    expect(FINDING_CODES.filter((code) => !tried.has(code))).toEqual(['ac-none', 'tests-none']);
  });

  it('finds no active criterion once every one is dropped', () => {
    const result = checkDesign('mail-triage', edited(['acceptance', /\| active \|/g, '| dropped (DEC-0003) |']));
    expect(result.findings.map((finding) => finding.code)).toContain('ac-none');
    expect(result.ids).toMatchObject({ acceptance: [], dropped: ['AC-01', 'AC-02', 'AC-03', 'AC-04'] });
  });

  it('finds no test in empty test folders, and every criterion and invariant untested', () => {
    const result = checkDesign('mail-triage', { ...cleanInputs(), tests: [] });
    expect(result.findings.map((finding) => finding.code)).toEqual(['tests-none', ...Array.from({ length: 10 }, () => 'untested')]);
    expect(result.findings[0]).toEqual({ severity: 'error', code: 'tests-none', artefact: 'tests', section: null, message: 'no test file under `static/`, `unit/`, `component/`, `e2e/`: the tests exist before the team' });
    expect(result.tests).toEqual({ files: 0, uncovered: ['AC-01', 'AC-02', 'AC-03', 'INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET', 'INV-INCR', 'INV-INJECTION', 'INV-01'], orphans: [] });
  });

  it('does not judge the tool names without the catalogue, and says so', () => {
    const unknown = edited(['design', '| `email_parser`, `file_read` |', '| `email_parse`, `file_read` |'], ['design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | custom | sorter | a pure function |']);
    const reason = 'orkeon not found on PATH: tool names were not checked';
    const result = checkDesign('mail-triage', { ...unknown, catalogue: { tools: null, reason } });
    expect(result).toMatchObject({ status: 'pass', findings: [], skipped: [{ check: 'tool-catalogue', reason }] });
  });

  it('does not judge the light track without the track, and says so', () => {
    const reason = 'STATUS.md not found: /w/workbooks/mail-triage/STATUS.md: the single batch of the light track was not checked';
    const result = checkDesign('mail-triage', { ...edited(), track: { track: null, reason } });
    expect(result).toMatchObject({ status: 'pass', findings: [], skipped: [{ check: 'light-track', reason }] });
  });

  it('passes with warnings alone', () => {
    const result = checkDesign('mail-triage', edited(['design', '```mermaid', '```text']));
    expect(result).toMatchObject({ status: 'pass', errors: 0, warnings: 1 });
  });
});

/**
 * What a model writes beside a correct value — a remark, back-ticks, French, another table of its
 * own — in the clean workbook: none of it is a finding, an error would block a gate for nothing.
 */
const REMARKS: [string, [Artefact, string | RegExp, string][]][] = [
  ['a profile with a remark', [['testPlan', '| remote | `claude` |', '| remote | `claude` (profil nommé de bench.config.json) |']]],
  ['an origin with a remark', [['testPlan', '| empty | synthetic |', '| empty | `synthetic` (généré par /team-tests) |']]],
  ['an origin spelled anonymised', [['testPlan', '| empty | synthetic |', '| empty | anonymised |']]],
  ['a source with a remark', [['design', '| tool_call |', '| `tool_call` (écrit par `file_write`) |']]],
  ['an access with a remark in the design', [['design', '| `/mailbox` | ro |', '| `/mailbox` | `ro` (jamais modifié) |']]],
  ['an access with a remark in the need only', [['need', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |']]],
  ['an access with a remark in both', [['need', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |'], ['design', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |']]],
  ['an agent with a remark', [['design', '| parse_mails | reader |', '| parse_mails | `reader` (seul à lire `/mailbox`) |']]],
  ['tools with a path in a remark', [['design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read` (lecture seule de `/mailbox`) |']]],
  ['tools without back-ticks, with a remark', [['design', '| `email_parser`, `file_read` |', '| email_parser, file_read (lecture seule) |']]],
  ['tools on two lines, and with a slash', [['design', '| `email_parser`, `file_read` |', '| email_parser<br>file_read |'], ['design', '| `file_read`, `file_write` | 10', '| file_read / file_write | 10']]],
  ['dependencies in a French sentence', [['design', '| parse_mails, classify |', '| parse_mails et classify |']]],
  ['dependencies with an arrow', [['design', '| parse_mails, classify |', '| parse_mails → classify |']]],
  ['no dependency, in French', [['design', '| parse_mails | reader | — |', '| parse_mails | reader | Aucune |']]],
  ['no dependency, with a reason', [['design', '| parse_mails | reader | — |', '| parse_mails | reader | none (first task) |']]],
  ['users in a French sentence', [['design', '| reader, drafter |', '| reader et drafter |']]],
  ['a maxIter with its reason', [['design', '| 12 |', '| 12 (5 lots de 2 appels + marge) |']]],
  ['a dropped criterion with a remark', [['acceptance', 'dropped (DEC-0002)', 'dropped (DEC-0002) — remplacé par AC-01']]],
  ['a deliverable path with a remark', [['design', '| `/output/classification.json` | final_message |', '| `/output/classification.json` (un seul fichier) | final_message |']]],
  ['a budget in hours, then in minutes', [['testPlan', '| local | 60 minutes |', '| local | 1 h (60 minutes) |']]],
  ['a budget after a level label', [['testPlan', '| local | 60 minutes |', '| local | L3 : 60 minutes par tentative |']]],
  ['a budget kind with a remark', [['testPlan', '| remote | 2.00 USD per attempt |', '| remote (L4) | 2.00 USD per attempt |']]],
  ['a Given that names a folder before its dataset', [['acceptance', '| `empty` (no mail) |', '| un registre `state` vide et le jeu `empty` (aucun courriel) |']]],
  ['a second table under the tasks', [['design', '\n```mermaid', '\nCe que chaque tâche rend :\n\n| Id | Expected output |\n|---|---|\n| parse_mails | la liste des courriels lus |\n| classify | un enregistrement par courriel |\n\n```mermaid']]],
  ['a second table under the indicators', [['acceptance', '\n## Invariants', '\n| Id | Why this threshold |\n|---|---|\n| IND-02 | 80 % : seuil donné par l’utilisateur |\n\n## Invariants']]],
  ['a mode dismissed before the mode', [['design', '`sequential`: three steps', 'Pas de `hierarchical` : aucun manager n’est utile. `sequential`: three steps']]],
  ['a comment mark in a code span', [['testPlan', 'instructions hidden in a body, a subject, a header', 'instructions hidden in a body, a subject, a header, or after `<!--` in an HTML body']]],
  ['sub-steps under a step', [['plan', '— write `mounts.json` and the crew skeleton, then scaffold the team\n', '— write `mounts.json` and the crew skeleton, then scaffold the team:\n   1. `mounts.json` from `## Mounts`\n   2. `orkeon-bench scaffold mail-triage`\n']]],
  ['an anchor for a range of steps', [['plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` | `component/ac-02-empty-mailbox.scenario.json` |\n| 2 |', '| 1–2 | `teams/mail-triage/crew/crew.ork.ts` | `component/ac-02-empty-mailbox.scenario.json` |\n| 2 |']]],
  ['a task word in a sentence of Reads', [['design', '| parse_mails | reader | — | `/mailbox/*.eml`, `/state/registry.json` |', '| parse_mails | reader | — | the `.eml` files of `/mailbox`, to classify later; `/state/registry.json` |']]],
  ['a section that says none in French', [['testPlan', '## Judges\n\nNone.', '## Judges\n\nAucun.']]],
  // Second review.
  ['a budget with a decimal comma', [['testPlan', '2.00 USD per attempt', '2,00 USD par tentative']]],
  ['a budget written as a product', [['testPlan', '| local | 60 minutes |', '| local | 3 × 20 minutes = 60 minutes |']]],
  ['a budget that sums its runs', [['testPlan', '2.00 USD per attempt', '2 runs à 1.00 USD, soit 2.00 USD']]],
  ['steps indented as a whole', [['plan', /^(?=\d\. TESTS)/gm, '  ']]],
  ['a back-ticked file extension in the remark of a tools cell', [['design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read` (les fichiers `.eml` seulement) |']]],
  ['a back-ticked word in the remark of the dependencies', [['design', '| parse_mails, classify |', '| `parse_mails`, `classify` (ses `records`) |']]],
  ['a back-ticked tool in the remark of a Used by', [['design', '| reader, drafter |', '| `reader`, `drafter` (via `file_write` ensuite) |']]],
  ['a row without its closing pipe', [['acceptance', 'holds an empty list | L2 | active |', 'holds an empty list | L2 | active']]],
  ['a dropped status that quotes the old one', [['acceptance', '| L3 | dropped (DEC-0002) |', '| L3 | dropped (DEC-0002) — was `active` |']]],
  ['an active status that quotes the other', [['acceptance', '(R-01) | L3 | active |', '(R-01) | L3 | active — `dropped` refusé par l’utilisateur |']]],
  ['a mount point and an id with a remark after them', [['design', '| `/mailbox` | ro |', '| /mailbox (courriels) | ro |'], ['acceptance', '| AC-02 |', '| AC-02 (R-02) |']]],
  ['a table of the author’s own that repeats the tools', [['design', '\n## Mounts', '\n| Tool | Arguments |\n|---|---|\n| `file_read` | `path` |\n\n## Mounts']]],
  // Final replay.
  ['the read-only source in the remark of a task deliverable', [['design', '| `/output/drafts/<mail>.txt` |\n\n```', '| `/output/drafts/<mail>.txt` (un par courriel de `/mailbox`) |\n\n```']]],
  ['the read-only source in the remark of a Path cell', [['design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/output/drafts/<mail>.txt` (un par fichier de `/mailbox/*.eml`) | tool_call |']]],
  ['no deliverable, with what the task reads in brackets', [['design', '`/state/registry.json` | — |', '`/state/registry.json` | — (lit `/mailbox`, n’écrit rien) |']]],
  ['no deliverable, with what the task reads after a colon', [['design', '`/state/registry.json` | — |', '`/state/registry.json` | Aucun : la tâche lit `/mailbox` et `/state/registry.json` |']]],
  ['a deliverable written as a glob', [['design', /\/output\/drafts\/<mail>\.txt/g, '/output/drafts/*.txt']]],
  ['a table of the cases of a dataset', [['testPlan', '\n## LLM targets', '\nCas du jeu `nominal` :\n\n| Name | Description |\n|---|---|\n| support-outage | une panne signalée |\n\n## LLM targets']]],
  ['a table of the fields of a deliverable', [['design', '\n## Resume and incremental strategy', '\n| Path | Type | Description |\n|---|---|---|\n| `records[].category` | string | une des sept catégories |\n\n## Resume and incremental strategy']]],
  ['a second table of risks, of the budget, of batches and of anchors', [
    ['design', /$/, '\n| Risk | Probability |\n|---|---|\n| the model answers outside the list | medium |\n'],
    ['testPlan', '\n## Pass criteria', '\n| Kind | Estimate |\n|---|---|\n| remote comparison | 0.40 USD |\n\n## Pass criteria'],
    ['plan', '\n### B1\n', '\n| Batch | Depends on |\n|---|---|\n| B2 | B1 |\n| B3 | later |\n\n### B1\n'],
    ['plan', '\n#### Assumptions\n\nNone.', '\n| Step | Command to observe it |\n|---|---|\n| 3 | (après B2) |\n\n#### Assumptions\n\nNone.'],
  ]],
];

describe('checkDesign on the clean workbook, with what a model writes beside a value', () => {
  it.each(REMARKS)('finds nothing in %s', (_name, edits) => {
    const inputs = edits.reduce((current, [artefact, from, to]) => edit(current, artefact, from, to), cleanInputs());
    expect(checkDesign('mail-triage', inputs).findings).toEqual([]);
  });

  it('finds nothing in notes and build leftovers among the tests', () => {
    const extras = [
      { path: 'static/expected-layout.json', text: '{"files":["crew.ork.ts"]}' },
      { path: 'static/notes.md', text: 'see README' },
      { path: 'unit/helpers.js', text: 'export const x = 1;' },
    ];
    expect(checkDesign('mail-triage', { ...cleanInputs(), tests: [...cleanInputs().tests!, ...extras] })).toMatchObject({ findings: [], tests: { files: 6 } });
  });
});

describe('checkDesign on the deliberately faulty design', () => {
  it('finds the unknown tool, the missing dependency, the read-only deliverable, the batch named L1 and the uncovered criterion', () => {
    const result = checkDesign('mail-triage', { ...cleanInputs(), tests: null, design: workbookFixture('faulty/DESIGN.md'), plan: workbookFixture('faulty/PLAN.md') });
    expect(result).toMatchObject({ status: 'fail', errors: 5, warnings: 2 });
    expect(result.findings).toEqual([
      { severity: 'error', code: 'unknown-tool', artefact: 'DESIGN.md', section: 'Agents', message: 'agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)' },
      { severity: 'error', code: 'task-reads', artefact: 'DESIGN.md', section: 'Tasks and DAG', message: 'task `draft_replies` reads the result of `parse_mails` without depending on it' },
      {
        severity: 'error',
        code: 'deliverable',
        artefact: 'DESIGN.md',
        section: 'Deliverables and schemas',
        message: '`/mailbox/drafts/<mail>.txt`: `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point',
      },
      { severity: 'error', code: 'batch-id', artefact: 'PLAN.md', section: 'Batches', message: '`L1`: expected a batch id such as B1 (the L prefix names the test levels L0–L4)' },
      { severity: 'error', code: 'coverage', artefact: 'PLAN.md', section: 'Batches', message: '`AC-02` is covered by no batch' },
      { severity: 'warning', code: 'deliverable-orphan', artefact: 'DESIGN.md', section: 'Deliverables and schemas', message: '`/mailbox/drafts/<mail>.txt`: no task names it in its `Deliverable` cell' },
      { severity: 'warning', code: 'deliverable-orphan', artefact: 'DESIGN.md', section: 'Tasks and DAG', message: 'task `draft_replies` names a deliverable the table does not list: `/output/drafts/<mail>.txt`' },
    ]);
  });
});

describe('the checks on the templates as shipped', () => {
  it('check test-plan reports what is left to fill, and reads the ids the template gives', () => {
    const result = checkTestPlan('fresh', templateInputs());
    expect(result).toMatchObject({ team: 'fresh', check: 'test-plan', status: 'fail', skipped: [], tests: null });
    expect(result.ids).toEqual({ acceptance: ['AC-01'], indicators: ['IND-01'], invariants: ['INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET'], dropped: [] });
    expect(result.findings.map((finding) => `${finding.code} ${finding.artefact}${finding.section === null ? '' : ` § ${finding.section}`}`)).toEqual([
      'placeholder NEED.md',
      'placeholder ACCEPTANCE.md',
      'placeholder TEST-PLAN.md',
      'empty-section TEST-PLAN.md § Repetitions and flakiness',
      'empty-section TEST-PLAN.md § Pass criteria',
      'ac-incomplete ACCEPTANCE.md § Acceptance criteria',
      'dataset-unknown-id TEST-PLAN.md § Datasets',
      'judge-incomplete TEST-PLAN.md § Judges',
      'config-placeholder bench.config.json',
      'ac-no-dataset ACCEPTANCE.md § Acceptance criteria',
      'dataset-unused TEST-PLAN.md § Datasets',
    ]);
  });

  it('check design reports the empty design and the empty plan without failing on a blank row', () => {
    const result = checkDesign('fresh', templateInputs());
    expect(result.status).toBe('fail');
    const found = new Set(result.findings.map((finding) => finding.code));
    for (const code of ['placeholder', 'empty-section', 'process', 'agents-count', 'task-incomplete', 'mounts', 'risks', 'batch-incomplete', 'coverage', 'anchors', 'assumptions', 'tests-none', 'untested', 'anchors-tests'] as const) {
      expect(found, code).toContain(code);
    }
    // A blank row is no agent, no tool, no deliverable: nothing is said of a row that is not there — and the template declares the invariants that always apply.
    for (const code of ['agent-incomplete', 'tool-incomplete', 'deliverable', 'unknown-tool', 'sheet', 'steps', 'batch-id', 'inv-always'] as const) {
      expect(found, code).not.toContain(code);
    }
    expect(result.findings.filter((finding) => finding.code === 'empty-section' && finding.artefact === 'PLAN.md').map((finding) => `${String(finding.section)}: ${finding.message}`)).toEqual([
      'Order and dependencies: the section holds nothing: a section with nothing to say holds `None.`',
      'B1: `#### Intent` holds nothing',
      'B1: `#### Design decisions` holds nothing: a part with nothing to say holds `None.`',
    ]);
  });

  it('check test-plan reads neither the design nor the plan', () => {
    const { design: _design, plan: _plan, ...gate2 } = cleanInputs();
    expect(checkTestPlan('mail-triage', gate2)).toMatchObject({ check: 'test-plan', status: 'pass', findings: [], skipped: [], tests: null });
  });
});

describe('sortFindings', () => {
  it('prints the errors first, then in the order of the codes, and keeps the order of two findings of one code', () => {
    const finding = (severity: Finding['severity'], code: FindingCode, message: string): Finding => ({ severity, code, artefact: 'PLAN.md', section: null, message });
    const sorted = sortFindings([finding('warning', 'headings', 'w'), finding('error', 'coverage', 'first'), finding('error', 'coverage', 'second'), finding('error', 'headings', 'h')]);
    expect(sorted.map((found) => found.message)).toEqual(['h', 'first', 'second', 'w']);
  });
});
