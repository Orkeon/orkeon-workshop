import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { createTeamRef, teamPaths, teamRefInWorkshop, workshopOfTeam } from '../../src/domain/team-ref.js';

describe('TeamRef', () => {
  it('lives under <workshop>/teams/<slug>', () => {
    const team = teamRefInWorkshop('/workspace', 'mail-triage');
    expect(team).toEqual({ slug: 'mail-triage', folder: '/workspace/teams/mail-triage' });
  });

  it('normalizes the folder it is given', () => {
    expect(createTeamRef('demo', '/tmp//work/../teams/demo/').folder).toBe('/tmp/teams/demo');
  });

  it.each(['Mail', 'mail triage', '-lead', 'a_b', ''])('rejects slug "%s"', (slug) => {
    expect(() => createTeamRef(slug, '/teams/x')).toThrow(DomainError);
  });

  it('rejects a relative folder', () => {
    expect(() => createTeamRef('demo', 'teams/demo')).toThrow(DomainError);
  });

  it('finds the workshop two levels above the team folder', () => {
    expect(workshopOfTeam('/workspace/teams/demo')).toBe('/workspace');
    expect(workshopOfTeam('/workspace/library/examples/teams/mail-triage')).toBe('/workspace/library/examples');
  });

  it('keeps the team folder for what Studio runs, and puts the workbook, the tests and the settings next to teams/', () => {
    const paths = teamPaths(teamRefInWorkshop('/w', 'demo'));
    expect(paths).toEqual({
      crew: '/w/teams/demo/crew',
      mountsFile: '/w/teams/demo/mounts.json',
      studioCard: '/w/teams/demo/studio-team.json',
      runSh: '/w/teams/demo/run.sh',
      runCmd: '/w/teams/demo/run.cmd',
      gitignore: '/w/teams/demo/.gitignore',
      workbook: '/w/workbooks/demo',
      statusFile: '/w/workbooks/demo/STATUS.md',
      needFile: '/w/workbooks/demo/NEED.md',
      acceptanceFile: '/w/workbooks/demo/ACCEPTANCE.md',
      testPlanFile: '/w/workbooks/demo/TEST-PLAN.md',
      designFile: '/w/workbooks/demo/DESIGN.md',
      planFile: '/w/workbooks/demo/PLAN.md',
      decisions: '/w/workbooks/demo/decisions',
      attempts: '/w/workbooks/demo/attempts',
      runs: '/w/workbooks/demo/runs',
      tests: '/w/tests/demo',
      benchConfigFile: '/w/tests/demo/bench.config.json',
      settingsFile: '/w/settings/demo/appsettings.json',
    });
  });
});
