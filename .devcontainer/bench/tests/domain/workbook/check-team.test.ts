import { describe, expect, it } from 'vitest';

import { checkTeam, type TeamInputs } from '../../../src/domain/workbook/check-workbook.js';
import { FINDING_CODES, sortFindings, type Finding, type FindingCode } from '../../../src/domain/workbook/finding.js';
import type { TeamSection } from '../../../src/domain/workbook/headings.js';
import { cleanInputs, templateInputs, workbookFixture } from '../../fakes/workbook-fixtures.js';

/** Where an edit applies: a part of `TEAM.md`, its title line above the parts, or the bench configuration. */
type Artefact = TeamSection | 'title' | 'benchConfig';

/** `inputs` with one text replaced in one artefact — in a part, within that part alone; the text must be there, or the case tests nothing. */
function edit(inputs: TeamInputs, artefact: Artefact, from: string | RegExp, to: string): TeamInputs {
  if (artefact === 'benchConfig') {
    const text = inputs.benchConfig as string;
    const edited = text.replace(from, () => to);
    expect(edited, `${artefact}: ${String(from)} not found`).not.toBe(text);
    return { ...inputs, benchConfig: edited };
  }
  const text = inputs.team;
  const start = artefact === 'title' ? 0 : text.indexOf(`\n## ${artefact}\n`);
  expect(start, `part ${artefact} not found`).not.toBe(-1);
  const next = text.indexOf('\n## ', start + 1);
  const end = artefact === 'title' ? text.indexOf('\n## ') : next === -1 ? text.length : next;
  const slice = text.slice(start, end);
  const edited = slice.replace(from, () => to);
  expect(edited, `${artefact}: ${String(from)} not found`).not.toBe(slice);
  return { ...inputs, team: text.slice(0, start) + edited + text.slice(end) };
}

/** The clean workbook without its tests (`check team` without `--tests`), after the edits. */
function edited(...edits: [Artefact, string | RegExp, string][]): TeamInputs {
  return edits.reduce((inputs, [artefact, from, to]) => edit(inputs, artefact, from, to), { ...cleanInputs(), tests: null } as TeamInputs);
}

