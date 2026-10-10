import { describe, expect, it } from 'vitest';

import { deploymentArchiveName, deploymentDate, planDeployment, secretKeysOf } from '../../../src/domain/deployment/deployment-plan.js';

const TEAM_FILES = [
  '.gitignore',
  'README.md',
  'crew/agents/writer.yaml',
  'crew/config.yaml',
  'crew/tasks/digest.yaml',
  'input/.gitkeep',
  'input/mail-1.eml',
  'input/nested/mail-2.eml',
  'mounts.json',
  'output/.gitkeep',
  'output/report.md',
  'run.cmd',
  'run.sh',
  'state/.gitkeep',
  'studio-team.json',
];

describe('planDeployment', () => {
  it('ships the team as Studio runs it under teams/<slug>/, the folders of the mount points reduced to their .gitkeep', () => {
    const plan = planDeployment({ slug: 'demo', files: TEAM_FILES, mountFolders: ['input', 'output', 'state'] });
    expect(plan.entries.map((entry) => entry.archivePath)).toEqual([
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
    expect(plan.mountData).toEqual({ input: 2, output: 1, state: 0 });
    expect(plan.refusals).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.buildOutput).toEqual([]);
  });

  it('stores a launcher executable and everything else plain', () => {
    const plan = planDeployment({ slug: 'demo', files: ['run.sh', 'run.cmd', 'crew/config.yaml', 'tools/build.sh'], mountFolders: [] });
    expect(plan.entries.map((entry) => [entry.source, entry.mode.toString(8)])).toEqual([
      ['crew/config.yaml', '644'],
      ['run.cmd', '644'],
      ['run.sh', '755'],
      ['tools/build.sh', '755'],
    ]);
  });

  it('counts the data of a mount point folder inside another for the innermost folder, and ships both .gitkeep', () => {
    const plan = planDeployment({ slug: 'demo', files: ['data/.gitkeep', 'data/in.csv', 'data/state/.gitkeep', 'data/state/register.json', 'data/other/x.txt'], mountFolders: ['data', 'data/state'] });
    expect(plan.entries.map((entry) => entry.source)).toEqual(['data/.gitkeep', 'data/state/.gitkeep']);
    expect(plan.mountData).toEqual({ data: 2, 'data/state': 1 });
  });

  it('leaves dependencies and build output out, at any depth', () => {
    const plan = planDeployment({ slug: 'demo', files: ['crew/crew.ork.ts', 'node_modules/a/index.js', 'crew/tools/x/bin/Debug/x.dll', 'obj/project.assets.json', 'obj-linux/a', 'notes.tmp', 'tsconfig.json', 'typings/orkeon.d.ts'], mountFolders: [] });
    expect(plan.entries.map((entry) => entry.source)).toEqual(['crew/crew.ork.ts', 'tsconfig.json', 'typings/orkeon.d.ts']);
    expect(plan.buildOutput).toEqual(['crew/tools/x/bin/Debug/x.dll', 'node_modules/a/index.js', 'notes.tmp', 'obj-linux/a', 'obj/project.assets.json']);
  });

  it('refuses a settings file Orkeon would read from the team folder, and an environment file', () => {
    const plan = planDeployment({
      slug: 'demo',
      files: ['appsettings.json', 'appsettings.Development.json', 'crew/appsettings.json', 'appsettings/appsettings.json', '_shared/appsettings.json', '.env', 'crew/.env.local', 'input/appsettings.json', 'crew/config.yaml'],
      mountFolders: ['input'],
    });
    expect(plan.refusals).toEqual([
      '.env: an environment file never travels with a team (a key lives in the environment of the machine that runs it)',
      "_shared/appsettings.json: an _shared/ folder in the team folder holds a settings file Orkeon reads for every run that names none (D40)",
      "appsettings.Development.json: a settings file in the team folder is read by Orkeon in place of the machine's (D40); a team's settings live in settings/<slug>/appsettings.json",
      "appsettings.json: a settings file in the team folder is read by Orkeon in place of the machine's (D40); a team's settings live in settings/<slug>/appsettings.json",
      "appsettings/appsettings.json: an appsettings/ folder in the team folder holds a settings file Orkeon reads for every run that names none (D40)",
      'crew/.env.local: an environment file never travels with a team (a key lives in the environment of the machine that runs it)',
      "crew/appsettings.json: a settings file in the team folder is read by Orkeon in place of the machine's (D40); a team's settings live in settings/<slug>/appsettings.json",
    ]);
    // A file in the data of a mount point is the team's data, counted, not refused.
    expect(plan.mountData).toEqual({ input: 1 });
    expect(plan.entries.map((entry) => entry.source)).toEqual(['crew/config.yaml']);
  });

  it('warns about what the launchers and Studio expect and the folder lacks', () => {
    const plan = planDeployment({ slug: 'demo', files: ['crew/config.yaml', 'mounts.json'], mountFolders: [] });
    expect(plan.warnings).toEqual([
      'run.sh is missing: run `orkeon-bench scaffold demo` before deploying',
      'run.cmd is missing: run `orkeon-bench scaffold demo` before deploying',
      'studio-team.json is missing: run `orkeon-bench scaffold demo` before deploying',
      '.gitignore is missing: run `orkeon-bench scaffold demo` before deploying',
      'README.md is missing: the archive says nothing of what the team does',
    ]);
  });
});

describe('deploymentArchiveName', () => {
  const AT = new Date('2026-10-10T23:59:00Z');

  it('is <slug>-<yyyymmdd>.zip, in UTC', () => {
    expect(deploymentArchiveName('mail-triage', AT, [])).toBe('mail-triage-20261010.zip');
    expect(deploymentDate(AT)).toBe('2026-10-10');
  });

  it('numbers a second archive of the same day', () => {
    expect(deploymentArchiveName('demo', AT, ['demo-20261010.zip'])).toBe('demo-20261010-2.zip');
    expect(deploymentArchiveName('demo', AT, ['demo-20261010.zip', 'demo-20261010-2.zip', 'other-20261010.zip'])).toBe('demo-20261010-3.zip');
  });
});

describe('secretKeysOf', () => {
  it('names a key, a password, a secret or a token that holds a value, and anything under Secrets', () => {
    const keys = secretKeysOf([
      { key: 'Llm:ApiKey', value: 'sk-live' },
      { key: 'Llm:Profiles:claude:ApiKey', value: ' x ' },
      { key: 'Llm:ApiKeyEnvVar', value: 'ANTHROPIC_API_KEY' },
      { key: 'Orkeon:Tools:Email:Accounts:triage:Password', value: 'hunter2' },
      { key: 'Orkeon:Tools:Email:Accounts:triage:PasswordEnvVar', value: 'MAIL_PASSWORD' },
      { key: 'Orkeon:Host:Discord:Token', value: 't' },
      { key: 'Orkeon:Host:Discord:TokenEnvironmentVariable', value: 'DISCORD' },
      { key: 'Secrets:Anything', value: '1' },
      { key: 'Llm:ApiKey', value: '' },
      { key: 'Llm:Model', value: 'qwen3:8b' },
    ]);
    expect(keys).toEqual(['Llm:ApiKey', 'Llm:Profiles:claude:ApiKey', 'Orkeon:Tools:Email:Accounts:triage:Password', 'Orkeon:Host:Discord:Token', 'Secrets:Anything']);
  });
});
