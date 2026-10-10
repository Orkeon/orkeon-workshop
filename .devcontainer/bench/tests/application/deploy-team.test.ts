import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../src/application/errors.js';
import { DeployTeam } from '../../src/application/use-cases/deploy-team.js';
import { teamPaths } from '../../src/domain/team-ref.js';
import { StoreCompressor } from '../fakes/fake-compressor.js';
import { FakeProcessRunner, succeeded } from '../fakes/fake-process-runner.js';
import { FixedClock } from '../fakes/fixed-clock.js';
import { WORKSHOP, demoTeam } from '../fakes/fixture-team.js';
import type { InMemoryFileSystem } from '../fakes/in-memory-file-system.js';
import { readTar } from '../fakes/tar-reader.js';
import { readZip } from '../fakes/zip-reader.js';

const AT = new Date('2026-10-10T14:07:31Z');
const ORKEON = { 'orkeon --version': succeeded('orkeon 1.0.0-rc.4.src.20261009.gce9ec1f\n') };
const TEAM = `${WORKSHOP}/teams/demo`;
const SETTINGS = `${WORKSHOP}/settings/demo/appsettings.json`;

/** The demo team with a crew, its launchers, its README and some data in its mount point folders. */
function deployableTeam(): { fileSystem: InMemoryFileSystem; team: ReturnType<typeof demoTeam>['team'] } {
  const { team, fileSystem } = demoTeam();
  fileSystem
    .addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n')
    .addFile(`${TEAM}/crew/agents/writer.yaml`, 'role: Writer\n')
    .addFile(`${TEAM}/crew/tasks/digest.yaml`, 'description: digest\n')
    .addFile(`${TEAM}/run.sh`, '#!/usr/bin/env sh\nexec orkeon run crew\n')
    .addFile(`${TEAM}/run.cmd`, '@echo off\r\n')
    .addFile(`${TEAM}/studio-team.json`, '{"name":"demo"}\n')
    .addFile(`${TEAM}/.gitignore`, '/input/*\n')
    .addFile(`${TEAM}/README.md`, '# demo\n')
    .addFile(`${TEAM}/input/.gitkeep`, '')
    .addFile(`${TEAM}/input/mail-1.eml`, 'Subject: hi\n')
    .addFile(`${TEAM}/output/.gitkeep`, '')
    .addFile(`${TEAM}/output/report.md`, 'done\n')
    .addFile(`${TEAM}/state/.gitkeep`, '');
  return { fileSystem, team };
}

function deployer(fileSystem: InMemoryFileSystem, commands: Record<string, ReturnType<typeof succeeded>> = ORKEON): DeployTeam {
  return new DeployTeam(fileSystem, new StoreCompressor(), new FakeProcessRunner(commands), new FixedClock(AT), '0.1.0');
}