/** The clean workbook without its tests, two of its parts swapped. */
function swapped(first: TeamSection, second: TeamSection): TeamInputs {
  const inputs = edited();
  const parts = inputs.team.split(/(?=\n## )/);
  const a = parts.findIndex((part) => part.startsWith(`\n## ${first}\n`));
  const b = parts.findIndex((part) => part.startsWith(`\n## ${second}\n`));
  expect(a).not.toBe(-1);
  expect(b).not.toBe(-1);
  [parts[a], parts[b]] = [parts[b] as string, parts[a] as string];
  return { ...inputs, team: parts.join('') };
}

function codes(inputs: TeamInputs): FindingCode[] {
  return checkTeam('mail-triage', inputs).findings.map((finding) => finding.code);
}

const INDICATORS_END = '| IND-02 | mails of `nominal` whose `category` equals `expected/`, median of the runs | % | 80 | >= | L3 |';
const INVARIANTS_END = '| INV-01 | A draft holds nothing taken from another mail than its own (R-06) | scenario check of each draft against the other mails of `/mailbox` | L2 |';
const LAST_AGENT = '| drafter | Writes the reply draft of each mail that calls for one | `file_read`, `file_write` | 10 | one draft per mail of the three categories, 25 at most |';
const NO_REMOTE = '"e2e_remote": { "profile": "claude", "repeat": 1 }';

/**
 * One fault at a time in the clean workbook, and the codes it gives — all of them: a fault that
 * brought another finding along would be a false positive of that other rule.
 */
const FAULTS: [string, TeamInputs | (() => TeamInputs), FindingCode[]][] = [
  // What every part owes.
  ['a heading renamed', () => edited(['Design', '### LLM profile', '### Model']), ['headings']],
  ['a part out of order', () => swapped('Need', 'Acceptance'), ['headings']],
  ['a placeholder of the template', () => edited(['title', '# Mail triage — Team', '# {{TEAM_TITLE}} — Team']), ['placeholder']],
  ['a line left by a decision', () => edited(['Acceptance', '\n### Acceptance criteria', '\n> To revise — DEC-0003: a criterion on the drafts\n\n### Acceptance criteria']), ['to-revise']],
  ['an empty section', () => edited(['Acceptance', '### Judges\n\nNone.', '### Judges\n']), ['empty-section']],
  ['a TBD in the need', () => edited(['Need', 'No blocking question.', 'TBD: who exports the mails?']), ['need-tbd']],
  // ## Acceptance: the criteria, the indicators and the invariants.
  ['an id with one digit', () => edited(['Acceptance', INDICATORS_END, `${INDICATORS_END}\n| IND-3 | drafts written | count | 5 | >= | L3 |`]), ['id-malformed']],
  ['an id on two rows', () => edited(['Acceptance', INDICATORS_END, `${INDICATORS_END}\n| IND-02 | drafts written | count | 5 | >= | L3 |`]), ['id-duplicate']],
  ['a criterion without its trigger', () => edited(['Acceptance', '| AC-02 | `empty` (no mail) | the team runs |', '| AC-02 | `empty` (no mail) | — |']), ['ac-incomplete']],
  ['two levels in a cell', () => edited(['Acceptance', '| % | 80 | >= | L3 |', '| % | 80 | >= | L3 / L4 |']), ['level']],
  ['a status of its own', () => edited(['Acceptance', '| L0 | active |', '| L0 | Active |']), ['ac-status']],
  ['a dataset the plan does not list', () => edited(['Acceptance', '| AC-02 | `empty` (no mail) |', '| AC-02 | `void` (no mail) |']), ['ac-dataset']],
  ['a criterion above L0 without a dataset', () => edited(['Acceptance', '| AC-02 | `empty` (no mail) |', '| AC-02 | an empty mailbox |']), ['ac-no-dataset']],
  ['a threshold with its unit', () => edited(['Acceptance', '| % | 80 | >= | L3 |', '| % | 80 % | >= | L3 |']), ['ind-incomplete']],
  ['an invariant without a check', () => edited(['Acceptance', '| Only the declared tools are called | events vs the definition |', '| Only the declared tools are called | — |']), ['inv-incomplete']],
  ['an invariant the catalogue does not know', () => edited(['Acceptance', INVARIANTS_END, `${INVARIANTS_END}\n| INV-SPEED | A run ends within the hour | the run manifest | L3 |`]), ['inv-unknown', 'coverage']],
  ['an invariant that always applies, not declared', () => edited(['Acceptance', '| INV-BUDGET | Tokens and duration stay under the cap | the run manifest | L3 |\n', '']), ['inv-always', 'dataset-unknown-id', 'batch-unknown-id']],
  ['an invariant below its lowest level', () => edited(['Acceptance', '| the run manifest | L3 |', '| the run manifest | L2 |']), ['inv-level']],
  // ## Acceptance: the datasets, the targets, the judges and the budget.
  ['an origin of its own', () => edited(['Acceptance', '| empty | synthetic |', '| empty | generated |']), ['dataset-incomplete']],
  ['a dataset serving an unknown id', () => edited(['Acceptance', 'an empty `/mailbox` | AC-02 |', 'an empty `/mailbox` | AC-02, AC-09 |']), ['dataset-unknown-id']],
  ['a dataset nothing uses', () => edited(['Acceptance', '| empty | synthetic |', '| spare | synthetic | 1 mail | nothing yet | — |\n| empty | synthetic |']), ['dataset-unused']],
  ['no adversarial set for INV-INJECTION', () => edited(['Acceptance', 'a header | INV-INJECTION |', 'a header | — |']), ['adversarial-missing', 'dataset-unused']],
  [
    'a judge with a word for a threshold',
    () => edited(['Acceptance', '### Judges\n\nNone.', '### Judges\n\n| Id | Rubric | Scale | Threshold | Applies to |\n|---|---|---|---|---|\n| J-01 | `judges/reply-draft.md` v1 | 1–5 | high | the drafts |']),
    ['judge-incomplete'],
  ],
  ['a profile the configuration does not have', () => edited(['Acceptance', '| remote | `claude` |', '| remote | `gpt` |']), ['target-profile']],
  ['a budget in words', () => edited(['Acceptance', '| local | 60 minutes |', '| local | an hour |']), ['budget']],
  // bench.config.json.
  ['no bench configuration', { ...edited(), benchConfig: null }, ['config-missing']],
  ['a configuration that is not JSON', { ...edited(), benchConfig: '{ "profiles": ' }, ['config-invalid']],
  ['a budget that differs from the plan', () => edited(['Acceptance', '| local | 60 minutes |', '| local | 90 minutes |']), ['config-budget']],
  ['a model still to decide', () => edited(['benchConfig', '"claude-sonnet-5-5"', '"<to decide>"']), ['config-placeholder']],
  ['a remote budget the configuration leaves to its default', () => edited(['Acceptance', '| remote | 2.00 USD per attempt |', '| remote | 0 USD (aucun essai distant) |'], ['benchConfig', ', "remote_usd_max": 2.0', '']), ['config-budget']],
  ['an indicator at L4 and no remote level', () => edited(['Acceptance', '| % | 80 | >= | L3 |', '| % | 80 | >= | L4 |'], ['benchConfig', `,\n    ${NO_REMOTE}`, '']), ['config-remote']],
  ['ids at L3 and no local level', () => edited(['benchConfig', '"e2e_local": { "profile": "machine", "repeat": 3, "pass_at": 2 },', '']), ['config-local']],
  // ## Design.
  ['no mode named', () => edited(['Design', '`sequential`: three steps', 'In order: three steps']), ['process']],
  ['a hierarchy without a manager', () => edited(['Design', '`sequential`: three steps', '`hierarchical`: three steps']), ['process-manager', 'process-failure']],
  ['a mode other than sequential', () => edited(['Design', '`sequential`: three steps', '`hierarchical`, with `sorter` as its manager: three steps']), ['process-failure']],
  ['six agents', () => edited(['Design', LAST_AGENT, `${LAST_AGENT}\n| a4 | Checks | — | 2 | one pass |\n| a5 | Checks | — | 2 | one pass |\n| a6 | Checks | — | 2 | one pass |`]), ['agents-count']],
  ['a maxIter in words', () => edited(['Design', '| `file_read`, `file_write` | 10 |', '| `file_read`, `file_write` | many |']), ['agent-incomplete']],
  ['a tool the catalogue does not list', () => edited(['Design', '| `email_parser`, `file_read` |', '| `email_parse`, `file_read` |']), ['unknown-tool']],
  ['the reader of mails also sends', () => edited(['Design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read`, `email_send` |']), ['mail-read-send', 'mail-send']],
  ['the reader of mails sends through a row of ### Tools', () => edited(['Design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | built-in | sorter | — |\n| `email_send` | built-in | reader | — |']), ['mail-read-send', 'mail-send']],
  ['a tool hidden by leaving its back-ticks out', () => edited(['Design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read`, plus email_send and email_parse pour les réponses |']), ['unknown-tool', 'mail-read-send', 'mail-send']],
  ['email_send in other hands', () => edited(['Design', '| `file_read`, `file_write` | 10 |', '| `file_read`, `file_write`, `email_send` | 10 |']), ['mail-send']],
  ['a kind of its own', () => edited(['Design', '| `json_tool` | built-in |', '| `json_tool` | native |']), ['tool-incomplete']],
  ['a custom tool named after a catalogue tool', () => edited(['Design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | custom | sorter | a pure function |']), ['tool-shadow']],
  ['a task for nobody', () => edited(['Design', '| classify | sorter |', '| classify | nobody |']), ['task-incomplete']],
  ['a cycle', () => edited(['Design', '| parse_mails | reader | — |', '| parse_mails | reader | draft_replies |']), ['task-cycle']],
  ['a result read without the dependency', () => edited(['Design', '| draft_replies | drafter | parse_mails, classify |', '| draft_replies | drafter | classify |']), ['task-reads']],
  ['no diagram', () => edited(['Design', '```mermaid', '```text']), ['diagram']],
  ['a mount point without its folder', () => edited(['Design', '| `/state` | rw | state | `./state` |', '| `/state` | rw | state | — |']), ['mounts']],
  ['an access that is not the need’s', () => edited(['Design', '| `/state` | rw | state | `./state` |', '| `/state` | rwnd | state | `./state` |']), ['mounts-need']],
  ['a source of its own', () => edited(['Design', '| tool_call | plain text', '| a tool | plain text']), ['deliverable']],
  ['a deliverable no task carries', () => edited(['Design', '| the results of `parse_mails` and `classify` | `/output/drafts/<mail>.txt` |', '| the results of `parse_mails` and `classify` | — |']), ['deliverable-orphan']],
  ['a read-only deliverable on a task row only', () => edited(['Design', '| `/output/classification.json` |\n| draft', '| `/mailbox/classification.json` |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a result read without the dependency, the task named with a possessive', () => edited(['Design', '| parse_mails, classify | the results of `parse_mails` and `classify` |', "| parse_mails | `parse_mails`, and `classify`'s result |"]), ['task-reads']],
  ['a cycle behind a dash', () => edited(['Design', '| parse_mails | reader | — |', '| parse_mails | reader | `—`, draft_replies |']), ['task-cycle']],
  ['a resume strategy said not to apply', () => edited(['Design', /(### Resume and incremental strategy\n\n)[\s\S]*?(\n\n### LLM profile)/, '### Resume and incremental strategy\n\nNot applicable.\n\n### LLM profile']), ['resume']],
  ['a hierarchy named after another mode is dismissed', () => edited(['Design', '`sequential`: three steps', 'Pas de `sequential` : un manager décide. `hierarchical`: three steps']), ['process-manager', 'process-failure']],
  ['no resume strategy where an invariant asks for one', () => edited(['Design', /(### Resume and incremental strategy\n\n)[\s\S]*?(\n\n### LLM profile)/, '### Resume and incremental strategy\n\nNone.\n\n### LLM profile']), ['resume']],
  ['a risk without mitigation', () => edited(['Design', '### Risks\n\n| Risk | Mitigation |\n|---|---|', '### Risks\n\n| Risk | Mitigation |\n|---|---|\n| The model is slow | — |']), ['risks']],
  // ## Plan.
  ['a batch named after a level', () => edited(['Plan', '| B1 | the registry tool', '| L1 | the registry tool'], ['Plan', '### B1\n', '### L1\n']), ['batch-id']],
  ['a status of its own', () => edited(['Plan', '| 15 minutes, no model | todo |', '| 15 minutes, no model | started |']), ['batch-incomplete']],
  ['a batch covering a dropped criterion', () => edited(['Plan', '| AC-03, INV-TOOLS, INV-INCR |', '| AC-03, AC-04, INV-TOOLS, INV-INCR |']), ['batch-unknown-id']],
  ['a criterion no batch covers', () => edited(['Plan', '| AC-01, AC-02, INV-FS,', '| AC-01, INV-FS,']), ['coverage']],
  ['a sheet without one of its parts', () => edited(['Plan', '#### Design decisions\n\nNone.\n\n', '']), ['sheet']],
  ['a sheet after the order of the batches', () => edited(['Plan', '\n### B2\n', '\n### B2b\n'], ['Plan', /$/, '\n\n### B2\n\n#### Intent\n\nx\n']), ['headings', 'sheet', 'sheet']],
  ['a step without its ticks', () => edited(['Plan', '2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — declare the three tasks', '2. declare the three tasks']), ['steps']],
  ['two steps with one number', () => edited(['Plan', '2. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write the domain', '1. TESTS ☐ · BUILD ☐ · L0/L1 ☐ — write the domain'], ['Plan', /\| 2 \| `teams\/mail-triage\/crew\/tools\/registry-update\/domain.ts`.*\n/, '']), ['steps']],
  ['a step hidden by a number in the remark of an anchor', () => edited(['Plan', /\| 2 \| `teams\/mail-triage\/crew\/tools\/registry-update\/domain.ts`.*\n/, ''], ['Plan', '| 1 | `teams/mail-triage/mounts.json`', '| 1 (avant B2) | `teams/mail-triage/mounts.json`']), ['anchors']],
  ['a line left by a decision, retyped', () => edited(['Plan', '### Batches\n', '> **To revise - DEC-0003**: a third batch\n\n### Batches\n']), ['to-revise']],
  ['an anchor in the tests', () => edited(['Plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `tests/mail-triage/unit/crew.test.ts` |']), ['anchors']],
  ['an anchor from the root', () => edited(['Plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `/workspace/teams/mail-triage/crew/crew.ork.ts` |']), ['anchors-path']],
  ['an anchor nothing observes', () => edited(['Plan', '| `component/ac-02-empty-mailbox.scenario.json` |', '| — |']), ['anchors-tests']],
  ['an assumption with another id', () => edited(['Plan', '| H1 | The local model', '| A1 | The local model']), ['assumptions']],
  // What a remark, a pair of brackets or another table must not hide (second review).
  ['email_send in brackets, without back-ticks', () => edited(['Design', '| `email_parser`, `file_read` |', '| email_parser, file_read (email_send en dernier recours) |']), ['mail-read-send', 'mail-send']],
  ['the reader of mails in the brackets of a Used by', () => edited(['Design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | built-in | sorter | — |\n| `email_send` | built-in | sorter (et reader pour les réponses) | — |']), ['mail-read-send', 'mail-send']],
  ['a tools table with a header of its own', () => edited(['Design', '| Tool | Kind (built-in / custom) | Used by | Why deterministic |', '| Tool | Type | Used by | Why deterministic |']), ['unknown-tool', 'tool-incomplete']],
  ['a status that opens with active and quotes the old one', () => edited(['Acceptance', '| L3 | dropped (DEC-0002) |', '| L3 | active (was `dropped (DEC-0002)`, restored by DEC-0005) |']), ['coverage']],
  ['a second criteria table with a header of its own', () => edited(['Acceptance', '\n### Indicators', '\n| Id | Given | When | Expected | Level | Status |\n|---|---|---|---|---|---|\n| AC-05 | `nominal` | the team runs | no draft for a `spam` mail | L3 | active |\n\n### Indicators']), ['ac-incomplete', 'coverage']],
  ['a criterion written under the indicators', () => edited(['Acceptance', '\n### Invariants', '\n| Id | Given (dataset) | When | Then | Level | Status |\n|---|---|---|---|---|---|\n| AC-09 | `nominal` | the team runs | x | L3 | active |\n\n### Invariants']), ['ind-incomplete']],
  ['a result read without the dependency, the task named in a span with a colon', () => edited(['Design', '| parse_mails, classify | the results of `parse_mails` and `classify` |', '| parse_mails | `classify:output`, `(parse_mails)` |']), ['task-reads']],
  ['a task that delivers into a read-only folder', () => edited(['Design', '| `/output/classification.json` |\n| draft', '| `/mailbox/` |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a second path of a deliverable under a read-only mount point', () => edited(['Design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/output/drafts/<mail>.txt`, copie dans `/mailbox/done/<mail>.txt` | tool_call |']), ['deliverable']],
  ['a profile nobody declares, with a declared one in its remark', () => edited(['Acceptance', '| remote | `claude` |', '| remote | openai (comme `claude`) |']), ['target-profile']],
  ['an access that is not one, with the right one in its remark', () => edited(['Design', '| `/mailbox` | ro |', '| `/mailbox` | pas `rw` : `ro` |']), ['mounts', 'mounts-need']],
  ['an anchor in the tests, written in brackets', () => edited(['Plan', '| 1 | `teams/mail-triage/mounts.json`, `teams/mail-triage/crew/crew.ork.ts` |', '| 1 | `teams/mail-triage/mounts.json`, `teams/mail-triage/crew/crew.ork.ts` (et `tests/mail-triage/static/ac-03-mail-tools.txt`, à adapter) |']), ['anchors']],
  ['a JSON deliverable whose schema is a dash with its reason', () => edited(['Design', '| `library/schemas/mail-classification.schema.json` |', '| — (pas de schéma pour l’instant) |']), ['deliverable']],
  ['a read-only path in brackets, the only path of the cell', () => edited(['Design', '| `/output/classification.json` |\n| draft', '| classification (`/mailbox/x.json`) |\n| draft']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a read-only glob, printed as written', () => edited(['Design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/mailbox/*.txt` | tool_call |']), ['deliverable', 'deliverable-orphan', 'deliverable-orphan']],
  ['a task that only a table without the columns of the template holds', () => edited(['Design', '\n```mermaid', '\n| Id | Expected output |\n|---|---|\n| parse_mails | la liste |\n| registry | le registre mis à jour |\n\n```mermaid']), ['task-incomplete']],
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

describe('checkTeam on the clean workbook', () => {
  it('passes without a finding, with its tests', () => {
    const result = checkTeam('mail-triage', cleanInputs());
    expect(result.findings).toEqual([]);
    expect(result).toEqual({
      team: 'mail-triage',
      check: 'team',
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
    expect(checkTeam('mail-triage', { ...cleanInputs(), tests: null })).toMatchObject({ status: 'pass', findings: [], tests: null });
  });

  it.each(FAULTS)('%s', (_name, inputs, expected) => {
    expect(codes(typeof inputs === 'function' ? inputs() : inputs)).toEqual(expected);
  });

  it('has a fault for every code but the two that need a workbook of their own', () => {
    const tried = new Set(FAULTS.flatMap(([, , expected]) => expected));
    expect(FINDING_CODES.filter((code) => !tried.has(code))).toEqual(['ac-none', 'tests-none']);
  });

  it('places every finding of TEAM.md under its part, and the others nowhere', () => {
    const result = checkTeam('mail-triage', edited(['Need', 'No blocking question.', 'TBD'], ['Design', '```mermaid', '```text'], ['Plan', '| H1 | The local model', '| A1 | The local model'], ['title', '# Mail triage — Team', '# {{TEAM_TITLE}} — Team']));
    expect(result.findings.map((finding) => `${finding.severity} ${finding.code} ${finding.artefact}${finding.section === null ? '' : ` § ${finding.section}`}`)).toEqual([
      'error placeholder TEAM.md',
      'error assumptions TEAM.md § Plan § B2',
      'warning need-tbd TEAM.md § Need',
      'warning diagram TEAM.md § Design § Tasks and DAG',
    ]);
    const config = checkTeam('mail-triage', { ...edited(), benchConfig: null });
    expect(config.findings.map((finding) => [finding.artefact, finding.section])).toEqual([['bench.config.json', null]]);
  });

  it('finds no active criterion once every one is dropped', () => {
    const result = checkTeam('mail-triage', edited(['Acceptance', /\| active \|/g, '| dropped (DEC-0003) |']));
    expect(result.findings.map((finding) => finding.code)).toContain('ac-none');
    expect(result.ids).toMatchObject({ acceptance: [], dropped: ['AC-01', 'AC-02', 'AC-03', 'AC-04'] });
  });

  it('finds no test in empty test folders, and every criterion and invariant untested', () => {
    const result = checkTeam('mail-triage', { ...cleanInputs(), tests: [] });
    expect(result.findings.map((finding) => finding.code)).toEqual(['tests-none', ...Array.from({ length: 10 }, () => 'untested')]);
    expect(result.findings[0]).toEqual({ severity: 'error', code: 'tests-none', artefact: 'tests', section: null, message: 'no test file under `static/`, `unit/`, `component/`, `e2e/`: the tests exist before the team' });
    expect(result.findings[1]).toEqual({ severity: 'error', code: 'untested', artefact: 'TEAM.md', section: 'Acceptance § Acceptance criteria', message: '`AC-01` is cited by no test' });
    expect(result.tests).toEqual({ files: 0, uncovered: ['AC-01', 'AC-02', 'AC-03', 'INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET', 'INV-INCR', 'INV-INJECTION', 'INV-01'], orphans: [] });
  });

  it('does not judge the tool names without the catalogue, and says so', () => {
    const unknown = edited(['Design', '| `email_parser`, `file_read` |', '| `email_parse`, `file_read` |'], ['Design', '| `json_tool` | built-in | sorter | — |', '| `json_tool` | custom | sorter | a pure function |']);
    const reason = 'orkeon not found on PATH: tool names were not checked';
    const result = checkTeam('mail-triage', { ...unknown, catalogue: { tools: null, reason } });
    expect(result).toMatchObject({ status: 'pass', findings: [], skipped: [{ check: 'tool-catalogue', reason }] });
  });

  it('passes with warnings alone', () => {
    const result = checkTeam('mail-triage', edited(['Design', '```mermaid', '```text']));
    expect(result).toMatchObject({ status: 'pass', errors: 0, warnings: 1 });
  });
});

/**
 * What a model writes beside a correct value — a remark, back-ticks, French, another table of its
 * own — in the clean workbook: none of it is a finding, an error would block a gate for nothing.
 */
const REMARKS: [string, [Artefact, string | RegExp, string][]][] = [
  ['a profile with a remark', [['Acceptance', '| remote | `claude` |', '| remote | `claude` (profil nommé de bench.config.json) |']]],
  ['an origin with a remark', [['Acceptance', '| empty | synthetic |', '| empty | `synthetic` (généré par /team-tests) |']]],
  ['an origin spelled anonymised', [['Acceptance', '| empty | synthetic |', '| empty | anonymised |']]],
  ['a source with a remark', [['Design', '| tool_call |', '| `tool_call` (écrit par `file_write`) |']]],
  ['an access with a remark in the design', [['Design', '| `/mailbox` | ro |', '| `/mailbox` | `ro` (jamais modifié) |']]],
  ['an access with a remark in the need only', [['Need', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |']]],
  ['an access with a remark in both', [['Need', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |'], ['Design', '| `/mailbox` | ro |', '| `/mailbox` | ro (lecture seule) |']]],
  ['an agent with a remark', [['Design', '| parse_mails | reader |', '| parse_mails | `reader` (seul à lire `/mailbox`) |']]],
  ['tools with a path in a remark', [['Design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read` (lecture seule de `/mailbox`) |']]],
  ['tools without back-ticks, with a remark', [['Design', '| `email_parser`, `file_read` |', '| email_parser, file_read (lecture seule) |']]],
  ['tools on two lines, and with a slash', [['Design', '| `email_parser`, `file_read` |', '| email_parser<br>file_read |'], ['Design', '| `file_read`, `file_write` | 10', '| file_read / file_write | 10']]],
  ['dependencies in a French sentence', [['Design', '| parse_mails, classify |', '| parse_mails et classify |']]],
  ['dependencies with an arrow', [['Design', '| parse_mails, classify |', '| parse_mails → classify |']]],
  ['no dependency, in French', [['Design', '| parse_mails | reader | — |', '| parse_mails | reader | Aucune |']]],
  ['no dependency, with a reason', [['Design', '| parse_mails | reader | — |', '| parse_mails | reader | none (first task) |']]],
  ['users in a French sentence', [['Design', '| reader, drafter |', '| reader et drafter |']]],
  ['a maxIter with its reason', [['Design', '| 12 |', '| 12 (5 lots de 2 appels + marge) |']]],
  ['a dropped criterion with a remark', [['Acceptance', 'dropped (DEC-0002)', 'dropped (DEC-0002) — remplacé par AC-01']]],
  ['a deliverable path with a remark', [['Design', '| `/output/classification.json` | final_message |', '| `/output/classification.json` (un seul fichier) | final_message |']]],
  ['a budget in hours, then in minutes', [['Acceptance', '| local | 60 minutes |', '| local | 1 h (60 minutes) |']]],
  ['a budget after a level label', [['Acceptance', '| local | 60 minutes |', '| local | L3 : 60 minutes par tentative |']]],
  ['a budget kind with a remark', [['Acceptance', '| remote | 2.00 USD per attempt |', '| remote (L4) | 2.00 USD per attempt |']]],
  ['a Given that names a folder before its dataset', [['Acceptance', '| `empty` (no mail) |', '| un registre `state` vide et le jeu `empty` (aucun courriel) |']]],
  ['a second table under the tasks', [['Design', '\n```mermaid', '\nCe que chaque tâche rend :\n\n| Id | Expected output |\n|---|---|\n| parse_mails | la liste des courriels lus |\n| classify | un enregistrement par courriel |\n\n```mermaid']]],
  ['a second table under the indicators', [['Acceptance', '\n### Invariants', '\n| Id | Why this threshold |\n|---|---|\n| IND-02 | 80 % : seuil donné par l’utilisateur |\n\n### Invariants']]],
  ['a mode dismissed before the mode', [['Design', '`sequential`: three steps', 'Pas de `hierarchical` : aucun manager n’est utile. `sequential`: three steps']]],
  ['a comment mark in a code span', [['Acceptance', 'instructions hidden in a body, a subject, a header', 'instructions hidden in a body, a subject, a header, or after `<!--` in an HTML body']]],
  ['sub-steps under a step', [['Plan', '— write `mounts.json` and the crew skeleton, then scaffold the team\n', '— write `mounts.json` and the crew skeleton, then scaffold the team:\n   1. `mounts.json` from `### Mounts`\n   2. `orkeon-bench scaffold mail-triage`\n']]],
  ['an anchor for a range of steps', [['Plan', '| 1 | `teams/mail-triage/crew/crew.ork.ts` | `component/ac-02-empty-mailbox.scenario.json` |\n| 2 |', '| 1–2 | `teams/mail-triage/crew/crew.ork.ts` | `component/ac-02-empty-mailbox.scenario.json` |\n| 2 |']]],
  ['a task word in a sentence of Reads', [['Design', '| parse_mails | reader | — | `/mailbox/*.eml`, `/state/registry.json` |', '| parse_mails | reader | — | the `.eml` files of `/mailbox`, to classify later; `/state/registry.json` |']]],
  ['a section that says none in French', [['Acceptance', '### Judges\n\nNone.', '### Judges\n\nAucun.']]],
  // Second review.
  ['a budget with a decimal comma', [['Acceptance', '2.00 USD per attempt', '2,00 USD par tentative']]],
  ['a budget written as a product', [['Acceptance', '| local | 60 minutes |', '| local | 3 × 20 minutes = 60 minutes |']]],
  ['a budget that sums its runs', [['Acceptance', '2.00 USD per attempt', '2 runs à 1.00 USD, soit 2.00 USD']]],
  ['steps indented as a whole', [['Plan', /^(?=\d\. TESTS)/gm, '  ']]],
  ['a back-ticked file extension in the remark of a tools cell', [['Design', '| `email_parser`, `file_read` |', '| `email_parser`, `file_read` (les fichiers `.eml` seulement) |']]],
  ['a back-ticked word in the remark of the dependencies', [['Design', '| parse_mails, classify |', '| `parse_mails`, `classify` (ses `records`) |']]],
  ['a back-ticked tool in the remark of a Used by', [['Design', '| reader, drafter |', '| `reader`, `drafter` (via `file_write` ensuite) |']]],
  ['a row without its closing pipe', [['Acceptance', 'holds an empty list | L2 | active |', 'holds an empty list | L2 | active']]],
  ['a dropped status that quotes the old one', [['Acceptance', '| L3 | dropped (DEC-0002) |', '| L3 | dropped (DEC-0002) — was `active` |']]],
  ['an active status that quotes the other', [['Acceptance', '(R-01) | L3 | active |', '(R-01) | L3 | active — `dropped` refusé par l’utilisateur |']]],
  ['a mount point and an id with a remark after them', [['Design', '| `/mailbox` | ro |', '| /mailbox (courriels) | ro |'], ['Acceptance', '| AC-02 |', '| AC-02 (R-02) |']]],
  ['a table of the author’s own that repeats the tools', [['Design', '\n### Mounts', '\n| Tool | Arguments |\n|---|---|\n| `file_read` | `path` |\n\n### Mounts']]],
  // Final replay.
  ['the read-only source in the remark of a task deliverable', [['Design', '| `/output/drafts/<mail>.txt` |\n\n```', '| `/output/drafts/<mail>.txt` (un par courriel de `/mailbox`) |\n\n```']]],
  ['the read-only source in the remark of a Path cell', [['Design', '| `/output/drafts/<mail>.txt` | tool_call |', '| `/output/drafts/<mail>.txt` (un par fichier de `/mailbox/*.eml`) | tool_call |']]],
  ['no deliverable, with what the task reads in brackets', [['Design', '`/state/registry.json` | — |', '`/state/registry.json` | — (lit `/mailbox`, n’écrit rien) |']]],
  ['no deliverable, with what the task reads after a colon', [['Design', '`/state/registry.json` | — |', '`/state/registry.json` | Aucun : la tâche lit `/mailbox` et `/state/registry.json` |']]],
  ['a deliverable written as a glob', [['Design', /\/output\/drafts\/<mail>\.txt/g, '/output/drafts/*.txt']]],
  ['a table of the cases of a dataset', [['Acceptance', '\n### LLM targets', '\nCas du jeu `nominal` :\n\n| Name | Description |\n|---|---|\n| support-outage | une panne signalée |\n\n### LLM targets']]],
  ['a table of the fields of a deliverable', [['Design', '\n### Resume and incremental strategy', '\n| Path | Type | Description |\n|---|---|---|\n| `records[].category` | string | une des sept catégories |\n\n### Resume and incremental strategy']]],
  ['a second table of risks, of the budget, of batches and of anchors', [
    ['Design', /$/, '\n| Risk | Probability |\n|---|---|\n| the model answers outside the list | medium |\n'],
    ['Acceptance', /$/, '\n| Kind | Estimate |\n|---|---|\n| remote comparison | 0.40 USD |\n'],
    ['Plan', '\n### B1\n', '\n| Batch | Depends on |\n|---|---|\n| B2 | B1 |\n| B3 | later |\n\n### B1\n'],
    ['Plan', '\n#### Assumptions\n\nNone.', '\n| Step | Command to observe it |\n|---|---|\n| 3 | (après B2) |\n\n#### Assumptions\n\nNone.'],
  ]],
];

describe('checkTeam on the clean workbook, with what a model writes beside a value', () => {
  it.each(REMARKS)('finds nothing in %s', (_name, edits) => {
    const inputs = edits.reduce((current, [artefact, from, to]) => edit(current, artefact, from, to), cleanInputs());
    expect(checkTeam('mail-triage', inputs).findings).toEqual([]);
  });

  it('finds nothing in notes and build leftovers among the tests', () => {
    const extras = [
      { path: 'static/expected-layout.json', text: '{"files":["crew.ork.ts"]}' },
      { path: 'static/notes.md', text: 'see README' },
      { path: 'unit/helpers.js', text: 'export const x = 1;' },
    ];
    expect(checkTeam('mail-triage', { ...cleanInputs(), tests: [...cleanInputs().tests!, ...extras] })).toMatchObject({ findings: [], tests: { files: 6 } });
  });
});

describe('checkTeam on the deliberately faulty team', () => {
  it('finds the unknown tool, the missing dependency, the read-only deliverable, the batch named L1 and the uncovered criterion', () => {
    const result = checkTeam('mail-triage', { ...cleanInputs(), tests: null, team: workbookFixture('faulty/TEAM.md') });
    expect(result).toMatchObject({ status: 'fail', errors: 5, warnings: 2 });
    expect(result.findings).toEqual([
      { severity: 'error', code: 'unknown-tool', artefact: 'TEAM.md', section: 'Design § Agents', message: 'agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `### Tools`)' },
      { severity: 'error', code: 'task-reads', artefact: 'TEAM.md', section: 'Design § Tasks and DAG', message: 'task `draft_replies` reads the result of `parse_mails` without depending on it' },
      {
        severity: 'error',
        code: 'deliverable',
        artefact: 'TEAM.md',
        section: 'Design § Deliverables and schemas',
        message: '`/mailbox/drafts/<mail>.txt`: `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point',
      },
      { severity: 'error', code: 'batch-id', artefact: 'TEAM.md', section: 'Plan § Batches', message: '`L1`: expected a batch id such as B1 (the L prefix names the test levels L0–L4)' },
      { severity: 'error', code: 'coverage', artefact: 'TEAM.md', section: 'Plan § Batches', message: '`AC-02` is covered by no batch' },
      { severity: 'warning', code: 'deliverable-orphan', artefact: 'TEAM.md', section: 'Design § Deliverables and schemas', message: '`/mailbox/drafts/<mail>.txt`: no task names it in its `Deliverable` cell' },
      { severity: 'warning', code: 'deliverable-orphan', artefact: 'TEAM.md', section: 'Design § Tasks and DAG', message: 'task `draft_replies` names a deliverable the table does not list: `/output/drafts/<mail>.txt`' },
    ]);
  });
});

describe('check team on the template as shipped', () => {
  it('reports what is left to fill, reads the ids the template gives, and fails on no blank row', () => {
    const result = checkTeam('fresh', { ...templateInputs(), tests: null });
    expect(result).toMatchObject({ team: 'fresh', check: 'team', status: 'fail', skipped: [], tests: null });
    expect(result.ids).toEqual({ acceptance: ['AC-01'], indicators: ['IND-01'], invariants: ['INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET'], dropped: [] });
    expect(result.findings.filter((finding) => finding.code === 'placeholder')).toEqual([{ severity: 'error', code: 'placeholder', artefact: 'TEAM.md', section: null, message: 'the placeholder `{{TEAM_TITLE}}` of the template is left' }]);
    const found = new Set(result.findings.map((finding) => finding.code));
    for (const code of ['placeholder', 'empty-section', 'ac-incomplete', 'dataset-unknown-id', 'judge-incomplete', 'config-placeholder', 'ac-no-dataset', 'dataset-unused', 'process', 'agents-count', 'task-incomplete', 'mounts', 'risks', 'batch-incomplete', 'coverage', 'anchors', 'assumptions'] as const) {
      expect(found, code).toContain(code);
    }
    // A blank row is no agent, no tool, no deliverable: nothing is said of a row that is not there — and the template declares the invariants that always apply.
    for (const code of ['headings', 'agent-incomplete', 'tool-incomplete', 'deliverable', 'unknown-tool', 'sheet', 'steps', 'batch-id', 'inv-always', 'need-tbd'] as const) {
      expect(found, code).not.toContain(code);
    }
    expect(result.findings.filter((finding) => finding.code === 'empty-section' && finding.section?.startsWith('Plan')).map((finding) => `${String(finding.section)}: ${finding.message}`)).toEqual([
      'Plan § Order and dependencies: the section holds nothing: a section with nothing to say holds `None.`',
      'Plan § B1: `#### Intent` holds nothing',
      'Plan § B1: `#### Design decisions` holds nothing: a part with nothing to say holds `None.`',
    ]);
  });

  it('reports the tests of a team that has none', () => {
    const result = checkTeam('fresh', { ...templateInputs(), tests: [] });
    expect(result.findings.map((finding) => finding.code)).toContain('tests-none');
    expect(result.tests).toEqual({ files: 0, uncovered: ['AC-01', 'INV-FS', 'INV-SECRETS', 'INV-TOOLS', 'INV-BUDGET'], orphans: [] });
  });
});

describe('sortFindings', () => {
  it('prints the errors first, then in the order of the codes, and keeps the order of two findings of one code', () => {
    const finding = (severity: Finding['severity'], code: FindingCode, message: string): Finding => ({ severity, code, artefact: 'TEAM.md', section: null, message });
    const sorted = sortFindings([finding('warning', 'headings', 'w'), finding('error', 'coverage', 'first'), finding('error', 'coverage', 'second'), finding('error', 'headings', 'h')]);
    expect(sorted.map((found) => found.message)).toEqual(['h', 'first', 'second', 'w']);
  });
});
