/** The artefacts the checks read, by the file name a finding gives them. */
export const ARTEFACTS = {
  team: 'TEAM.md',
  benchConfig: 'bench.config.json',
} as const;

/** The four parts of `TEAM.md`: its `## ` headings, in order (D89). */
export const TEAM_SECTIONS = ['Need', 'Acceptance', 'Design', 'Plan'] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number];

/**
 * The headings of the team template (`.claude/templates/TEAM.md`): the `### ` of each part, in
 * order, and under `sheet` the `#### ` of a batch sheet of the plan. Frozen literals: the skills
 * copy the template, the checks compare a part with this list, and the eval `bench-contract`
 * compares this list with the template. Change both in the same edit.
 */
export const TEAM_HEADINGS = Object.freeze({
  Need: ['Purpose', 'Actors', 'Inputs', 'Outputs', 'Mounts', 'Triggers and scheduling', 'Processing rules', 'Incremental processing and memory', 'Failure and resume', 'Constraints', 'Security', 'Non-goals', 'Open questions'],
  Acceptance: ['Acceptance criteria', 'Indicators', 'Invariants', 'Datasets', 'LLM targets', 'Judges', 'Budget'],
  Design: ['Format and rationale', 'Process', 'Agents', 'Tasks and DAG', 'Tools', 'Mounts', 'Deliverables and schemas', 'Resume and incremental strategy', 'LLM profile', 'Risks'],
  Plan: ['Batches', 'Order and dependencies'],
  sheet: ['Intent', 'Design decisions', 'Steps', 'Anchors', 'Assumptions'],
} as const);

/** What may follow the five parts of a sheet: `#### Correction C1 — F-1`, a fix appended by `/team-build`. */
export const CORRECTION_HEADING = /^Correction C[1-9][0-9]* — F-[1-9][0-9]*$/;
