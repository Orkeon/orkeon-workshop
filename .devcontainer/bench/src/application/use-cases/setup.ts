import { ApplicationError } from '../errors.js';
import type { Environment } from '../ports/environment.js';
import type { FileSystem } from '../ports/file-system.js';
import { userSettingsFile } from '../../domain/orkeon-configuration.js';
import { LOCAL_HOSTS_VARIABLE, llmTarget, parseLocalHosts } from '../../domain/llm-target.js';
import { joinPath, resolvePath } from '../../domain/paths.js';
import { applyKeys, applySubscription, parseSetupState, reapplyKeys, setupStatus, type KeysRequest, type SetupChange, type SetupFiles, type SetupStatus } from '../../domain/setup.js';
import { WORKSHOP_ENV } from '../workshop.js';
import { readJsonFile } from './read-json-file.js';
import { readSettingsFile } from './read-settings-file.js';

/** The variable `workshop setup` hands the key through: read once, never written anywhere under that name. */
export const SETUP_KEY_VARIABLE = 'WORKSHOP_SETUP_KEY';

export interface SetupPaths {
  /** `.claude/settings.local.json` of the workshop or the checkout. */
  readonly local: string;
  /** `.claude/local/setup.json`: what setup wrote, names only. */
  readonly state: string;
  /** Orkeon's user settings, the file `orkeon init` writes. */
  readonly orkeon: string;
}

export interface SetupReport extends SetupStatus {
  readonly paths: SetupPaths;
  /** True when the model of the teams is not on this machine: a run of theirs is paid. */
  readonly remote: boolean;
}

export interface SetupResult {
  readonly lines: readonly string[];
  readonly report: SetupReport;
}

/**
 * `orkeon-bench setup` (D108, D109): one place that sets the model keys for Claude Code and for
 * Orkeon. It writes `.claude/settings.local.json` — the one file of a workshop that may hold a key —
 * and Orkeon's user settings, where only the name of the variable goes. The key comes in through
 * the environment of this command (`SETUP_KEY_VARIABLE`), so it is on no command line.
 */
export class Setup {
  constructor(
    private readonly files: FileSystem,
    private readonly environment: Environment,
  ) {}

  /** The folder whose `.claude/` is written: `root` when given, else `$ORKEON_WORKSHOP`, else the current directory. */
  paths(root?: string): SetupPaths {
    const workshop = this.environment.get(WORKSHOP_ENV)?.trim() ?? '';
    const chosen = root !== undefined && root.trim().length > 0 ? root.trim() : workshop.length > 0 ? workshop : '.';
    const base = resolvePath(this.environment.currentDirectory(), chosen);
    return {
      local: joinPath(base, '.claude', 'settings.local.json'),
      state: joinPath(base, '.claude', 'local', 'setup.json'),
      orkeon: userSettingsFile(this.environment.get('XDG_CONFIG_HOME'), this.environment.homeDirectory()),
    };
  }

  async status(root?: string): Promise<SetupReport> {
    const paths = this.paths(root);
    return this.report(paths, await this.read(paths));
  }

  async keys(request: Omit<KeysRequest, 'keyValue'>, root?: string): Promise<SetupResult> {
    const keyValue = this.environment.get(SETUP_KEY_VARIABLE) ?? '';
    if (keyValue.trim().length === 0) {
      throw new ApplicationError('invalid-input', `no key given: ${SETUP_KEY_VARIABLE} is empty (workshop setup asks for it on the terminal and sets it for this command alone)`);
    }
    const paths = this.paths(root);
    return this.write(paths, applyKeys(await this.read(paths), { ...request, keyValue }));
  }

  async subscription(root?: string): Promise<SetupResult> {
    const paths = this.paths(root);
    return this.write(paths, applySubscription(await this.read(paths)));
  }

  /** At the start of a container: Orkeon's settings back on the choice of `setup keys`, when they lost it. */
  async apply(root?: string): Promise<SetupResult> {
    const paths = this.paths(root);
    const files = await this.read(paths);
    const change = reapplyKeys(files);
    return change === null ? { lines: [], report: this.report(paths, files) } : this.write(paths, change);
  }

  private async read(paths: SetupPaths): Promise<SetupFiles> {
    const object = (value: unknown, path: string): Record<string, unknown> => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ApplicationError('invalid-input', `${path} is not a JSON object`);
      }
      return value as Record<string, unknown>;
    };
    const local = (await this.files.exists(paths.local)) ? object(await this.readLocal(paths.local), paths.local) : {};
    const orkeon = (await this.files.exists(paths.orkeon)) ? object(await readSettingsFile(this.files, paths.orkeon), paths.orkeon) : {};
    const state = (await this.files.exists(paths.state)) ? parseSetupState(await readJsonFile(this.files, paths.state)) : parseSetupState(null);
    return { local, orkeon, state };
  }

  /**
   * `.claude/settings.local.json` may hold a key: a syntax error is reported without the excerpt a
   * JSON parser quotes, which could be a piece of that key.
   */
  private async readLocal(path: string): Promise<unknown> {
    const text = await this.files.readText(path);
    try {
      return JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text) as unknown;
    } catch {
      throw new ApplicationError('invalid-input', `${path} is not valid JSON (its content is not shown: it may hold a key)`);
    }
  }

  private async write(paths: SetupPaths, change: SetupChange): Promise<SetupResult> {
    const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
    for (const path of [paths.local, paths.state, paths.orkeon]) {
      await this.files.makeDirectory(joinPath(path, '..'));
    }
    // The state first: a key the state does not name would never be removed by `subscription`. Written
    // with the names of both sides, so that a write that fails after it leaves nothing unrecorded.
    const state = (keys: readonly string[]): string => text({ keys, previousLlm: change.state.previousLlm, previousRateLimiting: change.state.previousRateLimiting, saved: change.state.saved, llm: change.state.llm });
    const before = (await this.files.exists(paths.state)) ? parseSetupState(await readJsonFile(this.files, paths.state)).keys : [];
    await this.files.writeText(paths.state, state([...new Set([...before, ...change.state.keys])].sort()));
    await this.files.writeText(paths.local, text(change.local), { ownerOnly: true });
    if ('Llm' in change.orkeon || (await this.files.exists(paths.orkeon))) {
      await this.files.writeText(paths.orkeon, text(change.orkeon));
    }
    await this.files.writeText(paths.state, state(change.state.keys));
    return { lines: change.lines, report: this.report(paths, change) };
  }

  private report(paths: SetupPaths, files: SetupFiles): SetupReport {
    const status = setupStatus(files, (name) => (this.environment.get(name) ?? '').length > 0);
    const target = llmTarget({ baseUrl: status.baseUrl, providerModule: status.providerModule, configured: status.model !== null || status.baseUrl !== null }, parseLocalHosts(this.environment.get(LOCAL_HOSTS_VARIABLE)));
    return { ...status, paths, remote: target.remote };
  }
}
