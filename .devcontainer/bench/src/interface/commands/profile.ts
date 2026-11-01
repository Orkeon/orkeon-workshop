import type { Command } from 'commander';

import type { ProfileResolution } from '../../application/use-cases/resolve-profile.js';
import { decisionProvider, type LlmTargetReason } from '../../domain/llm-target.js';
import { LEVELS, type Level } from '../../domain/bench-config.js';
import type { Profile } from '../../domain/profile.js';
import type { TeamRef } from '../../domain/team-ref.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

const REDACTED = '[redacted]';
const STUB_URL_PLACEHOLDER = 'http://127.0.0.1:<port>/v1';

/** Wording of the reasons computed by the domain (`llmTarget`), for the text output. */
const REASONS: Record<LlmTargetReason, string> = {
  'local-host': 'local host',
  'remote-host': 'host is not local',
  'unreadable-base-url': 'the base URL cannot be read',
  'no-base-url': 'no base URL: Orkeon infers the provider and its endpoint',
  'not-configured': 'no Llm section: echo provider',
  'decision-model': 'a decision provider (Orkeon:TypeSafe, Orkeon:Liquid or Orkeon:Kev) is configured and its endpoint is not local, or the decision settings refuse the start',
};

export function registerProfile(program: Command, services: Services, session: Session): void {
  program
    .command('profile <team> <name>')
    .description('show the ORKEON_Llm__* variables a profile would inject (names only, secrets redacted) and whether it is remote')
    .option('--json', 'print the resolution as JSON (secret values redacted)')
    .option('--level <level>', `the level whose decision block applies (${LEVELS.join(', ')}); default: the top-level block`)
    .action(async (teamArgument: string, name: string, options: { json?: boolean; level?: string }) => {
      await session.run(async () => {
        if (options.level !== undefined && !(LEVELS as readonly string[]).includes(options.level)) {
          session.output.error(`error: unknown level "${options.level}" (known: ${LEVELS.join(', ')})`);
          return EXIT.error;
        }
        const team = await services.locateTeam.execute(teamArgument);
        const resolution = await services.resolveProfile.execute(team, name, options.level === undefined ? {} : { level: options.level as Level });
        if (options.json === true) {
          session.output.json(toJson(team, resolution));
        } else {
          toText(resolution).forEach((line) => session.output.line(line));
        }
        return EXIT.ok;
      });
    });
}

/** The variables with every secret value replaced: nothing printed may carry a key. */
function redact(resolution: ProfileResolution): Record<string, string> {
  const secrets = new Set(resolution.secretNames);
  return Object.fromEntries(Object.entries(resolution.variables).map(([name, value]) => [name, secrets.has(name) ? REDACTED : value]));
}

function profileJson(profile: Profile): unknown {
  switch (profile.kind) {
    case 'machine':
      return { name: profile.name, kind: profile.kind };
    case 'stub':
      return { name: profile.name, kind: profile.kind, base_url: profile.baseUrl, model: profile.model };
    case 'named':
      return { name: profile.name, kind: profile.kind, base_url: profile.baseUrl, model: profile.model, key_env: profile.keyEnv, timeout_seconds: profile.timeoutSeconds };
  }
}

function toJson(team: TeamRef, resolution: ProfileResolution): unknown {
  const machine = resolution.machine;
  return {
    team: team.slug,
    profile: profileJson(resolution.profile),
    remote: resolution.target.remote,
    base_url_host: resolution.target.baseUrlHost,
    remote_reason: resolution.target.reason,
    remote_profile: resolution.target.profile ?? null,
    providers: resolution.providers.map((provider) => ({
      profile: provider.profile ?? null,
      remote: provider.remote,
      base_url_host: provider.baseUrlHost,
      remote_reason: provider.reason,
    })),
    orkeon_profiles: resolution.orkeonProfiles,
    decision_model:
      resolution.decisionModel === null
        ? null
        : {
            provider: resolution.decisionModel.effective.provider,
            how: resolution.decisionModel.effective.how,
            refusal: resolution.decisionModel.effective.refusal,
            model: resolution.decisionModel.effective.model,
            key_env: resolution.decisionModel.effective.keyVariable,
            remote: resolution.decisionModel.target.remote,
            base_url_host: resolution.decisionModel.target.baseUrlHost,
            remote_reason: resolution.decisionModel.target.reason,
            base_url_source: resolution.decisionModel.effective.baseUrlSource,
            configured_by: resolution.decisionModel.effective.configuredBy,
          },
    decision_block: resolution.decisionBlock,
    decision_variables: resolution.decisionVariables,
    variables: redact(resolution),
    secret_names: resolution.secretNames,
    runtime_names: resolution.runtimeNames,
    key_env: resolution.keyEnv,
    key_present: resolution.keyPresent,
    machine:
      machine === null
        ? null
        : {
            settings_file: machine.settingsFile,
            base_url_source: machine.effective.baseUrlSource,
            configured_by: machine.effective.configuredBy,
            profiles: machine.effective.profiles.map((orkeonProfile) => ({
              id: orkeonProfile.id,
              base_url_source: orkeonProfile.baseUrlSource,
              defined_by: orkeonProfile.definedBy,
            })),
          },
    warnings: resolution.warnings,
  };
}

