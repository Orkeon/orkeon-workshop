import { MOUNT_ACCESSES } from '../mounts/mount-declaration.js';
import { PLUGINS_ROOT, PLUGINS_ROOT_READ_ONLY, RESERVED_VIRTUAL_ROOTS, VIRTUAL_ROOT_PATTERN, isReservedRoot } from '../mounts/virtual-root.js';
import type { WorkbookIds } from './acceptance-rules.js';
import { error, listOf, warning, type Finding } from './finding.js';
import { ARTEFACTS } from './headings.js';
import { strayFindings } from './common-rules.js';
import { cell, choiceOf, isEmptyCell, isIdentifier, namesIn, ownLines, piecesOf, rowsWith, saysNone, sectionNamed, shapedValueOf, textOf, unquote, valueOf, wordOf, type MarkdownDocument, type MarkdownLine, type MarkdownSection } from './markdown.js';

/** The orchestration modes of an Orkeon crew (`process`), as `## Process` names one. */
export const PROCESS_MODES = ['sequential', 'hierarchical', 'parallel', 'consensual', 'graph', 'autonomous'] as const;

/** How a deliverable reaches its file (`source` of an Orkeon deliverable). */
export const DELIVERABLE_SOURCES = ['final_message', 'structured_output', 'tool_call'] as const;

/** The tools that read mail nobody vouches for: the agent that holds one never holds `email_send`. */
const MAIL_READERS = ['email_read', 'email_search', 'email_parser'];
const MAIL_SENDER = 'email_send';

/** The invariants that ask the design for a registry: `## Resume and incremental strategy` then says how. */
const STATEFUL_INVARIANTS = ['INV-RESUME', 'INV-INCR', 'INV-IDEMP'];

/** A row of a `## Mounts` table, of the need or of the design. */
export interface MountRow {
  /** The mount point: the first back-ticked span of its cell, or the cell. */
  readonly root: string;
  /** `ro`, `rw` or `rwnd` — a remark after it left out —, or the cell as written when it is none of them. */
  readonly access: string;
  readonly folder: string;
}

/** What the design is checked against: the need, the declared ids, the installed tool catalogue. */
export interface DesignContext {
  /** The rows of `NEED.md` `## Mounts`; null when the need has no such section. */
  readonly needMounts: readonly MountRow[] | null;
  readonly ids: WorkbookIds;
  /** The names `orkeon run --list-tools` lists; null when they could not be read: tool names are then not judged. */
  readonly catalogue: readonly string[] | null;
}

/** The rows of the `## Mounts` table of an artefact, or null when it has no such section. */
export function mountRows(document: MarkdownDocument): MountRow[] | null {
  const section = sectionNamed(document.sections, 'Mounts');
  if (section === null) {
    return null;
  }
  return rowsWith(section.lines, 'Mount point', ['Access']).map((row) => ({ root: wordOf(cell(row, 'Mount point')), access: choiceOf(cell(row, 'Access'), MOUNT_ACCESSES), folder: cell(row, 'Folder of the team') }));
}

/** Whether `name` stands in `text` as a whole word — an id may hold `-` and `_`. */
function names(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(text);
}

