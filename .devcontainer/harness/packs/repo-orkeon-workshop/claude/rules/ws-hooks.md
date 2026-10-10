---
paths:
  - ".devcontainer/harness/claude/hooks/**"
---

# Harness hooks, in this repository

- Every hook script belongs to the pack `core` and is wired once in the static `hooks` section of
  `claude/settings.json`; a new hook has one switch `HARNESS_<NAME>` with its default in that file's
  `env` (`docs/profiles-design.md` § 3, rules for packs).
- Inert means exit 0 and no output. A hook is silent on an empty, `{}` or non-JSON payload, and
  without `jq` when it needs it.
- A hook change without an eval case in `evals/cases/` is not finished (`evals/run.sh`, header). A
  state file under `/tmp/claude-<family>-` has its family in `PREFIXES` of `session-cleanup.sh`.
- A literal another file reads is listed in `FROZEN-LITERALS.md`, with a case on each side. A hook
  adapted from claude-code-toolkit has its row in `THIRD-PARTY.md`.
- LF line endings and the executable bit (`git add --chmod=+x`); messages in English, no accented
  letter. Run `/ws-check evals`.
