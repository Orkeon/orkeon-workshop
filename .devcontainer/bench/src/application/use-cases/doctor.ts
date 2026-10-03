import { LOCAL_HOSTS_VARIABLE, baseUrlHost, isLocalHost, parseLocalHosts } from '../../domain/llm-target.js';
import { SETTINGS_FILE_NAME, flattenConfiguration, settingsWalk, userSettingsFile, variableEntries, type ConfigurationEntry } from '../../domain/orkeon-configuration.js';
import { REFERENCE_ORKEON_VERSION, extractVersion } from '../../domain/orkeon-version.js';
import { joinPath } from '../../domain/paths.js';
import { parseToolCatalogue } from '../../domain/tool-catalogue.js';
import type { Clock } from '../ports/clock.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import type { HttpProbe } from '../ports/http-probe.js';
import type { ProcessResult, ProcessRunner } from '../ports/process-runner.js';
import { WORKSHOP_LAYOUT, workshopRoot } from '../workshop.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface DoctorReport {
  /** True when no check failed (warnings allowed). */
  readonly ok: boolean;
  /** ISO timestamp of the check. */
  readonly checkedAt: string;
  readonly referenceOrkeonVersion: string;
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorOptions {
  readonly ollamaTagsUrl: string;
  readonly typingsPath: string;
  /** Per external command; the checks run concurrently, so this also bounds the whole run. */
  readonly commandTimeoutMs: number;
  /** For the Ollama probe: short, because an absent server is only a warning. */
  readonly probeTimeoutMs: number;
}

export const DEFAULT_DOCTOR_OPTIONS: DoctorOptions = {
  ollamaTagsUrl: 'http://127.0.0.1:11434/api/tags',
  typingsPath: '/usr/local/share/orkeon/typings/orkeon.d.ts',
  commandTimeoutMs: 20_000,
  probeTimeoutMs: 1_500,
};

/** Checks the tools the bench relies on (plan § 7.3, SessionStart hook). */
export class Doctor {
  private readonly options: DoctorOptions;

  constructor(
    private readonly runner: ProcessRunner,
    private readonly http: HttpProbe,
    private readonly fileSystem: FileSystem,
    private readonly environment: Environment,
    private readonly clock: Clock,
    options: Partial<DoctorOptions> = {},
  ) {
    this.options = { ...DEFAULT_DOCTOR_OPTIONS, ...options };
  }

  async execute(): Promise<DoctorReport> {
    const checks = await Promise.all([
      this.checkOrkeon(),
      this.checkToolCatalogue(),
      this.checkCommand('esbuild', 'esbuild on PATH', 'esbuild', ['--version']),
      this.checkCommand('pyyaml', 'PyYAML importable by python3', 'python3', ['-c', 'import yaml']),
      this.checkOllama(),
      this.checkLocalConcurrency(),
      this.checkTypings(),
      this.checkWorkshop(),
      this.checkStraySettings(),
    ]);
    return {
      ok: checks.every((check) => check.status !== 'fail'),
      checkedAt: this.clock.now().toISOString(),
      referenceOrkeonVersion: REFERENCE_ORKEON_VERSION,
      checks,
    };
  }

  private async checkOrkeon(): Promise<DoctorCheck> {
    const result = await this.runner.run('orkeon', ['--version'], { timeoutMs: this.options.commandTimeoutMs });
    if (!result.found) {
      return check('orkeon', 'orkeon CLI on PATH', 'fail', 'orkeon not found on PATH');
    }
    if (result.exitCode !== 0) {
      return check('orkeon', 'orkeon CLI on PATH', 'fail', failure('orkeon --version', result));
    }
    const version = extractVersion(result.stdout) ?? extractVersion(result.stderr);
    if (version === null) {
      return check('orkeon', 'orkeon CLI on PATH', 'warn', `could not read a version from: ${firstLine(result.stdout)}`);
    }
    if (version !== REFERENCE_ORKEON_VERSION) {
      return check('orkeon', 'orkeon CLI on PATH', 'warn', `orkeon ${version} installed; the references were established on ${REFERENCE_ORKEON_VERSION}`);
    }
    return check('orkeon', 'orkeon CLI on PATH', 'pass', `orkeon ${version}`);
  }

