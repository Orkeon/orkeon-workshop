import { DomainError } from './errors.js';

/**
 * `orkeon-bench decide`: one typed question to the machine's decision model (D98), through a
 * throw-away crew of one decision task (Orkeon `main` at c727c06, `DecisionTaskRunner`): a `choice`
 * among described options, a `score` on ordered levels, or a `noul` yes-no statement. The answer is a
 * second signal for a skill, never its only path: with no decision model the command says so and answers nothing.
 */
export type DecideKind = 'choice' | 'score' | 'noul';

export interface DecideOption {
  readonly name: string;
  readonly description: string;
}

export interface DecideQuestion {
  readonly kind: DecideKind;
  /** The question, or for `noul` the statement whose truth is asked. */
  readonly text: string;
  /** `choice`: the options; `score`: the levels, lowest first (their description is their name). */
  readonly options: readonly DecideOption[];
  /** What the question is about (a file's content); empty when none. */
  readonly context: string;
}

/** The answer printed on stdout. */
export interface DecideAnswer {
  readonly kind: DecideKind;
  /** `choice`: the option; `score`: the level nearest the score; `noul`: `yes` or `no`. */
  readonly answer: string;
  readonly confidence: number | null;
  /** `choice` and `score`: by option or level name; `noul`: `{yes, no}`. */
  readonly probabilities: Readonly<Record<string, number>>;
  /** `score` only: the level position, 0 to n-1, fractional. */
  readonly score?: number;
  /** `noul` only: the probability of yes. */
  readonly probability?: number;
  readonly provider: string | null;
  readonly model: string | null;
  /** With `--context-file`: the bytes of the context the model read, and whether it was cut to `--max-context-bytes`. */
  readonly context?: DecideContext;
}

/** What `decide` says of the context it passed (`--context-file`, `--max-context-bytes`). */
export interface DecideContext {
  /** The UTF-8 bytes passed to the decision model. */
  readonly bytes: number;
  /** The UTF-8 bytes of the file. */
  readonly original_bytes: number;
  readonly truncated: boolean;
}

/**
 * The default of `--max-context-bytes`. Measured on the local Kev (kev-4b, 127.0.0.1:8009, a 10 GB card
 * it nearly fills, Orkeon c101cbd): a binary search on bytes gave the first `kev answered 500` at about
 * 4.7 KB of JSON, 5.7 KB of Markdown and 9 KB of English prose — the server runs out of GPU memory well
 * before the 65,536-token state it refuses with a 422 (Orkeon Code `docs/decision-models-local.md`, which
 * validates the small models up to 8,192 tokens). 4,096 bytes answered on every kind and content tried.
 */
export const DEFAULT_MAX_CONTEXT_BYTES = 4096;

/**
 * The context cut to `maxBytes` UTF-8 bytes on a line boundary: the lines that fit whole; when the first
 * line alone is longer, its characters that fit. The text is trimmed first, as the question reads it.
 */
export function capContext(text: string, maxBytes: number): { readonly text: string; readonly context: DecideContext } {
  const trimmed = text.trim();
  const encoder = new TextEncoder();
  const original = encoder.encode(trimmed).length;
  if (original <= maxBytes) {
    return { text: trimmed, context: { bytes: original, original_bytes: original, truncated: false } };
  }
  let kept = '';
  let size = 0;
  for (const line of trimmed.split('\n')) {
    const piece = kept === '' ? line : `\n${line}`;
    const pieceSize = encoder.encode(piece).length;
    if (size + pieceSize > maxBytes) {
      break;
    }
    kept += piece;
    size += pieceSize;
  }
  if (kept === '') {
    for (const character of trimmed) {
      const characterSize = encoder.encode(character).length;
      if (size + characterSize > maxBytes) {
        break;
      }
      kept += character;
      size += characterSize;
    }
  }
  const cut = kept.trimEnd();
  return { text: cut, context: { bytes: encoder.encode(cut).length, original_bytes: original, truncated: true } };
}

/** The question name of the throw-away crew's decision task. */
export const DECIDE_QUESTION = 'answer';
/** The task id of the throw-away crew. */
export const DECIDE_TASK = 'decide';

/**
 * What Orkeon says at entry when the decision circuit is off (no provider, `Orkeon:Decision:Enabled=false`)
 * on a decision task with neither a fallback nor an `otherwise` task (`DecisionPreflight`, D96): the crew
 * of `decide` has none on purpose, so that an answer can only come from a decision model.
 */
export const NO_DECISION_MODEL_MARK = 'has neither a fallback nor an otherwise task';

/** `name` or `name=description`, as `--option` takes it. */
export function parseOption(raw: string): DecideOption {
  const at = raw.indexOf('=');
  const name = (at < 0 ? raw : raw.slice(0, at)).trim();
  const description = (at < 0 ? '' : raw.slice(at + 1)).trim();
  return { name, description: description === '' ? name : description };
}

/** The question as the command line gives it, checked: Orkeon would refuse the crew otherwise. */
export function decideQuestion(kind: DecideKind, text: string, options: readonly DecideOption[], context: string): DecideQuestion {
  const issues: string[] = [];
  if (text.trim() === '') {
    issues.push('--question is empty');
  }
  if (kind === 'noul' && options.length > 0) {
    issues.push('a noul question takes no --option or --level');
  }
  if (kind !== 'noul') {
    const flag = kind === 'choice' ? '--option' : '--level';
    if (options.length < 2) {
      issues.push(`a ${kind} question needs two ${flag} at least`);
    }
    const names = options.map((option) => option.name);
    if (names.some((name) => name === '')) {
      issues.push(`an empty ${flag} name`);
    }
    const repeated = names.filter((name, index) => names.indexOf(name) !== index);
    if (repeated.length > 0) {
      issues.push(`${flag} given twice: ${[...new Set(repeated)].join(', ')}`);
    }
  }
  if (issues.length > 0) {
    throw new DomainError('invalid decide question', issues);
  }
  return { kind, text: text.trim(), options, context: context.trim() };
}

