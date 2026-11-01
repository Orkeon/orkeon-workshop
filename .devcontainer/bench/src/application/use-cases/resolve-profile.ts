import { DEFAULT_BENCH_CONFIG, decisionOf, decisionVariables, parseBenchConfig, profileNamed, type BenchConfig, type DecisionBlock, type Level } from '../../domain/bench-config.js';
import { LOCAL_HOSTS_VARIABLE, decisionModelTarget, decisionProvider, parseLocalHosts, profileTarget, providerTargets, type LlmTarget } from '../../domain/llm-target.js';
import { effectiveLlmSettings, overlayVariables, type EffectiveDecisionModel, type EffectiveLlmSettings } from '../../domain/orkeon-configuration.js';
import { LLM_VARIABLES, profileVariables, type Profile, type ProfileVariables } from '../../domain/profile.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';
import { readLlmLayers, type MachineLlm } from './read-llm-layers.js';

export interface ResolveProfileOptions {
  /** Port of the running stub server; without it the stub base URL stays a run-time value. */
  readonly stubPort?: number;
  /**
   * The level the run belongs to: its decision block applies (`decisionOf`, D96). Without one, the
   * top-level block of `bench.config.json`.
   */
  readonly level?: Level;
}

/** For `machine`: what a run of the team would read, and what wins. */
export interface MachineResolution extends MachineLlm {
  readonly effective: EffectiveLlmSettings;
}

/** The decision model of a run, and what configures it. */
export interface DecisionModelResolution {
  readonly target: LlmTarget;
  readonly effective: EffectiveDecisionModel;
}

export interface ProfileResolution extends ProfileVariables {
  readonly profile: Profile;
  readonly machine: MachineResolution | null;
  /** Where the LLM calls of a run with this profile go, and whether that is off the machine. */
  readonly target: LlmTarget;
  /**
   * For `machine`: the target of the default provider, then of each named profile of the run
   * (`Llm:Profiles:<id>`); `target` is the first remote one. Empty for the other profiles, which
   * are injected over all of them.
   */
  readonly providers: readonly LlmTarget[];
  /** The named profiles of the run's layers, which the stub and a named profile are injected over. */
  readonly orkeonProfiles: readonly string[];
  /**
   * For `machine` and a named profile, when the run's layers register a decision provider — TypeSafe,
   * Liquid or Kev — or refuse the start on the decision settings: where it goes (`decisionModelTarget`)
   * and what configures it. Null otherwise — and for the stub,
   * whose run keeps none.
   */
  readonly decisionModel: DecisionModelResolution | null;
  /**
   * D96: the decision block of `bench.config.json` that applies (`decisionOf`), and the variables the
   * bench lays over the run's environment for it — names and values without a key (`key_env` is a
   * variable name). Null and empty for the stub, and when no block applies.
   */
  readonly decisionBlock: DecisionBlock | null;
  readonly decisionVariables: Readonly<Record<string, string>>;
  /**
   * The settings file a launcher run of the team reads: its own (`settings/<slug>/appsettings.json`,
   * passed with `--settings`), else the one Orkeon resolves from the crew folder — the machine's,
   * usually; null when there is none.
   */
  readonly settingsFile: string | null;
  readonly warnings: readonly string[];
}

/**
 * `bench.config.json` + the machine's Orkeon configuration + the environment → the
 * `ORKEON_Llm__*` variables to inject for a profile, and the target they lead to. The key value is
 * read from the variable named by `keyEnv` and lives only in the returned map; callers print
 * names, never values.
 */
