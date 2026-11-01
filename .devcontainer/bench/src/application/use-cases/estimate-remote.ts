import { decisionOf, priceOf, profileNamed, usdOf } from '../../domain/bench-config.js';
import { decisionCalls } from '../../domain/decisions.js';
import { ID_PATTERNS } from '../../domain/ids.js';
import { joinPath } from '../../domain/paths.js';
import { MACHINE_PROFILE_NAME } from '../../domain/profile.js';
import { parseRunEvents } from '../../domain/run-events.js';
import { parseScenario } from '../../domain/scenario.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import { scenarioFiles } from '../runs/static-level.js';
import { readJsonFile } from './read-json-file.js';
import { readStatedRemoteCap } from './read-remote-cap.js';
import type { ResolveProfile } from './resolve-profile.js';

/** What an estimate adds to the tokens of the local runs: a remote model is rarely as terse (D91). */
export const ESTIMATE_SAFETY_FACTOR = 1.3;

export interface EstimatedScenario {
  readonly id: string;
  /** The last local run it is priced from: the L3 scenario of the same id, on the local profile. */
  readonly run: string;
  /** Every local run its tokens are the mean of: the completed ones of the latest attempt that has one. */
  readonly runs: readonly string[];
  /** The attempt those runs belong to; null when their manifests do not say. */
  readonly attempt: string | null;
  readonly tokens_in: number;
  readonly tokens_out: number;
  /** The decision calls of those runs, as a mean (`decisionCalls`): decision tasks and `system_one_decide` calls (D96). */
  readonly decision_calls: number;
  /** One run of it on the remote profile, decision calls included, before `repeat` and the safety factor. */
  readonly usd: number;
}

export interface EstimateResult {
  readonly profile: string;
  readonly model: string;
  readonly localProfile: string;
  readonly scenarios: readonly EstimatedScenario[];
  readonly repeat: number;
  readonly factor: number;
  /** The decision calls of one pass over the scenarios (D96), and what one is priced at; null without a price. */
  readonly decisionCalls: number;
  readonly decisionPricePerCall: number | null;
  /** What the decision calls add to `usd`, × repeat × factor. */
  readonly decisionUsd: number;
  readonly usd: number;
  readonly capUsd: number;
  readonly withinCap: boolean;
  readonly warnings: readonly string[];
}

interface LocalRun {
  readonly run: string;
  readonly scenario: string;
  readonly attempt: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly decisionCalls: number;
}

/**
 * `orkeon-bench estimate <team> [--profile <name>]` (D91): what the L4 scenarios would cost on the
 * remote profile, at the profile's `price`, times `repeat`, times a safety factor — before anyone
 * approves a paid run. L4 runs "the same scenarios" as L3 on a remote profile
 * (`references/testing/test-levels.md` § 6), and the report pairs them by id under `## Local and
 * remote`: each L4 scenario is priced from the local runs of the `e2e_local` scenario of the same
 * id. One without such a run is not priced at all — the estimate is refused and names it, rather
 * than guess from the others. The cap is the one `bench.config.json` states, as `attempt approve`
 * reads it: no default stands in for it.
 */