function describe(target: ProfileResolution['target']): string {
  return [target.baseUrlHost, REASONS[target.reason]].filter((part) => part !== null).join(': ');
}

function toText(resolution: ProfileResolution): string[] {
  const { profile } = resolution;
  const lines = [`profile: ${profile.name} (${profile.kind})`];
  if (profile.kind === 'named') {
    lines.push(`  baseUrl: ${profile.baseUrl}`, `  model: ${profile.model}`, `  timeoutSeconds: ${String(profile.timeoutSeconds)}`);
    lines.push(`  keyEnv: ${profile.keyEnv} (${resolution.keyPresent ? 'set' : 'not set'})`);
  }
  if (profile.kind === 'stub') {
    lines.push(`  baseUrl: ${profile.baseUrl ?? `${STUB_URL_PLACEHOLDER} (port chosen when the stub server starts)`}`, `  model: ${profile.model}`);
  }
  if (resolution.machine !== null) {
    const { settingsFile, effective } = resolution.machine;
    lines.push(`  settings file: ${settingsFile ?? 'none'}`);
    lines.push(`  base URL from: ${effective.baseUrlSource ?? 'nowhere'}`);
    lines.push(`  Llm section from: ${effective.configuredBy.length > 0 ? effective.configuredBy.join(', ') : 'nowhere'}`);
    for (const provider of resolution.providers.filter((candidate) => candidate.profile != null)) {
      lines.push(`  named profile ${String(provider.profile)}: ${describe(provider)}${provider.remote ? ', remote' : ''}`);
    }
  } else if (resolution.orkeonProfiles.length > 0) {
    lines.push(`  injected over the named profiles: ${resolution.orkeonProfiles.join(', ')}`);
  }
  if (resolution.decisionModel !== null) {
    const { target: decision, effective: decisionSettings } = resolution.decisionModel;
    if (decisionSettings.provider === null) {
      lines.push(`  decision settings from: ${decisionSettings.configuredBy.join(', ')}; Orkeon refuses to start: ${decisionSettings.refusal ?? '?'}`);
    } else {
      const name = decisionProvider(decisionSettings.provider).displayName;
      lines.push(`  decision model ${name} from: ${decisionSettings.configuredBy.join(', ')}; base URL from: ${decisionSettings.baseUrlSource ?? 'nowhere (its default endpoint)'}`);
      lines.push(`  decision model ${name}: ${decisionSettings.how ?? '?'}, model ${decisionSettings.model ?? '?'}, key from ${decisionSettings.keyVariable ?? '?'}`);
    }
    lines.push(`  decision model: ${describe(decision)}${decision.remote ? ', remote' : ''}`);
  }
  const { target } = resolution;
  const named = target.profile != null ? `, named profile ${target.profile}` : '';
  lines.push(`remote: ${target.remote ? 'yes' : 'no'} (${describe(target)}${named})`);
  const secrets = new Set(resolution.secretNames);
  const names = Object.keys(resolution.variables);
  lines.push(names.length + resolution.runtimeNames.length === 0 ? 'variables to inject: none (machine settings apply)' : 'variables to inject:');
  lines.push(...names.map((name) => `  ${name}${secrets.has(name) ? ` (secret, from ${resolution.keyEnv ?? '?'})` : ''}`));
  lines.push(...resolution.runtimeNames.map((name) => `  ${name} (set at run time)`));
  const decisionNames = Object.entries(resolution.decisionVariables);
  if (decisionNames.length > 0) {
    lines.push('decision block variables to inject (no key: key_env names a variable):');
    lines.push(...decisionNames.map(([name, value]) => `  ${name}=${value}`));
  }
  lines.push(...resolution.warnings.map((warning) => `warning: ${warning}`));
  return lines;
}
