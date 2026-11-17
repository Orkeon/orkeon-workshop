import { decisionOf, priceOf, profileNamed, usdOf, type Price } from '../../domain/bench-config.js';
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

/** The level an estimate prices: L4 (`e2e_remote`, the default) or L3 (`e2e_local`) when its run is remote. */
export type EstimatedLevel = 'e2e_local' | 'e2e_remote';

export interface EstimateOptions {
  /** `e2e_remote` (L4) by default. */
  readonly level?: EstimatedLevel;
  /** Calls of `orkeon-bench decide --allow-remote` to add to the submission (D98, D104). */
  readonly decideCalls?: number;
}

export interface EstimateResult {
  readonly level: EstimatedLevel;
  /**
   * Whether what is priced is paid, so needs the user's `/team-approve remote <usd> <slug>`: the
   * level's LLM or decision model is remote, or `decideCalls` is above 0. False: usd is 0 and the
   * run gate lets the run through without an approval.
   */
  readonly remote: boolean;
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
  /** The `decide --allow-remote` calls submitted with the run, their price per call and what they add to `usd`, × the factor. */
  readonly decideCalls: number;
  readonly decidePricePerCall: number | null;
  readonly decideUsd: number;
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
 * `orkeon-bench estimate <team> [--level L3|L4] [--decide <n>] [--profile <name>]` (D91, D104): what
 * a paid run would cost, before anyone approves it — the line `/team-run` submits as `next_action:
 * /team-approve remote <usd> <slug>`, which the `/team-approve` hook refuses without.
 *
 * L4 (the default): the L4 scenarios on the remote profile, at the profile's `price`, times `repeat`,
 * times a safety factor. L4 runs "the same scenarios" as L3 on a remote profile
 * (`references/testing/test-levels.md` § 6), and the report pairs them by id under `## Local and
 * remote`: each L4 scenario is priced from the local runs of the `e2e_local` scenario of the same
 * id. One without such a run is not priced at all — the estimate is refused and names it, rather
 * than guess from the others.
 *
 * L3: nothing when the level's LLM and decision model are local (`remote: false`). A remote LLM is
 * priced from the earlier L3 runs of each scenario, at the profile's `price`; a remote decision model
 * at `price_per_call` of the level's decision block, the calls counted in those runs — else in the
 * latest L2 runs, a crew making as many decision calls whatever answers its agents. A decision model
 * no block declares (a provider active in the machine's settings) has no price: refused, named.
 *
 * `--decide <n>`: `n` calls of `orkeon-bench decide --allow-remote`, at `price_per_call` of the
 * top-level decision block. The cap is the one `bench.config.json` states, as `attempt approve`
 * reads it: no default stands in for it.
 */
export class EstimateRemote {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly resolveProfile: ResolveProfile,
  ) {}

  async execute(team: TeamRef, profileOption: string | undefined, options: EstimateOptions = {}): Promise<EstimateResult> {
    const level = options.level ?? 'e2e_remote';
    const base = level === 'e2e_remote' ? await this.remoteLevel(team, profileOption) : await this.localLevel(team, profileOption);
    const decideCalls = options.decideCalls ?? 0;
    if (decideCalls <= 0) {
      return base;
    }
    const { config } = await readStatedRemoteCap(this.fileSystem, team);
    const pricePerCall = config.decision?.price_per_call;
    if (pricePerCall === undefined) {
      throw new ApplicationError(
        'invalid-input',
        `${String(decideCalls)} call(s) of orkeon-bench decide --allow-remote have no price: state price_per_call in the top-level decision block of bench.config.json (through /team-decision), or ask decide without --allow-remote`,
      );
    }
    const decideUsd = round(decideCalls * pricePerCall * ESTIMATE_SAFETY_FACTOR);
    const usd = round(base.usd + decideUsd);
    return { ...base, remote: true, decideCalls, decidePricePerCall: pricePerCall, decideUsd, usd, withinCap: usd <= base.capUsd };
  }

  private async remoteLevel(team: TeamRef, profileOption: string | undefined): Promise<EstimateResult> {
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
    const remote = await this.scenarioIds(team, 'e2e_remote');
    if (remote.length === 0) {
      throw new ApplicationError('invalid-input', `no L4 scenario under ${joinPath(teamPaths(team).tests, 'e2e')}: nothing to run remotely, nothing to price`);
    }
    const localProfile = config.levels.e2e_local?.profile ?? MACHINE_PROFILE_NAME;
    const runs = await this.archivedRuns(team, 'e2e_local', localProfile);
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
    const totalCalls = bases.reduce((total, { basis }) => total + meanCalls(basis), 0);
    const decisionPrice = await this.decisionPrice(team, profileName, totalCalls);
    return this.priced({
      level: 'e2e_remote',
      remote: await this.isRemote(team, profileName, 'e2e_remote'),
      profile: profileName,
      model: 'model' in profile ? profile.model : '',
      localProfile,
      bases: bases.map(({ id, basis }) => ({ id, basis, calls: meanCalls(basis) })),
      price,
      decisionPrice,
      repeat: config.levels.e2e_remote?.repeat ?? 1,
      capUsd,
      warnings: [],
    });
  }

  private async localLevel(team: TeamRef, profileOption: string | undefined): Promise<EstimateResult> {
    const { config, capUsd } = await readStatedRemoteCap(this.fileSystem, team);
    const profileName = profileOption ?? config.levels.e2e_local?.profile ?? MACHINE_PROFILE_NAME;
    const profile = profileNamed(config, profileName);
    const model = 'model' in profile ? profile.model : '';
    const repeat = config.levels.e2e_local?.repeat ?? 1;
    const ids = await this.scenarioIds(team, 'e2e_local');
    if (ids.length === 0) {
      throw new ApplicationError('invalid-input', `no L3 scenario under ${joinPath(teamPaths(team).tests, 'e2e')}: nothing to run, nothing to price`);
    }
    const resolution = await this.resolveProfile.execute(team, profileName, { level: 'e2e_local' });
    // The decision model folds into the machine's target (reason `decision-model`): it is priced per call below.
    const llmTargets = resolution.providers.length > 0 ? resolution.providers : [resolution.target];
    const llmTarget = llmTargets.find((target) => target.remote && target.reason !== 'decision-model');
    const llmRemote = llmTarget !== undefined;
    const decisionTarget = resolution.decisionModel?.target;
    const decisionRemote = decisionTarget?.remote === true;
    const free = { level: 'e2e_local' as const, profile: profileName, model, localProfile: profileName, price: null, decisionPrice: null, repeat, capUsd };
    if (!llmRemote && !decisionRemote) {
      return this.priced({ ...free, remote: false, bases: [], warnings: [] });
    }
    let price: Price | null = null;
    if (llmRemote) {
      price = priceOf(config, profileName);
      if (price === null) {
        throw new ApplicationError(
          'invalid-input',
          `an L3 run on the profile "${profileName}" is remote (${llmTarget?.baseUrlHost ?? llmTarget?.reason ?? 'remote'}) and the profile has no price in bench.config.json: L3 is the local level (test-levels.md § 5) — make the profile local, or run that model at L4 through a named profile with a price`,
        );
      }
    }
    let decisionPrice: number | null = null;
    if (decisionRemote) {
      const block = decisionOf(config, 'e2e_local');
      if (block?.price_per_call === undefined) {
        const where = resolution.decisionModel?.effective.configuredBy.join(', ') ?? 'the machine';
        throw new ApplicationError(
          'invalid-input',
          block === null || block === undefined
            ? `the decision model of an L3 run is remote (${decisionTarget?.baseUrlHost ?? 'no local base URL'}, configured by ${where}) and bench.config.json declares no decision block for it, so nothing prices its calls: unset what configures it, or declare it through /team-decision — a decision block with price_per_call`
            : `the decision model of an L3 run is remote (${decisionTarget?.baseUrlHost ?? 'no local base URL'}) with no price per call: state price_per_call in the decision block of e2e_local (or the top level) of bench.config.json, through /team-decision`,
        );
      }
      decisionPrice = block.price_per_call;
    }
    const runs = await this.archivedRuns(team, 'e2e_local', null);
    const warnings: string[] = [];
    if (llmRemote) {
      const unpriced = ids.filter((id) => !runs.some((run) => run.scenario === id));
      if (unpriced.length > 0) {
        throw new ApplicationError(
          'invalid-input',
          `no completed L3 run to price ${unpriced.join(', ')} from: an L3 run on a remote LLM is priced from the earlier L3 runs of the same scenario — run it first on a local profile`,
        );
      }
    }
    let fallbackCalls: number | null = null;
    if (decisionRemote && ids.some((id) => !runs.some((run) => run.scenario === id))) {
      const component = latestAttemptRuns(await this.archivedRuns(team, 'component', null, false));
      if (component.length === 0) {
        throw new ApplicationError('invalid-input', `no completed run to count the decision calls of an L3 run from: run orkeon-bench run ${team.slug} --level L2 first (a stub run calls no paid model)`);
      }
      fallbackCalls = meanCalls(component);
      warnings.push(`the decision calls of ${ids.filter((id) => !runs.some((run) => run.scenario === id)).join(', ')} are counted from the latest L2 runs (${String(round(fallbackCalls))} per run): no L3 run of the same id is archived`);
    }
    const bases = ids.map((id) => {
      const basis = latestAttemptRuns(runs.filter((run) => run.scenario === id));
      return { id, basis, calls: basis.length > 0 ? meanCalls(basis) : (fallbackCalls ?? 0) };
    });
    return this.priced({ ...free, remote: true, price, decisionPrice, bases, warnings });
  }

  /** The estimate of scenarios priced from their bases: tokens at `price` (none: free), calls at `decisionPrice`. */
  private priced(input: {
    level: EstimatedLevel;
    remote: boolean;
    profile: string;
    model: string;
    localProfile: string;
    bases: readonly { id: string; basis: readonly LocalRun[]; calls: number }[];
    price: Price | null;
    decisionPrice: number | null;
    repeat: number;
    capUsd: number;
    warnings: readonly string[];
  }): EstimateResult {
    const { bases, price, decisionPrice, repeat } = input;
    const tokenUsd = (tokensIn: number, tokensOut: number): number => (price === null ? 0 : usdOf(tokensIn, tokensOut, price));
    const scenarios = bases.map(({ id, basis, calls }): EstimatedScenario => {
      const count = Math.max(basis.length, 1);
      const tokensIn = Math.round(basis.reduce((total, run) => total + run.tokensIn, 0) / count);
      const tokensOut = Math.round(basis.reduce((total, run) => total + run.tokensOut, 0) / count);
      const last = basis[basis.length - 1];
      return {
        id,
        run: last?.run ?? '',
        runs: basis.map((run) => run.run),
        attempt: last?.attempt ?? null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        decision_calls: round(calls),
        usd: round(tokenUsd(tokensIn, tokensOut) + calls * (decisionPrice ?? 0)),
      };
    });
    const totalCalls = bases.reduce((total, { calls }) => total + calls, 0);
    const decisionUsd = round(totalCalls * (decisionPrice ?? 0) * repeat * ESTIMATE_SAFETY_FACTOR);
    const usd = round((scenarios.reduce((total, scenario) => total + tokenUsd(scenario.tokens_in, scenario.tokens_out), 0) + totalCalls * (decisionPrice ?? 0)) * repeat * ESTIMATE_SAFETY_FACTOR);
    return {
      level: input.level,
      remote: input.remote,
      profile: input.profile,
      model: input.model,
      localProfile: input.localProfile,
      scenarios,
      repeat,
      factor: ESTIMATE_SAFETY_FACTOR,
      decisionCalls: round(totalCalls),
      decisionPricePerCall: decisionPrice,
      decisionUsd,
      decideCalls: 0,
      decidePricePerCall: null,
      decideUsd: 0,
      usd,
      capUsd: input.capUsd,
      withinCap: usd <= input.capUsd,
      warnings: input.warnings,
    };
  }

  /** Whether a run of `level` on `profileName` is remote, its LLM or its decision model; a profile that cannot be resolved counts as remote. */
  private async isRemote(team: TeamRef, profileName: string, level: EstimatedLevel): Promise<boolean> {
    try {
      const resolution = await this.resolveProfile.execute(team, profileName, { level });
      return resolution.target.remote || resolution.decisionModel?.target.remote === true;
    } catch {
      return true;
    }
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

  /** The ids of the scenarios of `level` under `tests/<slug>/e2e/`; one that does not parse is the business of the static check. */
  private async scenarioIds(team: TeamRef, level: EstimatedLevel): Promise<string[]> {
    const ids: string[] = [];
    for (const file of await scenarioFiles(this.fileSystem, team, 'e2e')) {
      try {
        const scenario = parseScenario(await readJsonFile(this.fileSystem, joinPath(teamPaths(team).tests, file)), file);
        if (scenario.level === level) {
          ids.push(scenario.id);
        }
      } catch {
        continue;
      }
    }
    return ids;
  }

  /**
   * The archived runs of `level` on `target` (any, when null) that completed — passed or failed,
   * not interrupted —, oldest first; with `withTokens`, those with tokens counted only. A run that
   * stopped before its first model call (tokens at 0) or never wrote its counts says nothing of what
   * a run costs, and would pull the mean down; a stub run's tokens are the stub's, its decision calls
   * the crew's.
   */
  private async archivedRuns(team: TeamRef, level: string, target: string | null, withTokens = true): Promise<LocalRun[]> {
    const folder = teamPaths(team).runs;
    const runs: LocalRun[] = [];
    for (const name of await this.fileSystem.list(folder)) {
      const manifestFile = joinPath(folder, name, 'manifest.json');
      if (!ID_PATTERNS.RUN.test(name) || !(await this.fileSystem.exists(manifestFile))) {
        continue;
      }
      const manifest = (await readJsonFile(this.fileSystem, manifestFile).catch(() => null)) as Record<string, unknown> | null;
      if (manifest === null || manifest.level !== level || (target !== null && manifest.target !== target) || (manifest.status !== 'pass' && manifest.status !== 'fail') || typeof manifest.scenario !== 'string') {
        continue;
      }
      const tokensIn = numberOr0(manifest.tokens_in);
      const tokensOut = numberOr0(manifest.tokens_out);
      if (withTokens && tokensIn + tokensOut <= 0) {
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

function meanCalls(basis: readonly LocalRun[]): number {
  return basis.length === 0 ? 0 : basis.reduce((total, run) => total + run.decisionCalls, 0) / basis.length;
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