export class EstimateRemote {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly resolveProfile: ResolveProfile,
  ) {}

  async execute(team: TeamRef, profileOption: string | undefined): Promise<EstimateResult> {
    const { config, capUsd } = await readStatedRemoteCap(this.fileSystem, team);
    const profileName = profileOption ?? config.levels.e2e_remote?.profile;
    if (profileName === undefined) {
      throw new ApplicationError('invalid-input', 'no remote profile to price: name one with --profile, or set levels.e2e_remote.profile in bench.config.json');
    }
    const profile = profileNamed(config, profileName);
    const price = priceOf(config, profileName);
    if (price === null) {
      throw new ApplicationError('invalid-input', `profile "${profileName}" has no price in bench.config.json (profiles.${profileName}.price: input_per_million, output_per_million): nothing to price a run with`);
    }
    const remote = await this.remoteScenarios(team);
    if (remote.length === 0) {
      throw new ApplicationError('invalid-input', `no L4 scenario under ${joinPath(teamPaths(team).tests, 'e2e')}: nothing to run remotely, nothing to price`);
    }
    const localProfile = config.levels.e2e_local?.profile ?? MACHINE_PROFILE_NAME;
    const runs = await this.localRuns(team, localProfile);
    if (runs.length === 0) {
      throw new ApplicationError('invalid-input', `no local e2e run archived yet: run orkeon-bench run ${team.slug} --level L3 first`);
    }
    const unpriced = remote.filter((id) => !runs.some((run) => run.scenario === id));
    if (unpriced.length > 0) {
      throw new ApplicationError(
        'invalid-input',
        `no completed local run on ${localProfile} to price ${unpriced.join(', ')} from: an L4 scenario is priced from the runs of the L3 scenario of the same id — write one under e2e/ (level e2e_local) and run orkeon-bench run ${team.slug} --level L3`,
      );
    }
    const bases = remote.map((id) => ({ id, basis: latestAttemptRuns(runs.filter((run) => run.scenario === id)) }));
    const callsOf = (basis: readonly LocalRun[]): number => basis.reduce((total, run) => total + run.decisionCalls, 0) / basis.length;
    const totalCalls = bases.reduce((total, { basis }) => total + callsOf(basis), 0);
    const decisionPrice = await this.decisionPrice(team, profileName, totalCalls);
    const scenarios = bases.map(({ id, basis }): EstimatedScenario => {
      const tokensIn = Math.round(basis.reduce((total, run) => total + run.tokensIn, 0) / basis.length);
      const tokensOut = Math.round(basis.reduce((total, run) => total + run.tokensOut, 0) / basis.length);
      const calls = round(callsOf(basis));
      const last = basis[basis.length - 1] as LocalRun;
      return {
        id,
        run: last.run,
        runs: basis.map((run) => run.run),
        attempt: last.attempt,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        decision_calls: calls,
        usd: round(usdOf(tokensIn, tokensOut, price) + calls * (decisionPrice ?? 0)),
      };
    });
    const repeat = config.levels.e2e_remote?.repeat ?? 1;
    const decisionUsd = round(totalCalls * (decisionPrice ?? 0) * repeat * ESTIMATE_SAFETY_FACTOR);
    const usd = round((scenarios.reduce((total, scenario) => total + usdOf(scenario.tokens_in, scenario.tokens_out, price), 0) + totalCalls * (decisionPrice ?? 0)) * repeat * ESTIMATE_SAFETY_FACTOR);
    return {
      profile: profileName,
      model: 'model' in profile ? profile.model : '',
      localProfile,
      scenarios,
      repeat,
      factor: ESTIMATE_SAFETY_FACTOR,
      decisionCalls: round(totalCalls),
      decisionPricePerCall: decisionPrice,
      decisionUsd,
      usd,
      capUsd,
      withinCap: usd <= capUsd,
      warnings: [],
    };
  }

  /**
   * D96: what one decision call of an L4 run costs — `price_per_call` of the decision block of
   * `e2e_remote` (`decisionOf`). Without one, a run whose decision model is remote (the block's
   * provider, or the machine's, as `profile --level e2e_remote` resolves it) is not priced: the
   * estimate is refused rather than count its decision calls as free. A local decision model, or
   * none, costs nothing per call.
   */
  private async decisionPrice(team: TeamRef, profileName: string, calls: number): Promise<number | null> {
    const { config } = await readStatedRemoteCap(this.fileSystem, team);
    const block = decisionOf(config, 'e2e_remote');
    if (block?.price_per_call !== undefined) {
      return block.price_per_call;
    }
    if (calls <= 0) {
      return null;
    }
    const resolution = await this.resolveProfile.execute(team, profileName, { level: 'e2e_remote' });
    if (resolution.decisionModel?.target.remote === true) {
      const where = block === null || block === undefined ? 'a decision block under levels.e2e_remote (or the top level) of bench.config.json with price_per_call' : 'price_per_call in the decision block of e2e_remote in bench.config.json';
      throw new ApplicationError(
        'invalid-input',
        `the local runs make ${String(round(calls))} decision call(s) per pass and the decision model of an L4 run is remote (${resolution.decisionModel.target.baseUrlHost ?? 'no local base URL'}), with no price per call: state ${where}`,
      );
    }
    return null;
  }

  /** The ids of the L4 scenarios of `tests/<slug>/e2e/`; one that does not parse is the business of the static check. */
  private async remoteScenarios(team: TeamRef): Promise<string[]> {
    const ids: string[] = [];
    for (const file of await scenarioFiles(this.fileSystem, team, 'e2e')) {
      try {
        const scenario = parseScenario(await readJsonFile(this.fileSystem, joinPath(teamPaths(team).tests, file)), file);
        if (scenario.level === 'e2e_remote') {
          ids.push(scenario.id);
        }
      } catch {
        continue;
      }
    }
    return ids;
  }

  /**
   * The archived L3 runs on the local profile that completed — passed or failed, not interrupted,
   * with tokens counted —, oldest first. A run that stopped before its first model call (tokens at
   * 0) or never wrote its counts says nothing of what a run costs, and would pull the mean down.
   */
  private async localRuns(team: TeamRef, localProfile: string): Promise<LocalRun[]> {
    const folder = teamPaths(team).runs;
    const runs: LocalRun[] = [];
    for (const name of await this.fileSystem.list(folder)) {
      const manifestFile = joinPath(folder, name, 'manifest.json');
      if (!ID_PATTERNS.RUN.test(name) || !(await this.fileSystem.exists(manifestFile))) {
        continue;
      }
      const manifest = (await readJsonFile(this.fileSystem, manifestFile).catch(() => null)) as Record<string, unknown> | null;
      if (manifest === null || manifest.level !== 'e2e_local' || manifest.target !== localProfile || (manifest.status !== 'pass' && manifest.status !== 'fail') || typeof manifest.scenario !== 'string') {
        continue;
      }
      const tokensIn = numberOr0(manifest.tokens_in);
      const tokensOut = numberOr0(manifest.tokens_out);
      if (tokensIn + tokensOut <= 0) {
        continue;
      }
      const attempt = typeof manifest.attempt === 'string' && ID_PATTERNS.ATT.test(manifest.attempt) ? manifest.attempt : null;
      runs.push({ run: name, scenario: manifest.scenario, attempt, tokensIn, tokensOut, decisionCalls: await this.decisionCallsOf(joinPath(folder, name), manifest) });
    }
    return runs;
  }

  /** The decision calls of an archived run: `decision_calls` of its manifest, else counted in its `events.jsonl`; 0 without either. */
  private async decisionCallsOf(runFolder: string, manifest: Record<string, unknown>): Promise<number> {
    if (typeof manifest.decision_calls === 'number' && Number.isFinite(manifest.decision_calls) && manifest.decision_calls >= 0) {
      return manifest.decision_calls;
    }
    const eventsFile = joinPath(runFolder, 'events.jsonl');
    if (!(await this.fileSystem.exists(eventsFile))) {
      return 0;
    }
    try {
      return decisionCalls(parseRunEvents(await this.fileSystem.readText(eventsFile)));
    } catch {
      return 0;
    }
  }
}

/**
 * The runs of one scenario a price is the mean of: those of the latest attempt among them — its
 * `repeat` iterations on the design that attempt measured —, not the whole history, whose older
 * crews may spend quite differently. Runs whose manifest names no attempt count as the oldest.
 */
function latestAttemptRuns(runs: readonly LocalRun[]): LocalRun[] {
  const latest = runs.reduce<string | null>((highest, run) => (run.attempt !== null && (highest === null || run.attempt > highest) ? run.attempt : highest), null);
  return runs.filter((run) => run.attempt === latest);
}

function numberOr0(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
