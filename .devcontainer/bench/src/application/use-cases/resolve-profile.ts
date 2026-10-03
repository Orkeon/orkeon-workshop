import { DEFAULT_BENCH_CONFIG, parseBenchConfig, profileNamed, type BenchConfig } from '../../domain/bench-config.js';
import { LOCAL_HOSTS_VARIABLE, parseLocalHosts, profileTarget, type LlmTarget } from '../../domain/llm-target.js';
import { effectiveLlmSettings, type EffectiveLlmSettings } from '../../domain/orkeon-configuration.js';
import { LLM_VARIABLES, profileVariables, type Profile, type ProfileVariables } from '../../domain/profile.js';
import { teamPaths, type TeamRef } from '../../domain/team-ref.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import { readJsonFile } from './read-json-file.js';
import { readLlmLayers, type MachineLlm } from './read-llm-layers.js';

export interface ResolveProfileOptions {
  /** Port of the running stub server; without it the stub base URL stays a run-time value. */
  readonly stubPort?: number;
}

/** For `machine`: what a run of the team would read, and what wins. */
export interface MachineResolution extends MachineLlm {
  readonly effective: EffectiveLlmSettings;
}

export interface ProfileResolution extends ProfileVariables {
  readonly profile: Profile;
  readonly machine: MachineResolution | null;
  /** Where the LLM calls of a run with this profile go, and whether that is off the machine. */
  readonly target: LlmTarget;
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
    const profile = profileNamed(await this.loadConfig(team), name, options.stubPort);
    const localHosts = parseLocalHosts(this.environment.get(LOCAL_HOSTS_VARIABLE));
    const warnings: string[] = [];
    let machine: MachineResolution | null = null;

    if (profile.kind === 'machine') {
      // The machine profile injects nothing: a run sees what a launcher run of the team sees —
      // the team's settings file when it exists (the launchers pass it with --settings, D33), else
      // the chain from the crew folder; the team folder is the working directory.
      const paths = teamPaths(team);
      const teamSettings = (await this.fileSystem.exists(paths.settingsFile)) && !(await this.fileSystem.isDirectory(paths.settingsFile));
      const explicitSettingsFile = teamSettings ? paths.settingsFile : undefined;
      const layers = await readLlmLayers(this.fileSystem, this.environment, { crewFolder: paths.crew, workingDirectory: team.folder, explicitSettingsFile });
      machine = { ...layers, effective: effectiveLlmSettings(layers.layers, localHosts) };
      warnings.push(...machineWarnings(machine));
    }

    const target = profileTarget(profile, machine?.effective, localHosts);
    const apiKey = profile.kind === 'named' ? this.environment.get(profile.keyEnv) : undefined;
    const variables = profileVariables(profile, { apiKey });
    if (!variables.keyPresent) {
      warnings.push(`${variables.keyEnv ?? 'the key variable'} is not set: ${LLM_VARIABLES.apiKey} will not be injected`);
    }
    return { profile, machine, target, warnings, ...variables };
  }

  private async loadConfig(team: TeamRef): Promise<BenchConfig> {
    const path = teamPaths(team).benchConfigFile;
    if (!(await this.fileSystem.exists(path))) {
      return DEFAULT_BENCH_CONFIG;
    }
    return parseBenchConfig(await readJsonFile(this.fileSystem, path));
  }
}

function machineWarnings(machine: MachineResolution): string[] {
  const warnings = machine.layers
    .filter((layer) => layer.setsProvider)
    .map((layer) => `${layer.source} set Llm:Provider, which Orkeon does not read: the provider follows the base URL, then the model name, then the key`);
  if (!machine.effective.configured) {
    warnings.push(
      machine.settingsFile === null
        ? 'no Orkeon settings file and no Llm variable: orkeon run uses its echo provider'
        : `no Llm section in ${machine.settingsFile} nor in the other layers: orkeon run uses its echo provider`,
    );
  }
  return warnings;
}
