/** The workbook artefacts the checks read, by the file name a finding gives them. */
export const ARTEFACTS = {
  need: 'NEED.md',
  acceptance: 'ACCEPTANCE.md',
  testPlan: 'TEST-PLAN.md',
  design: 'DESIGN.md',
  plan: 'PLAN.md',
  benchConfig: 'bench.config.json',
} as const;

/**
 * The headings of the workbook templates (`.claude/templates/*.md`): the `## ` of each artefact,
 * in order, and under `sheet` the `#### ` of a batch sheet of `PLAN.md`. Frozen literals: the
 * skills copy the templates, the checks compare an artefact with this list, and the eval
 * `bench-contract` compares this list with the templates. Change both in the same edit.
 */
export const WORKBOOK_HEADINGS = Object.freeze({
  'NEED.md': ['Purpose', 'Actors', 'Inputs', 'Outputs', 'Mounts', 'Triggers and scheduling', 'Processing rules', 'Incremental processing and memory', 'Failure and resume', 'Constraints', 'Security', 'Non-goals', 'Open questions'],
  'ACCEPTANCE.md': ['Acceptance criteria', 'Indicators', 'Invariants'],
  'TEST-PLAN.md': ['Levels', 'Datasets', 'LLM targets', 'Judges', 'Repetitions and flakiness', 'Budget', 'Pass criteria'],
  'DESIGN.md': ['Format and rationale', 'Process', 'Agents', 'Tasks and DAG', 'Tools', 'Mounts', 'Deliverables and schemas', 'Resume and incremental strategy', 'LLM profile', 'Risks'],
  'PLAN.md': ['Batches', 'Order and dependencies'],
  sheet: ['Intent', 'Design decisions', 'Steps', 'Anchors', 'Assumptions'],
} as const);

/** An artefact whose `## ` headings are contractual. */
export type HeadedArtefact = Exclude<keyof typeof WORKBOOK_HEADINGS, 'sheet'>;

/** What may follow the five parts of a sheet: `#### Correction C1 — F-1`, a fix appended by `/team-build`. */
export const CORRECTION_HEADING = /^Correction C[1-9][0-9]* — F-[1-9][0-9]*$/;
