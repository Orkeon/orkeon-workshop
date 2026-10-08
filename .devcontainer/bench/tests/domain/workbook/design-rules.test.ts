import { describe, expect, it } from 'vitest';

import type { WorkbookIds } from '../../../src/domain/workbook/acceptance-rules.js';
import { designFindings, mountRows, type DesignContext } from '../../../src/domain/workbook/design-rules.js';
import { readMarkdown } from '../../../src/domain/workbook/markdown.js';
import { arrayScanWork } from '../../fakes/scan-work.js';
import { TOOL_CATALOGUE, workbookFixture } from '../../fakes/workbook-fixtures.js';

const NO_IDS: WorkbookIds = { criteria: [], indicators: [], invariants: [], dropped: [] };
const NEED_MOUNTS = [
  { root: '/mailbox', access: 'ro', folder: './mailbox' },
  { root: '/output', access: 'rw', folder: './output' },
];

interface Design {
  process?: string;
  agents?: string[];
  tasks?: string[];
  diagram?: string;
  tools?: string[];
  mounts?: string[];
  deliverables?: string[];
  resume?: string;
  risks?: string[];
}

const AGENTS = ['| reader | Reads the mails | `email_parser`, `file_read` | 5 | one pass |', '| writer | Writes the report | `file_write` | 5 | one write |'];
const TASKS = ['| read | reader | — | `/mailbox/*.eml` | — |', '| write | writer | read | the result of `read` | `/output/report.md` |'];
const MOUNTS = ['| `/mailbox` | ro | mailbox | `./mailbox` |', '| `/output` | rw | deliverables | `./output` |'];
/** A design that delivers nothing: what the tests of the mount points start from. */
const NO_DELIVERABLE = { tasks: [TASKS[0]!, '| write | writer | read | the result of `read` | — |'], deliverables: [] };

function design(parts: Design = {}): string {
  return [
    '## Process',
    '',
    parts.process ?? '`sequential`: two steps in order.',
    '',
    '## Agents',
    '',
    '| Id | Role | Tools | maxIter | Justification |',
    '|---|---|---|---|---|',
    ...(parts.agents ?? AGENTS),
    '',
    '## Tasks and DAG',
    '',
    '| Id | Agent | Dependencies | Reads | Deliverable |',
    '|---|---|---|---|---|',
    ...(parts.tasks ?? TASKS),
    '',
    parts.diagram ?? '```mermaid\nflowchart LR\n    read --> write\n```',
    '',
    '## Tools',
    '',
    '| Tool | Kind (built-in / custom) | Used by | Why deterministic |',
    '|---|---|---|---|',
    ...(parts.tools ?? []),
    '',
    '## Mounts',
    '',
    '| Mount point | Access | Role | Folder of the team |',
    '|---|---|---|---|',
    ...(parts.mounts ?? MOUNTS),
    '',
    '## Deliverables and schemas',
    '',
    '| Path | Source | Format | Schema |',
    '|---|---|---|---|',
    ...(parts.deliverables ?? ['| `/output/report.md` | final_message | Markdown | — |']),
    '',
    '## Resume and incremental strategy',
    '',
    parts.resume ?? 'None.',
    '',
    '## Risks',
    '',
    '| Risk | Mitigation |',
    '|---|---|',
    ...(parts.risks ?? ['| a slow model | a small context |']),
  ].join('\n');
}

function found(parts: Design = {}, context: Partial<DesignContext> = {}): [string, string, string][] {
  const findings = designFindings(readMarkdown(design(parts)), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE, ...context });
  return findings.map((finding) => [`${finding.severity} ${finding.code}`, String(finding.section), finding.message]);
}

