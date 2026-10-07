import { z } from 'zod';

import { DomainError } from './errors.js';
import { ID_PATTERNS, attemptIdSchema, formatAttemptId, runIdSchema, type AttemptId, type RunId } from './ids.js';
import { parseWith } from './schema.js';
import { VERDICTS, type Verdict } from './status.js';

/** The folder of the design snapshot inside an attempt, as the manifest names it. */
export const DESIGN_SNAPSHOT_FOLDER = 'design-snapshot/';
/** The approval marker of a remote run, in the open attempt; the run gate reads it (D19, D36). */
export const REMOTE_APPROVAL_FILE = 'remote-approval.json';
export const ATTEMPT_MANIFEST_FILE = 'manifest.json';
/** Where `attempt close` keeps a manifest it could not read, beside the one that replaces it. */
export const BROKEN_MANIFEST_FILE = 'manifest.broken.json';
/** Who opens an attempt when nothing says: a person at the shell, not a skill. */
export const DEFAULT_OPENED_BY = 'manual';
/** What the manifest records until `orkeon --version` has answered, and when it gives no version. */
export const UNKNOWN_ORKEON_VERSION = 'unknown';

/**
 * The user's approval of a paid run (plan § 5.7): who, when, the amount approved and the cap of
 * the team's bench configuration. `run-gate.sh` accepts it when `by` is non-empty and both amounts
 * are JSON numbers of 0 or more with `estimated_usd <= cap_usd`.
 */
export const remoteApprovalSchema = z.looseObject({
  by: z.string().min(1),
  at: z.string().min(1),
  estimated_usd: z.number().nonnegative(),
  cap_usd: z.number().nonnegative(),
});
export type RemoteApproval = z.infer<typeof remoteApprovalSchema>;

/**
 * `workbooks/<slug>/attempts/ATT-nnnn/manifest.json` (plan § 5.7). `closed_at` is `null` while the
 * attempt is open: the hooks read that key and nothing else. Keys the bench does not know are kept.
 */
export const attemptManifestSchema = z.looseObject({
  attempt: attemptIdSchema,
  opened_at: z.string().min(1),
  closed_at: z.string().min(1).nullable(),
  opened_by: z.string().min(1),
  design_snapshot: z.string().min(1).nullable(),
  orkeon_version: z.string(),
  runs: z.array(runIdSchema).default([]),
  remote_approval: remoteApprovalSchema.nullable().default(null),
  verdict: z.enum(VERDICTS).nullable().default(null),
});
export type AttemptManifest = z.infer<typeof attemptManifestSchema>;

export function parseAttemptManifest(input: unknown): AttemptManifest {
  return parseWith(attemptManifestSchema, input, 'attempt manifest');
}

export function isAttemptOpen(manifest: Pick<AttemptManifest, 'closed_at'>): boolean {
  return manifest.closed_at === null;
}

/** The id after the highest `ATT-nnnn` among `names` (the entries of `attempts/`); `ATT-0001` first. */
export function nextAttemptId(names: readonly string[]): AttemptId {
  const ordinals = names.filter((name) => ID_PATTERNS.ATT.test(name)).map((name) => Number(name.slice(4)));
  return formatAttemptId(Math.max(0, ...ordinals) + 1);
}

export interface OpenAttemptInput {
  readonly id: AttemptId;
  readonly at: Date;
  /** The skill that opens the attempt (`team-build`, `team-decision`), or who did it by hand. */
  readonly openedBy: string;
}

/**
 * The manifest an attempt is born with — written before anything else, so that the folder never
 * stands without one: the design snapshot and the Orkeon version are recorded once they are known.
 */
export function openAttempt(input: OpenAttemptInput): AttemptManifest {
  return parseAttemptManifest({
    attempt: input.id,
    opened_at: input.at.toISOString(),
    closed_at: null,
    opened_by: input.openedBy,
    design_snapshot: null,
    orkeon_version: UNKNOWN_ORKEON_VERSION,
    runs: [],
    remote_approval: null,
    verdict: null,
  });
}

/** `--by`: one short line — a skill name, a person — that a manifest and a journal line can carry. */
const OPENED_BY = /^[A-Za-z0-9][A-Za-z0-9 ._/@-]{0,63}$/;