export class ResolveProfile {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly environment: Environment,
  ) {}

  async execute(team: TeamRef, name: string, options: ResolveProfileOptions = {}): Promise<ProfileResolution> {
    const config = await this.loadConfig(team);
    const profile = profileNamed(config, name, options.stubPort);
    const localHosts = parseLocalHosts(this.environment.get(LOCAL_HOSTS_VARIABLE));
    const warnings: string[] = [];
    // The decision block is laid over the run's environment, never over the stub's (D96): the layers
    // are read from that environment, so the target counts the provider it injects.
    const decisionBlock = profile.kind === 'stub' ? null : decisionOf(config, options.level);
    const injected = decisionBlock === null ? {} : decisionVariables(decisionBlock);
    const environment = decisionBlock === null ? this.environment : overlayEnvironment(this.environment, injected);
    let machine: MachineResolution | null = null;

    // What a launcher run of the team sees: the team's settings file when it exists (the launchers
    // pass it with --settings, D33), else the chain from the crew folder. The machine profile
    // injects nothing over it; the others are injected over its default and its named profiles.
    const paths = teamPaths(team);
    const teamSettings = (await this.fileSystem.exists(paths.settingsFile)) && !(await this.fileSystem.isDirectory(paths.settingsFile));
    const explicitSettingsFile = teamSettings ? paths.settingsFile : undefined;
    const layers = await readLlmLayers(this.fileSystem, environment, { crewFolder: paths.crew, explicitSettingsFile });
    const effective = effectiveLlmSettings(layers.layers, localHosts, layers.decisionKeys);
    const orkeonProfiles = effective.profiles.map((orkeonProfile) => orkeonProfile.id);
    let providers: LlmTarget[] = [];
    if (profile.kind === 'machine') {
      machine = { ...layers, effective };
      providers = providerTargets(effective, localHosts);
      warnings.push(...machineWarnings(machine, providers));
    }

    // A named profile's run keeps the machine's decision model, with the decision block laid over it; the stub's none.
    const decisionTarget = profile.kind === 'stub' ? null : decisionModelTarget(effective.decisionModel, localHosts);
    const decisionModel = decisionTarget === null ? null : { target: decisionTarget, effective: effective.decisionModel };
    const { refusal, provider: decisionKey } = effective.decisionModel;
    if (decisionTarget !== null && refusal !== null) {
      warnings.push(`Orkeon refuses to start on the decision settings (${effective.decisionModel.configuredBy.join(', ')}): ${refusal} The run counts as remote until they are fixed`);
    } else if (decisionTarget?.remote === true) {
      warnings.push(
        `the decision model ${decisionProvider(decisionKey ?? 'typesafe').displayName} is configured (${effective.decisionModel.configuredBy.join(', ')}) and its endpoint ${decisionTarget.baseUrlHost ?? 'cannot be read as a URL'}${decisionTarget.baseUrlHost === null ? '' : ' is not local'}: decision tasks, the system_one_decide tool and the input guard call it, and --no-decision stops only the decision tasks, so the run counts as remote`,
      );
    }
    if (decisionBlock?.key_env !== undefined && (this.environment.get(decisionBlock.key_env) ?? '') === '') {
      warnings.push(`${decisionBlock.key_env} (key_env of the decision block) is not set: ${decisionProvider(decisionBlock.provider).displayName} will be called without a key`);
    }
    const target = profileTarget(profile, effective, localHosts);
    const apiKey = profile.kind === 'named' ? this.environment.get(profile.keyEnv) : undefined;
    const variables = profileVariables(profile, { apiKey }, orkeonProfiles);
    if (!variables.keyPresent) {
      warnings.push(`${variables.keyEnv ?? 'the key variable'} is not set: ${LLM_VARIABLES.apiKey} will not be injected`);
    }
    return { profile, machine, target, providers, orkeonProfiles, decisionModel, decisionBlock, decisionVariables: injected, settingsFile: layers.settingsFile, warnings, ...variables };
  }

  private async loadConfig(team: TeamRef): Promise<BenchConfig> {
    const path = teamPaths(team).benchConfigFile;
    if (!(await this.fileSystem.exists(path))) {
      return DEFAULT_BENCH_CONFIG;
    }
    return parseBenchConfig(await readJsonFile(this.fileSystem, path));
  }
}

/** The bench's environment with `injected` laid over it, as the run will see it. */
function overlayEnvironment(environment: Environment, injected: Readonly<Record<string, string>>): Environment {
  const variables = overlayVariables(environment.variables(), injected);
  return {
    get: (name) => (Object.hasOwn(variables, name) ? variables[name] : undefined),
    variables: () => variables,
    homeDirectory: () => environment.homeDirectory(),
    currentDirectory: () => environment.currentDirectory(),
  };
}

function machineWarnings(machine: MachineResolution, providers: readonly LlmTarget[]): string[] {
  const warnings = machine.layers
    .filter((layer) => layer.setsProvider)
    .map((layer) => `${layer.source} set Llm:Provider, which is no setting: Orkeon refuses to start on it — remove it (the provider follows the base URL, then the model name, then the key)`);
  if (!machine.effective.configured) {
    warnings.push(
      machine.settingsFile === null
        ? 'no Orkeon settings file and no Llm variable: orkeon run uses its echo provider'
        : `no default provider in ${machine.settingsFile} nor in the other layers: orkeon run uses its echo provider for every agent that names no profile`,
    );
  }
  for (const target of providers.filter((provider) => provider.profile != null && provider.remote)) {
    warnings.push(`the named profile Llm:Profiles:${String(target.profile)} is remote (${target.baseUrlHost ?? target.reason}): any agent of the crew may name it, so the run counts as remote`);
  }
  return warnings;
}