describe('designFindings', () => {
  it('finds nothing in a small sequential design', () => {
    expect(found()).toEqual([]);
  });

  it('judges only the sections that are there: a missing one is the business of the headings', () => {
    expect(designFindings(readMarkdown('# A design\n\nNothing yet.'), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE })).toEqual([]);
    // No task, tool or deliverable is blamed for an agent or a mount point of a section that is not there.
    const without = design({ tools: ['| `file_read` | built-in | reader | — |'] }).replace('## Agents', '## Crew').replace('## Mounts', '## Folders');
    expect(designFindings(readMarkdown(without), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE })).toEqual([]);
  });

  describe('the mode', () => {
    it('takes the first mode named, whatever the case', () => {
      expect(found({ process: 'Sequential — not `hierarchical`: nobody decides for the others.' })).toEqual([]);
      expect(found({ process: 'A graph of two nodes, not a sequential run.' }).map(([code, , message]) => [code, message])).toEqual([
        ['warning process-failure', 'process `graph`: an active acceptance criterion must say what happens when a task fails — its retry, revision or vote, and what a failed run leaves'],
      ]);
    });

    it('takes the mode written between back-ticks, and not one the sentence dismisses before it', () => {
      const modes = (process: string): string[] => found({ process }).map(([code]) => code);
      expect(modes('Mode `sequential` : trois étapes ; pas de `hierarchical` ni de travail en parallèle.')).toEqual([]);
      expect(modes('Pas de `hierarchical` : aucun manager n’est utile. `sequential`: three steps.')).toEqual([]);
      expect(modes('Not a graph, nor `parallel`: `sequential`.')).toEqual([]);
      expect(modes('A hierarchical team was considered; the design is `sequential`.')).toEqual([]);
      expect(modes('Rather than sequential, the tasks run in `parallel`.')).toEqual(['warning process-failure']);
      // Dismissed, and nothing else named: the section still names that mode.
      expect(modes('Not sequential.')).toEqual([]);
    });

    it('asks for a mode, as a whole word', () => {
      expect(found({ process: 'The tasks run sequentially, in parallelism of nothing.' })).toEqual([
        ['error process', 'Process', 'the section names no mode: `sequential`, `hierarchical`, `parallel`, `consensual`, `graph` and `autonomous`'],
      ]);
    });

    it('asks a hierarchy for its manager, one of the agents — an id is not found inside another word', () => {
      const manager = 'error process-manager';
      expect(found({ process: '`hierarchical`: the readers report.' }).map(([code]) => code)).toEqual([manager, 'warning process-failure']);
      expect(found({ process: '`hierarchical`: the pre-reader decides.' }).map(([code]) => code)).toEqual([manager, 'warning process-failure']);
      expect(found({ process: '`hierarchical`, managed by `reader`.' }).map(([code]) => code)).toEqual(['warning process-failure']);
    });
  });

  describe('the agents', () => {
    it('counts them: none is an error, one or more than five a warning', () => {
      expect(found({ agents: [], tasks: [] }).filter(([code]) => code.endsWith('agents-count'))).toEqual([['error agents-count', 'Agents', 'no agent: a team has 2 to 5 agents, one competency each']]);
      expect(found({ agents: [AGENTS[0]!], tasks: [TASKS[0]!], deliverables: [] })).toEqual([['warning agents-count', 'Agents', '1 agent: a team has 2 to 5 agents, one competency each']]);
      const six = Array.from({ length: 6 }, (_, index) => `| a${String(index)} | r | — | 1 | j |`);
      expect(found({ agents: six, tasks: ['| read | a0 | — | — | `/output/report.md` |'] })).toEqual([['warning agents-count', 'Agents', '6 agents: a team has 2 to 5 agents, one competency each']]);
    });

    it('reads an id and a maxIter with a remark beside them', () => {
      const agents = ['| `reader` (seul à lire `/mailbox`) | Reads | `email_parser` | 12 (5 lots de 2 appels + marge) | j |', '| writer | Writes | `file_write` | `5` | j |'];
      expect(found({ agents })).toEqual([]);
      expect(found({ agents: [AGENTS[0]!, '| writer | Writes | `file_write` | 5.5 (average) | j |'] }).map(([code]) => code)).toEqual(['error agent-incomplete']);
    });

    it('asks each for an id, written once, a role, a justification and a maxIter of 1 or more', () => {
      const agents = [...AGENTS, '| reader | | `file_read` | 0 | |', '| — | r | — | 2.5 | j |', '| third | r | | | j |'];
      expect(found({ agents }).filter(([code]) => code === 'error agent-incomplete')).toEqual([
        ['error agent-incomplete', 'Agents', 'agent `reader`: the id is on two rows; empty `Role`; empty `Justification`; `maxIter` `0` — not an integer of 1 or more'],
        ['error agent-incomplete', 'Agents', 'row 4: no `Id`; `maxIter` `2.5` — not an integer of 1 or more'],
        ['error agent-incomplete', 'Agents', 'agent `third`: `maxIter` is empty — not an integer of 1 or more'],
      ]);
    });
  });

  describe('the tools', () => {
    it('knows the catalogue and the custom tools the design declares', () => {
      const tools = ['| `email_parser` | built-in | reader | — |', '| `dedupe` | custom | reader, writer | pure TypeScript: the same keys give the same list |'];
      const agents = ['| reader | Reads | `email_parser`, `dedupe` | 5 | j |', '| writer | Writes | `file_write` `dedupe` | 5 | j |'];
      expect(found({ agents, tools })).toEqual([]);
    });

    it('refuses a name that is neither, on an agent or as a built-in tool', () => {
      const agents = ['| reader | Reads | `email_parse`, `file_read` | 5 | j |', '| writer | Writes | file_write, read_file | 5 | j |'];
      expect(found({ agents, tools: ['| `mail_reader` | built-in | reader | — |'] })).toEqual([
        ['error unknown-tool', 'Tools', 'built-in tool `mail_reader` is not listed by `orkeon run --list-tools`'],
        ['error unknown-tool', 'Agents', 'agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)'],
        ['error unknown-tool', 'Agents', 'agent `writer`: unknown tool `read_file` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)'],
      ]);
    });

    it('reads a tools cell however it is written: a remark, a path, a line break, French', () => {
      const cells = ['`email_parser`, `file_read` (lecture seule de `/mailbox`)', 'email_parser, file_read (lecture seule)', 'email_parser<br>file_read', 'email_parser / file_read', '`email_parser` et `file_read`', '**email_parser**, **file_read**'];
      for (const tools of cells) {
        expect(found({ agents: [`| reader | Reads | ${tools} | 5 | j |`, AGENTS[1]!] }), tools).toEqual([]);
      }
      const used = ['reader et writer', '`reader`, `writer`', 'reader / writer', 'reader (seul) puis `writer`'];
      for (const users of used.slice(0, 3)) {
        expect(found({ tools: [`| \`file_read\` | built-in | ${users} | — |`] }), users).toEqual([]);
      }
      // With a back-ticked name in the cell, a plain word beside it is a remark — unless it is an agent.
      expect(found({ tools: [`| \`file_read\` | built-in | ${used[3] as string} | — |`] })).toEqual([]);
      expect(found({ tools: ['| `file_read` | built-in | `writer`, and nobody else, but reader | — |'] })).toEqual([]);
    });

    it('does not let a tool hide in brackets, back-ticked or not — and lets a remark hold back-ticks that are no tool', () => {
      const send = (tools: string): string[] => found({ agents: [`| reader | Reads | ${tools} | 5 | j |`, AGENTS[1]!] }).map(([code]) => code);
      const caught = ['error mail-read-send', 'warning mail-send'];
      expect(send('email_parser, file_read (email_send en dernier recours)')).toEqual(caught);
      expect(send('email_parser (lecture (email_send exclu ? non)), file_read')).toEqual(caught);
      expect(send('`email_parser`, `file_read` (et email_send)')).toEqual(caught);
      expect(send('`email_parser`, `file_read` (via `email_send` ensuite)')).toEqual(caught);
      expect(send('`email_parser`, `file_read` — jamais `email_send`')).toEqual(caught);
      expect(send('`email_parser`, `file_read` (les fichiers `.eml` seulement)')).toEqual([]);
      expect(send('email_parser, file_read (lecture seule, web_search plus tard)')).toEqual([]);
      const used = found({ tools: ['| `email_send` | built-in | writer (et reader pour les réponses) | — |'] });
      expect(used.map(([code, , message]) => [code, message.split(':')[0]])).toEqual([['error mail-read-send', 'agent `reader` holds `email_send` and `email_parser`'], ['warning mail-send', '`email_send` appears']]);
      expect(found({ tools: ['| `file_read` | built-in | `reader`, `writer` (via `file_write` ensuite) | — |'] })).toEqual([]);
      expect(found({ tools: ['| email_send (SMTP) | built-in | reader | — |'] }).map(([code]) => code)).toEqual(caught);
    });

    it('refuses a tools table whose headers are not the template’s: the tools it holds are declared nowhere', () => {
      const renamed = design({ tools: ['| `email_send` | built-in | reader | — |'] }).replace('| Tool | Kind (built-in / custom) | Used by | Why deterministic |', '| Tool | Type | Used by | Why deterministic |');
      expect(designFindings(readMarkdown(renamed), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE }).map((finding) => [finding.code, finding.section, finding.message])).toEqual([
        ['tool-incomplete', 'Tools', "`email_send` stands in a table that is not the template's — it has no `Kind` column: it is not declared"],
      ]);
      // A table of the author's own may repeat the tools the template's table declares.
      const noted = ['| `file_read` | built-in | reader | — |', '', '| Tool | Arguments |', '|---|---|', '| `file_read` | `path` |'];
      expect(found({ tools: noted })).toEqual([]);
    });

    it('does not let a tool hide by leaving its back-ticks out', () => {
      const agents = ['| reader | Reads | `email_parser`, `file_read`, plus email_send and email_parse pour les réponses | 5 | j |', AGENTS[1]!];
      expect(found({ agents })).toEqual([
        ['error unknown-tool', 'Agents', 'agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)'],
        ['error mail-read-send', 'Agents', 'agent `reader` holds `email_send` and `email_parser`: the agent that reads untrusted mail never sends'],
        ['warning mail-send', 'Agents', '`email_send` appears: the need must authorise sending to named recipients, otherwise replies are drafts'],
      ]);
      expect(found({ agents: ['| reader | Reads | **email_parse**, **file_read** | 5 | j |', AGENTS[1]!] }).map(([, , message]) => message.split(':')[1])).toEqual([' unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `## Tools`)']);
    });

    it('reads the kind of a tool by its value: a remark in brackets changes nothing', () => {
      const tools = ['| `dedupe` | `custom` (TypeScript pur, pas un outil built-in) | reader | pure |', '| `file_read` (Orkeon) | built-in (catalogue) | reader | — |'];
      expect(found({ tools })).toEqual([]);
    });

    it('holds the union of what an agent lists and what ## Tools says it uses, for the mail rule', () => {
      const tools = ['| `email_send` | built-in | reader | — |'];
      expect(found({ tools })).toEqual([
        ['error mail-read-send', 'Agents', 'agent `reader` holds `email_send` and `email_parser`: the agent that reads untrusted mail never sends'],
        ['warning mail-send', 'Agents', '`email_send` appears: the need must authorise sending to named recipients, otherwise replies are drafts'],
      ]);
      const split = { agents: ['| reader | Reads | `file_read` | 5 | j |', '| writer | Writes | `file_write`, `email_send` | 5 | j |'], tools: ['| `email_search` | built-in | writer | — |'] };
      expect(found(split).map(([code, , message]) => [code, message.split(':')[0]])).toEqual([
        ['error mail-read-send', 'agent `writer` holds `email_send` and `email_search`'],
        ['warning mail-send', '`email_send` appears'],
      ]);
      expect(found({ tools: ['| `email_send` | built-in | writer | — |'] }).map(([code]) => code)).toEqual(['warning mail-send']);
    });

    it('reads the back-ticked names of a cell and takes the words around them for remarks', () => {
      const agents = ['| reader | Reads | `email_parser` (files only) and `file_read`, read only | 5 | j |', '| writer | Writes | `file_write` for the report, `dedupe` | 5 | j |'];
      const tasks = [TASKS[0]!, '| write | writer | `read` (its parsed mails) | the result of `read` | `/output/report.md` |'];
      const tools = ['| `email_parser` (Orkeon.Tools.Email) | built-in | `reader` only | — |', '| `dedupe` — TypeScript | custom | the `writer`, after `reader` | pure: the same keys give the same list |'];
      expect(found({ agents, tasks, tools })).toEqual([]);
      // The names are still judged: a remark does not hide a wrong one.
      expect(found({ agents: ['| reader | Reads | `email_parse` (files only) | 5 | j |', AGENTS[1]!], tasks: [TASKS[0]!, '| write | writer | `reed` (its parsed mails) | — | `/output/report.md` |'] }).map(([code]) => code)).toEqual(['error unknown-tool', 'error task-incomplete']);
    });

    it('judges no name against a catalogue it does not have', () => {
      const agents = ['| reader | Reads | `email_parse` | 5 | j |', AGENTS[1]!];
      const tools = ['| `mail_reader` | built-in | reader | — |', '| `file_read` | custom | reader | pure |'];
      expect(found({ agents, tools }, { catalogue: null })).toEqual([]);
    });

    it('warns about a custom tool that bears the name of a catalogue tool', () => {
      expect(found({ tools: ['| `file_read` | custom | reader | reads the same bytes |'] })).toEqual([['warning tool-shadow', 'Tools', 'custom tool `file_read` bears the name of a catalogue tool']]);
    });

    it('asks a tool for a name, one kind, why it is deterministic when custom, and users that are agents', () => {
      const tools = ['| | built-in | reader | — |', '| `a_tool` | | | |', '| `b_tool` | built-in / custom | — | x |', '| `c_tool` | Custom (C#) | reader, nobody, all | |'];
      expect(found({ tools }, { catalogue: null })).toEqual([
        ['error tool-incomplete', 'Tools', 'row 1: no name'],
        ['error tool-incomplete', 'Tools', 'tool `a_tool`: `Kind` is empty — neither `built-in` nor `custom`'],
        ['error tool-incomplete', 'Tools', 'tool `b_tool`: `Kind` `built-in / custom` — both `built-in` and `custom`'],
        ['error tool-incomplete', 'Tools', 'tool `c_tool`: a custom tool with an empty `Why deterministic`; `Used by` names `nobody` and `all`, not an agent of `## Agents`'],
      ]);
    });

    it('keeps email_send away from the agent that reads untrusted mail, and warns wherever it appears', () => {
      const agents = ['| reader | Reads | `email_search`, `email_read`, `email_send` | 5 | j |', AGENTS[1]!];
      expect(found({ agents })).toEqual([
        ['error mail-read-send', 'Agents', 'agent `reader` holds `email_send` and `email_search` and `email_read`: the agent that reads untrusted mail never sends'],
        ['warning mail-send', 'Agents', '`email_send` appears: the need must authorise sending to named recipients, otherwise replies are drafts'],
      ]);
      expect(found({ agents: [AGENTS[0]!, '| writer | Writes | `file_write`, `email_send` | 5 | j |'] }).map(([code]) => code)).toEqual(['warning mail-send']);
      expect(found({ tools: ['| `email_send` | built-in | — | — |'] }).map(([code]) => code)).toEqual(['warning mail-send']);
      expect(found({ agents: [AGENTS[0]!, '| writer | Writes | `file_write`, `email_draft` | 5 | j |'] })).toEqual([]);
    });
  });

  describe('the tasks', () => {
    it('asks each for an id, written once, an agent and dependencies that exist', () => {
      const tasks = [TASKS[0]!, '| read | writer | — | — | — |', '| | reader | — | — | — |', '| write | editor | read, check | the result of `read` | `/output/report.md` |', '| last | | — | — | — |'];
      expect(found({ tasks })).toEqual([
        ['error task-incomplete', 'Tasks and DAG', 'task `read`: the id is on two rows'],
        ['error task-incomplete', 'Tasks and DAG', 'row 3: no `Id`'],
        ['error task-incomplete', 'Tasks and DAG', 'task `write`: `Agent` `editor` is not an agent of `## Agents`; depends on `check`, not a task'],
        ['error task-incomplete', 'Tasks and DAG', 'task `last`: `Agent` is empty'],
      ]);
      expect(found({ tasks: [] }).filter(([code]) => code === 'error task-incomplete')).toEqual([['error task-incomplete', 'Tasks and DAG', 'no task: a team has one task per step']]);
    });

    it('names a cycle, one of a task with itself included', () => {
      const tasks = ['| a | reader | c | — | — |', '| b | reader | a | — | — |', '| c | writer | b | — | `/output/report.md` |'];
      expect(found({ tasks })).toEqual([['error task-cycle', 'Tasks and DAG', 'the dependencies form a cycle: `a` → `c` → `b` → `a`']]);
      expect(found({ tasks: ['| a | reader | a | — | `/output/report.md` |'] })).toEqual([['error task-cycle', 'Tasks and DAG', 'the dependencies form a cycle: `a` → `a`']]);
      const diamond = ['| a | reader | — | — | — |', '| b | reader | a | — | — |', '| c | reader | a | — | — |', '| d | writer | b, c | — | `/output/report.md` |'];
      expect(found({ tasks: diamond })).toEqual([]);
    });

    it('refuses a result read without the dependency — a task named as a whole word, not inside a path', () => {
      const tasks = [TASKS[0]!, '| sort | reader | — | (`read`); `/output/sort.json`, the pre-read notes, `sort`. | — |', '| write | writer | sort | what sort and read. produced | `/output/report.md` |'];
      expect(found({ tasks })).toEqual([
        ['error task-reads', 'Tasks and DAG', 'task `sort` reads the result of `read` without depending on it'],
        ['error task-reads', 'Tasks and DAG', 'task `write` reads the result of `read` without depending on it'],
      ]);
    });

    it('finds a task named in a back-ticked span however the span is joined to its neighbours', () => {
      const reads = ['`read`, and `sort`\'s result', '`read`/`sort`', '`sort.output` of `read`', 'read.output, sort.output', 'the results of `read` and `sort`'];
      for (const cell of reads) {
        const tasks = [TASKS[0]!, '| sort | reader | read | the result of `read` | — |', `| write | writer | read | ${cell} | \`/output/report.md\` |`];
        expect(found({ tasks }), cell).toEqual([['error task-reads', 'Tasks and DAG', 'task `write` reads the result of `sort` without depending on it']]);
      }
    });

    it('finds a task in a span whatever is written around its id, and beside the spans a task id shaped like an identifier', () => {
      const reads = ['`sort:output`, `(read)`', '`read→sort`', '`{{sort.output}}` and `${read}`', '`/mailbox/*.eml`, read, sort_mails'];
      for (const cell of reads) {
        const sorter = cell.includes('sort_mails') ? 'sort_mails' : 'sort';
        const tasks = [TASKS[0]!, `| ${sorter} | reader | read | the result of \`read\` | — |`, `| write | writer | read | ${cell} | \`/output/report.md\` |`];
        expect(found({ tasks }), cell).toEqual([['error task-reads', 'Tasks and DAG', `task \`write\` reads the result of \`${sorter}\` without depending on it`]]);
      }
      // Beside a back-ticked span, a plain word that happens to be a task id is a word of the sentence.
      const plain = [TASKS[0]!, '| sort | reader | read | `read` | — |', '| write | writer | read | the result of sort; `/output/sort.json` | `/output/report.md` |'];
      expect(found({ tasks: plain })).toEqual([]);
    });

    it('takes no word of a sentence for a task once the cell writes its names between back-ticks', () => {
      const tasks = ['| read | reader | — | the `.eml` files of `/mailbox`, to sort later; `/state/sort.json` | — |', '| sort | reader | read | `read` | — |', '| write | writer | sort | `sort` | `/output/report.md` |'];
      expect(found({ tasks })).toEqual([]);
    });

    it('reads the agent and the dependencies of a task with remarks, connectors and arrows', () => {
      const rows = [
        '| read | `reader` (seul à lire `/mailbox`) | none (first task) | `/mailbox/*.eml` | — |',
        '| sort | reader (encore) | Aucune | — | — |',
        '| check | reader | read et sort | `read`, `sort` | — |',
        '| write | writer | read → sort → `check` | `check` | `/output/report.md` |',
      ];
      expect(found({ tasks: rows })).toEqual([]);
    });

    it('does not let a dependency hide a cycle behind a dash or a remark', () => {
      const cycle = (dependencies: string): [string, string, string][] => found({ tasks: [`| read | reader | ${dependencies} | — | — |`, '| write | writer | read | `read` | `/output/report.md` |'] });
      expect(cycle('`—`, write').map(([code]) => code)).toEqual(['error task-cycle']);
      expect(cycle('**write**').map(([code]) => code)).toEqual(['error task-cycle']);
      expect(cycle('`read` (lui-même, en boucle)')).toEqual([['error task-cycle', 'Tasks and DAG', 'the dependencies form a cycle: `read` → `read`']]);
    });

    it('walks a chain of thousands of tasks without a deep call, and still finds its cycle', () => {
      // No clock here: a walk that called itself once per task of the chain overflowed the stack at 6000 tasks.
      const chain = (last: string): string[] => Array.from({ length: 20_000 }, (_, index) => `| t${String(index)} | reader | ${index === 19_999 ? last : `t${String(index + 1)}`} | — | — |`);
      expect(found({ tasks: chain('—'), deliverables: [] })).toEqual([]);
      expect(found({ tasks: chain('t19990'), deliverables: [] }).map(([code, , message]) => [code, message.slice(0, 62)])).toEqual([['error task-cycle', 'the dependencies form a cycle: `t19990` → `t19991` → `t19992` ']]);
    });

    it('looks no task up in the list of the tasks before it: four times the tasks, four times the work', () => {
      // Counted, not timed: looking each task up in a growing list is n²/2 steps, and four times the tasks would be sixteen times the work.
      const work = (count: number): number => {
        const tasks = Array.from({ length: count }, (_, index) => `| t${String(index)} | reader | ${index === 0 ? '—' : `t${String(index - 1)}`} | the result of ${index === 0 ? 'nothing' : `\`t${String(index - 1)}\``} | — |`);
        const document = readMarkdown(design({ tasks, deliverables: [] }));
        return arrayScanWork(() => designFindings(document, { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE }));
      };
      const [small, large] = [work(1_000), work(4_000)];
      expect(small).toBeGreaterThan(1_000);
      expect(large / small).toBeLessThan(6);
    });

    it('lets a table of the author’s own repeat the tasks, and refuses a task that table alone holds', () => {
      const note = (rows: string[]): string => ['Ce que chaque tâche rend :', '', '| Id | Expected output |', '|---|---|', ...rows, '', '```mermaid', 'flowchart LR', '```'].join('\n');
      expect(found({ diagram: note(['| read | la liste des courriels lus |', '| write | le rapport |']) })).toEqual([]);
      expect(found({ diagram: note(['| read | la liste |', '| archive | une copie |']) })).toEqual([
        ['error task-incomplete', 'Tasks and DAG', "`archive` stands in a table that is not the template's — it has no `Agent` or `Dependencies` column: it is not declared"],
      ]);
    });

    it('does not let a remark rescue a wrong agent, a wrong source or a wrong access', () => {
      expect(found({ tasks: [TASKS[0]!, '| write | editor (replaces `writer`) | read | `read` | `/output/report.md` |'] }).map(([code, , message]) => [code, message])).toEqual([
        ['error task-incomplete', 'task `write`: `Agent` `editor (replaces writer)` is not an agent of `## Agents`'],
      ]);
      expect(found({ deliverables: ['| `/output/report.md` | file (via `tool_call`) | Markdown | — |'] }).map(([code, , message]) => [code, message.split(' — ')[0]])).toEqual([
        ['error deliverable', '`/output/report.md`: `Source` `file (via tool_call)`'],
      ]);
      expect(found({ mounts: ['| `/mailbox` | pas `ro` : `rw` | mailbox | `./mailbox` |', MOUNTS[1]!] }, { needMounts: null }).map(([code, , message]) => [code, message.split(' — ')[0]])).toEqual([
        ['error mounts', '`/mailbox`: access `pas ro : rw`'],
      ]);
      expect(found({ agents: [AGENTS[0]!, '| writer | Writes | `file_write` | 3–5 | j |'] }).map(([code, , message]) => [code, message.split(' — ')[0]])).toEqual([
        ['error agent-incomplete', 'agent `writer`: `maxIter` `3–5`'],
      ]);
    });

    it('warns when the section draws no diagram', () => {
      expect(found({ diagram: 'read, then write.' })).toEqual([['warning diagram', 'Tasks and DAG', 'no ```mermaid block: the diagram is drawn from the table']]);
      expect(found({ diagram: '~~~ Mermaid\nflowchart LR\n~~~' })).toEqual([]);
    });
  });

  describe('the mount points', () => {
    it('reads them from the table of the need and from the table of the design', () => {
      expect(mountRows(readMarkdown(workbookFixture('clean/workbook/NEED.md')))).toEqual([
        { root: '/mailbox', access: 'ro', folder: '`./mailbox`' },
        { root: '/state', access: 'rw', folder: '`./state`' },
        { root: '/output', access: 'rw', folder: '`./output`' },
      ]);
      expect(mountRows(readMarkdown('## Mounts\n\nNone.'))).toEqual([]);
      expect(mountRows(readMarkdown('## Inputs'))).toBeNull();
    });

    it('refuses what mounts.json would refuse, a point declared twice and a row without its folder', () => {
      const mounts = ['| `/Mail box` | ro | x | `./a` |', '| /crew | ro | x | ./b |', '| /plugins | rw | x | ./c |', '| /output | write | x | |', '| /output | rw | x | ./d |', '| | ro | x | ./e |'];
      expect(found({ mounts, ...NO_DELIVERABLE }, { needMounts: null })).toEqual([
        ['error mounts', 'Mounts', '`/Mail box`: not a virtual root (one lowercase segment such as `/mailbox`)'],
        ['error mounts', 'Mounts', '`/crew`: reserved for the runner (/crew, /script, /llm-logs, /sandbox, /credentials)'],
        ['error mounts', 'Mounts', '`/plugins`: /plugins is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it "access": "ro", or its agents could drop code that the next run executes'],
        ['error mounts', 'Mounts', '`/output`: access `write` — none of `ro`, `rw` and `rwnd`; empty `Folder of the team`'],
        ['error mounts', 'Mounts', '`/output`: declared twice'],
        ['error mounts', 'Mounts', 'row 6: no mount point'],
      ]);
      expect(found({ mounts: ['| /plugins | ro | plugins | ./plugins |', ...MOUNTS] }, { needMounts: null })).toEqual([]);
    });

    it('reads an access with a remark beside it, in the need as in the design — and still not another word', () => {
      const need = [{ root: '/mailbox', access: 'ro', folder: './mailbox' }, { root: '/output', access: 'rw', folder: './output' }];
      const mounts = ['| `/mailbox` (exports) | `ro` (jamais modifié) | mailbox | `./mailbox` |', '| `/output` | rw (écrit par le dernier agent) | deliverables | `./output` |'];
      expect(found({ mounts }, { needMounts: need })).toEqual([]);
      const remarked = readMarkdown('## Mounts\n\n| Mount point | Access | Role | Folder of the team | What it holds |\n|---|---|---|---|---|\n| `/mailbox` | ro (lecture seule) | mailbox | `./mailbox` | x |\n| `/output` | `rw` | deliverables | `./output` | x |');
      expect(mountRows(remarked)?.map((mount) => mount.access)).toEqual(['ro', 'rw']);
      expect(found({}, { needMounts: mountRows(remarked) })).toEqual([]);
      expect(found({ mounts: ['| `/mailbox` | read-only | mailbox | `./mailbox` |', MOUNTS[1]!] }, { needMounts: null }).map(([code, , message]) => [code, message])).toEqual([
        ['error mounts', '`/mailbox`: access `read-only` — none of `ro`, `rw` and `rwnd`'],
      ]);
    });

    it('ignores a table without the key column, and refuses a mount point that only a table without Access holds', () => {
      const mounts = [...MOUNTS, '', 'Point envisagé puis écarté :', '', '| Root | Access |', '|---|---|', '| `/archive` | rw |'];
      expect(found({ mounts })).toEqual([]);
      const stray = [...MOUNTS, '', '| Mount point | Role |', '|---|---|', '| `/mailbox` | mailbox |', '| `/archive` | archive (rw) |'];
      expect(found({ mounts: stray })).toEqual([['error mounts', 'Mounts', "`/archive` stands in a table that is not the template's — it has no `Access` column: it is not declared"]]);
    });

    it('reads a mount point with a remark after it', () => {
      expect(found({ mounts: ['| /mailbox (courriels) | ro | mailbox | `./mailbox` |', MOUNTS[1]!] })).toEqual([]);
    });

    it('asks for one mount point at least', () => {
      expect(found({ mounts: [], ...NO_DELIVERABLE }, { needMounts: [] })).toEqual([['error mounts', 'Mounts', 'no mount point: the table repeats the rows of `NEED.md` `## Mounts`']]);
    });

    it('compares them with those of the need: one missing, one added, another access', () => {
      const mounts = ['| `/mailbox` | rw | mailbox | `./mailbox` |', '| `/archive` | rw | archive | `./archive` |'];
      const change = ' — a change of the mount points is a change of the need: `/team-decision`';
      expect(found({ mounts, ...NO_DELIVERABLE })).toEqual([
        ['error mounts-need', 'Mounts', `\`/output\` of \`NEED.md\` is missing${change}`],
        ['error mounts-need', 'Mounts', `\`/archive\` is not a mount point of \`NEED.md\`${change}`],
        ['error mounts-need', 'Mounts', `\`/mailbox\` is \`rw\` here and \`ro\` in \`NEED.md\`${change}`],
      ]);
      expect(found({ mounts, ...NO_DELIVERABLE }, { needMounts: null })).toEqual([]);
    });
  });

  describe('the deliverables', () => {
    it('asks each for a path under a writable mount point, a source of the list, and a schema when structured', () => {
      const deliverables = [
        '| `report.md` | final_message | Markdown | — |',
        '| `/output` | tool_call | text | — |',
        '| `/output/../crew/x` | tool_call | text | — |',
        '| `/reports/a.md` | tool_call | text | — |',
        '| `/mailbox/a.md` | | text | — |',
        '| `/output/a.json` | structured_output | JSON | |',
        '| `/output/b.json` | written by the agent | a JSON list | n/a |',
        '| | final_message | text | — |',
      ];
      expect(found({ deliverables }).filter(([code]) => code === 'error deliverable')).toEqual([
        ['error deliverable', 'Deliverables and schemas', '`report.md`: not a virtual path under a mount point, such as `/output/report.md`'],
        ['error deliverable', 'Deliverables and schemas', '`/output`: not a virtual path under a mount point, such as `/output/report.md`'],
        ['error deliverable', 'Deliverables and schemas', '`/output/../crew/x`: not a virtual path under a mount point, such as `/output/report.md`'],
        ['error deliverable', 'Deliverables and schemas', '`/reports/a.md`: `/reports` is not a mount point of `## Mounts`'],
        ['error deliverable', 'Deliverables and schemas', '`/mailbox/a.md`: `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point; `Source` is empty — none of `final_message`, `structured_output` and `tool_call`'],
        ['error deliverable', 'Deliverables and schemas', '`/output/a.json`: `structured_output` with an empty `Schema`'],
        ['error deliverable', 'Deliverables and schemas', '`/output/b.json`: `Source` `written by the agent` — none of `final_message`, `structured_output` and `tool_call`; a JSON format with an empty `Schema`'],
        ['error deliverable', 'Deliverables and schemas', 'a row without path: not a virtual path under a mount point, such as `/output/report.md`'],
      ]);
    });

    it('accepts a file under an rwnd mount point, a JSON file with its schema and a JSONL one without', () => {
      const mounts = [...MOUNTS, '| `/archive` | rwnd | archive | `./archive` |'];
      const deliverables = ['| `/output/report.md` | final_message | Markdown | — |', '| `/archive/<date>/report.json` | structured_output | JSON | `library/schemas/report.schema.json` |', '| `/archive/log.jsonl` | tool_call | JSONL | — |'];
      const tasks = [TASKS[0]!, '| write | writer | read | — | `/output/report.md`, `/archive/<date>/report.json` and `/archive/log.jsonl` |'];
      expect(found({ mounts, deliverables, tasks }, { needMounts: null })).toEqual([]);
    });

    it('takes the first segment of a virtual path for its mount point, whatever follows — and no remark hides a path', () => {
      const delivered = (cell: string): string[] => found({ tasks: [TASKS[0]!, `| write | writer | read | the result of \`read\` | ${cell} |`], deliverables: [] }).filter(([code]) => code === 'error deliverable').map(([, , message]) => message.split(' — ')[0]!);
      for (const cell of ['`/mailbox/`', 'un fichier dans `/mailbox`', '`report.md` dans /mailbox/out/', '**/mailbox/report.md**', '`/mailbox/report.md (copie)`', 'le rapport (`/mailbox/report.md`)', '`/output/report.md`, copie dans `/mailbox/done/report.md`']) {
        expect(delivered(cell).map((message) => message.split('deliverable ')[1]?.slice(0, 9)), cell).toEqual(['`/mailbox']);
      }
      expect(delivered('`mailbox/report.md`, soit le rapport / la synthèse')).toEqual([]);
    });

    it('takes a path in the remark of a cell for what the task reads, not for a deliverable', () => {
      const row = (deliverable: string, path = '`/output/report.md`'): [string, string, string][] =>
        found({ tasks: ['| read | reader | — | `/mailbox/*.eml` | — (lit `/mailbox`, n’écrit rien) |', `| write | writer | read | the result of \`read\` | ${deliverable} |`], deliverables: [`| ${path} | final_message | Markdown | — |`] });
      expect(row('`/output/report.md` (un par courriel de `/mailbox`)')).toEqual([]);
      expect(row('`/output/report.md`', '`/output/report.md` (un par fichier de `/mailbox/*.eml`)')).toEqual([]);
      expect(found({ tasks: ['| read | reader | — | `/mailbox/*.eml` | Aucun : la tâche lit `/mailbox` et `/output/registry.json` |', TASKS[1]!] })).toEqual([]);
      expect(found({ tasks: ['| read | reader | — | `/mailbox/*.eml` | none (reads `/mailbox`) |', TASKS[1]!] })).toEqual([]);
      // Without a path outside brackets, the path in brackets is the one the cell means.
      expect(row('le rapport (`/mailbox/report.md`)').filter(([code]) => code === 'error deliverable')).toEqual([
        ['error deliverable', 'Tasks and DAG', 'task `write`: deliverable `/mailbox/report.md` — `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point'],
      ]);
      // A second path outside brackets is still a deliverable.
      expect(row('`/output/report.md`, copie dans `/mailbox/done/report.md` (comme `/output/x`)').filter(([code]) => code === 'error deliverable')).toHaveLength(1);
    });

    it('strips the emphasis around a path, never an asterisk inside it', () => {
      const glob = found({ tasks: [TASKS[0]!, '| write | writer | read | the result of `read` | `/output/drafts/*.txt` |'], deliverables: ['| `/output/drafts/*.txt` | tool_call | text | — |'] });
      expect(glob).toEqual([]);
      const readOnly = found({ tasks: [TASKS[0]!, '| write | writer | read | `read` | **/mailbox/*.txt** |'], deliverables: ['| *`/mailbox/*.txt`* | tool_call | text | — |'] });
      expect(readOnly).toEqual([['error deliverable', 'Deliverables and schemas', '`/mailbox/*.txt`: `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point']]);
    });

    it('holds the stray-table rule of the deliverables to virtual paths: a table of the fields of a file is the author’s own', () => {
      const fields = ['| `/output/report.md` | final_message | Markdown | — |', '', 'Champs de `classification.json` :', '', '| Path | Type | Description |', '|---|---|---|', '| `records[].category` | string | une des sept catégories |'];
      expect(found({ deliverables: fields })).toEqual([]);
      expect(found({ deliverables: [...fields, '| `/mailbox/copy.json` | file | a copy |'] })).toEqual([
        ['error deliverable', 'Deliverables and schemas', "`/mailbox/copy.json` stands in a table that is not the template's — it has no `Source`, `Format` or `Schema` column: it is not declared"],
      ]);
    });

    it('judges every back-ticked path of a Path cell against the mount points, not only the first', () => {
      const deliverables = ['| `/output/report.md`, copie dans `/mailbox/done/report.md` | final_message | Markdown | — |', '| **`/mailbox/`** | tool_call | text | — |'];
      expect(found({ deliverables }).filter(([code]) => code === 'error deliverable')).toEqual([
        ['error deliverable', 'Deliverables and schemas', '`/output/report.md`: `/mailbox/done/report.md` — `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point'],
        ['error deliverable', 'Deliverables and schemas', '`/mailbox/`: not a virtual path under a mount point, such as `/output/report.md`; `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point'],
      ]);
    });

    it('warns about a deliverable no task carries, and about one a task names that the table does not list', () => {
      expect(found({ deliverables: ['| `/output/summary.md` | final_message | Markdown | — |'] })).toEqual([
        ['warning deliverable-orphan', 'Deliverables and schemas', '`/output/summary.md`: no task names it in its `Deliverable` cell'],
        ['warning deliverable-orphan', 'Tasks and DAG', 'task `write` names a deliverable the table does not list: `/output/report.md`'],
      ]);
    });

    it('reads a path and a source with a remark beside them', () => {
      const deliverables = ['| `/output/report.md` (un seul fichier) | `final_message` (écrit par le runner) | Markdown | — |'];
      const tasks = [TASKS[0]!, '| write | writer | read | the result of `read` | `/output/report.md` (le rapport) |'];
      expect(found({ deliverables, tasks })).toEqual([]);
      expect(found({ deliverables: ['| `/output/report.md` | tool_call (écrit par `file_write`) | Markdown | — |'] })).toEqual([]);
    });

    it('holds a path a task says it delivers to the rule of the mount points, listed in the table or not', () => {
      const tasks = [TASKS[0]!, '| write | writer | read | the result of `read` | `/mailbox/report.md`, puis /archive/report.md. |'];
      expect(found({ tasks, deliverables: [] })).toEqual([
        ['error deliverable', 'Tasks and DAG', 'task `write`: deliverable `/mailbox/report.md` — `/mailbox` is read-only: a deliverable lies under an `rw` or `rwnd` mount point'],
        ['warning deliverable-orphan', 'Tasks and DAG', 'task `write` names a deliverable the table does not list: `/mailbox/report.md`'],
        ['error deliverable', 'Tasks and DAG', 'task `write`: deliverable `/archive/report.md` — `/archive` is not a mount point of `## Mounts`'],
        ['warning deliverable-orphan', 'Tasks and DAG', 'task `write` names a deliverable the table does not list: `/archive/report.md`'],
      ]);
      const plain = [TASKS[0]!, '| write | writer | read | the result of `read` | /archive/report.md. |'];
      expect(found({ tasks: plain, deliverables: [] })).toEqual([
        ['error deliverable', 'Tasks and DAG', 'task `write`: deliverable `/archive/report.md` — `/archive` is not a mount point of `## Mounts`'],
        ['warning deliverable-orphan', 'Tasks and DAG', 'task `write` names a deliverable the table does not list: `/archive/report.md`'],
      ]);
      // Listed in the table, the path is judged there, once.
      const listed = found({ tasks: [TASKS[0]!, '| write | writer | read | `read` | `/mailbox/report.md` |'], deliverables: ['| `/mailbox/report.md` | final_message | Markdown | — |'] });
      expect(listed.map(([code, section]) => [code, section])).toEqual([['error deliverable', 'Deliverables and schemas']]);
    });
  });

  describe('the resume strategy and the risks', () => {
    const stateful = (ids: string[]): Partial<DesignContext> => ({ ids: { ...NO_IDS, invariants: ids.map((id) => ({ id, level: 'component' })) } });

    it('refuses None. where an invariant asks the team to carry its state', () => {
      expect(found({}, stateful(['INV-FS', 'INV-INCR', 'INV-RESUME']))).toEqual([
        ['error resume', 'Resume and incremental strategy', '`ACCEPTANCE.md` declares `INV-RESUME` and `INV-INCR` and the section says there is none: Orkeon does not resume a run, the team carries it'],
      ]);
      for (const resume of ['N/A', 'Not applicable.', 'Aucun.', 'Aucune (chaque exécution repart de zéro).', 'None: every run starts from scratch.']) {
        expect(found({ resume }, stateful(['INV-INCR'])).map(([code]) => code), resume).toEqual(['error resume']);
      }
      expect(found({ resume: 'Le registre est `/state/registry.json` : aucun autre état.' }, stateful(['INV-INCR']))).toEqual([]);
      expect(found({ resume: 'None. Every run starts from scratch.' }, stateful(['INV-IDEMP'])).map(([code]) => code)).toEqual(['error resume']);
      expect(found({ resume: 'The registry lives under `/state`.' }, stateful(['INV-INCR']))).toEqual([]);
      expect(found({}, stateful(['INV-FS']))).toEqual([]);
    });

    it('asks for one risk at least, each with its mitigation', () => {
      expect(found({ risks: [] })).toEqual([['error risks', 'Risks', 'no risk: list the known pitfalls that apply, each with its mitigation']]);
      expect(found({ risks: ['| a slow model | |', '| — | wait |', '| a loop | maxIter |'] })).toEqual([
        ['error risks', 'Risks', 'row 1: empty `Mitigation`'],
        ['error risks', 'Risks', 'row 2: empty `Risk`'],
      ]);
      // A second table with the key column alone is the author's own: here it protects nothing, and is simply not read.
      const second = design({ risks: ['| a slow model | a small context |', '', '| Risk | Probability |', '|---|---|', '| the model answers outside the list | medium |'] });
      expect(designFindings(readMarkdown(second), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE })).toEqual([]);
      const renamed = design().replace('| Risk | Mitigation |', '| Risk | Parade |');
      expect(designFindings(readMarkdown(renamed), { needMounts: NEED_MOUNTS, ids: NO_IDS, catalogue: TOOL_CATALOGUE }).map((finding) => finding.message)).toEqual(['no risk: list the known pitfalls that apply, each with its mitigation']);
    });
  });
});
