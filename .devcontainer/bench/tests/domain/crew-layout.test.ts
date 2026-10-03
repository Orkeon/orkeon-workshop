import { describe, expect, it } from 'vitest';

import { crewKindOf, type CrewFolderEntries } from '../../src/domain/crew-layout.js';
import { DomainError } from '../../src/domain/errors.js';

const CREW = '/workspace/teams/mail-triage/crew';
const crew = (files: string[], folders: string[] = []): CrewFolderEntries => ({ files, folders });

describe('crewKindOf', () => {
  it.each([
    ['config.yaml beside agents/ and tasks/', crew(['config.yaml'], ['agents', 'tasks'])],
    ['config.yaml beside agents/ alone', crew(['config.yaml', 'README.md'], ['agents'])],
    ['crew.yaml in place of config.yaml', crew(['crew.yaml'], ['tasks'])],
    ['the flat triplet', crew(['crew.yaml', 'agents.yaml', 'tasks.yaml'])],
  ])('reads a YAML crew from %s: the launchers run the folder', (_label, entries) => {
    expect(crewKindOf(CREW, entries)).toBe('yaml');
  });

  it.each([
    ['crew.ork.ts', crew(['crew.ork.ts'])],
    ['crew.ork.ts beside other scripts and a lone config.yaml', crew(['config.yaml', 'crew.ork.ts', 'tools.ork.ts'], ['lib'])],
  ])('reads a TypeScript crew from %s: the launchers run the script', (_label, entries) => {
    expect(crewKindOf(CREW, entries)).toBe('typescript');
  });

  it.each([
    [crew(['config.yaml', 'crew.ork.ts'], ['agents', 'tasks']), 'agents/, tasks/', 'crew.ork.ts'],
    [crew(['config.yaml', 'build.ORK.JS'], ['tasks']), 'tasks/', 'build.ORK.JS'],
    [crew(['crew.yaml', 'agents.yaml', 'tasks.yaml', 'a.ork.ts', 'crew.ork.ts']), 'crew.yaml, agents.yaml, tasks.yaml', 'a.ork.ts, crew.ork.ts'],
  ])('refuses a YAML layout beside a script as ambiguous, as orkeon run does', (entries, markers, scripts) => {
    expect(() => crewKindOf(CREW, entries)).toThrow(
      `${CREW} holds both a YAML crew (${markers}) and ${scripts}: orkeon run refuses such a folder as ambiguous, and Studio finds no crew in it`,
    );
  });

  it('refuses agents/ or tasks/ without the settings of the crew', () => {
    expect(() => crewKindOf(CREW, crew(['agents.yml'], ['agents', 'tasks']))).toThrow(
      `${CREW} holds agents/ and tasks/ but neither config.yaml nor crew.yaml: orkeon run cannot load the crew without its settings`,
    );
  });

  it.each([
    ['an empty folder', crew([])],
    ['a single-file crew, which orkeon run does not take as a crew folder', crew(['config.yaml'])],
    ['an incomplete triplet', crew(['crew.yaml', 'agents.yaml'])],
    ['a script that is not crew.ork.ts', crew(['main.ork.ts'])],
    ['agents and tasks as files, not folders', crew(['config.yaml', 'agents', 'tasks'])],
  ])('finds no crew to launch in %s', (_label, entries) => {
    expect(() => crewKindOf(CREW, entries)).toThrow(DomainError);
    expect(() => crewKindOf(CREW, entries)).toThrow(
      `no crew to launch in ${CREW}: write crew/config.yaml with crew/agents/ and crew/tasks/ (YAML), or crew/crew.ork.ts (TypeScript), first`,
    );
  });
});
