---
paths:
  - ".devcontainer/bench/**"
---

# orkeon-bench, in this repository

- The layer and test rules are `.devcontainer/harness/claude/rules/bench-ts.md`: read it before
  changing `src/`. A dependency rule changes in `.dependency-cruiser.cjs`, in
  `tests/arch/dependency-direction.test.ts` and in that rule together.
- A shape the bench shares with a hook, a template or a skill is a frozen literal
  (`.devcontainer/harness/FROZEN-LITERALS.md`): change all its sides and their evals in one edit.
- Done means `npm run lint && npm test` green, then the harness evals (`/ws-check`, `CLAUDE.md`
  § "Checking a change"). `checks.yml` runs them in a container without `orkeon` or `rtk` whose
  first process reaps nothing: a test that passes here can fail there.
- `REFERENCE_ORKEON_VERSION` (`src/domain/orkeon-version.ts`) moves only with a migration
  (`/ws-migrate`).