export function parseOpenedBy(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return DEFAULT_OPENED_BY;
  }
  if (!OPENED_BY.test(trimmed)) {
    throw new DomainError(`--by names who opens the attempt in one short line (a skill such as team-build): letters, digits, spaces and . _ / @ - only, 64 characters at most`);
  }
  return trimmed;
}

/**
 * The manifest of an attempt folder that never had one — an `attempt open` interrupted between the
 * folder and the manifest, or a folder made by hand — or whose manifest could not be read: closed
 * at once, so that the hooks stop counting it as open and the next attempt can be opened.
 */
export function abandonedAttempt(id: AttemptId, at: Date, brokenManifest: string | null = null): AttemptManifest {
  return parseAttemptManifest({
    attempt: id,
    opened_at: at.toISOString(),
    closed_at: at.toISOString(),
    opened_by: 'unknown',
    design_snapshot: null,
    orkeon_version: UNKNOWN_ORKEON_VERSION,
    runs: [],
    remote_approval: null,
    verdict: null,
    note:
      brokenManifest === null
        ? 'closed without ever having had a manifest: left by an interrupted attempt open, or made by hand'
        : `closed as abandoned: its manifest could not be read, and is kept as ${brokenManifest}`,
  });
}

/** A closed attempt is immutable: every change goes through here and is refused once it is closed. */
function ensureOpen(manifest: AttemptManifest, change: string): void {
  if (!isAttemptOpen(manifest)) {
    throw new DomainError(`${manifest.attempt} was closed at ${String(manifest.closed_at)}: a closed attempt is immutable, cannot ${change}`);
  }
}

export function closeAttempt(manifest: AttemptManifest, at: Date, verdict: Verdict | null = null): AttemptManifest {
  ensureOpen(manifest, 'close it again');
  return { ...manifest, closed_at: at.toISOString(), verdict: verdict ?? manifest.verdict };
}

export function withRuns(manifest: AttemptManifest, runs: readonly RunId[]): AttemptManifest {
  ensureOpen(manifest, 'add a run');
  return { ...manifest, runs: [...manifest.runs, ...runs.filter((run) => !manifest.runs.includes(run))] };
}

export function withDesignSnapshot(manifest: AttemptManifest): AttemptManifest {
  ensureOpen(manifest, 'take its design snapshot');
  return { ...manifest, design_snapshot: DESIGN_SNAPSHOT_FOLDER };
}

export function withOrkeonVersion(manifest: AttemptManifest, version: string): AttemptManifest {
  ensureOpen(manifest, 'record the Orkeon version');
  return { ...manifest, orkeon_version: version };
}

export function withRemoteApproval(manifest: AttemptManifest, approval: RemoteApproval): AttemptManifest {
  ensureOpen(manifest, 'record an approval');
  return { ...manifest, remote_approval: approval };
}

/** A plain decimal amount of USD, as the user types it after `/team-approve remote`: `2`, `1.50`, `0`. */
const USD_AMOUNT = /^\d+(?:\.\d+)?$/;

export function parseUsdAmount(text: string): number {
  const trimmed = text.trim();
  if (!USD_AMOUNT.test(trimmed)) {
    throw new DomainError(`"${text}" is not an amount of USD: expected a number of 0 or more, such as 1.50`);
  }
  return Number(trimmed);
}

export interface ApproveRemoteInput {
  readonly amountUsd: number;
  /** `budget.remote_usd_max` of the team's bench configuration. */
  readonly capUsd: number;
  readonly at: Date;
  /** What the user typed, kept beside the approval. */
  readonly source: string;
}

/** The approval of `amountUsd` under `capUsd`; an amount above the cap approves nothing. */
export function approveRemote(input: ApproveRemoteInput): RemoteApproval {
  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
    throw new DomainError(`${String(input.amountUsd)} is not an amount of USD: expected a number of 0 or more`);
  }
  if (input.amountUsd > input.capUsd) {
    throw new DomainError(
      `${String(input.amountUsd)} USD is above the cap of ${String(input.capUsd)} USD (budget.remote_usd_max of bench.config.json): raise the cap with a decision first, or approve a lower amount`,
    );
  }
  return { by: 'user', at: input.at.toISOString(), estimated_usd: input.amountUsd, cap_usd: input.capUsd, source: input.source };
}