describe('DeployTeam', () => {
  it('writes <slug>-<yyyymmdd>.zip under deployments/, the team laid out as in a workshop, the data of the mount points left out', async () => {
    const { fileSystem, team } = deployableTeam();
    const result = await deployer(fileSystem).execute(team, { settings: null });
    expect(result).toMatchObject({
      team: 'demo',
      archive: `${WORKSHOP}/deployments/demo-20261010.zip`,
      name: 'demo-20261010.zip',
      format: 'zip',
      date: '2026-10-10',
      settings: 'none',
      leftOut: { mountData: { input: 1, output: 1, state: 0 }, buildOutput: [], links: [] },
      warnings: [],
      orkeonVersion: '1.0.0-rc.4.src.20261009.gce9ec1f',
      benchVersion: '0.1.0',
    });
    expect(result.files).toEqual([
      'teams/demo/.gitignore',
      'teams/demo/README.md',
      'teams/demo/crew/agents/writer.yaml',
      'teams/demo/crew/config.yaml',
      'teams/demo/crew/tasks/digest.yaml',
      'teams/demo/input/.gitkeep',
      'teams/demo/mounts.json',
      'teams/demo/output/.gitkeep',
      'teams/demo/run.cmd',
      'teams/demo/run.sh',
      'teams/demo/state/.gitkeep',
      'teams/demo/studio-team.json',
    ]);
    const zip = readZip(await fileSystem.readBytes(result.archive));
    expect(zip.entries.map((entry) => entry.path)).toEqual(result.files);
    expect(zip.entries.find((entry) => entry.path === 'teams/demo/run.sh')?.mode).toBe(0o100755);
    expect(zip.entries.find((entry) => entry.path === 'teams/demo/run.cmd')?.mode).toBe(0o100644);
    expect(new TextDecoder().decode(zip.entries.find((entry) => entry.path === 'teams/demo/run.cmd')?.content)).toBe('@echo off\r\n');
    expect(JSON.parse(zip.comment)).toEqual({ team: 'demo', date: '2026-10-10', orkeon_version: '1.0.0-rc.4.src.20261009.gce9ec1f', bench_version: '0.1.0', settings: 'none', files: 12 });
    expect(result.bytes).toBe((await fileSystem.readBytes(result.archive)).length);
  });

  it('writes a gzipped tar on --format tar.gz, the same files with their modes, the comment in a pax global header', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(SETTINGS, '{ "Llm": { "Model": "qwen3:8b" } }');
    const result = await deployer(fileSystem).execute(team, { settings: 'include', format: 'tar.gz' });
    expect(result).toMatchObject({ archive: `${WORKSHOP}/deployments/demo-20261010.tar.gz`, name: 'demo-20261010.tar.gz', format: 'tar.gz', settings: 'included' });
    const tar = readTar(await fileSystem.readBytes(result.archive));
    expect(tar.entries.map((entry) => entry.path)).toEqual(result.files);
    expect(tar.entries.find((entry) => entry.path === 'teams/demo/run.sh')?.mode).toBe(0o755);
    expect(tar.entries.find((entry) => entry.path === 'teams/demo/run.cmd')?.mode).toBe(0o644);
    expect(tar.entries.every((entry) => entry.mtime === Math.floor(AT.getTime() / 1000))).toBe(true);
    expect(JSON.parse(tar.comment ?? '')).toEqual({ team: 'demo', date: '2026-10-10', orkeon_version: '1.0.0-rc.4.src.20261009.gce9ec1f', bench_version: '0.1.0', settings: 'included', files: 13 });
    // The two formats are numbered apart: a zip of the day does not take the tar's name.
    const zip = await deployer(fileSystem).execute(team, { settings: 'include' });
    expect(zip.name).toBe('demo-20261010.zip');
  });

  it('puts the settings file in when asked, beside the team as its launchers look for it', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(SETTINGS, '{ "Llm": { "BaseUrl": "http://localhost:11434", "Model": "qwen3:8b", "ApiKeyEnvVar": "NONE" } }\n');
    const result = await deployer(fileSystem).execute(team, { settings: 'include' });
    expect(result.settings).toBe('included');
    expect(result.files.at(-1)).toBe('settings/demo/appsettings.json');
    expect(JSON.parse(readZip(await fileSystem.readBytes(result.archive)).comment)).toMatchObject({ settings: 'included', files: 13 });
    expect(result.warnings).toEqual([]);
  });

  it('leaves the settings file out when asked, and says what that means', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(SETTINGS, '{ "Llm": { "Model": "qwen3:8b" } }');
    const result = await deployer(fileSystem).execute(team, { settings: 'leave-out' });
    expect(result.settings).toBe('left-out');
    expect(result.files).not.toContain('settings/demo/appsettings.json');
    expect(result.warnings).toEqual(["the team's settings file is left out: its launchers will run on the settings of the machine that unzips it"]);
  });

  it('insists on an answer when the team has a settings file and none was given', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(SETTINGS, '{}');
    await expect(deployer(fileSystem).execute(team, { settings: null })).rejects.toThrow(
      `demo has a settings file, ${SETTINGS}: say whether the archive carries it, --with-settings or --without-settings`,
    );
    expect(await fileSystem.exists(`${WORKSHOP}/deployments`)).toBe(false);
  });

  it('refuses to include a settings file the team does not have', async () => {
    const { fileSystem, team } = deployableTeam();
    await expect(deployer(fileSystem).execute(team, { settings: 'include' })).rejects.toMatchObject({ code: 'file-not-found', message: `demo has no settings file to include: ${SETTINGS} does not exist` });
  });

  it('refuses a settings file that holds a secret, naming the keys, and writes nothing', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(SETTINGS, '{ "Llm": { "ApiKey": "sk-live-1", "Profiles": { "claude": { "ApiKey": "sk-2", "ApiKeyEnvVar": "A" } } } }');
    await expect(deployer(fileSystem).execute(team, { settings: 'include' })).rejects.toThrow(
      `${SETTINGS} holds a secret (Llm:ApiKey, Llm:Profiles:claude:ApiKey): a deployment never carries a key — name the variable that holds it (…EnvVar) and run again`,
    );
    expect(await fileSystem.exists(`${WORKSHOP}/deployments`)).toBe(false);
  });

  it('refuses a team folder holding a settings file or an environment file, and writes nothing', async () => {
    const { fileSystem, team } = deployableTeam();
    fileSystem.addFile(`${TEAM}/crew/appsettings.json`, '{}').addFile(`${TEAM}/.env`, 'KEY=1');
    const error = await deployer(fileSystem).execute(team, { settings: null }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).message).toBe(
      [
        'demo cannot be deployed:',
        '  .env: an environment file never travels with a team (a key lives in the environment of the machine that runs it)',
        "  crew/appsettings.json: a settings file in the team folder is read by Orkeon in place of the machine's (D40); a team's settings live in settings/<slug>/appsettings.json",
      ].join('\n'),
    );
    expect(await fileSystem.exists(`${WORKSHOP}/deployments`)).toBe(false);
  });

  it('numbers a second archive of the day, and writes where --into says', async () => {
    const { fileSystem, team } = deployableTeam();
    const first = await deployer(fileSystem).execute(team, { settings: null });
    const second = await deployer(fileSystem).execute(team, { settings: null });
    const elsewhere = await deployer(fileSystem).execute(team, { settings: null, into: '/tmp/out' });
    expect([first.name, second.name, elsewhere.archive]).toEqual(['demo-20261010.zip', 'demo-20261010-2.zip', '/tmp/out/demo-20261010.zip']);
  });

  it('never follows a symbolic link, leaves build output out, and warns about what scaffold has not written', async () => {
    const { team, fileSystem } = demoTeam();
    fileSystem
      .addFile(`${TEAM}/crew/crew.ork.ts`, 'export default {}\n')
      .addFile(`${TEAM}/tsconfig.json`, '{}')
      .addFile(`${TEAM}/node_modules/x/index.js`, '')
      .addLink(`${TEAM}/shared`, '/elsewhere')
      .addFile('/elsewhere/secret.txt', 'x');
    const result = await deployer(fileSystem).execute(team, { settings: null });
    expect(result.files).toEqual(['teams/demo/crew/crew.ork.ts', 'teams/demo/mounts.json', 'teams/demo/tsconfig.json']);
    expect(result.leftOut).toEqual({ mountData: { input: 0, output: 0, state: 0 }, buildOutput: ['node_modules/x/index.js'], links: ['shared'] });
    expect(result.warnings).toEqual([
      'run.sh is missing: run `orkeon-bench scaffold demo` before deploying',
      'run.cmd is missing: run `orkeon-bench scaffold demo` before deploying',
      'studio-team.json is missing: run `orkeon-bench scaffold demo` before deploying',
      '.gitignore is missing: run `orkeon-bench scaffold demo` before deploying',
      'README.md is missing: the archive says nothing of what the team does',
    ]);
  });

  it('says unknown when orkeon is not on the PATH', async () => {
    const { fileSystem, team } = deployableTeam();
    const result = await deployer(fileSystem, {}).execute(team, { settings: null });
    expect(result.orkeonVersion).toBe('unknown');
  });

  it('exits on a team without its folder, and on a folder without a crew or without mounts.json', async () => {
    const { team, fileSystem } = demoTeam();
    await expect(deployer(fileSystem).execute(team, { settings: null })).rejects.toThrow(/no crew to launch/);
    fileSystem.addFile(`${TEAM}/crew/config.yaml`, 'name: demo\n').addFile(`${TEAM}/crew/agents/a.yaml`, 'role: A\n').addFile(`${TEAM}/crew/tasks/t.yaml`, 'description: t\n');
    await fileSystem.remove(teamPaths(team).mountsFile);
    await expect(deployer(fileSystem).execute(team, { settings: null })).rejects.toThrow(/mounts\.json not found/);
    const bare = demoTeam();
    await bare.fileSystem.remove(TEAM);
    await expect(deployer(bare.fileSystem).execute(bare.team, { settings: null })).rejects.toThrow(`team folder not found: ${TEAM} (nothing to deploy before the first build batch, D35)`);
  });
});