/** What dismisses the mode that follows it: `not hierarchical`, `pas de hierarchical`, `ni parallel`. */
const DISMISSAL = /(?:\b(?:not|no|nor|neither|without|rather than|instead of|pas|ni|sans)(?:\s+(?:a|an|the|de|d['’]|du|un|une|le|la))?)\s*$/i;

/**
 * The mode `## Process` names. A sentence may dismiss another mode before it names its own, so:
 * the first mode written between back-ticks that the words before it do not dismiss; failing
 * that the first mode word not dismissed; failing that the first mode word.
 */
function modeOf(text: string): (typeof PROCESS_MODES)[number] | null {
  const found = [...text.matchAll(new RegExp(`(\`?)\\b(${PROCESS_MODES.join('|')})\\b(\`?)`, 'gi'))].map((match) => ({
    mode: (match[2] as string).toLowerCase() as (typeof PROCESS_MODES)[number],
    quoted: match[1] === '`' && match[3] === '`',
    dismissed: DISMISSAL.test(text.slice(Math.max(0, match.index - 40), match.index)),
  }));
  const named = found.find((mode) => mode.quoted && !mode.dismissed) ?? found.find((mode) => !mode.dismissed) ?? found[0];
  return named?.mode ?? null;
}

/**
 * The tasks a `Reads` cell names. With back-ticked spans, a task is named by a span — split on
 * whatever is no letter, digit, `_` or `-`: `` `classify`'s result ``, `` `classify:output` `` and
 * `` `parse→classify` `` name `classify`; a virtual path names none — or, outside the spans, by a
 * word that is a task id and has the shape of an identifier (`parse_mails`): a plain word of the
 * sentence around (`sort`) is a remark. Without a back-tick, a task is named by a whole word.
 */
function tasksRead(reads: string, taskIds: ReadonlySet<string>): string[] {
  const words: string[] = [];
  if (!reads.includes('`')) {
    words.push(...reads.split(/[\s,;().'’]+/).map((word) => word.replace(/^[^A-Za-z0-9_]+|[^A-Za-z0-9_]+$/g, '')));
  } else {
    for (const [, span, outside] of reads.matchAll(/`([^`]*)`|([^`]+)/g)) {
      if (span !== undefined) {
        words.push(...(span.trim().startsWith('/') ? [] : span.split(/[^A-Za-z0-9_-]+/)));
      } else {
        words.push(...(outside as string).split(/[^A-Za-z0-9_-]+/).filter(isIdentifier));
      }
    }
  }
  return [...new Set(words.filter((word) => taskIds.has(word)))];
}

/** A text without the emphasis marks wrapped around it — one or two asterisks on each side —, never an asterisk inside it, which a glob writes. */
function unwrapped(text: string): string {
  return text.trim().replace(/^(\*{1,2})(.+)\1$/s, '$2');
}

/**
 * The deliverables a cell names — a `Deliverable` cell of a task, a `Path` cell of the table: its
 * virtual paths, back-ticked or not, outside brackets. A path in brackets belongs to a remark —
 * what the task reads, where a draft comes from — and is no deliverable, unless the cell names no
 * path outside brackets: then the path it writes in brackets is the one it means. A cell that says
 * it is empty, with or without its reason, names none.
 */
function deliverablePaths(text: string): string[] {
  if (isEmptyCell(text)) {
    return [];
  }
  const outside: string[] = [];
  const bracketed: string[] = [];
  for (const piece of piecesOf(text)) {
    const candidates = piece.quoted ? [piece.text] : piece.text.split(/[\s,;]+/).map((word) => word.replace(/[.,;:]+$/, ''));
    for (const candidate of candidates.map(unwrapped)) {
      if (candidate.startsWith('/') && candidate.length > 1) {
        (piece.bracketed ? bracketed : outside).push(candidate);
      }
    }
  }
  return [...new Set(outside.length > 0 ? outside : bracketed)];
}

/**
 * `DESIGN.md` against the known pitfalls (gate 3): a mode, agents and their tools, tasks and what
 * each reads, the mount points of the need, deliverables under a writable one, a resume strategy
 * where an invariant asks for it, risks with their mitigation.
 */
export function designFindings(design: MarkdownDocument, context: DesignContext): Finding[] {
  const findings: Finding[] = [];
  const report = (code: Finding['code'], section: string, message: string): void => {
    findings.push(error(code, ARTEFACTS.design, section, message));
  };
  const warn = (code: Finding['code'], section: string, message: string): void => {
    findings.push(warning(code, ARTEFACTS.design, section, message));
  };
  const lines = (heading: string): readonly MarkdownLine[] => sectionNamed(design.sections, heading)?.lines ?? [];
  const present = (heading: string): MarkdownSection | null => sectionNamed(design.sections, heading);

  // The agents.
  const agentRows = rowsWith(lines('Agents'), 'Id', ['Role', 'Tools']);
  const agentIds: string[] = [];
  const agentRowIds = agentRows.map((row, index) => {
    const id = wordOf(cell(row, 'Id'));
    const label = isEmptyCell(id) ? `row ${String(index + 1)}` : `agent \`${id}\``;
    const problems: string[] = [];
    if (isEmptyCell(id)) {
      problems.push('no `Id`');
    } else if (agentIds.includes(id)) {
      problems.push('the id is on two rows');
    } else {
      agentIds.push(id);
    }
    problems.push(...['Role', 'Justification'].filter((header) => isEmptyCell(cell(row, header))).map((header) => `empty \`${header}\``));
    const maxIter = shapedValueOf(cell(row, 'maxIter'), /^[0-9]+/);
    if (!/^[1-9][0-9]*$/.test(maxIter)) {
      problems.push(`\`maxIter\` ${maxIter === '' ? 'is empty' : `\`${maxIter}\``} — not an integer of 1 or more`);
    }
    if (problems.length > 0) {
      report('agent-incomplete', 'Agents', `${label}: ${problems.join('; ')}`);
    }
    return isEmptyCell(id) ? '' : id;
  });
  // Without the section, the headings say so once: no row elsewhere is blamed for naming an agent or a mount point that is not there.
  const hasAgents = present('Agents') !== null;
  findings.push(...strayFindings('agent-incomplete', ARTEFACTS.design, 'Agents', lines('Agents'), 'Id', ['Role', 'Tools'], new Set(agentIds)));
  if (hasAgents) {
    if (agentRows.length === 0) {
      report('agents-count', 'Agents', 'no agent: a team has 2 to 5 agents, one competency each');
    } else if (agentRows.length === 1 || agentRows.length > 5) {
      warn('agents-count', 'Agents', `${String(agentRows.length)} agent${agentRows.length === 1 ? '' : 's'}: a team has 2 to 5 agents, one competency each`);
    }
  }

  // The mode.
  const process = present('Process');
  if (process !== null) {
    const text = textOf(ownLines(process));
    const mode = modeOf(text);
    if (mode === null) {
      report('process', 'Process', `the section names no mode: ${listOf(PROCESS_MODES.map((candidate) => `\`${candidate}\``))}`);
    } else {
      if (mode === 'hierarchical' && !agentIds.some((id) => names(text, id))) {
        report('process-manager', 'Process', 'mode `hierarchical` and the section names no agent of `## Agents`: a hierarchical team names its manager');
      }
      if (mode !== 'sequential') {
        // In every mode a failed task fails the run; what differs is what the mode does about it first.
        warn('process-failure', 'Process', `process \`${mode}\`: an active acceptance criterion must say what happens when a task fails — its retry, revision or vote, and what a failed run leaves`);
      }
    }
  }

  // The tools: catalogue names, or custom ones declared in `## Tools`.
  const tools: { name: string; custom: boolean; users: string[] }[] = [];
  rowsWith(lines('Tools'), 'Tool', ['Kind']).forEach((row, index) => {
    const name = wordOf(cell(row, 'Tool'));
    const label = isEmptyCell(name) ? `row ${String(index + 1)}` : `tool \`${name}\``;
    // The kind is the cell, or its first back-ticked span, without what it adds in brackets.
    const kind = valueOf(cell(row, 'Kind'))
      .replace(/\([^()]*\)/g, ' ')
      .toLowerCase();
    const builtIn = /\bbuilt-in\b/.test(kind);
    const custom = /\bcustom\b/.test(kind);
    const problems: string[] = [];
    if (isEmptyCell(name)) {
      problems.push('no name');
    }
    if (builtIn === custom) {
      problems.push(`\`Kind\` ${cell(row, 'Kind') === '' ? 'is empty' : `\`${unquote(cell(row, 'Kind'))}\``} — ${builtIn ? 'both' : 'neither'} \`built-in\` ${builtIn ? 'and' : 'nor'} \`custom\``);
    }
    if (custom && !builtIn && isEmptyCell(cell(row, 'Why deterministic'))) {
      problems.push('a custom tool with an empty `Why deterministic`');
    }
    const users = namesIn(cell(row, 'Used by'), new Set(agentIds));
    const strangers = users.filter((id) => !agentIds.includes(id));
    if (hasAgents && strangers.length > 0) {
      problems.push(`\`Used by\` names ${listOf(strangers.map((id) => `\`${id}\``))}, not an agent of \`## Agents\``);
    }
    if (problems.length > 0) {
      report('tool-incomplete', 'Tools', `${label}: ${problems.join('; ')}`);
    }
    if (isEmptyCell(name)) {
      return;
    }
    tools.push({ name, custom: custom && !builtIn, users });
    if (context.catalogue !== null && builtIn && !custom && !context.catalogue.includes(name)) {
      report('unknown-tool', 'Tools', `built-in tool \`${name}\` is not listed by \`orkeon run --list-tools\``);
    }
    if (context.catalogue !== null && custom && !builtIn && context.catalogue.includes(name)) {
      warn('tool-shadow', 'Tools', `custom tool \`${name}\` bears the name of a catalogue tool`);
    }
  });
  findings.push(...strayFindings('tool-incomplete', ARTEFACTS.design, 'Tools', lines('Tools'), 'Tool', ['Kind'], new Set(tools.map((tool) => tool.name))));
  const customTools = tools.filter((tool) => tool.custom).map((tool) => tool.name);
  const knownTools = new Set([...(context.catalogue ?? []), ...tools.map((tool) => tool.name)]);
  let sender = tools.some((tool) => tool.name === MAIL_SENDER);
  agentRows.forEach((row, index) => {
    const id = agentRowIds[index] as string;
    const label = id === '' ? 'an agent without id' : `agent \`${id}\``;
    const held = namesIn(cell(row, 'Tools'), knownTools);
    for (const tool of held) {
      if (context.catalogue !== null && !context.catalogue.includes(tool) && !customTools.includes(tool)) {
        report('unknown-tool', 'Agents', `${label}: unknown tool \`${tool}\` (not listed by \`orkeon run --list-tools\`, not declared custom in \`## Tools\`)`);
      }
    }
    // What an agent holds is what its row lists and what `## Tools` says it uses: the rule is not escaped by writing a tool in one place only.
    const all = [...new Set([...held, ...tools.filter((tool) => id !== '' && tool.users.includes(id)).map((tool) => tool.name)])];
    const reads = all.filter((tool) => MAIL_READERS.includes(tool));
    sender ||= all.includes(MAIL_SENDER);
    if (all.includes(MAIL_SENDER) && reads.length > 0) {
      report('mail-read-send', 'Agents', `${label} holds \`${MAIL_SENDER}\` and ${listOf(reads.map((tool) => `\`${tool}\``))}: the agent that reads untrusted mail never sends`);
    }
  });
  if (sender) {
    warn('mail-send', 'Agents', `\`${MAIL_SENDER}\` appears: the need must authorise sending to named recipients, otherwise replies are drafts`);
  }

  // The tasks and what each reads.
  const tasks: { id: string; label: string; dependencies: string[]; deliverable: string; paths: string[] }[] = [];
  const taskSection = present('Tasks and DAG');
  const taskRows = rowsWith(lines('Tasks and DAG'), 'Id', ['Agent', 'Dependencies']);
  const taskIdList = taskRows.map((row) => wordOf(cell(row, 'Id'))).filter((id) => !isEmptyCell(id));
  const taskIds = new Set(taskIdList);
  const seenTasks = new Set<string>();
  taskRows.forEach((row, index) => {
    const id = wordOf(cell(row, 'Id'));
    const label = isEmptyCell(id) ? `row ${String(index + 1)}` : `task \`${id}\``;
    const problems: string[] = [];
    if (isEmptyCell(id)) {
      problems.push('no `Id`');
    } else if (seenTasks.has(id)) {
      problems.push('the id is on two rows');
    }
    seenTasks.add(id);
    const agent = choiceOf(cell(row, 'Agent'), agentIds);
    if (hasAgents && !agentIds.includes(agent)) {
      problems.push(`\`Agent\` ${isEmptyCell(agent) ? 'is empty' : `\`${agent}\` is not an agent of \`## Agents\``}`);
    }
    const dependencies = namesIn(cell(row, 'Dependencies'), taskIds);
    const unknown = dependencies.filter((dependency) => !taskIds.has(dependency));
    if (unknown.length > 0) {
      problems.push(`depends on ${listOf(unknown.map((dependency) => `\`${dependency}\``))}, not a task`);
    }
    if (problems.length > 0) {
      report('task-incomplete', 'Tasks and DAG', `${label}: ${problems.join('; ')}`);
    }
    for (const read of tasksRead(cell(row, 'Reads'), taskIds)) {
      if (read !== id && !dependencies.includes(read)) {
        report('task-reads', 'Tasks and DAG', `${label} reads the result of \`${read}\` without depending on it`);
      }
    }
    tasks.push({ id: isEmptyCell(id) ? '' : id, label, dependencies, deliverable: unquote(cell(row, 'Deliverable')), paths: deliverablePaths(cell(row, 'Deliverable')) });
  });
  findings.push(...strayFindings('task-incomplete', ARTEFACTS.design, 'Tasks and DAG', lines('Tasks and DAG'), 'Id', ['Agent', 'Dependencies'], taskIds));
  if (taskSection !== null) {
    if (taskRows.length === 0) {
      report('task-incomplete', 'Tasks and DAG', 'no task: a team has one task per step');
    }
    const cycle = dependencyCycle(tasks);
    if (cycle !== null) {
      report('task-cycle', 'Tasks and DAG', `the dependencies form a cycle: ${cycle.map((id) => `\`${id}\``).join(' → ')}`);
    }
    if (!taskSection.lines.some((line) => line.fenced && /^\s*(?:`{3,}|~{3,})\s*mermaid\b/i.test(line.text))) {
      warn('diagram', 'Tasks and DAG', 'no ```mermaid block: the diagram is drawn from the table');
    }
  }

  // The mount points: those of the need, settled.
  const mounts = mountRows(design);
  const access = new Map<string, string>();
  findings.push(...strayFindings('mounts', ARTEFACTS.design, 'Mounts', lines('Mounts'), 'Mount point', ['Access'], new Set((mounts ?? []).map((mount) => mount.root))));
  if (mounts !== null) {
    if (mounts.length === 0) {
      report('mounts', 'Mounts', 'no mount point: the table repeats the rows of `NEED.md` `## Mounts`');
    }
    mounts.forEach((mount, index) => {
      const label = isEmptyCell(mount.root) ? `row ${String(index + 1)}` : `\`${mount.root}\``;
      const problems: string[] = [];
      if (isEmptyCell(mount.root)) {
        problems.push('no mount point');
      } else if (!VIRTUAL_ROOT_PATTERN.test(mount.root)) {
        problems.push('not a virtual root (one lowercase segment such as `/mailbox`)');
      } else if (isReservedRoot(mount.root)) {
        problems.push(`reserved for the runner (${RESERVED_VIRTUAL_ROOTS.join(', ')})`);
      } else if (mount.root === PLUGINS_ROOT && mount.access !== 'ro') {
        problems.push(PLUGINS_ROOT_READ_ONLY);
      }
      if (access.has(mount.root) && !isEmptyCell(mount.root)) {
        problems.push('declared twice');
      }
      if (!(MOUNT_ACCESSES as readonly string[]).includes(mount.access)) {
        problems.push(`access ${mount.access === '' ? 'is empty' : `\`${mount.access}\``} — none of ${listOf(MOUNT_ACCESSES.map((known) => `\`${known}\``))}`);
      }
      if (isEmptyCell(mount.folder)) {
        problems.push('empty `Folder of the team`');
      }
      if (problems.length > 0) {
        report('mounts', 'Mounts', `${label}: ${problems.join('; ')}`);
      }
      if (!isEmptyCell(mount.root) && !access.has(mount.root)) {
        access.set(mount.root, mount.access);
      }
    });
    if (context.needMounts !== null) {
      const needed = new Map(context.needMounts.filter((mount) => !isEmptyCell(mount.root)).map((mount) => [mount.root, mount.access]));
      const differences = [
        ...[...needed.keys()].filter((root) => !access.has(root)).map((root) => `\`${root}\` of \`NEED.md\` is missing`),
        ...[...access.keys()].filter((root) => !needed.has(root)).map((root) => `\`${root}\` is not a mount point of \`NEED.md\``),
        ...[...access].filter(([root, mode]) => needed.has(root) && needed.get(root) !== mode).map(([root, mode]) => `\`${root}\` is \`${mode}\` here and \`${needed.get(root) as string}\` in \`NEED.md\``),
      ];
      for (const difference of differences) {
        report('mounts-need', 'Mounts', `${difference} — a change of the mount points is a change of the need: \`/team-decision\``);
      }
    }
  }
  /** Why a virtual path cannot hold a deliverable — its mount point is not declared, or is read-only — or null. */
  const refusal = (path: string): string | null => {
    const root = /^\/[^/\s]+/.exec(path)?.[0];
    if (root === undefined || mounts === null) {
      return null;
    }
    if (!access.has(root)) {
      return `\`${root}\` is not a mount point of \`## Mounts\``;
    }
    return access.get(root) === 'ro' ? `\`${root}\` is read-only: a deliverable lies under an \`rw\` or \`rwnd\` mount point` : null;
  };

  // The deliverables: under a writable mount point, with a source, and a schema when structured.
  const deliverables = present('Deliverables and schemas');
  const listed = new Set<string>();
  const named = new Set(tasks.flatMap((task) => task.paths));
  for (const row of rowsWith(lines('Deliverables and schemas'), 'Path', ['Source', 'Format', 'Schema'])) {
    const path = wordOf(unwrapped(cell(row, 'Path')));
    // Every virtual path the cell names outside a remark is a path the row delivers to: the first is the deliverable, the others are judged like it.
    const others = deliverablePaths(cell(row, 'Path')).filter((other) => other !== path);
    [path, ...others].filter((listedPath) => !isEmptyCell(listedPath)).forEach((listedPath) => listed.add(listedPath));
    const problems: string[] = [];
    if (!/^\/[^/]+\/.+/.test(path) || path.split('/').includes('..')) {
      problems.push('not a virtual path under a mount point, such as `/output/report.md`');
    }
    for (const judged of [path, ...others]) {
      const reason = refusal(judged);
      if (reason !== null) {
        problems.push(judged === path ? reason : `\`${judged}\` — ${reason}`);
      }
    }
    const source = choiceOf(cell(row, 'Source'), DELIVERABLE_SOURCES);
    if (!(DELIVERABLE_SOURCES as readonly string[]).includes(source)) {
      problems.push(`\`Source\` ${isEmptyCell(source) ? 'is empty' : `\`${source}\``} — none of ${listOf(DELIVERABLE_SOURCES.map((known) => `\`${known}\``))}`);
    }
    if (isEmptyCell(cell(row, 'Schema'))) {
      if (source === 'structured_output') {
        problems.push('`structured_output` with an empty `Schema`');
      } else if (/\bjson\b/i.test(cell(row, 'Format'))) {
        problems.push('a JSON format with an empty `Schema`');
      }
    }
    if (problems.length > 0) {
      report('deliverable', 'Deliverables and schemas', `${isEmptyCell(path) ? 'a row without path' : `\`${path}\``}: ${problems.join('; ')}`);
    }
    if (!isEmptyCell(path) && taskSection !== null && !named.has(path) && !tasks.some((task) => task.deliverable.includes(path))) {
      warn('deliverable-orphan', 'Deliverables and schemas', `\`${path}\`: no task names it in its \`Deliverable\` cell`);
    }
  }
  // A table of paths that are no virtual paths — the fields of a JSON file — is the author's own.
  findings.push(...strayFindings('deliverable', ARTEFACTS.design, 'Deliverables and schemas', lines('Deliverables and schemas'), 'Path', ['Source', 'Format', 'Schema'], listed, /^\//));
  // What a task says it delivers is a deliverable too, listed in the table or not: the mount point rule holds for it.
  for (const task of tasks) {
    for (const path of task.paths) {
      const reason = listed.has(path) ? null : refusal(path);
      if (reason !== null) {
        report('deliverable', 'Tasks and DAG', `${task.label}: deliverable \`${path}\` — ${reason}`);
      }
      if (deliverables !== null && !listed.has(path)) {
        warn('deliverable-orphan', 'Tasks and DAG', `${task.label} names a deliverable the table does not list: \`${path}\``);
      }
    }
  }

  const stateful = STATEFUL_INVARIANTS.filter((id) => context.ids.invariants.some((invariant) => invariant.id === id));
  const resume = present('Resume and incremental strategy');
  if (resume !== null && stateful.length > 0 && saysNone(ownLines(resume))) {
    report('resume', 'Resume and incremental strategy', `\`ACCEPTANCE.md\` declares ${listOf(stateful.map((id) => `\`${id}\``))} and the section says there is none: Orkeon does not resume a run, the team carries it`);
  }

  const risks = present('Risks');
  if (risks !== null) {
    const rows = rowsWith(risks.lines, 'Risk', ['Mitigation']);
    if (rows.length === 0) {
      report('risks', 'Risks', 'no risk: list the known pitfalls that apply, each with its mitigation');
    }
    rows.forEach((row, index) => {
      const missing = ['Risk', 'Mitigation'].filter((header) => isEmptyCell(cell(row, header))).map((header) => `\`${header}\``);
      if (missing.length > 0) {
        report('risks', 'Risks', `row ${String(index + 1)}: empty ${listOf(missing)}`);
      }
    });
  }
  return findings;
}