/** The question and its context as the decision model reads them: the task's state is empty. */
function promptOf(question: DecideQuestion): string {
  return question.context === '' ? question.text : `${question.text}\n\nContext:\n${question.context}`;
}

/**
 * The files of the throw-away crew, as objects to write as YAML: one agent (a crew declares one,
 * `CrewDefinitionValidator`; it never runs) and one decision task, without a fallback.
 */
export function decideCrew(question: DecideQuestion): { path: string; content: Record<string, unknown> }[] {
  const prompt = promptOf(question);
  const spec =
    question.kind === 'choice'
      ? { choice: Object.fromEntries(question.options.map((option) => [option.name, option.description])), instructions: prompt }
      : question.kind === 'score'
        ? { score: question.options.map((option) => option.name), instructions: prompt }
        : { noul: prompt };
  return [
    { path: 'crew/config.yaml', content: { name: 'orkeon-bench-decide', goal: 'Answer one typed question with the decision model', process: 'sequential' } },
    { path: 'crew/agents/holder.yaml', content: { role: 'Placeholder', goal: 'Never runs: a crew declares one agent' } },
    { path: `crew/tasks/${DECIDE_TASK}.yaml`, content: { description: 'Answer the question', expectedOutput: 'The answer', decision: { questions: { [DECIDE_QUESTION]: spec } } } },
  ];
}

export type DecideOutcome =
  | { readonly status: 'answered'; readonly answer: DecideAnswer }
  | { readonly status: 'no-model'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * The outcome of the run, from its event stream (`--events jsonl`) and its stderr: the decision task's
 * answer (`task.completed`, `isDecision`, `decision` a JSON string, Orkeon c727c06), the circuit off
 * (`NO_DECISION_MODEL_MARK`), or a failure with its reason — a provider down, a 5xx after its retries,
 * an answer of another kind, a start refused.
 */
export function decideOutcome(question: DecideQuestion, stdout: string, stderr: string): DecideOutcome {
  let provider: string | null = null;
  let model: string | null = null;
  let raw: unknown;
  let decided = false;
  const errors: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const event = parseObject(line);
    if (event === null) {
      continue;
    }
    if (event.kind === 'cost.updated' && event.operation === 'decision') {
      provider = typeof event.provider === 'string' ? event.provider : provider;
      model = typeof event.model === 'string' ? event.model : model;
    } else if (event.kind === 'task.completed' && event.isDecision === true) {
      decided = event.success === true && event.defaulted !== true;
      raw = event.decision;
    } else if (event.kind === 'error' && typeof event.message === 'string') {
      errors.push(event.message);
    }
  }
  const all = [...errors, ...stderr.split(/\r?\n/)];
  const off = all.find((text) => text.includes(NO_DECISION_MODEL_MARK));
  if (off !== undefined) {
    return { status: 'no-model', reason: 'the decision circuit is off (no provider, or Orkeon:Decision:Enabled=false)' };
  }
  const answers = typeof raw === 'string' ? parseObject(raw) : typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  const entry = answers?.[DECIDE_QUESTION];
  if (decided && typeof entry === 'object' && entry !== null) {
    const answer = toAnswer(question, entry as Record<string, unknown>, provider, model);
    if (answer !== null) {
      return { status: 'answered', answer };
    }
    return { status: 'failed', reason: `the decision model answered in a form the bench does not read: ${JSON.stringify(entry)}` };
  }
  const reason = errors.at(-1) ?? lastLine(stderr) ?? 'orkeon run gave no answer';
  return { status: 'failed', reason };
}

function toAnswer(question: DecideQuestion, entry: Record<string, unknown>, provider: string | null, model: string | null): DecideAnswer | null {
  const confidence = typeof entry.confidence === 'number' ? entry.confidence : null;
  const numbers = (value: unknown): Record<string, number> =>
    typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((pair): pair is [string, number] => typeof pair[1] === 'number')) : {};
  switch (question.kind) {
    case 'choice': {
      if (typeof entry.chosen !== 'string' || !question.options.some((option) => option.name === entry.chosen)) {
        return null;
      }
      return { kind: 'choice', answer: entry.chosen, confidence, probabilities: numbers(entry.probabilities), provider, model };
    }
    case 'score': {
      if (typeof entry.score !== 'number') {
        return null;
      }
      const levels = question.options.map((option) => option.name);
      // Orkeon keys the probabilities by level position ("0", "1", …): named here by their level.
      const byPosition = numbers(entry.probabilities);
      const probabilities = Object.fromEntries(levels.flatMap((level, index) => (byPosition[String(index)] === undefined ? [] : [[level, byPosition[String(index)] as number]])));
      const nearest = Math.min(levels.length - 1, Math.max(0, Math.round(entry.score)));
      return { kind: 'score', answer: levels[nearest] as string, confidence, probabilities, score: entry.score, provider, model };
    }
    case 'noul': {
      if (typeof entry.probability !== 'number') {
        return null;
      }
      const yes = entry.probability;
      return { kind: 'noul', answer: yes >= 0.5 ? 'yes' : 'no', confidence, probabilities: { yes, no: Number((1 - yes).toFixed(4)) }, probability: yes, provider, model };
    }
  }
}

function parseObject(text: string): Record<string, unknown> | null {
  if (text.trim() === '') {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function lastLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('WARNING:') && !/^\d{2}:\d{2}:\d{2}\.\d+ warn:/.test(line))
    .at(-1);
}