  /** `orkeon run --list-tools` is the authority on tool names (the static checks read it too). */
  private async checkToolCatalogue(): Promise<DoctorCheck> {
    const label = 'orkeon tool catalogue';
    const result = await this.runner.run('orkeon', ['run', '--list-tools'], { timeoutMs: this.options.commandTimeoutMs });
    if (!result.found) {
      return check('tool-catalogue', label, 'fail', 'orkeon not found on PATH');
    }
    if (result.exitCode !== 0) {
      return check('tool-catalogue', label, 'fail', failure('orkeon run --list-tools', result));
    }
    const tools = parseToolCatalogue(result.stdout);
    if (tools.length === 0) {
      return check('tool-catalogue', label, 'fail', 'orkeon run --list-tools returned no tool');
    }
    return check('tool-catalogue', label, 'pass', `${tools.length} tools`);
  }

  private async checkCommand(id: string, label: string, command: string, args: string[]): Promise<DoctorCheck> {
    const result = await this.runner.run(command, args, { timeoutMs: this.options.commandTimeoutMs });
    if (!result.found) {
      return check(id, label, 'fail', `${command} not found on PATH`);
    }
    if (result.exitCode !== 0) {
      return check(id, label, 'fail', failure(`${command} ${args.join(' ')}`, result));
    }
    return check(id, label, 'pass', firstLine(result.stdout) || `${command} ok`);
  }

  private async checkOllama(): Promise<DoctorCheck> {
    const result = await this.http.get(this.options.ollamaTagsUrl, this.options.probeTimeoutMs);
    if (result.reachable) {
      return check('ollama', 'Ollama reachable', 'pass', this.options.ollamaTagsUrl);
    }
    const reason = result.error ?? (result.status === undefined ? 'no answer' : `HTTP ${result.status}`);
    return check('ollama', 'Ollama reachable', 'warn', `${this.options.ollamaTagsUrl}: ${reason} (OLLAMA_MODE=off?)`);
  }

  /**
   * A local model takes one request at a time: concurrent calls (a parallel crew, a manager and its
   * workers) saturate the GPU. Orkeon reads `RateLimiting.MaxConcurrentRequests` (absent, 0 or below
   * means unlimited) and queues the other calls up to `RateLimiting.QueueLimit` (5 by default, beyond
   * which a call is refused). Judged on the user's settings file, `ORKEON_*` variables overriding it: no
   * limit fails (init-orkeon.sh sets 1 at the next start), a limit of 1 or more set by hand is kept, and
   * a limit of 1 without a queue warns.
   */
  private async checkLocalConcurrency(): Promise<DoctorCheck> {
    const id = 'llm-concurrency';
    const label = 'local model concurrency';
    const path = userSettingsFile(this.environment.get('XDG_CONFIG_HOME'), this.environment.homeDirectory());
    let file: ConfigurationEntry[] = [];
    if (await this.fileSystem.exists(path)) {
      try {
        file = flattenConfiguration(JSON.parse(await this.fileSystem.readText(path)) as unknown);
      } catch {
        return check(id, label, 'warn', `${path} is not strict JSON`);
      }
    }
    const variables = variableEntries('ORKEON_', this.environment.variables());
    const value = (key: string): unknown => [...variables, ...file].find((entry) => entry.key.toLowerCase() === key)?.value;
    const url = value('llm:baseurl');
    const host = typeof url === 'string' && url.trim().length > 0 ? baseUrlHost(url) : null;
    if (host === null || !isLocalHost(host, parseLocalHosts(this.environment.get(LOCAL_HOSTS_VARIABLE)))) {
      return check(id, label, 'pass', host === null ? 'no local base URL in the Orkeon settings' : `${host}: not a local model`);
    }
    const limit = asInteger(value('ratelimiting:maxconcurrentrequests'));
    const queue = asInteger(value('ratelimiting:queuelimit'));
    if (limit === null || limit <= 0) {
      const now = limit === null ? 'no RateLimiting.MaxConcurrentRequests' : `RateLimiting.MaxConcurrentRequests ${String(limit)}`;
      return check(id, label, 'fail', `${host}: ${now} in ${path} (unlimited) — a local model takes one request at a time: set it to 1, with QueueLimit 32 (init-orkeon.sh does at the next start)`);
    }
    if (limit !== 1) {
      return check(id, label, 'pass', `${host}: RateLimiting.MaxConcurrentRequests ${String(limit)}, as set`);
    }
    if (queue === null) {
      return check(id, label, 'warn', `${host}: RateLimiting.QueueLimit defaults to 5 — set it to 32, or a parallel crew's calls beyond it are refused`);
    }
    return check(id, label, 'pass', `${host}: one request at a time, QueueLimit ${String(queue)}`);
  }

  private async checkTypings(): Promise<DoctorCheck> {
    const present = await this.fileSystem.exists(this.options.typingsPath);
    return check('typings', 'orkeon.d.ts typings', present ? 'pass' : 'fail', present ? this.options.typingsPath : `${this.options.typingsPath} missing (run orkeon-update)`);
  }