/**
 * A cycle among the dependencies, as the ids on its way back to the first, or null. Walks the
 * tasks with a stack of its own: a chain of thousands of tasks is a long design, not a deep call.
 */
function dependencyCycle(tasks: readonly { id: string; dependencies: readonly string[] }[]): string[] | null {
  const byId = new Map(tasks.filter((task) => task.id !== '').map((task) => [task.id, task.dependencies.filter((dependency) => dependency !== '')]));
  const done = new Set<string>();
  for (const start of byId.keys()) {
    if (done.has(start)) {
      continue;
    }
    // The path from `start`, each task with the next of its dependencies to visit.
    const path: { id: string; next: number }[] = [{ id: start, next: 0 }];
    const onPath = new Set([start]);
    while (path.length > 0) {
      const top = path[path.length - 1] as { id: string; next: number };
      const dependency = (byId.get(top.id) as readonly string[])[top.next];
      top.next += 1;
      if (dependency === undefined) {
        done.add(top.id);
        onPath.delete(top.id);
        path.pop();
      } else if (onPath.has(dependency)) {
        const ids = path.map((step) => step.id);
        return [...ids.slice(ids.indexOf(dependency)), dependency];
      } else if (byId.has(dependency) && !done.has(dependency)) {
        path.push({ id: dependency, next: 0 });
        onPath.add(dependency);
      }
    }
  }
  return null;
}
