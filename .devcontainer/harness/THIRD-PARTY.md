# Third-party material

## claude-code-toolkit

Part of this harness is adapted from **claude-code-toolkit** by Pierre Belin, a `.claude` starter kit
for .NET / DDD repositories. The harness reuses its mechanics — the Bash dispatcher and its modules,
the read bounds, the delegation guard, the report-shape check, the session cleanup, the eval runner —
and, in the packs of lot 11 (`packs/`, `docs/profiles-design.md`), its .NET / DDD chain rewritten for any
repository and for Orkeon. It is distributed under the MIT licence:

```
MIT License

Copyright (c) 2026 Pierre Belin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### What was adapted

Paths on the left are relative to this folder, paths on the right to the toolkit.

| Harness file | Toolkit file | What changed |
|---|---|---|
| `claude/hooks/bash-dispatch.sh` | `hooks/bash-dispatch.sh` | module list reduced to `guard-git`, `guard-cat-bounds`, `guard-diff-bounds`, `rewrite-rtk`; exits 0 on empty input or without `jq` |
| `claude/lib/guard-git.sh` | `lib/guard-git.sh` | off unless `HARNESS_GUARD_GIT=1` (the harness proposes commits, it does not forbid them by default); refusal reworded |
| `claude/lib/guard-cat-bounds.sh` | `lib/guard-cat-bounds.sh` | `HARNESS_*` thresholds; no reference to the toolkit's graph tool |
| `claude/lib/guard-diff-bounds.sh` | `lib/guard-diff-bounds.sh` | `HARNESS_DIFF_BOUNDS_LINES`; tolerates an empty command |
| `claude/lib/bounds-common.sh` | `lib/bounds-common.sh` | `HARNESS_*` thresholds; references and templates added to the files read whole; outlines for YAML, Python and JSONL; the third way out is a delegation instead of the `bulk-read` tool |
| `claude/lib/rewrite-rtk.sh` | `lib/rewrite-rtk.sh` | the `dotnet test\|restore\|format` prefixing removed; passes silently when `rtk` is absent; the fallback that emitted the normalised command with an `allow` when rtk answered nothing is gone — the answer of rtk is passed through untouched and nothing else is emitted; the path normalisation applies in command position only (the original also stripped a path used as an argument) and skips a command carrying a heredoc |
| `claude/lib/batching-nudge.sh` | `lib/batching-nudge.sh` | `HARNESS_*` variables; passes when `python3` is absent |
| `claude/lib/delegation-nudge.sh` | `lib/delegation-nudge.sh` | counts the source and definition files of a workshop instead of `.cs` only; message reworded |
| `claude/hooks/read-bounds.sh` | `hooks/read-bounds.sh` | exits 0 on empty input; refusal reworded |
| `claude/hooks/delegation-guard.sh` | `hooks/explore-guard.sh` | renamed; the appended contract is the `DONE` / `BLOCKED` report of the harness, in English; any explicit model passes (`HARNESS_EXPLORE_MODEL` pins one for `Explore`); looks for the agent charter in the workshop then beside the hooks; the line cap depends on the agent (a review is longer); the original prompt and the other fields of the call are kept |
| `claude/hooks/subagent-report-shape.sh` | `hooks/subagent-report-shape.sh` | labels `DONE` / `BLOCKED` and their fields instead of `RED` / `GREEN`; `BLOCKED` is checked too; `none` accepted on the `Command` line; also checks the review `team-reviewer` returns (verdict, gap table, fix table); reads the agent transcript when the payload carries no message; ASCII-escaped output |
| `claude/hooks/session-cleanup.sh` | `hooks/session-cleanup.sh` | the prefix list is the harness's own; the part restoring a third-party plugin flag removed |
| `claude/rules/markdown-output.md` | `rules/markdown-output.md` | families and language restated for a workshop; the frozen-literal table moved to `FROZEN-LITERALS.md` |
| `evals/run.sh` | `evals/run.sh` | resolves the repository, image and workshop layouts from its own location; hermetic environment; one fixtures folder per run and per case file; placeholders expanded in expectations; reads Stop-style `decision` / `reason`; fixture kinds reduced to `sparse`, `flat`, `md`, `text`, plus `exec` (an executable stub standing for a binary a hook calls); skipped cases counted apart, and failed under `HARNESS_EVALS_STRICT=1` |
| `evals/cases/guard-git.json`, `read-bounds.json`, `cat-bounds.json`, `diff-bounds.json`, `session-cleanup.json`, `subagent-report-shape.json` | the cases of the same names | payloads and expectations rewritten for the adapted hooks; the diff cases build their own repository |

Ideas taken without code: the chain of artefacts between skills, the orchestrator that delegates and
judges, the separation between test author and implementer, the read-only reviewer in a forked
context, the batch sheet with its anchors, assumptions and proof ticks, the frozen-literal table.

### What the packs adapted (lot 11)

Read against the toolkit at commit `934b277` (2026-10-08).

| Harness file | Toolkit file | What changed |
|---|---|---|
| `packs/dev/claude/skills/dev-spec/` | `skills/business-spec` | `UC-nn` / `BR-nn` ids instead of CU / RM; the template moved to `references/`; kit anchors and the graph tool dropped; the inventory goes to an `Explore` subagent |
| `packs/dev/claude/skills/dev-plan/` | `skills/plan-implementation` (+ references) | any repository: layout and commands come from the repository pack's `repo.yaml` or are asked once and written into the plan; the DDD / APP / PERF ids no longer tied to CQRS, EF or Web API; the handler `CLAUDE.md` duty and `{{PRODUCT}}` dropped; tick lines are `[ ]` / `[x]` |
| `packs/dev/claude/skills/dev-implement/` | `skills/implement-tdd` (+ references) | contracts and closing split into `references/`; no `RM` traits or handler documents; the commit command handed to the user (D47); one fixed English closing line; `access-cost.py` and the Web API / EF examples dropped |
| `packs/dev/claude/skills/dev-verify/` | `skills/verify-ddd-tdd` | delegates to `dev-auditor` instead of a forked context and writes `<CODE>-VERIFY-F<n>.md` itself; a `Conventions` axis added |
| `packs/dev/claude/skills/dev-verify/scripts/audit-capture.sh` | `scripts/pre-audit.sh`, `scripts/audit-capture.sh` | merged into one script; build command and source / test roots are arguments instead of `kit.config.json`; the checks that parse C# (comments, cost, test traits) dropped |
| `packs/dev/claude/skills/dev-unit-tests/`, `dev-integration-tests/` | `skills/tests-unit-tests`, `skills/tests-integration-tests` | conventions come from the repository's rules; no handler, saved-events or SQL Server specifics; integration tests carry the repository's category and are skipped when Docker is absent |
| `packs/dev/claude/skills/dev-learn/` (+ `scripts/learn-candidates.py`) | `skills/learn`, `scripts/learn-candidates.py` | reads the verdict files `todo/*/*-VERIFY-F*.md`, not transcripts; state in `.claude/local/dev-learn-state.json`; a harness change is handed over as a patch, never edited in `.claude/`; the memory mode dropped |
| `packs/dev/claude/agents/dev-test-author.md`, `dev-implementer.md` | `agents/tdd-test-author.md`, `agents/tdd-implementer.md` | report in the harness shape (a table, then `## DONE` / `## BLOCKED`) instead of `## RED` / `## GREEN`; terse style, `access-cost.py` and `{{PRODUCT}}` paths dropped |
| `packs/dev/claude/agents/dev-auditor.md`, `adversarial-reviewer.md` | `agents/ddd-tdd-auditor.md`, `agents/adversarial-reviewer.md` | report headings `## Audit — VALID\|GAPS` and `## Review — CLEAR\|GAPS`, then `## DONE`; no Write or Edit; the graph tool dropped |
| `packs/repo-orkeon/claude/rules/orkeon-domain.md`, `orkeon-application.md`, `orkeon-tests.md` | `presets/clean-architecture/rules/domain.md`, `application-cqrs.md`, `tests.md` | rewritten for Orkeon, `paths:` on `src/core/` and `tests/`: the virtual file system, `Orkeon.Domain.Task`, PublicAPI, hand-written doubles, test categories, Microsoft.Testing.Platform; the EF and Web API rules left out |
| `claude/hooks/dev-batch-guard.sh` | `hooks/implement-tdd-guard.sh` | switch `HARNESS_DEV_BATCH_GUARD`, off by default; reads the English closing line only; the effort check and the French wording dropped; silent on empty or non-JSON input |
| `claude/hooks/context-log.sh` | `hooks/context-log.sh` | switch `HARNESS_CONTEXT_LOG`, off by default; bash and `jq`; fields from the documented payload; `.claude/local/context.log` capped at 256 KiB; no raw dump; a symbolic link refused |
| `claude/hooks/clear-nudge.sh` | `hooks/clear-nudge.sh` | switch `HARNESS_CLEAR_NUDGE`, off by default; a fixed step of 150k tokens; main chain only; state in `.claude/local/clear-nudge.tsv`, re-armed when the context drops below a step; the unverified claim about `/compact` removed |
| `packs/quality/claude/skills/quality-report/scripts/quality-report-check.py` | `scripts/quality-report-check.py` | JS, Stryker, pages, endpoints and code size removed; each step's status checked against its exit code; thresholds read from the report; the `SONAR_TOKEN` value checked to be in neither the JSON nor the Markdown; ASCII output; exit 2 on an unreadable file |
| `packs/quality/claude/skills/quality-report/references/report.md` | `skills/quality-report/` (`SKILL.md`, `references/json-schema.md`, `report-template.md`, `commands-dotnet.md`) | a smaller schema; only the Sonar issue count (`resolved=false`) and the tone rules kept; no git activity figures, no Stryker |
| `packs/quality/references/rtk-filters.toml` | `.rtk/filters.toml` | 6 of the 10 filters kept; Stryker, EF, clean-restore and coverlet dropped; not wired |
| `packs/docs-audit/claude/skills/docs-audit/references/audit.md` | `agents/adversarial-reviewer.md` | the stance only: look for what is wrong, cite `path:line` for every finding |

### What was not taken

The `hexagonal` and `vertical-slices` presets and the clean-architecture rules for EF and Web API; the
hooks and modules tied to tools the image does not rely on (`graphify-*`, `affected-blast-radius`,
`caveman-skill-ultra`, `rewrite-piped-filter`, `guard-integration-filter`);
`handler-claude-md-check`; the statusline; `tools/doctor` and `tools/bulk-read`; `kit-init`,
`kit_config.py`, `kit_testtag.py` and the migration scripts; `rules-coverage.py`,
`untagged-tests.py`, `access-cost.py`; the mods.

Known defects of the toolkit that were not carried over: a report contract and a worker prompt
asking for French while the kit is otherwise English; a PostToolUse hook printing to stdout, a
channel that never reaches the model; emitter/parser pairs left out of step by a partial
translation — which is why every frozen literal here has an eval on both sides.

## The skills

`claude/skills/orkeon-tour`, `orkeon-crew-yaml`, `orkeon-crew-typescript`, `orkeon-update` and
`clean-restore` were written for this image; they are not third-party material. So was the workshop's
VS Code configuration, `claude/devcontainer.workshop.json`: it does not derive from Anthropic's
reference devcontainer.

## claude-code-token-usage

`.devcontainer/cc-usage/` (installed in the image as the `cc-usage` command) and the skill
`packs/usage/claude/skills/token-usage/` are adapted from **claude-code-token-usage** by Pierre Belin
(<https://github.com/pierrebelin/claude-code-token-usage>, commit `79e1a25`, 2026-09-04), MIT licence,
Copyright (c) 2026 Pierre Belin — the same text as above, kept verbatim in
`.devcontainer/cc-usage/LICENSE`.

| File | Upstream file | What changed |
|---|---|---|
| `.devcontainer/cc-usage/cc-usage.py` | `src/cc-usage.py` | transcripts and the user's `CLAUDE.md` read under `CLAUDE_CONFIG_DIR` when it is set; `--session … --json` prints the session as JSON, `(startup)` included; each change marked `orkeon-workshop:` |
| `.devcontainer/cc-usage/dashboard_model.py` | `src/dashboard_model.py` | one f-string in Python 3.12 syntax rewritten for the image's Python 3.11; output unchanged |
| `.devcontainer/cc-usage/session_grade.py`, `dashboard_template.py`, `tests/` | `src/`, `tests/` | unchanged, but for the test loader (the modules sit one level up) and new tests of the changes |
| `packs/usage/claude/skills/token-usage/` | `SKILL.md` | the Codex half and the hard-coded paths dropped; calls `cc-usage`; the reading guide moved to `references/` |

Not taken: the Codex scripts, the dashboard page and its gateway, the statusline.