  private async checkWorkshop(): Promise<DoctorCheck> {
    const root = workshopRoot(this.environment);
    if (!(await this.fileSystem.isDirectory(root))) {
      return check('workshop', 'workshop layout', 'fail', `${root} is not a directory (set ORKEON_WORKSHOP to the workshop folder)`);
    }
    const missing: string[] = [];
    for (const folder of WORKSHOP_LAYOUT) {
      if (!(await this.fileSystem.isDirectory(joinPath(root, folder)))) {
        missing.push(folder);
      }
    }
    if (missing.includes('teams')) {
      return check('workshop', 'workshop layout', 'fail', `${root}/teams missing`);
    }
    if (missing.length > 0) {
      return check('workshop', 'workshop layout', 'warn', `${root}: missing ${missing.join(', ')}`);
    }
    return check('workshop', 'workshop layout', 'pass', root);
  }

  /**
   * Settings files Orkeon finds on its own (D33). Above the teams, in the `appsettings/` or
   * `_shared/` of a team folder, or in its `crew/`, such a file replaces the machine's settings for
   * every run that names no settings file, and Orkeon Studio names none unless an Expert pins one: it
   * silently changes the model and the tools of the team. (A run of a crew no longer reads the `appsettings*.json` of the
   * working directory since Orkeon `main` at a2bb6c3: the root of a team folder holds no settings file
   * a run reads; the check scripts warn about one.) A team's own settings live in `settings/<slug>/appsettings.json`,
   * which the launchers pass with `--settings`.
   */
  private async checkStraySettings(): Promise<DoctorCheck> {
    const id = 'stray-settings';
    const label = 'stray settings files';
    const teams = joinPath(workshopRoot(this.environment), 'teams');
    const instead = new Set<string>();
    // `File.Exists`: a folder of that name is not a settings file.
    const isFile = async (path: string): Promise<boolean> => (await this.fileSystem.exists(path)) && !(await this.fileSystem.isDirectory(path));
    for (const { candidates } of settingsWalk(teams)) {
      for (const candidate of candidates) {
        if (await isFile(candidate)) {
          instead.add(candidate);
        }
      }
    }
    for (const slug of await this.fileSystem.list(teams)) {
      const team = joinPath(teams, slug);
      if (slug.startsWith('.') || !(await this.fileSystem.isDirectory(team))) {
        continue;
      }
      for (const candidate of WALKED_TEAM_SETTINGS) {
        if (await isFile(joinPath(team, candidate))) {
          instead.add(joinPath(team, candidate));
        }
      }
    }
    if (instead.size === 0) {
      return check(id, label, 'pass', `none in the teams, nor above ${teams}`);
    }
    const remedy = `remove it: a team's own settings live in settings/<slug>/${SETTINGS_FILE_NAME} (D33)`;
    return check(
      id,
      label,
      'fail',
      `${[...instead].join(', ')}: Orkeon reads such a file instead of the machine's settings for every run that names no settings file (Orkeon Studio names none unless an Expert pins one) — ${remedy}`,
    );
  }
}

/**
 * The settings files of a team that Orkeon reads in place of the machine's, highest first:
 * `crew/appsettings.json`, then `appsettings/appsettings.json` or `_shared/appsettings.json` in
 * `crew/` and in the team folder, as its walk up from the crew finds them (`settingsWalk`).
 */
const WALKED_TEAM_SETTINGS = [
  'crew/appsettings.json',
  'crew/appsettings/appsettings.json',
  'crew/_shared/appsettings.json',
  'appsettings/appsettings.json',
  '_shared/appsettings.json',
] as const;

/** A configuration value as .NET would bind an integer: a JSON number or a numeric string. */
function asInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\s*-?\d+\s*$/.test(value) ? Number(value) : Number.NaN;
  return Number.isInteger(number) ? number : null;
}

function check(id: string, label: string, status: CheckStatus, detail: string): DoctorCheck {
  return { id, label, status, detail };
}

/** Why a command failed: how it ended and the last line it printed (a traceback ends with its cause). */
function failure(commandLine: string, result: ProcessResult): string {
  const ending = result.exitCode === null ? 'did not exit (killed or timed out)' : `exited ${result.exitCode}`;
  const reason = lastLine(result.stderr) || lastLine(result.stdout);
  return reason.length === 0 ? `${commandLine} ${ending}` : `${commandLine} ${ending}: ${reason}`;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function lastLine(text: string): string {
  return text.trim().split(/\r?\n/).at(-1)?.trim() ?? '';
}
