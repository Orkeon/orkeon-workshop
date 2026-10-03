import type { Command } from 'commander';

import type { ProfileResolution } from '../../application/use-cases/resolve-profile.js';
import type { LlmTargetReason } from '../../domain/llm-target.js';
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
};

export function registerProfile(program: Command, services: Services, session: Session): void {
  program
    .command('profile <team> <name>')
    .description('show the ORKEON_Llm__* variables a profile would inject (names only, secrets redacted) and whether it is remote')
    .option('--json', 'print the resolution as JSON (secret values redacted)')
    .action(async (teamArgument: string, name: string, options: { json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const resolution = await services.resolveProfile.execute(team, name);
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
  const { target } = resolution;
  const named = target.profile != null ? `, named profile ${target.profile}` : '';
  lines.push(`remote: ${target.remote ? 'yes' : 'no'} (${describe(target)}${named})`);
  const secrets = new Set(resolution.secretNames);
  const names = Object.keys(resolution.variables);
  lines.push(names.length + resolution.runtimeNames.length === 0 ? 'variables to inject: none (machine settings apply)' : 'variables to inject:');
  lines.push(...names.map((name) => `  ${name}${secrets.has(name) ? ` (secret, from ${resolution.keyEnv ?? '?'})` : ''}`));
  lines.push(...resolution.runtimeNames.map((name) => `  ${name} (set at run time)`));
  lines.push(...resolution.warnings.map((warning) => `warning: ${warning}`));
  return lines;
}
