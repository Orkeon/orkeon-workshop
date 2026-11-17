import { HOST_FOLDER, hostPublishArguments, publishedLaunchers } from '../../domain/csharp-host.js';
import { crc32 } from '../../domain/deployment/crc32.js';
import { DEPLOYMENTS_FOLDER, HOST_PUBLISH_FOLDER, deploymentArchiveName, deploymentDate, planDeployment, secretKeysOf, type ArchiveFormat, type DeploymentPlan, type SettingsChoice, type SettingsOutcome } from '../../domain/deployment/deployment-plan.js';
import { buildTar, type TarEntry } from '../../domain/deployment/tar-format.js';
import { buildZip, type ZipEntry } from '../../domain/deployment/zip-format.js';
import { UNKNOWN_MACHINE, type MachineFolders } from '../../domain/mounts/mount-reach.js';
import { DEFAULT_ENVIRONMENT, resolveMountSet } from '../../domain/mounts/mount-set.js';
import { teamFolders } from '../../domain/mounts/team-gitignore.js';
import { flattenConfiguration } from '../../domain/orkeon-configuration.js';
import { isWithin, joinPath } from '../../domain/paths.js';
import { teamPaths, workshopOfTeam, type TeamRef } from '../../domain/team-ref.js';
import { ApplicationError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { Compressor } from '../ports/compressor.js';
import type { FileSystem } from '../ports/file-system.js';
import type { ProcessRunner } from '../ports/process-runner.js';
import { readHostProject, readTeamKind } from '../teams/crew-kind.js';
import { installedOrkeonVersion } from './orkeon-version.js';
import { readMountSet } from './read-mount-set.js';
import { readSettingsFile } from './read-settings-file.js';

export interface DeployOptions {
  /** What to do with `settings/<slug>/appsettings.json`; required when the file exists. */
  readonly settings: SettingsChoice | null;
  /** The folder the archive is written in; `<workshop>/deployments/` when absent. Absolute. */
  readonly into?: string;
  /** `zip` (the default), or `tar.gz`, which every Unix unpacker restores with its file modes. */
  readonly format?: ArchiveFormat;
}

export interface DeployResult {
  readonly team: string;
  /** The archive, absolute. */
  readonly archive: string;
  readonly name: string;
  readonly format: ArchiveFormat;
  /** `yyyy-mm-dd`, UTC: the day in the archive's name. */
  readonly date: string;
  /** The paths inside the archive, in order. */
  readonly files: readonly string[];
  readonly bytes: number;
  readonly settings: SettingsOutcome;
  /** A C# team: the archive carries its host published (`host/publish/`) and launchers that run it. */
  readonly csharp: boolean;
  readonly leftOut: {
    /** Files found in the folders of the mount points, by folder (the team's data): not packed. */
    readonly mountData: Readonly<Record<string, number>>;
    readonly buildOutput: readonly string[];
    /** Symbolic links of the team folder: never followed, never packed. */
    readonly links: readonly string[];
  };
  readonly warnings: readonly string[];
  readonly orkeonVersion: string;
  readonly benchVersion: string;
}

/**
 * `deploy <team>` (D45): a zip of the team as Orkeon Studio runs it — `teams/<slug>/` reduced to
 * the definition, the card, the launchers, the README and the empty folders of its mount points —
 * and, when asked, its own settings file `settings/<slug>/appsettings.json`, laid out as in a
 * workshop: unzipped at the root of one, the team lands in Studio's catalogue and its launchers find
 * their settings two levels up. Named `<slug>-<yyyymmdd>.zip` — or `.tar.gz` on request — under
 * `<workshop>/deployments/`, the archive's comment (the zip's, or a pax global header's) says what it holds. A C# team
 * travels as its host published and launchers that run it (`publishedHost`). Refuses a settings file in the team folder, a `.env`, and a
 * settings file that holds a secret: a key never travels with a team.
 */
export class DeployTeam {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly compressor: Compressor,
    private readonly processes: ProcessRunner,
    private readonly clock: Clock,
    private readonly benchVersion: string,
    private readonly machine: MachineFolders = UNKNOWN_MACHINE,
  ) {}

  async execute(team: TeamRef, options: DeployOptions): Promise<DeployResult> {
    const paths = teamPaths(team);
    if (!(await this.fileSystem.isDirectory(team.folder))) {
      throw new ApplicationError('file-not-found', `team folder not found: ${team.folder} (nothing to deploy before the first build batch, D35)`);
    }
    const csharp = (await readTeamKind(this.fileSystem, team)) === 'csharp';
    const resolution = resolveMountSet(await readMountSet(this.fileSystem, team), team.folder, DEFAULT_ENVIRONMENT, this.machine);
    const links = await this.fileSystem.symbolicLinks(team.folder);
    const files = await this.regularFiles(team.folder, links);
    const plan = planDeployment({ slug: team.slug, files, mountFolders: teamFolders(resolution.bindings), csharp });
    if (plan.refusals.length > 0) {
      throw new ApplicationError('invalid-input', `${team.slug} cannot be deployed:\n${plan.refusals.map((refusal) => `  ${refusal}`).join('\n')}`);
    }
    const settings = await this.settingsEntry(team, paths.settingsFile, options.settings);

    const at = this.clock.now();
    const folder = options.into ?? joinPath(workshopOfTeam(team.folder), DEPLOYMENTS_FOLDER);
    await this.fileSystem.makeDirectory(folder);
    const format = options.format ?? 'zip';
    const name = deploymentArchiveName(team.slug, at, await this.fileSystem.list(folder), format);
    const archive = joinPath(folder, name);

    const packed: TarEntry[] = [];
    for (const entry of plan.entries) {
      packed.push({ path: entry.archivePath, data: await this.fileSystem.readBytes(joinPath(team.folder, entry.source)), mode: entry.mode });
    }
    for (const keeper of plan.addedKeepers) {
      packed.push({ path: keeper, data: new Uint8Array(0), mode: 0o644 });
    }
    if (csharp) {
      packed.push(...(await this.publishedHost(team)));
    }
    packed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    if (settings.outcome === 'included') {
      packed.push({ path: `settings/${team.slug}/appsettings.json`, data: settings.bytes, mode: 0o644 });
    }
    const orkeonVersion = await installedOrkeonVersion(this.processes);
    const date = deploymentDate(at);
    const comment = JSON.stringify({ team: team.slug, date, orkeon_version: orkeonVersion, bench_version: this.benchVersion, settings: settings.outcome, files: packed.length });
    const bytes = format === 'zip' ? buildZip(packed.map((file) => this.zipEntry(file)), { at, comment }) : this.compressor.gzip(buildTar(packed, { at, comment }));
    await this.fileSystem.writeBytes(archive, bytes);
    return Object.freeze({
      team: team.slug,
      archive,
      name,
      format,
      date,
      files: packed.map((entry) => entry.path),
      bytes: bytes.length,
      settings: settings.outcome,
      csharp,
      leftOut: { mountData: plan.mountData, buildOutput: plan.buildOutput, links },
      warnings: [...plan.warnings, ...settingsWarnings(settings.outcome, plan)],
      orkeonVersion,
      benchVersion: this.benchVersion,
    });
  }

  /**
   * A C# team travels as its host published (`dotnet publish`, framework-dependent) under
   * `host/publish/`, with launchers that run it: the archive needs the .NET runtime alone — no SDK,
   * no Orkeon package feed, no network — and the team's tools of `library/tools/csharp/` are
   * compiled in. The sources stay in the workshop, which rebuilds the archive.
   */
  private async publishedHost(team: TeamRef): Promise<TarEntry[]> {
    const project = await readHostProject(this.fileSystem, team);
    const scratch = await this.fileSystem.makeTemporaryDirectory('orkeon-bench-publish-');
    try {
      const output = joinPath(scratch, 'publish');
      const result = await this.processes.run('dotnet', hostPublishArguments(project, output), { cwd: joinPath(team.folder, HOST_FOLDER), timeoutMs: PUBLISH_TIMEOUT_MS });
      if (!result.found) {
        throw new ApplicationError('invalid-input', `${team.slug} is a C# team: deploying it publishes its host, and dotnet is not on PATH`);
      }
      if (result.exitCode !== 0) {
        const lines = `${result.stdout}\n${result.stderr}`.split('\n').filter((line) => line.trim().length > 0).slice(-6);
        throw new ApplicationError('invalid-input', `${team.slug}: dotnet publish of its host failed (exit ${String(result.exitCode)}):\n${lines.map((line) => `  ${line}`).join('\n')}`);
      }
      const entries: TarEntry[] = [];
      for (const file of await this.regularFiles(output, [])) {
        entries.push({ path: `teams/${team.slug}/${HOST_PUBLISH_FOLDER}/${file}`, data: await this.fileSystem.readBytes(joinPath(output, file)), mode: 0o644 });
      }
      const launchers = publishedLaunchers(project);
      const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
      entries.push({ path: `teams/${team.slug}/run.cmd`, data: encode(launchers.runCmd), mode: 0o644 }, { path: `teams/${team.slug}/run.sh`, data: encode(launchers.runSh), mode: 0o755 });
      return entries;
    } finally {
      await this.fileSystem.remove(scratch);
    }
  }

  /** Every regular file below the team folder, relative, sorted; a symbolic link, and anything below one, is left out. */
  private async regularFiles(folder: string, links: readonly string[]): Promise<string[]> {
    const files: string[] = [];
    const linked = (relative: string): boolean => links.some((link) => link === '.' || isWithin(link, relative));
    const walk = async (relative: string): Promise<void> => {
      for (const name of await this.fileSystem.list(joinPath(folder, relative))) {
        const path = relative === '' ? name : `${relative}/${name}`;
        if (linked(path)) {
          continue;
        }
        if (await this.fileSystem.isDirectory(joinPath(folder, path))) {
          await walk(path);
        } else {
          files.push(path);
        }
      }
    };
    await walk('');
    return files.sort();
  }

  private async settingsEntry(team: TeamRef, path: string, choice: SettingsChoice | null): Promise<{ outcome: SettingsOutcome; bytes: Uint8Array }> {
    const none = new Uint8Array(0);
    if (!(await this.fileSystem.exists(path))) {
      if (choice === 'include') {
        throw new ApplicationError('file-not-found', `${team.slug} has no settings file to include: ${path} does not exist`);
      }
      return { outcome: 'none', bytes: none };
    }
    if (choice === null) {
      throw new ApplicationError('invalid-input', `${team.slug} has a settings file, ${path}: say whether the archive carries it, --with-settings or --without-settings`);
    }
    if (choice === 'leave-out') {
      return { outcome: 'left-out', bytes: none };
    }
    const secrets = secretKeysOf(flattenConfiguration(await readSettingsFile(this.fileSystem, path)));
    if (secrets.length > 0) {
      throw new ApplicationError('invalid-input', `${path} holds a secret (${secrets.join(', ')}): a deployment never carries a key — name the variable that holds it (…EnvVar) and run again`);
    }
    return { outcome: 'included', bytes: await this.fileSystem.readBytes(path) };
  }

  private zipEntry({ path, data, mode }: TarEntry): ZipEntry {
    const deflated = this.compressor.deflateRaw(data);
    const stored = deflated.length >= data.length;
    return { path, method: stored ? 'store' : 'deflate', data: stored ? data : deflated, size: data.length, crc32: crc32(data), mode };
  }
}

/** `dotnet publish` restores and compiles the host and its tools: as long as the build of L0. */
const PUBLISH_TIMEOUT_MS = 600_000;

function settingsWarnings(outcome: SettingsOutcome, plan: DeploymentPlan): string[] {
  if (outcome !== 'left-out') {
    return [];
  }
  const mentions = plan.entries.length > 0 ? 'its launchers will run on the settings of the machine that unzips it' : 'nothing names it';
  return [`the team's settings file is left out: ${mentions}`];
}
