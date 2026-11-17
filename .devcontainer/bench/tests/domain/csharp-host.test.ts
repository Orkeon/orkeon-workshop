import { describe, expect, it } from 'vitest';

import { dotnetTestSummary, hostLauncherProblems, hostProjectOf, hostRunArguments, isHostFolder, mergeHostSettings } from '../../src/domain/csharp-host.js';

describe('csharp-host', () => {
  it('knows a host folder by its solution or project', () => {
    expect(isHostFolder(['Pilot.sln', 'src'])).toBe(true);
    expect(isHostFolder(['Pilot.slnx'])).toBe(true);
    expect(isHostFolder(['Pilot.Host.csproj'])).toBe(false);
    expect(isHostFolder(['src'], ['Pilot.Host'])).toBe(true);
    expect(isHostFolder(['README.md', 'src'])).toBe(false);
    expect(isHostFolder([])).toBe(false);
  });

  it('finds the one host project, and refuses none or several', () => {
    expect(hostProjectOf('/t/host', ['Pilot.Host'])).toBe('src/Pilot.Host');
    expect(() => hostProjectOf('/t/host', [])).toThrow(/holds no src\/<Name>\.Host/);
    expect(() => hostProjectOf('/t/host', ['A.Host', 'B.Host'])).toThrow(/several host projects \(src\/A\.Host, src\/B\.Host\)/);
  });

  it('runs the host on the team folder without building it', () => {
    expect(hostRunArguments('src/Pilot.Host', '/w/teams/pilot', ['--validate'])).toEqual(['run', '--project', 'src/Pilot.Host', '-c', 'Release', '--no-build', '--', '--team-dir', '/w/teams/pilot', '--validate']);
  });

  it('checks the launchers new-team.sh writes', () => {
    const sh = 'exec dotnet run --project src/Pilot.Host -c Release -- --team-dir "$DIR" "$@"';
    const cmd = 'dotnet run --project src\\Pilot.Host -c Release -- --team-dir "%DIR%" %*';
    expect(hostLauncherProblems('src/Pilot.Host', sh, cmd, false)).toEqual([]);
    expect(hostLauncherProblems('src/Pilot.Host', null, 'orkeon run crew', true)).toEqual([
      'run.sh is missing',
      'run.cmd does not run dotnet run --project src\\Pilot.Host … --team-dir <the team folder>',
      expect.stringContaining('a Studio card (team.json) exists'),
    ]);
  });

  it('reads the summary of dotnet test, summed over its test runs', () => {
    expect(dotnetTestSummary('Test run summary: Passed!\n  total: 3\n  failed: 0\n  succeeded: 3\n  skipped: 0\n\n  total: 2\n  failed: 1\n  succeeded: 1\n')).toEqual({ total: 5, failed: 1, passed: 4 });
    expect(dotnetTestSummary('Build FAILED.\n')).toBeNull();
  });
});

describe('mergeHostSettings', () => {
  it('merges the host files lowest first, as .NET configuration does: keys whatever their case, arrays by index', () => {
    expect(mergeHostSettings([{ Llm: { BaseUrl: 'a', Model: 'm', List: [1, 2] } }, { llm: { baseurl: 'b', List: [3] } }, 'not an object'])).toEqual({ Llm: { BaseUrl: 'b', Model: 'm', List: [3, 2] } });
    expect(mergeHostSettings([])).toBeNull();
  });
});
